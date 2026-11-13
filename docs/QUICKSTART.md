# Quickstart

This guide covers the 7.1.4 Brain Hub. Use Node.js 22.13 or later in the 22.x line, 24.x, or 26 and later.

## Install and open a project

```bash
npm install -g @theihtisham/agent-shadow-brain@latest
shadow-brain --version
cd your-project
shadow-brain project workspace . --port 62595
```

Check that the CLI prints `7.1.4` for these steps. Keep the command running and open [the Brain Hub](http://127.0.0.1:62595/hub). The process writes project data inside the selected project’s `.shadow-brain` directory. On restart, run the same command from the same project directory. If you use `--port 0`, open the URL printed by the current process.

From a source checkout, use `npm ci` and `npm run build`, then replace `shadow-brain` with `node dist/cli.js` from the checkout. Pass the intended project directory as the workspace argument.

![Running Brain Hub control room](assets/7.1.4-hub-control-room.png)

## Add your first evidence

1. In **Knowledge**, save explicit project knowledge or upload a PDF.
2. For a PDF, open an extracted page, read its citation, and approve the page you want to retrieve later. Scanned pages show that OCR is needed.
3. Open **Brain overview** and select a record. The node list offers the same selection with a keyboard.
4. In **Context**, describe the task and set a token budget. Build a pack or compare profiles, review selected sources, then copy the pack.

![Approved source page and extracted citation](assets/7.1.4-hub-knowledge.png)

## Connect a host

```bash
shadow-brain project config . --target codex
shadow-brain skills install . --target codex
```

Merge the recipe into the selected host’s configuration. Preview the skill-file changes, then use `--apply` if you want them. Reconnect the host and confirm it can call a tool such as `project_inspect` or `context_pack`. Host file presence, recorded activity, and model evidence are shown separately. [Supported client recipes](INTEGRATIONS.md)

## Explore shared work

Create a room in **Collaboration**, add a task, and record a proposal or critique. A participant can claim the task, attach a project-relative artifact, and record a result. **Learning** turns recorded outcomes into candidates with explicit evaluation and promotion. [Workspace guide](WORKSPACE.md)

The classic workspace at `/workspace` provides detailed memory review, context selection, and retrieval feedback. `/live` opens the detailed journal. `shadow-brain demo workspace --port 0` runs a separate synthetic tour.

[Visual guide](VISUAL_GUIDE_v7.1.4.md) · [Troubleshooting](TROUBLESHOOTING.md)
