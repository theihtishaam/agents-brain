# A visual guide to Agent Shadow Brain

These captures show the running app on an isolated project with synthetic fixture content. The workspace persisted the records and processed local MCP calls. The model field remains unavailable.

## Open the control room

![Animated Brain Hub with recorded activity, focused memory, and replay](assets/7.1.4-hub-walkthrough.gif)

Start `shadow-brain project workspace . --port 62595` and open `/hub`. The header confirms whether the local workspace responded. A reachable workspace can have no host activity. When the process stops, the page retains its loaded snapshot and retries. Restarting the same project on the same port restores the route.

![The control room with stored graph relationships, a selected replay event, and context estimates](assets/7.1.4-hub-control-room.png)

| Visual | Evidence |
| --- | --- |
| Cyan graph links | A memory belongs to a project. |
| Pink graph links | A memory was recorded by an agent or operator. |
| Amber graph links | A persisted typed relationship, or a reported event when its route is highlighted. |
| Moving packet | A newly received journal record. Measured MCP events use cyan; explicit host reports use amber. |
| Fine blue lattice | Illustrative surface. The record and relationship counts come from the graph API. |
| Inspector | Stored record, source references, links, or a selected journal event. |

Choose a node with the pointer or open **Node list** and select it with the keyboard. **Clear focus** restores the surrounding relationships. **Trace** lists retained journal events. Seek with the slider or select a timeline row. **Latest** follows new events. **Pause motion** and the system reduced-motion preference stop animation.

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

[Quickstart](QUICKSTART.md) · [Workspace guide](WORKSPACE.md) · [Troubleshooting](TROUBLESHOOTING.md)
