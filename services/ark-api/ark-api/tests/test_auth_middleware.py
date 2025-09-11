"""
Test cases for the authentication middleware.

This module tests the FlexibleTokenValidator and AuthMiddleware functionality.
"""

import unittest
from unittest.mock import Mock, patch, AsyncMock
import os
import jwt
from datetime import datetime, timedelta, timezone

from ark_api.auth.middleware import FlexibleTokenValidator, AuthMiddleware, TokenValidationError


class TestFlexibleTokenValidator(unittest.TestCase):
    """Test cases for FlexibleTokenValidator."""

    def setUp(self):
        """Set up test fixtures."""
        self.issuer_url = "https://test-issuer.com"
        self.app_id = "test-app-id"
        self.validator = FlexibleTokenValidator(self.issuer_url, self.app_id)

    def test_init(self):
        """Test FlexibleTokenValidator initialization."""
        self.assertEqual(self.validator.issuer_url, self.issuer_url)
        self.assertEqual(self.validator.app_id, self.app_id)
        self.assertEqual(self.validator.jwks_url, f"{self.issuer_url}/.well-known/jwks.json")

    def test_init_without_app_id(self):
        """Test FlexibleTokenValidator initialization without app_id."""
        validator = FlexibleTokenValidator(self.issuer_url)
        self.assertEqual(validator.issuer_url, self.issuer_url)
        self.assertIsNone(validator.app_id)
        self.assertEqual(validator.jwks_url, f"{self.issuer_url}/.well-known/jwks.json")

    @patch('ark_api.auth.middleware.AsyncKeyFetcher')
    @patch('ark_api.auth.middleware.jwt')
    async def test_validate_token_success(self, mock_jwt, mock_fetcher_class):
        """Test successful token validation."""
        # Mock the key fetcher
        mock_fetcher = AsyncMock()
        mock_fetcher_class.return_value = mock_fetcher
        mock_fetcher.get_key.return_value = {"key": "test-key"}
        mock_fetcher._http_client.session.close = AsyncMock()

        # Mock JWT decode
        expected_payload = {
            "sub": "test-user",
            "aud": self.app_id,
            "iss": self.issuer_url,
            "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp())
        }
        mock_jwt.decode.return_value = expected_payload

        # Test token validation
        token = "test-token"
        result = await self.validator.validate_token(token)

        # Verify calls
        mock_fetcher.get_key.assert_called_once_with(token)
        mock_jwt.decode.assert_called_once_with(
            token,
            verify=True,
            audience=self.app_id,
            key="test-key"
        )
        mock_fetcher._http_client.session.close.assert_called_once()

        # Verify result
        self.assertEqual(result, expected_payload)

    @patch('ark_api.auth.middleware.AsyncKeyFetcher')
    @patch('ark_api.auth.middleware.jwt')
    async def test_validate_token_invalid_jwt(self, mock_jwt, mock_fetcher_class):
        """Test token validation with invalid JWT."""
        # Mock the key fetcher
        mock_fetcher = AsyncMock()
        mock_fetcher_class.return_value = mock_fetcher
        mock_fetcher.get_key.return_value = {"key": "test-key"}
        mock_fetcher._http_client.session.close = AsyncMock()

        # Mock JWT decode to raise InvalidTokenError
        mock_jwt.InvalidTokenError = jwt.InvalidTokenError
        mock_jwt.decode.side_effect = jwt.InvalidTokenError("Invalid token")

        # Test token validation
        token = "invalid-token"
        with self.assertRaises(TokenValidationError) as context:
            await self.validator.validate_token(token)

        self.assertIn("Invalid token", str(context.exception))
        mock_fetcher._http_client.session.close.assert_called_once()

    @patch('ark_api.auth.middleware.AsyncKeyFetcher')
    async def test_validate_token_fetcher_error(self, mock_fetcher_class):
        """Test token validation with key fetcher error."""
        # Mock the key fetcher to raise an exception
        mock_fetcher = AsyncMock()
        mock_fetcher_class.return_value = mock_fetcher
        mock_fetcher.get_key.side_effect = Exception("Key fetch failed")
        mock_fetcher._http_client.session.close = AsyncMock()

        # Test token validation
        token = "test-token"
        with self.assertRaises(TokenValidationError) as context:
            await self.validator.validate_token(token)

        self.assertIn("Token validation failed", str(context.exception))
        mock_fetcher._http_client.session.close.assert_called_once()


class TestAuthMiddleware(unittest.TestCase):
    """Test cases for AuthMiddleware."""

    def setUp(self):
        """Set up test fixtures."""
        self.middleware = AuthMiddleware(Mock())

    @patch.dict(os.environ, {
        'ARK_SKIP_AUTH': 'true',
        'ARK_OKTA_ISSUER': 'https://test-issuer.com',
        'OIDC_APPLICATION_ID': 'test-app-id'
    })
    async def test_skip_auth_enabled(self):
        """Test that authentication is skipped when ARK_SKIP_AUTH=true."""
        # Mock request
        request = Mock()
        request.url.path = "/api/v1/agents"
        request.headers = {}

        # Mock call_next
        call_next = AsyncMock()
        call_next.return_value = Mock()

        # Test middleware
        response = await self.middleware.dispatch(request, call_next)

        # Verify that call_next was called and response was returned
        call_next.assert_called_once_with(request)
        self.assertIsNotNone(response)

    @patch.dict(os.environ, {
        'ARK_SKIP_AUTH': 'false',
        'ARK_OKTA_ISSUER': 'https://test-issuer.com',
        'OIDC_APPLICATION_ID': 'test-app-id'
    })
    async def test_skip_auth_disabled_missing_header(self):
        """Test that authentication is required when ARK_SKIP_AUTH=false."""
        # Mock request
        request = Mock()
        request.url.path = "/api/v1/agents"
        request.headers = {}

        # Mock call_next
        call_next = AsyncMock()

        # Test middleware
        response = await self.middleware.dispatch(request, call_next)

        # Verify that a 401 response is returned
        self.assertEqual(response.status_code, 401)
        self.assertIn("Missing or invalid authorization header", response.body.decode())

    @patch.dict(os.environ, {
        'ARK_SKIP_AUTH': 'false',
        'ARK_OKTA_ISSUER': 'https://test-issuer.com',
        'OIDC_APPLICATION_ID': 'test-app-id'
    })
    async def test_skip_auth_disabled_invalid_header(self):
        """Test that authentication fails with invalid authorization header."""
        # Mock request
        request = Mock()
        request.url.path = "/api/v1/agents"
        request.headers = {"Authorization": "Invalid token"}

        # Mock call_next
        call_next = AsyncMock()

        # Test middleware
        response = await self.middleware.dispatch(request, call_next)

        # Verify that a 401 response is returned
        self.assertEqual(response.status_code, 401)
        self.assertIn("Missing or invalid authorization header", response.body.decode())

    @patch.dict(os.environ, {
        'ARK_SKIP_AUTH': 'false',
        'ARK_OKTA_ISSUER': 'https://test-issuer.com',
        'OIDC_APPLICATION_ID': 'test-app-id'
    })
    @patch('ark_api.auth.middleware.FlexibleTokenValidator')
    async def test_skip_auth_disabled_valid_token(self, mock_validator_class):
        """Test that authentication succeeds with valid token."""
        # Mock request
        request = Mock()
        request.url.path = "/api/v1/agents"
        request.headers = {"Authorization": "Bearer valid-token"}

        # Mock validator
        mock_validator = AsyncMock()
        mock_validator_class.return_value = mock_validator
        mock_validator.validate_token.return_value = {"sub": "test-user"}

        # Mock call_next
        call_next = AsyncMock()
        call_next.return_value = Mock()

        # Test middleware
        response = await self.middleware.dispatch(request, call_next)

        # Verify that validator was called and call_next was called
        mock_validator.validate_token.assert_called_once_with("valid-token")
        call_next.assert_called_once_with(request)
        self.assertIsNotNone(response)

    @patch.dict(os.environ, {
        'ARK_SKIP_AUTH': 'false',
        'ARK_OKTA_ISSUER': 'https://test-issuer.com',
        'OIDC_APPLICATION_ID': 'test-app-id'
    })
    @patch('ark_api.auth.middleware.FlexibleTokenValidator')
    async def test_skip_auth_disabled_invalid_token(self, mock_validator_class):
        """Test that authentication fails with invalid token."""
        # Mock request
        request = Mock()
        request.url.path = "/api/v1/agents"
        request.headers = {"Authorization": "Bearer invalid-token"}

        # Mock validator to raise TokenValidationError
        mock_validator = AsyncMock()
        mock_validator_class.return_value = mock_validator
        mock_validator.validate_token.side_effect = TokenValidationError("Invalid token")

        # Mock call_next
        call_next = AsyncMock()

        # Test middleware
        response = await self.middleware.dispatch(request, call_next)

        # Verify that a 401 response is returned
        self.assertEqual(response.status_code, 401)
        self.assertIn("Invalid token", response.body.decode())

    async def test_public_route_skips_auth(self):
        """Test that public routes skip authentication."""
        # Mock request for public route
        request = Mock()
        request.url.path = "/health"
        request.headers = {}

        # Mock call_next
        call_next = AsyncMock()
        call_next.return_value = Mock()

        # Test middleware
        response = await self.middleware.dispatch(request, call_next)

        # Verify that call_next was called (authentication was skipped)
        call_next.assert_called_once_with(request)
        self.assertIsNotNone(response)


if __name__ == '__main__':
    unittest.main()
