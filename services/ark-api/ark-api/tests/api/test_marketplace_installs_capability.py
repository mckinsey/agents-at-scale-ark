import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from src.ark_api.api.v1.marketplace_installs import router
from src.ark_api.marketplace_install.constants import installer_username
from src.ark_api.models.auth import UserIdentity

app = FastAPI()


@app.middleware("http")
async def _fake_auth(request: Request, call_next):
    user = request.headers.get("x-test-user")
    if user is not None:
        request.state.user_identity = UserIdentity(username=user, groups=["devs"])
    if request.headers.get("x-test-api-key") is not None:
        request.state.api_key = {"id": "key"}
    return await call_next(request)


app.include_router(router, prefix="/v1")
client = TestClient(app)

URL = "/v1/namespaces/team-a/marketplace-installs/capability"
CAPABILITY = "src.ark_api.marketplace_install.capability"
GATE = "src.ark_api.marketplace_install.gate"
SSO = {"AUTH_MODE": "sso", "IMPERSONATION_ENABLED": "true"}
ALICE = {"x-test-user": "alice@example.com"}


def _get(env, headers=None, installer=True, policy=True, user_can_install=True, url=URL, mocks=None):
    can_install = AsyncMock(return_value=user_can_install)
    installer_enabled = AsyncMock(return_value=installer)
    policy_in_place = AsyncMock(return_value=policy)
    with patch.dict(os.environ, env, clear=True), patch(
        f"{CAPABILITY}.installer_enabled", installer_enabled
    ), patch(f"{CAPABILITY}.policy_in_place", policy_in_place), patch(
        f"{GATE}.can_install", can_install
    ):
        response = client.get(url, headers=headers or {})
    if mocks is not None:
        mocks.update(installer_enabled=installer_enabled, policy_in_place=policy_in_place)
    return response, can_install


class TestCapability(unittest.TestCase):
    def assertReason(self, response, reason):
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"enabled": reason is None, "reason": reason})

    def test_enabled(self):
        mocks = {}
        response, can_install = _get(SSO, ALICE, mocks=mocks)
        self.assertReason(response, None)
        impersonation, namespace = can_install.await_args.args
        self.assertEqual(impersonation.username, "alice@example.com")
        self.assertNotEqual(impersonation.username, installer_username("team-a"))
        self.assertEqual(namespace, "team-a")
        self.assertEqual(mocks["installer_enabled"].await_args.args, ("team-a",))
        self.assertEqual(mocks["policy_in_place"].await_args.args, ("team-a",))

    def test_invalid_namespace_is_rejected_before_any_check(self):
        for namespace in ("a:b", "Team-A", "a.b", "a" * 64):
            with self.subTest(namespace=namespace):
                mocks = {}
                response, can_install = _get(
                    SSO, ALICE, url=f"/v1/namespaces/{namespace}/marketplace-installs/capability", mocks=mocks
                )
                self.assertEqual(response.status_code, 422)
                mocks["installer_enabled"].assert_not_awaited()
                can_install.assert_not_awaited()

    def test_read_only_value_is_case_insensitive(self):
        self.assertReason(_get({**SSO, "READ_ONLY_MODE": "TRUE"}, ALICE)[0], "read-only")

    def test_api_key_with_user_identity(self):
        env = {"AUTH_MODE": "hybrid", "IMPERSONATION_ENABLED": "true"}
        self.assertReason(_get(env, {**ALICE, "x-test-api-key": "1"})[0], "api-key-not-supported")

    def test_no_identity_is_reported_before_namespace_checks(self):
        mocks = {}
        response, _ = _get(SSO, installer=False, policy=False, mocks=mocks)
        self.assertReason(response, "not-permitted")
        mocks["installer_enabled"].assert_not_awaited()

    def test_read_only(self):
        self.assertReason(_get({**SSO, "READ_ONLY_MODE": "true"}, ALICE)[0], "read-only")

    def test_api_key(self):
        env = {"AUTH_MODE": "hybrid", "IMPERSONATION_ENABLED": "true"}
        self.assertReason(_get(env, {"x-test-api-key": "1"})[0], "api-key-not-supported")

    def test_impersonation_disabled(self):
        self.assertReason(_get({"AUTH_MODE": "sso"}, ALICE)[0], "impersonation-disabled")

    def test_no_identity(self):
        self.assertReason(_get(SSO)[0], "not-permitted")

    def test_namespace_not_enabled(self):
        self.assertReason(_get(SSO, ALICE, installer=False)[0], "namespace-not-enabled")

    def test_policy_missing(self):
        self.assertReason(_get(SSO, ALICE, policy=False)[0], "policy-missing")

    def test_user_not_permitted(self):
        self.assertReason(_get(SSO, ALICE, user_can_install=False)[0], "not-permitted")

    def test_first_reason_wins(self):
        cases = [
            ({**SSO, "READ_ONLY_MODE": "true"}, {"x-test-api-key": "1"}, "read-only"),
            ({"AUTH_MODE": "hybrid", "IMPERSONATION_ENABLED": "true"}, {"x-test-api-key": "1"}, "api-key-not-supported"),
            ({"AUTH_MODE": "sso"}, ALICE, "impersonation-disabled"),
            (SSO, ALICE, "namespace-not-enabled"),
        ]
        for env, headers, reason in cases:
            with self.subTest(reason=reason):
                response, can_install = _get(env, headers, installer=False, policy=False, user_can_install=False)
                self.assertReason(response, reason)
                can_install.assert_not_awaited()

    def test_policy_missing_before_not_permitted(self):
        response, can_install = _get(SSO, ALICE, policy=False, user_can_install=False)
        self.assertReason(response, "policy-missing")
        can_install.assert_not_awaited()

    def test_open_mode_skips_the_user_review(self):
        response, can_install = _get({}, user_can_install=False)
        self.assertReason(response, None)
        can_install.assert_not_awaited()

    def test_open_mode_still_checks_the_namespace(self):
        self.assertReason(_get({}, installer=False)[0], "namespace-not-enabled")
        self.assertReason(_get({}, policy=False)[0], "policy-missing")
        self.assertReason(_get({"READ_ONLY_MODE": "true"})[0], "read-only")


if __name__ == "__main__":
    unittest.main()
