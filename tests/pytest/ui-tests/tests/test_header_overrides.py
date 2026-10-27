import logging
import time
from uuid import uuid4

import pytest
from playwright.sync_api import Page, expect

from pages.header_overrides_page import HeaderOverridesPage
from shared.k8s import (
    apply_yaml,
    delete_resource,
    get_resource,
    list_resources,
    wait_for_resource,
)

logger = logging.getLogger(__name__)

MOCK_LLM_URL = "http://mock-llm.default.svc.cluster.local:6556/v1"
MCP_SERVER_LABEL = "mcp/server"

AGENT_MODEL = ("X-E2E-Agent-Model", "agent-model")
MCP_AUTH = ("X-E2E-Auth", "mcp-token")
MCP_ORG = ("X-E2E-Org", "agent-org")

SEED_MANIFEST = """\
apiVersion: v1
kind: Secret
metadata:
  name: {secret}
  namespace: default
type: Opaque
stringData:
  token: mock-api-key
  mcp-token: mcp-secret-value
---
apiVersion: ark.mckinsey.com/v1alpha1
kind: MCPServer
metadata:
  name: {server}
  namespace: default
spec:
  description: mock-llm MCP endpoint for the header overrides journey
  transport: http
  address:
    valueFrom:
      serviceRef:
        name: mock-llm
        port: http
        path: /mcp
  headers:
  - name: X-E2E-Auth
    value:
      value: server-auth
  - name: X-E2E-Org
    value:
      value: server-org
---
apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: {model}
  namespace: default
spec:
  type: completions
  provider: openai
  model:
    value: gpt-4.1-mini
  pollInterval: 3s
  config:
    openai:
      baseUrl:
        value: {base_url}
      apiKey:
        valueFrom:
          secretKeyRef:
            name: {secret}
            key: token
"""

AGENT_MANIFEST = """\
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: {agent}
  namespace: default
spec:
  prompt: You answer briefly.
  modelRef:
    name: {model}
  tools:
  - type: custom
    name: {tool}
"""


def _eventually(read, check, timeout_s: int = 30, interval_s: float = 1.0):
    deadline = time.monotonic() + timeout_s
    value = read()
    while not check(value) and time.monotonic() < deadline:
        time.sleep(interval_s)
        value = read()
    return value


def _discovered_tool(server: str) -> str | None:
    tools = [
        tool for tool in list_resources("tool")
        if (tool["metadata"].get("labels") or {}).get(MCP_SERVER_LABEL) == server
    ]
    return tools[0]["metadata"]["name"] if tools else None


def _secret_ref(secret: str, key: str) -> dict:
    return {"valueFrom": {"secretKeyRef": {"name": secret, "key": key}}}


def _headers(overrides: list[dict], resource_type: str) -> dict:
    return {
        header["name"]: header["value"]
        for override in overrides
        if override["resourceType"] == resource_type
        for header in override["headers"]
    }


@pytest.fixture(scope="class")
def header_resources():
    suffix = uuid4().hex[:6]
    names = {
        "secret": f"ui-headers-secret-{suffix}",
        "server": f"ui-headers-mcp-{suffix}",
        "model": f"ui-headers-model-{suffix}",
        "agent": f"ui-headers-agent-{suffix}",
    }

    try:
        applied, message = apply_yaml(
            SEED_MANIFEST.format(base_url=MOCK_LLM_URL, **names)
        )
        assert applied, f"seeding the model and MCP server failed: {message}"

        available, message = wait_for_resource(
            "model", names["model"], "condition=ModelAvailable"
        )
        assert available, f"{names['model']} never became available: {message}"

        tool = _eventually(
            lambda: _discovered_tool(names["server"]), bool, timeout_s=120, interval_s=2
        )
        assert tool, (
            f"the controller never discovered a tool on {names['server']}; "
            "mock-llm should serve MCP on /mcp"
        )

        applied, message = apply_yaml(AGENT_MANIFEST.format(tool=tool, **names))
        assert applied, f"seeding the agent failed: {message}"

        yield names
    finally:
        delete_resource("agent", names["agent"])
        delete_resource("model", names["model"])
        delete_resource("mcpserver", names["server"])
        delete_resource("secret", names["secret"])


@pytest.mark.header_overrides
@pytest.mark.xdist_group("ark_header_overrides")
class TestHeaderOverrides:

    def test_agent_header_overrides_can_be_added(
        self, page: Page, header_resources: dict
    ):
        names = header_resources
        headers_page = HeaderOverridesPage(page)
        headers_page.open_agent(names["agent"])

        model_section = headers_page.model_headers()
        model_row = headers_page.blank_or_new_row(model_section, "Add rule")
        headers_page.fill_row(model_row, AGENT_MODEL[0], value=AGENT_MODEL[1])

        mcp_section = headers_page.mcp_headers()
        expect(headers_page.rows(mcp_section)).to_have_count(0)
        auth = headers_page.add_row(mcp_section, "Add rule")
        headers_page.fill_row(
            auth,
            MCP_AUTH[0],
            secret=(names["secret"], MCP_AUTH[1]),
            server=names["server"],
            name_is_select=True,
        )
        org = headers_page.add_row(mcp_section, "Add rule")
        headers_page.fill_row(
            org,
            MCP_ORG[0],
            value=MCP_ORG[1],
            server=names["server"],
            name_is_select=True,
        )
        headers_page.save_agent()

        agent = get_resource("agent", names["agent"])
        overrides = agent["spec"].get("overrides") or []
        assert _headers(overrides, "model") == {
            AGENT_MODEL[0]: {"value": AGENT_MODEL[1]},
        }, f"the agent should override one model header, but held {overrides}"

        mcp_overrides = [o for o in overrides if o["resourceType"] == "mcpserver"]
        assert len(mcp_overrides) == 1, (
            f"both MCP rows should save under one server selector, but got {mcp_overrides}"
        )
        assert mcp_overrides[0].get("labelSelector") == {
            "matchLabels": {MCP_SERVER_LABEL: names["server"]}
        }, f"the MCP override should target {names['server']}, but had {mcp_overrides[0]}"
        assert _headers(overrides, "mcpserver") == {
            MCP_AUTH[0]: _secret_ref(names["secret"], MCP_AUTH[1]),
            MCP_ORG[0]: {"value": MCP_ORG[1]},
        }, f"the agent should override exactly two MCP headers, but held {overrides}"

        headers_page.open_agent(names["agent"])
        shown_mcp = headers_page.summaries(
            headers_page.mcp_headers()
        )
        assert sorted(shown_mcp, key=lambda row: row["name"]) == [
            {
                "name": MCP_AUTH[0],
                "source": "Secret",
                "server": names["server"],
                "value": f"{names['secret']} · {MCP_AUTH[1]}",
            },
            {
                "name": MCP_ORG[0],
                "source": "Direct",
                "server": names["server"],
                "value": MCP_ORG[1],
            },
        ], (
            "the reloaded agent page should show only the two overridden MCP "
            f"headers, but showed {shown_mcp}"
        )
        shown_model = headers_page.summaries(
            headers_page.model_headers()
        )
        assert shown_model == [
            {"name": AGENT_MODEL[0], "source": "Direct", "value": AGENT_MODEL[1]},
        ], f"the reloaded agent page should show the model override, but showed {shown_model}"
