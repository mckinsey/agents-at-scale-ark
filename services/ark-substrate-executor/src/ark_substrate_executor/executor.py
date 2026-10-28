"""SubstrateExecutor — an Ark ExecutionEngine that runs an agent as a Substrate actor.

Flow (see specs/substrate-execution-engine):
  Query -> execute_agent(request)
        -> derive + apply the actor's egress policy (default-deny + model/tool allowlist)
        -> ensure the ActorTemplate (ark-runner image + per-query env), create/resume actor
        -> wait for the agent to finish, collect its result from actor logs
        -> stream + return the result as Ark Messages; surface failures, never silent success

Lifecycle: one actor per (agent, conversationId) for stateful agents (resume across
turns); ephemeral per query for stateless.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import uuid
from urllib.parse import urlparse

from ark_sdk.executor import (
    ApprovalRequiredError,
    BaseExecutor,
    ExecutionContext,
    ExecutionEngineRequest,
    Message,
    ToolApprovalConfig,
)

from .substrate_client import SubstrateClient, SubstrateError

logger = logging.getLogger(__name__)

# ark-runner image (digest-pinned in a real build) + template name.
RUNNER_IMAGE = os.environ.get("ARK_RUNNER_IMAGE", "ark-runner:latest")
RUNNER_TEMPLATE = os.environ.get("ARK_RUNNER_TEMPLATE", "ark-runner")
ATESPACE = os.environ.get("ARK_SUBSTRATE_ATESPACE", "default")
ALLOW_ALL_EGRESS = os.environ.get("AX_ALLOW_ALL_EGRESS", "").lower() in ("1", "true", "yes")
RESULT_TIMEOUT_SECONDS = int(os.environ.get("ARK_SUBSTRATE_RESULT_TIMEOUT_SECONDS", "300"))

# Egress-gateway credential injection (task 3.4, specs/substrate-egress-credentials). When
# ARK_SUBSTRATE_CREDENTIAL_URI is set (ate-secret://k8s.io/<provider>/<ns>/<secret>[/<key>]),
# the executor injects it on the model's https egress rule and STRIPS the model apiKey from
# the request — so the credential never enters the sandbox; the egress gateway substitutes it.
# TODO: derive the URI from the Model's secretKeyRef instead of a static env (ark-sdk
# pre-resolves apiKey to a literal, hiding the ref — would need the executor to re-read CRDs).
CREDENTIAL_URI = os.environ.get("ARK_SUBSTRATE_CREDENTIAL_URI", "")
CREDENTIAL_HEADER = os.environ.get("ARK_SUBSTRATE_CREDENTIAL_HEADER", "Authorization")
CREDENTIAL_PREFIX = os.environ.get("ARK_SUBSTRATE_CREDENTIAL_PREFIX", "Bearer ")

# Runner env contract — must match ark_runner.config (keep in sync).
REQUEST_ENV = "ARK_AGENT_REQUEST"
FRAMEWORK_ENV = "ARK_FRAMEWORK"
RESULT_PATH_ENV = "ARK_RESULT_PATH"
RESULT_NONCE_ENV = "ARK_RESULT_NONCE"  # keep in sync with ark_runner.config.RESULT_NONCE_ENV
RESULT_PATH = "/workspace/.ark-result.json"
RESULT_SENTINEL = "__ARK_RESULT__"  # keep in sync with ark_runner.config.RESULT_SENTINEL
EVENT_SENTINEL = "__ARK_EVENT__"  # keep in sync with ark_runner.config.EVENT_SENTINEL

# Default provider endpoints when a model declares no baseUrl (host-only, for egress).
_PROVIDER_HOSTS = {"openai": "api.openai.com", "anthropic": "api.anthropic.com"}

_LABEL = re.compile(r"[^a-z0-9-]+")


def _actor_name(agent: str, conversation_id: str | None) -> str:
    """RFC-1123 label identifying the actor for this agent/session."""
    base = agent if not conversation_id else f"{agent}-{conversation_id}"
    name = _LABEL.sub("-", base.lower()).strip("-")
    return name[:63] or "agent"


def _host(url: str) -> str | None:
    if not url:
        return None
    parsed = urlparse(url if "://" in url else f"https://{url}")
    return parsed.hostname


def _egress_hosts(request: ExecutionEngineRequest) -> tuple[list[str], list[str]]:
    """Derive the (http, https) egress allowlist from the agent's modelRef + mcpServers
    (specs/substrate-egress-credentials). Model endpoints are https."""
    https: set[str] = set()
    http: set[str] = set()

    model = getattr(request, "agent", None) and request.agent.model
    if model is not None:
        provider = (model.type or "").lower()
        pcfg = (model.config or {}).get(provider, {}) if isinstance(model.config, dict) else {}
        host = _host(pcfg.get("baseUrl", "")) or _PROVIDER_HOSTS.get(provider)
        if host:
            https.add(host)

    for server in getattr(request, "mcpServers", None) or []:
        url = getattr(server, "url", "")
        host = _host(url)
        if not host:
            continue
        (http if url.startswith("http://") else https).add(host)

    return sorted(http), sorted(https)


def _log_message(line: str) -> str:
    """Unwrap an ateom JSON log line ({"time","message"}) to its message, else the raw line."""
    stripped = line.strip()
    if stripped.startswith("{"):
        try:
            return str(json.loads(stripped).get("message", stripped))
        except json.JSONDecodeError:
            return stripped
    return stripped


def _parse_result_logs(logs: str, nonce: str) -> list[Message] | None:
    """Extract THIS query's result sentinel (`__ARK_RESULT__ <nonce> <json>`) from the shared
    worker-pod log, or None if not present yet. The nonce disambiguates concurrent/stale actors.

    A `status=approval_required` payload means the runner paused on a gated tool call: raise
    ApprovalRequiredError so execute_agent surfaces it as an A2A input-required task (HITL),
    rather than returning it as a normal result."""
    prefix = f"{RESULT_SENTINEL} {nonce} "
    for line in reversed(logs.splitlines()):
        msg = _log_message(line)
        if msg.startswith(prefix):
            payload = json.loads(msg[len(prefix):].strip())
            if payload.get("status") == "approval_required":
                cfg = payload.get("approval") or {}
                raise ApprovalRequiredError(
                    payload.get("toolCalls") or [],
                    ToolApprovalConfig(
                        required=True,
                        timeout=cfg.get("timeout", ""),
                        onTimeout=cfg.get("onTimeout", ""),
                    ),
                    ExecutionContext(**(payload.get("context") or {})),
                )
            return [Message(**m) for m in payload.get("messages", [])]
    return None


class SubstrateExecutor(BaseExecutor):
    def __init__(self) -> None:
        super().__init__("Substrate")
        self.substrate = SubstrateClient(
            atespace=ATESPACE, kube_context=os.environ.get("ARK_SUBSTRATE_CONTEXT")
        )

    async def execute_agent(self, request: ExecutionEngineRequest) -> list[Message]:
        agent = getattr(getattr(request, "agent", None), "name", None) or "agent"
        # Fresh, unique template + actor per query. The request is baked into the template env,
        # so a shared/reused template would serve a stale input and resuming a shared golden
        # snapshot is unreliable; a dedicated ephemeral template+actor per query avoids both.
        # Warm per-(agent,conversationId) reuse is deferred (Phase 3 — snapshot-backed sessions).
        qid = uuid.uuid4().hex[:12]
        actor = f"{_actor_name(agent, None)}-{qid}"
        template = f"{RUNNER_TEMPLATE}-{qid}"

        await self.update_query_phase("running", "SubstrateActorStarting", actor)

        try:
            # 1. Provision the ActorTemplate (ark-runner image + this query's env) and the actor.
            await self.substrate.ensure_actor(
                actor=actor, template=template, image=RUNNER_IMAGE, env=self._runner_env(request, qid)
            )

            # 2. Egress policy is nested under the actor, so it must be created AFTER the actor
            #    exists. Default-deny + an allowlist derived from the model + mcpServers
            #    (specs/substrate-egress-credentials). allow_all is a local-dev toggle only.
            http_hosts, https_hosts = _egress_hosts(request)
            inject = None
            if CREDENTIAL_URI:
                inject = [{"header": CREDENTIAL_HEADER, "prefix": CREDENTIAL_PREFIX, "credential_uri": CREDENTIAL_URI}]
            await self.substrate.ensure_egress(
                actor,
                http_hosts=http_hosts,
                https_hosts=https_hosts,
                allow_all=ALLOW_ALL_EGRESS,
                inject=inject,
            )

            # 3. Resume the actor to run the agent, then collect its result from the actor logs.
            await self.substrate.resume_actor(actor)
            messages = await self._collect_result(actor, qid)
        except ApprovalRequiredError:
            # HITL: the agent paused on a gated tool call. This is NOT a failure — let it
            # propagate so the ExecutorApp returns an A2A input-required task and the query
            # transitions to input-required (not error). The ephemeral actor is torn down in
            # finally; the pending state rides in the A2ATask, so resumption uses a fresh actor.
            raise
        except Exception as e:  # scheduling/agent/backend failure must surface, not silently succeed
            logger.exception("substrate execution failed")
            await self.update_query_phase("error", "SubstrateExecutionFailed", str(e))
            raise
        finally:
            # Ephemeral: tear down this query's actor + template. A RUNNING actor (ark-runner
            # stays up as PID-1) must be suspended before it can be deleted. Best-effort.
            try:
                await self.substrate.suspend_actor(actor)
            except Exception:
                logger.debug("suspend before delete failed for %s", actor)
            try:
                await self.substrate.delete_actor(actor)
                await self.substrate.delete_template(template)
            except Exception:
                logger.exception("cleanup failed for %s / %s", actor, template)

        # Intermediate output (including the final assistant text) was already streamed to the
        # broker via _relay_events during polling; just set the result here.
        await self.update_query_phase("done", "SubstrateActorCompleted", actor)
        return messages

    async def _collect_result(self, actor: str, nonce: str) -> list[Message]:
        """Poll actor logs: relay intermediate events to the broker, return on the result sentinel."""
        deadline = asyncio.get_event_loop().time() + RESULT_TIMEOUT_SECONDS
        relayed = 0
        while True:
            logs = await self.substrate.logs(actor)
            relayed = await self._relay_events(logs, nonce, relayed)
            messages = _parse_result_logs(logs, nonce)
            if messages is not None:
                return messages
            if asyncio.get_event_loop().time() >= deadline:
                raise SubstrateError(
                    f"actor {actor} produced no result within {RESULT_TIMEOUT_SECONDS}s"
                )
            await asyncio.sleep(2)

    async def _relay_events(self, logs: str, nonce: str, already_relayed: int) -> int:
        """Stream newly-seen intermediate event lines for THIS query to the broker; return count."""
        prefix = f"{EVENT_SENTINEL} {nonce} "
        events = [
            _log_message(line)[len(prefix):].strip()
            for line in logs.splitlines()
            if _log_message(line).startswith(prefix)
        ]
        for text in events[already_relayed:]:
            await self.stream_chunk(text)
        return len(events)

    def _runner_env(self, request: ExecutionEngineRequest, nonce: str = "") -> dict[str, str]:
        """Translate the agent/model/tool spec into env for the config-driven runner.

        The whole request (prompt, modelRef, tools/mcpServers, userInput) is serialized
        into ARK_AGENT_REQUEST; ark-runner's config.load_request() parses it back into the
        same ark-sdk type, so one runner image serves any agent/framework (task 2.6).

        Phase-1 credential stopgap (task 2.9): model/tool credentials ride inside the
        serialized model config, delivered via env. This is explicitly insecure and is
        replaced by Substrate egress-gateway injection in Phase 2 (task 3.4,
        specs/substrate-egress-credentials).
        """
        request_json = request.model_dump_json()
        if CREDENTIAL_URI:
            # Zero-creds-in-sandbox (task 3.4): drop the resolved apiKey so the actor never holds
            # it; the egress gateway injects the real credential into the outbound request.
            data = request.model_dump()
            for provider_cfg in (data.get("agent", {}).get("model", {}).get("config") or {}).values():
                if isinstance(provider_cfg, dict):
                    provider_cfg.pop("apiKey", None)
            request_json = json.dumps(data)
        env = {
            REQUEST_ENV: request_json,
            FRAMEWORK_ENV: self._framework(request),
            RESULT_PATH_ENV: RESULT_PATH,
            RESULT_NONCE_ENV: nonce,
        }
        # Pass through any ARK_RUNNER_* knobs set on the executor (e.g. ARK_RUNNER_TLS_INSECURE
        # for the dev egress-MITM case) into the actor's container env.
        for key, value in os.environ.items():
            if key.startswith("ARK_RUNNER_") and key != "ARK_RUNNER_IMAGE":
                env[key] = value
        return env

    def _framework(self, request: ExecutionEngineRequest) -> str:
        """Adapter selector from the agent spec; defaults to completions (task 2.6/3.1).

        AgentConfig.parameters is a list[Parameter{name,value}] (ark-sdk overlay)."""
        params = getattr(getattr(request, "agent", None), "parameters", None) or []
        value = next((p.value for p in params if p.name == "framework"), None)
        return str(value) if value else "completions"
