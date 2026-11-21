import { tmpdir } from 'node:os';
import { isAbsolute, parse, relative, sep } from 'node:path';

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
const unsafeComponent = /[\\/:*?"<>|\p{Cc}\p{Cf}\uFFFD]|[ .]$|~\d+(?:\.|$)|^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/iu;

function privateName(name: string): boolean {
  return name.startsWith('.') || privateNames.has(name) || privatePattern.test(name) || privateExtension.test(name);
}

/** Both file surfaces reject protected names before inspecting metadata. */
export function projectFileNameAllowed(name: string): boolean {
  const folded = name.normalize('NFKC').toLowerCase();
  return !!folded && !unsafeComponent.test(folded) && !privateName(folded) && !generatedNames.has(folded);
}

/** The pinned project itself must not be inside a protected tree. */
export function projectFileRootAllowed(root: string): boolean {
  const volume = parse(root).root;
  if (!isAbsolute(root) || volume.startsWith('\\\\')) return false;
  const tempRelative = relative(tmpdir(), root);
  const insideTemp = !!tempRelative && !isAbsolute(tempRelative) && tempRelative !== '..' && !tempRelative.startsWith('..' + sep);
  const components = root.slice(volume.length).split(sep);
  const tempAncestors = insideTemp ? components.length - tempRelative.split(sep).length : 0;
  return !!components[0] && components.every((part, index) => {
    const folded = part.normalize('NFKC').toLowerCase();
    // Windows normally places its temporary directory under AppData. An explicit temp directory in a profile stays protected.
    if (process.platform === 'win32' && index < tempAncestors && folded === 'appdata') return true;
    if (process.platform === 'darwin' && index === 0 && folded === 'private') return true;
    return !!folded && !unsafeComponent.test(folded) && !privateName(folded);
  });
}
