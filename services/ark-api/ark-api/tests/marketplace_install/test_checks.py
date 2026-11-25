import unittest
from typing import AbstractSet, Optional

from src.ark_api.marketplace_install import checks

NAMESPACE = "team-a"
PERSONAL = "u-0123456789abcdef-token"


def _obj(kind, name="demo", api_version="v1", **fields):
    return {"apiVersion": api_version, "kind": kind, "metadata": {"name": name, **fields.pop("meta", {})}, **fields}


def _role(*rules, name="demo"):
    return _obj("Role", name=name, api_version="rbac.authorization.k8s.io/v1", rules=list(rules))


def _binding(role_kind="Role", role_name="demo", subjects=None):
    return _obj(
        "RoleBinding",
        api_version="rbac.authorization.k8s.io/v1",
        roleRef={"apiGroup": "rbac.authorization.k8s.io", "kind": role_kind, "name": role_name},
        subjects=subjects if subjects is not None else [{"kind": "ServiceAccount", "name": "default"}],
    )


def _pod_spec(**spec):
    return {"containers": [{"name": "c", "image": "nginx", **spec.pop("container", {})}], **spec}


def _deployment(**spec):
    return _obj("Deployment", api_version="apps/v1", spec={"template": {"spec": _pod_spec(**spec)}})


def _verdict(
    obj, chart_roles: AbstractSet[str] = frozenset({"demo"}), namespaced: Optional[bool] = True, personal: AbstractSet[str] = frozenset()
):
    return checks.manifest_verdict(obj, NAMESPACE, set(chart_roles), namespaced, set(personal))


class TestScope(unittest.TestCase):
    def test_plain_objects_pass(self):
        for obj in (
            _obj("ConfigMap"),
            _obj("Service", spec={"ports": [{"port": 80}]}),
            _deployment(),
            _obj("ConfigMap", meta={"namespace": NAMESPACE}),
            _obj("ConfigMap", meta={"namespace": ""}),
        ):
            with self.subTest(kind=obj["kind"]):
                self.assertIsNone(_verdict(obj))

    def test_crd(self):
        crd = _obj("CustomResourceDefinition", api_version="apiextensions.k8s.io/v1")
        self.assertEqual(_verdict(crd, namespaced=False).state, "crd")

    def test_cluster_scoped(self):
        role = _obj("ClusterRole", api_version="rbac.authorization.k8s.io/v1")
        self.assertEqual(_verdict(role, namespaced=False).state, "cluster-scoped")

    def test_unknown_scope_is_left_to_the_cluster_check(self):
        self.assertIsNone(_verdict(_obj("Widget", api_version="example.com/v1"), namespaced=None))

    def test_namespace_mismatch(self):
        verdict = _verdict(_obj("ConfigMap", meta={"namespace": "default"}))
        self.assertEqual(verdict.state, "namespace-mismatch")
        self.assertIn("default", verdict.message)

    def test_skip_webhook_label(self):
        obj = _obj("ConfigMap", meta={"labels": {"ark.mckinsey.com/skip-webhook-validation": "true"}})
        self.assertEqual(_verdict(obj).state, "skip-webhook-label")

    def test_hooks(self):
        self.assertTrue(checks.is_hook(_obj("Job", meta={"annotations": {"helm.sh/hook": "pre-install"}})))
        self.assertFalse(checks.is_hook(_obj("Job")))


class TestRbacEscalation(unittest.TestCase):
    def assert_escalates(self, obj, **kwargs):
        verdict = _verdict(obj, **kwargs)
        self.assertIsNotNone(verdict)
        self.assertEqual(verdict.state, "rbac-escalation")

    def test_dangerous_roles(self):
        rules = [
            {"apiGroups": ["rbac.authorization.k8s.io"], "resources": ["roles"], "verbs": ["get"]},
            {"apiGroups": ["*"], "resources": ["configmaps"], "verbs": ["get"]},
            {"apiGroups": [""], "resources": ["*"], "verbs": ["get"]},
            {"apiGroups": [""], "resources": ["configmaps"], "verbs": ["*"]},
            {"apiGroups": [""], "resources": ["secrets"], "verbs": ["create"]},
            {"apiGroups": [""], "resources": ["secrets"], "verbs": ["patch"]},
            {"apiGroups": [""], "resources": ["pods/exec"], "verbs": ["create"]},
            {"apiGroups": [""], "resources": ["pods/attach"], "verbs": ["create"]},
            {"apiGroups": [""], "resources": ["pods/ephemeralcontainers"], "verbs": ["patch"]},
            {"apiGroups": [""], "resources": ["serviceaccounts/token"], "verbs": ["create"]},
            {"apiGroups": [""], "resources": ["users"], "verbs": ["impersonate"]},
            {"apiGroups": [""], "resources": ["roles"], "verbs": ["escalate"]},
            {"apiGroups": [""], "resources": ["*/exec"], "verbs": ["create"]},
            {"apiGroups": [""], "resources": ["*/token"], "verbs": ["create"]},
            {"apiGroups": [""], "resources": ["*/attach"], "verbs": ["create"]},
            {"apiGroups": [""], "resources": ["pods/*"], "verbs": ["create"]},
            {"apiGroups": [""], "resources": ["serviceaccounts/*"], "verbs": ["create"]},
            {"apiGroups": [""], "resources": ["secrets/*"], "verbs": ["get"]},
            {"apiGroups": [""], "resources": ["secrets"], "verbs": ["get"]},
            {"apiGroups": [""], "resources": ["secrets"], "verbs": ["list", "watch"]},
            {"apiGroups": [""], "resources": ["secrets"], "verbs": ["get"], "resourceNames": ["own-secret"]},
            "not a rule",
        ]
        for rule in rules:
            with self.subTest(rule=rule):
                self.assert_escalates(_role(rule))

    def test_rules_that_are_not_a_list(self):
        self.assert_escalates(_obj("Role", api_version="rbac.authorization.k8s.io/v1", rules="*"))

    def test_safe_roles(self):
        for rule in (
            {"apiGroups": [""], "resources": ["configmaps"], "verbs": ["get", "list", "watch", "create"]},
            {"apiGroups": [""], "resources": ["pods/log", "pods/status"], "verbs": ["get"]},
            {"apiGroups": ["apps"], "resources": ["deployments"], "verbs": ["get", "patch"]},
        ):
            with self.subTest(rule=rule):
                self.assertIsNone(_verdict(_role(rule)))
        self.assertIsNone(_verdict(_obj("Role", api_version="rbac.authorization.k8s.io/v1")))

    def test_binding_to_a_chart_role_for_a_local_account_passes(self):
        self.assertIsNone(_verdict(_binding()))
        self.assertIsNone(_verdict(_binding(subjects=[{"kind": "ServiceAccount", "name": "app", "namespace": NAMESPACE}])))
        self.assertIsNone(_verdict(_binding(subjects=[{"kind": "User", "name": "alice"}])))

    def test_dangerous_bindings(self):
        cases = {
            "cluster role": _binding(role_kind="ClusterRole", role_name="admin"),
            "role outside the chart": _binding(role_name="ark-tenant"),
            "other namespace": _binding(subjects=[{"kind": "ServiceAccount", "name": "x", "namespace": "kube-system"}]),
            "group": _binding(subjects=[{"kind": "Group", "name": "system:authenticated"}]),
            "system user": _binding(subjects=[{"kind": "User", "name": "system:kube-scheduler"}]),
            "installer account": _binding(subjects=[{"kind": "ServiceAccount", "name": "ark-marketplace-installer"}]),
            "malformed subjects": _binding(subjects="everyone"),
        }
        for label, binding in cases.items():
            with self.subTest(case=label):
                self.assert_escalates(binding)

    def test_installer_account_anywhere(self):
        cases = {
            "deployment": _deployment(serviceAccountName="ark-marketplace-installer"),
            "deprecated field": _deployment(serviceAccount="ark-marketplace-installer"),
            "cronjob": _obj(
                "CronJob",
                api_version="batch/v1",
                spec={"jobTemplate": {"spec": {"template": {"spec": _pod_spec(serviceAccountName="ark-marketplace-installer")}}}},
            ),
            "bare pod": _obj("Pod", spec=_pod_spec(serviceAccountName="ark-marketplace-installer")),
            "token secret": _obj(
                "Secret",
                type="kubernetes.io/service-account-token",
                meta={"annotations": {"kubernetes.io/service-account.name": "ark-marketplace-installer"}},
            ),
            "service account": _obj("ServiceAccount", name="ark-marketplace-installer"),
            "ark resource": _obj("ExecutionEngine", api_version="ark.mckinsey.com/v1prealpha1", spec={"serviceAccountName": "ark-marketplace-installer"}),
        }
        for label, obj in cases.items():
            with self.subTest(case=label):
                self.assert_escalates(obj)

    def test_other_accounts_pass(self):
        self.assertIsNone(_verdict(_deployment(serviceAccountName="app")))


class TestSecrets(unittest.TestCase):
    def test_reserved_name(self):
        self.assertEqual(_verdict(_obj("Secret", name=PERSONAL)).state, "reserved-secret")

    def test_personal_scope_label(self):
        for scope in ("user-0123456789abcdef", "anything-else", ""):
            with self.subTest(scope=scope):
                obj = _obj("Secret", meta={"labels": {"ark.mckinsey.com/scope": scope}})
                self.assertEqual(_verdict(obj).state, "reserved-secret")

    def test_shared_or_unlabelled_secrets_pass(self):
        self.assertIsNone(_verdict(_obj("Secret", meta={"labels": {"ark.mckinsey.com/scope": "shared"}})))
        self.assertIsNone(_verdict(_obj("Secret")))

    def test_reserved_name_on_other_kinds_is_not_a_secret_verdict(self):
        self.assertIsNone(_verdict(_obj("ConfigMap", name=PERSONAL)))

    def test_every_reference_form(self):
        cases = {
            "secretKeyRef": _deployment(container={"env": [{"name": "K", "valueFrom": {"secretKeyRef": {"name": PERSONAL, "key": "k"}}}]}),
            "envFrom": _deployment(container={"envFrom": [{"secretRef": {"name": PERSONAL}}]}),
            "volume": _deployment(volumes=[{"name": "v", "secret": {"secretName": PERSONAL}}]),
            "projected": _deployment(volumes=[{"name": "v", "projected": {"sources": [{"secret": {"name": PERSONAL}}]}}]),
            "imagePullSecrets": _deployment(imagePullSecrets=[{"name": PERSONAL}]),
            "init container": _deployment(initContainers=[{"name": "i", "envFrom": [{"secretRef": {"name": PERSONAL}}]}]),
            "nested cronjob": _obj(
                "CronJob",
                api_version="batch/v1",
                spec={"jobTemplate": {"spec": {"template": {"spec": _pod_spec(volumes=[{"name": "v", "secret": {"secretName": PERSONAL}}])}}}},
            ),
            "ark resource": _obj(
                "Model",
                api_version="ark.mckinsey.com/v1alpha1",
                spec={"config": {"openai": {"apiKey": {"valueFrom": {"secretKeyRef": {"name": PERSONAL, "key": "token"}}}}}},
            ),
            "odd key case": _deployment(container={"envFrom": [{"SecretRef": {"Name": PERSONAL}}]}),
            "mcp token": _obj(
                "MCPServer",
                api_version="ark.mckinsey.com/v1alpha1",
                spec={"authorization": {"tokenSecretRef": {"name": PERSONAL}}},
            ),
            "csi volume": _deployment(volumes=[{"name": "v", "csi": {"driver": "x", "nodePublishSecretRef": {"name": PERSONAL}}}]),
        }
        for label, obj in cases.items():
            with self.subTest(case=label):
                verdict = _verdict(obj)
                self.assertIsNotNone(verdict)
                self.assertEqual(verdict.state, "personal-secret-ref")
                self.assertIn(PERSONAL, verdict.message)

    def test_reference_to_a_personal_secret_by_labels(self):
        obj = _deployment(volumes=[{"name": "v", "secret": {"secretName": "team-key"}}])
        self.assertIsNone(_verdict(obj))
        self.assertEqual(_verdict(obj, personal={"team-key"}).state, "personal-secret-ref")

    def test_referenced_names_are_collected(self):
        obj = _deployment(
            container={"envFrom": [{"secretRef": {"name": "a"}}], "env": [{"valueFrom": {"secretKeyRef": {"name": "b"}}}]},
            volumes=[{"secret": {"secretName": "c"}}, {"projected": {"sources": [{"secret": {"name": "d"}}]}}],
            imagePullSecrets=[{"name": "e"}],
        )
        self.assertEqual(checks.referenced_secret_names(obj), {"a", "b", "c", "d", "e"})


class TestOrderAndRoles(unittest.TestCase):
    def test_first_verdict_wins(self):
        crd_elsewhere = _obj("CustomResourceDefinition", api_version="apiextensions.k8s.io/v1", meta={"namespace": "x"})
        self.assertEqual(_verdict(crd_elsewhere, namespaced=False).state, "crd")
        mismatch_and_label = _obj(
            "ConfigMap", meta={"namespace": "x", "labels": {"ark.mckinsey.com/skip-webhook-validation": "true"}}
        )
        self.assertEqual(_verdict(mismatch_and_label).state, "namespace-mismatch")
        label_and_installer = _deployment(serviceAccountName="ark-marketplace-installer")
        label_and_installer["metadata"]["labels"] = {"ark.mckinsey.com/skip-webhook-validation": "true"}
        self.assertEqual(_verdict(label_and_installer).state, "skip-webhook-label")
        installer_and_personal = _deployment(
            serviceAccountName="ark-marketplace-installer", volumes=[{"secret": {"secretName": PERSONAL}}]
        )
        self.assertEqual(_verdict(installer_and_personal).state, "rbac-escalation")
        reserved_and_ref = _obj("Secret", name=PERSONAL)
        self.assertEqual(_verdict(reserved_and_ref).state, "reserved-secret")

    def test_rendered_roles(self):
        objects = [_role(name="a"), _obj("ClusterRole", name="b", api_version="rbac.authorization.k8s.io/v1"), _obj("ConfigMap", name="c")]
        self.assertEqual(checks.rendered_roles(objects), {"a"})


if __name__ == "__main__":
    unittest.main()
