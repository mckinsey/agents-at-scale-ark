# ARK Python Integration Tests

This directory contains Python-based integration tests for the ARK project, including complete workflow tests and UI tests using Playwright.

## Overview

The test suite consists of two main components:

1. **Workflow Tests** (`test_complete_ark_workflow.py`) - End-to-end tests for ARK installation, setup, and verification
2. **UI Tests** (`ui-tests/`) - Playwright-based tests for ARK Dashboard UI components

## What These Tests Cover

### Workflow Tests
- ARK CLI installation and setup
- OpenJDK dependency installation
- Virtual environment creation and management
- Kubernetes cluster verification
- ARK pod deployment and readiness
- Dashboard accessibility
- Complete ARK workflow validation

### UI Tests
- **Dashboard Tests**: Navigation, layout, and basic functionality
- **Agents Tests**: Creating, editing, and deleting agents
- **Models Tests**: Model configuration and management
- **Secrets Tests**: Secret creation and management
- **Teams Tests**: Team configuration and workflows
- **Tools Tests**: Tool integration and configuration

## Prerequisites

- Python 3.9+
- ARK CLI installed (for workflow tests)
- Kubernetes cluster (local or remote)
- kubectl configured
- Node.js and npm (for Playwright)
- Azure OpenAI or OpenAI credentials

## Setup

### 1. Install Dependencies

```bash
cd tests/pytest
pip install -r requirements.txt
```

### 2. Install Playwright Browsers

```bash
playwright install chromium
# Or for all browsers:
playwright install
```

### 3. Configure Environment Variables

For UI tests, copy the example environment file and configure your credentials:

```bash
cd ui-tests
cp env.example .env
```

Edit `.env` with your credentials:

```bash
# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_ENDPOINT=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# Azure OpenAI Configuration
AZURE_OPENAI_KEY=your-azure-openai-key-here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_MODEL=gpt-4o-mini
```

## Running Tests

### Run All Tests

```bash
pytest -sv
```

### Run Workflow Tests Only

```bash
pytest -sv test_complete_ark_workflow.py
```

### Run UI Tests Only

```bash
cd ui-tests
pytest -sv tests/
```

### Run Specific Test Markers

UI tests are organized with pytest markers:

```bash
# Run only agent tests
pytest -m agents

# Run only dashboard tests
pytest -m dashboard

# Run only model tests
pytest -m models

# Skip slow tests
pytest -m "not slow"
```

Available markers:
- `agents` - Agent-related UI tests
- `dashboard` - Dashboard UI tests  
- `models` - Model configuration tests
- `secrets` - Secret management tests
- `teams` - Team management tests
- `integration` - Integration tests
- `slow` - Slow-running tests

### Run with Visible Browser (Debugging)

```bash
pytest --visible -sv tests/
```

### Run with Specific Browser

```bash
pytest --browser-type=firefox -sv tests/
pytest --browser-type=webkit -sv tests/
```

### Skip ARK Installation (if already installed)

```bash
pytest --skip-install -sv
```

## Test Results

### Screenshots

Failed tests automatically capture screenshots saved to `ui-tests/screenshots/`.

### Test Reports

Pytest generates detailed reports showing:
- Test execution time
- Pass/fail status
- Error traces
- Slowest tests (top 10)

## Pytest Configuration

Test behavior is configured in `pytest.ini`:
- Verbose output (`-v`)
- Short traceback format
- Colored output
- Shows 10 slowest tests
- Test discovery patterns
- Marker definitions

## Troubleshooting

### Port Forwarding Issues

If port forwarding fails:
```bash
# Kill existing port forwards
lsof -ti :3274 | xargs kill -15
```

### ARK Pods Not Ready

Verify ARK installation:
```bash
ark status
kubectl get pods -n default
kubectl get pods -n ark-system
```

### Virtual Environment Issues

Clean and recreate:
```bash
rm -rf ark_test_venv
python -m venv ark_test_venv
source ark_test_venv/bin/activate
pip install -r requirements.txt
```

### Browser Issues

Reinstall Playwright browsers:
```bash
playwright install --force
```

## Contributing

When adding new tests:

1. Follow existing test structure and naming conventions
2. Use appropriate pytest markers
3. Add docstrings explaining test purpose
4. Use logging instead of print statements
5. Ensure tests are idempotent and can run independently
6. Clean up resources in teardown/fixtures

## Directory Structure

```
tests/pytest/
├── README.md                          # This file
├── pytest.ini                         # Pytest configuration
├── requirements.txt                   # Python dependencies
├── test_complete_ark_workflow.py      # Main workflow tests
└── ui-tests/                          # Playwright UI tests
    ├── env.example                    # Example environment file
    ├── conftest.py                    # Pytest fixtures and configuration
    ├── screenshots/                   # Failed test screenshots
    ├── pages/                         # Page Object Model classes
    │   ├── base_page.py
    │   ├── dashboard_page.py
    │   ├── agents_page.py
    │   ├── models_page.py
    │   ├── secrets_page.py
    │   ├── teams_page.py
    │   └── tools_page.py
    └── tests/                         # Test files
        ├── test_ark_dashboard.py
        ├── test_ark_agents.py
        ├── test_ark_models.py
        ├── test_ark_secrets.py
        └── test_ark_teams.py
```

## References

- [Pytest Documentation](https://docs.pytest.org/)
- [Playwright Python Documentation](https://playwright.dev/python/)
- [ARK Documentation](../../docs/)
