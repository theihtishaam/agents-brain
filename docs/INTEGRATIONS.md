# Connect a coding client

Agent Shadow Brain provides six reusable workflow skills, project-specific skill generation, and a local MCP service. Skills guide the host's work; MCP exposes saved memory and context. A client must load the skill or call the tool for it to take effect.

## Start with a local project

Run these commands from the project root:

```bash
npm install -g @theihtisham/agent-shadow-brain@7.25.0
shadow-brain project workspace .
shadow-brain project config . --target codex
```

The portal stores knowledge in `.shadow-brain/project-memory.json`. The generated recipe pins MCP to that same project and file, so a saved note can be recalled by the agent and its tool calls appear in the matching portal's **Live** view. The recipe is printed, not installed. Merge the entry with your existing host settings, then reconnect the client.

## What each host actually shares

| Host connection | How existing work becomes visible | How a different agent continues |
| --- | --- | --- |
| Codex | The project-scoped app-server index supplies available chat titles and relationships. In Sessions you can select visible messages from a conversation. | Connect the next agent to the same project. It can find a matching checkpoint or recover shared updates. |
| OpenCode | Workspaces can query its project-scoped ACP session list. Actual MCP exchanges appear when the client calls a project tool. | The same project MCP tools supply briefs, shared messages and checkpoints. A title in the ACP index alone supplies no message text. |
| Claude Code and DeepSeek Harness | Connect the supported MCP recipe. Sessions can also import a selected supported export. | The receiving agent uses the saved project session independently of the originating host. |
| Other MCP clients, including editor extensions | Connect the host's project recipe or portable stdio entry. A client must send each shared turn or checkpoint that it wants retained. Available native history varies by host. | Shared project tools return the same permitted data. A client without MCP can receive a copied text handoff. |

A host may require a reload or its own approval after setup. Seeing a tool listed under **Detected** establishes that the installation was found. Seeing a successful tool return establishes that the host exchanged data with the brain. [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) · [ACP session list](https://agentclientprotocol.com/protocol/v1/session-list)

## Connect a detected host from Setup

**Setup → Host connections** shows installation evidence, project configuration, tool admission, and current MCP presence. Discovery checks known PATH commands, selected install-time launchers and VS Code extension installation folders. **Connect** can create a new configuration in this project for a detected supported host. Automatic connections are off initially. Host trust and approval still apply.

| Host | Workspace setup |
| --- | --- |
| VS Code with current GitHub Copilot | Shared `.mcp.json` using the Copilot harness format. [VS Code MCP reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) |
| Claude Code | Shared `.mcp.json`. Claude Code can ask for project server approval. [Claude Code project scope](https://code.claude.com/docs/en/mcp#project-scope) |
| Codex | `.codex/config.toml` in a trusted project. [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) |
| OpenCode | `opencode.json` using `mcp` in V1 or `mcp.servers` in V2. Connect uses the generation indicated by install evidence. Check the setup guide if the generation is unknown. [OpenCode V1 migration guide](https://opencode.ai/docs/migrate-v1/#mcp-servers) |
| Kilo Code | `kilo.json` using `mcp`. [Kilo MCP](https://kilo.ai/docs/automate/mcp/using-in-kilo-code) |
| Cline | Copy the recipe into its MCP setup, or point the CLI at a separate file via `CLINE_MCP_SETTINGS_PATH`. [Cline MCP](https://docs.cline.bot/mcp/mcp-overview) |
| OpenClaw | Copy the recipe into the intended Gateway's MCP settings. [OpenClaw MCP](https://docs.openclaw.ai/gateway/config-extensions#mcp) |
| DeepSeek Harness | Copy the MCP client plugin entry into the selected Harness profile. The Windows desktop installer can be detected through its bundled launcher even when `dsh` has not been registered on PATH. [Harness MCP client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md) · [Desktop command registration](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md#terminal-command) |

The portal uses file metadata to detect a conflict and preserves existing or changed configuration. **Disconnect** blocks that host’s project tool access and removes a managed file only while its recorded identity and timestamps match. When one host still owns the shared `.mcp.json`, the other host shows **Shared project configuration** and can reconnect to it. Generated launch paths refer to this machine and installation.

![Native configuration recipes](assets/7.1.4-integrations.png)

## Choose a client

| Target | Native recipe | Project skill location |
| --- | --- | --- |
| `codex` | TOML entry for `.codex/config.toml` | `.agents/skills` |
| `claude-code` | JSON entry for `.mcp.json` | `.claude/skills` |
| `opencode` | JSON entry for `opencode.json` | `.opencode/skills` |
| `deepseek-harness` | MCP client plugin YAML entry | `.dsh/skills` |
| `portable` | Common `mcpServers` JSON wrapper | `.agents/skills`, if supported by the host |

```bash
shadow-brain project config . --target claude-code
shadow-brain project config . --target opencode
shadow-brain project config . --target deepseek-harness
```

Recipes contain an absolute Node executable and installed CLI path. Regenerate them after moving the installation. OpenCode V2 uses `mcp.servers`; consult the documentation for an older host. DeepSeek Harness requires the MCP client plugin and, for skill discovery, the filesystem skill provider. Its documented MCP bridge supports tools and resources; prompt templates are unsupported. A generic wrapper is not universal configuration for every client.

The legacy Models panel uses provider settings configured for Shadow Brain. It returns model labels and enabled status to the browser. Coding-agent settings stay with their hosts. The old custom-agent configuration endpoint is retired.

[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) · [Claude Code MCP](https://code.claude.com/docs/en/mcp) · [OpenCode MCP](https://opencode.ai/docs/mcp-servers/) · [Harness MCP client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md) · [Harness filesystem skills](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/skill/skill-filesystem/README.md)

## Add workflow skills

```bash
shadow-brain skills install . --target codex
shadow-brain skills install . --target codex --apply
shadow-brain clients inspect .
```

The first command previews the reusable skill bundle. The second applies it. Local inspection checks only the selected project skill paths; it does not read client profiles or verify that a host loaded a skill. The **Project Kit** view separately generates a tailored skill from observed project evidence and your requirement. [Project Kit guide](PROJECT_KIT.md) · [Bundle installation and safe updates](WORKFLOW_INTEGRATION.md)

The project instructions guide a cooperating host to fetch a `project_brief` when substantive work starts and save actionable checkpoints for authorized shared work. The MCP connection also supplies this guidance to clients that use server instructions. A host follows its own trust and tool-approval rules. [Task workflow and checkpoints](WORKFLOW_INTEGRATION.md#start-with-project-memory-and-save-progress)

## Verify a connection

Start a substantive task with the connected host and check for a `project_brief` receipt. If needed, ask the host to call `project_brief` with a short query about the current task. Inspect the returned memory IDs and sources. A successful host call verifies the connection. With activity recording enabled, its measured boundaries appear in the matching portal’s Live view.

The memory profile offers scoped tools, resources and task/handoff prompt templates. A project-local MCP launch additionally exposes Project Kit, reviewed source evidence, collaboration, sessions and optional host-reported usage. Use the current `tools/list` response for available tools. Resource references are saved labels; the service does not open their targets. Project tool participation and conversation sharing apply to agent delivery through tools, resources and prompts.

`activity_report` records explicitly reported phases or spans. Reported activity is labelled separately from measured MCP calls. Neither exposes a model's hidden reasoning.

When activity recording is enabled, a measured project MCP request can include `argumentBytes`, the UTF-8 byte count of the original argument object serialized as compact JSON. Omitted arguments count as `{}`. A successful measured return can include `resultTextBytes`, the UTF-8 byte count of the first text content item delivered to the client. The counts exclude the JSON-RPC envelope and structured content. Rejected requests and other record types can omit these measurements. The journal retains the numeric sizes and standard event metadata.

## Keep an existing shared store

Existing global-store workflows remain available:

```bash
shadow-brain dash . --no-analysis
shadow-brain clients config --target codex --project .
```

For any other explicit store, add `--db PATH` to `clients config`. This prints a recipe for that file; it does not migrate or merge memory. The default dashboard cannot display a different store's activity journal. Use the project portal and its matching recipe for the simplest isolated setup.

[Workspace guide](WORKSPACE.md) · [MCP specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) · [Troubleshooting](TROUBLESHOOTING.md)
