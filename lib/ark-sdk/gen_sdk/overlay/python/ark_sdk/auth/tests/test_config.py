"""Tests for authentication configuration."""
import os
import pytest
from unittest.mock import patch
from ark_sdk.auth.config import AuthConfig


class TestAuthConfig:
    """Test cases for AuthConfig class."""

    def test_default_config(self):
        """Test default configuration values."""
        config = AuthConfig()
        
        assert config.jwt_algorithm == "RS256"
        assert config.audience is None
        assert config.issuer is None
        assert config.jwks_url is None

    def test_environment_variable_loading(self, clean_env):
        """Test loading configuration from environment variables."""
        test_env = {
            'ARK_JWT_ALGORITHM': 'HS256',
            'ARK_AUDIENCE': 'test-audience',
            'ARK_ISSUER': 'https://test.okta.com/oauth2/default',
            'ARK_JWKS_URL': 'https://test.okta.com/.well-known/jwks.json'
        }
        
        with patch.dict(os.environ, test_env):
            config = AuthConfig()
            
            assert config.jwt_algorithm == 'HS256'
            assert config.audience == 'test-audience'
            assert config.issuer == 'https://test.okta.com/oauth2/default'
            assert config.jwks_url == 'https://test.okta.com/.well-known/jwks.json'

    def test_case_insensitive_environment_variables(self, clean_env):
        """Test that environment variables are case insensitive."""
        test_env = {
            'ark_jwt_algorithm': 'ES256',
            'ark_issuer': 'https://test.okta.com/oauth2/default',
            'ark_audience': 'test-audience'
        }
        
        with patch.dict(os.environ, test_env):
            config = AuthConfig()
            
            assert config.jwt_algorithm == 'ES256'
            assert config.issuer == 'https://test.okta.com/oauth2/default'
            assert config.audience == 'test-audience'

    def test_audience_issuer_configuration(self, clean_env):
        """Test that audience and issuer are properly configured."""
        test_env = {
            'ARK_AUDIENCE': 'test-audience',
            'ARK_ISSUER': 'https://test.okta.com/oauth2/default'
        }
        
        with patch.dict(os.environ, test_env):
            config = AuthConfig()
            
            # Values should be present
            assert config.audience == 'test-audience'
            assert config.issuer == 'https://test.okta.com/oauth2/default'

    def test_empty_string_values(self, clean_env):
        """Test handling of empty string environment variables."""
        test_env = {
            'ARK_AUDIENCE': '',
            'ARK_ISSUER': '',
            'ARK_JWKS_URL': ''
        }
        
        with patch.dict(os.environ, test_env):
            config = AuthConfig()
            
            # Empty strings should be treated as None
            assert config.audience is None
            assert config.issuer is None
            assert config.jwks_url is None