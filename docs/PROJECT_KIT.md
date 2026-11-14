# Project Kit: knowledge and skills for one workspace

Project Kit combines a local knowledge store, bounded project inspection, task-specific skill generation, and feedback from actual work. Everything belongs to the selected project. Opening another project does not import these memories or install the skill globally.

## 1. Open your project

```bash
shadow-brain project workspace .
```

Open the printed address and choose **Project Kit**. This mode needs no model provider and does not read coding-client profiles. Closing the portal keeps your saved files. The older `dash` command still opens the shared-store dashboard; it does not silently switch or merge stores.

| File or folder | Purpose |
| --- | --- |
| `.shadow-brain/project-memory.json` | Explicit project knowledge |
| `.shadow-brain/memory-annotations.json` | Reviews and recorded memory relationships |
| `.shadow-brain/feature-settings.json` | Workspace runtime controls |
| `.shadow-brain/activity-journal.json` | Bounded measured/reported activity metadata |
| `.shadow-brain/memory-feedback.json` | Reported outcomes and local learning control |
| `.shadow-brain/project-kit-skills` | Ownership receipts for generated skills |
| `.shadow-brain/disabled-project-skills` | Verified disabled copies outside client discovery paths |
| Selected host's project skill folder | Generated `SKILL.md` files |

Files are created when their feature needs to save data. Treat knowledge and skill content as project files: decide what belongs in version control before sharing the repository. Moving a project changes its path-derived project ID; this release does not automatically reassign earlier memory IDs to the new location.

## 2. Inspect what the project actually declares

```bash
shadow-brain project inspect .
```

Inspection reports observed stack markers, package-manager markers, and known check names. It scans at most 500 directory entries through depth three, with bounded allowlisted manifest reads. A script named `test` yields a suggested command; its body is not returned or executed. Lockfiles and configuration markers can identify a tool without reading their contents. The scanner skips linked paths, dependency/build trees and private configuration locations.

These are observations, not complete semantic understanding. Missing manifests, a large monorepo, custom scripts, or an unfamiliar stack can leave gaps. The profile shows coverage and warnings. Check the suggested command before running it.

## 3. Add knowledge you want the agent to retain

Use the knowledge form for a project constraint, decision, rule, or known lesson. An optional reference records where you found it; the service does not fetch that reference or certify the statement.

```bash
shadow-brain project knowledge . --title "Checkout retry contract" --content "Preserve the original idempotency key across retries." --source "docs/checkout.md"
```

The command returns the committed memory ID and project ID. The original text is stored with explicit user provenance. A reference is recorded only when you supply one, so adding a note without a source does not inflate source coverage.

Open **Context Lab**, select the project, and ask about checkout retries. The saved note is immediately available to scoped retrieval. You can inspect, contest, archive, or connect it through the existing memory tools.

## 4. Turn a requirement into a local skill

Describe the task, choose a client, and optionally supply knowledge. **Use in skill** reuses the knowledge you just added. Preview shows the exact destination and Markdown before Apply.

```bash
shadow-brain project skill . --target codex --name checkout-retries --requirement "Fix checkout retries and verify that each request commits once."
```

The output includes `planHash`. Repeat the same inputs with `--apply --expected-plan-hash HASH_FROM_PREVIEW` to write the reviewed plan. The generated skill includes your requirement, supplied knowledge, observed project evidence, and relevant declared checks. It is deterministic; no model or install script runs during generation.

| Client target | Generated path |
| --- | --- |
| `codex` | `.agents/skills/NAME/SKILL.md` |
| `claude-code` | `.claude/skills/NAME/SKILL.md` |
| `opencode` | `.opencode/skills/NAME/SKILL.md` |
| `deepseek-harness` | `.dsh/skills/NAME/SKILL.md` |
| `portable` | `.agents/skills/NAME/SKILL.md` |

Apply recomputes the preview, checks path safety and ownership, and refuses stale plans or files that were edited outside Project Kit. An unowned file is not overwritten, even if its name matches. Generated skills do not edit `AGENTS.md`, provider settings, or global skill directories. Host support and skill discovery still need to be checked in the client.

In **Setup → Managed project skills**, preview Disable, Enable, or Remove to see the affected paths. Disabling moves the verified `SKILL.md` bytes into the workspace’s disabled-skill folder. Enabling restores them only when the discovery path is free. Removal deletes the verified file and its Project Kit receipt. Supporting files and other skill installations stay in place.

The panel reports edited files, destination conflicts, and pending operations. For a pending operation, review the same action to complete it. Reload the coding client to refresh its skill discovery. An existing chat can still contain instructions it loaded earlier.

## 5. Connect the same local knowledge to your agent

```bash
shadow-brain project config . --target codex
```

Merge the printed recipe into the selected host's configuration. It includes the explicit project directory, project ID and local `--db` path. The connected MCP process then reads the same knowledge shown by the portal.

The local launch adds `project_inspect`, `project_knowledge`, `project_skill_preview`, `project_skill_apply`, and `project_feedback` to the regular memory tools. Preview/apply is a two-step operation. Saved text and observations remain reference material; they do not override current user instructions or the host's permissions.

## 6. Learn from reported outcomes

After a real task, record whether a selected memory helped. The **Memory outcomes** panel keeps the task, outcome, reason, optional evidence labels and reporter visible. A user report and an agent report remain distinguishable. Agents can call `project_feedback` after observing a concrete result; retrieval alone never creates positive feedback.

```bash
shadow-brain project feedback list .
shadow-brain project feedback record . --memory MEMORY_ID --task "Fix checkout retries" --rating useful --reason "The existing idempotency contract matched the passing retry regression check." --evidence "tests/checkout-retry.test.ts"
shadow-brain project feedback set off --project .
```

Use `useful`, `not-useful`, or `incorrect`. Record only an outcome you observed; the example reason is not a claim that your tests passed. Feedback is reported evidence, not an automatic truth verdict. The portal lets you remove a record or disable its influence while keeping the history available.

Adaptive retrieval applies a small signed adjustment only when the memory already matches the current task and the feedback task is relevant. Repeated identical reports are updated instead of counted again. User reports carry more weight than agent reports. Context Lab shows the applied signal and links to reported outcomes; diagnostic JSON retains record IDs. Legacy retrieval, unrelated projects, inactive memories, and empty-query browsing do not gain feedback influence.

This improves local reuse through outcome feedback. It does not train model weights, verify external sources, execute self-modifying code, or guarantee that an agent's next answer will be correct. [Learning rules and limits](LEARNING.md)

[Client integration](INTEGRATIONS.md) · [Context Lab](CONTEXT_LAB.md) · [Workspace guide](WORKSPACE.md)
