import asyncio
import base64
import json
import os
import unittest
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import HTTPException
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.impersonation import ImpersonationConfig

import src.ark_api.api.v1.marketplace_items as items_module
from src.ark_api.api.v1.marketplace_fetch import SourceBlockedError
from src.ark_api.api.v1.marketplace_sources import derive_secret_name
from src.ark_api.marketplace_install import catalog

MODULE = "src.ark_api.marketplace_install.catalog"
NAMESPACE = "team-a"
SOURCE = "official"
SOURCE_URL = "https://example.com/marketplace.json"
OFFICIAL = "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/"
CREDENTIAL = derive_secret_name(SOURCE)
USER = ImpersonationConfig(username="alice", groups=["team-a"])
OFFICIAL_ITEMS = [
    "phoenix", "langfuse", "a2a-inspector", "mcp-inspector", "ark-sandbox", "noah", "argo-make-author",
    "file-gateway", "kyc-demo-bundle", "speech-mcp-server", "pdf-extraction-mcp", "web-research-mcp",
    "perplexity-ask-mcp", "companies-house-mcp", "kubernetes-mcp-server", "cobol-modernization-bundle",
    "kyc-onboarding-bundle", "executor-claude-agent-sdk", "executor-openai-responses", "executor-langchain",
]


def _item(name="phoenix", **ark):
    fields = {"chartPath": f"{OFFICIAL}{name}", "helmReleaseName": name}
    fields.update(ark)
    return {"name": name, "ark": {k: v for k, v in fields.items() if v is not None}}


def _config_map(sources=None):
    if sources is None:
        sources = {SOURCE: {"url": SOURCE_URL}}
    return SimpleNamespace(data={name: json.dumps(value) for name, value in sources.items()})


class _Cluster:
    def __init__(self, config_map=None, config_map_error=None, secrets=None):
        self.config_map = config_map if config_map is not None else _config_map()
        self.config_map_error = config_map_error
        self.secrets = secrets or {}
        self.impersonations = []
        self.core = MagicMock()
        self.core.read_namespaced_config_map = AsyncMock(side_effect=self._read_config_map)
        self.core.read_namespaced_secret = AsyncMock(side_effect=self._read_secret)

    async def _read_config_map(self, name, namespace):
        self.config_map_read = (name, namespace)
        if self.config_map_error is not None:
            raise self.config_map_error
        return self.config_map

    async def _read_secret(self, name, namespace):
        if name not in self.secrets:
            raise ApiException(status=403)
        return SimpleNamespace(data={"value": base64.b64encode(self.secrets[name].encode()).decode()})

    def client(self):
        @asynccontextmanager
        async def _client(impersonation):
            self.impersonations.append(impersonation)
            yield MagicMock()

        return _client


class CatalogTestCase(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {}, clear=False)
        env.start()
        self.addCleanup(env.stop)
        for name in (catalog.ALLOWLIST_ENV, catalog.PLAIN_HTTP_ENV):
            os.environ.pop(name, None)
        self.cluster = _Cluster()
        self.items = [_item()]
        self.fetches = []
        self._patch("get_impersonating_api_client", self.cluster.client())
        self._patch("client.CoreV1Api", lambda api: self.cluster.core)
        self._patch("fetch_manifest", self._fetch)

    def _patch(self, target, new):
        patcher = patch(f"{MODULE}.{target}", new)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def _fetch(self, http_client, url, auth_header=None):
        self.fetches.append((url, auth_header))
        if isinstance(self.items, Exception):
            raise self.items
        return {"items": self.items}

    def resolve(self, item="phoenix", source=SOURCE, impersonation=USER):
        return asyncio.run(catalog.resolve(NAMESPACE, source, item, impersonation))

    def assert_error(self, status, code, item="phoenix", source=SOURCE):
        with self.assertRaises(HTTPException) as raised:
            self.resolve(item=item, source=source)
        self.assertEqual(raised.exception.status_code, status)
        self.assertEqual(raised.exception.detail["code"], code)
        return raised.exception.detail["message"]


class TestResolve(CatalogTestCase):
    def test_resolves_an_official_item(self):
        resolved = self.resolve()
        self.assertEqual(
            resolved,
            catalog.ResolvedItem(
                source=SOURCE, item="phoenix", chart_ref=f"{OFFICIAL}phoenix", release="phoenix", plain_http=False
            ),
        )
        self.assertEqual(self.cluster.config_map_read, ("marketplace-sources", NAMESPACE))
        self.assertEqual(self.fetches, [(SOURCE_URL, None)])

    def test_reads_the_catalogue_as_the_user(self):
        self.resolve()
        self.assertEqual(self.cluster.impersonations, [USER])

    def test_open_mode_reads_as_ark_api(self):
        self.resolve(impersonation=None)
        self.assertEqual(self.cluster.impersonations, [None])

    def test_every_fetch_is_fresh_and_skips_the_items_cache(self):
        items_module._items_cache[(NAMESPACE, SOURCE, SOURCE_URL)] = (0.0, [_item(name="stale")])
        self.addCleanup(items_module._items_cache.clear)
        with patch.object(items_module, "_cache_get", side_effect=AssertionError("items cache used")):
            self.resolve()
            self.items = [_item(), _item(name="langfuse")]
            self.assertEqual(self.resolve(item="langfuse").chart_ref, f"{OFFICIAL}langfuse")
        self.assertEqual(len(self.fetches), 2)

    def test_release_name_defaults_to_the_item_name(self):
        self.items = [_item(helmReleaseName=None)]
        self.assertEqual(self.resolve().release, "phoenix")

    def test_release_name_comes_from_the_catalogue(self):
        self.items = [_item(helmReleaseName="phoenix-tracing")]
        self.assertEqual(self.resolve().release, "phoenix-tracing")

    def test_install_args_and_namespace_are_ignored(self):
        self.items = [_item(installArgs=["--set", "x=y", "--take-ownership"], namespace="kube-system")]
        resolved = self.resolve()
        self.assertEqual(resolved.chart_ref, f"{OFFICIAL}phoenix")
        self.assertNotIn("kube-system", repr(resolved))
        self.assertNotIn("take-ownership", repr(resolved))

    def test_installable_true_is_accepted(self):
        self.items = [_item(installable=True)]
        self.assertEqual(self.resolve().item, "phoenix")

    def test_source_credential_is_read_as_the_user_and_sent(self):
        self.cluster.config_map = _config_map(
            {SOURCE: {"url": SOURCE_URL, "auth": {"scheme": "bearer", "secretRef": CREDENTIAL}}}
        )
        self.cluster.secrets = {CREDENTIAL: "token-value"}
        self.resolve()
        self.assertEqual(self.fetches, [(SOURCE_URL, {"Authorization": "Bearer token-value"})])


class TestResolveErrors(CatalogTestCase):
    def test_missing_config_map(self):
        self.cluster.config_map_error = ApiException(status=404)
        self.assert_error(404, catalog.SOURCE_NOT_FOUND)

    def test_unreadable_config_map_is_reported(self):
        self.cluster.config_map_error = ApiException(status=403)
        message = self.assert_error(502, catalog.CATALOG_UNAVAILABLE)
        self.assertEqual(message, "You cannot read the marketplace sources of namespace team-a")

    def test_unreadable_config_map_in_open_mode_names_ark_api(self):
        self.cluster.config_map_error = ApiException(status=403)
        with self.assertRaises(HTTPException) as raised:
            self.resolve(impersonation=None)
        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(raised.exception.detail["message"], "ark-api cannot read the marketplace sources of namespace team-a")

    def test_config_map_server_error(self):
        self.cluster.config_map_error = ApiException(status=500)
        self.assert_error(502, catalog.CATALOG_UNAVAILABLE)

    def test_missing_source(self):
        self.assert_error(404, catalog.SOURCE_NOT_FOUND, source="other")
        self.assertEqual(self.fetches, [])

    def test_malformed_source(self):
        self.cluster.config_map = SimpleNamespace(data={SOURCE: "{not json"})
        self.assert_error(502, catalog.CATALOG_UNAVAILABLE)

    def test_other_malformed_sources_do_not_matter(self):
        self.cluster.config_map = SimpleNamespace(data={SOURCE: json.dumps({"url": SOURCE_URL}), "broken": "{"})
        self.assertEqual(self.resolve().item, "phoenix")

    def test_unreadable_credential(self):
        self.cluster.config_map = _config_map(
            {SOURCE: {"url": SOURCE_URL, "auth": {"scheme": "bearer", "secretRef": CREDENTIAL}}}
        )
        message = self.assert_error(502, catalog.CATALOG_UNAVAILABLE)
        self.assertEqual(message, "You cannot read the credential of marketplace source official")
        self.assertEqual(self.fetches, [])

    def test_fetch_failures(self):
        request = httpx.Request("GET", SOURCE_URL)
        failures = [
            SourceBlockedError("blocked"),
            httpx.ConnectTimeout("slow"),
            httpx.HTTPStatusError("500", request=request, response=httpx.Response(500, request=request)),
            json.JSONDecodeError("bad", "x", 0),
            UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte"),
        ]
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                self.items = failure
                self.assert_error(502, catalog.CATALOG_UNAVAILABLE)

    def test_missing_item(self):
        self.assert_error(404, catalog.ITEM_NOT_FOUND, item="langfuse")

    def test_manifest_without_items(self):
        self.items = None
        self.assert_error(404, catalog.ITEM_NOT_FOUND)

    def test_not_installable(self):
        for value in (False, "false", "true", 0, None):
            with self.subTest(installable=value):
                self.items = [{"name": "phoenix", "ark": {**_item()["ark"], "installable": value}}]
                self.assert_error(422, catalog.NOT_INSTALLABLE)

    def test_without_chart(self):
        for item in ({"name": "phoenix"}, {"name": "phoenix", "ark": "x"}, _item(chartPath=None), _item(chartPath="")):
            with self.subTest(item=item):
                self.items = [item]
                self.assert_error(422, catalog.NOT_INSTALLABLE)

    def test_chart_outside_the_allowlist(self):
        self.items = [_item(chartPath="oci://registry.evil.example/charts/phoenix")]
        self.assert_error(422, catalog.REGISTRY_NOT_ALLOWED)

    def test_invalid_release_names(self):
        for name in ("Phoenix", "phoenix_", "-phoenix", "phoenix-", "a" * 54, "a.b", 42):
            with self.subTest(name=name):
                self.items = [_item(helmReleaseName=name)]
                self.assert_error(422, catalog.NOT_INSTALLABLE)

    def test_release_name_of_53_characters_is_accepted(self):
        self.items = [_item(helmReleaseName="a" * 53)]
        self.assertEqual(self.resolve().release, "a" * 53)


class TestRegistryAllowlist(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {}, clear=False)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop(catalog.ALLOWLIST_ENV, None)
        os.environ.pop(catalog.PLAIN_HTTP_ENV, None)

    def test_every_official_item_passes(self):
        for name in OFFICIAL_ITEMS:
            with self.subTest(name=name):
                self.assertTrue(catalog.chart_ref_allowed(f"{OFFICIAL}{name}"))

    def test_rejected_references(self):
        rejected = [
            "https://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix",
            "http://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix",
            "ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix",
            "oci://docker.io/mckinsey/agents-at-scale-marketplace/charts/phoenix",
            "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts-evil/phoenix",
            "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/chartsphoenix",
            "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/../evil/phoenix",
            "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/sub/phoenix",
            "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/",
            "oci://user:pass@ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix",
            "oci://ghcr.io:443/mckinsey/agents-at-scale-marketplace/charts/phoenix",
            "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix@sha256:abc",
            "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix:1.0.0",
            "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix?x=y",
            "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix#x",
            "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/Phoenix",
            "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix\n",
            "oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts/phoenix --set x=y",
            "oci://GHCR.io/mckinsey/agents-at-scale-marketplace/charts/phoenix",
        ]
        for chart_ref in rejected:
            with self.subTest(chart_ref=chart_ref):
                self.assertFalse(catalog.chart_ref_allowed(chart_ref))

    def test_custom_allowlist(self):
        os.environ[catalog.ALLOWLIST_ENV] = " oci://registry.local:5000/charts/ , oci://ghcr.io/acme/ "
        self.assertTrue(catalog.chart_ref_allowed("oci://registry.local:5000/charts/fixture-ok"))
        self.assertTrue(catalog.chart_ref_allowed("oci://ghcr.io/acme/tool"))
        self.assertFalse(catalog.chart_ref_allowed(f"{OFFICIAL}phoenix"))
        self.assertFalse(catalog.chart_ref_allowed("oci://registry.local/charts/fixture-ok"))

    def test_malformed_allowlist_entries_are_ignored(self):
        os.environ[catalog.ALLOWLIST_ENV] = "oci://ghcr.io/acme,https://ghcr.io/acme/,oci://,oci:///,oci:///x/,*"
        with self.assertLogs(MODULE, level="WARNING"):
            self.assertEqual(catalog.registry_allowlist(), [])
            self.assertFalse(catalog.chart_ref_allowed("oci://ghcr.io/acme/tool"))
            self.assertFalse(catalog.chart_ref_allowed("oci://ghcr.io/acmetool"))

    def test_short_registry_hosts_are_allowed(self):
        os.environ[catalog.ALLOWLIST_ENV] = "oci://a/"
        self.assertTrue(catalog.chart_ref_allowed("oci://a/tool"))

    def test_empty_allowlist_allows_nothing(self):
        os.environ[catalog.ALLOWLIST_ENV] = ""
        self.assertFalse(catalog.chart_ref_allowed(f"{OFFICIAL}phoenix"))

    def test_plain_http_only_for_listed_hosts(self):
        os.environ[catalog.PLAIN_HTTP_ENV] = "registry.local:5000"
        self.assertTrue(catalog.uses_plain_http("oci://registry.local:5000/charts/fixture-ok"))
        self.assertFalse(catalog.uses_plain_http("oci://registry.local/charts/fixture-ok"))
        self.assertFalse(catalog.uses_plain_http(f"{OFFICIAL}phoenix"))

    def test_plain_http_off_by_default(self):
        self.assertFalse(catalog.uses_plain_http("oci://registry.local:5000/charts/fixture-ok"))


class TestResolvePlainHttp(CatalogTestCase):
    def test_plain_http_follows_the_registry(self):
        os.environ[catalog.ALLOWLIST_ENV] = "oci://registry.local:5000/charts/"
        os.environ[catalog.PLAIN_HTTP_ENV] = "registry.local:5000"
        self.items = [_item(name="fixture-ok", chartPath="oci://registry.local:5000/charts/fixture-ok")]
        self.assertTrue(self.resolve(item="fixture-ok").plain_http)


if __name__ == "__main__":
    unittest.main()
