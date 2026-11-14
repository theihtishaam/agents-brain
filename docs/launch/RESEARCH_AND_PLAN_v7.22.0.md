# Agent Shadow Brain 7.22.0: shared project evidence, native conversations and a working Brain Hub

Prepared and expanded 2026-11-14. Research and planning: Astra. Source audits: GPT-6.1 SoL Ultra workers. Implementation workers may use GPT-6.1 SoL or Terra, as requested. The user's latest version is **7.22.0**, superseding the unpublished 7.21.0 candidate. Release remains on hold until the native-conversation scope and final acceptance checks are complete. This document distinguishes proposed contracts, implemented behavior and independently observed evidence; it is not a release certificate.

The coordinating agent reports baseline commit `d422de4`, preserving the prepared npm-statistics work and setting the earlier candidate's version strings to 7.21.0. Root owns the new package/source version change. The prior 7.1.4 research, Project Kit, learning, PDF intake, rooms, and Brain Hub are the functional baseline. Older documents with a 7.2.0 heading describe an earlier development sequence and are not proof of a new published version. The Agent Brain experience takes priority over download statistics.

## Release outcome

Make the existing dense Brain Hub useful for answering four concrete questions:

1. What did each host request, what completed, and what evidence is missing?
2. Which model and token counts did a host actually report, and which figures are only context estimates?
3. Why was each memory selected or omitted, and can I inspect its original reviewed project source?
4. Does another already-running host see newly approved knowledge and stop retrieving a rolled-back lesson?

Keep the recognizable animated brain and make it visibly denser and volumetric in the lateral brain silhouette shown in the user's references. Make its interactions and data more informative rather than adding unrelated modules. The expanded scope has seven connected workstreams, including explicit JSON/transcript intake, immutable cross-agent artifact handoffs, resumable reported sessions and near-real-time project activity. No claims of superior reasoning, automatic factual verification, universal host capture, or benchmark leadership are justified by this work.

## Current source findings

| Finding | Evidence in this checkout | Consequence |
| --- | --- | --- |
| Browser project-hub writes attempt to record a return without duration | `src/dashboard/workspace-api.ts:124-137`; `src/brain/activity-journal.ts:131-138` requires duration on every `tool-end` | The append rejects and the catch hides it. The portal can show starts without their matching returns. |
| Warm raw MCP recall does not refresh or apply current curation | `src/brain/mcp-server.ts:432-458`; compare `handleContextPack` and `refreshMemoryView` | Another process's new memory can be absent, while archived/rolled-back knowledge can remain in raw retrieval. Reproduce before changing compatibility semantics. |
| New Context screen hides structured diagnostics | `src/dashboard/brain-hub-views.ts:113-121`; `context-assembly.ts:32-79`; `context-retrieval.ts:16-41` | Candidate rank signals, exclusions, relation paths, scan limits, exact characters, and comparison membership changes already exist but are not visible. |
| Live routes depend on memory-authorship nodes | `src/dashboard/brain-hub-graph.ts:89-96` | A host that calls context but has authored no saved memory has no graph endpoint, so a valid exchange produces no visible flow. |
| Model/usage is deliberately absent | `brain-hub-views.ts:123-136`; `workspace-status.ts:17`; `activity-journal.ts:17-29` | Honest unavailable states are correct, but supplying explicit bounded host receipts would make these screens useful. |
| Background polling updates events without rerendering Models/Usage | `brain-hub-client.ts:139-206` | Newly arrived evidence may remain invisible until a manual refresh or navigation. |
| Project source lineage exists but is flattened in context | `project-hub.ts:138-139,364-366`; `memory-inspection.ts:37-52` | PDF IDs, digest and page, or lesson/outcome IDs can support a verified project-local source link instead of a bare citation string. |

The core auditor reproduced the stale warm recall, archived raw recall and missing portal return in isolated synthetic runtime fixtures. The rest are source findings pending acceptance. No private browser data, credentials, client profiles, or real conversation transcripts were read for this research. Repository `AGENTS.md` points to an absent `.opencode/rules/shadow-brain.md`; there is no usable additional rule at that path.

## Primary-source research and resulting decisions

All sources below were accessed 2026-11-14. These are the publishers' documentation, not independently reproduced product benchmarks.

- **Mem0 Platform** builds a native graph over shared entities and combines graph, vector and BM25 signals. Its graph view is an inspection surface over recorded data. Current documentation expressly distinguishes these co-occurrence links from typed semantic relationships. Implication: our brain should label membership, recorded relations and observed exchanges separately; visual proximity must not imply evidence. There is no need to replace the local store with a graph database for this release. [Mem0 Graph Memory](https://docs.mem0.ai/platform/features/graph-memory)
- **Letta** uses a Git-backed memory filesystem, with explicit maintenance workflows. Current shared-memory repositories let cloud-hosted agents read and update shared files; the older shared-block API is marked as a migration path. Implication: shared memory is established functionality. Our useful acceptance target is visible consistency between independent local host processes, clear curation, and project boundaries. Do not advertise local sharing as unique or imply Letta's cloud-specific repository workflow is its only memory mode. [Memory and dreaming](https://docs.letta.com/configuration/memory) · [Shared memory](https://docs.letta.com/concepts/shared-memory)
- **Graphiti** models facts with validity windows and traces facts to source episodes; it is a framework with additional storage/model infrastructure, distinct from managed Zep. Implication: preserve source lineage and supersession visibly, but do not relabel our explicit archival and recorded links as full temporal reasoning. Resolve approved PDF pages and lesson outcomes already held by the project hub. [Graphiti official repository](https://github.com/getzep/graphiti)
- **Claude-Mem** documents progressively deeper search, timeline, observation and raw-evidence access. Implication: begin with concise rows and let users inspect reasons and source details on demand. Dense information is useful when it has a retrieval path, not when every detail is permanently expanded. [Progressive disclosure](https://docs.claude-mem.ai/progressive-disclosure)
- **MCP resources** are application-driven: the host chooses how to incorporate returned context. Subscriptions and list-change notifications are optional capabilities. Implication: a successful context tool response proves the server produced/returned data; it does not prove a model consumed it. Preserve that distinction in flow labels. Do not advertise resource subscriptions without implementing and testing their lifecycle. [MCP resources specification](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
- **OpenTelemetry GenAI** distinguishes requested model, response model, provider and inference operation. The official documentation has moved to its dedicated GenAI repository and currently has Development status. Token guidance treats cache read/write and reasoning counts as subsets of input/output totals, not extra tokens to add again. MCP operation and session timing are separate from inference timing. Implication: adopt these distinctions without claiming OTel compliance or adding an exporter. A host-supplied provider label remains a report and may identify a proxy rather than its upstream. [Client inference](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/client-inference.md) · [Token metrics](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-token-metrics.md) · [MCP conventions](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/mcp.md)

## Workstream 1: reliable shared retrieval and exchange records

Repair the project-hub POST return event by measuring monotonic elapsed time and supplying a finite nonnegative `durationMs`; preserve its current reported provenance unless a separate transport/schema decision is deliberately made. Record failed responses as failures, and avoid swallowing an event-shape programming error as normal success. Telemetry failure must not invalidate an otherwise completed user write.

For independent long-running memory MCP processes, refresh the read view before recall without calling `sync()` as an implicit write. Fail visibly if storage refresh is unsuccessful. In the project-local memory profile, apply current effective curation before ranking: archived, contested, and superseded memories must not reappear in ordinary task retrieval. Explicit audit/inspection surfaces should retain access to their history. Reuse or extract one curation helper rather than creating divergent filters in each handler. Preserve/document the legacy broad-profile behavior where an API compatibility boundary requires it.

Group journal events into exchanges using `(projectId, agent, sessionId, correlationId, tool, source, transport)`, not correlation ID alone. Retain individual receipts for inspection. Identify completed, errored, start-only and return-only exchanges. A missing return after retention or recording gaps is **incomplete evidence**, not proof the task is still running. Display window size and gap/reset notices near totals.

Add a separate observed-exchange overlay around the dense memory graph. Its host endpoints come from retained events; they are explicitly observed hosts, not fabricated memory nodes. Direction arrows apply only to recorded tool requests/returns. Session and phase events are neutral state markers. Do not animate replay or initial historical load as new traffic. Pause/reduced-motion/hidden-tab controls continue to work.

Acceptance:

- A browser PDF/room POST yields one start and one return with matching correlation and measured elapsed duration; a rejected action yields an error return.
- A synthetic host with zero authored memories calls `context_pack`; the request and response are visible and inspectable in the overlay.
- Interleaved events from two sessions with the same correlation string never join. Start-only and return-only records remain honest under retention, reconnect and recording changes.
- Two warm independent MCP processes share one isolated project store. Process A/browser saves approved knowledge; B retrieves it without restart. After rollback/archive, ordinary B retrieval excludes it and explicit inspection still shows the record and state.
- Another project cannot appear through recall, event grouping, source linking or diagnostics. Invalid/corrupt store reads do not become a current empty success.

## Workstream 2: optional model usage receipts

Do not inspect provider/client profiles or intercept the user's sessions. Add a small explicit report interface that cooperating hosts can call with metadata they already possess. Prefer a separate bounded `model-usage` store so the strict existing activity-journal v1 schema and its retention behavior remain compatible.

Proposed contract, finalized by the coordinating agent before parallel integration:

```ts
type UsageReceiptInput = {
  operationId: string; // bounded host-local operation ID; no provider token
  projectId: string;
  sessionId: string;
  agent: string;
  provider?: string;
  requestModel?: string;
  responseModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
  reasoningOutputTokens?: number;
  outcome?: 'success' | 'error' | 'cancelled';
};
```

Every accepted entry has server-assigned receipt ID, recorded timestamp and immutable `provenance: 'host-reported'`. Optional origin terminology such as provider receipt versus host estimate must not allow the reporter to upgrade itself to locally measured evidence. In particular, accepting `source: 'measured'` from a request is prohibited.

Expose an explicit `usage_report` MCP tool and bounded HTTP report/read routes, with project pinning and existing write protections. A receipt is recorded only when the relevant recording feature permits it. Make collection/display behavior visible in Setup. Read-only usage inspection must not create a store.

Validate an allowlist of fields, bounded plain labels, nonnegative safe integers and finite values. Omitted numbers mean unknown; an explicit zero remains zero. Validate cache/reasoning subset constraints when corresponding totals are present. Reject prompts, output text, arbitrary metadata, URLs, credentials and extra fields rather than retaining them. Do not accept a cost number or estimate a bill in this scope: prices, cached tiers, currencies and provider billing semantics need a separate contract.

Idempotency key: `(projectId, agent, sessionId, operationId)`. A retry with identical normalized data returns the existing receipt and does not increment usage. Conflicting data for the same key returns a conflict. Bound retention and bytes, report the retained coverage, preserve corrupt/newer-schema bytes, and serialize concurrent writes. Do not introduce a synthetic lifelong total over a bounded journal.

Models displays reported provider/model per host/session, last receipt time and provenance. Usage separates reported input/output totals, cached/reasoning subsets, measured tool timing and estimated context-pack size. A mixed known/unknown group displays known totals plus coverage, not a false fully-known total. Fresh receipts update these views without leaving/reentering them. The empty state explains that a cooperating host must send a report; installed skill files alone do not establish model connectivity.

Acceptance:

- Receipt round-trip through real MCP and HTTP persists after process restart and displays in Models/Usage with correct reported labels.
- Duplicate retries count once; conflicting duplicates and invalid numbers fail. Concurrent writers preserve independent receipts.
- `input=1000`, cache read `400`, cache write `100`, output `100`, reasoning `30` displays total `1100`, not `1630`.
- Missing input versus zero input, incomplete coverage, mixed models, errors, stale data, retention gaps and disabled recording have distinct correct output.
- Cross-project reports and reads remain isolated. Host reports cannot forge measured provenance. No provider call, credential read or model-token estimator is used to manufacture usage.

## Workstream 3: complete Context Lab and navigable evidence

Expose existing server diagnostics instead of adding a second ranker. Show the actual retrieval-stage counts, candidate cap/truncation, exact characters/bytes where available, token-estimator label, selected entries and omissions. Candidate rows reveal matched terms/fields, rank signals, duplicate provenance, recorded expansion paths and feedback influence. Plain language should explain budget, limit, duplicate, inactive and unmatched states; numerical scores remain retrieval heuristics.

Comparison displays added, removed and shared memory IDs as inspectable rows using the already returned delta, with separate profile totals and existing caveat that changed selection is not demonstrated answer improvement. Preserve the exact returned Markdown for Copy.

Selecting a candidate opens the existing memory inspector and focuses its actual graph node if present. If the graph is sampled and the selected record is absent, load the selected-memory lens or state the sampling limit; do not draw an invented node/relationship. Typed recorded links and their direction remain distinct from membership and observed exchanges.

Add bounded project-local provenance resolution for a selected memory. For PDF-derived memory, verify the memory's origin, project, document ID, stored SHA, page and page-to-memory association against the hub before returning a navigation target. For lesson-derived memory, resolve lesson/outcome/task and any stored artifact digest from the hub. Source references alone must never become arbitrary filesystem reads or externally opened URLs. A missing/mismatched source yields a visible unavailable/conflict state. Existing human-authored citations remain reference-only.

The result is a complete path: approved PDF page → selected memory → reason → exact reviewed source; or reported outcome → promoted lesson → selected memory → recorded evaluation. Display operator-reported evaluation as reported, never as an independently executed test.

Acceptance:

- A deterministic fixture includes a budget omission, duplicate, archived/contested item, expanded relation, no-match request and truncated scan. Visible UI labels match the returned backend decisions.
- Comparison rows exactly match `addedIds`, `removedIds`, `sharedIds`; equal token counts cannot hide different selections.
- Copy produces byte-for-byte returned Markdown; source/candidate/host hostile text renders as text.
- A memory from an approved PDF opens that exact page and digest after reload. A forged metadata reference, mismatched digest, different project and missing source never resolve to unrelated content.
- A promoted lesson links back to its reported evidence; rollback changes retrieval on rebuild. No claim of model training or improved task success is made.

## Workstream 4: usable density, current data, and readiness

### Context efficiency evidence

The user also requested token/time visibility. For an explicitly requested dashboard context build, optionally assemble one **bounded reference pack** from the same read snapshot, project, query, retrieval profile, curation, feedback and relation-expansion settings. The reference uses the documented supported maximum of 12,000 estimated tokens and 30 entries; disclose those caps and candidate truncation. Compare the selected pack with that reference using the same estimator. Show both estimates, exact rendered character counts and the estimated token difference/percentage. This is an estimate of context reduction against that bounded reference, not all stored memory, actual provider input, billed savings or a measured quality improvement. If the reference estimate is zero, percentage reduction is unavailable; if the selected estimate is larger, show the increase instead of clamping it into a false saving.

Measure elapsed assembly duration with a monotonic clock and label it as context-assembly time. Do not call it model time saved, response acceleration or dollar savings. Perform the extra assembly only when the dashboard explicitly requests this comparison, not on every MCP call or live update. Tests must prove same-profile/snapshot scope, zero-reference handling, cap disclosures, correct arithmetic and separation from host-reported usage receipts.

Keep the main graph visually dense using actual records only. The inspected user reference has a lateral brain outline, many fine cyan/blue structural edges, brighter event paths, and restrained gold accents; it does not call for a pair of separated sparse lobes. Use this visual direction with deterministic brain-shaped node placement, legible edge hierarchy and real typed links. A small corpus still shows its true small count. Do not fabricate nodes, nearest-neighbor semantic edges, or the reference image's 860-node/2,537-link values. If structural curves decorate the silhouette, exclude them from data counts and label their decorative nature. Give users concise query/category/host or selection filters where those operate on real data, visible node/edge/sample counts, and a clear reset. A short source/selection inspector should preserve the overall brain view.

Refresh live read models deliberately. Telemetry/usage changes should update relevant metrics/rows while preserving focused inputs, scroll, graph selection and pending writes. Server-instance/project changes invalidate old state. Loading, offline-with-last-snapshot, storage-failed, disabled and empty remain separate states. Avoid rebuilding the whole page on every 2.6-second poll.

Setup should report a compact evidence ladder: recipe available; project skill files present; observed exchange in retained window; usage receipt received. These are separate facts, not one green Connected badge. The successful cross-host consistency fixture provides release evidence, while the product itself should only claim what its current records establish.

Acceptance:

- New activity and usage appear while Models/Usage remain open; focused form text and selection survive updates.
- Observed host state survives normal refresh but does not imply the client is still connected after its session ends.
- Desktop, 390px mobile, keyboard navigation and reduced motion remain usable. No horizontal overflow hides actions; graph list/receipt alternatives work without pointer input.
- A real local synthetic-fixture walkthrough captures each new interaction. Fixture screenshots are labeled synthetic; idle real empty stores are not seeded with fake activity.

## Workstream 5: JSON, transcripts and source-preserving handoffs

This is an explicit local-file import workflow. The operator selects a file in the dashboard, reviews extracted items and approves individual knowledge candidates. It does not inspect or enumerate private client history folders, session databases, browser state, account configuration or credential files. Imported chat is source material; it cannot acquire system/developer instruction authority. A file format being supported does not mean the product learns every claim in that file automatically.

### Import formats and limits

Implement a small deterministic parser with three explicitly named accepted JSON shapes:

```json
{"schemaVersion":1,"kind":"knowledge","title":"Project notes","records":[{"title":"Build command","content":"Run the project build before release.","source":"README.md"}]}
```

```json
{"schemaVersion":1,"kind":"transcript","title":"Review discussion","messages":[{"role":"user","content":"The parser must preserve Unicode."},{"role":"assistant","content":"The agreed constraint is to preserve Unicode."}]}
```

```json
{"messages":[{"role":"user","content":"The parser must preserve Unicode."},{"role":"assistant","content":"The agreed constraint is to preserve Unicode."}]}
```

The third shape is a documented simple transcript interchange format. Also accept a top-level array of `{role, content}` messages if it uses the same validation. Supported roles are `user`, `assistant`, `system`, `developer`, and `tool`; their content remains quoted untrusted evidence, including system/developer records. Do not execute embedded tools or import executable attachments. Support text string content initially; structured multimodal arrays, arbitrary nested exports and proprietary native logs receive a clear unsupported-format error rather than silently losing content. Knowledge records may optionally carry a bounded `source` citation; it remains reference-only unless internally resolved.

Proposed limits: 1 MiB UTF-8 JSON upload, 500 records/messages, 6,000 characters per item, 180,000 extracted characters total, JSON nesting depth at most 12, title at most 150, source label at most 500, no external fetches. Reject over-limit records with a precise error; avoid silently truncating a transcript and marking it complete. Permit an ordinary UTF-8 BOM, reject malformed JSON/invalid UTF-8, non-string content, control characters, prototype-pollution keys and credential-shaped fields. Enforce bounded request bytes before parsing. Unsupported unknown shapes are errors, not successful zero-item imports. Do not make a universal claim that this parser detects every possible secret in free text.

Preserve the existing PDF limits and page-review behavior. Name the supported formats visibly: text PDFs, knowledge JSON and simple transcript JSON. Image-only PDFs remain an honest OCR-needed state. A short downloadable example for each JSON shape makes the feature usable without a hidden schema.

### Import service contract

Prefer additive `project-source-intake.ts` / `project-source-contract.ts` modules and a separate bounded source index rather than modifying every PDF interface. The worker should expose methods, with root wiring the HTTP/MCP dispatch after the core worker's changes:

```ts
previewImport(name: string, bytes: Uint8Array): SourceImportPreview;
getImport(sourceId: string): SourceImport;
reviewImportItem(sourceId: string, itemId: string,
  input: { decision: 'approve' | 'reject'; key: string }): Promise<SourceImport>;
resolveMemoryEvidence(memoryId: string): MemoryEvidenceResult;
```

`SourceImport` has a server UUID, kind `knowledge-json` or `transcript-json`, original safe filename, SHA-256 of accepted original bytes, byte count, parser/version, recorded time and item list. Items use stable ordinal IDs or JSON pointers such as `/records/0` and `/messages/1`, original role where applicable, title, text, `pending|approved|rejected` status and nullable memory ID. An approved item writes one project memory with structured metadata: `origin: 'project-source-import'`, `sourceId`, `sourceSha256`, `sourceKind`, `sourceLocator`, and `untrustedEvidence: true`. Keep the original role/attribution visible; an assistant message is not automatically a factual memory.

Exact duplicate upload by digest reopens the existing review record, without duplicate memories. Review operations use existing idempotency-key principles. A repeated approval returns the same memory ID. Concurrent approvals must not overwrite statuses or lose writes. Validate before persisting; unsupported, oversized or prohibited structured input must not leave a raw blob behind. Save accepted immutable source bytes only inside the project-owned intake store. If transactional consistency spans stores, retain a deterministic memory ID in the review record before writing, then reconcile safely on retry.

Suggested root routes: `POST /api/workspace/sources` with raw `application/json` upload and safe `name` query; `GET /sources/:id`; `POST /sources/:id/review`; `GET /memory-evidence?memoryId=...`. The project identity is pinned server-side. No arbitrary source path parameter is accepted. Root may choose the final route names once, then share them with the worker and UI. No need to expose upload itself over MCP: hosts consume reviewed memory and exact bounded source evidence.

### Typed provenance result

Use one bounded read result for PDF, JSON/transcript and lesson evidence:

```ts
type MemoryEvidenceResult = {
  memoryId: string;
  projectId: string;
  state: 'resolved' | 'reference-only' | 'missing' | 'mismatch';
  evidence?: {
    kind: 'pdf-page' | 'json-item' | 'transcript-message' | 'lesson-outcome';
    title: string;
    text: string; // at most 8,000 chars; truncation explicit
    truncated: boolean;
    sourceId: string;
    sha256?: string;
    page?: number;
    locator?: string;
    role?: string;
    roomId?: string;
    outcomeId?: string;
    artifactId?: string;
    artifactSha256?: string;
    reported?: boolean;
  };
  references: string[];
};
```

Resolve only through the exact project's own stored memory and source index/hub. Verify ID-to-memory association and hash/locator consistency. `resolved` means the stored source relationship was checked; it does not certify the truth of the source's claims. Missing/forged metadata must not result in a filesystem search. Memory inspection and context rows link to this result. The source screen can reopen the appropriate review record using its typed navigation fields.

### Immutable room artifact reading

Add `hub_artifact_read({roomId, artifactId, sha256})` to the project-local MCP profile. Mandatory SHA binds a recipient to the advertised version. Reuse `ProjectHubService.artifact()`, which checks stored bytes against the recorded digest; never reread the original mutable source path to satisfy a handoff. Return bounded UTF-8 text up to 32 KiB plus artifact metadata, or a clear unsupported-size/type/digest error. Binary blobs must not be decoded as plausible text. The recipient acknowledges the artifact ID and digest using the existing room action. A receipt proves read/ack operations occurred, not that the model understood or executed the artifact.

### End-to-end learning proof

The release demonstration must exercise the complete product using synthetic files and independent processes, not only call a parser:

1. Start the project-local dashboard and two already-running independent stdio MCP processes against the same isolated project.
2. Upload a small text PDF, knowledge JSON and transcript JSON. Show extracted source text, exact page/locator, digest and pending state. Unapproved items must not enter context or raw project recall.
3. Approve one useful item from each source, reject an irrelevant item, and repeat approval/upload retries. The second warm host must retrieve exactly the approved records without a restart or manual refresh.
4. Build a task pack in the other host, inspect actual reasons and open the original reviewed source through typed provenance. Confirm no rejected/unapproved/other-project content is present.
5. Have host A submit a text artifact, then change the original file. Host B reads the advertised stored version through `hub_artifact_read` and acknowledges its digest; bytes match the immutable version.
6. Record a bounded outcome and candidate lesson; show baseline/candidate/control evidence as operator-reported. Promote the lesson, retrieve it from host B, roll it back, and verify its immediate exclusion while audit evidence remains inspectable.
7. Record retrieval feedback and repeat a deterministic query. Show the actual bounded feedback signal/rank change. This establishes retrieval adaptation, not model-weight training or general task-success improvement.

Two additional reproduced retrieval defects warrant focused regression repair: exact duplicate collapse can discard a previous record's negative feedback when a newer higher-importance representative takes over; and a nonempty stopword-only query can become an empty-query newest-items fallback. Preserve conservative feedback across exact duplicate identities without multiplying duplicate votes, and distinguish intentional empty recall from a supplied query with no usable terms. Record deterministic fixture results before/after; do not turn these into an unmeasured universal accuracy percentage.

## Current host coverage and honest connection language

Official documentation verified on 2026-11-14 supports these connection recipes. This is documentation evidence, not proof that every user's installed client completed discovery or invoked a tool.

| Host | Primary-source contract | Product acceptance wording |
| --- | --- | --- |
| Codex | Local stdio command/args under `[mcp_servers.name]`; project `.codex/config.toml` loads for trusted projects | Recipe supported; native connection observed only after an actual handshake/call. [Official MCP guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) |
| Claude Code | Project `.mcp.json` with `mcpServers`; interactive project approval/trust can affect loading | Preserve existing user config; do not interpret a recipe or project skill as approval/connection. [Official MCP guide](https://code.claude.com/docs/en/mcp) |
| OpenCode V2 | Local command array under `mcp.servers`; current default classic handshake supports revisions through 2025-11-25 | Label the recipe V2; do not use the V1 shape or claim the new 2026 protocol without implementation. [Official MCP guide](https://opencode.ai/docs/mcp-servers) |
| DeepSeek Harness | Official `@deepseek-ai/dsh-mcp-client` supports stdio tools and resource access; prompt templates and resource subscriptions remain unsupported | Core workflow must work through tools, without requiring prompt-template support. [Official client README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md) |
| Other clients | A compatible local stdio MCP tool client can use the same project server | Say compatible MCP clients; never say every AI app automatically shares native chats or tools. |

Use the states **Recipe available**, **Project files present**, **Handshake observed**, **Recent tool exchange**, **Session ended**, **Usage reported**, **No retained evidence**, and **Evidence unavailable** independently. `clientInfo.name` is self-declared protocol identity, not cryptographic proof of a particular application. A two-process test with client labels proves the server's multi-client behavior; label it protocol integration. Genuine native-client proof requires the actual installed product to discover and call the server, and must be listed separately. No profile/history/credential inspection is permitted to obtain it.

Shared project memory means approved knowledge, explicit room messages, source citations and immutable artifact handoffs are accessible to cooperating hosts pointed at that project store. It does not mean unrestricted transcript synchronization, transfer of the host's private tools, credential sharing, or automatically merging unrelated projects. The tools shared here are Shadow Brain's published MCP tools; tools owned by another client remain owned by that client.

## Workstream 6: reported sessions, history and cross-host continuation

The user explicitly expanded the product requirement to a unified workspace with resumable inactive sessions and chat history. Implement a durable project-owned Sessions service; another empty navigation screen or a link to a native client's inaccessible history is insufficient. This service records explicit host reports and deliberately imported transcripts. The later 7.22.0 native-adapter workstream below adds recognized native exports and explicitly connected, scoped history sources. The service itself never searches personal history, browser storage or authentication configuration.

### Session model and operations

A session has a server-generated UUID, project ID, title, goal, attributed reporting host, creation/update times, revision, reported lifecycle, and optional parent session/checkpoint linkage. Message and checkpoint records are immutable and receive server IDs/sequences/timestamps. The actor on an MCP write comes from the current MCP session; a portal action is attributed to the operator. The host's protocol name is still self-declared identity, not independently authenticated product identity.

Use one typed service for MCP and HTTP. Suggested core operations, with exact names frozen by the implementation owner:

```ts
session_open({ title, goal, key });
session_append({ sessionId, expectedRevision, role, text, key });
session_checkpoint({ sessionId, expectedRevision, summary, nextSteps, blockers?, key });
session_finish({ sessionId, expectedRevision, outcome: 'completed' | 'paused' | 'failed', key });
session_list({ cursor?, limit? });
session_read({ sessionId, after?, limit? });
session_resume({ sessionId, checkpointId, sha256, key });
```

Pin every operation to the launched project; never accept a filesystem path or implicit cross-project search. Use strict bounded schemas, transactional revision checks and idempotent retries. An identical retry returns the committed result; a changed payload with the same operation key conflicts. Suggested bounds: 500 sessions per project, 200 messages per session, 6,000 characters per message, 8,000 characters per checkpoint and 32,000 characters per returned handoff. List and message reads paginate; errors/caps are visible rather than silently dropping history. Final implementation limits may be tighter, but the UI, schema and docs must match them.

An explicit heartbeat/append/checkpoint advances the server-recorded last-report time. Page polling or opening the session does not. Use **Reported working**, **Report is stale**, **Paused**, **Completed**, and **Failed** labels. A stale working report after a disclosed interval, initially five minutes, means the current state is unknown. Do not mark a host continuously live from an old start event or claim that a process is dead because it has not sent a report.

### Resume semantics

Resume creates a new child session linked to an immutable parent checkpoint. It does not change the original history, overwrite ownership, or reopen a native application's private chat. A mandatory checkpoint digest binds the exact snapshot. Return a bounded handoff containing project identity, the saved checkpoint, source session/cutoff sequence, relevant recorded messages, next steps and explicit truncation. If the parent has newer messages, disclose that the selected checkpoint is older. A same-key retry creates no duplicate child.

The receiving host reads the handoff and can append its own subsequent work to the new session. That explicit read/continuation is the observable proof of handoff. A generated resume snippet alone is only prepared context. Optional current project-memory context must respect present curation and budget; it must not silently reactivate archived memories that occurred in an old checkpoint.

Provide a Sessions screen with paged session list, filters for lifecycle/host, last-report time, transcript, checkpoints, immutable source references, and a resume action. The action creates the child and exposes the exact copyable handoff and the applicable tool call/recipe. Session history stays separate from approved durable knowledge: imported or reported messages are not automatically added to memory, promoted as lessons, or treated as instructions. A selected explicit transcript import can become a source-linked session through a deliberate operator action.

Acceptance:

- Host A opens a session, appends messages, records a checkpoint, and finishes/pauses. Host B reads it and resumes from the exact checkpoint without restarting either process.
- Altering the original source file or adding newer parent messages does not alter the stored checkpoint. Wrong digest, wrong project, unknown ID and stale revision fail clearly.
- Same-key resume creates one child. Concurrent append conflicts are recoverable and cannot lose accepted messages.
- Server restart preserves list, messages, checkpoints and parent/child lineage. An empty inspection does not initialize a new session database.
- The UI displays real appended messages and lifecycle changes, not example placeholders. Stale age is tested with an injected clock; no five-minute test sleep is needed.
- Later host B messages are attributed to B's reporting session. Neither server tests nor labels are described as proof of a native application's hidden chat history synchronization.

## Workstream 7: live project stream and file activity

The user explicitly requested much faster visible updates, including workspace directory/file edits. Implement a small loopback server-sent event (SSE) stream with a conservative polling fallback. Keep it inside the current workspace server; do not add Redis, a message broker, a database server, a second always-running daemon, a model download or a paid service.

### Stream contract

Use one bounded stream for change notifications and metadata events. Each message has a server instance ID, monotonically increasing sequence, event kind and server timestamp. Relevant kinds include activity append, session change, source review/change, memory/curation change, usage change and allowed project-file change. The UI invalidates only the affected read models. Full memory contents, source text, prompts and credentials are not broadcast as stream payloads.

Support `Last-Event-ID` or an equivalent cursor: replay retained notifications on reconnect, and send an explicit reset/gap if the cursor is outside retention or belongs to an old server instance. An initial snapshot/history load is not new traffic. Use bounded connection counts, a heartbeat, graceful close, disconnect cleanup and slow-client backpressure; a slow tab must not accumulate an unbounded server write queue. Enforce the existing loopback bind and Host allowlist, reject an explicitly cross-origin stream request, and do not add permissive CORS.

For writes made by independent MCP processes, check metadata of exact application-owned sidecars at a bounded cadence, initially 250 ms, or receive their native file events with a polling reconciliation path. Reopen/read only when a relevant store identity/version changed; do not parse every SQLite/JSON store on each tick. Avoid watching arbitrary files under `.shadow-brain`; enumerate the product's exact owned sidecars. Revisions and journal cursors remain the authoritative data, so duplicate/coalesced filesystem notifications cannot fabricate duplicate tool calls or tokens.

When SSE is unavailable, show fallback status and retain bounded polling. A tab becoming hidden may close the stream and reconnect from its cursor when visible; it should not run unnecessary animation or force the server to retain private buffers indefinitely. Disabling live display closes/suppresses the display stream according to documented semantics. Disabling recording prevents new optional event records; it does not delete existing source/session/work-room records.

### Selected-workspace file watcher

Watch only the explicit project root the user opened. Emit metadata only: safe project-relative path, observed event kind, server time and any coalescing count. Do not read file contents, infer code changes, or claim which agent edited a file from a native filesystem event. Attribution is **Unknown actor** unless a separate explicit host report establishes the association. A rename/change notification is not proof of a successful edit, test or build.

Skip private/configuration and generated trees before descent, including `.git`, `.ssh`, `.codex`, `.claude`, `.opencode`, `.dsh`, `.shadow-brain`, `node_modules`, `vendor`, `dist`, `build`, caches and OS/application-data directories. Skip `.env` variants, credential/key/certificate/password/session/cookie/history-shaped files and unsupported hidden entries. Do not follow symlinks, junctions or reparse points outside the validated project. The source-intake exception is explicit user-selected input through its review route, not a reason for the watcher to inspect private files.

Expose one real project-file activity switch, active only in the selected project runtime; shared/global mode does not watch the user's whole machine. Clearly label its current state and exclusions. Bound initial discovery, watch handles, queued metadata, retained events and path lengths. If a cap is reached, stop/limit the affected watch scope with a visible warning rather than silently claiming complete coverage. Native file events can duplicate or coalesce: debounce bursts for 100–250 ms and describe grouped changes honestly. A useful initial directory graph contains actual directory/file metadata within the cap; file contents remain unopened. Memory relations, observed file membership and observed tool exchanges remain separate graph layers.

Acceptance:

- A second warm MCP process writes a memory/session/usage receipt; the open view updates through SSE without manual navigation. Verify source approval and curation changes as well.
- Creating/editing/removing an allowed synthetic project file emits safe relative metadata and updates the selected directory layer. Test a burst and duplicate notifications without double-counting receipts.
- Excluded private-shaped fixtures, hidden configuration directories, generated dependency trees and an out-of-root link emit no file content or path event. Use synthetic fixtures only, never real credentials or browser/profile data.
- Reconnect, server restart, cursor expiry and slow-consumer cases expose reset/gap state, release resources, and avoid replaying old activity as fresh animation.
- Disabling file activity and closing the server release watcher handles/timers. Disabled live display suppresses stream payload delivery. Cross-origin/unsupported Host requests are rejected.
- Measure end-to-end fixture latency from an actual write to the DOM update. Report sample count, median and p95 with the local environment; do not promise zero latency or universally capture every keystroke.

## Lightweight architecture and measurable release budgets

These are acceptance targets for the local reference machine, not unmeasured product guarantees. Record baseline and final measurements with the same Node version, fixture, viewport and hardware. Where an absolute target is missed, diagnose before release and disclose the measured limit; do not mask it with a faster synthetic path that omits the actual UI or stores.

| Measure | Procedure and initial target |
| --- | --- |
| Process architecture | One workspace server process; existing bounded PDF extraction worker only during extraction. Independent user-launched MCP processes are clients of the same project stores, not new background services installed by this release. |
| Startup | Five cold process launches to first successful `/status` and usable initial Hub. Target p95 below 3 seconds on the reference machine; record import time separately from listening/readiness. |
| Idle resident memory | Sample server RSS after initial loading, then after 60 seconds idle. Target below 160 MiB for an empty project and below 256 MiB for the documented working fixture, excluding an active PDF extraction worker. Also compare against the pre-stream baseline. |
| Idle CPU and I/O | Record CPU delta and store-read counts across 60 idle seconds. Target average server CPU below 1% of one core; no repeated full-store reads when metadata/revision is unchanged. Hidden tabs do no canvas animation. |
| Stream payload | Metadata notifications only, normally at most 2 KiB each; idle stream traffic limited to heartbeats, target at most 2 KiB/minute/client. Coalesce bursts and cap per-client buffered output, initially 256 KiB. |
| Live delivery | For at least 30 synthetic allowed writes across HTTP, independent MCP and filesystem paths, target p95 DOM update below 1 second in the local fixture. Include any deliberate 250 ms reconciliation/coalescing delay. |
| Graph responsiveness | Measure a populated, honestly labeled fixture at the supported sample cap. Target 60 fps during ordinary interaction where possible, with p95 animation frame work below 16.7 ms; reduce nonessential decoration or adaptive frame rate if needed. Keep static/reduced-motion rendering useful. |
| Bounded graph work | No all-pairs edge generation merely to make the brain look dense. Cache projected nodes/layout; use real recorded edges and explicit render caps. Report shown versus total counts. Picking/search must remain responsive at that cap. |
| Source/session list payload | List endpoints return bounded summaries/pagination rather than every source body or transcript. Full source/message text loads only when selected. Record representative payload sizes and check worst supported page size. |
| Cleanup | After tabs disconnect, switching off file activity and closing the workspace, listeners/watch handles/timers return to baseline and the process exits cleanly. |

The visual target is a volumetric brain with depth, perspective, a recognizable silhouette, fine internal connectivity and controlled event highlights. Depth cues and anatomical scaffolding are presentation; memory and link counts must still derive from actual records. Prefer the existing canvas and deterministic projection before introducing a heavyweight 3D runtime. A 3D-looking screenshot does not establish runtime performance or correct data links; verify actual orbit/zoom/selection behavior, reduced motion and an honest small/empty store.

## Expanded capability and capture boundaries

| Capability | What works through the common local interface | What requires explicit participation or remains outside scope |
| --- | --- | --- |
| Shared memory | Project-pinned recall, context, curation, reviewed sources and feedback | Hosts must point to the same project store and call the tools; unrelated projects are not silently merged. |
| Chat/session history | Explicit session reports, recognized native exports and deliberately connected scoped history sources | No unsolicited native-history scan, browser history, credential access or hidden transcript synchronization. Same-host resume and cross-host handoff have different actions and evidence. |
| Resume | Immutable checkpoint handoff and a new attributed child session | The receiving host must read/use it; model consumption and subsequent execution are not inferred from returned text. |
| Tools | Shadow Brain's published MCP tools exposed according to each host's official MCP support | Private tools belonging to one host are not remotely executable by another merely because memory is shared. |
| File activity | Metadata from allowed files in the explicitly opened project | No contents, private credentials/configuration, browser state, whole-machine monitoring or guessed actor attribution. |
| Models/tokens | Explicit optional host-reported receipts with known/unknown coverage | No provider billing authentication, model identity inference from client names, intercepted prompts or credential inspection. |
| Live state | Recorded protocol exchanges, reported lifecycle and bounded last-seen evidence | A recipe, a file or an old report does not prove a currently connected native application. |

The current official host support remains the table above: Codex and Claude Code project stdio recipes, OpenCode V2 `mcp.servers`, and DeepSeek Harness's official tools/resources bridge. The Sessions and stream product features must be usable through the common **tools** interface, so Harness's lack of MCP prompt templates is not a blocker. Compatibility with unspecified tools is conditional on their implemented MCP client capability; avoid claims covering every application without actual native-client evidence.

## Implementation ownership and sequence

1. **Astra**: research/contract ownership and independent review after workers yield; no source mutation during this research task. Finishing research frees the fourth concurrency slot.
2. **SoL core worker**: fresh/curated project recall, preserved audit timeline, missing POST duration, immutable artifact-read MCP tool, and focused unit/protocol tests. Send final handler changes before root adds unrelated dispatch wiring.
3. **SoL graph/UI worker**: graph/exchanges modules, agreed graph markup/overview/event inspector blocks, graph-only state/actions and CSS; lateral dense silhouette, honest observed exchange endpoints and reduced-motion/keyboard checks.
4. **Terra intake worker**: JSON/transcript parser, intake review/persistence, typed project-local source resolver, import/provenance tests. Own new modules and agreed hub helpers; send exact handler contracts to root. Do not edit root's route dispatch or shared UI modules.
5. **Coordinating agent**: usage store and report/read interfaces, route wiring after core changes, Context/Models/Usage/Knowledge/Learning/Sessions views and shared client actions, setup vocabulary, docs, full build/package gates and visual/runtime verification.

Follow-up implementation allocation: the core worker owns Sessions storage/lifecycle/read/resume contracts and real cross-process tests; a free SoL UI worker owns the bounded SSE/file-activity backend and stream client integration after graph work is stable. Root freezes shared route/state interfaces before they edit shared files. Astra review pauses after reporting the current findings to free a slot, then resumes after these new features have implementation evidence.

The four simultaneous implementation slots are root plus the three workers. Independent Astra review runs after a worker yields. Implement foundational contracts and repairs first, then views/source navigation, then the complete multi-host scenario. Do not wait for a fully redesigned UI before validating cross-process consistency, source review and token arithmetic.

## Scope limits and release gates

This release does not promise native automatic collection from every host, provider-authenticated usage, MCP resource subscriptions, model execution/routing, autonomous memory training, OCR, cloud sync, a vector database migration, or competitor performance superiority. The local dashboard SSE stream is a separate implemented interface, not a claim that all MCP clients subscribe to resource updates. Existing advanced surfaces remain reachable.

Material risks are concurrency and idempotency; corrupt-store preservation; retention producing misleading totals; accidental cross-project disclosure; cached/ reasoning subset double counting; unknown values becoming zeros; graph animation inventing network evidence; stale UI during polling; and compatibility of legacy recall semantics. Each has a concrete acceptance case above.

Required gates:

- Targeted regression tests for the two reproduced defects and new store/provenance contracts.
- Real isolated HTTP and stdio MCP tests, including two simultaneous warm host processes and reload persistence.
- Real session continuation, checkpoint digest/replay and file-stream lifecycle tests; measured local startup/resource/latency/graph evidence.
- Full existing test suite, TypeScript/build checks and `git diff --check` after integration.
- Visual/interaction review of new paths, error/empty/disabled modes, narrow viewport, keyboard and reduced motion, using only the explicitly opened local workspace.
- Exact packed artifact and fresh-consumer smoke, including report/read/citation navigation and preserved older commands.
- Documentation names what is measured, reported, estimated and unavailable. Historical plans are not used as proof of current acceptance.
- Commit, CI, tag and npm publication are separate gates handled by the coordinating agent only within the user's authorized release scope. This research task performs no publication.

## Independent review checkpoint before Sessions/stream completion

The coordinating agent reported 403 passing tests across 53 suites before the newest Sessions/stream scope. Astra independently ran six targeted files with 23 passing tests, including real two-process source/handoff/feedback integration. These counts describe that checkpoint only; rerun the affected tests and full suite after the new work. The review found and sent for correction: telemetry-only changes not refreshing Models/Usage; usage failures lacking a stale-snapshot warning; Learning retaining an obsolete feedback revision even after Refresh; top-level transcript arrays using a non-original `/messages/0` locator; and lesson evidence displaying the derived lesson rather than its underlying reported outcome/check. A suspected stale-evidence read after corrupt memory was disproved: the current refresh throws instead of returning a resolved source. Source and UI owners are addressing the actionable findings; this plan does not mark them accepted without follow-up verification.

## 7.22.0 requirement correction: real native conversations

The user rejected a manually named portal conversation as a substitute for an existing agent chat. A successful native integration must preserve the actual host conversation identifier, available host title, workspace identity and supported visible history. The portal-owned Sessions service remains useful for checkpoints and shared work, but it must not impersonate the host's conversation database. Changing a menu label or copying the first prompt into a title does not meet this requirement.

There are three separate operations:

1. **Inspect a native conversation**: obtain metadata and a bounded, explicitly shared history snapshot from a recognized export or connected source. This does not run a model or change the host conversation.
2. **Resume in its original tool**: use that host's supported resume/open command against the original conversation ID. The original host controls its history, tools, account and runtime. A copied command is a prepared action; successful host execution is separate evidence.
3. **Continue with another tool**: create a new destination conversation and provide a reviewed, immutable handoff referencing the source snapshot. Preserve lineage, but do not describe this as reopening the source's private native conversation or transferring its tools/credentials.

The desktop connector available inside this development chat is not an endpoint that the published npm package can assume exists. Production adapters must use documented host interfaces or recognized files, with explicit source selection. Research and tests here use public documentation/source and synthetic fixtures only; no actual personal history, profiles, credentials, browser stores or private authentication files were inspected.

### Native interfaces verified from primary sources

These observations were checked on 2026-11-14. A documented interface is a design input, not proof that the user's installed version exposes it. Record adapter format and host version/capabilities independently.

| Host | Preferred metadata/history interface | Exact identity and title rule | Native continuation and limits |
| --- | --- | --- | --- |
| Codex | App-server `thread/list`, `thread/read`, paged turns/items; filter by `cwd`, query archived records separately, and explicitly choose relevant source kinds. A recognized exported rollout plus its selected title-index records is the file fallback. | `thread.id` is the conversation target; `thread.sessionId` is a separate root/session-tree grouping. Preserve both. Nullable `thread.name` is a host title; `preview` is not its substitute. The append-only title index has `{id, thread_name, updated_at}` with the latest matching name winning. | `codex resume <conversation-id>` resumes the original stored chat. App-server read does not resume; `thread/resume` loads/subscribes. Current thread history can be paginated or compressed, so a plain JSONL reader cannot claim universal Codex history coverage. [App-server](https://learn.chatgpt.com/docs/app-server), [title-index source](https://github.com/openai/codex/blob/main/codex-rs/rollout/src/session_index.rs), [CLI resume](https://learn.chatgpt.com/docs/developer-commands?surface=cli) |
| Claude Code | Official Agent SDK `listSessions`, `getSessionInfo`, `getSessionMessages`. Pass an explicit directory and bounded limit; listing supports `includeWorktrees:false`. Explicit recognized transcript exports are the no-SDK fallback. | Preserve `sessionId`, `cwd`, `lastModified` and `customTitle`. `customTitle` can contain a custom or generated host title. `summary` may instead be a recent/first prompt; preserve its different provenance and do not label it an exact title. Messages have transcript UUIDs and raw typed content. | `claude --resume <UUID>` resumes in CLI. Current supported Windows/macOS versions also document `claude --desktop --resume <UUID>`. Version-gate the Desktop action. Do not call `query()` just to inspect history. [SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript), [CLI reference](https://code.claude.com/docs/en/cli-reference) |
| OpenCode | Current CLI: `opencode session list --max-count 20 --format json`, `opencode session export <ID> --sanitize`. Current API supports paged session listing with location filters and an experimental projected-transcript export. | Preserve native `info.id`, optional `info.title`, location/project fields and timestamps. V2 exports use `{info,messages}` with typed messages; older nested message-info/parts exports are a different adapter format. A missing title remains unavailable. | Current CLI documents `opencode mini --session <ID>` and `opencode run --session <ID> <prompt>`. The latter sends a prompt and is not a metadata-read operation. Detect command/version support instead of assuming an older `opencode export` invocation. [CLI commands](https://opencode.ai/docs/cli/commands/), [API](https://opencode.ai/docs/api) |
| DeepSeek Harness | Official UI `/export` produces a session-log ZIP. Its root contains canonical `session[.vN].jsonl`; child logs and attachments are separate. An in-host adapter can use `sessionQuery` for filtered reads and title snapshots. | Export header carries `id`, version, creation time and optional cwd/lineage. Latest accepted `session/title.data.title` is the host title. Preserve it rather than recreating the host's fallback algorithm. | The Python SDK exposes native session resume, but this does not establish a public unauthenticated Desktop endpoint or a universal `dsh --resume` flag. Prefer recognized exports initially and document the actual configured bridge if added. Native JSONL persistence can be Zstandard-compressed and version-migrated. [Export package](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session-query/session-log-export/README.md), [query service](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/session-query/session-query/README.md), [SDK source](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/python/sdk/src/deepseek_harness/api.py) |

Additional source checks affect implementation:

- Codex's rollout implementation supports archived sessions, compression, retained history and multiple record types. A parser for one exported plain format must publish that format's coverage, without treating unsupported compressed/retained records as empty history. [Rollout implementation](https://raw.githubusercontent.com/openai/codex/main/codex-rs/rollout/src/lib.rs)
- Claude's official reconstruction follows `parentUuid` to a main-chain leaf and treats sidechains, compaction and parallel tool rows deliberately. An assistant API message ID can occur in multiple transcript rows; transcript UUID is the relevant row identity. Concatenating every `user`/`assistant` row can mix branches, while deduplicating on API message ID can lose text. SDK read helpers can search worktrees; revalidate returned workspace/session identity before exposing content. [Official session reader](https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/src/claude_agent_sdk/_internal/sessions.py)
- Harness export serializes one physical session header followed by canonical event records. Its Markdown projector accepts human appended user events and appended assistant text, while omitting reasoning, system/developer input and runtime records. Reuse those documented semantics for visible-text projection; never flatten arbitrary event objects. Default persistence is compressed and generation-aware; implement explicit supported exported generations or return a format error. [Export serializer](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/session-query/session-log-export/src/archive.ts), [visible-text projector](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/session-query/session-log-export/src/markdown.ts), [persistence contract](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/session/session-persistence-jsonl/README.md), [V4 admission](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/session/session-format-v3-to-v4/README.md)

### Adapter capability and source-selection contract

Use small adapters behind a common typed interface. A format parser is a pure byte-to-record function. A connector is the separate component that obtains bytes/metadata from an explicitly selected source. This keeps imports testable and prevents a metadata request from silently starting a model, loading an unrelated host profile or scanning personal directories.

Each adapter reports independent capabilities: `listMetadata`, `readVisibleHistory`, `incrementalRefresh`, `sameHostResumeRecipe`, `sameHostOpenAction`, `crossHostHandoff`. Values carry a state such as supported, unsupported format/version, source unavailable, not connected, or verified. Do not collapse these into a green Connected badge. Tool presence, successful parsing and live host execution are different evidence.

First delivery should accept the four recognized export families and an explicit Shadow Brain native-export envelope for a trusted host bridge. This is an import of an existing conversation, not a manually renamed replacement. Persistent discovery requires a separate deliberate source connection, where the operator chooses the relevant source location and project scope. It is incomplete to advertise automatic discovery if the shipped implementation only accepts file uploads.

For a connected local source:

- Store an opaque `sourceId` and the approved source root/location server-side. The browser and MCP readers address this ID, not arbitrary filesystem paths. Only the local operator can register or broaden a source; an agent cannot submit a path to make the service read a different user's files.
- Enumerate only the adapter's recognized index/export/log names within the approved root. Validate ordinary files, ancestor paths and stable identity; refuse symlinks/junctions and traversal. Do not search neighboring host configuration, environment, browser, cookie, authentication or credential files.
- Filter by verified workspace metadata before reading message bodies. A missing or ambiguous workspace is an explicit unresolved state. A relocated export needs an explicit mapping to the selected project; never silently substitute the current directory.
- Keep metadata discovery bounded and cancellable. Initial targets: one source scan at a time, 50 metadata rows per page, a visible scan cap, two concurrent file reads, and no unchanged full-history rereads. A watched selected session can update after a debounce; inactive unselected sources need no rapid polling.
- Detect supported CLI/API capabilities with documented version/help/schema information. Do not probe authentication endpoints, read saved secrets, or start inference. Adapters that require an authenticated host connection need a host-owned integration path; Shadow Brain must not recover credentials to manufacture one.
- Imported snapshots remain readable if the source later disappears, marked with their observation time and stale source state. Disconnection stops source reads and watchers. Source removal and imported-history deletion are deliberate separate operations.

### Native observation and immutable snapshot contract

The following is a proposed internal contract, not a claim that any host exports these exact field names:

```ts
interface NativeConversationSource {
  tool: 'codex' | 'claude-code' | 'opencode' | 'deepseek-harness';
  sourceId: string;
  conversationId: string;              // exact native resume target
  nativeSessionGroupId: string | null;  // e.g. Codex thread.sessionId
  workspaceRoot: string | null;
  titleExact: string | null;
  titleOrigin: 'host-title' | 'host-display-summary' | 'unavailable';
  displaySummary: string | null;        // never silently promoted to titleExact
  updatedAt: string | null;
  sourceLocator: string;                // opaque registered locator, not a read request
  format: string;
  formatVersion: string;
}
interface NativeHistorySnapshot {
  id: string;
  projectId: string;
  source: NativeConversationSource;
  observedAt: string;
  sourceSha256: string;
  projectionSha256: string;
  predecessorSnapshotId: string | null;
  completeness: 'complete-visible-text' | 'partial-visible-text';
  excluded: Record<string, number>;
  messages: Array<{
    nativeId: string;
    locator: string;
    role: 'user' | 'assistant';
    text: string;
    createdAt: string | null;
    contentSha256: string;
  }>;
}
```

Use native IDs verbatim within bounded validated fields. Synthetic internal snapshot/message IDs are separate. For formats without stable message IDs, use a source record locator plus digest; do not claim it is a host message ID. Exact titles preserve the host string; escaped display and visual ellipsis are allowed, but altered/truncated stored strings must not be labelled exact. A title too large for the supported bound produces a clear limit state or a separately marked clipped preview. Do not interpolate titles, paths or IDs into shell command text.

One native identity is scoped by tool, registered source and conversation ID, then bound to the chosen project. Identical input bytes and projection yield the same snapshot. An unchanged message ID with changed text is a conflict/new revision, not a duplicate to ignore. A new snapshot can extend a previous snapshot only if the previous ordered message identity/digest prefix matches exactly. Rewrites, truncation, branch changes, title updates, compaction and generation changes create a new immutable observation. Existing checkpoints keep their original snapshot and digest.

Keep both observation time and host-reported update time. File modification time is source evidence, not proof the model is running. Imported completed history should not be called a completed job unless a supported host record supplies that outcome. Titles, host labels and model labels are reported metadata, not verified application identity.

History import itself does not add durable project memories or positive learning feedback. A deliberate separate action can teach selected excerpts with source lineage. Resume handoffs must quote imported content as untrusted reference; embedded system prompts, tool calls or executable instructions never gain authority.

### Parsing and lightweight storage boundaries

Initial implementation budgets should be explicit and tested: at most 8 MiB of recognized export text per import, 1 MiB per JSONL record, bounded nesting, and at most 10,000 projected visible messages per snapshot. These are proposed parser limits, not statements about native host limits. Larger histories need segmented/page import or a clear rejection; silent last-N truncation is unacceptable. Do not raise the generic knowledge parser's limits without reviewing its separate behavior.

History APIs should return metadata and 25 messages at a time, with an additional response-byte cap and explicit continuation. One huge message may need a message-fragment endpoint; its size must not make a nominally one-message page unbounded. Source bodies, every checkpoint and every transcript must not appear in list DTOs. Full selected checkpoint reads remain bounded to the existing 16 KiB contract; ordinary session detail returns checkpoint summaries. A resume returns its one pinned checkpoint and a bounded handoff, rather than the parent's whole history.

Native raw objects can contain tool outputs, reasoning, environment settings, inline images and opaque provider state. Project only allowlisted visible user/assistant text and essential metadata. Count omitted categories and label the projection. Do not recursively search for any field called `text`, decode inline attachments, execute embedded commands or traverse file references. A source SHA proves byte identity, not truth, safety or successful execution.

For Harness ZIPs, either initially accept the user-extracted canonical log or add a bounded archive reader that inspects only selected canonical session logs. Reject traversal, absolute paths, duplicate entries, symlinks, excessive expansion and unsupported generations. Never unpack attachments into the workspace automatically. A supported exported-log parser must not be advertised as a reader for every compressed native store.

Use the existing local persistence stack. No new vector database, model download, permanent bridge daemon, cloud account or full host SDK dependency should be added merely to parse an export. A temporary native bridge may be launched on deliberate connection if its capability and privacy contract is implemented; stop it on disconnect. Measure package size/startup/RSS impact alongside the earlier release budgets.

### Sessions UI and Brain-first integration

The Sessions screen should begin with existing native conversations grouped by the selected workspace and source tool. Preserve exact title when available, show the original ID on inspection, and mark missing title as **Title unavailable**. Put portal/manual records in a clearly labelled category. Retain a manual note/checkpoint flow, but it must not be the primary substitute for missing native import.

The selected conversation shows source tool, original workspace, original ID, title provenance, last observed time, snapshot completeness and history page. Native source availability and recent MCP activity are separate badges. Provide **Open/resume in original tool** only when the exact installed capability is known; otherwise provide the documented recipe with its verification state. **Continue with another tool** creates a reviewed handoff and exposes its lineage/digest. Do not generate an empty conversation with an invented title and label it imported.

The Brain view remains the first screen. Native conversations can supply real source/session nodes, but their existence is not a live edge. Draw membership, saved-source lineage and observed tool exchanges with distinct visual encodings. Animate a new observed event once; reconnecting or importing old history must not replay it as current activity. The dense volumetric brain shell may be decorative if clearly separated from data nodes and never counted as stored knowledge.

### Native-adapter acceptance and ownership

**Core worker:** pure native parsers, source identity/snapshot persistence, bounded read DTOs, mandatory checkpoint digest, incremental/idempotency rules and protocol tests. Keep native import handlers separate from generic source intake. **Root:** operator source-selection/import route, shared UI/state wiring, exact-title semantics, command/action boundary, release docs/version/package verification. **Terra:** public-format synthetic fixtures and end-to-end import/read/handoff scenarios, plus UI evidence that names and original IDs survive. **SoL UI/stream worker:** graph/session-source nodes and invalidation, without interpreting raw native formats. **Astra:** primary-source contracts and independent review after implementation. No worker should read real private host histories to populate fixtures.

Release gates for the new scope:

1. Each claimed native format has a realistic synthetic fixture with an exact renamed title different from the first prompt, original conversation ID, workspace and multiple messages. Import and reopen preserve those fields exactly. A missing title stays unavailable. Unsupported versions fail clearly.
2. Claude branching/compaction fixtures, Codex conversation/group identity fixtures, both claimed OpenCode export shapes, and Harness version/title/text-projection fixtures prevent guessed universal parsing. Unknown event types are counted, not silently promoted to dialogue.
3. Reimport is idempotent. A valid append adds only new messages. Modified old message, reordered branch, truncated source and renamed title produce explicit immutable snapshot changes. Restart preserves lineage and selected history.
4. Cross-project IDs, claimed foreign cwd, malformed UTF-8, hostile locators, symlinks, overlarge lines/depth, archive traversal and excessive archive expansion fail before unrelated data is read or written. Tests use synthetic files only.
5. One already-running MCP client reads an imported native snapshot; another reads the same snapshot, resumes from a pinned digest and records its own follow-up. The new destination is correctly labelled a handoff, and source history remains byte-identical.
6. Source listing and selected history are paged and byte-bounded. A full-capacity fixture measures response size and UI responsiveness. Repeated SSE invalidation does not reload every transcript. No native command runs during passive metadata rendering.
7. Same-host command generation uses executable plus argument array, validates the source-specific ID and cwd, preserves selected host settings, and never includes credential values. Sending a prompt/launching the host is a deliberate action. A generated recipe alone is not reported as native resume success.
8. Evidence is reported in separate columns: public contract verified; parser fixture passed; installed CLI capability verified; actual native application import/open observed. Synthetic clients named Codex or Claude establish protocol behavior only. A missing native-app proof remains visible and cannot become an all-tools compatibility claim.

### Updated independent review evidence

After the Sessions implementation, Astra independently ran `project-sessions`, `context-efficiency`, `project-source-e2e` and `project-hub-mcp`: four files, twelve tests passed. This covered real separate server processes, owner enforcement, project isolation, operation-key replay, old checkpoint selection, wrong-digest rejection, source imports and restart behavior. The clients in these fixtures are synthetic protocol clients; these runs do not establish a native application GUI connection.

An additional isolated supported-size probe found that a one-message session read still returned all 40 full checkpoints: 575,251 bytes of compact DTO JSON and 1,175,489 bytes in the current duplicated text/structured MCP response. Resume also accepted an omitted digest despite its documented exact-digest contract. These findings were sent to the core owner, who is implementing bounded DTOs and mandatory SHA. They are not marked fixed by this research note until the affected behavior is rerun. The context-efficiency fixture tests passed; its figures remain bounded same-profile estimates, not observed model savings. No source-code changes or publication were performed by this research agent.

## 7.22.0 project controls: enforced preferences, skills and team visibility

The latest requirement adds per-chat sharing, per-tool participation, adjustable limits, managed skill removal and a team view. Ship a small coherent control surface backed by actual delivery decisions. The existing six boolean feature flags remain the feature switchboard; keep file observation off by default. Add a project policy for controls with identities and numeric bounds rather than overloading those booleans or creating arbitrary host settings.

This local product has no authenticated enterprise identities or security roles. MCP client names and reported agent labels are not authentication. A caller can choose another label or access files it already owns. The controls below govern cooperating clients using this project's Shadow Brain interfaces; they are not SSO, tenant isolation, an operating-system sandbox or an authenticated ACL. The current MCP authorization specification defines a separate HTTP authorization mechanism; it does not turn a stdio client name into an authenticated principal. [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

### Concrete first delivery

Deliver four connected capabilities, then freeze scope for validation:

1. **Project delivery controls:** maximum context tokens and entries, per-tool participation, per-chat context sharing. These affect backend reads and writes where applicable.
2. **Managed project skills:** inventory, preview, disable, restore and remove for generated project skills whose receipt and current bytes establish ownership.
3. **Team view:** session identity, explicit lead/worker/observer assignment, participation state, observed/reported activity, exact matching usage/model receipts and clearly named timing measures.
4. **Control evidence:** persisted revision, effective limits, reason for a blocked/filtered delivery, cross-process enforcement tests and stale-state recovery.

Do not add model routing, autonomous worker launch, enterprise login or arbitrary global skill management under these labels. A role assignment can be exposed to the cooperating agent as coordination metadata; it does not claim that an orchestrator changed its reasoning or that an observer is a security role.

### Project policy contract

Recommended new module: `src/brain/project-policy.ts`, with strict schemas and a small project-owned store. Reuse the existing safe transaction/atomic-write pattern. One bounded policy snapshot is sufficient; avoid another daemon or external database. Reads of an absent policy return documented defaults without creating storage. Invalid, foreign, linked or unreadable policy storage must not silently reset to permissive defaults.

```ts
interface ProjectPolicy {
  schemaVersion: 1;
  projectId: string;
  revision: number;
  updatedAt: string | null;
  context: { maxTokens: number; maxEntries: number };
  tools: Array<{ tool: string; enabled: boolean }>;
  chats: Array<{ key: string; shareContext: boolean }>;
  roles: Array<{ sessionId: string; role: 'lead' | 'worker' | 'observer' }>;
}
```

Defaults preserve current behavior: maximum 12,000 estimated context tokens and 30 entries; absent tool/chat overrides allow participation/sharing; missing role is **Unassigned**, not an inferred worker. Bound each collection to the supported inventory, reject duplicate keys and unknown fields, and keep the snapshot below a fixed byte limit. Every operator mutation includes `expectedRevision`; stale revisions return conflict and current state must be reloaded. Store a server timestamp and advance revision only for a material change.

Use typed commands rather than a free-form object patch: `set-context-limits`, `set-tool-participation`, `set-chat-sharing`, `set-session-role`, and reset one named override. The server resolves a selected existing session/source into its canonical key. It does not trust a client-supplied arbitrary filesystem path or free-form memory-ID exclusion set. Policy writes are local-operator actions. MCP can read its effective preferences and the documented reason for a denied operation; it cannot re-enable itself or expand sharing.

Suggested operator API: `GET /api/workspace/project-policy` and `POST /api/workspace/project-policy`. Apply the existing project-header, Host, content-type, request-size and origin checks. A new change notification invalidates policy, Sessions/team state and any previously built Context preview. The graph can show the changed participation state without fabricating a tool event. Loading an old browser snapshot must not overwrite a newer policy.

### Numeric controls and actual scope

The first two sliders are **Maximum context tokens**, integer 200–12,000, and **Maximum context entries**, integer 1–30. Show the number and units beside each slider and save an explicit draft, rather than persisting every pointer movement. The token figure remains the context estimator's output, not the provider's tokenizer or bill.

For every agent delivery, compute the effective limit as the smaller of the validated request and saved ceiling. If the request omits a budget, use the existing default capped by policy. This must apply to `context_pack`, prepared prompt templates, automatic project briefings where supported and the portal's delivery-preview mode. Return the policy revision and effective limits with the result. Oversized explicit tool arguments cannot bypass a slider.

Context-efficiency comparison uses the same filtered memory view and policy ceiling: reference limits are `min(12000, policy.context.maxTokens)` and `min(30, policy.context.maxEntries)`. Label this the largest permitted reference pack. Comparing against a larger unauthorized pack would contradict the control. Keep assembly and extra comparison timings separate and disclose any reference truncation.

Do not add a generic confidence/quality slider: the current scores are retrieval heuristics, not calibrated truth probabilities. A visual animation control, if added, belongs in display preferences and must not be presented as changing agent reasoning or knowledge quality.

### Participation and chat-sharing enforcement

Tool participation uses the normalized reporting-tool label bound at MCP initialization, never an arbitrary `agent` argument on each request. Disabling a tool blocks its subsequent project-memory/session operations through this server, including writes. Initialize, ping and metadata discovery can remain available; a bounded read-only policy/status response explains the disabled state. Catalog visibility and execution permission are separate. State this as **Disabled for this project's Shadow Brain connection**, not disabled inside the native application.

Chat sharing uses a stable key that survives immutable snapshots and renamed export files:

- Native conversation: source tool + registered source identity + original native conversation ID. When an import lacks a connector identity, use the explicit project import namespace and verified workspace/native ID, not the filename or title.
- Reviewed generic transcript: its stable project source ID.
- Portal/reported conversation: its project session ID.

Turning sharing off blocks subsequent agent reads of that conversation's text/checkpoints and creation of a new handoff from it. It also removes explicitly associated approved memories from agent context. The operator can still inspect history and audit records in the local dashboard. Sharing is not deletion; it cannot erase material already returned to another agent or independently saved elsewhere.

Resolve memory associations from stored provenance such as `sourceId`, native source/conversation/snapshot identity, or an explicit originating session ID. Do not search memory text for names or guess lineage from matching titles. New teaching from a chat must record those associations. If an older memory has no provable linkage, expose **Source linkage unavailable** instead of promising that a chat toggle removed every derivative claim.

Implement one reusable delivery view that combines existing curation exclusions with policy exclusions **before** ranking, deduplication and related-memory expansion. Filtering only rendered entries can leak disabled-source references through duplicate groups or links and can under-fill recall limits. In particular, inspect these current paths:

| Delivery path | Required behavior |
| --- | --- |
| `mcp-server.ts` `tools/call` | Apply participation gate before handlers, using transport-bound identity; do not allow policy writes through a disabled client. |
| `global_recall`, `global_recall_scored`, `context_pack` | Refresh warm-process policy, combine exclusions before ranking/limit; clamp effective context budgets. |
| `global_timeline`, `memory_inspect`, `memory_health`, `memory_evidence` | Do not reveal disabled-chat content, excerpts or original source bodies via direct IDs or audit-style agent tools. Operator audit has a different access path. |
| `resources/read` -> `memory-mcp-content.ts` | Enforce the same participation/direct-memory rule. The resource implementation currently calls inspection directly. |
| `prompts/get` -> `getMemoryPrompt` | Use the filtered view and ceiling; the current direct assembly with a hardcoded 2,000-token request must not bypass policy. |
| `session_list`, `session_read`, `session_checkpoint_read`, `session_resume` | Omit disabled-chat content and disallow a pinned handoff read/resume. A minimal disabled metadata row may be returned if it contains no title/body that policy intends to hide. |
| Resumed child sessions | Check inherited checkpoint/source lineage. A child's inherited handoff must not expose a parent that was subsequently disabled. Keep immutable bytes for operator audit; deny or omit the inherited delivery explicitly. |
| Portal Context / Context comparison | Preview what an agent may receive, using the same filtering. Show filtered counts/reasons without silently using the unfiltered audit corpus. |
| Operator history/knowledge/usage pages | Retain review and audit access with visible sharing/participation status. Do not silently delete history or usage when a preference changes. |

The policy read and data read must be a coherent bounded operation. At minimum, read one policy revision at operation start and recheck before emitting a sensitive asynchronous result; if it changed, retry once or return conflict. A toggle acknowledged as saved must affect the next call from an already-running independent MCP process. Do not retain policy only at server startup.

Fail closed for agent content delivery if a stored policy cannot be validated. Return a bounded diagnostic, preserve the corrupt bytes, and keep operator repair/status access. Distinguish this from an absent policy's documented defaults. Avoid exposing private policy content through error strings.

### Managed project skill lifecycle

Existing code already establishes ownership: `project-kit.ts` stores project ID, exact relative path and SHA-256 in `.shadow-brain/project-kit-skills/`; preview/apply rechecks the receipt and file under a project-local lock. Reuse that foundation. The first supported management scope is **Project Kit-generated project skills**. Unmanaged personal, plugin, enterprise or other tools' skills are outside this lifecycle and should be labelled accordingly rather than silently deleted.

Expose inventory metadata: stable managed ID, target client, skill name, relative path, enabled/disabled/missing/edited state and ownership verification. Enumerate only the app-owned receipt directory. Validate every receipt's project and allowed target path before opening the associated file. A receipt itself is not sufficient if the current bytes differ or the path escapes the canonical project.

Use a preview/apply contract with a root-bound plan hash:

```text
preview { managedSkillId, action: disable | enable | remove }
  -> { planHash, action, exactPaths, expectedHashes, conflicts, effects }
apply { managedSkillId, action, planHash }
  -> { finalState, changedPaths, preservedPaths, hostRefreshNote }
```

Rebuild the preview under the existing management lock immediately before mutation. Disable moves only the verified owned `SKILL.md` to an app-owned disabled-skill location outside host discovery roots, preserving its bytes and ownership record. Enable verifies the stored bytes and restores only to an absent destination; an intervening user file is a conflict. Remove unlinks only the exact verified-owned file and its applicable receipt/disabled copy. Do not recursively delete a skill directory or remove unknown supporting files. Empty directories created by this manager may be removed only after confirming they are empty and inside the project.

Use exclusive destination creation, same-project validated paths, an operation receipt/recovery record, and rollback on partial failure. A crash between file and manifest changes must produce a recoverable explicit state, not permanent loss of an edited user file. Edited/unowned files, corrupt receipts, links, stale previews and changed destinations all fail without overwriting or deleting them. No global host configuration is opened or rewritten.

Changing a file affects future discovery, not text already loaded into a native chat. Claude's documented skill lifecycle, for example, distinguishes removing discovery from already loaded context, and its auto-invocation setting is not equivalent to disabling all invocation. Therefore do not implement a universal disable switch by writing one host-specific frontmatter flag or claim immediate erasure from running agents. Provide a bounded host refresh note and test generated file state separately from actual native-client discovery. [Claude skill lifecycle and removal](https://code.claude.com/docs/en/skills)

### Team role, activity, model and time semantics

Assign lead, worker or observer to a registered project session, retaining who made the assignment and when. Keep a reported role separate if a host supplies one. Unassigned stays unassigned; native parent IDs alone do not prove that an orchestrator appointed a lead or worker. A role is coordination metadata in this release, not a model change, operating-system permission or authenticated human role. If read-only observer enforcement is later offered, it needs a separately specified mutation policy; do not imply it from the label alone.

Each team row should show source tool, exact native title when available, original/registered session IDs, assigned/reported role, participation enabled/disabled, reported lifecycle, last observed exchange and freshness. Display **No current report**, **Stale report**, **Completed report** and **Disabled by project preference** as separate facts. A disabled tool can still be running elsewhere; an old session can still have historical usage.

Model and token fields join only exact identifiers: project + reporting tool + explicit host conversation ID, or an explicit persisted link from a receipt to a registered session. Native imported sessions use their native tool/ID mapping, not the portal operator actor. Never attach the nearest-in-time receipt, an unrelated model with the same tool name, or a configured model as observed usage. Preserve request model, response model, provider and host-reported provenance; missing values remain unknown.

Time metrics must name what they measure: **Session age** is elapsed time since creation, **Measured MCP tool duration** is retained completed call duration, and **Reported model duration** exists only if an explicit supported receipt provides it. Concurrent call durations can overlap and are not total wall-clock work time. Do not label session age as productive hours or derive time savings from context-token reduction. Token totals remain retained, coverage-labelled, and do not add cached/reasoning subsets twice.

### Implementation split and release gates for controls

The coordinating agent assigned SoL the project policy module, shared delivery-view helpers, narrow MCP/resource/prompt/API integration, sliders and focused tests. Coordinate exact shared-file blocks with root; avoid broad rewrites. After native parsing and Session DTO work, core owns managed Project Kit skill disable/restore/remove and its preservation tests. Core also supplies stable chat/source lineage resolution. Terra retains native connector/import ownership and verifies that imported identity survives the control workflow. Root coordinates controls/team presentation, release evidence and final integration checks. Astra finishes this contract to free the worker slot, then can independently review after an implementation worker yields.

Recommended helper contract: `readProjectPolicy(root, projectId)`, `applyProjectPolicy(root, command, expectedRevision)`, `assertToolParticipation(policy, transportTool)`, `chatKeyForSession(session)`, `deliveryExclusions(policy, projectMemories, sessions)`, `effectiveContextOptions(policy, request)`, and `assertSessionShareable(policy, session, inheritedLineage)`. Helpers return typed decisions/reasons, not preformatted HTML. The managed-skill module owns inventory/preview/apply. Keep policy writes and filesystem lifecycle under separate appropriate locks.

Mandatory acceptance cases:

1. Two already-running MCP processes: save a policy change in the portal, then verify the next request observes it without restart. Re-enable restores eligible delivery without recreating stored knowledge.
2. Disabled tool cannot call memory/session read or write paths, direct resources or prompt templates. It can obtain a bounded disabled-state explanation. Caller-supplied agent labels cannot override the connection-bound label. Document that a newly chosen client identity is not cryptographically prevented.
3. Disable a chat with one taught memory and a resumed child. Verify raw/scored recall, context, duplicate references, related expansion, timeline, inspection, evidence, resources, prompts, checkpoint read and inherited handoff do not return the sentinel. Operator audit still contains the unchanged original. Unrelated eligible memories remain retrievable.
4. Slider ceiling is enforced against an explicitly larger MCP/API request, a prompt template and Context comparison. Returned effective limits and estimates agree. Invalid numeric bounds and stale revisions fail without mutation.
5. Unknown/invalid/foreign policy store does not fall back to enabled delivery. Missing policy uses explicit compatibility defaults. Update race returns conflict or a recomputed current result; it does not knowingly return data excluded by a just-acknowledged change.
6. Generate a managed project skill, disable, restart, enable, then remove it. Verify original bytes/digests and only intended paths changed. Edited file, unrelated supporting file, symlink, invalid receipt, stale preview and destination collision remain preserved. Simulated partial failure is recoverable.
7. Team roles persist and expose assignment provenance. A mismatched usage receipt does not populate a model/token field; exact match does. Unknown remains unknown; overlapping tool durations are not advertised as elapsed work.
8. UI confirms committed revision, preserves unsaved slider drafts, recovers from conflict and updates another open view. Disabled sharing is clearly visible without hiding the operator's audit evidence. Controls appear in the Brain/Sessions/Knowledge workflow before optional statistics polish.

These are concrete 7.22.0 acceptance gates, not a claim they have passed. Authenticated enterprise authorization, global client control and scheduler/model orchestration remain distinct future product work unless separately implemented and verified.

### Simple adoption flow

The first-run path must use the actual project-local launcher already implemented:

```text
shadow-brain project workspace . --port 62595
```

After installation, run it from the selected project and open the printed local URL. A first-install recipe may wrap this same command with the package runner after the release package is verified. Do not route onboarding to the older `dash . --no-analysis` shared-store view: the project-local server supplies Sessions, source review, skills and collaboration. An optional setup alias should call this existing behavior rather than adding another server or duplicate storage.

Use three short onboarding actions within the Brain-first interface: **Connect a tool**, **Add project knowledge**, and **Bring an existing conversation**. Connecting a tool shows its project-scoped recipe and the precise next step; completion progresses from recipe prepared to actual handshake/tool exchange. It does not silently edit global client configuration or access credentials. Existing native-history connection is a distinct action with its scope and supported format shown.

Keep useful empty states: explain the next action, show the selected project directory, and let the first real memory/session populate the graph. A decorative brain shape must not be counted as stored knowledge. Offer a visible pause-motion control. Advanced policy, source diagnostics, original IDs and retention details should be one inspection away, while the ordinary path remains launch, connect, use. Validate a clean synthetic project through that complete path before calling onboarding complete; do not add unrelated feature panels to solve discoverability.

The useful release claim, once these gates pass, is: **review project knowledge, continue explicitly shared sessions across compatible agents, and inspect recorded exchanges and allowed file activity in one local workspace**.
