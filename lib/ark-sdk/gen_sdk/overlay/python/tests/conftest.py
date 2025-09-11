"""Pytest configuration and fixtures for authentication tests."""
import os
import pytest
from unittest.mock import Mock, patch
from ark_sdk.auth.config import AuthConfig
from ark_sdk.auth.validator import TokenValidator


@pytest.fixture
def auth_config():
    """Provide a default AuthConfig for testing."""
    return AuthConfig(
        jwt_algorithm="RS256",
        audience="test-audience",
        issuer="https://test.okta.com/oauth2/default",
        jwks_url="https://test.okta.com/.well-known/jwks.json"
    )


@pytest.fixture
def auth_config_minimal():
    """Provide a minimal AuthConfig for testing edge cases."""
    return AuthConfig(
        jwt_algorithm="RS256",
        audience=None,
        issuer=None,
        jwks_url="https://test.okta.com/.well-known/jwks.json"
    )


@pytest.fixture
def mock_jwks_client():
    """Provide a mock JWKS client."""
    mock_client = Mock()
    mock_signing_key = Mock()
    mock_signing_key.key = "test-signing-key"
    mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
    return mock_client


@pytest.fixture
def mock_token_payload():
    """Provide a mock JWT token payload."""
    return {
        "sub": "test-user",
        "aud": "test-audience",
        "iss": "test-issuer",
        "exp": 9999999999,
        "iat": 1234567890,
        "jti": "test-jti"
    }


@pytest.fixture
def clean_env():
    """Clean environment variables for testing."""
    # Store original environment
    original_env = {}
    for key in list(os.environ.keys()):
        if key.startswith('ARK_'):
            original_env[key] = os.environ[key]
            del os.environ[key]
    
    yield
    
    # Restore original environment
    for key, value in original_env.items():
        os.environ[key] = value


@pytest.fixture
def mock_pyjwt():
    """Mock PyJWT library."""
    with patch('ark_sdk.auth.validator.decode') as mock_decode, \
         patch('ark_sdk.auth.validator.PyJWKClient') as mock_jwks_class:
        yield mock_decode, mock_jwks_class


@pytest.fixture
def mock_fastapi_dependency():
    """Mock FastAPI dependency injection."""
    with patch('ark_sdk.auth.dependencies.TokenValidator') as mock_validator_class:
        mock_validator = Mock()
        mock_validator.validate_token = Mock(return_value={"sub": "test-user"})
        mock_validator_class.return_value = mock_validator
        yield mock_validator_class, mock_validator


# Pytest configuration
def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
    config.addinivalue_line(
        "markers", "unit: mark test as unit test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )


# Test collection configuration
def pytest_collection_modifyitems(config, items):
    """Modify test collection to add markers based on test names."""
    for item in items:
        # Add integration marker to integration tests
        if "integration" in item.nodeid:
            item.add_marker(pytest.mark.integration)
        
        # Add unit marker to unit tests
        if "test_" in item.nodeid and "integration" not in item.nodeid:
            item.add_marker(pytest.mark.unit)
        
        # Add slow marker to tests that might be slow
        if any(keyword in item.nodeid.lower() for keyword in ["network", "jwt", "jwks"]):
            item.add_marker(pytest.mark.slow)