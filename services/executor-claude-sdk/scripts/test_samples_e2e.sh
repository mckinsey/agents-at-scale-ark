#!/bin/bash
# E2E tests for Claude SDK Executor samples
# Uses the actual sample YAML files to ensure they work correctly

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAMPLES_DIR="${SCRIPT_DIR}/../samples"
NAMESPACE="${NAMESPACE:-default}"
TIMEOUT="${TIMEOUT:-5m}"

# Test repository (can be overridden via environment)
TEST_REPO_URL="${TEST_REPO_URL:-https://github.com/McK-Internal/agentic-sdlc-demo-app.git}"
TEST_REPO_BRANCH="${TEST_REPO_BRANCH:-main}"

# Model name (override for different clusters)
TEST_MODEL="${TEST_MODEL:-anthropic-claude}"

# Execution engine name (override for different clusters)
TEST_EXECUTOR="${TEST_EXECUTOR:-claude-sdk-executor}"

log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_error() { echo -e "${RED}[FAIL]${NC} $1"; }

# Generate unique query name with timestamp
generate_query_name() {
    local sample=$1
    echo "e2e-${sample}-$(date +%s)"
}

# Apply sample resources (agent + profile) with proper names
apply_sample() {
    local sample=$1
    local sample_dir="${SAMPLES_DIR}/${sample}"
    
    log_info "Applying sample: ${sample}"
    
    # Apply agent with correct model and executor names (samples use placeholders)
    sed -e "s/name: platform-claude-sonnet/name: ${TEST_MODEL}/" \
        -e "s/name: platform-gpt-4o/name: ${TEST_MODEL}/" \
        -e "s/name: your-model/name: ${TEST_MODEL}/" \
        -e "s/name: executor-claude-sdk/name: ${TEST_EXECUTOR}/" \
        -e "s/name: claude-sdk-executor  # Change to match/name: ${TEST_EXECUTOR}  # Changed by test/" \
        "${sample_dir}/agent.yaml" | kubectl apply -n "${NAMESPACE}" -f -
    
    # Apply profile with template variables replaced for testing
    # For E2E tests, we strip postExecute/onFailure hooks since we don't want to post to GitHub
    # Use awk to remove everything from postExecute onwards
    sed -e "s|{{.RepoUrl}}|${TEST_REPO_URL}|g" \
        -e "s|{{.BaseBranch}}|${TEST_REPO_BRANCH}|g" \
        -e "s|{{.PrBranch}}|${TEST_REPO_BRANCH}|g" \
        -e "s|{{.PrNumber}}|0|g" \
        "${sample_dir}/execution-profile.yaml" \
        | awk '/^  postExecute:|^  onFailure:/{exit} {print}' \
        | kubectl apply -n "${NAMESPACE}" -f -
    
    log_success "Applied ${sample} agent (model: ${TEST_MODEL}) and profile"
}

# Create a test query with substituted parameters
create_test_query() {
    local sample=$1
    local query_name=$2
    local sample_dir="${SAMPLES_DIR}/${sample}"
    
    log_info "Creating test query: ${query_name}"
    
    # Read the sample query and substitute values
    case "${sample}" in
        pr-reviewer)
            # PR reviewer needs repo URL and branch info
            # For testing without an actual PR, we just review HEAD vs main
            cat <<EOF | kubectl apply -n "${NAMESPACE}" -f -
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: ${query_name}
  labels:
    e2e-test: "true"
    sample: "${sample}"
spec:
  target:
    name: pr-reviewer
    type: agent
  input: |
    Review the code in this repository. Focus on the src/ directory.
    
    Use git log and git diff to see recent changes.
    Analyze the code quality, patterns, and potential improvements.
    
    Provide a structured review with findings and a verdict.
  parameters:
    - name: RepoUrl
      value: "${TEST_REPO_URL}"
    - name: PrNumber
      value: "0"
    - name: PrBranch
      value: "${TEST_REPO_BRANCH}"
    - name: BaseBranch
      value: "${TEST_REPO_BRANCH}"
  timeout: ${TIMEOUT}
EOF
            ;;
        feature-developer)
            cat <<EOF | kubectl apply -n "${NAMESPACE}" -f -
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: ${query_name}
  labels:
    e2e-test: "true"
    sample: "${sample}"
spec:
  target:
    name: feature-developer
    type: agent
  input: |
    Add a simple utility function to format phone numbers.
    
    Create a function that takes a 10-digit number and formats it as (XXX) XXX-XXXX.
    Add it to the utilities module with appropriate tests.
  parameters:
    - name: RepoUrl
      value: "${TEST_REPO_URL}"
    - name: FeatureName
      value: "phone-formatter"
    - name: BaseBranch
      value: "${TEST_REPO_BRANCH}"
    - name: TestCommand
      value: "npm test"
  timeout: ${TIMEOUT}
EOF
            ;;
        code-refactor)
            cat <<EOF | kubectl apply -n "${NAMESPACE}" -f -
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: ${query_name}
  labels:
    e2e-test: "true"
    sample: "${sample}"
spec:
  target:
    name: code-refactor
    type: agent
  input: |
    Review the src/lib/utils folder and suggest any refactoring improvements.
    
    Focus on code quality and modern JavaScript/TypeScript patterns.
    Make small, safe changes only.
  parameters:
    - name: RepoUrl
      value: "${TEST_REPO_URL}"
    - name: RefactorTarget
      value: "src/lib/utils"
    - name: BaseBranch
      value: "${TEST_REPO_BRANCH}"
    - name: TestCommand
      value: "npm test"
  timeout: ${TIMEOUT}
EOF
            ;;
        advanced)
            cat <<EOF | kubectl apply -n "${NAMESPACE}" -f -
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: ${query_name}
  labels:
    e2e-test: "true"
    sample: "${sample}"
spec:
  target:
    name: advanced-developer
    type: agent
  input: |
    Analyze the codebase and provide a structured assessment.
    
    Use the code-reviewer and test-writer subagents to help with:
    1. Code quality review
    2. Test coverage analysis
    
    Provide a JSON-structured output with findings.
  parameters:
    - name: RepoUrl
      value: "${TEST_REPO_URL}"
    - name: FeatureName
      value: "codebase-analysis"
    - name: BaseBranch
      value: "${TEST_REPO_BRANCH}"
    - name: TestCommand
      value: "npm test"
  timeout: 10m
EOF
            ;;
        *)
            log_error "Unknown sample: ${sample}"
            return 1
            ;;
    esac
    
    log_success "Created query ${query_name}"
}

# Wait for query to complete
wait_for_query() {
    local query_name=$1
    local timeout_seconds=${2:-300}
    
    log_info "Waiting for query ${query_name} to complete (timeout: ${timeout_seconds}s)"
    
    if kubectl wait --for=condition=Completed "query/${query_name}" \
        -n "${NAMESPACE}" --timeout="${timeout_seconds}s" 2>/dev/null; then
        log_success "Query ${query_name} completed"
        return 0
    else
        log_error "Query ${query_name} did not complete in time"
        return 1
    fi
}

# Check query result
check_query_result() {
    local query_name=$1
    
    local phase
    phase=$(kubectl get query "${query_name}" -n "${NAMESPACE}" -o jsonpath='{.status.phase}')
    
    if [[ "${phase}" == "done" ]]; then
        log_success "Query ${query_name} succeeded (phase: done)"
        
        # Print response summary
        local response
        response=$(kubectl get query "${query_name}" -n "${NAMESPACE}" \
            -o jsonpath='{.status.response.content}' | head -c 500)
        echo -e "${YELLOW}Response preview:${NC}"
        echo "${response}..."
        echo ""
        return 0
    else
        log_error "Query ${query_name} failed (phase: ${phase})"
        
        # Print error details
        kubectl get query "${query_name}" -n "${NAMESPACE}" -o yaml | grep -A5 "conditions:"
        return 1
    fi
}

# Cleanup test resources
cleanup_query() {
    local query_name=$1
    
    log_info "Cleaning up query ${query_name}"
    kubectl delete query "${query_name}" -n "${NAMESPACE}" --ignore-not-found
}

# Run a single sample test
run_sample_test() {
    local sample=$1
    local query_name
    query_name=$(generate_query_name "${sample}")
    
    echo ""
    echo "=============================================="
    echo "Testing sample: ${sample}"
    echo "=============================================="
    
    # Apply the sample (agent + profile)
    if ! apply_sample "${sample}"; then
        log_error "Failed to apply sample ${sample}"
        return 1
    fi
    
    # Create test query
    if ! create_test_query "${sample}" "${query_name}"; then
        log_error "Failed to create test query for ${sample}"
        return 1
    fi
    
    # Wait for completion
    if ! wait_for_query "${query_name}" 300; then
        cleanup_query "${query_name}"
        return 1
    fi
    
    # Check result
    if ! check_query_result "${query_name}"; then
        cleanup_query "${query_name}"
        return 1
    fi
    
    # Cleanup on success
    cleanup_query "${query_name}"
    
    log_success "Sample ${sample} passed!"
    return 0
}

# Main
main() {
    local samples=("$@")
    
    # Default to pr-reviewer if no samples specified
    if [[ ${#samples[@]} -eq 0 ]]; then
        samples=("pr-reviewer")
    fi
    
    # Check kubectl connectivity
    if ! kubectl cluster-info &>/dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    log_info "Testing samples: ${samples[*]}"
    log_info "Namespace: ${NAMESPACE}"
    log_info "Test repo: ${TEST_REPO_URL}"
    log_info "Model: ${TEST_MODEL}"
    log_info "Executor: ${TEST_EXECUTOR}"
    
    local passed=0
    local failed=0
    local results=()
    
    for sample in "${samples[@]}"; do
        if run_sample_test "${sample}"; then
            ((passed++))
            results+=("${GREEN}✓${NC} ${sample}")
        else
            ((failed++))
            results+=("${RED}✗${NC} ${sample}")
        fi
    done
    
    # Summary
    echo ""
    echo "=============================================="
    echo "Test Summary"
    echo "=============================================="
    for result in "${results[@]}"; do
        echo -e "  ${result}"
    done
    echo ""
    echo "Passed: ${passed}, Failed: ${failed}"
    
    if [[ ${failed} -gt 0 ]]; then
        exit 1
    fi
}

# Usage
usage() {
    cat <<EOF
Usage: $0 [OPTIONS] [SAMPLES...]

Run E2E tests for Claude SDK Executor samples.

Options:
  -h, --help     Show this help message
  -n, --all      Run all samples

Samples:
  pr-reviewer        Test PR review workflow (default)
  feature-developer  Test feature development workflow
  code-refactor      Test code refactoring workflow
  advanced           Test advanced features (subagents, structured output)

Environment Variables:
  NAMESPACE          Kubernetes namespace (default: default)
  TIMEOUT            Query timeout (default: 5m)
  TEST_REPO_URL      Repository to test against
  TEST_REPO_BRANCH   Branch to use (default: main)
  TEST_MODEL         Model CRD name (default: anthropic-claude)
  TEST_EXECUTOR      ExecutionEngine name (default: claude-sdk-executor)

Examples:
  $0                          # Test pr-reviewer only
  $0 pr-reviewer              # Test specific sample
  $0 --all                    # Test all samples
  $0 pr-reviewer code-refactor # Test multiple samples
EOF
}

# Parse arguments
if [[ $# -gt 0 ]]; then
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -n|--all)
            main "pr-reviewer" "feature-developer" "code-refactor" "advanced"
            ;;
        *)
            main "$@"
            ;;
    esac
else
    main
fi
