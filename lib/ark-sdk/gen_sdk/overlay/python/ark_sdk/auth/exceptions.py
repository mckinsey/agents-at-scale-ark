"""Authentication exceptions for ARK SDK."""

from fastapi import HTTPException


class AuthenticationError(Exception):
    """Base exception for authentication errors."""
    pass


class TokenValidationError(AuthenticationError):
    """Exception raised when token validation fails."""
    pass


class InvalidTokenError(TokenValidationError):
    """Exception raised when token is invalid."""
    pass


class ExpiredTokenError(TokenValidationError):
    """Exception raised when token has expired."""
    pass


class MissingTokenError(TokenValidationError):
    """Exception raised when token is missing."""
    pass


def create_auth_exception(message: str, status_code: int = 401) -> HTTPException:
    """Create an HTTPException for authentication errors."""
    return HTTPException(
        status_code=status_code,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )
