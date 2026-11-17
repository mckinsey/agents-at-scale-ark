#!/bin/bash

# setup-aws-secrets.sh - Script to create Kubernetes secrets for AWS Bedrock authentication
# Usage: ./setup-aws-secrets.sh [options]
#
# Environment Variables:
#   AWS_ACCESS_KEY_ID      - AWS Access Key ID
#   AWS_SECRET_ACCESS_KEY  - AWS Secret Access Key  
#   AWS_SESSION_TOKEN      - AWS Session Token (optional, for temporary credentials)
#   AWS_ROLE_ARN          - AWS Role ARN (optional, for cross-account access)
#   AWS_REGION            - AWS Region (optional, defaults to us-west-2)
#   ANTHROPIC_MODEL       - Anthropic model ID (optional, for example generation)
#
# Options:
#   -n, --namespace NAMESPACE    Kubernetes namespace (default: default)
#   -s, --secret-name NAME       Secret name (default: aws-credentials)
#   --dry-run                    Show what would be created without applying
#   --cross-account              Create cross-account role secret instead
#   -h, --help                   Show this help message

set -euo pipefail

# Default values
NAMESPACE="default"
SECRET_NAME="aws-credentials"
DRY_RUN=false
CROSS_ACCOUNT=false
AWS_REGION="${AWS_REGION:-us-west-2}"
ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-us.anthropic.claude-sonnet-4-20250514-v1:0}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [options]

Create Kubernetes secrets for AWS Bedrock authentication from environment variables.

Options:
    -n, --namespace NAMESPACE    Kubernetes namespace (default: default)
    -s, --secret-name NAME       Secret name (default: aws-credentials)
    --dry-run                    Show what would be created without applying
    --cross-account              Create cross-account role secret instead
    -h, --help                   Show this help message

Environment Variables:
    AWS_ACCESS_KEY_ID      - AWS Access Key ID (required for basic auth)
    AWS_SECRET_ACCESS_KEY  - AWS Secret Access Key (required for basic auth)
    AWS_SESSION_TOKEN      - AWS Session Token (optional, for temporary credentials)
    AWS_ROLE_ARN          - AWS Role ARN (required for cross-account mode)
    AWS_REGION            - AWS Region (optional, defaults to us-west-2)
    ANTHROPIC_MODEL       - Anthropic model ID (optional, defaults to Claude 3.5 Sonnet)

Examples:
    # Create basic AWS credentials secret
    export AWS_ACCESS_KEY_ID="AKIA..."
    export AWS_SECRET_ACCESS_KEY="secret..."
    $0

    # Create secret in specific namespace
    $0 --namespace production --secret-name bedrock-aws-creds

    # Create cross-account role secret
    export AWS_ROLE_ARN="arn:aws:iam::123456789012:role/BedrockRole"
    $0 --cross-account --secret-name aws-cross-account

    # Dry run to see what would be created
    $0 --dry-run

EOF
}

# Function to log messages
log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Function to check if kubectl is available
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check if we can connect to cluster
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster. Please check your kubeconfig"
        exit 1
    fi
}

# Function to check if namespace exists
check_namespace() {
    local ns="$1"
    if ! kubectl get namespace "$ns" &> /dev/null; then
        log_warning "Namespace '$ns' does not exist. Creating it..."
        if [[ "$DRY_RUN" == "false" ]]; then
            kubectl create namespace "$ns"
            log_success "Created namespace '$ns'"
        else
            echo "Would create namespace: $ns"
        fi
    fi
}

# Function to validate environment variables
validate_env_vars() {
    local missing_vars=()
    
    if [[ "$CROSS_ACCOUNT" == "true" ]]; then
        # For cross-account access, we need role ARN
        if [[ -z "${AWS_ROLE_ARN:-}" ]]; then
            missing_vars+=("AWS_ROLE_ARN")
        fi
    else
        # For basic credentials, we need access key and secret
        if [[ -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
            missing_vars+=("AWS_ACCESS_KEY_ID")
        fi
        if [[ -z "${AWS_SECRET_ACCESS_KEY:-}" ]]; then
            missing_vars+=("AWS_SECRET_ACCESS_KEY")
        fi
    fi
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            log_error "  - $var"
        done
        echo ""
        usage
        exit 1
    fi
}

# Function to create basic AWS credentials secret
create_basic_secret() {
    local secret_data=()
    
    # Required fields
    secret_data+=("--from-literal=access-key-id=${AWS_ACCESS_KEY_ID}")
    secret_data+=("--from-literal=secret-access-key=${AWS_SECRET_ACCESS_KEY}")
    secret_data+=("--from-literal=region=${AWS_REGION}")
    
    # Optional session token
    if [[ -n "${AWS_SESSION_TOKEN:-}" ]]; then
        secret_data+=("--from-literal=session-token=${AWS_SESSION_TOKEN}")
        log "Including session token for temporary credentials"
    fi
    
    # Create the secret
    local cmd="kubectl create secret generic $SECRET_NAME --namespace=$NAMESPACE ${secret_data[*]}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would execute: $cmd --dry-run=client -o yaml"
        kubectl create secret generic "$SECRET_NAME" --namespace="$NAMESPACE" "${secret_data[@]}" --dry-run=client -o yaml | kubectl label --local -f - ark.mckinsey.com/resource-type=secret ark.mckinsey.com/scope=shared -o yaml
    else
        # Delete existing secret if it exists
        if kubectl get secret "$SECRET_NAME" --namespace="$NAMESPACE" &> /dev/null; then
            log_warning "Secret '$SECRET_NAME' already exists in namespace '$NAMESPACE'. Deleting it..."
            kubectl delete secret "$SECRET_NAME" --namespace="$NAMESPACE"
        fi
        
        kubectl create secret generic "$SECRET_NAME" --namespace="$NAMESPACE" "${secret_data[@]}" --dry-run=client -o yaml \
            | kubectl label --local -f - ark.mckinsey.com/resource-type=secret ark.mckinsey.com/scope=shared -o yaml \
            | kubectl create -f -
        log_success "Created secret '$SECRET_NAME' in namespace '$NAMESPACE'"
    fi
}

# Function to create cross-account role secret
create_cross_account_secret() {
    local secret_data=()
    
    # Required fields
    secret_data+=("--from-literal=role-arn=${AWS_ROLE_ARN}")
    secret_data+=("--from-literal=region=${AWS_REGION}")
    
    # Create the secret
    local cmd="kubectl create secret generic $SECRET_NAME --namespace=$NAMESPACE ${secret_data[*]}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "Would execute: $cmd --dry-run=client -o yaml"
        kubectl create secret generic "$SECRET_NAME" --namespace="$NAMESPACE" "${secret_data[@]}" --dry-run=client -o yaml | kubectl label --local -f - ark.mckinsey.com/resource-type=secret ark.mckinsey.com/scope=shared -o yaml
    else
        # Delete existing secret if it exists
        if kubectl get secret "$SECRET_NAME" --namespace="$NAMESPACE" &> /dev/null; then
            log_warning "Secret '$SECRET_NAME' already exists in namespace '$NAMESPACE'. Deleting it..."
            kubectl delete secret "$SECRET_NAME" --namespace="$NAMESPACE"
        fi
        
        kubectl create secret generic "$SECRET_NAME" --namespace="$NAMESPACE" "${secret_data[@]}" --dry-run=client -o yaml \
            | kubectl label --local -f - ark.mckinsey.com/resource-type=secret ark.mckinsey.com/scope=shared -o yaml \
            | kubectl create -f -
        log_success "Created cross-account secret '$SECRET_NAME' in namespace '$NAMESPACE'"
    fi
}

# Function to create Bedrock model
create_bedrock_model() {
    local model_name="bedrock"
    local model_yaml=$(cat << EOF
apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: $model_name
  namespace: $NAMESPACE
spec:
  type: bedrock
  model:
    value: "$ANTHROPIC_MODEL"
  config:
    bedrock:
      region:
        valueFrom:
          secretKeyRef:
            name: $SECRET_NAME
            key: region
EOF
)

    if [[ "$CROSS_ACCOUNT" == "true" ]]; then
        model_yaml+="\n      roleArn:\n        valueFrom:\n          secretKeyRef:\n            name: $SECRET_NAME\n            key: role-arn"
    else
        model_yaml+="\n      accessKeyId:\n        valueFrom:\n          secretKeyRef:\n            name: $SECRET_NAME\n            key: access-key-id"
        model_yaml+="\n      secretAccessKey:\n        valueFrom:\n          secretKeyRef:\n            name: $SECRET_NAME\n            key: secret-access-key"
        if [[ -n "${AWS_SESSION_TOKEN:-}" ]]; then
            model_yaml+="\n      sessionToken:\n        valueFrom:\n          secretKeyRef:\n            name: $SECRET_NAME\n            key: session-token"
        fi
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        echo ""
        log "Would create Model resource:"
        echo -e "$model_yaml"
    else
        # Delete existing model if it exists
        if kubectl get model "$model_name" --namespace="$NAMESPACE" &> /dev/null; then
            log_warning "Model '$model_name' already exists in namespace '$NAMESPACE'. Deleting it..."
            kubectl delete model "$model_name" --namespace="$NAMESPACE"
        fi
        
        echo ""
        log "Creating Bedrock model '$model_name'..."
        echo -e "$model_yaml" | kubectl apply -f -
        log_success "Created Model '$model_name' in namespace '$NAMESPACE'"
    fi
}

# Function to display secret info
show_secret_info() {
    if [[ "$DRY_RUN" == "false" ]]; then
        echo ""
        log "Secret information:"
        kubectl get secret "$SECRET_NAME" --namespace="$NAMESPACE" -o yaml | grep -E "^  [a-zA-Z-]+:" | sed 's/^  /    /'
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -s|--secret-name)
            SECRET_NAME="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --cross-account)
            CROSS_ACCOUNT=true
            SECRET_NAME="aws-cross-account"  # Default name for cross-account secrets
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Main execution
main() {
    log "Setting up AWS secrets for Bedrock authentication"
    log "Namespace: $NAMESPACE"
    log "Secret name: $SECRET_NAME"
    log "Cross-account mode: $CROSS_ACCOUNT"
    log "Dry run: $DRY_RUN"
    echo ""
    
    # Validate prerequisites
    check_kubectl
    validate_env_vars
    check_namespace "$NAMESPACE"
    
    # Create the appropriate secret
    if [[ "$CROSS_ACCOUNT" == "true" ]]; then
        log "Creating cross-account role secret..."
        create_cross_account_secret
    else
        log "Creating basic AWS credentials secret..."
        create_basic_secret
    fi
    
    # Create the Bedrock model
    create_bedrock_model
    
    log_success "AWS secrets and Bedrock model setup completed!"
}

# Run main function
main "$@"