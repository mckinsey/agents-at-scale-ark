"""Provider-agnostic model client for the runner (OpenSpec task 2.7, Option C).

Ark's provider-agnostic model client is Go (`ark/executors/completions/model.go` +
`provider_*.go`) and cannot be imported from this Python runner. Rather than bake a
framework/provider per image (the AX trap the proposal warns against), this mirrors that
Go dispatch in Python, keyed off the same `Model` shape ark-sdk delivers:

    Model.type   = provider: "openai" | "azure" | "bedrock" | "anthropic"
    Model.config = { <provider>: { "apiKey", "baseUrl", "apiVersion", "properties" } }
    Model.name   = resolved model / deployment name

Keep the provider set and config keys in sync with ark-sdk's `_resolve_model`
(lib/ark-sdk/.../extensions/query.py) and Ark's Go providers.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 120

# Substrate's egress gateway MITMs outbound HTTPS and re-signs with its own CA. In a dev
# cluster the runner may not trust that CA; ARK_RUNNER_TLS_INSECURE=true skips verification.
# Production should instead trust the egress-mitm ClusterTrustBundle (not set this).
_TLS_VERIFY = os.environ.get("ARK_RUNNER_TLS_INSECURE", "").lower() not in ("1", "true", "yes")


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=TIMEOUT_SECONDS, verify=_TLS_VERIFY)


def _provider_config(model: Any) -> dict[str, Any]:
    """The resolved config block for this model's provider (config is {provider: {...}})."""
    cfg = getattr(model, "config", None) or {}
    return cfg.get(model.type, {}) if isinstance(cfg, dict) else {}


def _properties(pc: dict[str, Any]) -> dict[str, Any]:
    props = pc.get("properties") or {}
    return props if isinstance(props, dict) else {}


async def generate(model: Any, messages: list[dict[str, str]]) -> str:
    """Call the model's provider and return the assistant text (no tools)."""
    message = await complete(model, messages, tools=None)
    return message.get("content") or ""


async def complete(
    model: Any, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    """Call the model and return the full assistant message ({role, content, tool_calls}).

    `tools` is the OpenAI function-tool schema; when the model elects to call a tool the
    returned message carries `tool_calls` (task 2.8). Anthropic tool-calling and Bedrock are
    not yet ported.
    """
    provider = (model.type or "").lower()
    if provider in ("openai", ""):
        return await _complete_openai(model, messages, tools)
    if provider == "azure":
        return await _complete_azure(model, messages, tools)
    if provider == "anthropic":
        if tools:
            raise NotImplementedError("anthropic tool-calling not yet supported in the runner")
        return {"role": "assistant", "content": await _generate_anthropic(model, messages)}
    if provider == "bedrock":
        raise NotImplementedError(
            "bedrock requires AWS SigV4 signing; not yet ported to the runner (task 2.7 follow-up)"
        )
    raise ValueError(f"unsupported model provider {model.type!r}")


def _message_from_choices(data: dict[str, Any]) -> dict[str, Any]:
    message = (data.get("choices") or [{}])[0].get("message", {}) or {}
    return {
        "role": message.get("role", "assistant"),
        "content": message.get("content") or "",
        "tool_calls": message.get("tool_calls") or [],
    }


async def _complete_openai(
    model: Any, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None
) -> dict[str, Any]:
    pc = _provider_config(model)
    base_url = str(pc.get("baseUrl") or "https://api.openai.com/v1").rstrip("/")
    api_key = str(pc.get("apiKey") or "placeholder")
    body: dict[str, Any] = {"model": model.name, "messages": messages, **_properties(pc)}
    if tools:
        body["tools"] = tools
    async with _client() as client:
        resp = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()
    return _message_from_choices(data)


async def _complete_azure(
    model: Any, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None
) -> dict[str, Any]:
    pc = _provider_config(model)
    base_url = str(pc.get("baseUrl") or "").rstrip("/")
    api_key = str(pc.get("apiKey") or "placeholder")
    api_version = str(pc.get("apiVersion") or "2024-02-01")
    if not base_url:
        raise ValueError("azure model requires config.azure.baseUrl")
    url = f"{base_url}/openai/deployments/{model.name}/chat/completions?api-version={api_version}"
    body: dict[str, Any] = {"messages": messages, **_properties(pc)}
    if tools:
        body["tools"] = tools
    async with _client() as client:
        resp = await client.post(
            url, headers={"api-key": api_key, "Content-Type": "application/json"}, json=body
        )
        resp.raise_for_status()
        data = resp.json()
    return _message_from_choices(data)


async def _generate_anthropic(model: Any, messages: list[dict[str, str]]) -> str:
    pc = _provider_config(model)
    base_url = str(pc.get("baseUrl") or "https://api.anthropic.com").rstrip("/")
    api_key = str(pc.get("apiKey") or "placeholder")
    props = _properties(pc)
    # Anthropic splits the system prompt out of the messages array.
    system = "\n".join(m["content"] for m in messages if m.get("role") == "system")
    chat = [m for m in messages if m.get("role") != "system"]
    body: dict[str, Any] = {
        "model": model.name,
        "messages": chat,
        "max_tokens": props.get("max_tokens", 4096),
        **{k: v for k, v in props.items() if k != "max_tokens"},
    }
    if system:
        body["system"] = system
    async with _client() as client:
        resp = await client.post(
            f"{base_url}/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": str(props.get("anthropic_version", "2023-06-01")),
                "Content-Type": "application/json",
            },
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()
    parts = data.get("content") or []
    return "".join(p.get("text", "") for p in parts if p.get("type") == "text")
