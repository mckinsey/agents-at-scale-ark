#!/bin/bash

# Enhanced script to create focused PRs for evaluation feature
set -e

QBAF_BRANCH="qbaf/feat/2418-introduce-evaluation-service"
BASE_BRANCH="main"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Creating Evaluation Feature PRs ===${NC}"
echo ""

# Create a helper function to extract files
extract_files() {
    local branch_name=$1
    local description=$2
    shift 2
    local patterns=("$@")
    
    echo -e "${YELLOW}Creating branch: $branch_name${NC}"
    echo "Description: $description"
    
    # Create new branch
    git checkout -B $branch_name $BASE_BRANCH 2>/dev/null
    
    # Collect all files matching patterns
    local files=()
    for pattern in "${patterns[@]}"; do
        while IFS= read -r file; do
            if [ -n "$file" ]; then
                files+=("$file")
            fi
        done < <(git diff --name-status $BASE_BRANCH $QBAF_BRANCH | grep -E "$pattern" | grep -v "^D" | cut -f2)
    done
    
    # Remove duplicates
    files=($(printf "%s\n" "${files[@]}" | sort -u))
    
    if [ ${#files[@]} -eq 0 ]; then
        echo -e "${RED}No files found for this PR${NC}"
        git checkout $BASE_BRANCH 2>/dev/null
        git branch -D $branch_name 2>/dev/null
        return 1
    fi
    
    echo "Found ${#files[@]} files to include"
    
    # Extract files from source branch
    for file in "${files[@]}"; do
        echo -n "  - $file"
        mkdir -p "$(dirname "$file")"
        if git show $QBAF_BRANCH:"$file" > "$file" 2>/dev/null; then
            git add "$file" 2>/dev/null
            echo " ✓"
        else
            echo " (skipped - not found)"
        fi
    done
    
    # Check if we have changes
    if git diff --cached --quiet; then
        echo -e "${RED}No changes staged${NC}"
        git checkout $BASE_BRANCH 2>/dev/null
        git branch -D $branch_name 2>/dev/null
        return 1
    fi
    
    echo -e "${GREEN}Branch created successfully with $(git diff --cached --numstat | wc -l) files${NC}"
    echo ""
    return 0
}

# Function to commit changes
commit_branch() {
    local branch_name=$1
    local commit_msg=$2
    
    if [ "$(git branch --show-current)" == "$branch_name" ]; then
        if ! git diff --cached --quiet; then
            git commit -m "$commit_msg"
            echo -e "${GREEN}Committed: $commit_msg${NC}"
        fi
    fi
}

# ====================
# PR 1: RBAC Configuration
# ====================
if extract_files "feat/eval-rbac" \
    "RBAC configuration for evaluation and evaluator resources" \
    "ark/config/rbac/ark_controller_role.yaml" \
    "ark/config/rbac/ark_tenant_role.yaml" \
    "ark/dist/chart/templates/rbac/ark_controller_role.yaml" \
    "ark/dist/chart/templates/rbac/ark_tenant_role.yaml"; then
    
    commit_branch "feat/eval-rbac" "feat: add RBAC permissions for evaluation and evaluator resources"
fi

# ====================
# PR 2: ARK Controller Core
# ====================
if extract_files "feat/eval-controller" \
    "Core ARK controller support for evaluation types" \
    "ark/api/v1alpha1/evaluation_types.go" \
    "ark/api/v1alpha1/evaluator_types.*go" \
    "ark/api/v1alpha1/zz_generated.deepcopy.go" \
    "ark/config/crd/bases/ark.mckinsey.com_evaluation" \
    "ark/config/crd/bases/ark.mckinsey.com_evaluator" \
    "ark/config/samples/.*evaluation.*yaml" \
    "ark/config/samples/.*evaluator.*yaml" \
    "ark/internal/controller/evaluation_controller" \
    "ark/internal/controller/evaluator_controller" \
    "ark/internal/genai/.*evaluation" \
    "ark/internal/webhook/.*/evaluation" \
    "ark/internal/webhook/.*/evaluator"; then
    
    commit_branch "feat/eval-controller" "feat: implement evaluation controller with direct, query, event, baseline, and batch support"
fi

# ====================
# PR 3: Evaluator LLM Service
# ====================
if extract_files "feat/eval-llm-service" \
    "Evaluator LLM service implementation" \
    "services/evaluator-llm/.*" \
    "lib/services/evaluator-llm.*mk"; then
    
    commit_branch "feat/eval-llm-service" "feat: add evaluator-llm service for AI-powered evaluation"
fi

# ====================
# PR 4: Evaluator Metric Service
# ====================
if extract_files "feat/eval-metric-service" \
    "Evaluator Metric service for performance and cost evaluation" \
    "services/evaluator-metric/.*" \
    "demo/evaluator-metric.*yaml"; then
    
    commit_branch "feat/eval-metric-service" "feat: add evaluator-metric service for performance and cost metrics"
fi

# ====================
# PR 5: ARK API Updates
# ====================
if extract_files "feat/eval-api" \
    "ARK API endpoints for evaluation management" \
    "services/ark-api/src/ark_api/api/v1/evaluation" \
    "services/ark-api/src/ark_api/api/v1/evaluator" \
    "services/ark-api/src/ark_api/models/evaluation" \
    "services/ark-api/src/ark_api/models/evaluator" \
    "services/ark-sdk-python/src/ark_sdk/.*evaluation" \
    "services/ark-sdk-python/src/ark_sdk/.*evaluator"; then
    
    commit_branch "feat/eval-api" "feat: add evaluation and evaluator endpoints to ARK API"
fi

# ====================
# PR 6: Dashboard UI
# ====================
if extract_files "feat/eval-dashboard" \
    "Dashboard UI for evaluation management" \
    "services/ark-dashboard/.*evaluation" \
    "services/ark-dashboard/.*evaluator" \
    "services/vnext-ui/.*evaluation" \
    "services/vnext-ui/.*evaluator"; then
    
    commit_branch "feat/eval-dashboard" "feat: add evaluation management UI to dashboard"
fi

# ====================
# PR 7: Fark CLI
# ====================
if extract_files "feat/eval-cli" \
    "Fark CLI commands for evaluation operations" \
    "tools/fark/cmd/fark/.*eval.*go" \
    "tools/fark/cmd/fark/batch.*go" \
    "services/arkpy/src/arkpy/.*evaluation" \
    "services/arkpy/src/arkpy/.*evaluator"; then
    
    commit_branch "feat/eval-cli" "feat: add evaluation commands to fark CLI"
fi

# ====================
# PR 8: Tests and Documentation
# ====================
if extract_files "feat/eval-tests-docs" \
    "Tests and documentation for evaluation feature" \
    "tests/evaluation-.*" \
    "tests/evaluator-.*" \
    "docs/.*evaluation" \
    "docs/.*evaluator" \
    "samples/evaluation.*" \
    "samples/evaluator.*"; then
    
    commit_branch "feat/eval-tests-docs" "test: add chainsaw tests and documentation for evaluations"
fi

# Summary
echo -e "${GREEN}=== PR Creation Summary ===${NC}"
echo ""
echo "Created branches:"
git branch | grep "feat/eval" | sed 's/^/  /'
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review each branch for completeness"
echo "2. Run tests on each branch"
echo "3. Push branches: git push origin feat/eval-<name>"
echo "4. Create PRs using GitHub CLI or web interface"
echo ""
echo "To create PRs with GitHub CLI:"
echo "  gh pr create --base main --head feat/eval-rbac --title \"feat: add RBAC for evaluations\" --body \"...\""