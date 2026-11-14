# Teach the project from your own notes

Open **Knowledge**, write ordinary text and click **Add to memory**. For example: “The cupboard is black. Keep its brass handles.” The project is fixed by the workspace you opened. In **Context**, ask “What colour is the cupboard?” to inspect the retrieved fact and its original source. Connected agents can request the same project context through MCP.

Direct saving supports up to 6,000 characters and 20 paragraphs. It preserves the original text and saves each paragraph as reference knowledge. Retrying the same note reuses the same records; earlier approved corrections remain intact. Previously skipped parts are not silently approved. No title, file or special format is needed, and no model is trained by saving a note.

For longer notes or a correction before saving, choose **Review first**. Optional uploads support `.txt`, `.md`, `.json` and the separate PDF workflow. Ordinary text is the main path; files and JSON are optional.

A preview splits plain text into paragraphs and displays their original lines. The title comes from the first nonblank line; a simple keyword rule suggests a category such as requirement, plan, or knowledge. These are suggestions, not an AI interpretation. Read each item, change its title, text, or category if needed, and approve or reject it. Approved text becomes project memory and may be used in later context. Pending and rejected items are not added as memories. Corrections take effect when you approve the corrected wording; this changes recorded context and does not train model weights.

Previewing a valid source saves its original bytes, digest, filename, and review items in the project-owned source store even before approval. A second upload of identical bytes reopens the same review. The evidence view shows the original text and location alongside your approved wording; it verifies the stored relationship, not whether the claim is true. Do not include information you do not want saved in the project. The app does not read a browser's history, session data, or private client configuration to perform an import. Structured credential-shaped fields are rejected, but free-text secret detection is not comprehensive.

Text and Markdown must be UTF-8 and are limited to 1 MiB, 500 sections, 6,000 characters per section, and 180,000 extracted characters in total. Break long paragraphs into smaller ones before importing. Text PDFs use the separate PDF page-review workflow and its limits; scanned/image-only PDFs require OCR, which this workflow does not provide.

JSON accepts the following three versioned or simple interchange formats, plus an array of messages. Each content value must be a string. Unsupported nested exports, attachments, multimodal content, and unknown fields are rejected instead of silently omitted. System and developer roles in an imported transcript are quoted source evidence only; they do not become instructions to the app or an agent.

```json
{"schemaVersion":1,"kind":"knowledge","title":"Project notes","records":[{"title":"Build command","content":"Run the build before release.","source":"README.md"}]}
```

```json
{"schemaVersion":1,"kind":"transcript","title":"Review discussion","messages":[{"role":"user","content":"Preserve Unicode."},{"role":"assistant","content":"The proposed constraint is to preserve Unicode."}]}
```

```json
{"messages":[{"role":"user","content":"Preserve Unicode."}]}
```

Source labels such as `README.md` are citations only and are not opened. No import makes claims in a note true or independently verifies them. Review and correct the text before approving it.

## Save a reviewed transcript as session history

After reviewing a transcript, select **Open reviewed history in Sessions**. This creates a completed session containing only the messages approved at that time, preserving their original speaker labels and source locations. Messages labelled system, developer, or tool remain untrusted quoted notes. Repeating the import opens the existing snapshot; review all desired messages before the first import. No summary is generated automatically. You may write a checkpoint yourself and share its resume request with another connected project host. A portal continuation creates a portal-owned record, not a running model or a native host conversation.
