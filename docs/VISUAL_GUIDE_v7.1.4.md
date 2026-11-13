# A visual guide to Agent Shadow Brain

The control room captures use an isolated store containing 74 excerpts from 18 public Agent Brain documents, with 54 links backed by Markdown references in the excerpts. The journal records three measured calls from a scripted local MCP client. The workflow screenshots farther down use separate synthetic fixtures and carry an on-screen label. [Public documentation snapshot](https://github.com/theihtishaam/agents-brain/tree/2e26e7b349db4dd75bf0277b28caff8044190d16)

## Open the control room

![Animated Brain Hub with public documentation, focused memory, and measured MCP activity](assets/7.1.4-hub-public-docs.gif)

Start `shadow-brain project workspace . --port 62595` and open `/hub`. The header confirms whether the local workspace responded. A reachable workspace can have no host activity. When the process stops, the page retains its loaded snapshot and retries. Restarting the same project on the same port restores the route.

![The control room with actual documentation references and a measured context tool receipt](assets/7.1.4-hub-public-docs.png)

| Visual | Evidence |
| --- | --- |
| Cyan graph links | A memory belongs to a project. |
| Pink graph links | A memory was recorded by an agent or operator. |
| Amber graph links | A persisted typed relationship. |
| Moving highlight | A fresh journal record whose project and author are both present in the graph. Measured events use cyan and explicit reports use amber. The arc locates an event in the graph. |
| Faint outer outline | A placement guide for the stored nodes. |
| Inspector | Stored record, source references, links, or a selected journal event. |

Choose a node with the pointer or open **Node list** and select it with the keyboard. **Clear focus** restores the surrounding relationships. **Trace** lists retained journal events. Seek with the slider or select a timeline row. **Latest** follows new events. **Pause motion** and the system reduced-motion preference stop animation.

![Focused public documentation excerpt with its actual repository-relative source path](assets/7.1.4-hub-public-docs-source.png)

![A reachable empty project with zero real graph records](assets/7.1.4-hub-empty.png)

## Approve a cited page

![Extracted PDF text and the approved source page in Knowledge](assets/7.1.4-hub-knowledge.png)

Upload a project PDF and open a page. Review its extracted text and citation before approving it into the project’s memory. Uploading identical bytes returns the existing document. Image-only pages require OCR, which this build does not provide. **Add knowledge** accepts explicit text. The **Project skill** form previews a generated host skill and applies that exact plan after review.

## Share a workstream

```mermaid
flowchart TD
  Room[Room goal] --> Discussion[Proposals, critiques, and replies]
  Room --> Task[Task and revisioned claim]
  Task --> File[Project artifact and SHA-256]
  File --> Accept[Operator acceptance]
  Discussion --> Ack[Recipient acknowledgement]
  File --> Ack
  Accept --> Outcome[Recorded result and evidence]
  Outcome --> Lesson[Candidate lesson and recorded evaluation]
  Lesson --> Promote[Explicit promotion or rollback]
```

The browser and project-local MCP tools can read the same workroom, report outcomes, and resume from recorded state. Lessons record operator-supplied comparisons. Promotion requires a failed baseline, a passing candidate, and passing safety controls. Rollback archives the promoted memory’s retrieval influence. Native host loading and a live exchange should be checked in each selected host.

![A real lesson evaluation with a recorded rollback](assets/7.1.4-hub-learning.png)

## Inspect estimates and host evidence

- **Context** builds a pack for the selected project and can compare adaptive and legacy retrieval. The estimates describe rendered context. Review the selected sources before copying.
- **Models** shows local client skill-file checks and retained activity evidence. Model identity and provider counts stay unavailable.
- **Usage** separates measured tool timing from explicit reports. Counts describe the retained journal loaded by this workspace. Context token estimates do not quantify provider charges.
- **Setup** provides configuration recipes and live feature controls. A printed recipe or detected skill file does not establish that a host connected.

![Classic Context Lab with explained retrieval](assets/7.1.4-context-lab.png)

![Detailed activity diagnostics with replay](assets/7.1.4-replay.png)

![Hub Setup with local feature switches and host recipes](assets/7.1.4-hub-setup.png)

<img src="assets/7.1.4-hub-mobile.png" width="390" alt="Brain Hub on a 390 pixel mobile viewport">

[Quickstart](QUICKSTART.md) · [Workspace guide](WORKSPACE.md) · [Features and limits](FEATURES_AND_LIMITS.md) · [Troubleshooting](TROUBLESHOOTING.md)


