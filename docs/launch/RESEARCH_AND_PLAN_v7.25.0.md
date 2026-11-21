# Design and verification for 7.25.0

## What must work for someone switching tools

A user enters a project fact in everyday language. One connected agent retrieves it with a citation, saves a checkpoint, and a different agent can continue from the checkpoint in the same workspace. The dashboard should show which steps happened and let the user stop sharing immediately.

## What the interfaces actually expose

| Question | Evidence available to the workspace | Product decision |
| --- | --- | --- |
| Is a tool installed? | The process can find a known launcher or VS Code extension directory. A portable installation may live elsewhere. | Show the specific evidence or an incomplete-scan state. [VS Code extensions](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace) |
| Can the host be configured here? | Each host defines its own project config format and trust flow. Several hosts share a format or use a profile-level setting. | Offer project setup for five host families and manual recipes for three. Preserve files managed elsewhere. [Host matrix and primary sources](../INTEGRATIONS.md) |
| Is the tool connected and doing work? | A client initializes an MCP transport. A request and the completed operation produce distinct observations. One transport can remain idle for a long time. | Maintain an expiring presence record. Animate a direction only when a fresh local exchange arrives. Show host-reported phases when supplied. [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture) |
| What did the next tool learn? | A request can retrieve approved passages and a handoff can refer to a specific saved checkpoint. | Return bounded cited Markdown. Expose source links, retrieval settings and handoff provenance in the portal. [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) |
| Can we measure traffic, tokens and cost? | Shadow Brain can count the arguments and returned text at its own tool boundary. Model usage depends on a host providing a receipt. | Plot payload bytes per observed exchange, show the coverage of host token reports, and label local context estimates separately. |

## Implementation order and acceptance checks

1. **One project, multiple clients.** Pin each generated launch command to the selected directory and store. Save a fact and retrieve it through a second process. Exercise a foreign project, a private conversation and a disabled tool.
2. **User-controlled onboarding.** Support bounded discovery and opt-in setup. Check existing configuration, disable an individual host while connected, pause the entire project, then restore participation. Recheck a stale browser revision.
3. **Readable live telemetry.** Place current and historical tools around the shared brain. Retain directional text with reduced motion, distinguish reported phases and filesystem events, and let the user inspect a measured exchange from the graph.
4. **Task-focused context.** Look up a selected file in Context, inspect citations and compare retrieval payloads. Use explicit source and memory identifiers to score the same question from four clients across isolated and shared stores. [Reproducible comparison](../VISUAL_GUIDE_v7.25.0.md#four-facts-two-setups)
5. **Usable delivery.** Verify real stdio exchanges, desktop and narrow viewports, keyboard controls, historical data, disabled recording and a fresh packaged installation. The [visual walkthrough](../VISUAL_GUIDE_v7.25.0.md) identifies the inputs used for each capture.

## Runtime choices

The workspace runs locally with the project's Node process. The cortex image ships in the package. Event-driven updates reuse the existing loopback stream and activity journal. The chart uses at most 16 measured exchanges. Directory listings are paginated. Discovery results are cached for one minute, and automatic configuration requires a saved opt-in. Setup checks known install locations and project configuration metadata. Host trust, original chats and unpublished model telemetry remain under the host’s control.
