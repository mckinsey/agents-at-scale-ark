import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from starlette.datastructures import Headers


def _make_request(headers=None, path="/v1/agents", method="GET"):
    request = MagicMock()
    request.url.path = path
    request.method = method
    request.headers = Headers(headers or {})
    request.state = MagicMock(spec=[])
    return request


class TestMiddlewareDispatchImpersonationHeaders(unittest.IsolatedAsyncioTestCase):

    @patch.dict(os.environ, {"AUTH_MODE": "sso", "OIDC_ISSUER_URL": "http://issuer", "OIDC_APPLICATION_ID": "app"})
    @patch("ark_api.auth.middleware.APIKeyService")
    @patch("ark_api.auth.middleware.TokenValidator")
    async def test_rejects_impersonate_user_header(self, mock_validator_cls, mock_api_key_svc):
        from ark_api.auth.middleware import AuthMiddleware

        app = MagicMock()
        middleware = AuthMiddleware(app)
        call_next = AsyncMock()

        request = _make_request(headers={"impersonate-user": "admin@acme.com", "authorization": "Bearer xyz"})
        response = await middleware.dispatch(request, call_next)

        self.assertEqual(response.status_code, 403)
        call_next.assert_not_called()

    @patch.dict(os.environ, {"AUTH_MODE": "sso", "OIDC_ISSUER_URL": "http://issuer", "OIDC_APPLICATION_ID": "app"})
    @patch("ark_api.auth.middleware.APIKeyService")
    @patch("ark_api.auth.middleware.TokenValidator")
    async def test_rejects_impersonate_group_header(self, mock_validator_cls, mock_api_key_svc):
        from ark_api.auth.middleware import AuthMiddleware

        app = MagicMock()
        middleware = AuthMiddleware(app)
        call_next = AsyncMock()

        request = _make_request(headers={"impersonate-group": "admins", "authorization": "Bearer xyz"})
        response = await middleware.dispatch(request, call_next)

        self.assertEqual(response.status_code, 403)

    @patch.dict(os.environ, {"AUTH_MODE": "open"})
    @patch("ark_api.auth.middleware.APIKeyService")
    async def test_open_mode_skips_auth(self, mock_api_key_svc):
        from ark_api.auth.middleware import AuthMiddleware

        app = MagicMock()
        middleware = AuthMiddleware(app)
        expected_response = MagicMock()
        call_next = AsyncMock(return_value=expected_response)

        request = _make_request()
        response = await middleware.dispatch(request, call_next)

        self.assertEqual(response, expected_response)
        call_next.assert_called_once()

    @patch.dict(os.environ, {"AUTH_MODE": "sso", "OIDC_ISSUER_URL": "http://issuer", "OIDC_APPLICATION_ID": "app"})
    @patch("ark_api.auth.middleware.APIKeyService")
    @patch("ark_api.auth.middleware.TokenValidator")
    async def test_missing_auth_header_returns_401(self, mock_validator_cls, mock_api_key_svc):
        from ark_api.auth.middleware import AuthMiddleware

        app = MagicMock()
        middleware = AuthMiddleware(app)
        call_next = AsyncMock()

        request = _make_request(headers={})
        response = await middleware.dispatch(request, call_next)

        self.assertEqual(response.status_code, 401)

    @patch.dict(os.environ, {
        "AUTH_MODE": "sso",
        "OIDC_ISSUER_URL": "http://issuer",
        "OIDC_APPLICATION_ID": "app",
        "IMPERSONATION_ENABLED": "true",
        "IMPERSONATION_USERNAME_CLAIM": "email",
        "IMPERSONATION_GROUPS_CLAIM": "groups",
    })
    @patch("ark_api.auth.middleware.APIKeyService")
    @patch("ark_api.auth.middleware.TokenValidator")
    async def test_jwt_sets_user_identity_on_request(self, mock_validator_cls, mock_api_key_svc):
        mock_validator = MagicMock()
        mock_validator.validate_token.return_value = {
            "email": "jane@acme.com",
            "groups": ["team-a", "admins"],
            "sub": "123",
        }
        mock_validator_cls.return_value = mock_validator

        from ark_api.auth.middleware import AuthMiddleware

        app = MagicMock()
        middleware = AuthMiddleware(app)
        expected_response = MagicMock()
        call_next = AsyncMock(return_value=expected_response)

        request = _make_request(headers={"authorization": "Bearer valid-token"})
        response = await middleware.dispatch(request, call_next)

        self.assertEqual(response, expected_response)
        identity = request.state.user_identity
        self.assertEqual(identity.username, "jane@acme.com")
        self.assertEqual(identity.groups, ["team-a", "admins"])
        mock_validator_cls.assert_called_once()

    @patch.dict(os.environ, {
        "AUTH_MODE": "sso",
        "OIDC_ISSUER_URL": "http://issuer",
        "OIDC_APPLICATION_ID": "app",
        "IMPERSONATION_ENABLED": "true",
        "IMPERSONATION_USERNAME_CLAIM": "email",
    })
    @patch("ark_api.auth.middleware.APIKeyService")
    @patch("ark_api.auth.middleware.TokenValidator")
    async def test_missing_username_claim_returns_401(self, mock_validator_cls, mock_api_key_svc):
        mock_validator = MagicMock()
        mock_validator.validate_token.return_value = {"sub": "123"}
        mock_validator_cls.return_value = mock_validator

        from ark_api.auth.middleware import AuthMiddleware

        app = MagicMock()
        middleware = AuthMiddleware(app)
        call_next = AsyncMock()

        request = _make_request(headers={"authorization": "Bearer valid-token"})
        response = await middleware.dispatch(request, call_next)

        self.assertEqual(response.status_code, 401)
        import json
        body = json.loads(response.body)
        self.assertIn("email", body["detail"])
        mock_validator_cls.assert_called_once()

    @patch.dict(os.environ, {
        "AUTH_MODE": "sso",
        "OIDC_ISSUER_URL": "http://issuer",
        "OIDC_APPLICATION_ID": "app",
        "IMPERSONATION_ENABLED": "false",
        "IMPERSONATION_USERNAME_CLAIM": "email",
    })
    @patch("ark_api.auth.middleware.APIKeyService")
    @patch("ark_api.auth.middleware.TokenValidator")
    async def test_missing_claim_ok_when_impersonation_disabled(self, mock_validator_cls, mock_api_key_svc):
        mock_validator = MagicMock()
        mock_validator.validate_token.return_value = {"sub": "123"}
        mock_validator_cls.return_value = mock_validator

        from ark_api.auth.middleware import AuthMiddleware

        app = MagicMock()
        middleware = AuthMiddleware(app)
        expected_response = MagicMock()
        call_next = AsyncMock(return_value=expected_response)

        request = _make_request(headers={"authorization": "Bearer valid-token"})
        response = await middleware.dispatch(request, call_next)

        self.assertEqual(response, expected_response)
        mock_validator_cls.assert_called_once()

    @patch.dict(os.environ, {"AUTH_MODE": "sso", "OIDC_ISSUER_URL": "http://issuer", "OIDC_APPLICATION_ID": "app"})
    @patch("ark_api.auth.middleware.APIKeyService")
    @patch("ark_api.auth.middleware.TokenValidator")
    async def test_public_route_skips_auth(self, mock_validator_cls, mock_api_key_svc):
        from ark_api.auth.middleware import AuthMiddleware

        app = MagicMock()
        middleware = AuthMiddleware(app)
        expected_response = MagicMock()
        call_next = AsyncMock(return_value=expected_response)

        request = _make_request(path="/health")
        response = await middleware.dispatch(request, call_next)

        self.assertEqual(response, expected_response)

    @patch.dict(os.environ, {"AUTH_MODE": "sso", "OIDC_ISSUER_URL": "http://issuer", "OIDC_APPLICATION_ID": "app"})
    @patch("ark_api.auth.middleware.APIKeyService")
    @patch("ark_api.auth.middleware.TokenValidator")
    async def test_empty_bearer_token_returns_401(self, mock_validator_cls, mock_api_key_svc):
        from ark_api.auth.middleware import AuthMiddleware

        app = MagicMock()
        middleware = AuthMiddleware(app)
        call_next = AsyncMock()

        request = _make_request(headers={"authorization": "Bearer "})
        response = await middleware.dispatch(request, call_next)

        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
