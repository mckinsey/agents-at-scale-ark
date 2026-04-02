"""Tests for authentication exceptions."""
import unittest
from ark_sdk.auth.exceptions import (
    AuthenticationError,
    TokenValidationError,
    ExpiredTokenError,
    InvalidTokenError,
    MissingTokenError,
    create_auth_exception
)


class TestAuthExceptions(unittest.TestCase):
    """Test cases for authentication exception classes."""

    def test_auth_error_basic(self):
        """Test basic AuthenticationError functionality."""
        error = AuthenticationError("Test error message")
        
        self.assertEqual(str(error), "Test error message")
        self.assertIsInstance(error, Exception)

    def test_auth_error_with_details(self):
        """Test AuthenticationError with additional details."""
        error = AuthenticationError("Test error", details={"key": "value"})
        
        self.assertEqual(str(error), "Test error")
        self.assertEqual(error.details, {"key": "value"})

    def test_token_validation_error(self):
        """Test TokenValidationError inheritance and functionality."""
        error = TokenValidationError("Token validation failed")
        
        self.assertEqual(str(error), "Token validation failed")
        self.assertIsInstance(error, AuthenticationError)

    def test_expired_token_error(self):
        """Test ExpiredTokenError inheritance and functionality."""
        error = ExpiredTokenError("Token has expired")
        
        self.assertEqual(str(error), "Token has expired")
        self.assertIsInstance(error, AuthenticationError)

    def test_auth_invalid_token_error(self):
        """Test InvalidTokenError inheritance and functionality."""
        error = InvalidTokenError("Invalid token format")
        
        self.assertEqual(str(error), "Invalid token format")
        self.assertIsInstance(error, AuthenticationError)

    def test_auth_configuration_error(self):
        """Test TokenValidationError inheritance and functionality."""
        error = TokenValidationError("Missing required configuration")
        
        self.assertEqual(str(error), "Missing required configuration")
        self.assertIsInstance(error, AuthenticationError)

    def test_jwks_error(self):
        """Test TokenValidationError inheritance and functionality."""
        error = TokenValidationError("Failed to fetch JWKS")
        
        self.assertEqual(str(error), "Failed to fetch JWKS")
        self.assertIsInstance(error, AuthenticationError)

    def test_exception_chaining(self):
        """Test exception chaining functionality."""
        original_error = ValueError("Original error")
        auth_error = TokenValidationError("Token validation failed")
        
        # Test that exceptions can be chained
        try:
            raise auth_error from original_error
        except TokenValidationError as e:
            self.assertEqual(str(e), "Token validation failed")
            self.assertIsInstance(e.__cause__, ValueError)

    def test_exception_with_none_message(self):
        """Test exception handling with None message."""
        error = AuthenticationError(None)
        
        # Should handle None message gracefully
        self.assertEqual(str(error), "None")

    def test_exception_with_empty_message(self):
        """Test exception handling with empty message."""
        error = AuthenticationError("")
        
        self.assertEqual(str(error), "")

    def test_exception_inheritance_hierarchy(self):
        """Test that all custom exceptions inherit from AuthenticationError."""
        exceptions = [
            TokenValidationError("test"),
            ExpiredTokenError("test"),
            InvalidTokenError("test"),
            TokenValidationError("test"),
            TokenValidationError("test")
        ]
        
        for exc in exceptions:
            self.assertIsInstance(exc, AuthenticationError)
            self.assertIsInstance(exc, Exception)