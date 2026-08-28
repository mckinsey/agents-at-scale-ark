"""conversationId is bounded in length only, never in character set.

Engines and memory services generate conversation IDs in formats Ark does not
control, and those IDs land in status.conversationId unvalidated. The dashboard
lists them and resends them as spec.conversationId on follow-up queries, so any
character-set rule here breaks that round-trip.

Executors that map a conversationId onto a filesystem path validate it at the
path join, which is also the only layer that covers the direct A2A path.
"""

import unittest
from pathlib import Path

import yaml
from pydantic import ValidationError

from ark_api.models.queries import (
    CONVERSATION_ID_MAX_LENGTH,
    CONVERSATION_ID_MIN_LENGTH,
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
]

REJECTED = ["", "a" * (CONVERSATION_ID_MAX_LENGTH + 1)]


def _create(conversation_id):
    return QueryCreateRequest(name="q", input="hi", conversationId=conversation_id)


class TestEngineGeneratedIdsRoundTrip(unittest.TestCase):
    """Regression test for the round-trip break.

    An ID that reaches status.conversationId from an engine or memory service
    must be reusable in spec.conversationId, or follow-up queries against that
    conversation fail before they reach the cluster.
    """

    def test_create_accepts_engine_generated(self):
        for value in ENGINE_GENERATED:
            with self.subTest(value=value):
                self.assertEqual(_create(value).conversationId, value)

    def test_update_accepts_engine_generated(self):
        for value in ENGINE_GENERATED:
            with self.subTest(value=value):
                self.assertEqual(
                    QueryUpdateRequest(conversationId=value).conversationId, value
                )


class TestLengthBounds(unittest.TestCase):
    def test_rejects_out_of_bounds(self):
        for value in REJECTED:
            with self.subTest(length=len(value)), self.assertRaises(ValidationError):
                _create(value)

    def test_accepts_boundaries(self):
        for length in (CONVERSATION_ID_MIN_LENGTH, CONVERSATION_ID_MAX_LENGTH):
            with self.subTest(length=length):
                value = "a" * length
                self.assertEqual(_create(value).conversationId, value)

    def test_omitted_is_allowed(self):
        self.assertIsNone(QueryCreateRequest(name="q", input="hi").conversationId)
        self.assertIsNone(QueryUpdateRequest().conversationId)


class TestResponseModelsAreUnconstrained(unittest.TestCase):
    """Read paths must return whatever the cluster holds, at any length."""

    def test_response_accepts_any_value(self):
        oversized = "a" * (CONVERSATION_ID_MAX_LENGTH + 1)
        response = QueryResponse(
            name="q", namespace="default", input="hi", conversationId=oversized
        )
        self.assertEqual(response.conversationId, oversized)

        detail = QueryDetailResponse(
            name="q", namespace="default", input="hi", conversationId="thread.abc123"
        )
        self.assertEqual(detail.conversationId, "thread.abc123")


class TestMatchesCrd(unittest.TestCase):
    """The CRD is the source of truth; these constants are a hand-copied mirror."""

    def _spec_conversation_id(self):
        if not CRD_PATH.exists():
            self.skipTest(f"CRD not reachable from this checkout: {CRD_PATH}")

        crd = yaml.safe_load(CRD_PATH.read_text())
        versions = crd["spec"]["versions"]
        return versions[0]["schema"]["openAPIV3Schema"]["properties"]["spec"][
            "properties"
        ]["conversationId"]

    def test_lengths_match_crd(self):
        conversation_id = self._spec_conversation_id()
        self.assertEqual(conversation_id["minLength"], CONVERSATION_ID_MIN_LENGTH)
        self.assertEqual(conversation_id["maxLength"], CONVERSATION_ID_MAX_LENGTH)

    def test_crd_has_no_character_set_rule(self):
        self.assertNotIn("pattern", self._spec_conversation_id())
