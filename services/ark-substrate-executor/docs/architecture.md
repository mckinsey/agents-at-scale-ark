# Ark × Agent Substrate — runtime architecture

## 1. Request flow (one Query)

```
                      minikube cluster
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                                │
│  ark-system namespace                      ate-system namespace (Substrate)    │
│  ┌───────────────┐                         ┌──────────────────────────────┐    │
│  │ ark-controller│                         │ ate-api-server (ateapi gRPC) │    │
│  └──────┬────────┘                         │ atenet-egress (MITM gateway) │    │
│         │ (1) Query over A2A               │ k8s-credential-provider      │    │
│         ▼                                   │ rustfs (snapshots)           │    │
│  ┌──────────────────────────┐              └───────────┬──────────────────┘    │
│  │ ark-substrate-executor   │   (2) ateapi calls:      │                       │
│  │  (the ExecutionEngine)   │───ensure template────────┤                       │
│  │                          │   create actor           │                       │
│  │  OUTSIDE the sandbox —   │   create egress policy   │                       │
│  │  orchestrates only       │   (+ credential inject)  │                       │
│  │                          │───(3) resume actor───────┤                       │
│  └──────────┬───────────────┘                          │ (4) schedule + boot   │
│             │                                           ▼                       │
│             │                 ate-demo-counter ns: ateom worker pod            │
│             │                 ┌───────────────────────────────────────────┐   │
│             │                 │  gVisor sandbox (runsc)  ← Substrate builds │   │
│             │                 │  ┌─────────────────────────────────────┐    │   │
│             │                 │  │ ark-runner (PID-1)  ← the workload   │    │   │
│             │                 │  │  • reads ARK_AGENT_REQUEST          │    │   │
│             │                 │  │  • completions adapter → messages   │    │   │
│             │                 │  │  • model_client ─┐  mcp_client ─┐   │    │   │
│             │                 │  │  • prints __ARK_RESULT__ <nonce> │   │    │   │
│             │                 │  └──────────────────┼──────────────┼───┘    │   │
│             │                 └─────────────────────┼──────────────┼────────┘   │
│             │ (6) read result                       │ (5) HTTPS,   │ MCP tools  │
│             │     from worker-pod log                │ placeholder  │            │
│             │     (k8s PodLogs)                      ▼ auth header  ▼            │
│             │                                 atenet-egress (injects real cred) │
│             ▼                                        │                          │
│   Query.status.response ◀───────────────────────────┼──────────────────────────│
└──────────────────────────────────────────────────────┼─────────────────────────┘
                                                        ▼
                                              external LLM / MCP endpoints
                                              (e.g. QuantumBlack gateway)

Steps: (1) controller dispatches the Query over A2A → (2) executor provisions the
actor via ateapi → (3) resume = hand-off → (4) Substrate boots ark-runner in a gVisor
sandbox → (5) ark-runner calls the LLM/tools out through the egress gateway (which injects
the real credential; the sandbox only ever holds a placeholder) → (6) executor reads the
result sentinel from the worker-pod log and returns it → controller writes the response.
```

## 2. Who lives where (the sandbox is NOT ark-runner)

```
minikube node (containerd runtime)
└─ ateom worker pod                      ← Substrate schedules a normal k8s pod
   └─ gVisor sandbox (runsc)             ← THE SANDBOX: Substrate builds it, enforces
      │                                     syscall/fs/network isolation
      └─ ark-runner  (PID-1 process)     ← THE WORKLOAD inside the sandbox (our code)
         • serves /healthz /readyz (runner contract)
         • runs the Ark agent (prompt → model → tools → result)
```

- **Substrate (`ateom`/`atelet`)** *builds* the sandbox around a container.
- **gVisor** *is* the sandbox (the isolation mechanism).
- **ark-runner** is the *workload running inside* it — subject to the isolation, not the source of it.

## 3. Division of labor

| Component | Where | Role |
|-----------|-------|------|
| ark-controller | cluster | dispatches the Query to the ExecutionEngine over A2A |
| ark-substrate-executor | cluster (outside sandbox) | orchestrates the actor lifecycle via ateapi; ferries request in / result out |
| Substrate (ateapi, ate-controller, ateom) | cluster | builds & lifecycles the gVisor actor, snapshots, scheduling |
| atenet-egress + credential-provider | cluster | MITM egress + injects the real credential (zero-creds-in-sandbox) |
| gVisor | the sandbox | isolation boundary |
| **ark-runner** | **inside the sandbox** | runs the agent: LLM call, MCP tools, response → result sentinel |
```
