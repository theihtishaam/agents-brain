import { Command } from 'commander';
import * as path from 'node:path';
import { getGlobalBrain, GlobalBrain } from './brain/global-brain.js';
import { assembleContext } from './brain/context-assembly.js';
import { FeatureSettingsStore, FEATURE_DEFINITIONS } from './brain/feature-settings.js';
import { memoryAnnotationsFor } from './brain/memory-annotations.js';
import { parseContextRequest } from './brain/context-request.js';
import { inspectMemoryHealth } from './brain/memory-inspection.js';
import { ProjectFeedbackStore } from './brain/project-feedback.js';
import { resolveProjectStore } from './brain/project-memory.js';
import { ProjectPolicyStore } from './brain/project-policy.js';
import { enforceProjectContext } from './brain/project-policy-delivery.js';

export function registerContextCommands(program: Command): void {
  program.command('context-pack').description('Build a bounded, explained project context pack without model calls')
    .argument('[query]', 'Current task or search terms', '')
    .option('--project <directory>', 'Project directory', process.cwd())
    .option('--project-id <id>', 'Use an existing memory project ID directly')
    .option('--db <path>', 'Explicit memory-store path')
    .option('--settings <path>', 'Explicit feature-settings file')
    .option('--token-budget <number>', 'Approximate token budget, including the rendered context', '2000')
    .option('--max-entries <number>', 'Maximum selected memories, 1 to 30')
    .option('--cross-project', 'Request broader context when the feature is enabled')
    .option('--profile <name>', 'Retrieval profile: legacy or adaptive', 'legacy')
    .option('--no-related', 'Disable recorded one-hop expansion in adaptive retrieval')
    .option('--json', 'Print entries, exclusions, reasons, and budget as JSON')
    .action(async (query: string, opts) => {
      const tokenBudget = Number(opts.tokenBudget);
      if (!Number.isSafeInteger(tokenBudget) || tokenBudget < 0 || tokenBudget > 12000) throw new TypeError('Token budget must be an integer from 0 to 12000.');
      const local = resolveProjectStore(opts.project, opts.db);
      const request = parseContextRequest({ projectId: opts.projectId ?? local?.projectId ?? GlobalBrain.projectIdFor(path.resolve(opts.project)),
        query, tokenBudget, maxEntries: opts.maxEntries === undefined ? undefined : Number(opts.maxEntries),
        includeCrossProject: !!opts.crossProject, profile: opts.profile, expandRelated: opts.related });
      if (local && (request.projectId !== local.projectId || request.includeCrossProject)) {
        throw new TypeError('This memory store is pinned to its local project.');
      }
      const dbPath = local?.storagePath ?? (opts.db ? path.resolve(opts.db) : undefined);
      const brain = getGlobalBrain(dbPath ? { dbPath } : undefined);
      const settings = new FeatureSettingsStore({ filePath: opts.settings ?? local?.settingsPath ?? (dbPath ? path.join(path.dirname(dbPath), 'feature-settings.json') : undefined) });
      const features = settings.get().features;
      try {
        if (features.contextAssembly) brain.refresh();
        const options = {
          ...request, features,
          feedback: features.contextAssembly && local && request.profile === 'adaptive' ? new ProjectFeedbackStore(local.root, brain).get() : undefined,
          annotations: features.contextAssembly ? memoryAnnotationsFor(brain).get() : undefined,
        };
        const pack = assembleContext(brain, local
          ? enforceProjectContext(local.root, brain, new ProjectPolicyStore(local.root, local.projectId).get(), options) : options);
        if (opts.json) console.log(JSON.stringify(pack, null, 2));
        else {
          console.log(pack.markdown || (pack.enabled ? 'No matching context fits this request and budget.' : 'Context packs are disabled in feature settings.'));
          for (const warning of pack.warnings) console.log(`Note: ${warning}`);
        }
      } finally { await brain.shutdown(); }
    });

  program.command('memory-health').description('Inspect scoped source, review, duplication, age, and relationship attention hints without model calls')
    .option('--project <directory>', 'Project directory', process.cwd())
    .option('--project-id <id>', 'Use an existing memory project ID directly')
    .option('--db <path>', 'Explicit memory-store path')
    .option('--limit <number>', 'Maximum attention items, 1 to 100', '30')
    .action(async opts => {
      const local = resolveProjectStore(opts.project, opts.db);
      if (local && opts.projectId && opts.projectId !== local.projectId) throw new TypeError('This memory store is pinned to its local project.');
      const dbPath = local?.storagePath ?? (opts.db ? path.resolve(opts.db) : undefined);
      const brain = getGlobalBrain(dbPath ? { dbPath } : undefined);
      try {
        brain.refresh();
        console.log(JSON.stringify(inspectMemoryHealth(brain, memoryAnnotationsFor(brain).get(), {
          projectId: opts.projectId ?? local?.projectId ?? GlobalBrain.projectIdFor(path.resolve(opts.project)), limit: Number(opts.limit),
        }), null, 2));
      } finally { await brain.shutdown(); }
    });

  const features = new Command('features').description('Inspect or change the dedicated runtime feature controls');
  features.command('list').option('--settings <path>', 'Explicit feature-settings file').action((opts) => {
    console.log(JSON.stringify({ ...new FeatureSettingsStore({ filePath: opts.settings }).get(), definitions: FEATURE_DEFINITIONS }, null, 2));
  });
  features.command('set').argument('<name>', 'Feature ID from features list').argument('<state>', 'on or off')
    .option('--settings <path>', 'Explicit feature-settings file').action(async (name: string, state: string, opts) => {
      if (!['on', 'off'].includes(state)) throw new TypeError('Choose on or off.');
      console.log(JSON.stringify(await new FeatureSettingsStore({ filePath: opts.settings }).update({ [name]: state === 'on' }), null, 2));
    });
  program.addCommand(features);
}
