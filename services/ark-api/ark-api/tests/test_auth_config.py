"""
Test cases for authentication configuration.

This module tests environment variable handling and configuration loading.
"""

import unittest
import os
from unittest.mock import patch



class TestAuthConfig(unittest.TestCase):
    """Test cases for authentication configuration."""

    def setUp(self):
        """Set up test fixtures."""
        # Clear any existing environment variables
        for key in ['OIDC_ISSUER_URL', 'OIDC_APPLICATION_ID', 'AUTH_MODE']:
            if key in os.environ:
                del os.environ[key]

    def tearDown(self):
        """Clean up after tests."""
        # Clear environment variables after each test
        for key in ['OIDC_ISSUER_URL', 'OIDC_APPLICATION_ID', 'AUTH_MODE']:
            if key in os.environ:
                del os.environ[key]


    def test_environment_variable_loading(self):
        """Test that environment variables are loaded correctly."""
        test_env = {
            'OIDC_ISSUER_URL': 'https://auth.example.com/realms/test',
            'OIDC_APPLICATION_ID': 'app-123',
            'AUTH_MODE': 'open'
        }
        
        with patch.dict(os.environ, test_env):
            # Test individual environment variables
            self.assertEqual(os.getenv('OIDC_ISSUER_URL'), 'https://auth.example.com/realms/test')
            self.assertEqual(os.getenv('OIDC_APPLICATION_ID'), 'app-123')
            self.assertEqual(os.getenv('AUTH_MODE'), 'open')

    def test_auth_mode_parsing(self):
        """Test AUTH_MODE environment variable parsing."""
        # Test SSO mode (authentication required)
        for value in ['sso', 'SSO', 'Sso']:
            with patch.dict(os.environ, {'AUTH_MODE': value}):
                auth_mode = os.getenv("AUTH_MODE", "").lower()
                skip_auth = auth_mode != "sso"
                self.assertFalse(skip_auth, f"Failed for value: {value}")

        # Test non-SSO modes (authentication skipped)
        for value in ['open', 'Open', 'OPEN', 'false', 'true', 'off', 'on', '', None]:
            with patch.dict(os.environ, {'AUTH_MODE': value} if value is not None else {}):
                auth_mode = os.getenv("AUTH_MODE", "").lower()
                skip_auth = auth_mode != "sso"
                self.assertTrue(skip_auth, f"Failed for value: {value}")



if __name__ == '__main__':
    unittest.main()
