"""Tests for the MCPServer routes: authorization block, address source and name label."""
from __future__ import annotations

import os
import unittest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("AUTH_MODE", "open")

from fastapi.testclient import TestClient

from ark_sdk.labels import NAME_LABEL
from ark_sdk.models.mcp_server_v1alpha1 import MCPServerV1alpha1
from ark_api.api.v1.mcp_servers import (
    mcp_server_to_detail_response,
    mcp_server_to_response,
)


def _mcp_dict(*, state=None, resource_name=None, expires_at=None):
    authorization = None
    if state is not None:
        authorization = {"state": state}
        if resource_name is not None:
            authorization["resourceName"] = resource_name
        if expires_at is not None:
            authorization["expiresAt"] = expires_at
    metadata = {"name": "notion-mcp", "namespace": "team-a"}
    status = {}
    if authorization is not None:
        status["authorization"] = authorization
    return {
        "metadata": metadata,
        "spec": {"transport": "http"},
        "status": status,
    }


class TestAuthorizationBlock(unittest.TestCase):
    def test_required_state_in_list(self):
        resp = mcp_server_to_response(_mcp_dict(state="Required"))
        self.assertIsNotNone(resp.authorization)
        self.assertEqual(resp.authorization.state, "Required")

    def test_discovery_failed_state_in_list(self):
        resp = mcp_server_to_response(_mcp_dict(state="DiscoveryFailed"))
        self.assertEqual(resp.authorization.state, "DiscoveryFailed")

    def test_authorized_exposes_expiry(self):
        mcp = _mcp_dict(
            state="Authorized",
            resource_name="notion-mcp-tokens",
            expires_at="2030-01-01T00:00:00Z",
        )
        resp = mcp_server_to_response(mcp)
        self.assertEqual(resp.authorization.state, "Authorized")
        self.assertEqual(resp.authorization.expiresAt, "2030-01-01T00:00:00Z")
        self.assertEqual(resp.authorization.resourceName, "notion-mcp-tokens")

    def test_no_authorization_status_is_null(self):
        resp = mcp_server_to_response(_mcp_dict(state=None))
        self.assertIsNone(resp.authorization)

    def test_expiry_omitted_when_absent(self):
        resp = mcp_server_to_response(_mcp_dict(state="Required"))
        self.assertIsNone(resp.authorization.expiresAt)

    def test_detail_response_exposes_authorization(self):
        mcp = _mcp_dict(
            state="Authorized",
            expires_at="2030-01-01T00:00:00Z",
        )
        resp = mcp_server_to_detail_response(mcp)
        self.assertEqual(resp.authorization.state, "Authorized")
        self.assertEqual(resp.authorization.expiresAt, "2030-01-01T00:00:00Z")

    def test_detail_response_null_when_absent(self):
        resp = mcp_server_to_detail_response(_mcp_dict(state=None))
        self.assertIsNone(resp.authorization)

    def test_no_token_material_serialized(self):
        mcp = _mcp_dict(state="Authorized", expires_at="2030-01-01T00:00:00Z")
        dumped = mcp_server_to_response(mcp).model_dump()
        serialized = str(dumped)
        for forbidden in ("access_token", "refresh_token", "client_secret"):
            self.assertNotIn(forbidden, serialized)


class TestAddressSource(unittest.TestCase):
    @staticmethod
    def _mcp(address):
        spec = {"transport": "http"}
        if address is not None:
            spec["address"] = address
        return {
            "metadata": {"name": "github-mcp", "namespace": "team-a"},
            "spec": spec,
            "status": {"resolvedAddress": "https://resolved.example/mcp"},
        }

    def test_literal_address_exposes_value(self):
        resp = mcp_server_to_detail_response(
            self._mcp({"value": "https://api.githubcopilot.com/mcp/"})
        )
        self.assertEqual(
            resp.address_source.value, "https://api.githubcopilot.com/mcp/"
        )
        self.assertIsNone(resp.address_source.valueFrom)

    def test_config_map_address_exposes_reference(self):
        resp = mcp_server_to_detail_response(
            self._mcp(
                {
                    "valueFrom": {
                        "configMapKeyRef": {"name": "github-mcp-url", "key": "value"}
                    }
                }
            )
        )
        self.assertEqual(
            resp.address_source.valueFrom.configMapKeyRef.name, "github-mcp-url"
        )
        self.assertEqual(resp.address_source.valueFrom.configMapKeyRef.key, "value")
        self.assertIsNone(resp.address_source.value)

    def test_service_ref_address_is_preserved(self):
        resp = mcp_server_to_detail_response(
            self._mcp(
                {
                    "valueFrom": {
                        "serviceRef": {
                            "name": "ark-mcp",
                            "port": "http",
                            "path": "/mcp",
                            "namespace": "ark",
                        }
                    }
                }
            )
        )
        service_ref = resp.address_source.valueFrom.serviceRef
        self.assertEqual(service_ref.name, "ark-mcp")
        self.assertEqual(service_ref.path, "/mcp")
        self.assertEqual(service_ref.namespace, "ark")

    def test_query_parameter_ref_address_is_preserved(self):
        resp = mcp_server_to_detail_response(
            self._mcp({"valueFrom": {"queryParameterRef": {"name": "endpoint"}}})
        )
        self.assertEqual(
            resp.address_source.valueFrom.queryParameterRef.name, "endpoint"
        )
        self.assertIsNone(resp.address_source.value)

    def test_secret_key_ref_address_is_preserved(self):
        resp = mcp_server_to_detail_response(
            self._mcp(
                {"valueFrom": {"secretKeyRef": {"name": "mcp-url", "key": "address"}}}
            )
        )
        secret_ref = resp.address_source.valueFrom.secretKeyRef
        self.assertEqual(secret_ref.name, "mcp-url")
        self.assertEqual(secret_ref.key, "address")
        self.assertIsNone(resp.address_source.value)

    def test_missing_address_yields_none(self):
        resp = mcp_server_to_detail_response(self._mcp(None))
        self.assertIsNone(resp.address_source)

    def test_resolved_address_is_unchanged(self):
        resp = mcp_server_to_detail_response(
            self._mcp(
                {
                    "valueFrom": {
                        "configMapKeyRef": {"name": "github-mcp-url", "key": "value"}
                    }
                }
            )
        )
        self.assertEqual(resp.address, "https://resolved.example/mcp")

    def test_reference_survives_serialization(self):
        resp = mcp_server_to_detail_response(
            self._mcp(
                {
                    "valueFrom": {
                        "configMapKeyRef": {"name": "github-mcp-url", "key": "value"}
                    }
                }
            )
        )
        dumped = resp.model_dump()["address_source"]
        self.assertEqual(
            dumped["valueFrom"]["configMapKeyRef"]["name"], "github-mcp-url"
        )
        self.assertIsNone(dumped["value"])


SPEC = {"transport": "http", "address": {"value": "http://github-mcp"}}
LONG_NAME = "a" * 64


class TestNameLabel(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)
        patcher = patch("ark_api.api.v1.mcp_servers.with_ark_client")
        with_ark_client = patcher.start()
        self.addCleanup(patcher.stop)
        self.ark = AsyncMock()
        with_ark_client.return_value.__aenter__.return_value = self.ark
        self.ark.mcpservers.a_create = AsyncMock(side_effect=lambda resource: resource)
        self.ark.mcpservers.a_update = AsyncMock(side_effect=lambda resource: resource)

    def _create(self, name, labels=None):
        body = {"name": name, "namespace": "team-a", "spec": SPEC}
        if labels is not None:
            body["labels"] = labels
        response = self.client.post("/v1/mcp-servers?namespace=team-a", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        written = self.ark.mcpservers.a_create.await_args.args[0].to_dict()["metadata"]["labels"]
        return response.json()["labels"], written

    def _update(self, name, existing_labels, body):
        self.ark.mcpservers.a_get = AsyncMock(return_value=MCPServerV1alpha1(
            metadata={"name": name, "namespace": "team-a", "labels": existing_labels},
            spec=SPEC,
        ))
        response = self.client.put(f"/v1/mcp-servers/{name}?namespace=team-a", json=body)
        self.assertEqual(response.status_code, 200, response.text)
        written = self.ark.mcpservers.a_update.await_args.args[0].to_dict()["metadata"]["labels"]
        return response.json()["labels"], written

    def test_create_adds_the_name_label(self):
        returned, written = self._create("github")

        self.assertEqual(written, {NAME_LABEL: "github"})
        self.assertEqual(returned, {NAME_LABEL: "github"})

    def test_create_keeps_other_labels(self):
        _, written = self._create("github", {"team": "a", "ark.mckinsey.com/label.prod": "true"})

        self.assertEqual(written, {"team": "a", "ark.mckinsey.com/label.prod": "true", NAME_LABEL: "github"})

    def test_create_with_empty_labels_adds_the_name_label(self):
        _, written = self._create("github", {})

        self.assertEqual(written, {NAME_LABEL: "github"})

    def test_create_overrides_a_name_label_sent_by_the_caller(self):
        returned, written = self._create("evil", {NAME_LABEL: "github"})

        self.assertEqual(written, {NAME_LABEL: "evil"})
        self.assertEqual(returned, written)

    def test_create_labels_a_name_of_63_characters(self):
        _, written = self._create("a" * 63)

        self.assertEqual(written, {NAME_LABEL: "a" * 63})

    def test_create_skips_the_label_for_names_over_63_characters(self):
        returned, written = self._create(LONG_NAME, {"team": "a", NAME_LABEL: "github"})

        self.assertEqual(written, {"team": "a"})
        self.assertEqual(returned, written)

    def test_update_adds_the_label_to_a_server_without_it(self):
        returned, written = self._update("github", {"team": "a"}, {})

        self.assertEqual(written, {"team": "a", NAME_LABEL: "github"})
        self.assertEqual(returned, {"team": "a", NAME_LABEL: "github"})

    def test_update_adds_the_label_when_the_server_has_no_labels(self):
        self._update("github", None, {"annotations": {"note": "x"}})

        written = self.ark.mcpservers.a_update.await_args.args[0].to_dict()["metadata"]
        self.assertEqual(written["labels"], {NAME_LABEL: "github"})
        self.assertEqual(written["annotations"], {"note": "x"})

    def test_update_with_empty_labels_keeps_only_the_name_label(self):
        _, written = self._update("github", {"team": "a"}, {"labels": {}})

        self.assertEqual(written, {NAME_LABEL: "github"})

    def test_update_restores_the_label_when_new_labels_drop_it(self):
        _, written = self._update("github", {NAME_LABEL: "github"}, {"labels": {"team": "b"}})

        self.assertEqual(written, {"team": "b", NAME_LABEL: "github"})

    def test_update_restores_a_changed_label(self):
        _, written = self._update("evil", {NAME_LABEL: "github", "team": "a"}, {"spec": SPEC})

        self.assertEqual(written, {NAME_LABEL: "evil", "team": "a"})

    def test_update_overrides_a_name_label_sent_by_the_caller(self):
        _, written = self._update("evil", None, {"labels": {NAME_LABEL: "github"}})

        self.assertEqual(written, {NAME_LABEL: "evil"})

    def test_update_drops_the_label_for_names_over_63_characters(self):
        returned, written = self._update(LONG_NAME, {NAME_LABEL: "github", "team": "a"}, {"spec": SPEC})

        self.assertEqual(written, {"team": "a"})
        self.assertEqual(returned, written)


if __name__ == "__main__":
    unittest.main()
