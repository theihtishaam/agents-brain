import { Command } from 'commander';
import { inspectProject, planProjectSkill, applyProjectSkill } from './brain/project-kit.js';
import { GlobalBrain } from './brain/global-brain.js';
import { projectStorage, addProjectKnowledge } from './brain/project-memory.js';
import { buildClientConfig } from './brain/client-config.js';
import { ProjectFeedbackStore, type ProjectFeedbackCommand } from './brain/project-feedback.js';

export function registerProjectCommands(program: Command): void {
  const project = program.command('project').description('Workspace-local knowledge, observed project context, and tailored skills');
  project.command('inspect').argument('[directory]', 'Existing project directory', process.cwd())
    .description('Inspect bounded manifest and tree evidence without executing scripts or reading private configuration')
    .action(directory => console.log(JSON.stringify(inspectProject(directory), null, 2)));
  project.command('workspace').argument('[directory]', 'Existing project directory', process.cwd())
    .option('--port <number>', 'Loopback port; 0 selects an available port', '0')
    .description('Open the persistent local project portal without providers or a global memory store')
    .action(async (directory, opts) => {
      const { startProjectWorkspace } = await import('./dashboard/project-workspace.js');
      const workspace = await startProjectWorkspace(directory, { port: Number(opts.port) });
      console.log('Agent Shadow Brain 7.21.0 · PROJECT WORKSPACE');
      console.log('Project: ' + workspace.root);
      console.log('Memory: ' + workspace.storagePath);
      console.log('Brain Hub: ' + workspace.url + '/hub');
      console.log('Memory workspace: ' + workspace.url + '/workspace');
      console.log('Live view: ' + workspace.url + '/live');
      console.log('Restart from this project: shadow-brain project workspace . --port ' + new URL(workspace.url).port);
      console.log('Knowledge and skills stay in this project. Press Ctrl+C to stop; saved files are retained.');
      const stop = () => { void workspace.close().then(() => process.exit(0), () => { console.error('Project shutdown failed; saved files were retained.'); process.exit(1); }); };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
    });
  project.command('knowledge').argument('[directory]', 'Existing project directory', process.cwd())
    .requiredOption('--title <text>', 'Short title for this user-supplied knowledge')
    .requiredOption('--content <text>', 'Explicit knowledge, at most 8000 characters')
    .option('--category <name>', 'Category; defaults to knowledge')
    .option('--source <reference>', 'Optional source label; never fetched')
    .description('Commit explicit knowledge to this project only')
    .action(async (directory, opts) => {
      const store = projectStorage(directory);
      const brain = GlobalBrain.createIsolated({ dbPath: store.storagePath });
      try { console.log(JSON.stringify(await addProjectKnowledge(store.root, brain, {
        title: opts.title, content: opts.content, ...(opts.category ? { category: opts.category } : {}), ...(opts.source ? { source: opts.source } : {}),
      }), null, 2)); } finally { await brain.shutdown(); }
    });
  project.command('skill').argument('[directory]', 'Existing project directory', process.cwd())
    .requiredOption('--requirement <text>', 'The project-specific task and acceptance requirements')
    .option('--target <client>', 'codex, claude-code, opencode, deepseek-harness, or portable', 'portable')
    .option('--name <slug>', 'Optional stable skill name')
    .option('--knowledge <text>', 'Explicit task-specific guidance to include')
    .option('--apply', 'Apply a previously previewed plan with its exact hash')
    .option('--expected-plan-hash <hash>', 'Hash from the preview; required with --apply')
    .description('Preview a tailored project skill; write only with --apply and the current preview hash')
    .action(async (directory, opts) => {
      const params = { requirement: opts.requirement, target: opts.target, ...(opts.name ? { name: opts.name } : {}), ...(opts.knowledge ? { knowledge: opts.knowledge } : {}) };
      console.log(JSON.stringify(opts.apply ? await applyProjectSkill(directory, params, opts.expectedPlanHash) : planProjectSkill(directory, params), null, 2));
    });
  project.command('config').argument('[directory]', 'Existing project directory', process.cwd())
    .option('--target <client>', 'Native MCP recipe target', 'portable')
    .description('Print an MCP recipe pinned to this project and its local knowledge store')
    .action((directory, opts) => {
      const store = projectStorage(directory);
      console.log(JSON.stringify(buildClientConfig(opts.target, store.root, { dbPath: store.storagePath, projectId: store.projectId }), null, 2));
    });
  const feedback = project.command('feedback').description('Review and control task-relevant learning from reported memory outcomes');
  const useFeedback = async (directory: string, command?: ProjectFeedbackCommand, revision?: string) => {
    const store = projectStorage(directory);
    const brain = GlobalBrain.createIsolated({ dbPath: store.storagePath });
    try {
      const feedbackStore = new ProjectFeedbackStore(store.root, brain);
      if (!command) return console.log(JSON.stringify(feedbackStore.get(), null, 2));
      await brain.init(); brain.refresh();
      if (brain.getStorageHealth().lastError) throw new Error('Project memory could not be read.');
      console.log(JSON.stringify(await feedbackStore.update(command, revision === undefined ? feedbackStore.get().revision : Number(revision), 'user'), null, 2));
    } finally { await brain.shutdown(); }
  };
  feedback.command('list').argument('[directory]', 'Project directory', process.cwd()).action(directory => useFeedback(directory));
  feedback.command('record').argument('[directory]', 'Project directory', process.cwd())
    .requiredOption('--memory <id>', 'Saved memory ID').requiredOption('--task <text>', 'The task where the memory was used')
    .requiredOption('--rating <value>', 'useful, not-useful, or incorrect').requiredOption('--reason <text>', 'Observed outcome; no invented successful checks')
    .option('--evidence <reference>', 'Optional recorded evidence reference; not fetched').option('--revision <number>', 'Reject if the feedback revision has changed')
    .action((directory, opts) => useFeedback(directory, { kind: 'upsert', memoryId: opts.memory, task: opts.task,
      rating: opts.rating, reason: opts.reason, ...(opts.evidence ? { evidence: [opts.evidence] } : {}) }, opts.revision));
  feedback.command('remove').argument('<id>', 'Feedback record ID').option('--project <directory>', 'Project directory', process.cwd())
    .option('--revision <number>', 'Reject if the feedback revision has changed').action((id, opts) => useFeedback(opts.project, { kind: 'remove', id }, opts.revision));
  feedback.command('set').argument('<state>', 'on or off').option('--project <directory>', 'Project directory', process.cwd())
    .option('--revision <number>', 'Reject if the feedback revision has changed').action((state, opts) => {
      if (!['on', 'off'].includes(state)) throw new TypeError('Choose on or off.');
      return useFeedback(opts.project, { kind: 'toggle', enabled: state === 'on' }, opts.revision);
    });
}
