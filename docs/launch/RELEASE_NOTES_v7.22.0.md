# Agent Shadow Brain 7.22.0

Release date: 2026-11-14. See the [verification record](RELEASE_ACCEPTANCE_v7.22.0.md) for tested behavior and integration boundaries.

This release makes project knowledge easier to add, trace, share and correct. Save ordinary notes directly with **Add to memory**, or review longer notes and optional document imports before sharing them. Pending and rejected review items remain outside shared retrieval.

## Knowledge and learning

- Paste a short fact or paragraph and save it with one click, retaining its original evidence and retry identity. Longer notes offer section review, correction and selective approval.
- Import text PDFs, knowledge JSON and simple transcript JSON. The source review keeps speaker attribution, original text, exact page or item locator, fingerprint and approved corrections.
- Inspect source evidence through the portal or the read-only `memory_evidence` MCP tool.
- Rate a retrieved memory for a task. Bounded feedback affects matching future queries; users can pause or remove this influence.
- Follow a lesson back to its recorded outcome and reported comparison. Promotion and rollback remain explicit.

## Shared memory and handoffs

- Already-running independent project MCP servers refresh their read view before ordinary recall.
- Archived, contested and superseded records are excluded before project recall ranking. Audit views retain the historical record.
- `hub_artifact_read` retrieves the saved immutable UTF-8 artifact by room, artifact ID and SHA-256. It does not reread a changed workspace file.
- Duplicate collapse preserves conservative feedback attribution, and a supplied query without searchable terms no longer falls back to unrelated recent memories.

## Portal and usage

- The brain-shaped graph lays out actual stored records, with depth cues, quieter membership links, recorded relationship filters, search, pan, zoom and reduced motion.
- Observed client exchanges remain visible even when the memory graph is empty. Replay does not silently switch to a newer event after the selected record expires.
- Context shows candidates, selection reasons, exclusions, source navigation and the actual added/removed/shared records in a comparison.
- Cooperating hosts can send optional `usage_report` receipts. Input and output totals remain distinct from cached and reasoning subsets. Missing counts remain unknown and receipts stay labelled host-reported.
- Legacy model routes no longer discover host configuration files automatically, expose saved credential fields in JSON, or claim a successful provider test without testing it.

## Compatibility and limits

Existing project memory and ActivityJournal v1 remain compatible. New source and usage records live in separate project-local SQLite stores. No external database service or model download is required. Feature data is bounded and project scoped.

Text organization is deterministic; it is not a separate model interpreting every paragraph. The connected agent reasons over the reviewed context it requests. Learning adapts stored memory and retrieval; it does not train model weights. Scanned PDFs need OCR, which is not included. Model reports do not establish billing or independently prove a proxy's upstream model. Native application connectivity requires that application's configuration and active use of the tools.

## Conversation continuity

Connected tools can register project sessions, report progress, save immutable checkpoints and continue another tool's checkpoint in a new agent-owned session. History is paged and bounded; old checkpoints keep their exact digest. Imported conversation snapshots preserve original IDs, available titles, workspace identity and source locators. A changed export becomes a linked snapshot rather than overwriting the original.

The optional Codex history connection starts only after **Connect**. It uses the installed app-server's read interface, scopes the list to the current project, supports archived conversations and reads selected history in pages. Other supported tools use selected native exports. These interfaces do not reopen another application's native tab or transfer hidden model state.

## Live updates and control

The portal receives bounded pushed invalidations from local stores, with reconnect and polling fallback. Optional file activity reports safe project-relative file metadata; a filesystem event alone cannot identify the editing agent. Graph motion follows observed activity and can be paused.

Project controls set tool participation, conversation sharing, coordination roles and context ceilings. Excluded conversations and their explicitly linked evidence are withheld from subsequent agent delivery, including inherited handoffs. Client labels are cooperative controls, not authenticated enterprise access control. Information already received by another process cannot be recalled.

Project Kit skills with intact ownership receipts can be disabled, restored or removed through an exact preview. Edited and unmanaged files remain protected. Disabling a skill changes future file discovery; a host may need to reload to discard instructions already in its context.

See the [research and acceptance plan](RESEARCH_AND_PLAN_v7.22.0.md), [source intake guide](../SOURCE_INTAKE.md), [sessions guide](../SESSIONS.md), and [visual guide](../VISUAL_GUIDE_v7.22.0.md).
