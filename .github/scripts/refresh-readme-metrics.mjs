// Public metrics only. A failed request leaves the last successful snapshot intact.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PACKAGE = '@theihtisham/agent-shadow-brain';
const REPOSITORY = 'theihtishaam/agents-brain';
const DAY = 86_400_000;
const date = value => new Date(value).toISOString().slice(0, 10);

export function periods(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error('Invalid metrics date.');
  let cursor = Date.parse(start + 'T00:00:00Z');
  const finish = Date.parse(end + 'T00:00:00Z');
  if (!Number.isFinite(cursor) || !Number.isFinite(finish) || date(cursor) !== start || date(finish) !== end || cursor > finish) throw new Error('Invalid metrics interval.');
  const result = [];
  while (cursor <= finish) {
    const last = Math.min(finish, cursor + 364 * DAY);
    result.push({ start: date(cursor), end: date(last) });
    cursor = last + DAY;
  }
  return result;
}

export function sumDownloads(rows, requested) {
  if (rows.length !== requested.length) throw new Error('Incomplete download history.');
  let total = 0;
  rows.forEach((row, index) => {
    if (row.package !== PACKAGE || row.start !== requested[index].start || row.end !== requested[index].end ||
      !Number.isSafeInteger(row.downloads) || row.downloads < 0) throw new Error('Invalid download count or coverage.');
    total += row.downloads;
    if (!Number.isSafeInteger(total)) throw new Error('Download total exceeds the supported range.');
  });
  return total;
}

export function validateRecent(row, days) {
  periods(row.start, row.end);
  if (row.package !== PACKAGE || !Number.isSafeInteger(row.downloads) || row.downloads < 0 ||
    (Date.parse(row.end) - Date.parse(row.start)) / DAY + 1 !== days) throw new Error('Invalid recent download count or coverage.');
}

async function get(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'agent-shadow-brain-public-metrics' }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Public metrics request failed (${response.status}) at ${new URL(url).hostname}.`);
  return response.json();
}

export async function refreshMetrics() {
  const endpoint = 'https://api.npmjs.org/downloads/point/';
  const [metadata, github, day, week, month] = await Promise.all([
    get('https://registry.npmjs.org/' + encodeURIComponent(PACKAGE)),
    get('https://api.github.com/repos/' + REPOSITORY),
    ...['last-day', 'last-week', 'last-month'].map(interval => get(endpoint + interval + '/' + PACKAGE)),
  ]);
  if (metadata.name !== PACKAGE || github.full_name?.toLowerCase() !== REPOSITORY.toLowerCase()) throw new Error('Public metrics identity does not match.');
  [day, week, month].forEach((row, index) => validateRecent(row, [1, 7, 30][index]));
  const created = date(metadata.time.created);
  const start = created < '2015-01-10' ? '2015-01-10' : created;
  const end = day.end;
  const requested = periods(start, end);
  const rows = [];
  for (const range of requested) rows.push(await get(endpoint + range.start + ':' + range.end + '/' + PACKAGE));
  const total = sumDownloads(rows, requested);
  for (const key of ['stargazers_count', 'forks_count', 'subscribers_count', 'open_issues_count']) {
    if (!Number.isSafeInteger(github[key]) || github[key] < 0) throw new Error('Invalid GitHub count.');
  }
  const snapshot = { schemaVersion: 1, refreshedAt: new Date().toISOString(), package: PACKAGE, repository: REPOSITORY,
    latest: metadata['dist-tags'].latest, created, coverage: { start, end, completeSinceCreation: start === created },
    npm: { total, lastDay: day, lastWeek: week, lastMonth: month, periods: rows },
    github: { stars: github.stargazers_count, forks: github.forks_count, watchers: github.subscribers_count, openIssues: github.open_issues_count },
    sources: { downloads: 'https://github.com/npm/registry/blob/main/docs/download-counts.md', registry: 'https://registry.npmjs.org/' + encodeURIComponent(PACKAGE), repository: github.html_url } };
  const count = total.toLocaleString('en-US');
  const source = 'https://github.com/' + REPOSITORY + '/blob/main/docs/npm-metrics.json';
  const plain = `**Total npm downloads: ${count}** · Through **${end}**. [npm data](${source}).\n\nGitHub refreshes this number every two days. The npm README records the total when this version was published. Downloads include automated installs; they are not unique users.`;
  const readme = readFileSync('README.md', 'utf8');
  if (!readme.includes('<!-- NPM_TOTAL_START -->') || !readme.includes('<!-- NPM_TOTAL_END -->')) throw Error('Missing README download markers.');
  const updatedReadme = readme.replace(/<!-- NPM_TOTAL_START -->[\s\S]*?<!-- NPM_TOTAL_END -->/, '<!-- NPM_TOTAL_START -->\n'+plain+'\n<!-- NPM_TOTAL_END -->');
  const markdown = `# Package and repository statistics\n\nLast successful refresh: **${snapshot.refreshedAt}**. Counts are snapshots from public npm and GitHub APIs.\n\n| Metric | Count | Coverage |\n| --- | ---: | --- |\n| npm ${start === created ? 'total downloads' : 'available downloads'} | **${count}** | ${start} through ${end}, inclusive |\n| npm latest day | ${day.downloads.toLocaleString('en-US')} | ${day.start} through ${day.end} |\n| npm last 7 days | ${week.downloads.toLocaleString('en-US')} | ${week.start} through ${week.end} |\n| npm last 30 days | ${month.downloads.toLocaleString('en-US')} | ${month.start} through ${month.end} |\n| GitHub stars | ${github.stargazers_count} | At refresh |\n| GitHub forks | ${github.forks_count} | At refresh |\n| GitHub watchers | ${github.subscribers_count} | At refresh |\n\nThe package was created on ${created}. The total sums non-overlapping ranges of at most 365 days from creation through the latest complete day returned by npm. This handles the API's 18-month request limit without silently truncating lifetime counts. npm counts downloads, including automated installs; these are not unique people or active users.\n\nThe dedicated **README metrics** workflow refreshes this page and the plain-text README total every two days. The npm README is a snapshot from the published release. A failed request preserves the last successful snapshot.\n\n[Raw snapshot and coverage](npm-metrics.json) · [npm download API documentation](https://github.com/npm/registry/blob/main/docs/download-counts.md) · [Package](https://www.npmjs.com/package/${PACKAGE}) · [Repository](https://github.com/${REPOSITORY})\n\nHistorical snapshots in [stats-history.json](stats-history.json) come from the previous monitoring implementation and are not used to calculate this total.\n`;
  mkdirSync('docs/assets', { recursive: true });
  writeFileSync('docs/npm-metrics.json', JSON.stringify(snapshot, null, 2) + '\n');
  writeFileSync('README.md', updatedReadme);
  writeFileSync('docs/STATS.md', markdown);
  return { total, start, end, latest: snapshot.latest, stars: github.stargazers_count };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await refreshMetrics(), null, 2));
}
