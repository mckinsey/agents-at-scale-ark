# Simple Agent

A minimal [A2A](https://a2a-protocol.org) server you can deploy to Ark. It shows
the smallest end-to-end shape of an A2A agent — an agent card, a message
handler, and the Kubernetes resources Ark needs to discover it — without any LLM
or external dependencies.

The agent is keyword-based (no model) and exposes three skills:

- **Basic conversation** — responds to greetings and "tell me about yourself".
- **Simple math** — adds or multiplies numbers found in the message.
- **Echo** — echoes the message back.

The "agent" here is the A2A-protocol sense — a service that publishes an agent
card and handles messages — not an LLM agent. The response logic lives in
`SimpleAgentExecutor._process_message`; that method is the seam where a real
implementation would call an LLM or agent framework. Everything around it (the
agent card, A2A server, and Ark discovery) stays the same.

## Layout

```
simple-agent/
├── src/simple_a2a_server/
│   ├── __main__.py        # `python -m simple_a2a_server` entry point
│   └── main.py            # agent card, executor, and Starlette app
├── Dockerfile             # container image
├── manifests.yaml         # Deployment + Service + A2AServer
├── devspace.yaml          # in-cluster dev with live reload
├── Makefile               # `make dev` / `make lint`
├── pyproject.toml         # dependencies (a2a-sdk, starlette, uvicorn)
└── uv.lock                # pinned dependency versions
```

## Run locally

```bash
make dev
```

The server listens on `http://0.0.0.0:8000`. Verify it:

```bash
# Agent card (a2a-sdk 0.2.x serves it here).
curl http://localhost:8000/.well-known/agent.json | jq .

# Health check.
curl http://localhost:8000/health

# Send a message.
curl -X POST http://localhost:8000/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"message/send","id":1,
       "params":{"message":{"messageId":"1","role":"user",
       "parts":[{"kind":"text","text":"hello"}]}}}' | jq .
```

## Deploy to a cluster

`devspace dev` builds the image, applies `manifests.yaml`, and runs the
container with live reload:

```bash
devspace dev
```

Ark watches the `A2AServer`, loads the agent card, and creates an `Agent` you can
query:

```bash
ark agent query simple-agent "calculate 2 + 3"
```

Tear down with `devspace purge`.

## Documentation

For the full walkthrough — local testing with the A2A Inspector, in-cluster
integration, and timeout configuration — see the
[Building A2A Servers](https://github.com/mckinsey/agents-at-scale-ark/blob/main/docs/content/developer-guide/building-a2a-servers.mdx)
guide.
