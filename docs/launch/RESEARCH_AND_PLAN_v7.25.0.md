# Design and verification for 7.25.0

## What must work for someone switching tools

A user enters a project fact in everyday language. One connected agent retrieves it with a citation, saves a checkpoint, and a different agent can continue from the checkpoint in the same workspace. The dashboard should show which steps happened and let the user stop sharing immediately.

## What the earlier releases established

| Release | Design precedent carried forward |
| --- | --- |
| [6.x dashboard](RELEASE_NOTES_v6.md) | The dashboard put live signals next to detailed inspection. The current Overview gives transport and memory distinct places on the same screen. |
| [7.2.0 workspace](RELEASE_NOTES_v7.2.0.md) | A task and project scope determine a bounded context pack. Retained source provenance and budget explanations are part of the output. |
| [7.22.0 Brain Hub](RELEASE_NOTES_v7.22.0.md) | Explicit session checkpoints, scoped host access, and activity receipts separate saved work, live transport, and host-reported progress. |
| [7.22.2 package and attribution](RELEASE_NOTES_v7.22.2.md) | Keep repository and creator links visible at entry points. The distribution stats badge stays dynamic. |

## What the interfaces actually expose

| Question | Evidence available to the workspace | Product decision |
| --- | --- | --- |
| Is a tool installed? | The process can find a known launcher or VS Code extension directory. A portable installation may live elsewhere. | Show the specific evidence or an incomplete-scan state. [VS Code extensions](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace) |
| Can the host be configured here? | Each host defines its own project config format and trust flow. Several hosts share a format or use a profile-level setting. | Offer project setup for five host families and manual recipes for three. Preserve files managed elsewhere. [Host matrix and primary sources](../INTEGRATIONS.md) |
| Is the tool connected and doing work? | A client initializes an MCP transport. A request and the completed operation produce distinct observations. One transport can remain idle for a long time. | Maintain an expiring presence record. Animate a direction only when a fresh local exchange arrives. Show host-reported phases when supplied. [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture) |
| What did the next tool learn? | A request can retrieve approved passages and a handoff can refer to a specific saved checkpoint. | Return bounded cited Markdown. Expose source links, retrieval settings and handoff provenance in the portal. [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) |
| What is happening across projects? | Each explicitly registered project has its own presence records, session reports and task outcomes. Codex can expose bounded thread index metadata for a selected root. | List the registered projects and show the source of each observation. Count completed recorded tasks when a total exists. Native index state and MCP transport presence stay independently visible. |
| Can we measure traffic, tokens and cost? | Shadow Brain can count the arguments and returned text at its own tool boundary. Model usage depends on a host providing a receipt. | Plot payload bytes per observed exchange, show the coverage of host token reports, and label local context estimates separately. |

## Implementation order and acceptance checks

1. **One project, multiple clients.** Pin each generated launch command to the selected directory and store. Save a fact and retrieve it through a second process. Exercise a foreign project, a private conversation and a disabled tool.
2. **User-controlled onboarding.** Support bounded discovery and opt-in setup. Check existing configuration, disable an individual host while connected, pause the entire project, then restore participation. Recheck a stale browser revision.
3. **Readable live telemetry.** Place current and historical tools around the shared brain. Retain directional text with reduced motion. A displayed memory dot identifies a stored record. A measured returned ID can highlight that dot without implying every stored memory was sent.
4. **Task-focused context.** Look up a selected file in Context, inspect citations and compare exact UTF-8 payload sizes. Use explicit source and memory identifiers to count the same question’s citations from four clients across isolated and shared stores. [Reproducible comparison](../VISUAL_GUIDE_v7.25.0.md#four-facts-two-setups)
5. **Three independent projects in one portfolio.** Open three empty projects at once. Save a note from one host and retrieve it from another in the same project. Confirm the two other projects have zero matches. Resume the saved checkpoint in a second process, complete a recorded task, and verify its portfolio outcome. Restart, disable participation, and forget the project. Reopening it should preserve its local data and keep it absent from the directory.
6. **Usable delivery.** Verify actual stdio exchanges, desktop and narrow viewports, keyboard controls, historical data, disabled recording and the packaged entrypoint. Use a controlled fixture for public captures. Run `npm run test:workspace-memory` for a separate three-project acceptance receipt. [Visual walkthrough](../VISUAL_GUIDE_v7.25.0.md) · [Acceptance runner](../../tools/verify-workspace-memory.mjs)

## Runtime choices

The workspace runs locally with the project's Node process. The cortex image ships in the package. Event-driven updates reuse the existing loopback stream and activity journal. The chart uses at most 16 measured exchanges. Directory listings are paginated. Discovery results are cached for one minute, and automatic configuration requires a saved opt-in. Setup checks known install locations and project configuration metadata. Host trust, original chats and unpublished model telemetry remain under the host’s control.
