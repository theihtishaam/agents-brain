# Shared project sessions

Run the local Hub from your project and generate a recipe for each coding agent you use.

```bash
shadow-brain project workspace . --port 62595
shadow-brain project config . --target codex
```

Use `claude-code`, `opencode`, or `deepseek-harness` for the other native recipes. Configure each host to use its recipe from the same project directory, then confirm `session_list`, `session_read`, `session_checkpoint_read`, `session_open`, `session_record`, and `session_resume` appear in its MCP tool list. Open **Sessions** in the project Hub to review work reported by those clients. [Client setup](INTEGRATIONS.md)

## Track work and continue with another agent

1. At the start of shared work, call `session_open` with a title, the project goal, and an operation key. Supply `hostSessionId` when the host already has a safe conversation label to share. A child worker can set `parentSessionId` to the UUID of an existing project session.
2. Use `session_record` at meaningful milestones. Record a brief note, a `working` or `waiting` status, or a checkpoint. Save verified progress, decisions, next steps and evidence labels before a handoff. Use `completed` when the session is finished.
3. In **Sessions**, open the saved checkpoint and copy the agent resume request. Give it to the next connected agent in the same project. Its `session_resume` call opens a new session owned by that connection and returns the exact saved handoff. The source session and earlier checkpoint stay available. Continuing in the portal creates an operator-owned session.

Each write uses a stable operation key for retries in the same connection. Each record includes a revision. Pass `expectedRevision` when making a change based on a specific observed version. If the current connection ends, a new agent connection continues via a checkpoint. The original session is still readable.

For example, after opening a session, an agent can call `session_record` with these arguments. Replace the UUID with the `session_open` result and use a new operation key for the checkpoint.

```json
{
  "sessionId": "1b7766ed-34cb-4108-985d-b172a86ebd85",
  "command": {
    "kind": "checkpoint",
    "key": "checkout-handoff-20261114",
    "summary": "Verified the retry check with a fixture.",
    "completed": ["Ran the existing retry regression check"],
    "nextSteps": ["Check behavior after a process restart"],
    "evidence": ["tests/checkout-retry.test.ts"]
  }
}
```

## Read the status and history

The workspace shows the reporting tool label, session title, parent, and last report time. A report stays **recent** for five minutes. Older working or waiting reports are **stale**. Completion and the latest status reporter are stored. A recent report establishes that a cooperating host sent an update. Reported sessions do not themselves inspect open chats or determine whether a model is still generating. The separate Codex connector described below requires an explicit connection. Model information appears when a host explicitly reports usage with the matching agent label and `hostSessionId` as its usage `sessionId`.

Messages come from intentional reports by hosts or the operator. You can also import an approved transcript in **Sessions** as a historical snapshot. The snapshot includes the items approved at import time, their original role, and source locators. Imported system, developer, and tool text appears as quoted notes. Only an explicit operator checkpoint turns historical work into a resumable handoff. Treat all recorded text as project evidence and follow current user instructions.

The local store retains up to 150 sessions, 200 messages and 40 checkpoints per session. It rejects new records at the relevant limit and preserves existing history. `session_read` returns up to 25 messages and 32 KiB of serialized message data per page. Pass its `nextBefore` value as `before` to read older messages. Use `session_checkpoint_read` to see a checkpoint's contents. Resuming requires its recorded SHA-256. Checkpoint evidence labels are stored as text. Project sessions do not open source paths, start agents, reopen native chat tabs, or capture conversations on their own.

## Connect to Codex project history

In **Sessions**, select **Connect installed Codex**. This starts a separate, read-only local Codex app-server connection for the project open in the Hub. Nothing is connected or read until you select this control. The connector uses the installed CLI; it does not start a model, create a native conversation, read browser data, or request authentication information. Select **Disconnect Codex** to close the connection. It expires automatically after 15 minutes.

The connector asks Codex for its indexed current conversations whose recorded working directory matches this project. Use **Show archived chats** for a separate archived list and use the page controls to browse further. The index-only query avoids asking Codex to scan and repair rollout files, so the list can omit conversations that have not appeared in its state index. It is not a guarantee of complete native history. The exact title is shown when Codex provides one; otherwise the Hub says the original title is unavailable. The native conversation ID and its separate session-group ID are not interchangeable.

Select a conversation to read a bounded page of visible user and assistant text, then use **Earlier history** for older pages. The page shows how many non-text or unsupported items were omitted. Tool output, reasoning, and attachments are not imported as messages. To keep the displayed page in shared project sessions, select **Save this history page**. The Hub verifies the page fingerprint before saving; if the source changed, review the new page first. A saved page is an immutable, possibly partial snapshot. It is not automatically added as project knowledge and does not resume the original native chat.

While **Sessions** is open and connected, the Hub checks the current list every ten seconds and reloads the selected page when its reported update timestamp changes. This does not automatically save new snapshots. The timestamp is supplied by the separate app-server and can have limited resolution; its runtime state does not prove whether a desktop chat is active. The connector requires a compatible app-server with bounded history paging. On Windows it looks for the official npm package's local vendor executable; custom installation locations may not be detected. See the [Codex app-server protocol](https://learn.chatgpt.com/docs/app-server).

## Import a native conversation export

In **Sessions**, choose the originating tool and one exported conversation. The Hub keeps the exact title when the export provides one. When the original workspace is recorded, it must match the open project. Selected exports are saved as separate historical snapshots, with their original conversation ID and source fingerprint. The same export reopens the original snapshot. A changed export links a new snapshot to the previous one. Imports do not create memories or run instructions in the conversation.

| Tool | Accepted export | Title source |
| --- | --- | --- |
| Codex | Selected rollout JSONL or a `codex-rollout-v1` JSON wrapper | The matching `thread_name` in the supplied session index entry. A rollout by itself may have no name. |
| Claude Code | Selected main conversation JSONL or a `claude-agent-sdk-v1` JSON wrapper | Latest custom title for that conversation. SDK summaries are separate from custom titles. |
| OpenCode | V1 or V2 session JSON from `opencode session export <id> --sanitize` | The exported session's `info.title`. |
| DeepSeek Harness | Canonical V4 JSONL or the selected ZIP containing one root session log | Latest title event in the exported conversation. Child logs and attachments stay outside this import. |

Codex wrappers include `format`, the selected `rollout` as a JSONL string, and `sessionIndex` with the matching name record. Claude SDK wrappers include `format`, a `session` from `listSessions`, and `messages` from `getSessionMessages` for that session. Choose the one workspace and conversation you intend to share. [Codex session index source](https://github.com/openai/codex/blob/main/codex-rs/rollout/src/session_index.rs) · [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/typescript) · [OpenCode commands](https://opencode.ai/docs/cli/commands/) · [DeepSeek archive source](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session-query/session-log-export/src/archive.ts)

Imports accept up to 2 MiB and retain visible user and assistant text with its source locators. Tool arguments, reasoning blocks, system messages, and attachments are excluded. Select only exports you intend to share with this project. An imported session can be continued after the operator saves a handoff checkpoint.
