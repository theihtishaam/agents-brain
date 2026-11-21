import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { buildClientConfig, memoryLaunchCommand } from './client-config.js';
import { ensureProjectDirectory, projectLocalPath, projectRoot } from './project-kit-paths.js';

const ids = ['vscode', 'claude-code', 'opencode', 'cline', 'kilo-code', 'codex', 'openclaw', 'deepseek-harness'] as const;
const connectorId = z.enum(ids);
export type WorkspaceConnectionId = z.infer<typeof connectorId>;
type Recipe = { format: 'json' | 'toml' | 'yaml'; content: string; notes: string[] };
type Definition = { label: string; docs: string; file?: string; alternatives?: readonly string[]; note?: string };
const portable = { file: '.mcp.json', alternatives: ['.github/mcp.json', '.vscode/mcp.json'] };
const definitions: Record<WorkspaceConnectionId, Definition> = {
  vscode: { ...portable, label: 'VS Code / Copilot', docs: 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration',
    note: 'The current Copilot harness reads the same project file as Claude Code. Older editor-managed setups use .vscode/mcp.json.' },
  'claude-code': { ...portable, label: 'Claude Code', docs: 'https://code.claude.com/docs/en/mcp#project-scope',
    note: 'Claude Code can prompt to approve this project server. The same file can also be used by the current Copilot harness.' },
  opencode: { file: 'opencode.json', alternatives: ['opencode.jsonc', '.opencode/opencode.json', '.opencode/opencode.jsonc'],
    label: 'OpenCode', docs: 'https://opencode.ai/docs/mcp-servers/', note: 'This recipe uses the OpenCode V2 configuration format.' },
  cline: { label: 'Cline', docs: 'https://docs.cline.bot/mcp/mcp-overview',
    note: 'Add the server through Cline’s MCP settings. To use a separately saved file with the CLI, set CLINE_MCP_SETTINGS_PATH for that invocation.' },
  'kilo-code': { file: 'kilo.json', alternatives: ['kilo.jsonc', '.kilo/kilo.json', '.kilo/kilo.jsonc', '.kilocode/mcp.json'],
    label: 'Kilo Code', docs: 'https://kilo.ai/docs/automate/mcp/using-in-kilo-code', note: 'This uses the current Kilo Code and Kilo CLI format.' },
  codex: { file: '.codex/config.toml', label: 'Codex', docs: 'https://developers.openai.com/codex/mcp/',
    note: 'Codex loads the project configuration after you trust the project.' },
  openclaw: { label: 'OpenClaw', docs: 'https://docs.openclaw.ai/gateway/config-extensions#mcp',
    note: 'Review the entry in the OpenClaw Gateway configuration you use for this workspace.' },
  'deepseek-harness': { label: 'DeepSeek Harness', docs: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md',
    note: 'Add the MCP client plugin entry through the Harness profile configuration you use for this workspace.' },
};

const metadataName = 'workspace-connections.sqlite';
const storeDirectory = '.shadow-brain';
const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);
const statValue = z.string().regex(/^\d{1,24}$/u);
const receiptSchema = z.strictObject({
  file: z.enum(['.mcp.json', 'opencode.json', 'kilo.json', '.codex/config.toml']),
  owners: z.array(connectorId).min(1).max(2),
  dev: statValue, ino: statValue, size: statValue, modified: statValue, changed: statValue, born: statValue,
});
type Receipt = z.infer<typeof receiptSchema>;
const stateSchema = z.strictObject({ revision: revisionSchema, automatic: z.boolean(),
  excluded: z.array(connectorId).max(ids.length), receipts: z.array(receiptSchema).max(4) });
type State = z.infer<typeof stateSchema>;
const initialState = (): State => ({ revision: 0, automatic: false, excluded: [], receipts: [] });
const expectedRevision = revisionSchema;
const commandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('configure'), id: connectorId, expectedRevision }),
  z.strictObject({ kind: z.literal('remove'), id: connectorId, expectedRevision }),
  z.strictObject({ kind: z.literal('set-automatic'), enabled: z.boolean(), expectedRevision }),
  z.strictObject({ kind: z.literal('set-allowed'), id: connectorId, enabled: z.boolean(), expectedRevision }),
]);
export type WorkspaceConnectionsCommand = z.infer<typeof commandSchema>;
export interface WorkspaceConnector {
  id: WorkspaceConnectionId;
  label: string;
  status: 'available' | 'configured' | 'conflict' | 'modified' | 'manual';
  allowed: boolean;
  configurationPath: string | null;
  docs: string;
  recipe: Recipe;
}
export interface WorkspaceConnectionsSnapshot {
  revision: number;
  automatic: boolean;
  connectors: WorkspaceConnector[];
}
export class WorkspaceConnectionsError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}
const unavailable = () => new WorkspaceConnectionsError('WORKSPACE_CONNECTIONS_UNAVAILABLE', 'Workspace connection records are unavailable.', 503);
const conflict = () => new WorkspaceConnectionsError('WORKSPACE_CONNECTIONS_CONFLICT', 'The workspace configuration or connection revision changed. Review the current status and reload.', 409);
const initialWait = new Int32Array(new SharedArrayBuffer(4));
const fileError = (error: unknown) => (error as NodeJS.ErrnoException).code;
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

function fingerprint(info: fs.BigIntStats) {
  return { dev: String(info.dev), ino: String(info.ino), size: String(info.size), modified: String(info.mtimeNs),
    changed: String(info.ctimeNs), born: String(info.birthtimeNs) };
}
function sameIdentity(a: fs.BigIntStats, b: fs.BigIntStats) {
  return a.ino !== 0n && a.ino === b.ino && a.dev === b.dev && a.birthtimeNs === b.birthtimeNs;
}
function unchanged(info: fs.BigIntStats | undefined, receipt: Receipt) {
  return info?.isFile() && info.nlink === 1n && info.ino !== 0n &&
    Object.entries(fingerprint(info)).every(([key, value]) => receipt[key as keyof Receipt] === value);
}
function workspaceRecipe(root: string, project: string, id: WorkspaceConnectionId): Recipe {
  const definition = definitions[id];
  const options = { dbPath: path.join(root, storeDirectory, 'project-memory.json'), projectId: project };
  const launch = memoryLaunchCommand(root, options);
  if (definition.file !== portable.file) launch.args.push('--client-id', id);
  const notes = ['This local command pins the workspace and its memory store. Paths belong to this installation.',
    'Reload the host and check for a live MCP connection.', ...(definition.note ? [definition.note] : [])];
  // Several hosts expand variable or file references in configuration strings.
  if ([launch.command, ...launch.args].some(value => /\$\{|\{(?:env|file):/u.test(value))) {
    return { format: id === 'codex' ? 'toml' : id === 'deepseek-harness' ? 'yaml' : 'json', content: '',
      notes: ['A launch path contains syntax that some hosts expand. Use a workspace and installation path without those expressions.'] };
  }
  if (definition.file === portable.file) return { format: 'json', notes,
    content: json({ mcpServers: { shadow_brain: { type: 'stdio', ...launch, tools: ['*'] } } }) };
  if (id === 'codex') return { format: 'toml', notes, content: '[mcp_servers.shadow_brain]\ncommand = ' +
    JSON.stringify(launch.command) + '\nargs = ' + JSON.stringify(launch.args) + '\n' };
  if (id === 'opencode' || id === 'kilo-code') {
    const entry = { type: 'local', command: [launch.command, ...launch.args] };
    return { format: 'json', notes, content: json(id === 'opencode' ?
      { $schema: 'https://opencode.ai/config.json', mcp: { servers: { shadow_brain: entry } } } :
      { mcp: { shadow_brain: entry } }) };
  }
  if (id === 'deepseek-harness') {
    const recipe = buildClientConfig(id, root, options);
    return { format: 'yaml', notes, content: recipe.content.replace(/    args: .*\n/u, () => '    args: ' + JSON.stringify(launch.args) + '\n') };
  }
  return { format: 'json', notes, content: json(id === 'openclaw' ?
    { mcp: { servers: { shadow_brain: launch } } } : { mcpServers: { shadow_brain: launch } }) };
}

export class WorkspaceConnections {
  constructor(private readonly root: string, private readonly projectId: string) {}

  private database(write: boolean): DatabaseSync | undefined {
    if (write) ensureProjectDirectory(this.root, storeDirectory);
    const file = projectLocalPath(this.root, storeDirectory + '/' + metadataName);
    for (const suffix of ['-wal', '-shm', '-journal']) {
      const info = fs.lstatSync(file + suffix, { throwIfNoEntry: false });
      if (info && (!info.isFile() || info.nlink !== 1 || info.size > 1024 * 1024)) throw unavailable();
    }
    let info = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!info) {
      if (!write) return undefined;
      // SQLite adds a journal suffix while initializing this file. Keep the
      // staging basename short enough for deep Windows project paths.
      const temporary = path.join(path.dirname(file), 'wc-' + randomUUID().replaceAll('-', '').slice(0, 20) + '.tmp');
      fs.closeSync(fs.openSync(temporary, 'wx', 0o600));
      try {
        const fresh = new DatabaseSync(temporary, { allowExtension: false });
        try {
          fresh.exec('PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;'
            + 'CREATE TABLE connection_state (project TEXT PRIMARY KEY, version INTEGER NOT NULL, state TEXT NOT NULL) STRICT;');
          fresh.prepare('INSERT INTO connection_state VALUES(?,1,?)').run(this.projectId, JSON.stringify(initialState()));
          fresh.exec('COMMIT');
        } finally { fresh.close(); }
        try { fs.linkSync(temporary, file); } catch (error) { if (fileError(error) !== 'EEXIST') throw error; }
      } finally { fs.unlinkSync(temporary); }
    }
    const deadline = performance.now() + 1000;
    do {
      info = fs.lstatSync(file, { throwIfNoEntry: false });
      if (!info?.isFile() || info.size > 1024 * 1024) throw unavailable();
      if (info.nlink === 1) break;
      if (performance.now() >= deadline) throw unavailable();
      Atomics.wait(initialWait, 0, 0, 4);
    } while (true);
    const database = new DatabaseSync(file, { readOnly: !write, allowExtension: false });
    try {
      database.exec('PRAGMA busy_timeout=1500; PRAGMA trusted_schema=OFF;');
      return database;
    } catch (error) { database.close(); throw error; }
  }

  private state(database: DatabaseSync | undefined): State {
    if (!database) return initialState();
    const rows = database.prepare('SELECT project,version,state FROM connection_state LIMIT 2').all();
    if (rows.length !== 1 || rows[0].project !== this.projectId || rows[0].version !== 1 ||
        typeof rows[0].state !== 'string' || rows[0].state.length > 4096) throw unavailable();
    const state = stateSchema.parse(JSON.parse(rows[0].state));
    if (new Set(state.excluded).size !== state.excluded.length ||
        new Set(state.receipts.map(receipt => receipt.file)).size !== state.receipts.length ||
        state.receipts.some(receipt => new Set(receipt.owners).size !== receipt.owners.length ||
          receipt.owners.some(owner => definitions[owner].file !== receipt.file))) throw unavailable();
    return state;
  }

  private update(write: boolean, operation: (state: State) => State): State {
    let database: DatabaseSync | undefined;
    try {
      database = this.database(write);
      if (write) database!.exec('BEGIN IMMEDIATE');
      const current = this.state(database);
      const next = operation(current);
      if (write && next !== current) {
        if (current.revision >= Number.MAX_SAFE_INTEGER - 1) throw conflict();
        next.revision = current.revision + 1;
        database!.prepare('UPDATE connection_state SET state=? WHERE project=?').run(JSON.stringify(stateSchema.parse(next)), this.projectId);
      }
      if (write) database!.exec('COMMIT');
      return next;
    } catch (error) {
      if (write) {
        try { database?.exec('ROLLBACK'); } catch { /* Preserve the original failure. */ }
      }
      throw error instanceof WorkspaceConnectionsError ? error : unavailable();
    } finally { database?.close(); }
  }

  private status(root: string, id: WorkspaceConnectionId, receipt?: Receipt): WorkspaceConnector['status'] {
    const definition = definitions[id];
    if (!definition.file) return 'manual';
    try {
      const info = fs.lstatSync(projectLocalPath(root, definition.file), { bigint: true, throwIfNoEntry: false });
      if (info) return receipt ? unchanged(info, receipt) ? 'configured' : 'modified' : 'conflict';
      return definition.alternatives?.some(file => fs.lstatSync(projectLocalPath(root, file), { throwIfNoEntry: false })) ? 'conflict' : 'available';
    } catch { return receipt ? 'modified' : 'conflict'; }
  }

  private snapshot(state: State): WorkspaceConnectionsSnapshot {
    const root = projectRoot(this.root);
    return { revision: state.revision, automatic: state.automatic, connectors: ids.map(id => {
      const definition = definitions[id];
      const recipe = workspaceRecipe(root, this.projectId, id);
      return { id, label: definition.label, configurationPath: definition.file ?? null, docs: definition.docs,
        status: definition.file && !recipe.content ? 'conflict' : this.status(root, id, state.receipts.find(receipt => receipt.file === definition.file)),
        allowed: !state.excluded.includes(id), recipe };
    }) };
  }

  read(): WorkspaceConnectionsSnapshot { return this.snapshot(this.update(false, state => state)); }

  automaticEnabled(): boolean { return this.update(false, state => state).automatic; }

  /** Runtime gate reads the project-owned state only. */
  allows(id: string): boolean {
    return !this.update(false, state => state).excluded.some(excluded => excluded === id);
  }

  excludedHosts(): readonly WorkspaceConnectionId[] {
    return this.update(false, state => state).excluded;
  }

  private create(root: string, id: WorkspaceConnectionId, file: Receipt['file']): Receipt {
    const recipe = workspaceRecipe(root, this.projectId, id);
    if (!recipe.content) throw conflict();
    const parent = path.dirname(file);
    if (parent !== '.') ensureProjectDirectory(root, parent);
    const staged = projectLocalPath(root, storeDirectory + '/connector.' + randomUUID() + '.tmp');
    const fd = fs.openSync(staged, 'wx', 0o600);
    try {
      try { fs.writeFileSync(fd, recipe.content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      const before = fs.lstatSync(staged, { bigint: true });
      const dest = projectLocalPath(root, file);
      if (this.status(root, id) !== 'available') throw conflict();
      try { fs.linkSync(staged, dest); } catch (error) { if (fileError(error) === 'EEXIST') throw conflict(); throw error; }
      fs.unlinkSync(staged);
      const after = fs.lstatSync(projectLocalPath(root, file), { bigint: true });
      if (!after.isFile() || after.nlink !== 1n || !sameIdentity(before, after) ||
          before.size !== after.size || before.mtimeNs !== after.mtimeNs) throw conflict();
      return receiptSchema.parse({ file, owners: [id], ...fingerprint(after) });
    } finally {
      try { fs.unlinkSync(staged); } catch (error) { if (fileError(error) !== 'ENOENT') throw error; }
    }
  }

  private configure(state: State, root: string, id: WorkspaceConnectionId, automatic: boolean): State {
    const file = definitions[id].file as Receipt['file'] | undefined;
    const excluded = state.excluded.filter(value => value !== id);
    const allowed = excluded.length === state.excluded.length;
    if (!file) return allowed ? state : { ...state, excluded };
    const current = state.receipts.find(receipt => receipt.file === file);
    const status = this.status(root, id, current);
    if (status === 'conflict' || status === 'modified') {
      if (automatic) return state;
      throw conflict();
    }
    if (status === 'configured' && current?.owners.includes(id)) return allowed ? state : { ...state, excluded };
    const receipt = status === 'configured' && current ?
      { ...current, owners: [...current.owners, id] } : this.create(root, id, file);
    return { ...state, excluded, receipts: [...state.receipts.filter(item => item.file !== file), receipt] };
  }

  reconcile(detectedIds: readonly string[]): WorkspaceConnectionsSnapshot {
    const root = projectRoot(this.root);
    let state = this.update(false, current => current);
    if (!state.automatic) return this.snapshot(state);
    // Each publication gets its own durable receipt even if another client cannot be configured.
    for (const id of ids.filter(id => definitions[id].file && detectedIds.includes(id))) {
      state = this.update(true, current => {
        if (!current.automatic || current.excluded.includes(id)) return current;
        try { return this.configure(current, root, id, true); }
        catch (error) { if (error instanceof WorkspaceConnectionsError && error.status === 409) return current; throw error; }
      });
    }
    return this.snapshot(state);
  }

  apply(input: unknown): WorkspaceConnectionsSnapshot {
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success) throw new WorkspaceConnectionsError('WORKSPACE_CONNECTIONS_INVALID', 'Send a valid connection change with the current revision.', 400);
    const command = parsed.data;
    const root = projectRoot(this.root);
    let state = this.update(true, current => {
      if (current.revision !== command.expectedRevision) throw conflict();
      if (command.kind === 'set-automatic') return current.automatic === command.enabled ? current : { ...current, automatic: command.enabled };
      if (command.kind === 'configure') return this.configure(current, root, command.id, false);
      const excluded = current.excluded.includes(command.id);
      const enable = command.kind === 'set-allowed' && command.enabled;
      if (excluded !== enable) return current;
      return { ...current, excluded: enable ? current.excluded.filter(id => id !== command.id) : [...current.excluded, command.id] };
    });
    if (command.kind === 'remove') state = this.update(true, current => {
      // Revocation is committed before attempting cleanup, including for a running host.
      if (!current.excluded.includes(command.id)) return current;
      const receipt = current.receipts.find(item => item.owners.includes(command.id));
      if (!receipt) return current;
      const owners = receipt.owners.filter(owner => owner !== command.id);
      const remainder = current.receipts.filter(item => item !== receipt);
      if (owners.length) return { ...current, receipts: [...remainder, { ...receipt, owners }] };
      if (this.status(root, command.id, receipt) === 'available') return { ...current, receipts: remainder };
      if (this.status(root, command.id, receipt) !== 'configured') return current;
      const dest = projectLocalPath(root, receipt.file);
      if (!unchanged(fs.lstatSync(dest, { bigint: true, throwIfNoEntry: false }), receipt)) return current;
      fs.unlinkSync(dest);
      return { ...current, receipts: remainder };
    });
    return this.snapshot(state);
  }
}
