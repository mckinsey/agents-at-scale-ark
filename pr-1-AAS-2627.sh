#!/bin/bash
# Create PR for AAS-2627
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

@all-contributors please add for code"
