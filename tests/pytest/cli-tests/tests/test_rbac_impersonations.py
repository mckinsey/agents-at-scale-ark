import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from helpers.ark_api_helper import ensure_port_forward, send_request

REJECTION_DETAIL = "Client-supplied Impersonate-* headers are not allowed"
RESOURCE_PATH = "/v1/agents?namespace=default"
HEALTH_PATH = "/health"

IMPERSONATE_HEADERS = [
    "Impersonate-User",
    "Impersonate-Group",
    "Impersonate-Uid",
    "Impersonate-Extra-scopes",
    "impersonate-user",
]


@pytest.fixture(scope="module", autouse=True)
def api_available():
    assert ensure_port_forward(), (
        "ark-api is not reachable on localhost:8080. "
        "Run: kubectl port-forward svc/ark-api 8080:80 -n default"
    )


def _detail(body: dict) -> str:
    detail = body.get("detail") if isinstance(body, dict) else None
    return detail if isinstance(detail, str) else ""


@pytest.mark.cli
@pytest.mark.rbac
class TestImpersonationHeaderRejection:
    """Validates the API-layer defense from PR #2066: clients cannot supply
    Impersonate-* headers to escalate privileges. The middleware rejects them
    before authentication."""

    @pytest.mark.parametrize("header_name", IMPERSONATE_HEADERS)
    def test_single_header_rejected(self, header_name):
        status, body = send_request(RESOURCE_PATH, headers={header_name: "attacker@example.com"})
        assert status == 403, f"'{header_name}' should be rejected with 403, got {status}"
        assert REJECTION_DETAIL in _detail(body), f"Missing rejection detail, got: {body}"

    def test_multiple_headers_rejected(self):
        status, body = send_request(
            RESOURCE_PATH,
            headers={"Impersonate-User": "attacker@example.com", "Impersonate-Group": "ark-admin"},
        )
        assert status == 403 and REJECTION_DETAIL in _detail(body)

    def test_rejection_applies_to_health_and_post(self):
        health_status, health_body = send_request(
            HEALTH_PATH, headers={"Impersonate-User": "attacker@example.com"}
        )
        assert health_status == 403, f"Must reject on public route, got {health_status}"
        assert REJECTION_DETAIL in _detail(health_body)

        post_status, post_body = send_request(
            RESOURCE_PATH,
            method="POST",
            headers={"Impersonate-User": "attacker@example.com"},
            data={"metadata": {"name": "rbac-test-agent"}},
        )
        assert post_status == 403, f"Must reject POST, got {post_status}"
        assert REJECTION_DETAIL in _detail(post_body)

    def test_bearer_token_does_not_bypass_check(self):
        status, body = send_request(
            RESOURCE_PATH,
            headers={"Authorization": "Bearer not-a-real-token", "Impersonate-User": "attacker@example.com"},
        )
        assert status == 403 and REJECTION_DETAIL in _detail(body)

    def test_normal_request_not_rejected(self):
        status, body = send_request(RESOURCE_PATH)
        assert not (status == 403 and REJECTION_DETAIL in _detail(body)), (
            f"Request without Impersonate-* headers must not be blocked. Body: {body}"
        )


@pytest.mark.cli
@pytest.mark.rbac
class TestOpenModeApiBehaviour:
    """Confirms the impersonation guard does not break normal traffic in
    the default open auth mode."""

    @pytest.mark.parametrize("resource", ["agents", "models", "teams"])
    def test_list_returns_ok(self, resource):
        status, body = send_request(f"/v1/{resource}?namespace=default")
        assert status == 200, f"GET /v1/{resource} should return 200, got {status}. Body: {body}"

    def test_missing_resource_returns_404(self):
        status, _ = send_request("/v1/agents/does-not-exist-xyz?namespace=default")
        assert status == 404
