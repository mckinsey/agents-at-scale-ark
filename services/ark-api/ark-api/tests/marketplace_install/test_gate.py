import asyncio
import os
import unittest
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.impersonation import ImpersonationConfig

from src.ark_api.marketplace_install import gate
from src.ark_api.models.auth import UserIdentity

MODULE = "src.ark_api.marketplace_install.gate"
NAMESPACE = "team-a"
USER = ImpersonationConfig(username="alice@example.com", groups=["devs"])
INSTALLER = "system:serviceaccount:team-a:ark-marketplace-installer"

SSO_WITH_IMPERSONATION = {"AUTH_MODE": "sso", "IMPERSONATION_ENABLED": "true"}


def _request(api_key=None, identity=UserIdentity(username="alice@example.com", groups=["devs"])):
    state = SimpleNamespace()
    if api_key is not None:
        state.api_key = api_key
    if identity is not None:
        state.user_identity = identity
    return SimpleNamespace(state=state)


class FakeCluster:
    def __init__(self, allowed=(), raises=None, status_missing=False):
        self.allowed = set(allowed)
        self.raises = raises
        self.status_missing = status_missing
        self.impersonations = []
        self.reviews = []

    @asynccontextmanager
    async def api_client(self, impersonation=None):
        self.impersonations.append(impersonation)
        yield MagicMock()

    def authorization_api(self, api):
        cluster = self

        class _Authz:
            async def create_self_subject_access_review(self, body):
                attrs = body.spec.resource_attributes
                key = (attrs.group, attrs.resource, attrs.verb, attrs.subresource)
                cluster.reviews.append((attrs.namespace, key))
                if cluster.raises is not None:
                    raise cluster.raises
                if cluster.status_missing:
                    return SimpleNamespace(status=None)
                return SimpleNamespace(status=SimpleNamespace(allowed=key in cluster.allowed))

        return _Authz()

    def patches(self):
        return (
            patch(f"{MODULE}.get_impersonating_api_client", self.api_client),
            patch(f"{MODULE}.client.AuthorizationV1Api", self.authorization_api),
        )


CREATE_INSTALLS = ("ark.mckinsey.com", "marketplaceinstalls", "create", None)
LIST_JOBS = ("batch", "jobs", "list", None)
POD_LOGS = ("", "pods", "get", "log")


def _run(cluster, coro_fn, *args):
    first, second = cluster.patches()
    with first, second:
        return asyncio.run(coro_fn(*args))


class TestIdentityDenial(unittest.TestCase):
    def _denial(self, env, request):
        with patch.dict(os.environ, env, clear=True):
            return gate.identity_denial(request)

    def test_open_mode_has_no_gate(self):
        self.assertIsNone(self._denial({"AUTH_MODE": "open"}, _request(identity=None)))

    def test_empty_auth_mode_counts_as_open(self):
        self.assertIsNone(self._denial({}, _request(identity=None)))

    def test_auth_mode_is_case_insensitive(self):
        self.assertIsNone(self._denial({"AUTH_MODE": "OPEN"}, _request(identity=None)))

    def test_api_key_is_not_supported(self):
        for mode in ("basic", "hybrid"):
            env = {"AUTH_MODE": mode, "IMPERSONATION_ENABLED": "true"}
            self.assertEqual(self._denial(env, _request(api_key={"id": "k"}, identity=None)), "api-key-not-supported")

    def test_api_key_wins_over_disabled_impersonation(self):
        self.assertEqual(
            self._denial({"AUTH_MODE": "basic"}, _request(api_key={"id": "k"}, identity=None)),
            "api-key-not-supported",
        )

    def test_impersonation_disabled(self):
        self.assertEqual(self._denial({"AUTH_MODE": "sso"}, _request()), "impersonation-disabled")

    def test_missing_identity_is_not_permitted(self):
        self.assertEqual(self._denial(SSO_WITH_IMPERSONATION, _request(identity=None)), "not-permitted")

    def test_blank_username_is_not_permitted(self):
        request = _request(identity=UserIdentity(username="  ", groups=[]))
        self.assertEqual(self._denial(SSO_WITH_IMPERSONATION, request), "not-permitted")

    def test_signed_in_user_passes(self):
        self.assertIsNone(self._denial(SSO_WITH_IMPERSONATION, _request()))


class TestAccessReviews(unittest.TestCase):
    def test_can_install_reviews_create_marketplaceinstalls(self):
        cluster = FakeCluster(allowed={CREATE_INSTALLS})
        self.assertTrue(_run(cluster, gate.can_install, USER, NAMESPACE))
        self.assertEqual(cluster.reviews, [(NAMESPACE, CREATE_INSTALLS)])

    def test_can_install_denied(self):
        cluster = FakeCluster(allowed={LIST_JOBS})
        self.assertFalse(_run(cluster, gate.can_install, USER, NAMESPACE))

    def test_can_read_with_list_jobs_only(self):
        self.assertTrue(_run(FakeCluster(allowed={LIST_JOBS}), gate.can_read, USER, NAMESPACE))

    def test_can_read_with_create_installs_only(self):
        self.assertTrue(_run(FakeCluster(allowed={CREATE_INSTALLS}), gate.can_read, USER, NAMESPACE))

    def test_can_read_denied_without_either(self):
        self.assertFalse(_run(FakeCluster(allowed={POD_LOGS}), gate.can_read, USER, NAMESPACE))

    def test_logs_need_read_and_pod_logs(self):
        self.assertTrue(_run(FakeCluster(allowed={LIST_JOBS, POD_LOGS}), gate.can_read_logs, USER, NAMESPACE))
        self.assertFalse(_run(FakeCluster(allowed={LIST_JOBS}), gate.can_read_logs, USER, NAMESPACE))
        self.assertFalse(_run(FakeCluster(allowed={POD_LOGS}), gate.can_read_logs, USER, NAMESPACE))

    def test_review_errors_deny(self):
        for check in (gate.can_install, gate.can_read, gate.can_read_logs):
            for error in (ApiException(status=500, reason="boom"), RuntimeError("boom")):
                with self.subTest(check=check.__name__, error=type(error).__name__):
                    cluster = FakeCluster(allowed={CREATE_INSTALLS, LIST_JOBS, POD_LOGS}, raises=error)
                    self.assertFalse(_run(cluster, check, USER, NAMESPACE))

    def test_client_errors_deny(self):
        @asynccontextmanager
        async def broken_client(impersonation=None):
            raise RuntimeError("no kubeconfig")
            yield

        with patch(f"{MODULE}.get_impersonating_api_client", broken_client):
            self.assertFalse(asyncio.run(gate.can_install(USER, NAMESPACE)))

    def test_missing_status_denies(self):
        cluster = FakeCluster(allowed={CREATE_INSTALLS}, status_missing=True)
        self.assertFalse(_run(cluster, gate.can_install, USER, NAMESPACE))

    def test_non_boolean_allowed_denies(self):
        cluster = FakeCluster()
        cluster.authorization_api = lambda api: SimpleNamespace(
            create_self_subject_access_review=_async_return(SimpleNamespace(status=SimpleNamespace(allowed="true")))
        )
        self.assertFalse(_run(cluster, gate.can_install, USER, NAMESPACE))

    def test_without_impersonation_no_review_runs(self):
        cluster = FakeCluster(allowed={CREATE_INSTALLS})
        self.assertFalse(_run(cluster, gate.can_install, None, NAMESPACE))
        self.assertEqual(cluster.impersonations, [])

    def test_reviews_run_as_the_user_never_as_the_installer(self):
        cluster = FakeCluster(allowed={CREATE_INSTALLS, LIST_JOBS, POD_LOGS})
        for check in (gate.can_install, gate.can_read, gate.can_read_logs):
            _run(cluster, check, USER, NAMESPACE)
        self.assertTrue(cluster.impersonations)
        for impersonation in cluster.impersonations:
            self.assertIs(impersonation, USER)
            self.assertNotEqual(impersonation.username, INSTALLER)


def _async_return(value):
    async def _call(*args, **kwargs):
        return value

    return _call


class TestRequire(unittest.TestCase):
    def _require(self, fn, env, request, cluster):
        with patch.dict(os.environ, env, clear=True):
            return _run(cluster, fn, request, USER, NAMESPACE)

    def test_open_mode_skips_reviews(self):
        cluster = FakeCluster()
        for fn in (gate.require_install, gate.require_read):
            self.assertIsNone(self._require(fn, {}, _request(identity=None), cluster))
        self.assertEqual(cluster.reviews, [])

    def test_identity_denial_is_raised_with_its_code(self):
        cases = [
            ({"AUTH_MODE": "hybrid", "IMPERSONATION_ENABLED": "true"}, _request(api_key={"id": "k"}), "api-key-not-supported"),
            ({"AUTH_MODE": "sso"}, _request(), "impersonation-disabled"),
            (SSO_WITH_IMPERSONATION, _request(identity=None), "not-permitted"),
        ]
        for env, request, code in cases:
            with self.subTest(code=code):
                cluster = FakeCluster(allowed={CREATE_INSTALLS})
                with self.assertRaises(HTTPException) as ctx:
                    self._require(gate.require_install, env, request, cluster)
                self.assertEqual(ctx.exception.status_code, 403)
                self.assertEqual(ctx.exception.detail["code"], code)
                self.assertEqual(cluster.reviews, [])

    def test_require_install_denied(self):
        with self.assertRaises(HTTPException) as ctx:
            self._require(gate.require_install, SSO_WITH_IMPERSONATION, _request(), FakeCluster(allowed={LIST_JOBS}))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(
            ctx.exception.detail,
            {"code": "not-permitted", "message": gate.INSTALL_DENIED},
        )

    def test_require_install_allowed(self):
        cluster = FakeCluster(allowed={CREATE_INSTALLS})
        self.assertIsNone(self._require(gate.require_install, SSO_WITH_IMPERSONATION, _request(), cluster))

    def test_require_read_allowed_with_list_jobs(self):
        cluster = FakeCluster(allowed={LIST_JOBS})
        self.assertIsNone(self._require(gate.require_read, SSO_WITH_IMPERSONATION, _request(), cluster))

    def test_require_read_denied(self):
        with self.assertRaises(HTTPException) as ctx:
            self._require(gate.require_read, SSO_WITH_IMPERSONATION, _request(), FakeCluster())
        self.assertEqual(ctx.exception.detail["message"], gate.READ_DENIED)

    def test_require_fails_closed_on_review_error(self):
        cluster = FakeCluster(allowed={CREATE_INSTALLS}, raises=ApiException(status=500))
        with self.assertRaises(HTTPException):
            self._require(gate.require_install, SSO_WITH_IMPERSONATION, _request(), cluster)


class TestLogsVisible(unittest.TestCase):
    def _visible(self, env, request, cluster):
        with patch.dict(os.environ, env, clear=True):
            return _run(cluster, gate.logs_visible, request, USER, NAMESPACE)

    def test_open_mode_shows_logs(self):
        self.assertTrue(self._visible({}, _request(identity=None), FakeCluster()))

    def test_identity_denial_hides_logs(self):
        cluster = FakeCluster(allowed={LIST_JOBS, POD_LOGS})
        self.assertFalse(self._visible({"AUTH_MODE": "sso"}, _request(), cluster))
        self.assertEqual(cluster.reviews, [])

    def test_logs_follow_reviews(self):
        self.assertTrue(self._visible(SSO_WITH_IMPERSONATION, _request(), FakeCluster(allowed={LIST_JOBS, POD_LOGS})))
        self.assertFalse(self._visible(SSO_WITH_IMPERSONATION, _request(), FakeCluster(allowed={LIST_JOBS})))


if __name__ == "__main__":
    unittest.main()
