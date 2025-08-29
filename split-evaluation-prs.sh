#!/bin/bash

# Script to split evaluation feature into focused PRs
# Run from ark-oss repository

set -e

QBAF_BRANCH="qbaf/feat/2418-introduce-evaluation-service"
BASE_BRANCH="main"

echo "=== Splitting Evaluation Feature into Focused PRs ==="
echo ""

# Function to create a PR branch and cherry-pick specific files
create_pr_branch() {
    local pr_name=$1
    local pr_branch=$2
    shift 2
    local files=("$@")
    
    echo "Creating PR: $pr_name"
    echo "Branch: $pr_branch"
    echo "Files to include: ${#files[@]} files/patterns"
    
    # Create and checkout new branch from main
    git checkout -B $pr_branch $BASE_BRANCH
    
    # Cherry-pick files
    for pattern in "${files[@]}"; do
        echo "  Processing: $pattern"
        # Get list of files matching pattern
        git diff --name-status $BASE_BRANCH $QBAF_BRANCH | grep -E "$pattern" | grep -v "^D" | cut -f2 | while read file; do
            if [ -n "$file" ]; then
                # Check if file exists in the source branch
                if git show $QBAF_BRANCH:"$file" > /dev/null 2>&1; then
                    # Create directory if needed
                    mkdir -p "$(dirname "$file")"
                    # Copy file from source branch
                    git show $QBAF_BRANCH:"$file" > "$file"
                    git add "$file"
                fi
            fi
        done
    done
    
    # Check if we have changes to commit
    if git diff --cached --quiet; then
        echo "  No changes for this PR, skipping..."
        git checkout $BASE_BRANCH
        git branch -D $pr_branch
        return 1
    fi
    
    # Show what we're about to commit
    echo "  Changes staged:"
    git diff --cached --stat
    
    return 0
}

# PR 1: RBAC for evaluations
echo "========================================"
echo "PR 1: RBAC Configuration for Evaluations"
echo "========================================"
create_pr_branch "RBAC for Evaluations" "feat/eval-rbac" \
    "ark/config/rbac/.*evaluation" \
    "ark/config/rbac/.*evaluator" \
    "ark/dist/chart/templates/rbac/.*evaluation" \
    "ark/dist/chart/templates/rbac/.*evaluator" \
    "services/.*/chart/templates/.*rbac" \
    "services/.*/chart/templates/clusterrole" \
    "tests/.*/manifests/a00-rbac.yaml" || true

echo ""

# PR 2: ARK Controller - Core evaluation logic
echo "========================================"
echo "PR 2: ARK Controller Evaluation Support"
echo "========================================"
create_pr_branch "ARK Controller Evaluation" "feat/eval-controller" \
    "ark/api/v1alpha1/evaluation_types.go" \
    "ark/api/v1alpha1/evaluator_types.*.go" \
    "ark/api/v1alpha1/zz_generated.deepcopy.go" \
    "ark/config/crd/bases/ark.mckinsey.com_evaluation" \
    "ark/config/crd/bases/ark.mckinsey.com_evaluator" \
    "ark/config/samples/.*evaluation" \
    "ark/config/samples/.*evaluator" \
    "ark/internal/controller/evaluation_" \
    "ark/internal/controller/evaluator_" \
    "ark/internal/genai/.*evaluation" \
    "ark/internal/webhook/.*/evaluation" \
    "ark/internal/webhook/.*/evaluator" || true

echo ""

# PR 3: Evaluator LLM Service
echo "========================================"
echo "PR 3: Evaluator LLM Service"
echo "========================================"
create_pr_branch "Evaluator LLM Service" "feat/eval-llm-service" \
    "services/evaluator-llm/" \
    "lib/.*evaluator-llm" \
    "samples/.*evaluator.*llm" || true

echo ""

# PR 4: Evaluator Metric Service
echo "========================================"
echo "PR 4: Evaluator Metric Service"
echo "========================================"
create_pr_branch "Evaluator Metric Service" "feat/eval-metric-service" \
    "services/evaluator-metric/" \
    "demo/evaluator-metric" \
    "samples/.*evaluator.*metric" || true

echo ""

# PR 5: ARK API - Evaluation endpoints
echo "========================================"
echo "PR 5: ARK API Evaluation Endpoints"
echo "========================================"
create_pr_branch "ARK API Evaluations" "feat/eval-api" \
    "services/ark-api/.*evaluation" \
    "services/ark-api/.*evaluator" \
    "services/ark-sdk-python/.*evaluation" \
    "services/ark-sdk-python/.*evaluator" || true

echo ""

# PR 6: ARK Dashboard - Evaluation UI
echo "========================================"
echo "PR 6: ARK Dashboard Evaluation UI"
echo "========================================"
create_pr_branch "Dashboard Evaluation UI" "feat/eval-dashboard" \
    "services/ark-dashboard/.*evaluation" \
    "services/ark-dashboard/.*evaluator" \
    "services/vnext-ui/.*evaluation" \
    "services/vnext-ui/.*evaluator" || true

echo ""

# PR 7: Fark CLI - Evaluation commands
echo "========================================"
echo "PR 7: Fark CLI Evaluation Commands"
echo "========================================"
create_pr_branch "Fark CLI Evaluations" "feat/eval-cli" \
    "tools/fark/.*eval" \
    "tools/fark/.*batch" \
    "services/arkpy/.*evaluation" \
    "services/arkpy/.*evaluator" || true

echo ""

# PR 8: Tests and Documentation
echo "========================================"
echo "PR 8: Evaluation Tests and Documentation"
echo "========================================"
create_pr_branch "Evaluation Tests & Docs" "feat/eval-tests-docs" \
    "tests/evaluation-" \
    "tests/evaluator-" \
    "docs/.*evaluation" \
    "docs/.*evaluator" \
    "samples/evaluation" \
    "samples/evaluator" || true

echo ""
echo "=== Summary ==="
echo ""
echo "Next steps:"
echo "1. Review each branch and verify the changes"
echo "2. Test each PR independently"
echo "3. Commit and push branches"
echo "4. Create PRs with proper descriptions"
echo ""
echo "Current branches:"
git branch | grep feat/eval || echo "No evaluation branches created yet"