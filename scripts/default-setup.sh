#!/usr/bin/env bash

# Colors for output
green='\033[0;32m'
red='\033[0;31m'
yellow='\033[1;33m'
white='\033[1;37m'
nc='\033[0m'

# Check if we're in the project root
if [ ! -f "version.txt" ]; then
    echo -e "${red}error${nc}: must run from project root directory"
    exit 1
fi

if [ -e .ark.env ]
then
	source .ark.env
fi

# Get model name parameter, default to default
model_name="${1:-default}"

echo ""
echo "Setup/Update Model from AI Gateway Credentials"
echo ""

model_type=${ARK_QUICKSTART_MODEL_TYPE:-}
if [ -z "$model_type" ]; then
    read -p "model type (azure/openai) [default: azure]: " model_type
fi
model_type=${model_type:-azure}

# Use environment variables if set, otherwise prompt
model_version=${ARK_QUICKSTART_MODEL_VERSION:-}
if [ -z "$model_version" ]; then
    read -p "model version [default: gpt-4.1-mini]: " model_version
fi
model_version=${model_version:-"gpt-4.1-mini"}

base_url=${ARK_QUICKSTART_BASE_URL:-}
if [ -z "$base_url" ]; then
    read -p "enter your base URL: " base_url
fi
# Remove trailing slash from base URL (if any)
base_url=$(echo "$base_url" | sed 's:/*$::')

# Ask for API version only if Azure
if [ "$model_type" = "azure" ]; then
    api_version=${ARK_QUICKSTART_API_VERSION:-}
    if [ -z "$api_version" ]; then
        read -p "enter Azure API version [default: 2024-12-01-preview]: " api_version
        api_version=${api_version:-2024-12-01-preview}
    fi
else
    api_version=""
fi

api_key=${ARK_QUICKSTART_API_KEY:-}
if [ -z "$api_key" ]; then
    read -s -n 2000 -p  "enter your API key: "   api_key
    echo
fi
# Convert to base64 without line wrapping or spaces
api_key=$(echo -n "$api_key" | sed 's/"//g')

echo "Extracted:"
echo "  Endpoint: $base_url"
echo "  Deployment: $model_version"
echo "  API Version: $api_version"
echo "  API Key: ${api_key:0:20}..."

# Create or update AIGW secret
echo "Creating/updating AIGW secret..."
kubectl create secret generic aigw-secret \
    --from-literal=api-key="$api_key" \
    --dry-run=client -o yaml | kubectl apply -f -

if [[ $? -eq 0 ]]; then
    echo -e "${green}✔${nc} AIGW secret created/updated successfully"
else
    echo -e "${red}✗${nc} Failed to create/update AIGW secret"
    exit 1
fi

# Delete existing model CRD if it exists, then create new one
echo "Deleting existing model: $model_name (if exists)..."
kubectl delete model "$model_name" --ignore-not-found=true

echo "Creating model: $model_name..."
cat <<EOF | kubectl apply -f -
apiVersion: ark.mckinsey.com/v1alpha1
kind: Model
metadata:
  name: $model_name
spec:
  type: azure
  model:
    value: "$model_version"
  config:
    azure:
      baseUrl:
        value: "$base_url"
      apiKey:
        valueFrom:
          secretKeyRef:
            name: aigw-secret
            key: api-key
      apiVersion:
        value: "$api_version"
EOF

if [[ $? -eq 0 ]]; then
    echo -e "${green}✔${nc} Azure model '$model_name' created successfully"
else
    echo -e "${red}✗${nc} Failed to create Azure model '$model_name'"
    exit 1
fi

# Check for sample agent
if kubectl get agent sample-agent >/dev/null 2>&1; then
    echo -e "${green}✔${nc} sample agent configured"
else
    echo -e "${yellow}warning${nc}: no sample agent found"
    echo "Creating sample-agent..."
    cat << EOF | kubectl apply -f -
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: sample-agent
spec:
  prompt: You're a helpful assistant. Provide clear and concise answers.
EOF
    if [[ $? -eq 0 ]]; then
        echo -e "${green}✔${nc} sample agent created successfully"
    else
        echo -e "${red}✗${nc} Failed to create sample agent"
        exit 1
    fi
fi

echo ""
echo "Setup complete! You can now use the AIGW endpoint with:"
echo "  Secret: aigw-secret"
echo "  Model: $model_name"

# Test the setup with a simple query
echo ""
echo "Testing setup with a simple query..."
sleep 3
if ./scripts/query.sh agent/sample-agent "confirm receipt of message"; then
    echo -e "${green}✔${nc} test query succeeded"
else
    echo -e "${yellow}warning${nc}: test query failed - credentials may not be working"
fi

echo ""