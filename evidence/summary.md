# Evaluation Cleanup Evidence

Date: 2026-03-09
Branch: cleanup/remove-evaluations

## 1. Evaluation CRDs Removed

No evaluation/evaluator CRDs remain in `ark/config/crd/bases/`:

```
ark.mckinsey.com_a2aservers.yaml
ark.mckinsey.com_a2atasks.yaml
ark.mckinsey.com_agents.yaml
ark.mckinsey.com_executionengines.yaml
ark.mckinsey.com_mcpservers.yaml
ark.mckinsey.com_memories.yaml
ark.mckinsey.com_models.yaml
ark.mckinsey.com_queries.yaml
ark.mckinsey.com_teams.yaml
ark.mckinsey.com_tools.yaml
```

## 2. Deleted Directories Confirmed Gone

- `services/ark-evaluator/` — deleted
- `samples/evaluator/` — deleted
- `samples/evaluator-selector/` — deleted
- `tools/ark-cli/src/commands/evaluation/` — deleted
- `tests/evaluation-*` and `tests/evaluator-*` — all deleted

## 3. ark-cli Tests: 452/452 passed

See `ark-cli-test-summary.txt` for details. All 49 test files pass.

## 4. Docs Build: Success

89 HTML files found, 86 pages indexed. No evaluation pages in output.
See `docs-build-results.txt`.

## 5. Dashboard Tests

96 test files fail due to pre-existing `@/` path resolution errors (unrelated to evaluation cleanup — affects agents, broker, tasks, workflow-templates pages equally). 8 test files pass with 100 assertions passing. These same failures exist on the main branch.

See `ark-dashboard-test-results.txt`.

## 6. Codebase Grep

Only 2 files contain "evaluation" or "evaluator" — both are benign:
- `docs/content/disclaimer.mdx` — generic "evaluation" in security context
- `docs/content/developer-guide/observability/index.mdx` — Langfuse description mentioning "evaluation"

See `codebase-grep-results.txt`.
