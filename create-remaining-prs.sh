#!/bin/bash

# Create remaining PR branches efficiently
set -e

QBAF_BRANCH="qbaf/feat/2418-introduce-evaluation-service"
BASE_BRANCH="main"

# Function to extract files for a branch
extract_files_for_branch() {
    local branch=$1
    local commit_msg=$2
    shift 2
    local patterns=("$@")
    
    echo "Creating branch: $branch"
    git checkout -B "$branch" "$BASE_BRANCH" 2>/dev/null
    
    # Extract all matching files
    for pattern in "${patterns[@]}"; do
        git diff --name-status "$BASE_BRANCH" "$QBAF_BRANCH" | \
        grep -E "$pattern" | grep -v "^D" | cut -f2 | \
        while read file; do
            if [ -n "$file" ]; then
                mkdir -p "$(dirname "$file")"
                git show "$QBAF_BRANCH:$file" > "$file" 2>/dev/null && git add "$file" 2>/dev/null || true
            fi
        done
    done
    
    # Commit if there are changes
    if ! git diff --cached --quiet; then
        git commit -m "$commit_msg" --quiet
        echo "✓ Branch created: $branch"
    else
        echo "✗ No changes for: $branch"
        git checkout "$BASE_BRANCH" 2>/dev/null
        git branch -D "$branch" 2>/dev/null || true
    fi
}

echo "Creating remaining evaluation PR branches..."

# PR 4: Evaluator Metric Service
extract_files_for_branch \
    "feat/AAS-2636-B-eval-metric-service" \
    "feat(services): add evaluator-metric service for performance metrics" \
    "services/evaluator-metric/" \
    "demo/evaluator-metric"

# PR 5: ARK API
extract_files_for_branch \
    "feat/AAS-2637-eval-api" \
    "feat(api): add evaluation endpoints to ARK API" \
    "services/ark-api/.*evaluation" \
    "services/ark-api/.*evaluator" \
    "services/ark-sdk-python/.*evaluation" \
    "services/ark-sdk-python/.*evaluator"

# PR 6: Dashboard
extract_files_for_branch \
    "feat/AAS-2638-eval-dashboard" \
    "feat(ui): add evaluation management UI to dashboard" \
    "services/ark-dashboard/.*evaluation" \
    "services/ark-dashboard/.*evaluator" \
    "services/vnext-ui/.*evaluation" \
    "services/vnext-ui/.*evaluator"

# PR 7: Fark CLI
extract_files_for_branch \
    "feat/AAS-2639-eval-cli" \
    "feat(cli): add evaluation commands to fark CLI" \
    "tools/fark/cmd/fark/.*eval" \
    "tools/fark/cmd/fark/batch" \
    "services/arkpy/.*evaluation" \
    "services/arkpy/.*evaluator"

# PR 8: Tests and Docs
extract_files_for_branch \
    "feat/AAS-2627-eval-tests-docs" \
    "test: add chainsaw tests and documentation for evaluations" \
    "tests/evaluation-" \
    "tests/evaluator-" \
    "docs/.*evaluation" \
    "docs/.*evaluator" \
    "samples/evaluation" \
    "samples/evaluator"

# Return to main branch
git checkout "$BASE_BRANCH" 2>/dev/null

echo ""
echo "=== Summary ==="
echo "Created branches:"
git branch | grep "feat/AAS" | sort