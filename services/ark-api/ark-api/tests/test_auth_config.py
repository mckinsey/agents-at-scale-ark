"""
Test cases for authentication configuration.

This module tests environment variable handling and configuration loading.
"""

import unittest
import os
from unittest.mock import patch

from ark_api.auth.constants import AuthMode


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
        for value in [AuthMode.SSO, 'SSO', 'Sso']:
            with patch.dict(os.environ, {'AUTH_MODE': value}):
                auth_mode = os.getenv("AUTH_MODE", "").lower()
                skip_auth = auth_mode != AuthMode.SSO
                self.assertFalse(skip_auth, f"Failed for value: {value}")

        # Test non-SSO modes (authentication skipped)
        for value in [AuthMode.OPEN, 'Open', 'OPEN', 'false', 'true', 'off', 'on', '', None]:
            with patch.dict(os.environ, {'AUTH_MODE': value} if value is not None else {}):
                auth_mode = os.getenv("AUTH_MODE", "").lower()
                skip_auth = auth_mode != AuthMode.SSO
                self.assertTrue(skip_auth, f"Failed for value: {value}")

    def test_auth_mode_validation_with_invalid_values(self):
        """Test AUTH_MODE validation logic that defaults invalid values to 'open'."""
        from ark_api.auth.constants import AuthMode
        
        # Test valid auth modes
        valid_auth_modes = [AuthMode.SSO, AuthMode.BASIC, AuthMode.HYBRID, AuthMode.OPEN]
        
        for valid_mode in valid_auth_modes:
            with self.subTest(mode=valid_mode):
                auth_mode_raw = valid_mode.lower()
                # Simulate the validation logic from middleware
                if auth_mode_raw in valid_auth_modes:
                    auth_mode = auth_mode_raw
                else:
                    auth_mode = AuthMode.OPEN
                
                self.assertEqual(auth_mode, valid_mode)
        
        # Test invalid auth modes - should default to 'open'
        invalid_modes = ['invalid', 'wrong', 'bad', 'unknown', 'jwt', 'oauth', 'none', '123']
        
        for invalid_mode in invalid_modes:
            with self.subTest(mode=invalid_mode):
                auth_mode_raw = invalid_mode.lower()
                # Simulate the validation logic from middleware
                if auth_mode_raw in valid_auth_modes:
                    auth_mode = auth_mode_raw
                else:
                    auth_mode = AuthMode.OPEN
                
                self.assertEqual(auth_mode, AuthMode.OPEN, 
                               f"Invalid mode '{invalid_mode}' should default to 'open'")
        
        # Test empty/None values - should default to 'open'
        for empty_value in ['', None]:
            with self.subTest(mode=empty_value):
                auth_mode_raw = (empty_value or "").lower()
                # Simulate the validation logic from middleware
                if auth_mode_raw in valid_auth_modes:
                    auth_mode = auth_mode_raw
                else:
                    auth_mode = AuthMode.OPEN
                
                self.assertEqual(auth_mode, AuthMode.OPEN, 
                               f"Empty/None mode '{empty_value}' should default to 'open'")



if __name__ == '__main__':
    unittest.main()
