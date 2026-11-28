import asyncio
import unittest
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from kubernetes_asyncio import client as k8s
from kubernetes_asyncio.client.rest import ApiException

from src.ark_api.marketplace_install import capability

MODULE = "src.ark_api.marketplace_install.capability"
NAMESPACE = "team-a"
POLICY = "ark-marketplace-installer-sa-team-a"
BOOTSTRAP = "ark-marketplace-installer-sa-team-a-bootstrap"
NS_LABELS = {"kubernetes.io/metadata.name": NAMESPACE, "tier": "gold"}


def _selector(match_labels=None, expressions=None):
    return k8s.V1MatchResources(
        namespace_selector=k8s.V1LabelSelector(
            match_labels=match_labels,
            match_expressions=[
                k8s.V1LabelSelectorRequirement(key=key, operator=op, values=values)
                for key, op, values in expressions or []
            ] or None,
        )
    )


def _binding(policy_name=POLICY, actions=("Deny",), match_resources="default"):
    if match_resources == "default":
        match_resources = _selector({"kubernetes.io/metadata.name": NAMESPACE})
    return k8s.V1ValidatingAdmissionPolicyBinding(
        spec=k8s.V1ValidatingAdmissionPolicyBindingSpec(
            policy_name=policy_name,
            validation_actions=list(actions),
            match_resources=match_resources,
        )
    )


def _policy(match_constraints=None, failure_policy="Fail"):
    return k8s.V1ValidatingAdmissionPolicy(
        spec=k8s.V1ValidatingAdmissionPolicySpec(match_constraints=match_constraints, failure_policy=failure_policy)
    )


def _rule(resource="pods"):
    return k8s.V1NamedRuleWithOperations(api_groups=[""], api_versions=["v1"], operations=["CREATE"], resources=[resource])


def _not_found(*args, **kwargs):
    raise ApiException(status=404, reason="Not Found")


class FakeAdmission:
    def __init__(self, bindings=None, policies=None, error=None, errors=None, namespaces=None, namespace_error=None):
        self.bindings = bindings or {}
        self.policies = policies or {}
        self.error = error
        self.errors = errors or {}
        self.namespaces = {NAMESPACE: dict(NS_LABELS)} if namespaces is None else namespaces
        self.namespace_error = namespace_error
        self.impersonations = []

    @asynccontextmanager
    async def api_client(self, impersonation=None):
        self.impersonations.append(impersonation)
        yield MagicMock()

    def _reader(self, objects):
        async def read(name):
            if self.error is not None:
                raise self.error
            if name in self.errors:
                raise self.errors[name]
            if name not in objects:
                _not_found()
            return objects[name]

        return read

    def admission_api(self, api):
        return SimpleNamespace(
            read_validating_admission_policy_binding=self._reader(self.bindings),
            read_validating_admission_policy=self._reader(self.policies),
        )

    def core_api(self, api):
        async def read_namespace(name):
            if self.namespace_error is not None:
                raise self.namespace_error
            return k8s.V1Namespace(metadata=k8s.V1ObjectMeta(name=name, labels=self.namespaces[name]))

        return SimpleNamespace(read_namespace=read_namespace)

    def run(self):
        with patch(f"{MODULE}.get_impersonating_api_client", self.api_client), patch(
            f"{MODULE}.client.AdmissionregistrationV1Api", self.admission_api
        ), patch(f"{MODULE}.client.CoreV1Api", self.core_api):
            return asyncio.run(capability.policy_in_place(NAMESPACE))


class TestPolicyInPlace(unittest.TestCase):
    def test_skipped_pairs_are_logged_with_the_reason(self):
        fake = FakeAdmission(bindings={POLICY: _binding(actions=("Audit",))}, policies={POLICY: _policy()})
        with self.assertLogs(MODULE, level="INFO") as logs:
            self.assertFalse(fake.run())
        self.assertEqual(
            logs.output,
            [
                f"INFO:{MODULE}:Marketplace install policy {POLICY} does not protect the installer: "
                "binding is not a Deny binding of the policy with its name",
                f"INFO:{MODULE}:Marketplace install policy {BOOTSTRAP} does not protect the installer: binding not found",
            ],
        )

    def test_each_problem_has_its_reason(self):
        cases = [
            (FakeAdmission(bindings={POLICY: _binding()}), "policy not found"),
            (
                FakeAdmission(bindings={POLICY: _binding()}, policies={POLICY: _policy(failure_policy="Ignore")}),
                "policy failurePolicy is not Fail",
            ),
            (
                FakeAdmission(
                    bindings={POLICY: _binding(match_resources=_selector({"kubernetes.io/metadata.name": "team-b"}))},
                    policies={POLICY: _policy()},
                ),
                "binding or policy does not cover the namespace",
            ),
        ]
        for fake, reason in cases:
            with self.subTest(reason=reason):
                with self.assertLogs(MODULE, level="INFO") as logs:
                    self.assertFalse(fake.run())
                self.assertTrue(logs.output[0].endswith(f"{POLICY} does not protect the installer: {reason}"))

    def test_binding_and_policy_in_place(self):
        fake = FakeAdmission(bindings={POLICY: _binding()}, policies={POLICY: _policy()})
        self.assertTrue(fake.run())
        self.assertEqual(fake.impersonations, [None])

    def test_binding_missing(self):
        self.assertFalse(FakeAdmission(policies={POLICY: _policy()}).run())

    def test_binding_in_audit_only(self):
        fake = FakeAdmission(bindings={POLICY: _binding(actions=("Audit",))}, policies={POLICY: _policy()})
        self.assertFalse(fake.run())

    def test_binding_in_warn_and_deny(self):
        fake = FakeAdmission(bindings={POLICY: _binding(actions=("Warn", "Deny"))}, policies={POLICY: _policy()})
        self.assertTrue(fake.run())

    def test_binding_points_at_missing_policy(self):
        fake = FakeAdmission(bindings={POLICY: _binding(policy_name="gone")}, policies={POLICY: _policy()})
        self.assertFalse(fake.run())

    def test_binding_must_point_at_its_own_policy(self):
        fake = FakeAdmission(
            bindings={POLICY: _binding(policy_name=BOOTSTRAP)},
            policies={POLICY: _policy(), BOOTSTRAP: _policy()},
        )
        self.assertFalse(fake.run())

    def test_policy_failure_policy(self):
        for failure_policy, expected in (("Fail", True), (None, True), ("Ignore", False)):
            with self.subTest(failure_policy=failure_policy):
                fake = FakeAdmission(bindings={POLICY: _binding()}, policies={POLICY: _policy(failure_policy=failure_policy)})
                self.assertEqual(fake.run(), expected)

    def test_binding_narrowing_fields_do_not_cover(self):
        narrowed = [
            k8s.V1MatchResources(object_selector=k8s.V1LabelSelector(match_labels={"app": "x"})),
            k8s.V1MatchResources(resource_rules=[_rule()]),
            k8s.V1MatchResources(exclude_resource_rules=[_rule("serviceaccounts")]),
        ]
        for match_resources in narrowed:
            with self.subTest(match_resources=match_resources):
                fake = FakeAdmission(bindings={POLICY: _binding(match_resources=match_resources)}, policies={POLICY: _policy()})
                self.assertFalse(fake.run())

    def test_empty_object_selector_covers(self):
        binding = _binding(match_resources=k8s.V1MatchResources(object_selector=k8s.V1LabelSelector()))
        self.assertTrue(FakeAdmission(bindings={POLICY: binding}, policies={POLICY: _policy()}).run())

    def test_policy_exclusions_do_not_cover(self):
        for constraints in (
            k8s.V1MatchResources(resource_rules=[_rule()], exclude_resource_rules=[_rule("secrets")]),
            k8s.V1MatchResources(resource_rules=[_rule()], object_selector=k8s.V1LabelSelector(match_labels={"a": "b"})),
        ):
            with self.subTest(constraints=constraints):
                fake = FakeAdmission(bindings={POLICY: _binding()}, policies={POLICY: _policy(constraints)})
                self.assertFalse(fake.run())

    def test_policy_resource_rules_without_namespace_selector_cover(self):
        policy = _policy(k8s.V1MatchResources(resource_rules=[_rule()]))
        self.assertTrue(FakeAdmission(bindings={POLICY: _binding()}, policies={POLICY: policy}).run())

    def test_error_on_main_binding_is_not_skipped(self):
        fake = FakeAdmission(
            bindings={BOOTSTRAP: _binding(policy_name=BOOTSTRAP)},
            policies={BOOTSTRAP: _policy()},
            errors={POLICY: ApiException(status=500)},
        )
        self.assertFalse(fake.run())

    def test_uses_the_labels_of_the_requested_namespace(self):
        binding = _binding(match_resources=_selector(expressions=[("tier", "In", ["gold"])]))
        fake = FakeAdmission(
            bindings={POLICY: binding},
            policies={POLICY: _policy()},
            namespaces={NAMESPACE: {"kubernetes.io/metadata.name": NAMESPACE}, "team-b": dict(NS_LABELS)},
        )
        self.assertFalse(fake.run())

    def test_namespace_without_labels(self):
        cases = [
            ({"match_labels": {"tier": "gold"}}, False),
            ({"expressions": [("tier", "In", ["gold"])]}, False),
            ({"expressions": [("tier", "NotIn", ["gold"])]}, True),
            ({"expressions": [("tier", "DoesNotExist", None)]}, True),
        ]
        for selector, expected in cases:
            with self.subTest(selector=selector):
                binding = _binding(match_resources=_selector(**selector))
                fake = FakeAdmission(bindings={POLICY: binding}, policies={POLICY: _policy()}, namespaces={NAMESPACE: None})
                self.assertEqual(fake.run(), expected)

    def test_namespace_read_error_denies(self):
        fake = FakeAdmission(
            bindings={POLICY: _binding()}, policies={POLICY: _policy()}, namespace_error=ApiException(status=403)
        )
        self.assertFalse(fake.run())

    def test_binding_without_policy_name(self):
        fake = FakeAdmission(bindings={POLICY: _binding(policy_name="")}, policies={POLICY: _policy()})
        self.assertFalse(fake.run())

    def test_selector_on_another_namespace(self):
        binding = _binding(match_resources=_selector({"kubernetes.io/metadata.name": "team-b"}))
        self.assertFalse(FakeAdmission(bindings={POLICY: binding}, policies={POLICY: _policy()}).run())

    def test_policy_constraints_exclude_the_namespace(self):
        policy = _policy(_selector({"kubernetes.io/metadata.name": "team-b"}))
        self.assertFalse(FakeAdmission(bindings={POLICY: _binding()}, policies={POLICY: policy}).run())

    def test_no_match_resources_covers_everything(self):
        binding = _binding(match_resources=None)
        self.assertTrue(FakeAdmission(bindings={POLICY: binding}, policies={POLICY: _policy()}).run())

    def test_empty_selector_covers_everything(self):
        binding = _binding(match_resources=_selector())
        self.assertTrue(FakeAdmission(bindings={POLICY: binding}, policies={POLICY: _policy()}).run())

    def test_match_expressions(self):
        cases = [
            ([("tier", "In", ["gold", "silver"])], True),
            ([("tier", "In", ["silver"])], False),
            ([("kubernetes.io/metadata.name", "NotIn", [NAMESPACE])], False),
            ([("kubernetes.io/metadata.name", "NotIn", ["team-b"])], True),
            ([("missing", "NotIn", ["x"])], True),
            ([("tier", "Exists", None)], True),
            ([("missing", "Exists", None)], False),
            ([("missing", "DoesNotExist", None)], True),
            ([("tier", "DoesNotExist", None)], False),
            ([("tier", "Gt", ["1"])], False),
        ]
        for expressions, expected in cases:
            with self.subTest(expressions=expressions):
                binding = _binding(match_resources=_selector(expressions=expressions))
                fake = FakeAdmission(bindings={POLICY: binding}, policies={POLICY: _policy()})
                self.assertEqual(fake.run(), expected)

    def test_match_labels_and_expressions_both_apply(self):
        binding = _binding(
            match_resources=_selector({"kubernetes.io/metadata.name": NAMESPACE}, [("tier", "In", ["silver"])])
        )
        self.assertFalse(FakeAdmission(bindings={POLICY: binding}, policies={POLICY: _policy()}).run())

    def test_bootstrap_copy_is_enough(self):
        fake = FakeAdmission(
            bindings={BOOTSTRAP: _binding(policy_name=BOOTSTRAP)},
            policies={BOOTSTRAP: _policy()},
        )
        self.assertTrue(fake.run())

    def test_bootstrap_used_when_main_binding_is_in_audit(self):
        fake = FakeAdmission(
            bindings={POLICY: _binding(actions=("Audit",)), BOOTSTRAP: _binding(policy_name=BOOTSTRAP)},
            policies={POLICY: _policy(), BOOTSTRAP: _policy()},
        )
        self.assertTrue(fake.run())

    def test_admission_api_missing(self):
        self.assertFalse(FakeAdmission(error=ApiException(status=404, reason="Not Found")).run())

    def test_read_errors_deny(self):
        for error in (ApiException(status=403, reason="Forbidden"), ApiException(status=500), RuntimeError("boom")):
            with self.subTest(error=error):
                fake = FakeAdmission(bindings={POLICY: _binding()}, policies={POLICY: _policy()}, error=error)
                self.assertFalse(fake.run())


class FakeInstaller:
    def __init__(self, allowed=None, error=None):
        self.allowed = allowed
        self.error = error
        self.impersonations = []
        self.reviews = []

    @asynccontextmanager
    async def api_client(self, impersonation=None):
        self.impersonations.append(impersonation)
        yield MagicMock()

    def authorization_api(self, api):
        fake = self

        async def review(body):
            attrs = body.spec.resource_attributes
            fake.reviews.append((attrs.namespace, attrs.group, attrs.resource, attrs.verb))
            if fake.error is not None:
                raise fake.error
            return SimpleNamespace(status=SimpleNamespace(allowed=fake.allowed))

        return SimpleNamespace(create_self_subject_access_review=review)

    def run(self):
        with patch(f"{MODULE}.get_impersonating_api_client", self.api_client), patch(
            "src.ark_api.marketplace_install.gate.client.AuthorizationV1Api", self.authorization_api
        ):
            return asyncio.run(capability.installer_enabled(NAMESPACE))


class TestInstallerEnabled(unittest.TestCase):
    def test_installer_can_create_jobs(self):
        fake = FakeInstaller(allowed=True)
        self.assertTrue(fake.run())
        self.assertEqual(fake.reviews, [(NAMESPACE, "batch", "jobs", "create")])

    def test_impersonates_the_installer_without_groups(self):
        fake = FakeInstaller(allowed=True)
        fake.run()
        (impersonation,) = fake.impersonations
        self.assertEqual(impersonation.username, "system:serviceaccount:team-a:ark-marketplace-installer")
        self.assertEqual(impersonation.groups, [])

    def test_installer_cannot_create_jobs(self):
        self.assertFalse(FakeInstaller(allowed=False).run())

    def test_impersonation_forbidden(self):
        self.assertFalse(FakeInstaller(error=ApiException(status=403, reason="Forbidden")).run())

    def test_other_errors_deny_and_are_logged(self):
        for error in (ApiException(status=500), ApiException(status=404), RuntimeError("boom")):
            with self.subTest(error=error):
                with self.assertLogs(MODULE, level="WARNING"):
                    self.assertFalse(FakeInstaller(error=error).run())

    def test_forbidden_is_not_logged_as_warning(self):
        with self.assertNoLogs(MODULE, level="WARNING"):
            self.assertFalse(FakeInstaller(error=ApiException(status=403)).run())


if __name__ == "__main__":
    unittest.main()
