# What the installed package actually does

This page describes Agent Shadow Brain 7.25.0. Setup shows installation evidence, project configuration, admission and current connections separately. The screenshots use isolated test projects.

| Feature | Working behavior | Boundary |
| --- | --- | --- |
| Project memory | Save, inspect, search, review and recall project records. | Information is not automatically fact-checked. |
| Graph | Inspect stored records and their recorded relationships. | A graph is a view of project data, not a model's neurons or private thoughts. |
| Activity | Record local MCP calls and explicitly reported host operations; inspect and replay receipts. | Timing around MCP calls measures tool execution, not the host's entire reasoning or model generation. |
| Tool and connection panel | Inspect local tool icons, registered sessions, reported model/effort details and initialized MCP connection heartbeats. | A current transport lease does not prove model generation or native application availability. It expires after thirty seconds without renewal. |
| Host discovery and setup | Detect eight host families, prepare five kinds of project configuration, and copy recipes for the other three. Automatic setup requires opt-in. | Host approval and reload depend on the application. See the [compatibility matrix](INTEGRATIONS.md). |
| Payload traffic | Show the latest 16 matched, measured project exchanges with argument and return-text byte counts. Select a column to open its receipt. | Older receipts can lack byte measurements. Network framing and model token consumption have separate semantics. |
| Files | Browse the project directory on demand and use a relative path as a Context query. | Coverage excludes protected files, links and entries beyond the scan limits. |
| Shared project brief | Any participating project client can call `project_brief` for cited task-specific Markdown. | The host chooses whether to request and use the brief. Context ceilings and conversation sharing apply. |
| Plain-language memory | Paste a fact or short note and save it directly, retaining the original evidence. Review longer notes or optional file imports. | The connected agent reasons over requested context. A fact is stored reference material, not model training. |
| Sessions and handoffs | Keep reported history and immutable checkpoints. Another connected agent can resume the checkpoint in a new linked session. | This transfers recorded work, not private reasoning, a running process or native application state. |
| Original conversations | Preserve available original titles, IDs, workspace and locators from Codex, Claude Code, OpenCode and Harness exports. Optionally connect Codex's scoped history API. | Codex lists indexed project conversations; coverage depends on the installed app-server. Other tools use selected exports. Missing titles stay unknown. |
| PDF knowledge | Extract text with page citations, review it, and approve pages into local memory. | Image-only pages require OCR. OCR is not included. Encrypted or invalid files report extraction failure. |
| Shared work | Multiple project-local MCP sessions can exchange messages, claim tasks, submit artifacts and acknowledge specific records. | Hosts must be connected and call the tools. Shadow Brain does not launch models or assign background workers by itself. |
| Context packs | Select scoped passages within an estimated token budget, with retrieval explanations and profile comparisons. | Pack estimates are not provider billing receipts or measured model-token savings. |
| Project skills | Inspect bounded workspace evidence, preview and apply local skills. Disable, restore or remove files with verified Project Kit ownership. | Edited or unmanaged files remain protected. A host may retain instructions already loaded until it reloads. |
| Learning | Propose a lesson from an outcome, record a comparison, explicitly promote it and roll it back. | Comparisons are operator-reported evidence. This does not retrain a model or autonomously prove a lesson correct. |
| Models and usage | Retain explicit host-reported model and token counters; show field coverage and distinguish cached/reasoning subsets. | No automatic provider capture or price calculation. Receipts are bounded, not a lifetime bill. |
| Controls | Persist features, tool participation, chat sharing, context ceilings and coordination roles. Delivery exclusions follow explicit provenance and handoff ancestry. | Client labels are not authenticated identities. Roles do not grant privileges. Unlinked knowledge cannot be attributed to a chat by guessing, and already delivered context cannot be recalled. |
| Live changes | Push bounded store invalidations; optionally observe safe project file metadata. | Tool activity must be observed or reported. A filesystem event alone does not identify its author. Native history metadata polls every ten seconds while its view is open. |

## How the release is checked

The test suite covers project boundaries, durable writes and retries, PDF page admission, competing task claims, operator-only actions, lessons, rollback, and restart recovery. A fresh package installation is checked separately, including PDF extraction and approval. Browser checks exercise the actual API-backed interface in an isolated project.

Synthetic data makes these checks repeatable. It is not inserted into a user's normal workspace. An empty project starts empty; adding real knowledge and connecting tools produces its own graph and activity.

See [the visual guide](VISUAL_GUIDE_v7.25.0.md), [connection instructions](INTEGRATIONS.md), and [troubleshooting](TROUBLESHOOTING.md).
