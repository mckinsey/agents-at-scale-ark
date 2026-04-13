# Full Regression Test Suite Skill

You are a QA Engineer running comprehensive regression tests on the Ark platform. Your role is to execute the complete UI test suite and report detailed results.

## Automatic Behavior

### When User Says "regression-full"

Execute the complete UI regression test suite:

1. **Verify environment setup**
   - Check dashboard accessibility (http://localhost:3274)
   - Verify `tests/pytest/ui-tests/.env` exists and contains `CICD_OPENAI_API_KEY` — **do not proceed if missing, do not accept shell exports as a substitute**
   - Ensure test dependencies are installed

2. **Execute full test suite**:
   ```bash
   cd tests/pytest/ui-tests
   source .venv/bin/activate
   pytest -sv tests/ --tb=short --durations=10
   ```

3. **Report comprehensive results**:
   - Total test count and execution time
   - Pass/fail breakdown by category
   - Detailed failure information with screenshots
   - Performance metrics (slowest tests)
   - Resource cleanup status

## Test Coverage

The full regression suite includes:

**Dashboard Tests** (`test_ark_dashboard.py`):
- Dashboard loading and responsiveness
- Navigation between tabs (Agents, Models, Queries, Tools, Teams)
- Page reload functionality
- UI element visibility

**Agent Tests** (`test_ark_agents.py`):
- Create agent with model
- Create agent with tools
- Delete agents with cleanup
- Agent table verification

**Model Tests** (`test_ark_models.py`):
- Create model with secret
- Model availability status
- Delete models with cleanup

**Secret Tests** (`test_ark_secrets.py`):
- Create secrets
- Delete secrets
- Secret visibility in table

**Team Tests** (`test_ark_teams.py`):
- Create team with agent members
- Team strategy configuration
- Delete teams with cleanup

**Smoke Test** (`test_smoke.py`):
- End-to-end validation
- Create one of each resource type
- Cleanup all resources

## Execution Flow

### 1. Pre-Test Environment Check

**MANDATORY**: Before running any tests, verify that `CICD_OPENAI_API_KEY` exists in `tests/pytest/ui-tests/.env`. Do NOT accept `export CICD_OPENAI_API_KEY=...` in the shell as an alternative — the key MUST be present in the `.env` file. If it is missing, stop and tell the user to add it to the `.env` file before proceeding.

```bash
# Check dashboard accessibility
curl -sf http://localhost:3274 > /dev/null || echo "Dashboard not accessible"

# Verify environment variables
cd tests/pytest/ui-tests
if [ ! -f .env ]; then
    echo "ERROR: Missing .env file at tests/pytest/ui-tests/.env"
    echo "Create it and add CICD_OPENAI_API_KEY=<your-key> before running tests."
    exit 1
fi

# Check for required API keys — STOP if missing, do not accept shell exports
if ! grep -q "CICD_OPENAI_API_KEY" .env; then
    echo "ERROR: CICD_OPENAI_API_KEY is not set in .env"
    echo "Add it to tests/pytest/ui-tests/.env before running tests."
    exit 1
fi
```

### 2. Run Full Test Suite

```bash
cd tests/pytest/ui-tests
source .venv/bin/activate

# Run all tests with verbose output
pytest -sv tests/ --tb=short --durations=10
```

### 3. Generate Test Report

After execution, provide structured report:

```markdown
## Full Regression Test Report

**Execution Time**: X minutes XX seconds
**Total Tests**: XX
**Passed**: ✅ XX
**Failed**: ❌ XX
**Skipped**: ⊘ XX

### Test Results by Category

#### Dashboard Tests (X/X passed)
- ✅ Dashboard loads correctly
- ✅ Navigation tabs work
- ✅ Page reload functions
- ✅ Responsive layout

#### Agent Tests (X/X passed)
- ✅ Create agent with model
- ✅ Create agent with tools
- ✅ Delete agents

#### Model Tests (X/X passed)
- ✅ Create model with secret
- ✅ Model becomes available
- ✅ Delete models

#### Secret Tests (X/X passed)
- ✅ Create secrets
- ✅ Delete secrets

#### Team Tests (X/X passed)
- ✅ Create team with members
- ✅ Delete teams

#### Smoke Test (X/X passed)
- ✅ End-to-end resource creation
- ✅ Resource cleanup

### Failed Tests

[If any tests failed, list them with details]

**Test**: test_name
**Error**: Error message
**Screenshot**: path/to/screenshot.png
**Action Required**: Specific fix recommendation

### Performance Metrics

**Slowest Tests**:
1. test_name (XX.XXs)
2. test_name (XX.XXs)
3. test_name (XX.XXs)

### Resource Cleanup Status

- ✅ All test resources cleaned up
- OR ⚠ Resources may still exist: [list]

### Overall Verdict

✅ **REGRESSION PASSED** - All tests passed successfully
OR
❌ **REGRESSION FAILED** - X tests failed, see details above
```

## When to Use Full Regression

**Use full regression when**:
- Before major releases
- After significant code changes
- Testing release candidates
- Weekly scheduled test runs
- After infrastructure changes
- Before production deployments

**Don't use full regression when**:
- Quick validation needed (use smoke test)
- Testing specific feature (use targeted regression)
- During active development (use targeted tests)

## Test Execution Options

### Run all tests
```bash
pytest -sv tests/
```

### Run with visible browser (debugging)
```bash
pytest -sv tests/ --visible
```

### Run with JUnit XML output
```bash
pytest -sv tests/ --junitxml=results.xml
```

### Run with HTML report
```bash
pytest -sv tests/ --html=report.html --self-contained-html
```

### Continue on failure
```bash
pytest -sv tests/ --continue-on-collection-errors
```

### Run specific test categories
```bash
pytest -sv tests/ -m "not slow"
```

## Expected Duration

**Target Duration**: 8-12 minutes
**Acceptable Duration**: 12-15 minutes
**Concerning Duration**: > 15 minutes

Breakdown:
- Dashboard tests: ~2 minutes
- Agent tests: ~3 minutes
- Model tests: ~2 minutes
- Secret tests: ~1 minute
- Team tests: ~2 minutes
- Smoke test: ~2-3 minutes

## Failure Analysis

### Common Failure Patterns

**Dashboard not accessible**:
```
Action: Start port-forward
Command: kubectl port-forward -n default svc/ark-dashboard 3274:3000
```

**Model creation failures**:
```
Possible causes:
- Invalid API credentials
- Network issues
- Model name not supported
Action: Verify .env file, test API key manually
```

**Resource cleanup failures**:
```
Possible causes:
- Resources in use
- Deletion not propagated
Action: Manual cleanup via kubectl or UI
```

**Selector not found errors**:
```
Possible causes:
- UI changes not reflected in page objects
- Timing issues
Action: Update selectors, increase wait times
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Full Regression Tests
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  regression-test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v3

      - name: Setup Ark
        run: make install

      - name: Run Full Regression
        run: |
          cd tests/pytest/ui-tests
          source .venv/bin/activate
          pytest -sv tests/ --junitxml=results.xml
        env:
          CICD_OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          CICD_OPENAI_BASE_URL: ${{ secrets.OPENAI_BASE_URL }}

      - name: Upload Test Results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: tests/pytest/ui-tests/results.xml

      - name: Upload Screenshots
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: test-screenshots
          path: tests/pytest/ui-tests/screenshots/
```

## Best Practices

1. **Run in clean environment**: Start with fresh cluster state
2. **Monitor resource usage**: Check for resource leaks
3. **Review screenshots**: Examine failure screenshots for UI issues
4. **Track trends**: Compare execution times over releases
5. **Isolate failures**: Re-run failed tests individually
6. **Update baselines**: Keep page objects current with UI changes
7. **Document flaky tests**: Track intermittent failures

## Comparison with Other Test Types

| Aspect | Full Regression | Smoke Test | Targeted Tests |
|--------|----------------|------------|----------------|
| **Duration** | 10-15 min | < 5 min | 2-5 min |
| **Coverage** | Complete | Basic | Feature-specific |
| **Resources** | All variations | 1 of each | Specific type |
| **When to run** | Before releases | After every change | During development |
| **Failure impact** | Block release | Block deployment | Fix specific issue |

## Example Output

```
============================= test session starts ==============================
collected 21 items

tests/test_ark_dashboard.py::TestArkDashboard::test_ark_dashboard_loads PASSED
tests/test_ark_dashboard.py::TestArkDashboard::test_dashboard_title_present PASSED
tests/test_ark_dashboard.py::TestArkDashboard::test_dashboard_tabs_navigation[Agents] PASSED
tests/test_ark_dashboard.py::TestArkDashboard::test_dashboard_tabs_navigation[Models] PASSED
tests/test_ark_dashboard.py::TestArkDashboard::test_dashboard_tabs_navigation[Queries] PASSED
tests/test_ark_dashboard.py::TestArkDashboard::test_dashboard_tabs_navigation[Tools] PASSED
tests/test_ark_dashboard.py::TestArkDashboard::test_dashboard_tabs_navigation[Teams] PASSED
tests/test_ark_agents.py::TestArkAgents::test_create_agent_with_model[agent] PASSED
tests/test_ark_agents.py::TestArkAgents::test_delete_agent[agent] PASSED
tests/test_ark_agents.py::TestArkAgents::test_create_agent_with_tools[agent-tool] PASSED
tests/test_ark_agents.py::TestArkAgents::test_delete_agent_with_tools[agent-tool] PASSED
tests/test_ark_models.py::TestArkModels::test_create_model_with_secret[openai] PASSED
tests/test_ark_models.py::TestArkModels::test_delete_model[openai] PASSED
tests/test_ark_secrets.py::TestArkSecrets::test_create_secret[openai] PASSED
tests/test_ark_secrets.py::TestArkSecrets::test_delete_secret[openai] PASSED
tests/test_ark_teams.py::TestArkTeams::test_create_team_with_members[team] PASSED
tests/test_ark_teams.py::TestArkTeams::test_delete_team[team] PASSED
tests/test_smoke.py::TestArkSmoke::test_smoke_create_resources[smoke] PASSED
tests/test_smoke.py::TestArkSmoke::test_smoke_cleanup_resources[smoke] PASSED

============================== 21 passed in 645.23s ============================

============================= slowest 10 durations =============================
156.23s call     tests/test_smoke.py::TestArkSmoke::test_smoke_create_resources[smoke]
89.45s call     tests/test_ark_teams.py::TestArkTeams::test_create_team_with_members[team]
76.32s call     tests/test_ark_agents.py::TestArkAgents::test_create_agent_with_tools[agent-tool]
65.18s call     tests/test_ark_agents.py::TestArkAgents::test_create_agent_with_model[agent]
54.67s call     tests/test_smoke.py::TestArkSmoke::test_smoke_cleanup_resources[smoke]
```

## Reporting Template

### Success Report

```markdown
✅ **FULL REGRESSION PASSED** (XX:XX)

**Test Summary**:
- Total: 21 tests
- Passed: ✅ 21
- Failed: ❌ 0
- Skipped: ⊘ 0

**Category Breakdown**:
- Dashboard: ✅ 7/7
- Agents: ✅ 4/4
- Models: ✅ 2/2
- Secrets: ✅ 2/2
- Teams: ✅ 2/2
- Smoke: ✅ 2/2

**Resource Cleanup**: ✅ Complete

**Performance**: Within acceptable range

**System Status**: Ready for release
```

### Failure Report

```markdown
❌ **FULL REGRESSION FAILED** (XX:XX)

**Test Summary**:
- Total: 21 tests
- Passed: ✅ 18
- Failed: ❌ 3
- Skipped: ⊘ 0

**Failed Tests**:

1. **test_create_agent_with_tools** - Agent creation failed
   - Error: Model not available
   - Screenshot: screenshots/test_create_agent_with_tools.png
   - Action: Verify model configuration

2. **test_delete_model** - Model deletion timeout
   - Error: Model still in table after delete
   - Screenshot: screenshots/test_delete_model.png
   - Action: Check finalizers and dependencies

3. **test_dashboard_tabs_navigation[Queries]** - Navigation failed
   - Error: Queries tab not found
   - Screenshot: screenshots/test_dashboard_tabs_navigation.png
   - Action: Check UI build and deployment

**Resource Cleanup**: ⚠ Partial - 2 agents may still exist

**Action Required**: Fix model availability and navigation issues before release

**Recommendation**: Do not proceed with release until failures resolved
```

This full regression skill provides comprehensive testing coverage for the entire Ark platform UI.
