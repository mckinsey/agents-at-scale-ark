"""Tests for token validator."""
import unittest
from unittest.mock import patch, Mock, AsyncMock, MagicMock
from jose import jwt
from jose.exceptions import JWTError, ExpiredSignatureError, JWTClaimsError
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
        self.assertIsNone(self.validator._jwks_cache)

    @patch('ark_sdk.auth.validator.requests.get')
    def test_fetch_jwks_success(self, mock_get):
        """Test successful JWKS fetching."""
        mock_response = Mock()
        mock_response.json.return_value = {"keys": [{"kid": "test-key-id", "kty": "RSA"}]}
        mock_get.return_value = mock_response
        
        result = self.validator._fetch_jwks()
        
        self.assertEqual(result, {"keys": [{"kid": "test-key-id", "kty": "RSA"}]})
        mock_get.assert_called_once_with(self.config.jwks_url, timeout=10)

    def test_fetch_jwks_no_url(self):
        """Test JWKS fetching with no URL configured."""
        config = AuthConfig(jwks_url=None)
        validator = TokenValidator(config)
        
        with self.assertRaises(TokenValidationError) as context:
            validator._fetch_jwks()
        
        self.assertIn("JWKS URL not configured", str(context.exception))

    @patch('ark_sdk.auth.validator.requests.get')
    def test_get_jwks_caching(self, mock_get):
        """Test that JWKS is cached after first fetch."""
        mock_response = Mock()
        mock_response.json.return_value = {"keys": [{"kid": "test-key-id"}]}
        mock_get.return_value = mock_response
        
        # First call
        result1 = self.validator._get_jwks()
        # Second call
        result2 = self.validator._get_jwks()
        
        self.assertEqual(result1, result2)
        # Should only be called once due to caching
        mock_get.assert_called_once()

    @patch('ark_sdk.auth.validator.requests.get')
    def test_fetch_jwks_exception(self, mock_get):
        """Test JWKS fetching with exception."""
        import requests
        mock_get.side_effect = requests.RequestException("Network error")
        
        with self.assertRaises(TokenValidationError) as context:
            self.validator._fetch_jwks()
        
        self.assertIn("Failed to fetch JWKS", str(context.exception))

    @patch('ark_sdk.auth.validator.jwt.decode')
    @patch.object(TokenValidator, '_get_signing_key')
    def test_validate_token_success(self, mock_get_signing_key, mock_decode):
        """Test successful token validation."""
        # Setup mocks
        mock_get_signing_key.return_value = "test-key"
        
        mock_payload = {"sub": "test-user", "aud": "okta-audience", "iss": "https://test.okta.com/oauth2/default"}
        mock_decode.return_value = mock_payload
        
        # Test
        result = self.validator.validate_token("test-token")
        
        # Verify
        self.assertEqual(result, mock_payload)
        mock_get_signing_key.assert_called_once_with("test-token")
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

    @patch('ark_sdk.auth.validator.jwt.decode')
    @patch.object(TokenValidator, '_get_signing_key')
    def test_validate_token_fallback_to_jwt_config(self, mock_get_signing_key, mock_decode):
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
        mock_get_signing_key.return_value = "test-key"
        
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

    @patch('ark_sdk.auth.validator.jwt.decode')
    @patch.object(TokenValidator, '_get_signing_key')
    def test_validate_token_no_audience_issuer(self, mock_get_signing_key, mock_decode):
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
        mock_get_signing_key.return_value = "test-key"
        
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

    @patch.object(TokenValidator, '_get_signing_key')
    def test_validate_token_no_jwks_url(self, mock_get_signing_key):
        """Test token validation with no JWKS URL configured."""
        config = AuthConfig(jwks_url=None)
        validator = TokenValidator(config)
        
        mock_get_signing_key.side_effect = TokenValidationError("JWKS URL not configured")
        
        with self.assertRaises(TokenValidationError) as context:
            validator.validate_token("test-token")
        
        self.assertIn("JWKS URL not configured", str(context.exception))

    @patch('ark_sdk.auth.validator.jwt.decode')
    @patch.object(TokenValidator, '_get_signing_key')
    def test_validate_token_expired_signature(self, mock_get_signing_key, mock_decode):
        """Test token validation with expired signature."""
        # Setup mocks
        mock_get_signing_key.return_value = "test-key"
        mock_decode.side_effect = ExpiredSignatureError("Token has expired")
        
        with self.assertRaises(ExpiredTokenError) as context:
            self.validator.validate_token("expired-token")
        
        self.assertIn("Token has expired", str(context.exception))

    @patch('ark_sdk.auth.validator.jwt.decode')
    @patch.object(TokenValidator, '_get_signing_key')
    def test_validate_token_invalid_token(self, mock_get_signing_key, mock_decode):
        """Test token validation with invalid token."""
        # Setup mocks
        mock_get_signing_key.return_value = "test-key"
        mock_decode.side_effect = JWTError("Invalid token")
        
        with self.assertRaises(InvalidTokenError) as context:
            self.validator.validate_token("invalid-token")
        
        self.assertIn("Invalid token", str(context.exception))

    @patch('ark_sdk.auth.validator.jwt.decode')
    @patch.object(TokenValidator, '_get_signing_key')
    def test_validate_token_decode_error(self, mock_get_signing_key, mock_decode):
        """Test token validation with JWT claims error."""
        # Setup mocks
        mock_get_signing_key.return_value = "test-key"
        mock_decode.side_effect = JWTClaimsError("Invalid claims")
        
        with self.assertRaises(InvalidTokenError) as context:
            self.validator.validate_token("malformed-token")
        
        self.assertIn("Invalid token claims", str(context.exception))

    @patch('ark_sdk.auth.validator.jwt.decode')
    @patch.object(TokenValidator, '_get_signing_key')
    def test_validate_token_general_exception(self, mock_get_signing_key, mock_decode):
        """Test token validation with general exception."""
        # Setup mocks
        mock_get_signing_key.return_value = "test-key"
        mock_decode.side_effect = Exception("Unexpected error")
        
        with self.assertRaises(TokenValidationError) as context:
            self.validator.validate_token("bad-token")
        
        self.assertIn("Token validation failed", str(context.exception))

    @patch.object(TokenValidator, '_get_signing_key')
    def test_validate_token_jwks_exception(self, mock_get_signing_key):
        """Test token validation when JWKS fetching raises exception."""
        mock_get_signing_key.side_effect = TokenValidationError("Failed to fetch JWKS")
        
        with self.assertRaises(TokenValidationError) as context:
            self.validator.validate_token("test-token")
        
        self.assertIn("Failed to fetch JWKS", str(context.exception))

    @patch.object(TokenValidator, '_get_signing_key')
    def test_validate_token_signing_key_exception(self, mock_get_signing_key):
        """Test token validation when getting signing key raises exception."""
        # Setup mocks
        mock_get_signing_key.side_effect = TokenValidationError("Unable to find key")
        
        with self.assertRaises(TokenValidationError) as context:
            self.validator.validate_token("test-token")
        
        self.assertIn("Unable to find key", str(context.exception))

    def test_validate_token_config_values(self):
        """Test that config values are set correctly."""
        # This test verifies the config values
        self.assertEqual(self.config.audience, "okta-audience")
        self.assertEqual(self.config.issuer, "https://test.okta.com/oauth2/default")
        self.assertEqual(self.config.jwks_url, "https://test.okta.com/.well-known/jwks.json")


if __name__ == '__main__':
    unittest.main()
