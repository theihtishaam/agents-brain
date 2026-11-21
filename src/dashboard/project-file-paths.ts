import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, parse, relative, sep } from 'node:path';

const privateNames = new Set([
  'appdata', 'programdata', 'library', 'applications', 'windows', 'system32', 'system volume information', 'downloads',
  'config', 'configs', 'configuration', 'settings', 'secrets', 'private', 'profiles', 'browser', 'browsers', 'logs',
  'application support', 'keychains', 'certificates', 'credentials', 'program files', 'program files (x86)',
  'chrome', 'chromium', 'google chrome', 'microsoft edge', 'edge user data', 'brave', 'bravesoftware', 'brave-browser',
  'firefox', 'mozilla', 'librewolf', 'waterfox', 'safari', 'webkit', 'opera', 'opera software', 'opera stable',
  'opera gx', 'vivaldi', 'tor browser', 'yandexbrowser', 'user data', 'userdata', 'network', 'default', 'system profile',
  'local state', 'local storage', 'indexeddb', 'web data', 'login data', 'preferences', 'secure preferences', 'bookmarks',
  'last tabs', 'current tabs', 'favicons', 'places.sqlite', 'storage-sync-v2.sqlite', 'passkeys', 'recovery codes',
  'login data for account', 'logins.json', 'network persistent state', 'extension state', 'site characteristics database',
  'local extension settings', 'leveldb', 'keychain access', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',
]);
const generatedNames = new Set([
  'node_modules', 'vendor', 'dist', 'build', 'target', 'out', 'coverage', 'cache', 'caches', 'temp', 'tmp',
  'bower_components', 'site-packages', '__pycache__', 'obj',
]);
const privatePattern = /(?:credential|password|passwd|secret|cookie|history|keychain|token|session|wallet|vault|config|settings|profile|auth|api[-_ ]?key|private[-_ ]?key|ssh[-_ ]?key|access[-_ ]?key|recovery[-_ ]?code|passkey|saved[-_ ]?logins?)/iu;
const privateExtension = /\.(?:pem|key|ppk|pfx|p12|crt|cer|jks|keystore|kdbx?|env|sqlite[23]?|db|ldb|log|lock|swp|tmp|bak)$/iu;
const unsafeComponent = /[\\/:*?"<>|\p{Cc}\p{Cf}\uFFFD]|[ .]$|^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/iu;
const shortAlias = /~\d+(?:\.|$)/u;
const fold = (name: string) => name.normalize('NFKC').toLowerCase();

function privateName(name: string): boolean {
  return name.startsWith('.') || privateNames.has(name) || privatePattern.test(name) || privateExtension.test(name);
}

/** Both file surfaces reject protected names before inspecting metadata. */
export function projectFileNameAllowed(name: string): boolean {
  const folded = fold(name);
  return !!folded && !unsafeComponent.test(folded) && !shortAlias.test(folded) && !privateName(folded) && !generatedNames.has(folded);
}

function windowsTempRoot(): string | undefined {
  const directory = tmpdir();
  const volume = parse(directory).root;
  const parts = directory.slice(volume.length).split(/[\\/]/u).map(fold);
  const tempNames = ['temp', 'tmp'];
  // The AppData exception only covers a local temporary directory. Its OS-reported path may use 8.3 aliases.
  if (!/^[a-z]:[\\/]$/iu.test(volume) || !tempNames.includes(fold(basename(directory))) ||
      parts.some(name => unsafeComponent.test(name) || (name !== 'appdata' && privateName(name)))) return undefined;
  try {
    const canonical = realpathSync.native(directory);
    if (tempNames.includes(fold(basename(canonical)))) return canonical;
  } catch { /* An unavailable TEMP directory provides no AppData exception. */ }
  return undefined;
}

/** The pinned project itself must not be inside a protected tree. */
export function projectFileRootAllowed(root: string): boolean {
  const volume = parse(root).root;
  if (!isAbsolute(root) || volume.startsWith('\\\\')) return false;
  const windows = process.platform === 'win32';
  const components = root.slice(volume.length).split(sep).map(fold);
  if (!components.every((name, index) => {
    if (windows && name === 'appdata') return true;
    if (process.platform === 'darwin' && index === 0 && name === 'private') return true;
    return !!name && !unsafeComponent.test(name) && !shortAlias.test(name) && !privateName(name);
  })) return false;
  if (!windows || !components.includes('appdata')) return true;
  const temp = windowsTempRoot();
  if (!temp) return false;
  const descendant = relative(temp, root);
  if (!descendant || isAbsolute(descendant) || descendant === '..' || descendant.startsWith('..' + sep)) return false;
  const tempAncestors = components.length - descendant.split(sep).length;
  return !components.slice(tempAncestors).includes('appdata');
}
