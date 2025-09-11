"""Tests for authentication dependencies."""
import unittest
from unittest.mock import patch, Mock, AsyncMock
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from ark_sdk.auth.dependencies import validate_token
from ark_sdk.auth.exceptions import TokenValidationError, ExpiredTokenError, AuthInvalidTokenError


class TestValidateToken(unittest.TestCase):
    """Test cases for validate_token dependency."""

    def setUp(self):
        """Set up test environment."""
        self.app = FastAPI()
        
        @self.app.get("/test")
        async def test_endpoint(token_data: dict = validate_token):
            return {"user": token_data}
        
        self.client = TestClient(self.app)

    def test_validate_token_success(self):
        """Test successful token validation."""
        mock_payload = {"sub": "test-user", "aud": "test-audience", "iss": "test-issuer"}
        
        with patch('ark_sdk.auth.dependencies.TokenValidator') as mock_validator_class:
            mock_validator = Mock()
            mock_validator.validate_token = AsyncMock(return_value=mock_payload)
            mock_validator_class.return_value = mock_validator
            
            response = self.client.get("/test", headers={"Authorization": "Bearer valid-token"})
            
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["user"], mock_payload)
            mock_validator.validate_token.assert_called_once_with("valid-token")

    def test_validate_token_missing_authorization_header(self):
        """Test token validation with missing Authorization header."""
        response = self.client.get("/test")
        
        self.assertEqual(response.status_code, 422)  # FastAPI validation error
        self.assertIn("Authorization", response.text)

    def test_validate_token_invalid_format(self):
        """Test token validation with invalid Authorization header format."""
        response = self.client.get("/test", headers={"Authorization": "InvalidFormat"})
        
        self.assertEqual(response.status_code, 422)  # FastAPI validation error

    def test_validate_token_expired(self):
        """Test token validation with expired token."""
        with patch('ark_sdk.auth.dependencies.TokenValidator') as mock_validator_class:
            mock_validator = Mock()
            mock_validator.validate_token = AsyncMock(side_effect=ExpiredTokenError("Token has expired"))
            mock_validator_class.return_value = mock_validator
            
            response = self.client.get("/test", headers={"Authorization": "Bearer expired-token"})
            
            self.assertEqual(response.status_code, 401)
            self.assertIn("Token has expired", response.text)

    def test_validate_token_invalid(self):
        """Test token validation with invalid token."""
        with patch('ark_sdk.auth.dependencies.TokenValidator') as mock_validator_class:
            mock_validator = Mock()
            mock_validator.validate_token = AsyncMock(side_effect=AuthInvalidTokenError("Invalid token"))
            mock_validator_class.return_value = mock_validator
            
            response = self.client.get("/test", headers={"Authorization": "Bearer invalid-token"})
            
            self.assertEqual(response.status_code, 401)
            self.assertIn("Invalid token", response.text)

    def test_validate_token_validation_error(self):
        """Test token validation with general validation error."""
        with patch('ark_sdk.auth.dependencies.TokenValidator') as mock_validator_class:
            mock_validator = Mock()
            mock_validator.validate_token = AsyncMock(side_effect=TokenValidationError("Validation failed"))
            mock_validator_class.return_value = mock_validator
            
            response = self.client.get("/test", headers={"Authorization": "Bearer bad-token"})
            
            self.assertEqual(response.status_code, 401)
            self.assertIn("Validation failed", response.text)

    def test_validate_token_unexpected_error(self):
        """Test token validation with unexpected error."""
        with patch('ark_sdk.auth.dependencies.TokenValidator') as mock_validator_class:
            mock_validator = Mock()
            mock_validator.validate_token = AsyncMock(side_effect=Exception("Unexpected error"))
            mock_validator_class.return_value = mock_validator
            
            response = self.client.get("/test", headers={"Authorization": "Bearer token"})
            
            self.assertEqual(response.status_code, 401)
            self.assertIn("Authentication failed", response.text)

    def test_validate_token_bearer_prefix_handling(self):
        """Test that Bearer prefix is properly handled."""
        mock_payload = {"sub": "test-user"}
        
        with patch('ark_sdk.auth.dependencies.TokenValidator') as mock_validator_class:
            mock_validator = Mock()
            mock_validator.validate_token = AsyncMock(return_value=mock_payload)
            mock_validator_class.return_value = mock_validator
            
            # Test with Bearer prefix
            response = self.client.get("/test", headers={"Authorization": "Bearer test-token"})
            self.assertEqual(response.status_code, 200)
            
            # Verify the token was passed without Bearer prefix
            mock_validator.validate_token.assert_called_with("test-token")

    def test_validate_token_case_insensitive_bearer(self):
        """Test that Bearer prefix is case insensitive."""
        mock_payload = {"sub": "test-user"}
        
        with patch('ark_sdk.auth.dependencies.TokenValidator') as mock_validator_class:
            mock_validator = Mock()
            mock_validator.validate_token = AsyncMock(return_value=mock_payload)
            mock_validator_class.return_value = mock_validator
            
            # Test with lowercase bearer
            response = self.client.get("/test", headers={"Authorization": "bearer test-token"})
            self.assertEqual(response.status_code, 200)
            
            # Verify the token was passed without bearer prefix
            mock_validator.validate_token.assert_called_with("test-token")

    def test_validate_token_whitespace_handling(self):
        """Test that whitespace around Bearer prefix is handled."""
        mock_payload = {"sub": "test-user"}
        
        with patch('ark_sdk.auth.dependencies.TokenValidator') as mock_validator_class:
            mock_validator = Mock()
            mock_validator.validate_token = AsyncMock(return_value=mock_payload)
            mock_validator_class.return_value = mock_validator
            
            # Test with extra whitespace
            response = self.client.get("/test", headers={"Authorization": "  Bearer   test-token  "})
            self.assertEqual(response.status_code, 200)
            
            # Verify the token was passed without extra whitespace
            mock_validator.validate_token.assert_called_with("test-token")

    def test_validate_token_empty_token(self):
        """Test token validation with empty token after Bearer prefix."""
        response = self.client.get("/test", headers={"Authorization": "Bearer "})
        
        self.assertEqual(response.status_code, 422)  # FastAPI validation error

    def test_validate_token_returns_dict(self):
        """Test that validate_token returns a dictionary."""
        mock_payload = {"sub": "user123", "aud": "audience", "iss": "issuer", "exp": 1234567890}
        
        with patch('ark_sdk.auth.dependencies.TokenValidator') as mock_validator_class:
            mock_validator = Mock()
            mock_validator.validate_token = AsyncMock(return_value=mock_payload)
            mock_validator_class.return_value = mock_validator
            
            response = self.client.get("/test", headers={"Authorization": "Bearer valid-token"})
            
            self.assertEqual(response.status_code, 200)
            result = response.json()["user"]
            self.assertIsInstance(result, dict)
            self.assertEqual(result["sub"], "user123")
            self.assertEqual(result["aud"], "audience")
            self.assertEqual(result["iss"], "issuer")
            self.assertEqual(result["exp"], 1234567890)


if __name__ == '__main__':
    unittest.main()
