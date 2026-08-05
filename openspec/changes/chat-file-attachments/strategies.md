# Chat File Attachments in Ark - Strategy Options

Notes on how to support sending images and PDFs when chatting with an Ark agent, and the trade-offs of each transport/storage strategy we discussed.

## The problem in one line

The attachment bytes have to travel from the browser to the executor (the thing that calls the model provider), and where those bytes live along the way is the whole design question.

## Constraints that shape everything

These are fixed facts. Every strategy has to live within them.

- **The Query CR is a bad place for bytes.** It lives in etcd, which has a hard object ceiling around 1.5 MB (~1 MB in practice). base64 adds ~33% on top of raw bytes, so a single ~1 MB PDF already exceeds the limit and the apiserver rejects the write. This is a wall, not a tuning knob.
- **base64 costs bytes, not context tokens.** The provider decodes the base64 back to binary and runs it through its vision encoder. Image token cost depends on resolution, not on the length of the base64 string. So base64 is inefficient for transport/storage, not for model context, as long as it stays in a structured content part and never leaks into a text field.
- **URLs are not an option here.** Even if some providers support it, the provider cannot fetch an in-cluster file gateway, and Bedrock cannot fetch URLs at all. So wherever the bytes live, they must be turned back into base64 at the moment of the provider call ("hydration").
- **LLM APIs are stateless.** Every turn resends the full conversation history. If an image is attached in turn 1, the provider needs it again on turn 3 to answer a follow-up about it. Discarding the bytes means the model is blind to the attachment on later turns - unless the provider is holding the file for us.

## What "memory" means in Ark

Relevant because one strategy uses it.

- "Memory" = conversation history. A `Memory` CRD just points at an HTTP service (the ark-broker).
- The broker stores messages either in RAM (default) or in **PostgreSQL** (`MESSAGE_BACKEND=postgres`). Messages are stored as opaque JSON, so they can already hold multi-part content with base64 blobs. Postgres has no practical size limit (bounded by TTL and count, not size).
- The completions executor already **reads history from memory before every run** and writes messages back to it. Memory is already in the hot path.

## Strategies

### 1. Inline base64 in the Query CR - RULED OUT

Put the content parts directly in `spec.input`.

**Not viable.** We do not want bytes in the Query CR at any size. Two reasons, both disqualifying:

- **Massive CRs.** Every read and list of the Query pulls the payload with it, bloating the apiserver, watches, and etcd for every consumer of the resource.
- **Hard size limitations.** The ~1.5 MB etcd ceiling (~1 MB in practice, worse after base64's ~33% overhead) caps attachments at thumbnails. Real PDFs do not fit, and the limit is not a tuning knob.

Kept here only to record why it was rejected. The remaining strategies all keep the bytes out of the CR.

### 2. Reference + hydrate via Postgres broker memory

Store the multimodal message in the Postgres-backed broker memory; the CR carries only a conversation reference; the executor sources the input from memory (which it already reads before each run).

- **Pros:** No new blob service. Durable and core to Ark. Rides the existing "executor reads memory before the run" path. No size wall.
- **Cons:** Reverses the current data flow - today bytes go CR -> executor -> memory, so ark-api would have to write the message to the broker at query creation and the executor would have to read input from memory instead of `spec.input`. Net-new wiring. Requires the Postgres backend to be enabled.
- **Expiration: yes, already built in.** The `messages` table has a non-null `expires_at`, set on insert to `now() + MESSAGE_VISIBILITY_TTL_SECONDS` (default 2592000, i.e. 30 days) and overridable per message by a `ttl_seconds` field in the POST body. So an attachment-bearing message can be given a shorter life than the conversation around it, with no schema change. Three caveats:
  - Expiry today is **visibility only**. Reads filter `WHERE expires_at > now()`, but no job deletes rows, so the bytes stay in Postgres after they stop being served. A real purge needs a small reaper (`DELETE FROM messages WHERE expires_at < now()`, cheap because `messages_expires_at_idx` already exists) or one of the existing hard-delete paths (delete conversation, delete by query).
  - The TTL is per **message**, not per attachment. A short-lived image should be its own message, otherwise the user's text vanishes with it.
  - Expiry is also what the executor sees, so **the TTL is exactly the attachment's usable multi-turn lifetime**. After it lapses the model is blind to the file again.
- **Good for:** Keeping everything inside core Ark with durability and a native TTL knob.

### 3. Reference + hydrate via the file-gateway (S3)

Route both local uploads and gateway picks into the file-gateway blob store. The CR carries only an object reference; the executor fetches and base64-encodes at send time.

- **Pros:** Purpose-built byte store. Unifies with the existing "attach a file from the gateway" requirement into one "object + reference" model. Scales best for large or many files.
- **Cons:** The file-gateway is a marketplace service, not core. Currently a 1 MB cap and wired only to the dashboard/MCP. Needs the new executor hydration step plus in-cluster fetch and auth.
- **Expiration: not out of the box - build it or swap the backend.** As deployed, the gateway is versitygw fronting a 1 Gi PVC, and its file-api exposes only list, upload, download, delete and delete-prefix. There is no TTL field and no S3 lifecycle support, because versitygw is a POSIX-backed S3 gateway rather than a full object store. Two ways to get expiration:
  - **Reaper CronJob:** key objects by conversation (e.g. `conversations/<id>/<file>`) and have a job delete objects older than N days via the existing delete/delete-prefix endpoints. Simple, but net-new code we own, and "age" comes from the object's mtime rather than a policy we set at upload.
  - **Back it with MinIO or real S3:** both implement lifecycle expiration rules natively (per bucket or prefix), so the store enforces the TTL and we write no reaper. This is a deployment change to a marketplace service.
- **Good for:** Large files and unifying local + gateway attachments, if we accept owning the expiration mechanism.

### 4. Do not persist durably - transient store + placeholder - RULED OUT

Hold the bytes just long enough to send to the provider, then keep only a placeholder (`name`, `dimensions`, `mime`) in the durable conversation record.

**Not viable.** We want multiple requests against the same file within one session. Because LLM APIs are stateless, this strategy makes the attachment visible to the model **only on the turn it was sent** - a follow-up question about the same PDF or image cannot be answered. That is exactly the behaviour we need, so the strategy is disqualified.

Kept here only to record why it was rejected.

### 5. Provider-side file storage (Files API / file_id)

Upload the file once to the provider, store only the returned `file_id` plus metadata, and reference the id on every later turn. Render a placeholder in the UI.

- **Pros:** The cleanest form of "store only name and dimensions" while keeping multi-turn working - the cheap id is resent, not the bytes. We never hold the bytes durably.
- **Cons / limits:**
  - `file_id`s are provider/account-scoped, so switching models mid-conversation across providers invalidates them.
  - **Not universal** (see matrix below). Bedrock has no such store, and generic OpenAI-compatible endpoints usually do not either.
  - Anthropic's Files API is still **beta** - the interface may change. It is also not zero-data-retention eligible, since it is stateful by definition.
- **Expiration: partly native, partly ours - and it is one-way.** Nothing expires by default on any of the three; uploaded files persist until deleted.
  - **OpenAI: native TTL.** Pass `expires_after` at upload (`anchor: created_at`, `seconds` between 3600 and 2592000, i.e. 1 hour to 30 days) and the provider deletes the file for us. The returned file object carries `expires_at`. Without it, files persist indefinitely (except `purpose=batch`, which is 30 days).
  - **Azure OpenAI: assume ours.** It mirrors the OpenAI surface, but `expires_after` has been reported as rejected on some purposes, so plan on explicit deletes rather than relying on the parameter.
  - **Anthropic: ours entirely.** There is no TTL parameter. Files live until we call `DELETE /v1/files/{file_id}`, against a 100 GB per-organisation storage cap, so a reaper is not optional here, it is the only mechanism. Deletes are not recoverable and may lag briefly for in-flight calls.
  - **The sharp edge:** because we deliberately never keep the bytes, expiry here is **irreversible**. Once the provider drops the file we cannot re-upload it, and the attachment is permanently unreadable for the rest of the conversation. Strategies 2 and 3 can always re-hydrate from our own copy; strategy 5 cannot.
- **Good for:** OpenAI / Azure / Anthropic-direct, where it gives the ideal behaviour, as long as the chosen TTL comfortably exceeds a conversation's life.

## Expiration - what holds across every remaining strategy

Whichever store wins, the same four things are true, so they belong in the spec once rather than per strategy.

- **A TTL is a cap on multi-turn usefulness, not just a storage policy.** The moment the bytes (or the `file_id`) go away, the model is back to being blind to the attachment. The TTL therefore has to be longer than a realistic conversation, not merely short enough to feel privacy-friendly.
- **Expiry must be a visible state, not a crash.** The conversation record keeps its placeholder (`name`, `dimensions`, `mime`) regardless, so the UI can still render the attachment, and a later turn referencing an expired file needs a clear "this attachment is no longer available" path rather than a provider 404 surfacing as a failed query.
- **Only two of the strategies can recover.** Retaining bytes (2 or 3) means an expired provider-side copy can be re-uploaded; strategy 5 alone cannot, because we hold nothing to re-upload from. Any hybrid should therefore expire the provider copy *earlier* than our own copy, not the other way round.
- **Deletion on request is a separate mechanism from TTL.** "Delete this conversation" already exists as hard deletes in the broker and as delete endpoints in the file-gateway; a TTL does not satisfy that requirement, and a hard delete does not satisfy the TTL requirement. Both are needed.

## Provider file-storage support

Ark targets four providers plus a generic OpenAI-compatible client.

| Provider | Provider-side file storage? | Native expiration? |
|---|---|---|
| OpenAI | Yes - Files API, `file_id` in content parts. | Yes - `expires_after` (1 hour to 30 days). |
| Azure OpenAI | Yes - mirrors OpenAI. | Nominally, but unreliable per purpose; plan on explicit deletes. |
| Anthropic (direct API) | Yes, but still **beta** (`files-api-2025-04-14`). | No - delete by API call only, 100 GB org cap. |
| Amazon Bedrock | **No** - inline bytes or customer-managed S3 only; Bedrock stores nothing. | N/A - nothing is stored to expire. |
| Generic / OpenAI-compatible | Depends on backend; usually not (vLLM, Ollama, LiteLLM, local). | N/A / backend-specific. |

Sharp edge: **Bedrock-hosted Claude does not get Anthropic's Files API.** Anthropic's file storage is on the direct Claude API, Claude-on-AWS, and Microsoft Foundry - explicitly not on Bedrock or Google Cloud. So "we use Claude" does not guarantee file storage; it depends on how you reach it.

## The hybrid that falls out of all this

With strategies 1 and 4 ruled out, and no single remaining strategy covering every provider, the shape is:

- Where provider file storage exists (OpenAI / Azure / Anthropic-direct): use strategy 5 - store only `file_id` + metadata, multi-turn intact.
- Where it does not (Bedrock, generic endpoints): retain the bytes ourselves (strategy 2 or 3) so later turns can resend them.

In all cases the durable conversation record holds a placeholder, and the Query CR never carries the bytes.

On expiration, the hybrid gets one extra rule: the provider-side copy should expire **sooner** than our own, so an expired `file_id` can be re-uploaded from bytes we still hold, instead of leaving a hole in the conversation.

## Work that is the same no matter which strategy wins

Roughly 80% of the change is executor-agnostic and does not get simpler by choosing a different executor or store:

- Dashboard: attach-file button, gateway pick, attachment rendering.
- ark-api: multimodal input validation, the list-content serialization fix, request-size guard.
- Controller: tolerate image-only content in defaulting/extraction.
- ark-sdk: widen the `Message.content` contract.
- ark-broker: raise/parameterize the JSON body limit.

The only part that differs by strategy is the "last mile": where the bytes live and how the executor turns a reference back into what the provider needs.
