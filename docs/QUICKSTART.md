# Quickstart

Agent Shadow Brain 7.1.4 supports Node.js 22.12 or later in the 22.x line, 24.x, or 26 and later.

**Development guide.** Version 7.1.4 is not published. The steps below use the development checkout and its existing memory workspace. The dense shared-brain portal is a [design preview](VISUAL_GUIDE_v7.1.4.md), with backend work still planned. For the published package, use `npm install -g @theihtisham/agent-shadow-brain@latest` and its versioned documentation.

## Install and open the workspace

```bash
git clone https://github.com/theihtishaam/agents-brain.git
cd agents-brain
npm ci
npm run build
npm link
shadow-brain --version
```

`npm link` makes the development checkout the global `shadow-brain` command. If you want to keep the existing global binding, omit it and replace `shadow-brain` with `node /absolute/path/to/agents-brain/dist/cli.js` in the examples. Quote paths that contain spaces. There is no 7.1.4 release tarball to download yet. A Windows project-path CI failure remains unresolved.

## Try the isolated visual tour

```bash
shadow-brain demo workspace
```

Open the printed workspace URL. The demo uses a fresh temporary directory, synthetic memories and recorded relationships. Its periodic calls run through the local MCP handler and produce measured telemetry; they are scripted examples, not connected coding agents. No provider or existing client configuration is needed. Changes affect the demo only. Press **Ctrl+C** to close the service and remove its temporary data.

Add `--port 7341` to choose a port, or `--no-activity` to keep the initial event snapshot still. The separate, older `shadow-brain demo` action is retained; use **`demo workspace`** for this isolated tour.

![Demo workspace and source coverage](assets/7.1.4-overview.png)

Select **Checkout API · demo**, open **Context Lab**, and try `Fix checkout retryBudgetPolicy`. Use **Compare profiles** to inspect the legacy and adaptive selections. Open **Graph** to follow a recorded relationship, then open its memory and review the source references.

![Context Lab](assets/7.1.4-context-lab.png)

## Open your project workspace

From your project directory, start the persistent local portal.

```bash
shadow-brain project workspace .
```

Open the address printed by the CLI; the port is selected automatically unless you pass `--port`. **Project Kit** shows observed stack markers, lets you add knowledge, and previews skills for your requirement. Saved files stay in the project after the portal closes. Select **Live** for recorded calls from its matching MCP launch. [Project Kit walkthrough](PROJECT_KIT.md)

```bash
shadow-brain project knowledge . --title "Import retries" --content "Reuse the original request ID when retrying an import." --source "docs/imports.md"
shadow-brain context-pack "import retry request ID" --project . --db .shadow-brain/project-memory.json --profile adaptive --json
shadow-brain project config . --target codex
```

Merge the printed recipe into your host settings. It pins the host to the same project and memory file. In Project Kit, describe your requirement, choose the client, preview the generated skill and apply it locally. After actual work, use **Memory outcomes** to record useful or unsuccessful memory reuse. [Learning controls](LEARNING.md)

Existing shared-store users can continue with `shadow-brain dash . --no-analysis`; its default port is 7341. The project portal does not merge or migrate that store.

## Build a context pack

In another terminal at the project root, assemble context for a task.

```bash
shadow-brain context-pack "import retry behavior" --project . --profile adaptive --token-budget 1200 --json
```

The JSON includes selected memories, recorded references, exclusion reasons, and an adaptive retrieval report. Without `--profile adaptive`, CLI calls keep the established legacy behavior. In **Context Lab**, copy or download the selected Markdown. Token usage is estimated. A project needs saved memories for the pack to include them.

## Save a first memory in a scratch project

From the built source checkout, run `npm pack` to create a local development tarball. This does not publish it. Create an empty scratch directory, enter it, and install that local file for this example.

```bash
npm init -y
npm install /path/to/agents-brain/theihtisham-agent-shadow-brain-7.1.4.tgz
```

Create `retry-notes.md` with this decision. Retried imports should reuse the same request ID so a timeout cannot create a duplicate import.

Save the following as `first-memory.mjs`. It writes one example record to `.shadow-brain/quickstart.json` in this directory.

```js
import { resolve } from 'node:path';
import { getGlobalBrain } from '@theihtisham/agent-shadow-brain';

const brain = getGlobalBrain({ dbPath: resolve('.shadow-brain/quickstart.json') });
await brain.init();

try {
  const projectName = 'Import retry example';
  const projectId = brain.registerProject(process.cwd(), projectName);
  const id = brain.writeSync({
    projectId,
    projectName,
    agentTool: 'codex',
    category: 'decision',
    content: 'Retried imports should reuse the same request ID to prevent duplicates.',
    importance: 0.8,
    metadata: { sources: ['retry-notes.md'] },
  });
  await brain.sync();
  console.log(id);
} finally {
  await brain.shutdown();
}
```

Run it and ask for context from that same memory file.

```bash
node first-memory.mjs
shadow-brain context-pack "import retry request ID" --project . --db .shadow-brain/quickstart.json --profile adaptive --token-budget 600 --json
shadow-brain memory-health --project . --db .shadow-brain/quickstart.json
```

The result includes the example decision and its recorded source. Use the CLI or library to inspect the scratch memory file, and use the dashboard for the default workspace store.

## Connect an MCP client

```bash
shadow-brain clients config --target codex --project .
```

Merge the generated recipe into the host's settings. The command only prints a recipe. It uses an absolute Node executable and installed CLI path to launch the standalone service. Other targets are `claude-code`, `opencode`, `deepseek-harness`, and `portable`; omit `--target` for the original generic launch object. To use your scratch memory from the example, append `--db` and its absolute path to the launch arguments. Ask the connected host for `context_pack` with an explicit project ID and `profile: "adaptive"`. Confirm the result in the host. To see matching calls in a portal, use the project-local store and `project config` recipe above. [Client setup guide](INTEGRATIONS.md)

![Integration recipes](assets/7.1.4-integrations.png)

## Add project skills

Choose your client’s target and preview the installation. Apply it when the listed project files are the ones you want.

```bash
shadow-brain skills list
shadow-brain skills install . --target codex
shadow-brain skills install . --target codex --apply
```

The other targets are `claude-code`, `opencode`, `deepseek-harness`, and `portable`. [Client layouts and skill discovery](WORKFLOW_INTEGRATION.md#choose-a-client-and-install)

[Documentation index](README.md) · [Project README](../README.md)
