# Troubleshooting

## The Hub says Workspace unavailable

Keep the launcher running and open the current URL. If an older tab points to a stopped server, start the same project on the same port and refresh. A port of `0` can change each time.

```bash
cd your-project
shadow-brain project workspace . --port 62595
```

Open `http://127.0.0.1:62595/hub`. The status endpoint at `/api/workspace/status` reports the process instance, workspace mode, project scope, and storage health. A reachable server can report a storage error separately. Resolve the storage error before making changes and retain the existing project files. If the port is already in use, check the existing launcher or start on a free port and use the new address.

## The installed version differs from this guide

This guide describes the 7.1.4 build. It requires Node.js 22.13+ in the 22.x line, 24.x, or 26+.

```bash
node --version
npm install -g @theihtisham/agent-shadow-brain@latest
shadow-brain --version
```

If the command still reports the previous version, locate it with `Get-Command shadow-brain -All` in PowerShell or `command -v shadow-brain` in your shell. Restart the launcher after changing versions. A browser refresh alone continues using the old process.

## The graph or journal is empty

Check the selected project. Save a knowledge record or approve a PDF page to create a graph record. Connect a host using the recipe generated from the same project directory. In **Setup**, enable **Live dashboard activity** and **Record agent activity**. Ask the host to call `project_inspect` or `context_pack`, then look for the event. A reachable workspace and installed skill files are independent of host tool activity.

## A feature setting or claim changed elsewhere

Refresh to read the current revision before retrying. For a task claim, check its owner and lease. After a network failure, retry the same input to reuse the operation key. The work room and journal use different stores and can be inspected independently.

## A PDF page has no text

Image-only pages require OCR. The current Hub extracts a text layer and labels missing text. Upload a text-searchable PDF or save a verified excerpt as explicit project knowledge with its reference.

## A context pack is empty or shorter than expected

Check that the selected project contains relevant active memories, the context feature is enabled, and the token budget allows an excerpt. Try specific project terms. Context estimates describe the rendered pack. Model usage stays unavailable when the host supplies no usage receipts.

[Quickstart](QUICKSTART.md) · [Workspace guide](WORKSPACE.md) · [Integrations](INTEGRATIONS.md)
