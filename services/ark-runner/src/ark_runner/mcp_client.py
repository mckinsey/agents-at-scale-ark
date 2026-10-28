"""Minimal MCP client over streamable HTTP (OpenSpec task 2.8).

Speaks JSON-RPC 2.0 to an MCP server's single HTTP endpoint: initialize, tools/list,
tools/call. Enough for the completions adapter to expose an agent's `mcpServers` as model
tools and invoke them. Responses may be JSON or an SSE stream; both are handled.

Not a full MCP implementation (no resources/prompts/sampling, no reconnect/resume).
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

PROTOCOL_VERSION = "2025-06-18"


def _parse_response(resp: httpx.Response) -> dict[str, Any]:
    """Return the JSON-RPC payload from a JSON or text/event-stream response."""
    ctype = resp.headers.get("content-type", "")
    if "text/event-stream" in ctype:
        for line in resp.text.splitlines():
            if line.startswith("data:"):
                return json.loads(line[len("data:"):].strip())
        raise RuntimeError("no data event in MCP SSE response")
    return resp.json()


class MCPClient:
    def __init__(self, url: str, headers: dict[str, str] | None = None, timeout: float = 30):
        self.url = url
        self.headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        self.headers.update(headers or {})
        self.timeout = timeout
        self._id = 0
        self._session: str | None = None

    async def __aenter__(self) -> "MCPClient":
        self._client = httpx.AsyncClient(timeout=self.timeout)
        await self._initialize()
        return self

    async def __aexit__(self, *exc) -> None:
        await self._client.aclose()

    def _next_id(self) -> int:
        self._id += 1
        return self._id

    async def _rpc(self, method: str, params: dict[str, Any] | None = None, notify: bool = False) -> Any:
        payload: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if not notify:
            payload["id"] = self._next_id()
        if params is not None:
            payload["params"] = params
        headers = dict(self.headers)
        if self._session:
            headers["Mcp-Session-Id"] = self._session
        resp = await self._client.post(self.url, headers=headers, json=payload)
        resp.raise_for_status()
        if "Mcp-Session-Id" in resp.headers:
            self._session = resp.headers["Mcp-Session-Id"]
        if notify:
            return None
        data = _parse_response(resp)
        if "error" in data:
            raise RuntimeError(f"MCP {method} failed: {data['error']}")
        return data.get("result")

    async def _initialize(self) -> None:
        await self._rpc(
            "initialize",
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "ark-runner", "version": "0.1.0"},
            },
        )
        await self._rpc("notifications/initialized", notify=True)

    async def list_tools(self) -> list[dict[str, Any]]:
        result = await self._rpc("tools/list") or {}
        return result.get("tools", [])

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> str:
        result = await self._rpc("tools/call", {"name": name, "arguments": arguments}) or {}
        parts = result.get("content") or []
        return "".join(p.get("text", "") for p in parts if p.get("type") == "text")
