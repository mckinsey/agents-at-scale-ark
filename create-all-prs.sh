#!/bin/bash

# Script to create all evaluation PRs on GitHub
# Run after reviewing and pushing branches

echo "Creating Evaluation Feature PRs on GitHub"
echo "=========================================="
echo ""

# PR 1: RBAC - AAS-2627
echo "Creating PR 1: RBAC (AAS-2627)"
gh pr create \
  --base main \
  --head feat/AAS-2627-eval-rbac \
  --title "feat: add RBAC permissions for evaluation resources" \
  --body "## Summary
- Add RBAC permissions for evaluation and evaluator resources
- Update controller and tenant roles to include evaluation operations
- Essential foundation for evaluation feature security

## Related
- Part of evaluation feature implementation from McK-Internal/agents-at-scale#629
- Feature ID: AAS-2627

## Dependency
- None - can be merged first

@all-contributors please add for code"

# PR 2: Controller - AAS-2628
echo "Creating PR 2: Controller (AAS-2628)"
gh pr create \
  --base main \
  --head feat/AAS-2628-eval-controller \
  --title "feat(ark): implement evaluation controller with all evaluation types" \
  --body "## Summary
- Implement evaluation controller supporting direct, query, event, baseline, and batch modes
- Add evaluator controller for parameter management and overrides
- Core CRD definitions and webhook validation
- Fix critical annotation bug where query/event/baseline evaluations weren't receiving metadata

## Related
- Part of evaluation feature implementation from McK-Internal/agents-at-scale#629
- Feature ID: AAS-2628

## Dependency
- Depends on: #<PR1-NUMBER> (RBAC)

@all-contributors please add for code, bug"

# PR 3: Evaluator LLM - AAS-2636-A
echo "Creating PR 3: Evaluator LLM Service (AAS-2636-A)"
gh pr create \
  --base main \
  --head feat/AAS-2636-A-eval-llm-service \
  --title "feat(services): add evaluator-llm service for AI-powered evaluation" \
  --body "## Summary
- New Python service for LLM-based evaluation using LLM-as-a-Judge approach
- Supports all evaluation types (direct, query, event, baseline, batch)
- Implements parameter override system with inheritance hierarchy
- Includes comprehensive test coverage and provider pattern
- Evaluates responses on relevance, accuracy, completeness, clarity, and usefulness

## Related
- Part of evaluation feature implementation from McK-Internal/agents-at-scale#629
- Feature ID: AAS-2636-A

## Dependency
- Depends on: #<PR2-NUMBER> (Controller)

@all-contributors please add for code"

# PR 4: Evaluator Metric - AAS-2636-B
echo "Creating PR 4: Evaluator Metric Service (AAS-2636-B)"
gh pr create \
  --base main \
  --head feat/AAS-2636-B-eval-metric-service \
  --title "feat(services): add evaluator-metric service for performance metrics" \
  --body "## Summary
- New Python service for performance and cost metric evaluation
- Tracks execution time, token usage, and cost metrics
- Supports batch evaluation with concurrent processing
- Essential for evalOps and performance monitoring

## Related
- Part of evaluation feature implementation from McK-Internal/agents-at-scale#629
- Feature ID: AAS-2636-B

## Dependency
- Depends on: #<PR2-NUMBER> (Controller)
- Can be merged in parallel with PR3, PR5, PR6

@all-contributors please add for code"

# PR 5: API - AAS-2637
echo "Creating PR 5: ARK API (AAS-2637)"
gh pr create \
  --base main \
  --head feat/AAS-2637-eval-api \
  --title "feat(api): add evaluation endpoints to ARK API" \
  --body "## Summary
- REST API endpoints for evaluation CRUD operations
- Evaluator management and parameter override APIs
- SDK support for Python clients
- Metadata extraction and annotation processing utilities

## Related
- Part of evaluation feature implementation from McK-Internal/agents-at-scale#629
- Feature ID: AAS-2637

## Dependency
- Depends on: #<PR2-NUMBER> (Controller)
- Can be merged in parallel with PR3, PR4, PR6

@all-contributors please add for code"

# PR 6: Dashboard - AAS-2638
echo "Creating PR 6: Dashboard UI (AAS-2638)"
gh pr create \
  --base main \
  --head feat/AAS-2638-eval-dashboard \
  --title "feat(ui): add evaluation management UI to dashboard" \
  --body "## Summary
- Complete UI for creating and monitoring evaluations
- Metadata visualization with categorized breakdowns and timeline views
- Real-time evaluation status monitoring with WebSocket integration
- Advanced filtering and search capabilities for evaluation results

## Related
- Part of evaluation feature implementation from McK-Internal/agents-at-scale#629
- Feature ID: AAS-2638

## Dependency
- Depends on: #<PR2-NUMBER> (Controller)
- Can be merged in parallel with PR3, PR4, PR5

@all-contributors please add for code"

# PR 7: CLI - AAS-2639
echo "Creating PR 7: Fark CLI (AAS-2639)"
gh pr create \
  --base main \
  --head feat/AAS-2639-eval-cli \
  --title "feat(cli): add evaluation commands to fark CLI" \
  --body "## Summary
- Complete fark evaluation CRUD operations with batch support
- Progressive verbosity levels (-v, -vv, -vvv) for debugging
- Real-time evaluation monitoring with Kubernetes watch APIs
- Fix resource type parsing for plural forms (evaluations, evaluators)

## Related
- Part of evaluation feature implementation from McK-Internal/agents-at-scale#629
- Feature ID: AAS-2639

## Dependency
- Depends on: #<PR5-NUMBER> (API)

@all-contributors please add for code, bug"

# PR 8: Tests and Docs
echo "Creating PR 8: Tests and Documentation"
gh pr create \
  --base main \
  --head feat/AAS-2627-eval-tests-docs \
  --title "test: add chainsaw tests and documentation for evaluations" \
  --body "## Summary
- Chainsaw tests for all evaluation types
- Comprehensive documentation for evaluation concepts
- Sample configurations for common use cases
- Test coverage for parameter priority and batch processing

## Related
- Part of evaluation feature implementation from McK-Internal/agents-at-scale#629
- Supporting tests and documentation

## Dependency
- Can be merged anytime, ideally after other PRs

@all-contributors please add for test, doc"

echo ""
echo "=========================================="
echo "All PR creation commands executed!"
echo "Replace <PR-NUMBER> placeholders with actual PR numbers after creation."