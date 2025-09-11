# Authentication Module Tests

This directory contains comprehensive tests for the `ark-sdk` authentication module, following standard Python package testing conventions.

## Test Structure

### Test Files
- **`test_config.py`** - Tests for `AuthConfig` class and environment variable loading
- **`test_exceptions.py`** - Tests for custom exception classes
- **`test_dependencies.py`** - Tests for FastAPI dependency injection
- **`test_validator.py`** - Tests for `TokenValidator` class and JWT validation logic
- **`test_integration.py`** - End-to-end tests for complete authentication flows

### Test Utilities
- **`conftest.py`** - Pytest configuration and shared fixtures
- **`README.md`** - This documentation file

## Running Tests

### Using pytest (Recommended)
```bash
# Run all tests
pytest

# Run specific test file
pytest test_config.py

# Run with coverage
pytest --cov=ark_sdk.auth --cov-report=html

# Run only unit tests
pytest -m unit

# Run only integration tests
pytest -m integration

# Run only fast tests (skip slow ones)
pytest -m "not slow"

# Run with verbose output
pytest -v

# Run specific test function
pytest test_config.py::TestAuthConfig::test_default_config
```

### Using unittest (Alternative)
```bash
# Run all tests
python -m unittest discover -s . -p 'test_*.py' -v

# Run specific test file
python -m unittest test_config.py

# Run with coverage
python -m coverage run -m unittest discover -s . -p 'test_*.py'
python -m coverage report
python -m coverage html
```

## Test Conventions

This test suite follows standard Python package testing conventions:

### File Naming
- ✅ Test files prefixed with `test_`
- ✅ Descriptive names indicating functionality
- ✅ Snake_case naming convention

### Function Naming
- ✅ Test functions prefixed with `test_`
- ✅ Descriptive names indicating test purpose
- ✅ Snake_case naming convention

### Class Naming
- ✅ Test classes prefixed with `Test`
- ✅ CamelCase naming convention
- ✅ Descriptive class names

### Directory Structure
- ✅ Tests in dedicated `tests/` directory
- ✅ Separate from main package code
- ✅ Proper `__init__.py` files

## Test Coverage

The test suite covers:

### Configuration (`test_config.py`)
- ✅ Default configuration values
- ✅ Environment variable loading
- ✅ Case-insensitive environment variables
- ✅ Empty string value handling

### Exceptions (`test_exceptions.py`)
- ✅ All custom exception classes
- ✅ Exception inheritance hierarchy
- ✅ Exception chaining
- ✅ Edge cases (None, empty messages)

### Dependencies (`test_dependencies.py`)
- ✅ Successful token validation
- ✅ Missing Authorization header
- ✅ Invalid header format
- ✅ Expired token handling
- ✅ Invalid token handling
- ✅ General validation errors
- ✅ Bearer prefix handling

### Validator (`test_validator.py`)
- ✅ JWKS client creation and caching
- ✅ Successful token validation
- ✅ Error handling (expired, invalid, decode errors)
- ✅ Different JWT algorithms
- ✅ Edge cases (no audience/issuer, missing JWKS URL)

### Integration (`test_integration.py`)
- ✅ Complete authentication flows
- ✅ Error handling in complete flow
- ✅ Different JWT algorithms

## Fixtures (pytest)

### Configuration Fixtures
- `auth_config` - Default configuration
- `auth_config_minimal` - Minimal configuration for edge cases

### Mock Fixtures
- `mock_jwks_client` - Mocked JWKS client
- `mock_token_payload` - Standard JWT payload
- `mock_pyjwt` - Mocked PyJWT library
- `mock_fastapi_dependency` - Mocked FastAPI dependency

### Utility Fixtures
- `clean_env` - Clean environment for isolated testing

## Test Markers

- `@pytest.mark.unit` - Unit tests
- `@pytest.mark.integration` - Integration tests
- `@pytest.mark.slow` - Slow-running tests

## Dependencies

The tests require:
- `pytest` (recommended)
- `pytest-cov` (for coverage)
- `unittest` (Python standard library)
- `fastapi` (for dependency testing)
- `jwt` (for JWT validation testing)
- `pyjwt-key-fetcher` (for JWKS testing)

## Best Practices

1. **Consistent Framework**: Uses pytest as the primary testing framework
2. **Isolation**: Each test is isolated and doesn't depend on others
3. **Mocking**: External dependencies are properly mocked
4. **Coverage**: All code paths are tested
5. **Edge Cases**: Boundary conditions and error cases are covered
6. **Documentation**: Tests are well-documented and self-explanatory
7. **Performance**: Tests run quickly and efficiently
8. **Conventions**: Follows standard Python package testing conventions

## Contributing

When adding new tests:
1. Follow the existing naming conventions
2. Add appropriate docstrings
3. Include both positive and negative test cases
4. Use descriptive test names
5. Add fixtures for reusable test data
6. Use pytest markers appropriately
7. Update this README if adding new test categories