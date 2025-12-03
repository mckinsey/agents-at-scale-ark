#!/bin/bash
# Simple setup script for Agents at Scale project template
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_NAME="${PROJECT_NAME:-{{ .Values.projectName }}}"
NAMESPACE="${NAMESPACE:-default}"

echo -e "${BLUE}🚀 Setting up Agents at Scale Project${NC}"
echo "Project: $PROJECT_NAME | Namespace: $NAMESPACE"
echo ""

# Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"
if ! command -v kubectl >/dev/null 2>&1; then
    echo -e "${RED}❌ kubectl not found. Please install kubectl.${NC}"
    exit 1
fi

if ! command -v helm >/dev/null 2>&1; then
    echo -e "${RED}❌ helm not found. Please install helm.${NC}"
    exit 1
fi

# Check cluster connection
if ! kubectl cluster-info >/dev/null 2>&1; then
    echo -e "${RED}❌ Cannot connect to Kubernetes cluster${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"

# Check for API keys
echo ""
echo -e "${YELLOW}🔐 Checking API keys...${NC}"
if [ -z "$OPENAI_API_KEY" ] && [ -z "$AZURE_OPENAI_API_KEY" ] && [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${YELLOW}⚠️  No API keys found in environment.${NC}"
    echo "Please set at least one of:"
    echo "  export OPENAI_API_KEY='your-key'"
    echo "  export AZURE_OPENAI_API_KEY='your-key'"
    echo "  export ANTHROPIC_API_KEY='your-key'"
    echo ""
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${GREEN}✅ API key(s) found${NC}"
fi

# Create namespace
echo ""
echo -e "${YELLOW}🏗️  Setting up namespace...${NC}"
kubectl create namespace "$NAMESPACE" 2>/dev/null || echo "Namespace $NAMESPACE already exists"

# Create secrets if API keys exist
if [ -n "$OPENAI_API_KEY" ]; then
    kubectl create secret generic openai-secret \
        --from-literal=api-key="$OPENAI_API_KEY" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    echo -e "${GREEN}✅ Created OpenAI secret${NC}"
fi

if [ -n "$AZURE_OPENAI_API_KEY" ]; then
    kubectl create secret generic azure-openai-secret \
        --from-literal=api-key="$AZURE_OPENAI_API_KEY" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    echo -e "${GREEN}✅ Created Azure OpenAI secret${NC}"
fi

if [ -n "$ANTHROPIC_API_KEY" ]; then
    kubectl create secret generic anthropic-secret \
        --from-literal=api-key="$ANTHROPIC_API_KEY" \
        --namespace="$NAMESPACE" \
        --dry-run=client -o yaml | kubectl apply -f -
    echo -e "${GREEN}✅ Created Anthropic secret${NC}"
fi

# Create local config
cat > .env <<EOF
PROJECT_NAME=$PROJECT_NAME
NAMESPACE=$NAMESPACE
EOF

cat > values.local.yaml <<EOF
project:
  name: $PROJECT_NAME
  namespace: $NAMESPACE
EOF

echo ""
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  make install       # Deploy to Kubernetes"
echo "  make status        # Check deployment"
echo ""
echo "Or use ARK CLI for deployment:"
echo "  devspace dev      # Local development"