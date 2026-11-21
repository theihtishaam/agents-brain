import { lstatSync, opendirSync, readlinkSync, type Stats } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';

const HOSTS = [
  { id: 'vscode', label: 'Visual Studio Code', commands: ['code', 'code-insiders', 'copilot'], extensions: ['GitHub.copilot', 'GitHub.copilot-chat'], docs: 'https://code.visualstudio.com/docs/configure/command-line' },
  { id: 'cline', label: 'Cline', commands: ['cline'], extensions: ['saoudrizwan.claude-dev'], docs: 'https://docs.cline.bot/usage/cli-overview' },
  { id: 'kilo-code', label: 'Kilo Code', commands: ['kilo'], extensions: ['kilocode.Kilo-Code'], docs: 'https://kilo.ai/docs/code-with-ai/platforms/cli' },
  { id: 'claude-code', label: 'Claude Code', commands: ['claude'], extensions: ['anthropic.claude-code'], docs: 'https://code.claude.com/docs/en/quickstart' },
  { id: 'codex', label: 'Codex', commands: ['codex'], extensions: ['openai.chatgpt'], docs: 'https://developers.openai.com/codex/cli' },
  { id: 'opencode', label: 'OpenCode', commands: ['opencode'], extensions: ['sst-dev.opencode', 'sst-dev.opencode-v2'], docs: 'https://opencode.ai/docs/cli/' },
  { id: 'deepseek-harness', label: 'DeepSeek Harness', commands: ['dsh'], extensions: [], docs: 'https://github.com/deepseek-ai/deepseek-harness' },
  { id: 'openclaw', label: 'OpenClaw', commands: ['openclaw'], extensions: [], docs: 'https://docs.openclaw.ai/cli' },
] as const;

export type DiscoverableHostId = typeof HOSTS[number]['id'];
export const isDiscoverableHost = (id: string): id is DiscoverableHostId => HOSTS.some(host => host.id === id);
export const hostDisplayLabel = (id: DiscoverableHostId) => HOSTS.find(host => host.id === id)!.label;

/** Normalize only recognized client labels for project attribution. The transport declares this identity. */
export function reportedHost(name: string): DiscoverableHostId | undefined {
  const label = name.trim().toLowerCase();
  if (isDiscoverableHost(label)) return label;
  if (/\bcline\b/.test(label)) return 'cline';
  if (/\bkilo[ -]?code\b/.test(label)) return 'kilo-code';
  if (label.includes('codex')) return 'codex';
  if (label.includes('claude')) return 'claude-code';
  if (label.includes('opencode')) return 'opencode';
  if (label.includes('deepseek') || /^dsh(?:\b|$)/u.test(label)) return 'deepseek-harness';
  if (/\b(?:vscode|vs code|visual studio code|copilot)\b/.test(label)) return 'vscode';
  if (/\bopenclaw\b/.test(label)) return 'openclaw';
  return undefined;
}

export interface HostDiscoveryEntry {
  id: DiscoverableHostId;
  label: string;
  docs: string;
  status: 'detected' | 'not-detected' | 'unknown';
  evidence: Array<{ kind: 'path-command' | 'installed-launcher' | 'vscode-extension'; value: string }>;
  openCodeMajor?: 1 | 2;
}

const LIMITS = { pathChars: 32_768, directories: 96, extensions: 512, pathBytes: 2048, depth: 32, links: 6 };
const WINDOWS = process.platform === 'win32';
const SUFFIXES = WINDOWS ? ['.exe', '.cmd', '.bat', '.com'] : [''];
const PRIVATE = new Set([
  '.aws', '.azure', '.claude', '.cline', '.codex', '.config', '.docker', '.dsh', '.gnupg', '.kilo', '.kube', '.openclaw',
  '.opencode', '.shadow-brain', '.ssh', '.mozilla', '.npmrc', 'chrome', 'chromium', 'google chrome', 'edge', 'microsoft edge',
  'brave', 'bravesoftware', 'brave-browser', 'firefox', 'mozilla', 'safari', 'webkit', 'librewolf', 'waterfox', 'opera',
  'opera software', 'opera stable', 'opera gx', 'vivaldi', 'tor browser', 'yandexbrowser', 'browsers', 'browser',
  'user data', 'userdata', 'profiles', 'profile', 'default', 'local storage', 'session storage', 'network persistent state',
  'login data', 'local state', 'web data', 'indexeddb', 'keychains', 'logins.json', 'preferences', 'secure preferences',
  'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',
]);
const PRIVATE_COMPONENT = /(?:credential|password|passwd|secret|cookie|history|keychain|token|wallet|vault|api[-_ ]?key|private[-_ ]?key|recovery[-_ ]?code|passkey)|^profile[ _-]+\d+$|\.(?:pem|key|pfx|p12|kdbx?|sqlite[23]?|db)$/iu;

type Probe = { path: string; stat: Stats } | 'missing' | 'blocked';
const found = (probe: Probe): probe is { path: string; stat: Stats } => typeof probe !== 'string';
const missing = (error: unknown) => ['ENOENT', 'ENOTDIR'].includes(String((error as NodeJS.ErrnoException).code));

function safeAbsolute(path: string): string[] | undefined {
  if (Buffer.byteLength(path) > LIMITS.pathBytes || !isAbsolute(path) || /^[\\/]{2}/u.test(path) ||
      (WINDOWS && !/^[a-z]:[\\/]/iu.test(path))) return;
  const root = parse(path).root;
  const parts = path.slice(root.length).split(WINDOWS ? /[\\/]/u : sep).filter(Boolean);
  if (parts.length > LIMITS.depth || parts.some(part => {
    const name = part.normalize('NFKC').toLowerCase();
    return name === '.' || name === '..' || /[\\/:*?"<>|\p{Cc}\p{Cf}]|[ .]$|~\d+(?:\.|$)/u.test(name) ||
      PRIVATE.has(name) || PRIVATE_COMPONENT.test(name);
  })) return;
  return parts;
}

/** Traverse only metadata and resolve a bounded number of links to other approved local paths. */
function probe(candidate: string, allowLinks: boolean): Probe {
  let path = candidate;
  try {
    for (let links = 0; links <= LIMITS.links; links++) {
      const parts = safeAbsolute(path);
      if (!parts?.length) return 'blocked';
      let current = parse(path).root;
      let redirected = false;
      for (const [index, part] of parts.entries()) {
        current = join(current, part);
        const stat = lstatSync(current, { throwIfNoEntry: false });
        if (!stat) return 'missing';
        if (stat.isSymbolicLink()) {
          if (!allowLinks || links === LIMITS.links) return 'blocked';
          const target = readlinkSync(current);
          if (/^[\\/]{2}/u.test(target) || Buffer.byteLength(target) > LIMITS.pathBytes) return 'blocked';
          path = resolve(dirname(current), target, ...parts.slice(index + 1));
          redirected = true;
          break;
        }
        if (index === parts.length - 1) return { path: current, stat };
        if (!stat.isDirectory()) return 'missing';
      }
      if (!redirected) break;
    }
  } catch (error) { return missing(error) ? 'missing' : 'blocked'; }
  return 'blocked';
}

const executable = (result: Probe) => found(result) && result.stat.isFile() && (WINDOWS || (result.stat.mode & 0o111) !== 0);

function openCodePackage(bin: string, actual: string): 1 | 2 | undefined {
  const installed = actual.toLowerCase().split(WINDOWS ? /[\\/]/u : '/');
  const modules = installed.lastIndexOf('node_modules');
  if (modules !== -1) {
    if (installed[modules + 1] === 'opencode-ai' || /^opencode-(?:win|linux|darwin)/u.test(installed[modules + 1] ?? '')) return 1;
    if (installed[modules + 1] === '@opencode' && /^cli(?:-|$)/u.test(installed[modules + 2] ?? '')) return 2;
  }
  const binary = WINDOWS ? 'opencode.exe' : 'opencode';
  const installedBinary = (candidate: string) => {
    const result = probe(candidate, true);
    // Windows npm launch files can be small postinstall placeholders.
    return found(result) && executable(result) && (!WINDOWS || result.stat.size > 1024 * 1024);
  };
  const v1 = installedBinary(join(bin, 'node_modules', 'opencode-ai', 'bin', binary));
  const v2 = installedBinary(join(bin, 'node_modules', '@opencode', 'cli', 'bin', binary));
  return v1 === v2 ? undefined : v1 ? 1 : 2;
}

/** Only fixed install-time launchers, never application data or profile configuration. */
function bundledLaunchers(home: string) {
  const launchers = new Map<DiscoverableHostId, string>();
  if (!safeAbsolute(home)?.length) return launchers;
  if (executable(probe(join(home, '.local', 'bin', WINDOWS ? 'claude.exe' : 'claude'), true))) launchers.set('claude-code', 'Claude Code launcher');
  if (WINDOWS) {
    const programs = join(home, 'AppData', 'Local', 'Programs');
    const editor = join(programs, 'Microsoft VS Code');
    if (executable(probe(join(editor, 'Code.exe'), false)) && executable(probe(join(editor, 'bin', 'code.cmd'), false))) {
      launchers.set('vscode', 'VS Code user installation');
    }
    const desktop = join(programs, 'DeepSeek Harness');
    if (executable(probe(join(desktop, 'DeepSeek Harness.exe'), false)) &&
        executable(probe(join(desktop, 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd'), false))) {
      launchers.set('deepseek-harness', 'DeepSeek Harness Desktop');
    }
  }
  return launchers;
}

function scanCommands(searchPath: string) {
  const commands = HOSTS.flatMap(host => [...host.commands]);
  const visible = new Set<string>();
  let openCodeMajor: 1 | 2 | undefined;
  let limited = searchPath.length > LIMITS.pathChars;
  const bounded = searchPath.slice(0, LIMITS.pathChars);
  const complete = limited ? bounded.slice(0, Math.max(0, bounded.lastIndexOf(delimiter))) : bounded;
  const folders = complete.split(delimiter, LIMITS.directories + 1);
  limited ||= folders.length > LIMITS.directories;
  const inspected = new Set<string>();
  for (const entry of folders.slice(0, LIMITS.directories)) {
    if (visible.size === commands.length) break;
    const path = WINDOWS && entry.startsWith('"') && entry.endsWith('"') ? entry.slice(1, -1) : entry;
    const key = WINDOWS ? path.toLowerCase() : path;
    if (!path || inspected.has(key) || !safeAbsolute(path)?.length) continue;
    inspected.add(key);
    const directory = probe(path, true);
    if (!found(directory)) { limited ||= directory === 'blocked'; continue; }
    if (!directory.stat.isDirectory()) continue;
    for (const command of commands) {
      if (visible.has(command)) continue;
      for (const suffix of SUFFIXES) {
        try {
          const candidate = join(directory.path, command + suffix);
          const stat = lstatSync(candidate, { throwIfNoEntry: false });
          const result = stat?.isSymbolicLink() ? probe(candidate, true) : stat ? { path: candidate, stat } : 'missing';
          if (found(result) && executable(result)) {
            visible.add(command);
            if (command === 'opencode') openCodeMajor = openCodePackage(directory.path, result.path);
            break;
          }
          limited ||= result === 'blocked';
        } catch (error) { limited ||= !missing(error); }
      }
    }
  }
  return { visible, limited, openCodeMajor };
}

function scanExtensions(home: string, product: '.vscode' | '.vscode-insiders') {
  const candidates = HOSTS.flatMap(host => [...host.extensions]);
  const visible = new Set<string>();
  if (!safeAbsolute(home)?.length) return { visible, limited: true };
  const root = probe(join(home, product, 'extensions'), false);
  if (!found(root)) return { visible, limited: root === 'blocked' };
  if (!root.stat.isDirectory()) return { visible, limited: true };
  const checkRoot = () => {
    const current = probe(root.path, false);
    return found(current) && current.stat.isDirectory() && current.stat.dev === root.stat.dev && current.stat.ino === root.stat.ino;
  };
  let limited = false;
  try {
    const directory = opendirSync(root.path);
    try {
      if (!checkRoot()) return { visible, limited: true };
      for (let index = 0; index <= LIMITS.extensions; index++) {
        const entry = directory.readSync();
        if (!entry) break;
        if (index === LIMITS.extensions) { limited = true; break; }
        if (!entry.isDirectory() || entry.name.length > 180) continue;
        const lowered = entry.name.toLowerCase();
        for (const id of candidates) {
          const key = id.toLowerCase();
          const versioned = lowered.startsWith(key + '-') && /^\d+\.\d+\.\d+(?:[-+][a-z0-9][a-z0-9.+-]*)?$/u.test(lowered.slice(key.length + 1));
          if (lowered === key || versioned) visible.add(id);
        }
        if (visible.size === candidates.length) break;
      }
    } finally { directory.closeSync(); }
    if (!checkRoot()) return { visible: new Set<string>(), limited: true };
  } catch { return { visible: new Set<string>(), limited: true }; }
  return { visible, limited };
}

/** On-demand installation evidence only. No CLI execution, profile files, extension contents or persisted results. */
export function discoverAgentHosts(options: { path?: string; home?: string } = {}): { hosts: HostDiscoveryEntry[]; limited: boolean } {
  const commands = scanCommands(options.path ?? process.env.PATH ?? '');
  const home = options.home ?? homedir();
  const launchers = bundledLaunchers(home);
  const stable = scanExtensions(home, '.vscode');
  const insiders = scanExtensions(home, '.vscode-insiders');
  const extensions = { visible: new Set([...stable.visible, ...insiders.visible]), limited: stable.limited || insiders.limited };
  const hosts = HOSTS.map(({ id, label, docs, commands: names, extensions: ids }): HostDiscoveryEntry => {
    const launcher = launchers.get(id);
    const evidence: HostDiscoveryEntry['evidence'] = [
      ...names.filter(name => commands.visible.has(name)).map(value => ({ kind: 'path-command' as const, value })),
      ...(launcher ? [{ kind: 'installed-launcher' as const, value: launcher }] : []),
      ...ids.filter(name => extensions.visible.has(name)).map(value => ({ kind: 'vscode-extension' as const, value })),
    ];
    const limited = commands.limited || (ids.length > 0 && extensions.limited);
    const openCodeMajor = commands.openCodeMajor ?? (extensions.visible.has('sst-dev.opencode-v2') ? 2 :
      extensions.visible.has('sst-dev.opencode') ? 1 : undefined);
    return { id, label, docs, status: evidence.length ? 'detected' : limited ? 'unknown' : 'not-detected', evidence,
      ...(id === 'opencode' && openCodeMajor !== undefined ? { openCodeMajor } : {}) };
  });
  return { hosts, limited: commands.limited || extensions.limited };
}
