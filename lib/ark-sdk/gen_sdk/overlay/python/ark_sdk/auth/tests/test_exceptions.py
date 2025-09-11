"""Tests for authentication exceptions."""
import pytest
from ark_sdk.auth.exceptions import (
    AuthError,
    TokenValidationError,
    ExpiredTokenError,
    AuthInvalidTokenError,
    AuthConfigurationError,
    JWKSError
)


class TestAuthExceptions:
    """Test cases for authentication exception classes."""

    def test_auth_error_basic(self):
        """Test basic AuthError functionality."""
        error = AuthError("Test error message")
        
        assert str(error) == "Test error message"
        assert isinstance(error, Exception)

    def test_auth_error_with_details(self):
        """Test AuthError with additional details."""
        error = AuthError("Test error", details={"key": "value"})
        
        assert str(error) == "Test error"
        assert error.details == {"key": "value"}

    def test_token_validation_error(self):
        """Test TokenValidationError inheritance and functionality."""
        error = TokenValidationError("Token validation failed")
        
        assert str(error) == "Token validation failed"
        assert isinstance(error, AuthError)

    def test_expired_token_error(self):
        """Test ExpiredTokenError inheritance and functionality."""
        error = ExpiredTokenError("Token has expired")
        
        assert str(error) == "Token has expired"
        assert isinstance(error, AuthError)

    def test_auth_invalid_token_error(self):
        """Test AuthInvalidTokenError inheritance and functionality."""
        error = AuthInvalidTokenError("Invalid token format")
        
        assert str(error) == "Invalid token format"
        assert isinstance(error, AuthError)

    def test_auth_configuration_error(self):
        """Test AuthConfigurationError inheritance and functionality."""
        error = AuthConfigurationError("Missing required configuration")
        
        assert str(error) == "Missing required configuration"
        assert isinstance(error, AuthError)

    def test_jwks_error(self):
        """Test JWKSError inheritance and functionality."""
        error = JWKSError("Failed to fetch JWKS")
        
        assert str(error) == "Failed to fetch JWKS"
        assert isinstance(error, AuthError)

    def test_exception_chaining(self):
        """Test exception chaining functionality."""
        original_error = ValueError("Original error")
        auth_error = TokenValidationError("Token validation failed")
        
        # Test that exceptions can be chained
        try:
            raise auth_error from original_error
        except TokenValidationError as e:
            assert str(e) == "Token validation failed"
            assert isinstance(e.__cause__, ValueError)

    def test_exception_with_none_message(self):
        """Test exception handling with None message."""
        error = AuthError(None)
        
        # Should handle None message gracefully
        assert str(error) == "None"

    def test_exception_with_empty_message(self):
        """Test exception handling with empty message."""
        error = AuthError("")
        
        assert str(error) == ""

    def test_exception_inheritance_hierarchy(self):
        """Test that all custom exceptions inherit from AuthError."""
        exceptions = [
            TokenValidationError("test"),
            ExpiredTokenError("test"),
            AuthInvalidTokenError("test"),
            AuthConfigurationError("test"),
            JWKSError("test")
        ]
        
        for exc in exceptions:
            assert isinstance(exc, AuthError)
            assert isinstance(exc, Exception)