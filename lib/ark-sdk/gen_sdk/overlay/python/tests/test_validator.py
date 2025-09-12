"""Tests for token validator."""
import unittest
from unittest.mock import patch, Mock, AsyncMock, MagicMock
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError, DecodeError
from ark_sdk.auth.validator import TokenValidator
from ark_sdk.auth.config import AuthConfig
from ark_sdk.auth.exceptions import (
    TokenValidationError,
    ExpiredTokenError,
    InvalidTokenError,
    MissingTokenError
)


class TestTokenValidator(unittest.TestCase):
    """Test cases for TokenValidator class."""

    def setUp(self):
        """Set up test environment."""
        self.config = AuthConfig(
            jwt_algorithm="RS256",
            issuer="https://test.okta.com/oauth2/default",
            audience="okta-audience",
            jwks_url="https://test.okta.com/.well-known/jwks.json"
        )
        self.validator = TokenValidator(self.config)

    def test_init(self):
        """Test TokenValidator initialization."""
        self.assertEqual(self.validator.config, self.config)
        self.assertIsNone(self.validator._jwks_client)

    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_get_jwks_client_success(self, mock_jwks_client_class):
        """Test successful JWKS client creation."""
        mock_client = Mock()
        mock_jwks_client_class.return_value = mock_client
        
        result = self.validator._get_jwks_client()
        
        self.assertEqual(result, mock_client)
        mock_jwks_client_class.assert_called_once_with(self.config.jwks_url)

    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_get_jwks_client_no_url(self, mock_jwks_client_class):
        """Test JWKS client creation with no URL configured."""
        config = AuthConfig(jwks_url=None)
        validator = TokenValidator(config)
        
        result = validator._get_jwks_client()
        
        self.assertIsNone(result)
        mock_jwks_client_class.assert_not_called()

    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_get_jwks_client_caching(self, mock_jwks_client_class):
        """Test that JWKS client is cached after first creation."""
        mock_client = Mock()
        mock_jwks_client_class.return_value = mock_client
        
        # First call
        result1 = self.validator._get_jwks_client()
        # Second call
        result2 = self.validator._get_jwks_client()
        
        self.assertEqual(result1, result2)
        self.assertEqual(result1, mock_client)
        # Should only be called once due to caching
        mock_jwks_client_class.assert_called_once()

    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_get_jwks_client_exception(self, mock_jwks_client_class):
        """Test JWKS client creation with exception."""
        mock_jwks_client_class.side_effect = Exception("JWKS client creation failed")
        
        with self.assertRaises(TokenValidationError) as context:
            self.validator._get_jwks_client()
        
        self.assertIn("Failed to create JWKS client", str(context.exception))

    @patch('ark_sdk.auth.validator.decode')
    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_validate_token_success(self, mock_jwks_client_class, mock_decode):
        """Test successful token validation."""
        # Setup mocks
        mock_jwks_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_jwks_client
        
        mock_payload = {"sub": "test-user", "aud": "okta-audience", "iss": "https://test.okta.com/oauth2/default"}
        mock_decode.return_value = mock_payload
        
        # Test
        result = self.validator.validate_token("test-token")
        
        # Verify
        self.assertEqual(result, mock_payload)
        mock_jwks_client.get_signing_key_from_jwt.assert_called_once_with("test-token")
        mock_decode.assert_called_once_with(
            "test-token",
            "test-key",
            algorithms=["RS256"],
            audience="okta-audience",
            issuer="https://test.okta.com/oauth2/default",
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": True,
                "verify_iss": True,
            }
        )

    @patch('ark_sdk.auth.validator.decode')
    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_validate_token_fallback_to_jwt_config(self, mock_jwks_client_class, mock_decode):
        """Test token validation falls back to JWT config when OKTA is not set."""
        # Setup config without audience/issuer values
        config = AuthConfig(
            jwt_algorithm="RS256",
            audience="jwt-audience",
            issuer="jwt-issuer",
            jwks_url="https://test.okta.com/.well-known/jwks.json"
        )
        validator = TokenValidator(config)
        
        # Setup mocks
        mock_jwks_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_jwks_client
        
        mock_payload = {"sub": "test-user"}
        mock_decode.return_value = mock_payload
        
        # Test
        result = validator.validate_token("test-token")
        
        # Verify JWT values are used as fallback
        mock_decode.assert_called_once_with(
            "test-token",
            "test-key",
            algorithms=["RS256"],
            audience="jwt-audience",  # Should use JWT audience as fallback
            issuer="jwt-issuer",  # Should use JWT issuer as fallback
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": True,
                "verify_iss": True,
            }
        )

    @patch('ark_sdk.auth.validator.decode')
    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_validate_token_no_audience_issuer(self, mock_jwks_client_class, mock_decode):
        """Test token validation when no audience/issuer is configured."""
        # Setup config without audience/issuer
        config = AuthConfig(
            jwt_algorithm="RS256",
            audience=None,
            issuer=None,
            jwks_url="https://test.okta.com/.well-known/jwks.json"
        )
        validator = TokenValidator(config)
        
        # Setup mocks
        mock_jwks_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_jwks_client
        
        mock_payload = {"sub": "test-user"}
        mock_decode.return_value = mock_payload
        
        # Test
        result = validator.validate_token("test-token")
        
        # Verify audience/issuer verification is disabled
        mock_decode.assert_called_once_with(
            "test-token",
            "test-key",
            algorithms=["RS256"],
            audience=None,
            issuer=None,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": False,  # Should be False when no audience
                "verify_iss": False,  # Should be False when no issuer
            }
        )

    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_validate_token_no_jwks_url(self, mock_jwks_client_class):
        """Test token validation with no JWKS URL configured."""
        config = AuthConfig(jwks_url=None)
        validator = TokenValidator(config)
        
        with self.assertRaises(TokenValidationError) as context:
            validator.validate_token("test-token")
        
        self.assertIn("JWKS URL not configured", str(context.exception))

    @patch('ark_sdk.auth.validator.decode')
    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_validate_token_expired_signature(self, mock_jwks_client_class, mock_decode):
        """Test token validation with expired signature."""
        # Setup mocks
        mock_jwks_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_jwks_client
        
        mock_decode.side_effect = ExpiredSignatureError("Token has expired")
        
        with self.assertRaises(ExpiredTokenError) as context:
            self.validator.validate_token("expired-token")
        
        self.assertIn("Token has expired", str(context.exception))

    @patch('ark_sdk.auth.validator.decode')
    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_validate_token_invalid_token(self, mock_jwks_client_class, mock_decode):
        """Test token validation with invalid token."""
        # Setup mocks
        mock_jwks_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_jwks_client
        
        mock_decode.side_effect = InvalidTokenError("Invalid token")
        
        with self.assertRaises(InvalidTokenError) as context:
            self.validator.validate_token("invalid-token")
        
        self.assertIn("Invalid token", str(context.exception))

    @patch('ark_sdk.auth.validator.decode')
    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_validate_token_decode_error(self, mock_jwks_client_class, mock_decode):
        """Test token validation with decode error."""
        # Setup mocks
        mock_jwks_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_jwks_client
        
        mock_decode.side_effect = DecodeError("Token could not be decoded")
        
        with self.assertRaises(InvalidTokenError) as context:
            self.validator.validate_token("malformed-token")
        
        self.assertIn("Token could not be decoded", str(context.exception))

    @patch('ark_sdk.auth.validator.decode')
    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_validate_token_general_exception(self, mock_jwks_client_class, mock_decode):
        """Test token validation with general exception."""
        # Setup mocks
        mock_jwks_client = Mock()
        mock_signing_key = Mock()
        mock_signing_key.key = "test-key"
        mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_client_class.return_value = mock_jwks_client
        
        mock_decode.side_effect = Exception("Unexpected error")
        
        with self.assertRaises(TokenValidationError) as context:
            self.validator.validate_token("bad-token")
        
        self.assertIn("Token validation failed", str(context.exception))

    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_validate_token_jwks_client_exception(self, mock_jwks_client_class):
        """Test token validation when JWKS client raises exception."""
        mock_jwks_client_class.side_effect = Exception("JWKS client error")
        
        with self.assertRaises(TokenValidationError) as context:
            self.validator.validate_token("test-token")
        
        self.assertIn("Failed to create JWKS client", str(context.exception))

    @patch('ark_sdk.auth.validator.PyJWKClient')
    def test_validate_token_signing_key_exception(self, mock_jwks_client_class):
        """Test token validation when getting signing key raises exception."""
        # Setup mocks
        mock_jwks_client = Mock()
        mock_jwks_client.get_signing_key_from_jwt.side_effect = Exception("Signing key error")
        mock_jwks_client_class.return_value = mock_jwks_client
        
        with self.assertRaises(TokenValidationError) as context:
            self.validator.validate_token("test-token")
        
        self.assertIn("Token validation failed", str(context.exception))

    def test_validate_token_config_values(self):
        """Test that config values are set correctly."""
        # This test verifies the config values
        self.assertEqual(self.config.audience, "okta-audience")
        self.assertEqual(self.config.issuer, "https://test.okta.com/oauth2/default")
        self.assertEqual(self.config.jwks_url, "https://test.okta.com/.well-known/jwks.json")


if __name__ == '__main__':
    unittest.main()
