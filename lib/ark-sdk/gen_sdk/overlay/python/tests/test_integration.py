"""Integration tests for authentication module."""
import os
import unittest
from unittest.mock import patch, Mock, AsyncMock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from ark_sdk.auth.config import AuthConfig
from ark_sdk.auth.dependencies import validate_token
from ark_sdk.auth.validator import TokenValidator
from ark_sdk.auth.exceptions import TokenValidationError, ExpiredTokenError, InvalidTokenError


class TestAuthIntegration(unittest.TestCase):
    """Integration tests for the complete authentication flow."""

    def setUp(self):
        """Set up test environment."""
        # Clear environment variables
        for key in list(os.environ.keys()):
            if key.startswith('ARK_'):
                del os.environ[key]

    def test_complete_auth_flow_success(self):
        """Test complete authentication flow with valid token."""
        # Setup test environment
        test_env = {
            'ARK_OKTA_ISSUER': 'https://test.okta.com/oauth2/default',
            'ARK_OKTA_AUDIENCE': 'test-audience',
            'ARK_JWKS_URL': 'https://test.okta.com/.well-known/jwks.json'
        }
        
        with patch.dict(os.environ, test_env):
            # Create FastAPI app with auth dependency
            app = FastAPI()
            
            @app.get("/protected")
            async def protected_endpoint(token_data: dict = validate_token):
                return {"user": token_data, "message": "Access granted"}
            
            client = TestClient(app)
            
            # Mock the token validation
            mock_payload = {
                "sub": "test-user",
                "aud": "test-audience",
                "iss": "https://test.okta.com/oauth2/default",
                "exp": 9999999999
            }
            
            with patch('ark_sdk.auth.dependencies.TokenValidator') as mock_validator_class:
                mock_validator = Mock()
                mock_validator.validate_token = AsyncMock(return_value=mock_payload)
                mock_validator_class.return_value = mock_validator
                
                # Test the endpoint
                response = client.get("/protected", headers={"Authorization": "Bearer valid-token"})
                
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["user"], mock_payload)
                self.assertEqual(data["message"], "Access granted")

    def test_auth_flow_with_config_priority(self):
        """Test that OKTA configuration takes priority over JWT configuration."""
        # Setup environment with both OKTA and JWT values
        test_env = {
            'ARK_OKTA_ISSUER': 'https://okta.com/oauth2/default',
            'ARK_OKTA_AUDIENCE': 'okta-audience',
            'ARK_JWT_ISSUER': 'https://jwt.com/oauth2/default',
            'ARK_JWT_AUDIENCE': 'jwt-audience',
            'ARK_JWKS_URL': 'https://okta.com/.well-known/jwks.json'
        }
        
        with patch.dict(os.environ, test_env):
            config = AuthConfig()
            
            # Verify OKTA values are used as primary
            self.assertEqual(config.okta_issuer, 'https://okta.com/oauth2/default')
            self.assertEqual(config.okta_audience, 'okta-audience')
            self.assertEqual(config.jwt_issuer, 'https://jwt.com/oauth2/default')
            self.assertEqual(config.jwt_audience, 'jwt-audience')
            
            # Test validator uses OKTA values
            validator = TokenValidator(config)
            
            with patch('ark_sdk.auth.validator.PyJWKClient') as mock_jwks_class:
                mock_jwks_client = Mock()
                mock_signing_key = Mock()
                mock_signing_key.key = "test-key"
                mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key
                mock_jwks_class.return_value = mock_jwks_client
                
                with patch('ark_sdk.auth.validator.decode') as mock_decode:
                    mock_decode.return_value = {"sub": "test-user"}
                    
                    validator.validate_token("test-token")
                    
                    # Verify OKTA values were used, not JWT values
                    mock_decode.assert_called_once()
                    call_args = mock_decode.call_args
                    self.assertEqual(call_args[1]['audience'], 'okta-audience')
                    self.assertEqual(call_args[1]['issuer'], 'https://okta.com/oauth2/default')

    def test_auth_flow_fallback_to_jwt(self):
        """Test that JWT configuration is used as fallback when OKTA is not set."""
        # Setup environment with only JWT values
        test_env = {
            'ARK_JWT_ISSUER': 'https://jwt.com/oauth2/default',
            'ARK_JWT_AUDIENCE': 'jwt-audience',
            'ARK_JWKS_URL': 'https://jwt.com/.well-known/jwks.json'
        }
        
        with patch.dict(os.environ, test_env):
            config = AuthConfig()
            
            # Verify JWT values are used as fallback
            self.assertIsNone(config.okta_issuer)
            self.assertIsNone(config.okta_audience)
            self.assertEqual(config.jwt_issuer, 'https://jwt.com/oauth2/default')
            self.assertEqual(config.jwt_audience, 'jwt-audience')
            
            # Test validator uses JWT values
            validator = TokenValidator(config)
            
            with patch('ark_sdk.auth.validator.PyJWKClient') as mock_jwks_class:
                mock_jwks_client = Mock()
                mock_signing_key = Mock()
                mock_signing_key.key = "test-key"
                mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key
                mock_jwks_class.return_value = mock_jwks_client
                
                with patch('ark_sdk.auth.validator.decode') as mock_decode:
                    mock_decode.return_value = {"sub": "test-user"}
                    
                    validator.validate_token("test-token")
                    
                    # Verify JWT values were used as fallback
                    mock_decode.assert_called_once()
                    call_args = mock_decode.call_args
                    self.assertEqual(call_args[1]['audience'], 'jwt-audience')
                    self.assertEqual(call_args[1]['issuer'], 'https://jwt.com/oauth2/default')

    def test_auth_flow_error_handling(self):
        """Test error handling in complete authentication flow."""
        app = FastAPI()
        
        @app.get("/protected")
        async def protected_endpoint(token_data: dict = validate_token):
            return {"user": token_data}
        
        client = TestClient(app)
        
        # Test various error scenarios
        test_cases = [
            {
                "name": "missing_authorization_header",
                "headers": {},
                "expected_status": 422
            },
            {
                "name": "invalid_authorization_format",
                "headers": {"Authorization": "InvalidFormat"},
                "expected_status": 422
            },
            {
                "name": "expired_token",
                "headers": {"Authorization": "Bearer expired-token"},
                "expected_status": 401,
                "mock_side_effect": ExpiredTokenError("Token has expired")
            },
            {
                "name": "invalid_token",
                "headers": {"Authorization": "Bearer invalid-token"},
                "expected_status": 401,
                "mock_side_effect": InvalidTokenError("Invalid token")
            },
            {
                "name": "validation_error",
                "headers": {"Authorization": "Bearer bad-token"},
                "expected_status": 401,
                "mock_side_effect": TokenValidationError("Validation failed")
            }
        ]
        
        for test_case in test_cases:
            with self.subTest(test_case=test_case["name"]):
                with patch('ark_sdk.auth.dependencies.TokenValidator') as mock_validator_class:
                    mock_validator = Mock()
                    if "mock_side_effect" in test_case:
                        mock_validator.validate_token = AsyncMock(side_effect=test_case["mock_side_effect"])
                    else:
                        mock_validator.validate_token = AsyncMock(return_value={"sub": "test-user"})
                    mock_validator_class.return_value = mock_validator
                    
                    response = client.get("/protected", headers=test_case["headers"])
                    self.assertEqual(response.status_code, test_case["expected_status"])

    def test_auth_flow_with_different_algorithms(self):
        """Test authentication flow with different JWT algorithms."""
        algorithms = ["RS256", "HS256", "ES256"]
        
        for algorithm in algorithms:
            with self.subTest(algorithm=algorithm):
                test_env = {
                    'ARK_JWT_ALGORITHM': algorithm,
                    'ARK_JWKS_URL': 'https://test.com/.well-known/jwks.json'
                }
                
                with patch.dict(os.environ, test_env):
                    config = AuthConfig()
                    self.assertEqual(config.jwt_algorithm, algorithm)
                    
                    validator = TokenValidator(config)
                    
                    with patch('ark_sdk.auth.validator.PyJWKClient') as mock_jwks_class:
                        mock_jwks_client = Mock()
                        mock_signing_key = Mock()
                        mock_signing_key.key = "test-key"
                        mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key
                        mock_jwks_class.return_value = mock_jwks_client
                        
                        with patch('ark_sdk.auth.validator.decode') as mock_decode:
                            mock_decode.return_value = {"sub": "test-user"}
                            
                            validator.validate_token("test-token")
                            
                            # Verify the correct algorithm was used
                            mock_decode.assert_called_once()
                            call_args = mock_decode.call_args
                            self.assertEqual(call_args[1]['algorithms'], [algorithm])

    def test_auth_flow_with_retries(self):
        """Test authentication flow with retry mechanism."""
        test_env = {
            'ARK_TOKEN_VALIDATION_RETRIES': '2',
            'ARK_JWKS_URL': 'https://test.com/.well-known/jwks.json'
        }
        
        with patch.dict(os.environ, test_env):
            config = AuthConfig()
            self.assertEqual(config.token_validation_retries, 2)
            
            # Note: The retry mechanism would need to be implemented in the validator
            # This test verifies the configuration is properly loaded
            validator = TokenValidator(config)
            self.assertEqual(validator.config.token_validation_retries, 2)


if __name__ == '__main__':
    unittest.main()
