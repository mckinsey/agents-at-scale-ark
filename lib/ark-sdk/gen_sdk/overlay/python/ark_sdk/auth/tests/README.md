# Authentication Module Tests

This directory contains comprehensive tests for the `ark-sdk` authentication module, following the existing codebase testing conventions.

## Test Structure

### Test Files
- **`test_config.py`** - Tests for `AuthConfig` class and environment variable loading
- **`test_exceptions.py`** - Tests for custom exception classes

### Test Utilities
- **`README.md`** - This documentation file

## Running Tests

### Using unittest (Standard)
```bash
# Run all tests
python -m unittest discover -s . -p 'test_*.py' -v

# Run specific test file
python -m unittest test_config.py

# Run specific test class
python -m unittest test_config.TestAuthConfig

# Run specific test method
python -m unittest test_config.TestAuthConfig.test_default_config

# Run with coverage
python -m coverage run -m unittest discover -s . -p 'test_*.py'
python -m coverage report
python -m coverage html
```

### Using pytest (Alternative)
```bash
# Run all tests
pytest

# Run specific test file
pytest test_config.py

# Run with coverage
pytest --cov=ark_sdk.auth --cov-report=html

# Run with verbose output
pytest -v
```

## Test Conventions

This test suite follows the existing codebase testing conventions:

### File Naming
- ✅ Test files prefixed with `test_`
- ✅ Descriptive names indicating functionality
- ✅ Snake_case naming convention

### Function Naming
- ✅ Test functions prefixed with `test_`
- ✅ Descriptive names indicating test purpose
- ✅ Snake_case naming convention

### Class Naming
- ✅ Test classes inherit from `unittest.TestCase`
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

## Test Setup

Each test class uses `setUp()` and `tearDown()` methods for:
- Environment variable cleanup
- Mock setup and teardown
- Test data preparation

## Dependencies

The tests require:
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