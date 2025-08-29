#!/bin/bash

# Script to create focused PRs for evaluation feature with actual feature IDs
# Following CONTRIBUTING.md conventional commit format

set -e

QBAF_BRANCH="qbaf/feat/2418-introduce-evaluation-service"
BASE_BRANCH="main"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Creating Evaluation Feature PRs with Feature IDs ===${NC}"
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
    local branch_name="feat/${feature_id}-${branch_suffix}"
    
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}PR ${pr_number}: ${feature_id} - ${pr_title}${NC}"
    echo -e "Branch: ${BLUE}${branch_name}${NC}"
    echo ""
    
    # Create and checkout new branch
    git checkout -B "$branch_name" "$BASE_BRANCH" 2>/dev/null
    
    # Collect files matching patterns
    local files=()
    
    for pattern in "${file_patterns[@]}"; do
        while IFS= read -r line; do
            local status=$(echo "$line" | cut -c1)
            local file=$(echo "$line" | cut -f2)
            
            if [ -n "$file" ] && [ "$status" != "D" ]; then
                files+=("$file")
            fi
        done < <(git diff --name-status "$BASE_BRANCH" "$QBAF_BRANCH" | grep -E "$pattern" 2>/dev/null || true)
    done
    
    # Remove duplicates
    files=($(printf "%s\n" "${files[@]}" | sort -u))
    
    if [ ${#files[@]} -eq 0 ]; then
        echo -e "${RED}  ✗ No files found for this PR${NC}"
        git checkout "$BASE_BRANCH" 2>/dev/null
        git branch -D "$branch_name" 2>/dev/null || true
        return 1
    fi
    
    echo "  Extracting ${#files[@]} files..."
    
    # Extract files
    local extracted=0
    for file in "${files[@]}"; do
        mkdir -p "$(dirname "$file")"
        if git show "$QBAF_BRANCH:$file" > "$file" 2>/dev/null; then
            git add "$file" 2>/dev/null
            ((extracted++))
        fi
    done
    
    if [ $extracted -eq 0 ] || git diff --cached --quiet; then
        echo -e "${RED}  ✗ No changes staged${NC}"
        git checkout "$BASE_BRANCH" 2>/dev/null
        git branch -D "$branch_name" 2>/dev/null || true
        return 1
    fi
    
    # Commit with conventional format
    local full_commit_msg="${commit_type}${commit_scope}: ${commit_msg}"
    git commit -m "$full_commit_msg" --quiet
    
    echo -e "${GREEN}  ✓ Created branch with ${extracted} files${NC}"
    echo -e "${GREEN}  ✓ Commit: ${full_commit_msg}${NC}"
    
    # Save PR command
    cat > "pr-${pr_number}-${feature_id}.sh" << EOF
#!/bin/bash
# Create PR for ${feature_id}
gh pr create \\
  --base main \\
  --head ${branch_name} \\
  --title "${commit_type}${commit_scope}: ${pr_title}" \\
  --body "## Summary
${pr_description}

## Related
- Part of evaluation feature implementation from McK-Internal/agents-at-scale#629
- Feature ID: ${feature_id}

@all-contributors please add for code"
EOF
    chmod +x "pr-${pr_number}-${feature_id}.sh"
    echo -e "${BLUE}  ✓ PR command saved to: pr-${pr_number}-${feature_id}.sh${NC}"
    echo ""
    
    return 0
}

# Create PRs with actual feature IDs
echo -e "${BLUE}Creating branches in dependency order...${NC}"
echo ""

# PR 1: RBAC - AAS-2627
create_pr 1 "AAS-2627" "eval-rbac" \
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

# PR 2: Controller - AAS-2628
create_pr 2 "AAS-2628" "eval-controller" \
    "implement evaluation controller with all evaluation types" \
    "- Implement evaluation controller supporting direct, query, event, baseline, and batch modes
- Add evaluator controller for parameter management and overrides
- Core CRD definitions and webhook validation
- Fix critical annotation bug where query/event/baseline evaluations weren't receiving metadata" \
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

# PR 3: Evaluator LLM - AAS-2636-A
create_pr 3 "AAS-2636-A" "eval-llm-service" \
    "add evaluator-llm service for AI-powered evaluation" \
    "- New Python service for LLM-based evaluation
- Supports all evaluation types (direct, query, event, baseline, batch)
- Implements parameter override system with inheritance hierarchy
- Includes comprehensive test coverage and provider pattern" \
    "feat" "(services)" \
    "add evaluator-llm service for AI-powered evaluation" \
    "services/evaluator-llm/"

# PR 4: Evaluator Metric - AAS-2636-B
create_pr 4 "AAS-2636-B" "eval-metric-service" \
    "add evaluator-metric service for performance metrics" \
    "- New Python service for performance and cost metric evaluation
- Tracks execution time, token usage, and cost metrics
- Supports batch evaluation with concurrent processing
- Essential for evalOps and performance monitoring" \
    "feat" "(services)" \
    "add evaluator-metric service for performance metrics" \
    "services/evaluator-metric/" \
    "demo/evaluator-metric"

# PR 5: API - AAS-2637
create_pr 5 "AAS-2637" "eval-api" \
    "add evaluation endpoints to ARK API" \
    "- REST API endpoints for evaluation CRUD operations
- Evaluator management and parameter override APIs
- SDK support for Python clients
- Metadata extraction and annotation processing utilities" \
    "feat" "(api)" \
    "add evaluation endpoints to ARK API" \
    "services/ark-api/.*evaluation" \
    "services/ark-api/.*evaluator" \
    "services/ark-sdk-python/.*evaluation" \
    "services/ark-sdk-python/.*evaluator"

# PR 6: Dashboard - AAS-2638
create_pr 6 "AAS-2638" "eval-dashboard" \
    "add evaluation management UI to dashboard" \
    "- Complete UI for creating and monitoring evaluations
- Metadata visualization with categorized breakdowns and timeline views
- Real-time evaluation status monitoring with WebSocket integration
- Advanced filtering and search capabilities for evaluation results" \
    "feat" "(ui)" \
    "add evaluation management UI to dashboard" \
    "services/ark-dashboard/.*evaluation" \
    "services/ark-dashboard/.*evaluator" \
    "services/vnext-ui/.*evaluation" \
    "services/vnext-ui/.*evaluator"

# PR 7: CLI - AAS-2639
create_pr 7 "AAS-2639" "eval-cli" \
    "add evaluation commands to fark CLI" \
    "- Complete fark evaluation CRUD operations with batch support
- Progressive verbosity levels (-v, -vv, -vvv) for debugging
- Real-time evaluation monitoring with Kubernetes watch APIs
- Fix resource type parsing for plural forms (evaluations, evaluators)" \
    "feat" "(cli)" \
    "add evaluation commands to fark CLI" \
    "tools/fark/cmd/fark/.*eval" \
    "tools/fark/cmd/fark/batch" \
    "services/arkpy/.*evaluation" \
    "services/arkpy/.*evaluator"

# PR 8: Tests and Docs (optional, no specific feature ID)
create_pr 8 "AAS-2627-tests" "eval-tests-docs" \
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
echo -e "${GREEN}=== Branches Created ===${NC}"
echo ""

git branch | grep -E "feat/AAS-" | sed 's/^/  /'

echo ""
echo -e "${YELLOW}Dependency Order for PRs:${NC}"
echo "  1. ${BLUE}AAS-2627${NC} (RBAC)         → Merge first"
echo "  2. ${BLUE}AAS-2628${NC} (Controller)   → After RBAC"
echo "  ────────────────────────────────────"
echo "  Parallel Group (after Controller):"
echo "  3. ${BLUE}AAS-2636-A${NC} (LLM Service)"
echo "  4. ${BLUE}AAS-2636-B${NC} (Metric Service)"
echo "  5. ${BLUE}AAS-2637${NC} (API)"
echo "  6. ${BLUE}AAS-2638${NC} (Dashboard)"
echo "  ────────────────────────────────────"
echo "  7. ${BLUE}AAS-2639${NC} (CLI)          → After API"
echo "  8. ${BLUE}Tests/Docs${NC}              → Anytime"

echo ""
echo -e "${GREEN}PR creation scripts generated:${NC}"
ls -1 pr-*.sh 2>/dev/null | sed 's/^/  /'

echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Review each branch: git checkout feat/AAS-XXXX-..."
echo "  2. Test each branch: make test"
echo "  3. Push branches: git push origin feat/AAS-XXXX-..."
echo "  4. Create PRs: ./pr-N-AAS-XXXX.sh"