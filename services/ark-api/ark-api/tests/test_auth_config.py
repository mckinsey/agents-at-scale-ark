"""
Test cases for authentication configuration.

This module tests environment variable handling and configuration loading.
"""

import unittest
import os
from unittest.mock import patch

from ark_api.auth.middleware import FlexibleTokenValidator


class TestAuthConfig(unittest.TestCase):
    """Test cases for authentication configuration."""

    def setUp(self):
        """Set up test fixtures."""
        # Clear any existing environment variables
        for key in ['ARK_OIDC_ISSUER', 'ARK_OIDC_APPLICATION_ID', 'ARK_OIDC_CLIENT_ID', 'ARK_SKIP_AUTH']:
            if key in os.environ:
                del os.environ[key]

    def tearDown(self):
        """Clean up after tests."""
        # Clear environment variables after each test
        for key in ['ARK_OIDC_ISSUER', 'ARK_OIDC_APPLICATION_ID', 'ARK_OIDC_CLIENT_ID', 'ARK_SKIP_AUTH']:
            if key in os.environ:
                del os.environ[key]

    def test_flexible_token_validator_with_application_id(self):
        """Test FlexibleTokenValidator with ARK_OIDC_APPLICATION_ID."""
        with patch.dict(os.environ, {
            'ARK_OIDC_ISSUER': 'https://test-issuer.com',
            'ARK_OIDC_APPLICATION_ID': 'test-app-id'
        }):
            validator = FlexibleTokenValidator(
                issuer_url=os.getenv('ARK_OIDC_ISSUER'),
                app_id=os.getenv('ARK_OIDC_APPLICATION_ID')
            )
            
            self.assertEqual(validator.issuer_url, 'https://test-issuer.com')
            self.assertEqual(validator.app_id, 'test-app-id')
            self.assertEqual(validator.jwks_url, 'https://test-issuer.com/.well-known/jwks.json')

    def test_flexible_token_validator_with_client_id_fallback(self):
        """Test FlexibleTokenValidator with ARK_OIDC_CLIENT_ID fallback."""
        with patch.dict(os.environ, {
            'ARK_OIDC_ISSUER': 'https://test-issuer.com',
            'ARK_OIDC_CLIENT_ID': 'test-client-id'
        }):
            validator = FlexibleTokenValidator(
                issuer_url=os.getenv('ARK_OIDC_ISSUER'),
                app_id=os.getenv('ARK_OIDC_APPLICATION_ID') or os.getenv('ARK_OIDC_CLIENT_ID')
            )
            
            self.assertEqual(validator.issuer_url, 'https://test-issuer.com')
            self.assertEqual(validator.app_id, 'test-client-id')
            self.assertEqual(validator.jwks_url, 'https://test-issuer.com/.well-known/jwks.json')

    def test_flexible_token_validator_priority(self):
        """Test that ARK_OIDC_APPLICATION_ID takes priority over ARK_OIDC_CLIENT_ID."""
        with patch.dict(os.environ, {
            'ARK_OIDC_ISSUER': 'https://test-issuer.com',
            'ARK_OIDC_APPLICATION_ID': 'test-app-id',
            'ARK_OIDC_CLIENT_ID': 'test-client-id'
        }):
            validator = FlexibleTokenValidator(
                issuer_url=os.getenv('ARK_OIDC_ISSUER'),
                app_id=os.getenv('ARK_OIDC_APPLICATION_ID') or os.getenv('ARK_OIDC_CLIENT_ID')
            )
            
            self.assertEqual(validator.app_id, 'test-app-id')

    def test_flexible_token_validator_no_app_id(self):
        """Test FlexibleTokenValidator without app_id."""
        with patch.dict(os.environ, {
            'ARK_OIDC_ISSUER': 'https://test-issuer.com'
        }):
            validator = FlexibleTokenValidator(
                issuer_url=os.getenv('ARK_OIDC_ISSUER'),
                app_id=os.getenv('ARK_OIDC_APPLICATION_ID') or os.getenv('ARK_OIDC_CLIENT_ID')
            )
            
            self.assertEqual(validator.issuer_url, 'https://test-issuer.com')
            self.assertIsNone(validator.app_id)
            self.assertEqual(validator.jwks_url, 'https://test-issuer.com/.well-known/jwks.json')

    def test_environment_variable_loading(self):
        """Test that environment variables are loaded correctly."""
        test_env = {
            'ARK_OIDC_ISSUER': 'https://auth.example.com/realms/test',
            'ARK_OIDC_APPLICATION_ID': 'app-123',
            'ARK_OIDC_CLIENT_ID': 'client-456',
            'ARK_SKIP_AUTH': 'true'
        }
        
        with patch.dict(os.environ, test_env):
            # Test individual environment variables
            self.assertEqual(os.getenv('ARK_OIDC_ISSUER'), 'https://auth.example.com/realms/test')
            self.assertEqual(os.getenv('ARK_OIDC_APPLICATION_ID'), 'app-123')
            self.assertEqual(os.getenv('ARK_OIDC_CLIENT_ID'), 'client-456')
            self.assertEqual(os.getenv('ARK_SKIP_AUTH'), 'true')

    def test_skip_auth_parsing(self):
        """Test ARK_SKIP_AUTH environment variable parsing."""
        # Test various truthy values (only 'true' variations work with current logic)
        for value in ['true', 'True', 'TRUE']:
            with patch.dict(os.environ, {'ARK_SKIP_AUTH': value}):
                skip_auth = os.getenv("ARK_SKIP_AUTH", "false").lower() == "true"
                self.assertTrue(skip_auth, f"Failed for value: {value}")

        # Test various falsy values
        for value in ['false', 'False', 'FALSE', '0', '1', 'no', 'yes', 'off', 'on', '', None]:
            with patch.dict(os.environ, {'ARK_SKIP_AUTH': value} if value is not None else {}):
                skip_auth = os.getenv("ARK_SKIP_AUTH", "false").lower() == "true"
                self.assertFalse(skip_auth, f"Failed for value: {value}")

    def test_jwks_url_construction(self):
        """Test JWKS URL construction from issuer URL."""
        test_cases = [
            ('https://auth.example.com/realms/test', 'https://auth.example.com/realms/test/.well-known/jwks.json'),
            ('https://keycloak.example.com/realms/my-realm', 'https://keycloak.example.com/realms/my-realm/.well-known/jwks.json'),
            ('https://your-domain.auth0.com', 'https://your-domain.auth0.com/.well-known/jwks.json'),
        ]
        
        for issuer_url, expected_jwks_url in test_cases:
            with self.subTest(issuer_url=issuer_url):
                validator = FlexibleTokenValidator(issuer_url, 'test-app-id')
                self.assertEqual(validator.jwks_url, expected_jwks_url)


if __name__ == '__main__':
    unittest.main()
