"""
Test cases for the authentication middleware.

This module tests the AuthMiddleware functionality.
"""

import unittest
from unittest.mock import Mock, patch, AsyncMock
import os

from ark_api.auth.middleware import AuthMiddleware, TokenValidationError


class TestAuthMiddleware(unittest.TestCase):
    """Test cases for AuthMiddleware."""

    def setUp(self):
        """Set up test fixtures."""
        self.middleware = AuthMiddleware(Mock())

    @patch.dict(os.environ, {
        'AUTH_MODE': 'open',
        'ARK_OKTA_ISSUER': 'https://test-issuer.com',
        'OIDC_APPLICATION_ID': 'test-app-id'
    })
    async def test_skip_auth_enabled(self):
        """Test that authentication is skipped when AUTH_MODE=open."""
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
        'AUTH_MODE': 'sso',
        'ARK_OKTA_ISSUER': 'https://test-issuer.com',
        'OIDC_APPLICATION_ID': 'test-app-id'
    })
    async def test_skip_auth_disabled_missing_header(self):
        """Test that authentication is required when AUTH_MODE=sso."""
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
        'AUTH_MODE': 'sso',
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
        'AUTH_MODE': 'sso',
        'ARK_OKTA_ISSUER': 'https://test-issuer.com',
        'OIDC_APPLICATION_ID': 'test-app-id'
    })
    @patch('ark_sdk.auth.validator.TokenValidator')
    async def test_skip_auth_disabled_valid_token(self, mock_validator_class):
        """Test that authentication succeeds with valid token."""
        # Mock request
        request = Mock()
        request.url.path = "/api/v1/agents"
        request.headers = {"Authorization": "Bearer valid-token"}

        # Mock validator instance
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
        'AUTH_MODE': 'sso',
        'ARK_OKTA_ISSUER': 'https://test-issuer.com',
        'OIDC_APPLICATION_ID': 'test-app-id'
    })
    @patch('ark_sdk.auth.validator.TokenValidator')
    async def test_skip_auth_disabled_invalid_token(self, mock_validator_class):
        """Test that authentication fails with invalid token."""
        # Mock request
        request = Mock()
        request.url.path = "/api/v1/agents"
        request.headers = {"Authorization": "Bearer invalid-token"}

        # Mock validator instance to raise TokenValidationError
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

    @patch.dict(os.environ, {
        'AUTH_MODE': 'sso',
        'ARK_OKTA_ISSUER': 'https://test-issuer.com',
        'OIDC_APPLICATION_ID': 'test-app-id'
    })
    async def test_auth_mode_sso_enables_auth(self):
        """Test that AUTH_MODE=sso enables authentication."""
        # Mock request
        request = Mock()
        request.url.path = "/api/v1/agents"
        request.headers = {}

        # Mock call_next
        call_next = AsyncMock()

        # Test middleware
        response = await self.middleware.dispatch(request, call_next)

        # Verify that a 401 response is returned (authentication required)
        self.assertEqual(response.status_code, 401)
        self.assertIn("Missing or invalid authorization header", response.body.decode())

    @patch.dict(os.environ, {
        'AUTH_MODE': 'open',
        'ARK_OKTA_ISSUER': 'https://test-issuer.com',
        'OIDC_APPLICATION_ID': 'test-app-id'
    })
    async def test_auth_mode_open_disables_auth(self):
        """Test that AUTH_MODE=open disables authentication."""
        # Mock request
        request = Mock()
        request.url.path = "/api/v1/agents"
        request.headers = {}

        # Mock call_next
        call_next = AsyncMock()
        call_next.return_value = Mock()

        # Test middleware
        response = await self.middleware.dispatch(request, call_next)

        # Verify that call_next was called (authentication was skipped)
        call_next.assert_called_once_with(request)
        self.assertIsNotNone(response)

    @patch.dict(os.environ, {
        'AUTH_MODE': 'invalid',
        'ARK_OKTA_ISSUER': 'https://test-issuer.com',
        'OIDC_APPLICATION_ID': 'test-app-id'
    })
    async def test_auth_mode_invalid_disables_auth(self):
        """Test that any AUTH_MODE other than 'sso' disables authentication."""
        # Mock request
        request = Mock()
        request.url.path = "/api/v1/agents"
        request.headers = {}

        # Mock call_next
        call_next = AsyncMock()
        call_next.return_value = Mock()

        # Test middleware
        response = await self.middleware.dispatch(request, call_next)

        # Verify that call_next was called (authentication was skipped)
        call_next.assert_called_once_with(request)
        self.assertIsNotNone(response)

    @patch.dict(os.environ, {
        'AUTH_MODE': 'sso',
        'OIDC_ISSUER_URL': '',
        'OIDC_APPLICATION_ID': 'test-app-id'
    })
    async def test_missing_oidc_issuer_disables_auth(self):
        """Test that missing OIDC_ISSUER_URL disables authentication even with AUTH_MODE=sso."""
        # Mock request
        request = Mock()
        request.url.path = "/api/v1/agents"
        request.headers = {}

        # Mock call_next
        call_next = AsyncMock()
        call_next.return_value = Mock()

        # Test middleware
        response = await self.middleware.dispatch(request, call_next)

        # Verify that call_next was called (authentication was skipped)
        call_next.assert_called_once_with(request)
        self.assertIsNotNone(response)

    @patch.dict(os.environ, {
        'AUTH_MODE': 'sso',
        'OIDC_ISSUER_URL': 'https://test-issuer.com',
        'OIDC_APPLICATION_ID': ''
    })
    async def test_missing_oidc_app_id_disables_auth(self):
        """Test that missing OIDC_APPLICATION_ID disables authentication even with AUTH_MODE=sso."""
        # Mock request
        request = Mock()
        request.url.path = "/api/v1/agents"
        request.headers = {}

        # Mock call_next
        call_next = AsyncMock()
        call_next.return_value = Mock()

        # Test middleware
        response = await self.middleware.dispatch(request, call_next)

        # Verify that call_next was called (authentication was skipped)
        call_next.assert_called_once_with(request)
        self.assertIsNotNone(response)

    @patch.dict(os.environ, {
        'AUTH_MODE': 'sso',
        'OIDC_ISSUER_URL': '',
        'OIDC_APPLICATION_ID': ''
    })
    async def test_missing_both_oidc_configs_disables_auth(self):
        """Test that missing both OIDC configs disables authentication even with AUTH_MODE=sso."""
        # Mock request
        request = Mock()
        request.url.path = "/api/v1/agents"
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
