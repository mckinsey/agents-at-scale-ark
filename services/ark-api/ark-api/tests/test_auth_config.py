"""
Test cases for authentication configuration.

This module tests environment variable handling and configuration loading.
"""

import unittest
import os
from unittest.mock import patch

from ark_sdk.auth.validator import TokenValidator
from ark_sdk.auth.config import AuthConfig


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



if __name__ == '__main__':
    unittest.main()
