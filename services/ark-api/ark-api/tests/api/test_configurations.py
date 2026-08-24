"""Tests for the configurations API and its reverse-reference lookup."""
import inspect
import json
import os
import pathlib
import re
import unittest
from unittest.mock import AsyncMock, MagicMock, Mock, patch

os.environ["AUTH_MODE"] = "open"
os.environ["READ_ONLY_MODE"] = "false"

from ark_sdk import models, versions
from fastapi.testclient import TestClient

from ark_api.api.v1.export import EXPORT_CONFIGMAP_NAME
from ark_api.api.v1.marketplace_sources import CONFIGMAP_NAME as MARKETPLACE_CONFIGMAP_NAME
from ark_api.services.configuration_references import (
    REFERRING_RESOURCES,
    find_config_map_references
)

CONFIGURATION = {
    "name": "github-mcp-url",
    "id": "uuid-1234",
    "value": "https://example.test/mcp/",
    "description": "GitHub remote MCP endpoint",
    "alias": "github-mcp",
    "labels": ["mcp"],
}


def _config_map_ref(name, key="value"):
    return {"valueFrom": {"configMapKeyRef": {"name": name, "key": key}}}


def _resource(kind_name, spec):
    resource = Mock()
    resource.to_dict.return_value = {"metadata": {"name": kind_name}, "spec": spec}
    return resource


class TestFindConfigMapReferences(unittest.TestCase):
    """The spec walk must find references at any depth without knowing the schema."""

    def test_finds_top_level_value_source(self):
        spec = {"address": _config_map_ref("github-mcp-url"), "transport": "http"}
        self.assertEqual(find_config_map_references(spec, "github-mcp-url"), ["spec.address"])

    def test_finds_reference_inside_a_list(self):
        spec = {"headers": [
            {"name": "X-Other", "value": {"value": "literal"}},
            {"name": "X-Tenant", "value": _config_map_ref("github-mcp-url")},
        ]}
        self.assertEqual(
            find_config_map_references(spec, "github-mcp-url"),
            ["spec.headers[1].value"]
        )

    def test_finds_every_reference_in_one_spec(self):
        spec = {
            "address": _config_map_ref("github-mcp-url"),
            "headers": [{"name": "X-Tenant", "value": _config_map_ref("github-mcp-url")}],
        }
        self.assertEqual(
            sorted(find_config_map_references(spec, "github-mcp-url")),
            ["spec.address", "spec.headers[0].value"]
        )

    def test_ignores_other_config_maps(self):
        spec = {"address": _config_map_ref("some-other-configuration")}
        self.assertEqual(find_config_map_references(spec, "github-mcp-url"), [])

    def test_ignores_secret_references(self):
        spec = {"address": {"valueFrom": {"secretKeyRef": {"name": "github-mcp-url", "key": "value"}}}}
        self.assertEqual(find_config_map_references(spec, "github-mcp-url"), [])

    def test_handles_empty_spec(self):
        self.assertEqual(find_config_map_references({}, "github-mcp-url"), [])


class TestConfigurationsApi(unittest.TestCase):
    """CRUD endpoints delegate to ConfigurationClient and shape the response."""

    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.configurations.ConfigurationClient')
    def test_list_configurations(self, mock_client_cls):
        mock_client_cls.return_value.list_configurations = AsyncMock(
            return_value={"items": [CONFIGURATION], "count": 1}
        )

        response = self.client.get("/v1/configurations")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"items": [CONFIGURATION], "count": 1})

    @patch('ark_api.api.v1.configurations.ConfigurationClient')
    def test_create_configuration(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.create_configuration = AsyncMock(return_value=CONFIGURATION)

        response = self.client.post("/v1/configurations", json={
            "name": "github-mcp-url",
            "value": "https://example.test/mcp/",
            "description": "GitHub remote MCP endpoint",
            "alias": "github-mcp",
            "labels": ["mcp"],
        })

        self.assertEqual(response.status_code, 200)
        mock_client.create_configuration.assert_awaited_once_with(
            name="github-mcp-url",
            value="https://example.test/mcp/",
            description="GitHub remote MCP endpoint",
            alias="github-mcp",
            labels=["mcp"],
        )

    def test_create_configuration_rejects_invalid_label(self):
        response = self.client.post("/v1/configurations", json={
            "name": "github-mcp-url",
            "value": "https://example.test/mcp/",
            "labels": ["mcp servers"],
        })

        self.assertEqual(response.status_code, 422)

    @patch('ark_api.api.v1.configurations.ConfigurationClient')
    def test_update_configuration(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.update_configuration = AsyncMock(return_value=CONFIGURATION)

        response = self.client.put("/v1/configurations/github-mcp-url", json={
            "value": "https://new.test/mcp/",
            "labels": [],
        })

        self.assertEqual(response.status_code, 200)
        mock_client.update_configuration.assert_awaited_once_with(
            "github-mcp-url",
            value="https://new.test/mcp/",
            description=None,
            alias=None,
            labels=[],
        )

    @patch('ark_api.api.v1.configurations.ConfigurationClient')
    def test_delete_configuration(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.delete_configuration = AsyncMock(return_value=True)

        response = self.client.delete("/v1/configurations/github-mcp-url")

        self.assertEqual(response.status_code, 200)
        mock_client.delete_configuration.assert_awaited_once_with("github-mcp-url")


class TestConfigurationReferencesEndpoint(unittest.TestCase):
    """The references endpoint reports every Ark resource reading the configuration."""

    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    @staticmethod
    def _ark_client(resources):
        ark_client = MagicMock()
        for _, attribute, _ in REFERRING_RESOURCES:
            getattr(ark_client, attribute).a_list = AsyncMock(
                return_value=resources.get(attribute, [])
            )
        context = MagicMock()
        context.__aenter__ = AsyncMock(return_value=ark_client)
        context.__aexit__ = AsyncMock(return_value=False)
        return context

    @patch('ark_api.api.v1.configurations.with_ark_client')
    @patch('ark_api.api.v1.configurations.ConfigurationClient')
    def test_lists_referring_resources(self, mock_client_cls, mock_with_ark_client):
        mock_client_cls.return_value.get_configuration = AsyncMock(return_value=CONFIGURATION)
        mock_with_ark_client.return_value = self._ark_client({
            "mcpservers": [
                _resource("github-mcp", {"address": _config_map_ref("github-mcp-url")}),
                _resource("other-mcp", {"address": {"value": "http://localhost:8080"}}),
            ],
            "memories": [
                _resource("shared-memory", {"address": _config_map_ref("github-mcp-url")}),
            ],
        })

        response = self.client.get("/v1/configurations/github-mcp-url/references")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "items": [
                {"kind": "Memory", "name": "shared-memory", "field": "spec.address"},
                {"kind": "MCPServer", "name": "github-mcp", "field": "spec.address"},
            ],
            "count": 2,
        })

    @patch('ark_api.api.v1.configurations.with_ark_client')
    @patch('ark_api.api.v1.configurations.ConfigurationClient')
    def test_returns_empty_when_nothing_refers(self, mock_client_cls, mock_with_ark_client):
        mock_client_cls.return_value.get_configuration = AsyncMock(return_value=CONFIGURATION)
        mock_with_ark_client.return_value = self._ark_client({})

        response = self.client.get("/v1/configurations/github-mcp-url/references")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"items": [], "count": 0})


class TestReferringResourceVersions(unittest.TestCase):
    """Every referring resource must exist on the client for its declared version."""

    def test_attributes_exist_on_their_client(self):
        clients = {
            "v1alpha1": versions.ARKClientV1alpha1,
            "v1prealpha1": versions.ARKClientV1prealpha1,
        }
        for kind, attribute, version in REFERRING_RESOURCES:
            source = inspect.getsource(clients[version].__init__)
            self.assertIn(
                f"self.{attribute} = ",
                source,
                f"{kind} is declared as {version} but {version} has no '{attribute}'",
            )


class TestReferringResourcesCompleteness(unittest.TestCase):
    """Every kind whose spec accepts a configMapKeyRef must be reported."""

    SPEC_MODEL = re.compile(r"^(?P<kind>.+?)(?P<version>V1[a-z0-9]+)Spec$")

    def test_no_kind_that_reads_a_configuration_is_missing(self):
        """Guards against a new CRD field silently reporting a configuration as unused.

        The generated models come from the CRDs, so they are the source of truth
        for which specs can carry a configMapKeyRef. A kind added there and not
        here fails this test instead of shipping a wrong references list.
        """
        accepting = set()
        for model_name in dir(models):
            match = self.SPEC_MODEL.match(model_name)
            if not match:
                continue
            schema = json.dumps(getattr(models, model_name).model_json_schema())
            if "configMapKeyRef" in schema:
                accepting.add((match.group("kind"), match.group("version").lower()))

        declared = {(kind, version) for kind, _, version in REFERRING_RESOURCES}
        self.assertEqual(
            accepting,
            declared,
            f"missing from REFERRING_RESOURCES: {sorted(accepting - declared)}; "
            f"declared but cannot read a configuration: {sorted(declared - accepting)}",
        )


class TestPolicyAllowsTheConfigmapsArkApiOwns(unittest.TestCase):
    """The unlabelled configmaps ark-api writes must be exempt in the policy."""

    POLICY = (
        pathlib.Path(__file__).parents[3] / "chart" / "templates" / "configmap-policy.yaml"
    )
    UNLABELLED = re.compile(r"- name: unlabelled\n\s+expression: \"(?P<list>\[[^\]]*\])\"")

    def test_exempt_names_match_the_python_constants(self):
        """Guards a rename in Python that leaves the CEL list behind.

        Both names live twice, once here and once in the policy, with nothing
        linking them. Renaming one alone denies the write at admission, which
        surfaces as a 403 in a live cluster rather than a failing test.
        """
        match = self.UNLABELLED.search(self.POLICY.read_text())
        self.assertIsNotNone(match, f"no unlabelled variable in {self.POLICY}")

        exempt = match.group("list")
        for constant, name in (
            ("EXPORT_CONFIGMAP_NAME", EXPORT_CONFIGMAP_NAME),
            ("marketplace_sources.CONFIGMAP_NAME", MARKETPLACE_CONFIGMAP_NAME),
        ):
            self.assertIn(
                f"'{name}'",
                exempt,
                f"{constant} is '{name}' but the policy exempts {exempt}",
            )


if __name__ == '__main__':
    unittest.main()
