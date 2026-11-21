import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { BRAIN_HUB_DIRECTORY } from '../../src/dashboard/brain-hub-directory.js';
import { BRAIN_HUB_CLIENT } from '../../src/dashboard/brain-hub-client.js';

const helpers = {
  arr: (value: unknown) => Array.isArray(value) ? value : [],
  esc: String, fmt: String, hostName: String, isoTime: String,
  chip: String, heading: String, action: String, btn: String, view: String, empty: String,
  list: (content: string) => '<ul>' + content + '</ul>',
};
const base = { status: 'available', policyRevision: 2, codexIndexAllowed: true };

it('shows three workspace summaries concurrently and puts the selected folder in a disclosure', () => {
  const rows = ['One', 'Two', 'Three'].map((name, index) => ({
    ...base, projectId: 'project-' + index, projectName: name, root: '/synthetic/' + name,
    hosts: [{ id: 'codex', label: 'Codex', connections: 1 }],
    sessions: [{ title: 'Chat ' + name, host: 'codex', reportedStatus: 'working' }],
    latestOutcome: { result: 'pass', recordedAt: '2026-11-18', provenance: 'user-report' },
    progress: { total: 10, completed: index + 1 },
  }));
  const state = { view: 'workspaces', project: rows[0].projectId, directory: { revision: 1, total: 3, workspaces: rows },
    errors: {}, connection: 'reachable' };
  const output = runInNewContext(BRAIN_HUB_DIRECTORY + ';workspacesPage();', { state, ...helpers });
  const cards = output.match(/<ul class="portfolio-list">([\s\S]*?)<\/ul>/u)?.[1] ?? '';
  for (const [index, row] of rows.entries()) {
    expect(cards).toContain('<strong>' + row.projectName + '</strong>');
    expect(cards).toContain(row.sessions[0].title);
    expect(cards).toContain('<b>' + (index + 1) * 10 + '%</b>');
  }
  expect(cards).not.toContain('/synthetic/');
  expect(output).toContain('<details id="workspace-folder-project-0" data-keep-open>');
  expect(output).toContain('aria-pressed="true"');
  expect(runInNewContext(BRAIN_HUB_DIRECTORY + ';projectProgress({completed:999,total:1000});', helpers)).toContain('99.9%');
});

it('leaves stale directory and native observations out of the current workspace', () => {
  const row = { ...base, projectId: 'project-1' };
  const state = { view: 'workspaces', project: 'project-1', directory: { revision: 4, workspaces: [row] },
    errors: {}, connection: 'reachable' };
  const actual = runInNewContext(BRAIN_HUB_DIRECTORY + String.raw`;
    const fresh={projectId:'project-1',policyRevision:2,expiresAt:new Date(Date.now()+10000).toISOString()};
    portfolio.nativeChecks.set('project-1',fresh);
    const before=!!shownNativeIndex(state.directory.workspaces[0]);
    const stale=installDirectory({currentProjectId:'project-1',revision:3,workspaces:[]});
    installDirectory({currentProjectId:'project-1',revision:4,workspaces:[{...state.directory.workspaces[0],policyRevision:3}]});
    const after=!!shownNativeIndex(state.directory.workspaces[0]);
    ({before,stale,after,remaining:portfolio.nativeChecks.size,route:directoryRoute('project-1')});
  `, { state, URLSearchParams, ...helpers });
  expect(actual).toEqual({ before: true, stale: false, after: false, remaining: 0, route: 'directory?summary=1&project=project-1' });
});

it('boots the direct Workspaces route and requests summaries after project initialization', async () => {
  const node = { dataset: { projectLocal: 'true' }, addEventListener() {} };
  const document = { documentElement: node, getElementById: () => node, addEventListener() {} };
  const window = { location: { search: '?view=workspaces' }, addEventListener() {} };
  const actual = await runInNewContext(BRAIN_HUB_CLIENT + BRAIN_HUB_DIRECTORY + String.raw`;
    const requested=[];
    let boot;
    api=async route=>{
      requested.push([route,state.server.project.id]);
      return {currentProjectId:'fixture-project',revision:1,workspaces:[]};
    };
    render=()=>{};
    directoryPoll=()=>{};
    refresh=()=>{
      boot=(async()=>{
        state.project='fixture-project';
        state.server={project:{id:state.project}};
        await loadView();
      })();
    };
    start();
    boot.then(()=>({view:state.view,requested,revision:state.directory.revision}));
  `, { document, window, URLSearchParams, matchMedia: () => node, dockVisible: () => false,
    scheduleDockExpiry() {}, handleClick() {}, handleSubmit() {} });
  expect(actual).toEqual({ view: 'workspaces', requested: [['directory?summary=1', 'fixture-project']], revision: 1 });
});

it('fills all three cards from explicit native observation even if the directory was still loading', async () => {
  const state = { view: 'workspaces', project: 'project-1', directory: null, errors: {}, connection: 'reachable' };
  const rows = ['One', 'Two', 'Three'].map((name, index) => ({ projectName: name, projectId: 'project-' + (index + 1),
    root: '/synthetic/' + name, status: 'awaiting-host', policyRevision: 0, codexIndexAllowed: true }));
  const requests: string[] = [];
  const output = await runInNewContext(BRAIN_HUB_DIRECTORY + String.raw`;
    (async()=>{
      portfolio.nativeWatch=true;
      await checkDirectoryIndexes();
      installDirectory({currentProjectId:'project-1',revision:1,total:3,workspaces:rows});
      await checkDirectoryIndexes();
      return workspacesPage();
    })();
  `, { state, rows, document: { hidden: false }, AbortController, render() {}, json: (value: unknown) => value,
    api: async (_route: string, options: { projectId: string }) => {
      requests.push(options.projectId);
      return { projectId: options.projectId, policyRevision: 0, expiresAt: new Date(Date.now() + 30_000).toISOString(),
        threads: [{ name: 'Indexed ' + options.projectId, status: 'notLoaded' }] };
    }, ...helpers });
  expect(requests).toEqual(rows.map(row => row.projectId));
  const cards = output.match(/<ul class="portfolio-list">([\s\S]*?)<\/ul>/u)?.[1] ?? '';
  for (const row of rows) expect(cards).toContain('Indexed ' + row.projectId);
});

it('presents an opt-in recent Codex watcher, reviewable folders, and a stop action', async () => {
  const row = { ...base, projectId: 'project-1', projectName: 'Fixture', root: '/synthetic/current' };
  const state = { view: 'workspaces', project: row.projectId, directory: { currentProjectId: row.projectId, revision: 1, total: 1, workspaces: [row] },
    errors: {}, connection: 'reachable' };
  const requests: Array<{ kind?: string }> = [];
  const result = await runInNewContext(BRAIN_HUB_DIRECTORY + String.raw`;
    (async()=>{
      const initial=directoryRecentPanel();
      await startDirectoryRecent('/synthetic');
      const enabled=directoryRecentPanel();
      await checkDirectoryRecent();
      stopDirectoryRecent();
      const stopped=directoryRecentPanel();
      return {initial,enabled,stopped};
    })();
  `, { state, document: { hidden: false }, AbortController, render() {}, status() {}, json: (value: object) => value,
    api: async (_route: string, options: { kind?: string }) => {
      requests.push(options);
      if (options.kind === 'watch-start') return { watchToken: 'fixture-token' };
      if (options.kind === 'watch-check') return { added: 0, candidates: [{ projectName: 'Outside fixture', root: '/elsewhere/project', candidateToken: 'outside-token' }] };
      return { enabled: false };
    }, ...helpers, btn: (label: string, attributes: string) => '<button ' + attributes + '>' + label + '</button>' });
  expect(result.initial).toContain('Folder for automatic additions (optional)');
  expect(result.initial).not.toContain('Outside fixture');
  expect(result.enabled).toContain('Automatic additions under');
  expect(result.enabled).toContain('data-directory-candidate="outside-token"');
  expect(result.enabled).toContain('Stop watching');
  expect(result.stopped).not.toContain('Outside fixture');
  expect(requests).toMatchObject([{ kind: 'watch-start', parent: '/synthetic' }, { kind: 'watch-check', watchToken: 'fixture-token' },
    { kind: 'watch-stop', watchToken: 'fixture-token' }]);
});

it('pages exact titles for the selected card without replacing its latest chat', async () => {
  const row = { ...base, projectId: 'project-1', projectName: 'Fixture', root: '/synthetic/fixture' };
  const state = { view: 'workspaces', project: row.projectId, directory: { revision: 1, total: 1, workspaces: [row] },
    errors: {}, connection: 'reachable' };
  const requests: Array<{ projectId: string; pageToken?: string }> = [];
  const makeIndex = (threads: Array<{ name: string }>, nextPageToken: string | null = null) => ({
    projectId: row.projectId, policyRevision: row.policyRevision, expiresAt: new Date(Date.now() + 30_000).toISOString(), threads, nextPageToken,
  });
  const first = makeIndex(Array.from({ length: 12 }, (_, index) => ({ name: 'Recent  title ' + index })), 'fixture-page-two');
  const older = makeIndex([{ name: 'Earlier exact  title ✓' }]);
  const result = await runInNewContext(BRAIN_HUB_DIRECTORY + String.raw`;
    (async()=>{
      await loadDirectoryTitles(row.projectId);
      const current=directoryTitlePanel(row);
      await loadDirectoryTitles(row.projectId,'next');
      const previous=directoryTitlePanel(row);
      const card=projectCard(row,true);
      await loadDirectoryTitles(row.projectId,'previous');
      return {current,previous,card,newest:directoryTitlePanel(row)};
    })();
  `, { state, row, document: { hidden: false }, json: (input: unknown) => input,
    api: async (_route: string, options: { projectId: string; pageToken?: string }) => { requests.push(options); return options.pageToken ? older : first; },
    ...helpers });
  expect(result.current).toContain('Recent  title 11');
  expect(result.previous).toContain('Page 2');
  expect(result.previous).toContain('Earlier exact  title ✓');
  expect(result.card).toContain('Recent  title 0');
  expect(result.newest).toContain('Page 1');
  expect(requests.map(request => request.pageToken)).toEqual([undefined, 'fixture-page-two', undefined]);
});
