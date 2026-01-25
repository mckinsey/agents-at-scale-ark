# Code Refactor Sample

An agent that refactors code based on instructions, validates changes by running tests, and creates pull requests.

## What It Does

1. Clones the repository
2. Creates a refactor branch
3. Performs the requested refactoring
4. Runs the test suite to validate changes
5. Creates a PR only if tests pass

## Key Feature: Test Validation

This sample demonstrates **test validation** - the agent runs the project's test suite after refactoring. The PR is only created if tests pass, ensuring the refactoring doesn't break existing functionality.

```yaml
critic:
  inline:
    runTests: true
    testCommand: "npm test"  # or pytest, go test, etc.
    testTimeout: 300
```

## Files

- `agent.yaml` - Refactoring agent with code improvement expertise
- `execution-profile.yaml` - Workflow with test validation before PR
- `query.yaml` - Example query for a refactoring task

## Usage

```bash
# Apply the resources
kubectl apply -f . -n your-namespace

# Edit query.yaml with your refactoring task, then apply
kubectl apply -f query.yaml -n your-namespace

# Watch the result
kubectl get queries -n your-namespace -w
```

## Configuration

### Required Secrets

```bash
# GitHub token with repo scope
kubectl create secret generic github-creds \
  --from-literal=token=$GITHUB_TOKEN

# SSH key for git operations
kubectl create secret generic git-ssh \
  --from-file=ssh-privatekey=$HOME/.ssh/id_ed25519
```

### Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `repo_url` | Repository SSH URL | `git@github.com:org/repo.git` |
| `refactor_scope` | Files/modules to refactor | `src/utils/` |
| `refactor_goal` | What to improve | `Extract common validation logic...` |
| `test_command` | How to run tests | `npm test` |

## Test Configuration

### Auto-detect Tests

If you don't specify `testCommand`, the executor tries common commands:
- `pytest` for Python
- `npm test` for Node.js
- `go test ./...` for Go
- `make test` if Makefile exists

### Custom Test Command

Specify exactly how to run tests:

```yaml
inline:
  runTests: true
  testCommand: "npm run test:unit && npm run lint"
  testTimeout: 600  # 10 minutes
```

## Customization

### Refactoring Focus

Edit `agent.yaml` to focus on specific improvements:

```yaml
prompt: |
  Focus on:
  - Reducing code duplication (DRY principle)
  - Improving function/class naming
  - Breaking down large functions
  - Adding missing error handling
```

### Skip Tests (Not Recommended)

Disable test validation for quick iterations:

```yaml
critic:
  inline:
    runTests: false
```
