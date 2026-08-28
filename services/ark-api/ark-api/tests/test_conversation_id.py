"""conversationId is an opaque identifier that Ark passes through unchanged.

Engines and memory services generate conversation IDs in formats Ark does not
control, and those IDs land in status.conversationId with no validation. The
dashboard lists them and resends them as spec.conversationId on follow-up
queries, so any rule here that status does not also enforce breaks that
round-trip. Constraining status instead is not an option: it is written from
whatever the engine returns, so a rejected write becomes a reconcile loop.

Executors that map a conversationId onto a filesystem path validate it at the
path join, which is also the only layer that covers the direct A2A path.
"""

import unittest
from pathlib import Path

import yaml

from ark_api.models.queries import (
    QueryCreateRequest,
    QueryDetailResponse,
    QueryResponse,
    QueryUpdateRequest,
)

CRD_PATH = (
    Path(__file__).resolve().parents[4]
    / "ark"
    / "config"
    / "crd"
    / "bases"
    / "ark.mckinsey.com_queries.yaml"
)

ENGINE_GENERATED = [
    "550e8400-e29b-41d4-a716-446655440000",
    "hitl-demo-conv-001",
    "abc_123-XYZ",
    "thread.abc123",
    "conv:2026:001",
    "tenant/session",
    "conversation 1",
    "会話-1",
    "a" * 512,
]


class TestEngineGeneratedIdsRoundTrip(unittest.TestCase):
    """Regression test for the round-trip.

    An ID that reaches status.conversationId from an engine or memory service
    must be reusable in spec.conversationId, or follow-up queries against that
    conversation fail before they reach the cluster.
    """

    def test_create_accepts_engine_generated(self):
        for value in ENGINE_GENERATED:
            with self.subTest(value=value):
                request = QueryCreateRequest(
                    name="q", input="hi", conversationId=value
                )
                self.assertEqual(request.conversationId, value)

    def test_update_accepts_engine_generated(self):
        for value in ENGINE_GENERATED:
            with self.subTest(value=value):
                self.assertEqual(
                    QueryUpdateRequest(conversationId=value).conversationId, value
                )

    def test_responses_accept_engine_generated(self):
        for value in ENGINE_GENERATED:
            with self.subTest(value=value):
                response = QueryResponse(
                    name="q", namespace="default", input="hi", conversationId=value
                )
                self.assertEqual(response.conversationId, value)

                detail = QueryDetailResponse(
                    name="q", namespace="default", input="hi", conversationId=value
                )
                self.assertEqual(detail.conversationId, value)

    def test_omitted_is_allowed(self):
        self.assertIsNone(QueryCreateRequest(name="q", input="hi").conversationId)
        self.assertIsNone(QueryUpdateRequest().conversationId)


class TestCrdDoesNotNarrowSpec(unittest.TestCase):
    """spec.conversationId must not carry a rule status.conversationId lacks."""

    def _conversation_id_schemas(self):
        if not CRD_PATH.exists():
            self.skipTest(f"CRD not reachable from this checkout: {CRD_PATH}")

        crd = yaml.safe_load(CRD_PATH.read_text())
        schema = crd["spec"]["versions"][0]["schema"]["openAPIV3Schema"]["properties"]
        return (
            schema["spec"]["properties"]["conversationId"],
            schema["status"]["properties"]["conversationId"],
        )

    def test_spec_is_no_stricter_than_status(self):
        spec, status = self._conversation_id_schemas()
        for keyword in ("pattern", "maxLength", "minLength", "format"):
            with self.subTest(keyword=keyword):
                self.assertEqual(
                    spec.get(keyword),
                    status.get(keyword),
                    f"spec.conversationId {keyword} differs from status: any rule "
                    f"not enforced on status breaks reuse of engine-generated IDs",
                )
