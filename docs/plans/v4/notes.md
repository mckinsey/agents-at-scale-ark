# Open Questions

## Team validation across engines

Drew proposes replacing `validateNoMixedTeam()` with capability matching via Agent Cards. The question: do we actually have a problem here?

As long as an agent can execute and return an A2A response, it can participate in a team. The team orchestrator just sends queries and gets text back. But the limitation might be conversation history — does something need to maintain a record of conversation across team members? If engine A doesn't persist history the same way engine B does, does the team orchestrator break?

Things to figure out:
- Is the current team orchestrator stateless enough that any A2A-responding agent works?
- Or does it assume history is managed in a specific way (e.g., controller-side memory)?
- If an engine manages its own sessions (Claude SDK with `--resume`), how does team history flow?
- Do we need Agent Cards for this, or is "can execute a query" sufficient for teams?

Not speccing this yet — need to look at the actual team orchestrator code.

## Attachments, files, and workspaces

### The problem

Different engines have different file capabilities. Responses API handles PDFs and docx natively. v1 completions can only embed small images via data URLs. Claude Code has its own filesystem. Queries need a way to carry files, and engines need to declare what they accept.

### What A2A already gives us

A2A messages support three part types: `TextPart`, `FilePart` (URI or inline bytes), `DataPart` (structured JSON). Ark already converts these on the receive side (`a2a_protocol.go` handles `FilePart`/`FileWithBytes`/`FileWithUri` → `A2ATaskPart`). Agent Cards declare `inputModes`/`outputModes` as MIME type lists. There's a standard error for rejection (`ContentTypeNotSupportedError`).

The gap today: Query input is string-only, the send side only builds `TextPart`, and engines don't advertise MIME capabilities.

### Workspaces as the storage layer

A **Workspace** is a CRD. Its implementation is a PVC — but the CRD adds metadata, lifecycle, and an optional API on top. Think of it the same way as ExecutionEngine: the CRD is the pointer, the PVC is the backing storage.

A Workspace optionally exposes an API endpoint for upload/download. This means:

- **Users upload files to a workspace** via the API (multipart upload → stored on the PVC)
- **Queries reference workspace files** — either by linking (`workspace: my-ws, path: /data/report.pdf`) or by embedding small files inline (base64, for tiny attachments)
- **Engines get files via A2A** — the controller resolves workspace references into A2A `FilePart`s:
  - Small files → `FileWithBytes` (inline, base64)
  - Large files → `FileWithUri` (pre-signed URL or workspace API URL)
- **Engines write files back** — engine returns A2A artifacts with `FilePart`s, controller stores them in the workspace
- **Engines can mount workspaces directly** — a session-isolated engine (Scenario 3/scheduler) could mount the workspace PVC into the session pod, giving Claude Code direct filesystem access

### How it composes

```
User                    Ark Controller              Engine
  │                          │                         │
  ├─ upload file ──────────▶ Workspace API             │
  │                          │ (stores on PVC)          │
  │                          │                         │
  ├─ create Query ─────────▶ Query CR                  │
  │   input: "analyse this"  │ attachments:             │
  │   attachment: ws://my-ws │   - workspace: my-ws    │
  │     /data/report.pdf     │     path: /report.pdf   │
  │                          │                         │
  │                          ├─ resolve attachment     │
  │                          │   small? → FileWithBytes│
  │                          │   large? → FileWithUri  │
  │                          │     (workspace API URL) │
  │                          │                         │
  │                          ├─ A2A message ──────────▶│
  │                          │   TextPart: "analyse"   │
  │                          │   FilePart: report.pdf  │
  │                          │                         │
  │                          │◀── A2A response ────────┤
  │                          │   TextPart: "analysis"  │
  │                          │   FilePart: output.csv  │
  │                          │                         │
  │                          ├─ store artifact         │
  │                          │   → workspace PVC       │
  │                          │                         │
  ◀─ query result ──────────┤                         │
     text + artifact refs    │                         │
```

### Three attachment modes

1. **Inline (small files)** — base64 in the Query CRD, sent as A2A `FileWithBytes`. Works for any engine. Limited by etcd size (~1MB per CRD object).

2. **Workspace reference (large files)** — Query references a workspace path. Controller resolves to a URL. Sent as A2A `FileWithUri`. Engine fetches from the workspace API. No size limit.

3. **Direct mount (session-isolated engines)** — The scheduler engine mounts the workspace PVC into the session pod. Claude Code reads/writes files directly on the filesystem. No A2A file transfer needed — the file is just there.

### Engine capability declaration

Engines declare what they accept via annotations or Agent Card `inputModes`:

```yaml
apiVersion: ark.mckinsey.com/v1
kind: ExecutionEngine
metadata:
  name: responses-engine
  annotations:
    ark.mckinsey.com/input-modes: "text/plain,application/pdf,image/png,image/jpeg"
    ark.mckinsey.com/output-modes: "text/plain,application/json"
```

The completions engine would declare `text/plain,image/png` (data URL images only). The Responses engine would declare the full set. The controller checks before sending — if the query has a PDF attachment but the engine only accepts text, it rejects early with a clear error.

### What this means for the spec

- **Workspace is a separate CRD** — not part of the ExecutionEngine spec. It's a storage resource that engines, queries, and users interact with.
- **Query CRD gets an `attachments` field** — references to workspace paths or inline data.
- **A2A carries files natively** — no new protocol needed. `FilePart` is already in the spec.
- **Engines declare MIME capabilities** — via annotations or Agent Card. Controller validates before dispatch.
- **Workspaces are optional** — inline attachments work without a workspace. Workspaces add large file support and persistence.
