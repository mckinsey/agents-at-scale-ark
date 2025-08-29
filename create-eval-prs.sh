#!/bin/bash

# Script to create focused PRs for evaluation feature following CONTRIBUTING.md guidelines
# Follows conventional commit format for PR titles and commits

set -e

QBAF_BRANCH="qbaf/feat/2418-introduce-evaluation-service"
BASE_BRANCH="main"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Creating Evaluation Feature PRs ===${NC}"
echo -e "${BLUE}Following CONTRIBUTING.md conventional commit format${NC}"
echo ""

# Wait for feature IDs from user
echo -e "${YELLOW}Please provide feature IDs for branch naming.${NC}"
echo "Example format: feat/AAS-2418-eval-rbac"
echo ""

# Function to create a focused PR branch
create_pr() {
    local pr_number=$1
    local feature_id=$2
    local branch_suffix=$3
    local pr_title=$4
    local pr_description=$5
    local commit_type=$6
    local commit_scope=$7
    local commit_msg=$8
    shift 8
    local file_patterns=("$@")
    
    # Construct branch name
    local branch_name="${feature_id}-${branch_suffix}"
    
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}PR ${pr_number}: ${pr_title}${NC}"
    echo -e "Branch: ${BLUE}${branch_name}${NC}"
    echo -e "Commit: ${commit_type}${commit_scope}: ${commit_msg}"
    echo ""
    
    # Create and checkout new branch
    git checkout -B "$branch_name" "$BASE_BRANCH" 2>/dev/null
    
    # Collect files matching patterns
    local files=()
    local file_count=0
    
    for pattern in "${file_patterns[@]}"; do
        while IFS= read -r line; do
            local status=$(echo "$line" | cut -c1)
            local file=$(echo "$line" | cut -f2)
            
            if [ -n "$file" ]; then
                # Skip deleted files
                if [ "$status" != "D" ]; then
                    files+=("$file")
                    ((file_count++))
                fi
            fi
        done < <(git diff --name-status "$BASE_BRANCH" "$QBAF_BRANCH" | grep -E "$pattern" || true)
    done
    
    # Remove duplicates
    files=($(printf "%s\n" "${files[@]}" | sort -u))
    
    if [ ${#files[@]} -eq 0 ]; then
        echo -e "${RED}  ✗ No files found for this PR${NC}"
        git checkout "$BASE_BRANCH" 2>/dev/null
        git branch -D "$branch_name" 2>/dev/null || true
        echo ""
        return 1
    fi
    
    echo "  Found ${#files[@]} files to include:"
    
    # Extract files from source branch
    local extracted=0
    for file in "${files[@]}"; do
        printf "    • %-60s " "$file"
        
        # Create directory if needed
        mkdir -p "$(dirname "$file")"
        
        # Extract file from source branch
        if git show "$QBAF_BRANCH:$file" > "$file" 2>/dev/null; then
            git add "$file" 2>/dev/null
            echo -e "${GREEN}✓${NC}"
            ((extracted++))
        else
            echo -e "${YELLOW}(skipped)${NC}"
        fi
    done
    
    echo ""
    
    # Check if we have changes
    if [ $extracted -eq 0 ] || git diff --cached --quiet; then
        echo -e "${RED}  ✗ No changes staged${NC}"
        git checkout "$BASE_BRANCH" 2>/dev/null
        git branch -D "$branch_name" 2>/dev/null || true
        echo ""
        return 1
    fi
    
    # Create commit with conventional format
    local full_commit_msg="${commit_type}${commit_scope}: ${commit_msg}"
    git commit -m "$full_commit_msg" --quiet
    
    echo -e "${GREEN}  ✓ Created branch with ${extracted} files${NC}"
    echo -e "${GREEN}  ✓ Committed: ${full_commit_msg}${NC}"
    
    # Generate PR creation command
    echo ""
    echo -e "${BLUE}  PR Creation Command:${NC}"
    cat << EOF
    gh pr create \\
      --base main \\
      --head ${branch_name} \\
      --title "${commit_type}${commit_scope}: ${pr_title}" \\
      --body "## Summary
${pr_description}

## Related
- Part of evaluation feature implementation from #629
- Feature ID: ${feature_id}

@all-contributors please add for code"
EOF
    
    echo ""
    return 0
}

# Example PR creation with placeholder feature IDs
# Replace AAS-XXXX with actual feature IDs when provided

echo -e "${BLUE}Creating PRs in dependency order...${NC}"
echo ""

# PR 1: RBAC (Foundation - no dependencies)
create_pr 1 "feat/AAS-XXXX" "eval-rbac" \
    "add RBAC permissions for evaluation resources" \
    "- Add RBAC permissions for evaluation and evaluator resources
- Update controller and tenant roles to include evaluation operations
- Essential foundation for evaluation feature security" \
    "feat" "" \
    "add RBAC permissions for evaluation resources" \
    "ark/config/rbac/ark_controller_role.yaml" \
    "ark/config/rbac/ark_tenant_role.yaml" \
    "ark/dist/chart/templates/rbac/ark_controller_role.yaml" \
    "ark/dist/chart/templates/rbac/ark_tenant_role.yaml"

# PR 2: Controller (Core - depends on RBAC)
create_pr 2 "feat/AAS-XXXX" "eval-controller" \
    "implement evaluation controller with all evaluation types" \
    "- Implement evaluation controller supporting direct, query, event, baseline, and batch modes
- Add evaluator controller for parameter management and overrides
- Core CRD definitions and webhook validation
- Essential for all evaluation functionality" \
    "feat" "(ark)" \
    "implement evaluation controller with all evaluation types" \
    "ark/api/v1alpha1/evaluation_types.go" \
    "ark/api/v1alpha1/evaluator_types.*go" \
    "ark/config/crd/bases/ark.mckinsey.com_evaluation" \
    "ark/config/crd/bases/ark.mckinsey.com_evaluator" \
    "ark/internal/controller/evaluation_" \
    "ark/internal/controller/evaluator_controller.go" \
    "ark/internal/genai/.*evaluation" \
    "ark/internal/webhook/v1/evaluation" \
    "ark/internal/webhook/v1/evaluator" \
    "ark/api/v1alpha1/zz_generated.deepcopy.go"

# PR 3 & 4: Services (Can be parallel after controller)
create_pr 3 "feat/AAS-XXXX" "eval-llm-service" \
    "add evaluator-llm service for AI-powered evaluation" \
    "- New Python service for LLM-based evaluation
- Supports all evaluation types (direct, query, event, baseline, batch)
- Implements parameter override system
- Includes comprehensive test coverage" \
    "feat" "(services)" \
    "add evaluator-llm service for AI-powered evaluation" \
    "services/evaluator-llm/"

create_pr 4 "feat/AAS-XXXX" "eval-metric-service" \
    "add evaluator-metric service for performance metrics" \
    "- New Python service for performance and cost metric evaluation
- Tracks execution time, token usage, and cost metrics
- Supports batch evaluation with concurrent processing
- Essential for evalOps and performance monitoring" \
    "feat" "(services)" \
    "add evaluator-metric service for performance metrics" \
    "services/evaluator-metric/" \
    "demo/evaluator-metric"

# PR 5 & 6: API and UI (Can be parallel after controller)
create_pr 5 "feat/AAS-XXXX" "eval-api" \
    "add evaluation endpoints to ARK API" \
    "- REST API endpoints for evaluation CRUD operations
- Evaluator management and parameter override APIs
- SDK support for Python clients
- Metadata extraction and annotation processing" \
    "feat" "(api)" \
    "add evaluation endpoints to ARK API" \
    "services/ark-api/.*evaluation" \
    "services/ark-api/.*evaluator" \
    "services/ark-sdk-python/.*evaluation" \
    "services/ark-sdk-python/.*evaluator"

create_pr 6 "feat/AAS-XXXX" "eval-dashboard" \
    "add evaluation management UI to dashboard" \
    "- Complete UI for creating and monitoring evaluations
- Metadata visualization with categorized breakdowns
- Real-time evaluation status monitoring
- Advanced filtering and search capabilities" \
    "feat" "(ui)" \
    "add evaluation management UI to dashboard" \
    "services/ark-dashboard/.*evaluation" \
    "services/ark-dashboard/.*evaluator" \
    "services/vnext-ui/.*evaluation" \
    "services/vnext-ui/.*evaluator"

# PR 7: CLI (Depends on API)
create_pr 7 "feat/AAS-XXXX" "eval-cli" \
    "add evaluation commands to fark CLI" \
    "- Complete fark evaluation CRUD operations with batch support
- Progressive verbosity levels for debugging
- Real-time evaluation monitoring with watch capability
- Critical for evalOps workflows" \
    "feat" "(cli)" \
    "add evaluation commands to fark CLI" \
    "tools/fark/cmd/fark/.*eval" \
    "tools/fark/cmd/fark/batch" \
    "services/arkpy/.*evaluation" \
    "services/arkpy/.*evaluator"

# PR 8: Tests and Docs (Can be done last or in parallel)
create_pr 8 "feat/AAS-XXXX" "eval-tests-docs" \
    "add tests and documentation for evaluation feature" \
    "- Chainsaw tests for all evaluation types
- Comprehensive documentation for evaluation concepts
- Sample configurations for common use cases
- Test coverage for parameter priority and batch processing" \
    "test" "" \
    "add chainsaw tests and documentation for evaluations" \
    "tests/evaluation-" \
    "tests/evaluator-" \
    "docs/.*evaluation" \
    "docs/.*evaluator" \
    "samples/evaluation" \
    "samples/evaluator"

# Summary
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}=== Summary ===${NC}"
echo ""

# List created branches
echo -e "${BLUE}Created branches:${NC}"
git branch | grep -E "feat/AAS-.*eval" | sed 's/^/  /' || echo "  (waiting for feature IDs)"

echo ""
echo -e "${YELLOW}PR Dependencies & Parallelization:${NC}"
echo "  1. RBAC          → Can be merged first (no dependencies)"
echo "  2. Controller    → Depends on RBAC"
echo "  3-6. Services/API/UI → Can be done in parallel after Controller"
echo "  7. CLI           → Depends on API (PR 5)"
echo "  8. Tests/Docs    → Can be done anytime, ideally last"

echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Provide feature IDs to update branch names"
echo "  2. Review each branch for completeness"
echo "  3. Run make test on each branch"
echo "  4. Push branches: git push origin <branch-name>"
echo "  5. Create PRs using the generated commands"

echo ""
echo -e "${BLUE}Note: Following CONTRIBUTING.md guidelines:${NC}"
echo "  • Conventional commit format (feat/fix/test/docs)"
echo "  • Focused PRs with clear scope"
echo "  • Test-driven development approach"
echo "  • Proper contributor attribution"