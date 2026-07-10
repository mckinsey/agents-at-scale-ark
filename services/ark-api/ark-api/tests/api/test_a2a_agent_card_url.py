"""Tests for A2A agent-card URL derivation from forwarding headers."""
import os
import unittest
from unittest.mock import patch

os.environ["AUTH_MODE"] = "open"

from a2a.types import AgentCapabilities, AgentCard, AgentSkill
from starlette.applications import Starlette
from starlette.routing import Mount
from starlette.testclient import TestClient

from ark_api.api.v1.a2agw import manager as manager_module
from ark_api.api.v1.a2agw.manager import DynamicManager
from ark_api.api.v1.a2agw.registry import (
    apply_forwarded_url,
    external_forwarded_base_from_headers,
    forwarded_base_ctx,
)


def _make_test_card(name="weather", url="http://localhost:8000/a2a/agent/weather/"):
    return AgentCard(
        name=name,
        description="A test agent",
        capabilities=AgentCapabilities(
            streaming=True, push_notifications=False, state_transition_history=False
        ),
        skills=[
            AgentSkill(
                id=f"{name}-default-skill",
                name="General",
                description="General agent capabilities",
                tags=["general"],
            )
        ],
        url=url,
        version="1.0.0",
        default_input_modes=["text"],
        default_output_modes=["text"],
    )


class TestExternalBaseFromHeaders(unittest.TestCase):
    """external_forwarded_base_from_headers only activates on X-Forwarded-Prefix."""

    def test_empty_without_prefix(self):
        self.assertEqual(external_forwarded_base_from_headers({}), "")
        self.assertEqual(external_forwarded_base_from_headers({"host": "example.com"}), "")

    def test_builds_from_forwarded_headers(self):
        headers = {
            "x-forwarded-prefix": "/tenant-a",
            "x-forwarded-host": "example.com",
            "x-forwarded-proto": "https",
        }
        self.assertEqual(
            external_forwarded_base_from_headers(headers), "https://example.com/tenant-a"
        )

    def test_falls_back_to_host_header_and_http(self):
        headers = {"x-forwarded-prefix": "/t", "host": "svc:8080"}
        self.assertEqual(external_forwarded_base_from_headers(headers), "http://svc:8080/t")


class TestApplyForwardedUrl(unittest.TestCase):
    """apply_forwarded_url rewrites the card URL only when a base is published."""

    def test_no_context_returns_card_unchanged(self):
        card = _make_test_card()
        self.assertIs(apply_forwarded_url(card), card)

    def test_rewrites_url_from_context_without_mutating_original(self):
        card = _make_test_card()
        token = forwarded_base_ctx.set("https://example.com/tenant-a")
        try:
            result = apply_forwarded_url(card)
        finally:
            forwarded_base_ctx.reset(token)

        self.assertEqual(
            result.url, "https://example.com/tenant-a/a2a/agent/weather/"
        )
        # The shared card cached by the manager must not be mutated.
        self.assertEqual(card.url, "http://localhost:8000/a2a/agent/weather/")


def _mount_gateway_with_agent(card):
    """Build the real A2A ASGI stack (ProxyApp + mounted A2AStarletteApplication
    with the card_modifier) serving a single agent, mounted where main.py mounts
    it. Exercises the whole request -> contextvar -> card_modifier path."""
    manager = DynamicManager()
    manager.agents = {card.name: card}
    manager._update_routes()
    return Starlette(routes=[Mount("/a2a/agent", app=manager.app)])


class TestAgentCardServing(unittest.TestCase):
    """End-to-end (in-process) serving of .well-known/agent.json through the
    ProxyApp, asserting the advertised URL honours X-Forwarded-Prefix."""

    def setUp(self):
        # ARKAgentExecutor reads the pod namespace at construction; pin it so the
        # test does not depend on a cluster.
        patcher = patch.object(manager_module, "get_namespace", return_value="default")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_well_known_card_uses_forwarded_prefix(self):
        client = TestClient(_mount_gateway_with_agent(_make_test_card()))
        response = client.get(
            "/a2a/agent/weather/.well-known/agent.json",
            headers={
                "X-Forwarded-Prefix": "/tenant-a",
                "X-Forwarded-Host": "example.com",
                "X-Forwarded-Proto": "https",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["url"],
            "https://example.com/tenant-a/a2a/agent/weather/",
        )

    def test_well_known_card_without_prefix_keeps_static_base(self):
        client = TestClient(_mount_gateway_with_agent(_make_test_card()))
        response = client.get("/a2a/agent/weather/.well-known/agent.json")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("/tenant-a/", response.json()["url"])


if __name__ == "__main__":
    unittest.main()
