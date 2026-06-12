import pytest

from helpers.ark_api_helper import get_api_url, is_api_reachable, send_request

REJECTION_DETAIL = "Client-supplied Impersonate-* headers are not allowed"

# Canonical header name + lowercase variant. Enough to prove the middleware
# blocks the known attack vector and is case-insensitive.
IMPERSONATE_HEADERS = [
    "Impersonate-User",
    "impersonate-user",
]


@pytest.fixture(scope="module", autouse=True)
def api_available():
    url = get_api_url()
    assert is_api_reachable(), (
        f"ark-api is not reachable at {url}. "
        "Set ARK_API_URL to override, or ensure the local gateway is running."
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
        status, body = send_request("/v1/agents?namespace=default", headers={header_name: "attacker@example.com"})
        assert status == 403, f"'{header_name}' should be rejected with 403, got {status}"
        assert REJECTION_DETAIL in _detail(body), f"Missing rejection detail, got: {body}"

    def test_multiple_headers_rejected(self):
        status, body = send_request(
            "/v1/agents?namespace=default",
            headers={"Impersonate-User": "attacker@example.com", "Impersonate-Group": "ark-admin"},
        )
        assert status == 403 and REJECTION_DETAIL in _detail(body)

    def test_rejection_applies_to_health_and_post(self):
        health_status, health_body = send_request(
            "/health", headers={"Impersonate-User": "attacker@example.com"}
        )
        assert health_status == 403, f"Must reject on public route, got {health_status}"
        assert REJECTION_DETAIL in _detail(health_body)

        post_status, post_body = send_request(
            "/v1/agents?namespace=default",
            method="POST",
            headers={"Impersonate-User": "attacker@example.com"},
            data={"metadata": {"name": "rbac-test-agent"}},
        )
        assert post_status == 403, f"Must reject POST, got {post_status}"
        assert REJECTION_DETAIL in _detail(post_body)

    def test_bearer_token_does_not_bypass_check(self):
        status, body = send_request(
            "/v1/agents?namespace=default",
            headers={"Authorization": "Bearer not-a-real-token", "Impersonate-User": "attacker@example.com"},
        )
        assert status == 403 and REJECTION_DETAIL in _detail(body)

    def test_normal_request_not_rejected(self):
        status, _ = send_request("/v1/agents?namespace=default")
        assert status != 403, "Request without Impersonate-* headers must not return 403"
