#!/bin/bash
# Create PR for AAS-2628
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

@all-contributors please add for code"
