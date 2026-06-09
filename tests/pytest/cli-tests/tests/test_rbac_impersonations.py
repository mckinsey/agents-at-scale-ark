import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from helpers.ark_api_helper import ensure_port_forward, send_request

REJECTION_DETAIL = "Client-supplied Impersonate-* headers are not allowed"
RESOURCE_PATH = "/v1/agents?namespace=default"
HEALTH_PATH = "/health"


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
    before authentication, so this holds in the default open auth mode used by
    the cli-test cluster (no OIDC required)."""

    @pytest.mark.parametrize(
        "header_name",
        [
            "Impersonate-User",
            "Impersonate-Group",
            "Impersonate-Uid",
            "Impersonate-Extra-scopes",
            "impersonate-user",
        ],
    )
    def test_impersonate_header_rejected(self, header_name):
        status, body = send_request(
            RESOURCE_PATH, headers={header_name: "attacker@example.com"}
        )
        assert status == 403, (
            f"Header '{header_name}' should be rejected with 403, got {status}. Body: {body}"
        )
        assert REJECTION_DETAIL in _detail(body), (
            f"Expected rejection detail for '{header_name}', got: {body}"
        )

    def test_rejection_applies_before_route_auth(self):
        status, body = send_request(
            HEALTH_PATH, headers={"Impersonate-User": "attacker@example.com"}
        )
        assert status == 403, (
            f"Impersonate-* header must be rejected even on the public {HEALTH_PATH} "
            f"route, got {status}. Body: {body}"
        )
        assert REJECTION_DETAIL in _detail(body)

    def test_rejection_on_write_method(self):
        status, body = send_request(
            RESOURCE_PATH,
            method="POST",
            headers={"Impersonate-User": "attacker@example.com"},
            data={"metadata": {"name": "rbac-test-agent"}},
        )
        assert status == 403, (
            f"POST with Impersonate-* header should be rejected with 403, got {status}. "
            f"Body: {body}"
        )
        assert REJECTION_DETAIL in _detail(body)

    def test_request_without_impersonation_header_not_rejected(self):
        status, body = send_request(RESOURCE_PATH)
        assert not (status == 403 and REJECTION_DETAIL in _detail(body)), (
            f"A request without Impersonate-* headers must not hit the impersonation "
            f"rejection. Body: {body}"
        )

    def test_multiple_impersonation_headers_rejected(self):
        status, body = send_request(
            RESOURCE_PATH,
            headers={
                "Impersonate-User": "attacker@example.com",
                "Impersonate-Group": "ark-admin",
            },
        )
        assert status == 403, (
            f"Simultaneous Impersonate-User + Impersonate-Group must be rejected, "
            f"got {status}. Body: {body}"
        )
        assert REJECTION_DETAIL in _detail(body)

    def test_no_bypass_with_authorization_header(self):
        status, body = send_request(
            RESOURCE_PATH,
            headers={
                "Authorization": "Bearer not-a-real-token",
                "Impersonate-User": "attacker@example.com",
            },
        )
        assert status == 403, (
            f"Impersonate-* header check runs before auth, so a Bearer token must not "
            f"create a bypass. Expected 403, got {status}. Body: {body}"
        )
        assert REJECTION_DETAIL in _detail(body)


@pytest.mark.cli
@pytest.mark.rbac
class TestOpenModeApiBehaviour:
    """In the default open auth mode the API serves requests via its own service
    account. These confirm the impersonation guard does not break normal traffic."""

    @pytest.mark.parametrize("resource", ["agents", "models", "teams"])
    def test_list_returns_ok(self, resource):
        status, body = send_request(f"/v1/{resource}?namespace=default")
        assert status == 200, (
            f"GET /v1/{resource} should return 200 in open mode, got {status}. Body: {body}"
        )

    def test_missing_resource_returns_404(self):
        status, body = send_request("/v1/agents/does-not-exist-xyz?namespace=default")
        assert status == 404, (
            f"GET on a missing agent should return 404, got {status}. Body: {body}"
        )
