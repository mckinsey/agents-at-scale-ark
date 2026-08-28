"""conversationId must be rejected before it reaches the Kubernetes API.

Execution engines use conversationId as a filesystem path segment, so the
constraint is enforced by the Query CRD. These models mirror that constraint so
a bad value fails as a 422 from ark-api rather than a raw admission error.
"""

import unittest
from pathlib import Path

import yaml
from pydantic import ValidationError

from ark_api.models.queries import (
    CONVERSATION_ID_MAX_LENGTH,
    CONVERSATION_ID_MIN_LENGTH,
    CONVERSATION_ID_PATTERN,
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

REJECTED = [
    "/",
    "..",
    "../../../tmp/pwned",
    "/etc/passwd",
    ".",
    "",
    "a/b",
    "a b",
    "a.b",
    ".hidden",
    "-leading-dash",
    "a" * 129,
]

ACCEPTED = [
    "a",
    "normal-id",
    "abc_123-XYZ",
    "hitl-demo-conv-001",
    "conv-123",
    "550e8400-e29b-41d4-a716-446655440000",
    "a" * 128,
]


def _create(conversation_id):
    return QueryCreateRequest(name="q", input="hi", conversationId=conversation_id)


class TestRequestModels(unittest.TestCase):
    def test_create_rejects_unsafe(self):
        for value in REJECTED:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                _create(value)

    def test_create_accepts_safe(self):
        for value in ACCEPTED:
            with self.subTest(value=value):
                self.assertEqual(_create(value).conversationId, value)

    def test_update_rejects_unsafe(self):
        for value in REJECTED:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                QueryUpdateRequest(conversationId=value)

    def test_omitted_is_allowed(self):
        self.assertIsNone(QueryCreateRequest(name="q", input="hi").conversationId)
        self.assertIsNone(QueryUpdateRequest().conversationId)


class TestResponseModelsAreUnconstrained(unittest.TestCase):
    """Read paths must return whatever the cluster holds.

    Queries created before the constraint landed can carry any value; rejecting
    them on read would break listing instead of protecting anything.
    """

    def test_response_accepts_legacy_values(self):
        for value in REJECTED:
            with self.subTest(value=value):
                response = QueryResponse(
                    name="q", namespace="default", input="hi", conversationId=value
                )
                self.assertEqual(response.conversationId, value)

    def test_detail_response_accepts_legacy_values(self):
        detail = QueryDetailResponse(
            name="q", namespace="default", input="hi", conversationId="../legacy"
        )
        self.assertEqual(detail.conversationId, "../legacy")


class TestMatchesCrd(unittest.TestCase):
    """The CRD is the source of truth; this pattern is a hand-copied mirror."""

    def test_constraints_match_crd(self):
        if not CRD_PATH.exists():
            self.skipTest(f"CRD not reachable from this checkout: {CRD_PATH}")

        crd = yaml.safe_load(CRD_PATH.read_text())
        versions = crd["spec"]["versions"]
        spec_props = versions[0]["schema"]["openAPIV3Schema"]["properties"]["spec"][
            "properties"
        ]
        conversation_id = spec_props["conversationId"]
        self.assertEqual(conversation_id["pattern"], CONVERSATION_ID_PATTERN)
        self.assertEqual(conversation_id["minLength"], CONVERSATION_ID_MIN_LENGTH)
        self.assertEqual(conversation_id["maxLength"], CONVERSATION_ID_MAX_LENGTH)
