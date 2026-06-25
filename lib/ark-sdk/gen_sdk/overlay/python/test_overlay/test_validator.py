"""Tests for token validator."""
import unittest
from unittest.mock import patch, Mock, AsyncMock, MagicMock
import jwt
from jwt.exceptions import InvalidTokenError as JWTInvalidTokenError, ExpiredSignatureError, InvalidAudienceError
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
    def test_get_jwks_force_refresh_bypasses_cache(self, mock_get):
        """force_refresh refetches even when the cache is warm."""
        mock_response = Mock()
        mock_response.json.return_value = {"keys": [{"kid": "k1"}]}
        mock_get.return_value = mock_response

        self.validator._get_jwks()
        self.validator._get_jwks(force_refresh=True)

        self.assertEqual(mock_get.call_count, 2)

    @patch('ark_sdk.auth.validator.requests.get')
    def test_get_jwks_refetches_after_ttl(self, mock_get):
        """The cache expires after its TTL and refetches."""
        mock_response = Mock()
        mock_response.json.return_value = {"keys": [{"kid": "k1"}]}
        mock_get.return_value = mock_response

        with patch('ark_sdk.auth.validator.time.monotonic', side_effect=[0.0, 10_000.0]):
            self.validator._get_jwks()
            self.validator._get_jwks()

        self.assertEqual(mock_get.call_count, 2)

    @patch.object(TokenValidator, '_jwk_to_pem', return_value="PEM")
    @patch.object(TokenValidator, '_fetch_jwks')
    @patch('ark_sdk.auth.validator.jwt.get_unverified_header')
    def test_get_signing_key_refetches_on_unknown_kid(self, mock_header, mock_fetch, _mock_pem):
        """A kid missing from the cached JWKS triggers a single refetch (key rotation)."""
        mock_header.return_value = {"kid": "rotated-kid"}
        # Stale cache lacks the kid; the refetch returns the rotated key.
        mock_fetch.side_effect = [
            {"keys": [{"kid": "old-kid"}]},
            {"keys": [{"kid": "rotated-kid"}]},
        ]

        result = self.validator._get_signing_key("token")

        self.assertEqual(result, "PEM")
        self.assertEqual(mock_fetch.call_count, 2)

    @patch.object(TokenValidator, '_fetch_jwks')
    @patch('ark_sdk.auth.validator.jwt.get_unverified_header')
    def test_get_signing_key_unknown_kid_after_refetch_raises(self, mock_header, mock_fetch):
        """A kid absent even after refetch raises rather than looping."""
        mock_header.return_value = {"kid": "ghost-kid"}
        mock_fetch.return_value = {"keys": [{"kid": "other-kid"}]}

        with self.assertRaises(TokenValidationError) as context:
            self.validator._get_signing_key("token")

        self.assertIn("Unable to find key with kid: ghost-kid", str(context.exception))

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
        mock_decode.side_effect = JWTInvalidTokenError("Invalid token")

        with self.assertRaises(InvalidTokenError) as context:
            self.validator.validate_token("invalid-token")

        self.assertIn("Invalid token", str(context.exception))

    @patch('ark_sdk.auth.validator.jwt.decode')
    @patch.object(TokenValidator, '_get_signing_key')
    def test_validate_token_decode_error(self, mock_get_signing_key, mock_decode):
        """Test token validation with JWT claims error."""
        # Setup mocks
        mock_get_signing_key.return_value = "test-key"
        mock_decode.side_effect = InvalidAudienceError("Invalid claims")

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


class TestJwksDiscoveryFromEnv(unittest.TestCase):
    """JWKS URL resolution from env vars + OIDC discovery (issue: hardcoded
    Keycloak path 404'd against Dex / Auth0 / Okta / etc.)."""

    @patch.dict('os.environ', {
        'OIDC_ISSUER_URL': 'https://dex.example.com',
        'OIDC_APPLICATION_ID': 'ark-dashboard',
    }, clear=True)
    @patch('ark_sdk.auth.validator.requests.get')
    def test_uses_oidc_discovery_for_jwks_url(self, mock_get):
        """jwks_uri comes from the well-known discovery doc, not a hardcoded path."""
        mock_get.return_value = Mock(
            json=lambda: {"jwks_uri": "https://dex.example.com/keys"},
            raise_for_status=lambda: None,
        )
        validator = TokenValidator()
        self.assertEqual(validator.config.jwks_url, 'https://dex.example.com/keys')
        mock_get.assert_called_once_with(
            'https://dex.example.com/.well-known/openid-configuration', timeout=10,
        )

    @patch.dict('os.environ', {
        'OIDC_ISSUER_URL': 'https://keycloak.example.com/realms/demo',
    }, clear=True)
    @patch('ark_sdk.auth.validator.requests.get')
    def test_discovery_handles_keycloak_path(self, mock_get):
        """Discovery still works for Keycloak — it advertises the same path the
        previous hardcode used."""
        mock_get.return_value = Mock(
            json=lambda: {
                "jwks_uri": "https://keycloak.example.com/realms/demo/protocol/openid-connect/certs",
            },
            raise_for_status=lambda: None,
        )
        validator = TokenValidator()
        self.assertEqual(
            validator.config.jwks_url,
            'https://keycloak.example.com/realms/demo/protocol/openid-connect/certs',
        )

    @patch.dict('os.environ', {
        'OIDC_ISSUER_URL': 'https://dex.example.com',
        'OIDC_JWKS_URL': 'https://override.example.com/jwks',
    }, clear=True)
    @patch('ark_sdk.auth.validator.requests.get')
    def test_oidc_jwks_url_env_override_wins(self, mock_get):
        """OIDC_JWKS_URL skips discovery entirely (escape hatch for air-gapped
        IdPs / unconventional layouts)."""
        validator = TokenValidator()
        self.assertEqual(validator.config.jwks_url, 'https://override.example.com/jwks')
        mock_get.assert_not_called()

    @patch.dict('os.environ', {
        'OIDC_ISSUER_URL': 'https://broken.example.com',
    }, clear=True)
    @patch('ark_sdk.auth.validator.requests.get')
    def test_discovery_failure_raises(self, mock_get):
        """A broken discovery endpoint raises at init time instead of
        silently leaving jwks_url unset."""
        import requests
        mock_get.side_effect = requests.RequestException('boom')
        with self.assertRaises(TokenValidationError) as ctx:
            TokenValidator()
        self.assertIn("OIDC discovery failed", str(ctx.exception))
        self.assertIn("OIDC_JWKS_URL", str(ctx.exception))

    @patch.dict('os.environ', {
        'OIDC_ISSUER_URL': 'https://noisy.example.com',
    }, clear=True)
    @patch('ark_sdk.auth.validator.requests.get')
    def test_discovery_missing_jwks_uri_raises(self, mock_get):
        """Discovery doc without a jwks_uri field raises with actionable message."""
        mock_get.return_value = Mock(
            json=lambda: {"issuer": "https://noisy.example.com"},
            raise_for_status=lambda: None,
        )
        with self.assertRaises(TokenValidationError) as ctx:
            TokenValidator()
        self.assertIn("did not include jwks_uri", str(ctx.exception))


if __name__ == '__main__':
    unittest.main()
