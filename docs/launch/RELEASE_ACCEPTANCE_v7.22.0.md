# 7.22.0 verification record

Checked on 2026-11-14 against the release candidate. The checks below describe observed behavior and its limits. The [CI workflow](https://github.com/theihtishaam/agents-brain/actions/workflows/ci.yml) separately runs the build, tests, type checks, retrieval diagnostics, dependency audit and fresh-package checks on Ubuntu and Windows with Node 22, 24 and 26.

The final local full-suite run passed **452 tests in 64 files**. Four public-metrics validation tests also passed. The matching commit's CI remains the authority for the complete current revision and its supported-platform package checks.

The fresh-consumer package check passed: archive allowlist and integrity, isolated installation, public exports, CLI, all four skill layouts, MCP resources/prompts, PDF extraction, plaintext memory with evidence and retry identity, checkpoint continuation, context ceilings and byte-exact skill restoration. It also verifies that README images are included in the package.

## Practical outcomes

| User action | Evidence | Result |
| --- | --- | --- |
| Save “The cupboard is black” | Real portal HTTP, browser and two already-running independent MCP processes | Both clients retrieve the saved fact for a cupboard question; original line evidence resolves; another project cannot retrieve it. |
| Retry a note or preserve a correction | Source-intake regressions | Identical notes keep their memory IDs; an earlier approved edit is preserved. |
| Add PDF, JSON and transcript evidence | Real portal and independent MCP processes | Pending and rejected items stay out of retrieval. Approved records retain page/item locators and original versus edited text. |
| Continue another agent's work | Real MCP subprocess and portal session tests | A digest-verified checkpoint opens a new linked session; original history and ownership remain intact. |
| Hide a conversation | Warm-client policy tests | Tools, resources, prompts, direct evidence and inherited handoffs respect exclusions. Explicitly linked memories are filtered before ranking and duplicate collapse. |
| Change context ceilings | Portal, MCP and project CLI tests | Token and entry ceilings also constrain the reference comparison. Corrupt policy storage fails agent delivery closed. |
| Disable or remove a generated skill | Store tests and actual browser controls | Verified Project Kit files can be moved, restored or removed; edited and unowned files stay intact. Interrupted operations and abandoned locks are covered. |
| Inspect live work | Browser and real MCP requests | The graph follows observed exchanges; empty memory stays empty. Hidden/reduced-motion behavior, replay expiry and node search are checked. |
| Inspect models and usage | Real MCP and HTTP receipts | Missing counters remain unknown. Cache/reasoning subsets are not added twice; retries do not double-count. |
| Inspect tool and worker details | Browser plus exact-identity regressions | Local logos, separate worker models and effort, shared-host ambiguity, custom client identity, keyboard/touch access, and reduced motion are covered. |
| Count reporting MCP connections | Two independent owned stdio child processes and store/stream tests | No lease before readiness; clean closure removes it. A hard-killed child's retained lease expires under the tested clock. Disabling tool participation blocks recall while preserving the transport count. Recording off is unavailable. |

## Browser and native integration evidence

- The final graph fixture contains **580 synthetic stored memories**, with **504 displayed nodes and 1,925 recorded relationships** in the captured desktop view. Its three client labels come from scripted MCP clients. Eleven graph browser checks passed with no page errors or external requests.
- Seven project-control browser checks passed, including keyboard-operated sliders, sharing, roles, tool participation and filtered context. Six managed-skill browser checks passed, including preserving an unrelated file.
- Eleven additional tool-panel browser checks passed with four initialized scripted MCP stream clients, five registered sessions and two synthetic model receipts. These exercised local logos, hover/focus/click details, distinct worker models and effort, source attribution, event-driven motion, reduced motion, narrow layout and session navigation. No page errors or external requests occurred. Expiry/offline counts and custom-client joins also have focused regressions.
- The plain-text, source-evidence, session paging and checkpoint paths were exercised in the running app. Native navigation and delayed disconnect responses were tested with controlled browser responses; server protocol tests use a separate owned process fixture.
- Installed **Codex CLI 0.145.0** completed a real initialize/list/disconnect cycle scoped to a newly created empty test workspace. It returned zero conversations. No personal history was read, created or resumed and no model request was sent. This verifies the handshake and empty indexed list, not personal-history paging or every installed-client variant.
- Claude Code, OpenCode and DeepSeek Harness imports are tested with supported native export fixtures. These do not establish automatic capture or native-client reconnection. MCP project memory and checkpoints are a separate shared interface.

## Measured local cost

One Windows/Node 24.15.0 fixture measured 30 writes reaching the visible browser: ten MCP memory writes, ten session API writes and ten allowed file changes. Median latency was **241 ms**, p95 **386 ms**, maximum **888 ms**. Over a 60-second idle sample, workspace RSS moved from **82.33 to 82.21 MiB**, server CPU averaged **0.365% of one core**, and the page made **zero workspace API refetches**.

These figures describe a small local fixture on an i5-12450H, not a service-level guarantee, large-corpus benchmark or measurement of the optional native connector. Native metadata refreshes every ten seconds while its view is open; it is separate from local pushed activity.

The added MCP presence lease renews every ten seconds, with a thirty-second expiry. An 11.2-second browser observation containing actual fixture tool exchanges and heartbeats produced four telemetry reads and two presence reads, with zero graph, usage, session or overview reads. Heartbeats update presence independently and do not animate work. This is a targeted request-routing check, not a large-team capacity benchmark.

The 14 author-generated retrieval diagnostics passed for adaptive retrieval with no scoped-data leaks or budget violations. They test named retrieval behaviors, not model answer quality or superiority over other tools. The dependency audit reported no known vulnerabilities at the time of checking.

## Boundaries that remain explicit

This is a local project service. Client labels and coordination roles are not authenticated enterprise identities. The service does not inspect hidden reasoning, train model weights, reopen native application tabs, guarantee every host will request memory, or prove reported outcomes true. Context reduction is estimated; provider billing and model execution time are not inferred from it. Previously delivered information cannot be withdrawn from another application.

Source code, installed-package behavior and UI captures are checked separately. Use the matching commit's CI result when assessing a published release.
