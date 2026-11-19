import asyncio
import json
import unittest
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import patch

from kubernetes_asyncio.client.rest import ApiException
import aiohttp
from kubernetes_asyncio.dynamic.exceptions import ResourceNotFoundError, ResourceNotUniqueError

from src.ark_api.marketplace_install import preview
from src.ark_api.marketplace_install.checks import ObjectRef

MODULE = "src.ark_api.marketplace_install.preview"
NAMESPACE = "team-a"
INSTALLER = "system:serviceaccount:team-a:ark-marketplace-installer"
PSA_WARNING = 'would violate PodSecurity "restricted:latest": allowPrivilegeEscalation != false'

KINDS = {
    ("v1", "ConfigMap"): ("configmaps", True),
    ("v1", "Secret"): ("secrets", True),
    ("v1", "Pod"): ("pods", True),
    ("apps/v1", "Deployment"): ("deployments", True),
    ("rbac.authorization.k8s.io/v1", "ClusterRole"): ("clusterroles", False),
    ("ark.mckinsey.com/v1alpha1", "Agent"): ("agents", True),
}


def _obj(kind, name="demo", api_version="v1", **meta):
    return {"apiVersion": api_version, "kind": kind, "metadata": {"name": name, **meta}}


def _api_error(status, message=None):
    error = ApiException(status=status, reason="Reason")
    error.body = json.dumps({"message": message}) if message else None
    return error


class _Response:
    def __init__(self, warnings):
        self.headers = SimpleNamespace(getall=lambda name, default: warnings if name == "Warning" else default)
        self.released = False

    def release(self):
        self.released = True


class FakeDynamic:
    def __init__(self):
        self.existing = {}
        self.get_errors = {}
        self.dry_run_errors = {}
        self.warnings = {}
        self.gets = []
        self.dry_runs = []
        self.responses = []
        self.resources = SimpleNamespace(get=self._resource)

    async def _resource(self, api_version, kind):
        if kind == "Binding":
            raise ResourceNotUniqueError("Binding")
        if kind == "List":
            return SimpleNamespace(api_version=api_version, kind=kind)
        if (api_version, kind) not in KINDS:
            raise ResourceNotFoundError(f"{api_version} {kind}")
        plural, namespaced = KINDS[(api_version, kind)]
        return SimpleNamespace(name=plural, namespaced=namespaced, group=api_version)

    async def get(self, resource, name=None, namespace=None):
        self.gets.append((resource.name, name, namespace))
        if (resource.name, name) in self.get_errors:
            raise self.get_errors[(resource.name, name)]
        if (resource.name, name) in self.existing:
            return SimpleNamespace(to_dict=lambda: self.existing[(resource.name, name)])
        raise _api_error(404)

    async def create(self, resource, body: dict, namespace=None, dry_run=None, serialize=True):
        if body["apiVersion"].startswith("ark.mckinsey.com/"):
            raise AssertionError("dry run sent to Ark's API server")
        self.dry_runs.append((resource.name, body, namespace, dry_run, serialize))
        if (resource.name, body["metadata"]["name"]) in self.dry_run_errors:
            raise self.dry_run_errors[(resource.name, body["metadata"]["name"])]
        response = _Response(self.warnings.get((resource.name, body["metadata"]["name"]), []))
        self.responses.append(response)
        return response


class PreviewClusterTestCase(unittest.TestCase):
    def setUp(self):
        self.dynamic = FakeDynamic()
        self.impersonations = []
        self.secret_labels = {}
        self.secret_errors = set()
        self.secret_reads = []

        @asynccontextmanager
        async def fake_client(impersonation):
            self.impersonations.append(impersonation)
            yield object()

        async def fake_dynamic(api):
            return self.dynamic

        async def fake_labels(namespace, name):
            self.secret_reads.append((namespace, name))
            if name in self.secret_errors:
                raise _api_error(500)
            return self.secret_labels.get(name)

        for target, new in (
            ("get_impersonating_api_client", fake_client),
            ("create_dynamic_client", fake_dynamic),
            ("read_secret_labels", fake_labels),
        ):
            patcher = patch(f"{MODULE}.{target}", new)
            patcher.start()
            self.addCleanup(patcher.stop)
        secret_client = patch("ark_sdk.k8s.SecretClient", side_effect=AssertionError("SecretClient used"))
        secret_client.start()
        self.addCleanup(secret_client.stop)

    def check(self, *objects):
        return asyncio.run(preview.check_objects(NAMESPACE, list(objects)))

    def one(self, obj):
        [row] = self.check(obj)
        return row


class TestConflicts(PreviewClusterTestCase):
    def test_free_object_is_dry_run_as_the_installer(self):
        row = self.one(_obj("ConfigMap"))
        self.assertEqual(row.state, "free")
        self.assertEqual(row.ref, ObjectRef("v1", "ConfigMap", "demo", "configmaps", True))
        [(plural, body, namespace, dry_run, serialize)] = self.dynamic.dry_runs
        self.assertEqual((plural, namespace, dry_run, serialize), ("configmaps", NAMESPACE, "All", False))
        self.assertEqual(body["metadata"]["namespace"], NAMESPACE)
        self.assertTrue(self.dynamic.responses[0].released)
        self.assertEqual([i.username for i in self.impersonations], [INSTALLER])
        self.assertEqual([i.groups for i in self.impersonations], [[]])

    def test_owned_by_another_release(self):
        self.dynamic.existing[("configmaps", "demo")] = _obj("ConfigMap", annotations={"meta.helm.sh/release-name": "other"})
        row = self.one(_obj("ConfigMap"))
        self.assertEqual((row.state, row.owned_by_release), ("conflict-release", "other"))
        self.assertEqual(self.dynamic.dry_runs, [])

    def test_owned_by_no_release(self):
        self.dynamic.existing[("configmaps", "demo")] = _obj("ConfigMap", annotations={"other": "x"})
        self.assertEqual(self.one(_obj("ConfigMap")).state, "conflict-unmanaged")
        self.dynamic.existing[("configmaps", "demo")] = _obj("ConfigMap")
        self.assertEqual(self.one(_obj("ConfigMap")).state, "conflict-unmanaged")
        self.assertEqual(self.dynamic.dry_runs, [])

    def test_forbidden_read_is_unverifiable(self):
        self.dynamic.get_errors[("configmaps", "demo")] = _api_error(403)
        row = self.one(_obj("ConfigMap"))
        self.assertEqual(row.state, "unverifiable")
        self.assertIn("cannot read", row.message)

    def test_other_read_errors_are_unverifiable(self):
        self.dynamic.get_errors[("configmaps", "demo")] = _api_error(500, "etcd unavailable")
        self.assertEqual(self.one(_obj("ConfigMap")).message, "etcd unavailable")

    def test_unknown_kind(self):
        row = self.one(_obj("Widget", api_version="example.com/v1"))
        self.assertEqual(row.state, "unverifiable")
        self.assertIn("Widget", row.message)
        self.assertEqual(self.dynamic.gets, [])

    def test_cluster_scoped_from_discovery(self):
        row = self.one(_obj("ClusterRole", api_version="rbac.authorization.k8s.io/v1"))
        self.assertEqual(row.state, "cluster-scoped")
        self.assertEqual((self.dynamic.gets, self.dynamic.dry_runs), ([], []))

    def test_ambiguous_kinds_and_lists_are_unverifiable(self):
        for obj in (_obj("Binding"), _obj("List", items=[_obj("ConfigMap")])):
            with self.subTest(kind=obj["kind"]):
                row = self.one(obj)
                self.assertEqual(row.state, "unverifiable")
                self.assertIn("no single resource", row.message)

    def test_connection_errors_are_unverifiable(self):
        self.dynamic.get_errors[("configmaps", "demo")] = aiohttp.ClientConnectionError("reset")
        self.assertEqual(self.one(_obj("ConfigMap")).message, "Could not reach the API server")
        self.dynamic.get_errors.clear()
        self.dynamic.dry_run_errors[("configmaps", "demo")] = aiohttp.ServerTimeoutError("slow")
        row = self.one(_obj("ConfigMap"))
        self.assertEqual((row.state, row.message), ("unverifiable", "Could not reach the API server"))

    def test_object_without_a_name(self):
        obj = {"apiVersion": "v1", "kind": "ConfigMap", "metadata": {"generateName": "demo-"}}
        self.assertEqual(self.one(obj).state, "unverifiable")

    def test_static_verdicts_skip_the_cluster(self):
        row = self.one(_obj("ConfigMap", namespace="default"))
        self.assertEqual(row.state, "namespace-mismatch")
        self.assertIsNone(row.ref)
        self.assertEqual((self.dynamic.gets, self.dynamic.dry_runs), ([], []))

    def test_hooks_are_flagged(self):
        self.assertTrue(self.one(_obj("ConfigMap", annotations={"helm.sh/hook": "pre-install"})).hook)


class TestDryRun(PreviewClusterTestCase):
    def test_ark_resources_are_never_dry_run(self):
        row = self.one(_obj("Agent", api_version="ark.mckinsey.com/v1alpha1"))
        self.assertEqual(row.state, "free")
        self.assertEqual(self.dynamic.gets, [("agents", "demo", NAMESPACE)])
        self.assertEqual(self.dynamic.dry_runs, [])

    def test_pod_security_warning(self):
        self.dynamic.warnings[("deployments", "demo")] = ["unrelated", PSA_WARNING]
        row = self.one(_obj("Deployment", api_version="apps/v1"))
        self.assertEqual(row.state, "psa-violation")
        self.assertEqual(row.message, PSA_WARNING)

    def test_warning_header_format_from_the_api_server(self):
        header = '299 - "would violate PodSecurity \\"restricted:latest\\": allowPrivilegeEscalation != false"'
        self.dynamic.warnings[("deployments", "demo")] = [header]
        row = self.one(_obj("Deployment", api_version="apps/v1"))
        self.assertEqual(row.state, "psa-violation")
        self.assertEqual(row.message, 'would violate PodSecurity "restricted:latest": allowPrivilegeEscalation != false')

    def test_other_warnings_pass(self):
        self.dynamic.warnings[("deployments", "demo")] = ["spec.template uses a deprecated field"]
        self.assertEqual(self.one(_obj("Deployment", api_version="apps/v1")).state, "free")

    def test_pod_security_rejection(self):
        self.dynamic.dry_run_errors[("pods", "demo")] = _api_error(
            403, 'pods "demo" is forbidden: violates PodSecurity "restricted:latest": runAsNonRoot != true'
        )
        self.assertEqual(self.one(_obj("Pod")).state, "psa-violation")

    def test_other_rejections_are_unverifiable(self):
        self.dynamic.dry_run_errors[("configmaps", "demo")] = _api_error(403, "exceeded quota: " + "x" * 1000)
        row = self.one(_obj("ConfigMap"))
        self.assertEqual(row.state, "unverifiable")
        self.assertTrue(row.message.startswith("Rejected by the API server: exceeded quota"))
        self.assertLessEqual(len(row.message), 400)

    def test_rejection_without_a_status_body(self):
        self.dynamic.dry_run_errors[("configmaps", "demo")] = _api_error(422)
        self.assertEqual(self.one(_obj("ConfigMap")).message, "Rejected by the API server: 422 Reason")


class TestPersonalSecrets(PreviewClusterTestCase):
    def deployment(self, secret):
        obj = _obj("Deployment", api_version="apps/v1")
        obj["spec"] = {"template": {"spec": {"containers": [{"name": "c"}], "volumes": [{"secret": {"secretName": secret}}]}}}
        return obj

    def test_reference_to_a_secret_with_personal_labels(self):
        self.secret_labels["team-key"] = {"ark.mckinsey.com/resource-type": "secret", "ark.mckinsey.com/scope": "user-0123456789abcdef"}
        row = self.one(self.deployment("team-key"))
        self.assertEqual(row.state, "personal-secret-ref")
        self.assertEqual(self.secret_reads, [(NAMESPACE, "team-key")])

    def test_shared_or_missing_secrets_pass(self):
        self.secret_labels["shared"] = {"ark.mckinsey.com/resource-type": "secret", "ark.mckinsey.com/scope": "shared"}
        self.assertEqual(self.one(self.deployment("shared")).state, "free")
        self.assertEqual(self.one(self.deployment("missing")).state, "free")

    def test_reserved_names_are_blocked_without_a_read(self):
        self.assertEqual(self.one(self.deployment("u-0123456789abcdef-token")).state, "personal-secret-ref")
        self.assertEqual(self.secret_reads, [])

    def test_unreadable_labels_make_the_object_unverifiable(self):
        self.secret_errors.add("team-key")
        with self.assertLogs(MODULE, level="WARNING"):
            row = self.one(self.deployment("team-key"))
        self.assertEqual(row.state, "unverifiable")
        self.assertIn("team-key", row.message)

    def test_label_read_connection_errors_are_unverifiable(self):
        async def broken(namespace, name):
            raise aiohttp.ClientConnectionError("reset")

        with patch(f"{MODULE}.read_secret_labels", broken), self.assertLogs(MODULE, level="WARNING"):
            self.assertEqual(self.one(self.deployment("team-key")).state, "unverifiable")

    def test_each_secret_is_read_once(self):
        self.check(self.deployment("team-key"), self.deployment("team-key"))
        self.assertEqual(self.secret_reads, [(NAMESPACE, "team-key")])


class TestMany(PreviewClusterTestCase):
    def test_rows_keep_the_rendered_order(self):
        rows = self.check(*(_obj("ConfigMap", name=f"cm-{i}") for i in range(30)))
        self.assertEqual([row.name for row in rows], [f"cm-{i}" for i in range(30)])


if __name__ == "__main__":
    unittest.main()
