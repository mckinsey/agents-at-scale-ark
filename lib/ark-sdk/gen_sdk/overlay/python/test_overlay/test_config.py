"""Tests for authentication configuration."""
import os
import unittest
from unittest.mock import patch
from ark_sdk.auth.config import AuthConfig


class TestAuthConfig(unittest.TestCase):
    """Test cases for AuthConfig class."""

    def setUp(self):
        """Set up test environment."""
        # Clean environment variables
        self.original_env = {}
        for key in list(os.environ.keys()):
            if key.startswith('ARK_'):
                self.original_env[key] = os.environ[key]
                del os.environ[key]

    def tearDown(self):
        """Clean up test environment."""
        # Restore original environment
        for key, value in self.original_env.items():
            os.environ[key] = value

    def test_default_config(self):
        """Test default configuration values."""
        config = AuthConfig()
        
        self.assertEqual(config.jwt_algorithm, "RS256")
        self.assertIsNone(config.audience)
        self.assertIsNone(config.issuer)
        self.assertIsNone(config.jwks_url)

    def test_environment_variable_loading(self):
        """Test loading configuration from environment variables."""
        test_env = {
            'ARK_JWT_ALGORITHM': 'HS256',
            'ARK_AUDIENCE': 'test-audience',
            'ARK_ISSUER': 'https://test.okta.com/oauth2/default',
            'ARK_JWKS_URL': 'https://test.okta.com/.well-known/jwks.json'
        }
        
        with patch.dict(os.environ, test_env):
            config = AuthConfig()
            
            self.assertEqual(config.jwt_algorithm, 'HS256')
            self.assertEqual(config.audience, 'test-audience')
            self.assertEqual(config.issuer, 'https://test.okta.com/oauth2/default')
            self.assertEqual(config.jwks_url, 'https://test.okta.com/.well-known/jwks.json')

    def test_case_insensitive_environment_variables(self):
        """Test that environment variables are case insensitive."""
        test_env = {
            'ark_jwt_algorithm': 'ES256',
            'ark_issuer': 'https://test.okta.com/oauth2/default',
            'ark_audience': 'test-audience'
        }
        
        with patch.dict(os.environ, test_env):
            config = AuthConfig()
            
            self.assertEqual(config.jwt_algorithm, 'ES256')
            self.assertEqual(config.issuer, 'https://test.okta.com/oauth2/default')
            self.assertEqual(config.audience, 'test-audience')

    def test_audience_issuer_configuration(self):
        """Test that audience and issuer are properly configured."""
        test_env = {
            'ARK_AUDIENCE': 'test-audience',
            'ARK_ISSUER': 'https://test.okta.com/oauth2/default'
        }
        
        with patch.dict(os.environ, test_env):
            config = AuthConfig()
            
            # Values should be present
            self.assertEqual(config.audience, 'test-audience')
            self.assertEqual(config.issuer, 'https://test.okta.com/oauth2/default')

    def test_empty_string_values(self):
        """Test handling of empty string environment variables."""
        test_env = {
            'ARK_AUDIENCE': '',
            'ARK_ISSUER': '',
            'ARK_JWKS_URL': ''
        }
        
        with patch.dict(os.environ, test_env):
            config = AuthConfig()
            
            # Empty strings should be treated as None
            self.assertIsNone(config.audience)
            self.assertIsNone(config.issuer)
            self.assertIsNone(config.jwks_url)


if __name__ == '__main__':
    unittest.main()