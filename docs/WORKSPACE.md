# Workspace guide

Start a project-local Brain Hub from your project directory.

```bash
shadow-brain project workspace . --port 62595
```

Open [the project Hub](http://127.0.0.1:62595/hub). Keep the process running and reuse the same directory and port after restarting. `/workspace` opens the classic memory workspace; `/live` opens detailed activity diagnostics. The shared-store `shadow-brain dash . --no-analysis` opens an all-project view. Project-local PDF review, rooms, skills, and lesson promotion require the project workspace.

![Running Brain Hub with stored memories and observed tool exchanges](assets/7.22.0-hub-graph.png)

## Inspect records and activity

Select a project, agent, or memory node. **Find node** lists the displayed graph records and searches stored memories in the selected scope. Selecting a search result brings the exact record into the graph even when it falls outside the current sample. Use **+**, **−**, and **Fit** to adjust the view, or drag the zoomed canvas with a pointer. The relationship filters show project membership, recorded authors, or explicit memory links. The inspector shows the record, its recorded sources, and its links.

**MCP exchanges** shows recent measured client sessions even in a project with no stored memories. The request arrow points from client to workspace. The result arrow points from workspace to client when a handler completes, with the outcome shown on the receipt. A result-ready event records tool completion. Model consumption is unobserved. Select a lane, or open **Trace** and choose a journal record. The inspector links an exact matching request or result when both are retained in the loaded history. **Latest** returns to incoming activity. **Pause motion** and reduced-motion settings keep the display still.

## Review and use knowledge

Use **Knowledge** to write an ordinary fact, paragraph or plan and click **Add to memory**. For longer notes or corrections, choose **Review first**. Optional PDFs provide extracted pages with source citations; image-only pages require OCR. You can also inspect project markers or preview and apply a project skill. [Plain-text guide](SOURCE_INTAKE.md) · [Project Kit](PROJECT_KIT.md)

Use **Context** to enter a task, set a budget, compare profiles, and copy a pack. Review selected passages, reasons, and citations. The pack size is estimated. Tool timings and model token receipts are separate, and unavailable receipts stay visibly unavailable. [Context Lab](CONTEXT_LAB.md)

## Share a task and its evidence

Create or open a **Collaboration** room. Post a proposal, critique, question, decision, or handoff. Add a task and claim it before attaching a project-relative file. The task’s lease and revision control ownership. Accept the current submitted artifact and record the result with its check and evidence. A participant can acknowledge another participant’s message or artifact. These operations are shared with project-local MCP clients. [Workflow integration](WORKFLOW_INTEGRATION.md)

In **Learning**, propose a lesson from a recorded outcome. Record the baseline, candidate, controls, and evidence. Promotion is an explicit operator action. Rollback archives the promoted memory so it no longer influences normal retrieval. Use the classic workspace to manage separate task-scoped retrieval feedback. [Learning guide](LEARNING.md)

## Change runtime controls

In **Setup**, manage context packs, activity display, and activity recording. The project portal stays pinned to its project, so cross-project context is unavailable here. Automatic briefing requires a legacy analysis session. Feature changes are revisioned and persist when the local process restarts. Disabling the activity display hides journal records in the Hub. Disabling recording stops new optional telemetry. Work-room records remain available.

**Project sharing** lets you set context ceilings, control tool participation, and turn off delivery for a conversation. An unshared chat and its inherited handoffs remain available for operator audit. Memories with explicit provenance linking them to that conversation are removed before retrieval ranks or merges candidates. Older memories without that linkage cannot be associated automatically. Tool limits follow the MCP client label; roles are coordination labels. **Context** previews the same limits, including its reference comparison.

Setup can print native client recipes and diagnostic text. Recipes point to the selected local installation and store. To confirm the host actually uses the same project, call one of its project tools and inspect the journal. [Integrations](INTEGRATIONS.md)

The project Hub uses a local event stream for store changes while the tab is visible. **Polling fallback** appears if the stream disconnects. A reconnect can replay retained notices or refresh the current snapshot when the replay window has expired. Earlier records do not start fresh activity animations.

Turn on **Project file activity** in Setup to see eligible relative paths and grouped filesystem notifications in **Sessions**. Watching runs while there is an open live subscription and both live display and recording are enabled. The watcher skips hidden, private, configuration, dependency, and build paths, and does not open file contents. It caps directory watches at 64 and shows at most 180 project paths and the 24 latest groups in the panel. File changes have an unknown actor. A grouped notification only establishes that the filesystem reported a change.

A local Windows fixture measured 30 writes through to the visible Chrome page. Ten independent MCP memory writes, ten session API writes, and ten allowed file creates delivered in 241 ms median and 386 ms p95, with an 888 ms maximum. Over 60 seconds idle on the same fixture and Node 24.15.0, workspace RSS moved from 82.33 to 82.21 MiB, average server CPU was 0.365% of one core, and the open Sessions page made no workspace API refetches.

[Visual guide](VISUAL_GUIDE_v7.22.0.md) · [Troubleshooting](TROUBLESHOOTING.md)
