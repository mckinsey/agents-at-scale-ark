"""Regression tests: the secrets API must never echo raw Secret annotations."""
import base64
import json
import os
import unittest
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

os.environ["AUTH_MODE"] = "open"

from fastapi.testclient import TestClient
from kubernetes_asyncio.client.rest import ApiException
from ark_sdk.k8s import ALIAS_ANNOTATION, DESCRIPTION_ANNOTATION
from ark_sdk.labels import ARK_TAG_LABEL_PREFIX
from ark_sdk.secret_scope import SecretScope, SecretScopeChangeError, SecretScopeError
from ark_api.api.v1.secrets import router as secrets_router
from ark_api.auth.secret_scope import get_secret_scope
from ark_api.models.auth import UserIdentity

_LEAKED_PASSWORD = "sup3rs3cret"
_LEAKED_TOKEN_B64 = base64.b64encode(b"sk-FAKE-token").decode()

# Simulates what an unfiltered ark-sdk client would hand back for a secret that
# has passed through `kubectl apply` - the whole manifest, values included, is
# copied into an annotation. Used to prove the response model itself refuses
# to let this through even if the client it wraps regresses.
LEAKING_ANNOTATIONS = {
    "kubectl.kubernetes.io/last-applied-configuration": json.dumps({
        "apiVersion": "v1",
        "kind": "Secret",
        "metadata": {"name": "test-secret"},
        "stringData": {"password": _LEAKED_PASSWORD},
        "data": {"token": _LEAKED_TOKEN_B64},
        "type": "Opaque",
    }),
    "meta.helm.sh/release-name": "my-release",
    "ark.mckinsey.com/dashboard-icon": "icons/gemini.png",
}


def _assert_response_has_no_leak(test_case, response):
    test_case.assertEqual(response.status_code, 200)
    body = response.text
    test_case.assertNotIn(_LEAKED_PASSWORD, body)
    test_case.assertNotIn(_LEAKED_TOKEN_B64, body)
    test_case.assertNotIn("kubectl.kubernetes.io/last-applied-configuration", body)
    test_case.assertNotIn("meta.helm.sh/release-name", body)
    data = response.json()
    test_case.assertEqual(data.get("annotations"), {"ark.mckinsey.com/dashboard-icon": "icons/gemini.png"})


class TestSecretsAnnotationLeak(unittest.TestCase):
    """Even a SecretClient that returns unfiltered annotations must not leak them."""

    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.secrets.SecretClient')
    def test_list_secrets_drops_non_ark_annotations(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.list_secrets = AsyncMock(return_value={
            "items": [{
                "name": "test-secret",
                "display_name": "test-secret",
                "scope": "shared",
                "id": "uuid-12345",
                "annotations": LEAKING_ANNOTATIONS,
            }],
            "count": 1,
        })

        response = self.client.get("/v1/secrets")

        self.assertEqual(response.status_code, 200)
        body = response.text
        self.assertNotIn(_LEAKED_PASSWORD, body)
        self.assertNotIn(_LEAKED_TOKEN_B64, body)
        self.assertNotIn("kubectl.kubernetes.io/last-applied-configuration", body)
        self.assertNotIn("meta.helm.sh/release-name", body)
        item = response.json()["items"][0]
        self.assertEqual(item["annotations"], {"ark.mckinsey.com/dashboard-icon": "icons/gemini.png"})

    @patch('ark_api.api.v1.secrets.SecretClient')
    def test_get_secret_drops_non_ark_annotations(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.get_secret = AsyncMock(return_value={
            "name": "test-secret",
            "display_name": "test-secret",
            "scope": "shared",
            "id": "uuid-12345",
            "type": "Opaque",
            "secret_length": 20,
            "keys": ["password"],
            "annotations": LEAKING_ANNOTATIONS,
        })

        response = self.client.get("/v1/secrets/test-secret")

        _assert_response_has_no_leak(self, response)
        self.assertEqual(response.json()["keys"], ["password"])

    @patch('ark_api.api.v1.secrets.SecretClient')
    def test_create_secret_drops_non_ark_annotations(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.create_secret = AsyncMock(return_value={
            "name": "test-secret",
            "display_name": "test-secret",
            "scope": "shared",
            "id": "uuid-12345",
            "type": "Opaque",
            "secret_length": 10,
            "annotations": LEAKING_ANNOTATIONS,
        })

        response = self.client.post(
            "/v1/secrets",
            json={"name": "test-secret", "string_data": {"token": "test-token"}},
        )

        _assert_response_has_no_leak(self, response)

    @patch('ark_api.api.v1.secrets.SecretClient')
    def test_update_secret_drops_non_ark_annotations(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.update_secret = AsyncMock(return_value={
            "name": "test-secret",
            "display_name": "test-secret",
            "scope": "shared",
            "id": "uuid-12345",
            "type": "Opaque",
            "secret_length": 9,
            "annotations": LEAKING_ANNOTATIONS,
        })

        response = self.client.put(
            "/v1/secrets/test-secret",
            json={"string_data": {"token": "new-token"}},
        )

        _assert_response_has_no_leak(self, response)



class TestSecretsScope(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)

    @patch('ark_api.api.v1.secrets.SecretClient')
    def test_create_rejects_reserved_user_prefix(self, mock_client_cls):
        mock_client = mock_client_cls.return_value
        mock_client.create_secret = AsyncMock()

        response = self.client.post(
            "/v1/secrets",
            json={"name": "u-0123456789abcdef-x", "string_data": {"token": "test-token"}},
        )

        self.assertEqual(response.status_code, 422)
        mock_client.create_secret.assert_not_awaited()

    @patch('ark_api.api.v1.secrets.SecretClient')
    def test_every_route_passes_the_shared_scope(self, mock_client_cls):
        detail = {"name": "s", "id": "uuid", "type": "Opaque", "secret_length": 1, "display_name": "s", "scope": "shared"}
        mock_client = mock_client_cls.return_value
        mock_client.list_secrets = AsyncMock(return_value={"items": [], "count": 0})
        mock_client.create_secret = AsyncMock(return_value=detail)
        mock_client.get_secret = AsyncMock(return_value=detail)
        mock_client.update_secret = AsyncMock(return_value=detail)
        mock_client.delete_secret = AsyncMock(return_value=True)

        requests = [
            lambda: self.client.get("/v1/secrets"),
            lambda: self.client.post("/v1/secrets", json={"name": "s", "string_data": {"token": "t"}}),
            lambda: self.client.get("/v1/secrets/s"),
            lambda: self.client.put("/v1/secrets/s", json={"string_data": {"token": "t"}}),
            lambda: self.client.delete("/v1/secrets/s"),
        ]
        for send in requests:
            mock_client_cls.reset_mock()
            self.assertEqual(send().status_code, 200)
            self.assertEqual(mock_client_cls.call_args.kwargs["scope"], SecretScope())

    def test_every_route_declares_the_scope_dependency(self):
        for route in secrets_router.routes:
            with self.subTest(route=route.path, methods=route.methods):
                self.assertIn(get_secret_scope, [dep.call for dep in route.dependant.dependencies])


@patch('ark_sdk.k8s.ApiClient')
@patch('ark_sdk.k8s.init_k8s', new=AsyncMock())
class TestSecretsOutOfScope(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.client = TestClient(app)
        v1_patcher = patch('ark_sdk.k8s.client.CoreV1Api')
        self.v1 = v1_patcher.start().return_value
        self.addCleanup(v1_patcher.stop)
        self.v1.replace_namespaced_secret = AsyncMock()
        self.v1.delete_namespaced_secret = AsyncMock()

    def _send_all(self):
        return [
            self.client.get("/v1/secrets/legacy-token?namespace=default"),
            self.client.put("/v1/secrets/legacy-token?namespace=default", json={"string_data": {"token": "t"}}),
            self.client.delete("/v1/secrets/legacy-token?namespace=default"),
        ]

    def test_out_of_scope_secret_looks_like_a_missing_one(self, _):
        self.v1.read_namespaced_secret = AsyncMock(side_effect=ApiException(status=404, reason="Not Found"))
        missing = self._send_all()

        unlabelled = Mock()
        unlabelled.metadata.labels = {"app": "legacy"}
        self.v1.read_namespaced_secret = AsyncMock(return_value=unlabelled)
        out_of_scope = self._send_all()

        for missing_response, out_of_scope_response in zip(missing, out_of_scope):
            self.assertEqual(out_of_scope_response.status_code, 404)
            self.assertEqual(out_of_scope_response.json(), missing_response.json())
        self.assertEqual(
            out_of_scope[0].json(), {"detail": "Secret 'legacy-token' not found in namespace default"}
        )
        self.v1.replace_namespaced_secret.assert_not_called()
        self.v1.delete_namespaced_secret.assert_not_called()


def _request_with(identity):
    return SimpleNamespace(state=SimpleNamespace(user_identity=identity) if identity is not None else SimpleNamespace())


class TestGetSecretScope(unittest.TestCase):
    def test_without_identity_is_shared_only(self):
        self.assertEqual(get_secret_scope(_request_with(None)), SecretScope())

    def test_identity_adds_the_personal_scope(self):
        scope = get_secret_scope(_request_with(UserIdentity(username="alice@example.com")))
        self.assertEqual(scope, SecretScope.for_user("alice@example.com"))

    @patch.dict(os.environ, {"IMPERSONATION_PREFIX": "oidc:"})
    def test_impersonation_prefix_is_not_part_of_the_owner(self):
        scope = get_secret_scope(_request_with(UserIdentity(username="oidc:alice@example.com")))
        self.assertEqual(scope, SecretScope.for_user("alice@example.com"))

    @patch.dict(os.environ, {"IMPERSONATION_PREFIX": "oidc:"})
    def test_prefix_is_only_removed_at_the_start(self):
        scope = get_secret_scope(_request_with(UserIdentity(username="oidc:oidc:alice")))
        self.assertEqual(scope, SecretScope.for_user("oidc:alice"))

    @patch.dict(os.environ, {"IMPERSONATION_PREFIX": "oidc:"})
    def test_prefix_alone_is_no_identity(self):
        self.assertEqual(get_secret_scope(_request_with(UserIdentity(username="oidc:"))), SecretScope())

    def test_username_is_not_case_folded(self):
        upper = get_secret_scope(_request_with(UserIdentity(username="Alice@example.com")))
        lower = get_secret_scope(_request_with(UserIdentity(username="alice@example.com")))
        self.assertNotEqual(upper, lower)

    def test_username_is_not_trimmed(self):
        padded = get_secret_scope(_request_with(UserIdentity(username=" alice@example.com")))
        self.assertEqual(padded, SecretScope.for_user(" alice@example.com"))
        self.assertNotEqual(padded, SecretScope.for_user("alice@example.com"))

    @patch.dict(os.environ, {"IMPERSONATION_PREFIX": "oidc:"})
    def test_prefix_followed_by_blanks_is_no_identity(self):
        self.assertEqual(get_secret_scope(_request_with(UserIdentity(username="oidc:   "))), SecretScope())

    def test_blank_or_non_string_username_is_no_identity(self):
        for username in ["", "   ", None, 42]:
            with self.subTest(username=username):
                self.assertEqual(get_secret_scope(_request_with(UserIdentity(username=username))), SecretScope())


_DETAIL = {"name": "s", "id": "uuid", "type": "Opaque", "secret_length": 1, "display_name": "s", "scope": "shared"}


class TestPersonalSecretRoutes(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.app = app
        self.client = TestClient(app)
        patcher = patch('ark_api.api.v1.secrets.SecretClient')
        self.client_cls = patcher.start()
        self.addCleanup(patcher.stop)
        self.sdk = self.client_cls.return_value
        self.sdk.list_secrets = AsyncMock(return_value={"items": [], "count": 0})
        self.sdk.create_secret = AsyncMock(return_value=_DETAIL)
        self.sdk.update_secret = AsyncMock(return_value=_DETAIL)
        self.addCleanup(self.app.dependency_overrides.pop, get_secret_scope, None)

    def _as(self, scope):
        self.app.dependency_overrides[get_secret_scope] = lambda: scope

    def test_list_scope_selects_the_client_scope(self):
        alice = SecretScope.for_user("alice@example.com")
        self._as(alice)
        cases = [
            ("/v1/secrets", SecretScope()),
            ("/v1/secrets?scope=shared", SecretScope()),
            ("/v1/secrets?scope=all", alice),
            ("/v1/secrets?scope=personal", alice.personal_only()),
        ]
        for url, expected in cases:
            with self.subTest(url=url):
                self.client_cls.reset_mock()
                self.assertEqual(self.client.get(url).status_code, 200)
                self.assertEqual(self.client_cls.call_args.kwargs["scope"], expected)

    def test_repeated_scope_parameter_uses_the_last_one(self):
        alice = SecretScope.for_user("alice@example.com")
        self._as(alice)
        for url, expected in [
            ("/v1/secrets?scope=all&scope=shared", SecretScope()),
            ("/v1/secrets?scope=shared&scope=personal", alice.personal_only()),
        ]:
            with self.subTest(url=url):
                self.client_cls.reset_mock()
                self.assertEqual(self.client.get(url).status_code, 200)
                self.assertEqual(self.client_cls.call_args.kwargs["scope"], expected)

    def test_list_without_identity(self):
        self._as(SecretScope())
        self.assertEqual(self.client.get("/v1/secrets?scope=all").status_code, 200)
        self.assertEqual(self.client_cls.call_args.kwargs["scope"], SecretScope())

        self.client_cls.reset_mock()
        response = self.client.get("/v1/secrets?scope=personal")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"items": [], "count": 0})
        self.client_cls.assert_not_called()

    def test_list_rejects_unknown_scope(self):
        self.assertEqual(self.client.get("/v1/secrets?scope=user-0123456789abcdef").status_code, 422)
        self.client_cls.assert_not_called()

    def test_create_personal_without_identity_is_forbidden(self):
        self._as(SecretScope())
        response = self.client.post(
            "/v1/secrets", json={"name": "s", "string_data": {"token": "t"}, "scope": "personal"}
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"detail": "Personal secrets require an authenticated user identity"})
        self.sdk.create_secret.assert_not_awaited()

    def test_create_passes_the_requested_scope(self):
        alice = SecretScope.for_user("alice@example.com")
        self._as(alice)
        for body_scope, personal in [(None, False), ("shared", False), ("personal", True)]:
            with self.subTest(scope=body_scope):
                self.client_cls.reset_mock()
                body = {"name": "s", "string_data": {"token": "t"}}
                if body_scope:
                    body["scope"] = body_scope
                self.assertEqual(self.client.post("/v1/secrets", json=body).status_code, 200)
                self.assertEqual(self.client_cls.call_args.kwargs["scope"], alice)
                self.assertIs(self.sdk.create_secret.call_args.kwargs["personal"], personal)

    def test_create_rejects_invalid_bodies_before_the_client(self):
        self._as(SecretScope.for_user("alice@example.com"))
        bodies = [
            {"name": "s", "string_data": {"token": "t"}, "scope": None},
            {"name": "s", "string_data": {"token": "t"}, "scope": "all"},
            {"name": "u-0123456789abcdef-x", "string_data": {"token": "t"}, "scope": "personal"},
            {"name": "a" * 235, "string_data": {"token": "t"}, "scope": "personal"},
        ]
        for body in bodies:
            with self.subTest(body=body):
                self.assertEqual(self.client.post("/v1/secrets", json=body).status_code, 422)
        self.sdk.create_secret.assert_not_awaited()

    def test_create_shared_without_identity_still_works(self):
        self._as(SecretScope())
        response = self.client.post("/v1/secrets", json={"name": "s", "string_data": {"token": "t"}})
        self.assertEqual(response.status_code, 200)
        self.assertIs(self.sdk.create_secret.call_args.kwargs["personal"], False)

    def test_update_passes_the_requested_scope(self):
        for body, expected in [
            ({}, None), ({"scope": None}, None), ({"scope": "shared"}, "shared"), ({"scope": "personal"}, "personal"),
        ]:
            with self.subTest(body=body):
                self.assertEqual(self.client.put("/v1/secrets/s", json=body).status_code, 200)
                self.assertEqual(self.sdk.update_secret.call_args.kwargs["scope"], expected)

    def test_update_scope_change_refused_is_422(self):
        self.sdk.update_secret = AsyncMock(side_effect=SecretScopeChangeError("A shared secret cannot be made personal"))
        response = self.client.put("/v1/secrets/s", json={"scope": "personal"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json(), {"detail": "A shared secret cannot be made personal"})

    def test_malformed_scope_is_not_exposed_as_a_client_error(self):
        self.sdk.update_secret = AsyncMock(side_effect=SecretScopeError("Invalid scope values: 'x'"))
        response = self.client.put("/v1/secrets/s", json={"scope": "shared"})
        self.assertEqual(response.status_code, 500)
        self.assertNotIn("Invalid scope", response.text)


ALICE_HASH = SecretScope.for_user("alice@example.com").personal_scope()[len("user-"):]


def _secret(name, scope_label, uid="uid-1"):
    secret = Mock()
    secret.metadata.name = name
    secret.metadata.uid = uid
    secret.metadata.resource_version = "1"
    secret.metadata.labels = {"ark.mckinsey.com/resource-type": "secret", "ark.mckinsey.com/scope": scope_label}
    secret.metadata.annotations = {}
    secret.type = "Opaque"
    secret.data = {"token": "dA=="}
    return secret


@patch('ark_sdk.k8s.ApiClient')
@patch('ark_sdk.k8s.init_k8s', new=AsyncMock())
class TestPersonalSecretsThroughTheSdk(unittest.TestCase):
    def setUp(self):
        from ark_api.main import app
        self.app = app
        self.client = TestClient(app)
        v1_patcher = patch('ark_sdk.k8s.client.CoreV1Api')
        self.v1 = v1_patcher.start().return_value
        self.addCleanup(v1_patcher.stop)
        self.app.dependency_overrides[get_secret_scope] = lambda: SecretScope.for_user("alice@example.com")
        self.addCleanup(self.app.dependency_overrides.pop, get_secret_scope, None)

    def test_create_personal_stores_the_owner_hash(self, _):
        self.v1.create_namespaced_secret = AsyncMock(side_effect=lambda namespace, body: _secret(
            body.metadata.name, body.metadata.labels["ark.mckinsey.com/scope"]
        ))
        response = self.client.post(
            "/v1/secrets?namespace=default",
            json={"name": "github", "string_data": {"token": "t"}, "scope": "personal"},
        )
        self.assertEqual(response.status_code, 200)
        body = self.v1.create_namespaced_secret.call_args.kwargs["body"]
        self.assertEqual(body.metadata.name, f"u-{ALICE_HASH}-github")
        self.assertEqual(body.metadata.labels["ark.mckinsey.com/scope"], f"user-{ALICE_HASH}")
        self.assertEqual(response.json()["name"], f"u-{ALICE_HASH}-github")
        self.assertEqual(response.json()["display_name"], "github")
        self.assertEqual(response.json()["scope"], "personal")

    def test_list_all_selects_shared_and_mine(self, _):
        self.v1.list_namespaced_secret = AsyncMock(return_value=Mock(items=[
            _secret("openai", "shared", uid="a"), _secret(f"u-{ALICE_HASH}-github", f"user-{ALICE_HASH}", uid="b"),
        ]))
        response = self.client.get("/v1/secrets?namespace=default&scope=all")
        self.assertEqual(response.status_code, 200)
        selector = self.v1.list_namespaced_secret.call_args.kwargs["label_selector"]
        self.assertIn(f"ark.mckinsey.com/scope in (shared,user-{ALICE_HASH})", selector)
        self.assertEqual(
            [(item["display_name"], item["scope"]) for item in response.json()["items"]],
            [("openai", "shared"), ("github", "personal")],
        )

    def test_promote_flips_the_label_and_keeps_the_name(self, _):
        name = f"u-{ALICE_HASH}-github"
        self.v1.read_namespaced_secret = AsyncMock(return_value=_secret(name, f"user-{ALICE_HASH}"))
        self.v1.replace_namespaced_secret = AsyncMock(side_effect=lambda name, namespace, body: body)
        response = self.client.put(f"/v1/secrets/{name}?namespace=default", json={"scope": "shared"})
        self.assertEqual(response.status_code, 200)
        replaced = self.v1.replace_namespaced_secret.call_args.kwargs
        self.assertEqual(replaced["name"], name)
        self.assertEqual(replaced["body"].metadata.labels["ark.mckinsey.com/scope"], "shared")
        self.assertEqual(response.json()["scope"], "shared")

    def test_promote_replaces_description_alias_and_tags_like_any_put(self, _):
        name = f"u-{ALICE_HASH}-github"
        secret = _secret(name, f"user-{ALICE_HASH}")
        secret.metadata.labels[f"{ARK_TAG_LABEL_PREFIX}prod"] = "true"
        secret.metadata.annotations = {DESCRIPTION_ANNOTATION: "GitHub token", ALIAS_ANNOTATION: "gh"}
        self.v1.replace_namespaced_secret = AsyncMock(side_effect=lambda name, namespace, body: body)

        self.v1.read_namespaced_secret = AsyncMock(return_value=deepcopy(secret))
        kept = self.client.put(
            f"/v1/secrets/{name}?namespace=default",
            json={"scope": "shared", "description": "GitHub token", "alias": "gh", "labels": ["prod"]},
        ).json()
        self.assertEqual(
            (kept["scope"], kept["description"], kept["alias"], kept["labels"]),
            ("shared", "GitHub token", "gh", ["prod"]),
        )

        self.v1.read_namespaced_secret = AsyncMock(return_value=deepcopy(secret))
        cleared = self.client.put(f"/v1/secrets/{name}?namespace=default", json={"scope": "shared"}).json()
        self.assertEqual(
            (cleared["scope"], cleared["description"], cleared["alias"], cleared["labels"]),
            ("shared", None, None, []),
        )

    def test_demote_is_422_and_writes_nothing(self, _):
        self.v1.read_namespaced_secret = AsyncMock(return_value=_secret("openai", "shared"))
        self.v1.replace_namespaced_secret = AsyncMock()
        response = self.client.put("/v1/secrets/openai?namespace=default", json={"scope": "personal"})
        self.assertEqual(response.status_code, 422)
        self.v1.replace_namespaced_secret.assert_not_called()

    def test_someone_elses_personal_secret_looks_missing(self, _):
        bob_scope = SecretScope.for_user("bob@example.com").personal_scope()
        name = f"u-{bob_scope[len('user-'):]}-github"
        self.v1.read_namespaced_secret = AsyncMock(return_value=_secret(name, bob_scope))
        self.v1.replace_namespaced_secret = AsyncMock()
        self.v1.delete_namespaced_secret = AsyncMock()
        responses = [
            self.client.get(f"/v1/secrets/{name}?namespace=default"),
            self.client.put(f"/v1/secrets/{name}?namespace=default", json={"scope": "shared"}),
            self.client.delete(f"/v1/secrets/{name}?namespace=default"),
        ]
        for response in responses:
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json(), {"detail": f"Secret '{name}' not found in namespace default"})
        self.v1.replace_namespaced_secret.assert_not_called()
        self.v1.delete_namespaced_secret.assert_not_called()


if __name__ == '__main__':
    unittest.main()
