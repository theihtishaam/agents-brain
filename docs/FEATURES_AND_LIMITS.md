# What the installed package actually does

This page describes the 7.1.4 implementation. A configuration recipe is not proof that a host has connected. Example screenshots use isolated test projects; they never represent live customer activity.

| Feature | Working behavior | Boundary |
| --- | --- | --- |
| Project memory | Save, inspect, search, review and recall project records. | Information is not automatically fact-checked. |
| Graph | Inspect stored records and their recorded relationships. | A graph is a view of project data, not a model's neurons or private thoughts. |
| Activity | Record local MCP calls and explicitly reported host operations; inspect and replay receipts. | Timing around MCP calls measures tool execution, not the host's entire reasoning or model generation. |
| PDF knowledge | Extract text with page citations, review it, and approve pages into local memory. | Image-only pages require OCR. OCR is not included. Encrypted or invalid files report extraction failure. |
| Shared work | Multiple project-local MCP sessions can exchange messages, claim tasks, submit artifacts and acknowledge specific records. | Hosts must be connected and call the tools. Shadow Brain does not launch models or assign background workers by itself. |
| Context packs | Select scoped passages within an estimated token budget, with retrieval explanations and profile comparisons. | Pack estimates are not provider billing receipts or measured model-token savings. |
| Project skills | Inspect bounded workspace evidence, preview skill files, and apply them locally while protecting edits. | Files must be loaded by the chosen host. Their presence alone is not a live connection. |
| Learning | Propose a lesson from an outcome, record a comparison, explicitly promote it and roll it back. | Comparisons are operator-reported evidence. This does not retrain a model or autonomously prove a lesson correct. |
| Models and billing | Show unavailable values when the host does not provide usage evidence. | The package does not currently collect model identities, provider token receipts or billing costs automatically. |
| Controls | Persist feature switches and separate activity recording from activity display. | Turning off display does not erase recorded history. |

## How the release is checked

The test suite covers project boundaries, durable writes and retries, PDF page admission, competing task claims, operator-only actions, lessons, rollback, and restart recovery. A fresh package installation is checked separately, including PDF extraction and approval. Browser checks exercise the actual API-backed interface in an isolated project.

Synthetic data makes these checks repeatable. It is not inserted into a user's normal workspace. An empty project starts empty; adding real knowledge and connecting tools produces its own graph and activity.

See [the visual guide](VISUAL_GUIDE_v7.1.4.md), [connection instructions](INTEGRATIONS.md), and [troubleshooting](TROUBLESHOOTING.md).
