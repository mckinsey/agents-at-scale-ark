#!/bin/bash

# Test script to validate pipeline configuration
set -e

echo "🧪 Testing ARK API Pipeline Configuration..."

# Test 1: Validate Helm chart
echo "1. Testing Helm chart syntax..."
helm lint services/ark-api/chart
echo "✅ Helm chart is valid"

# Test 2: Validate CI/CD workflow YAML
echo "2. Testing CI/CD workflow YAML syntax..."
python -c "
import yaml
with open('.github/workflows/cicd.yaml', 'r') as f:
    yaml.safe_load(f)
print('✅ CI/CD workflow YAML is valid')
"

# Test 3: Test Helm template rendering
echo "3. Testing Helm template rendering..."
helm template ark-api services/ark-api/chart \
  --set app.image.repository=test-repo \
  --set app.image.tag=test-tag \
  --dry-run > /dev/null
echo "✅ Helm template renders successfully"

# Test 4: Verify environment variables are present
echo "4. Verifying environment variables in template..."
if helm template ark-api services/ark-api/chart \
  --set app.image.repository=test-repo \
  --set app.image.tag=test-tag | grep -q "ARK_OIDC_ISSUER"; then
  echo "✅ ARK_OIDC_ISSUER environment variable found"
else
  echo "❌ ARK_OIDC_ISSUER environment variable not found"
  exit 1
fi

if helm template ark-api services/ark-api/chart \
  --set app.image.repository=test-repo \
  --set app.image.tag=test-tag | grep -q "ARK_OIDC_APPLICATION_ID"; then
  echo "✅ ARK_OIDC_APPLICATION_ID environment variable found"
else
  echo "❌ ARK_OIDC_APPLICATION_ID environment variable not found"
  exit 1
fi

if helm template ark-api services/ark-api/chart \
  --set app.image.repository=test-repo \
  --set app.image.tag=test-tag | grep -q "ARK_SKIP_AUTH"; then
  echo "✅ ARK_SKIP_AUTH environment variable found"
else
  echo "❌ ARK_SKIP_AUTH environment variable not found"
  exit 1
fi

# Test 5: Verify secret references
echo "5. Verifying secret references..."
if helm template ark-api services/ark-api/chart \
  --set app.image.repository=test-repo \
  --set app.image.tag=test-tag | grep -q "ark-auth-secret"; then
  echo "✅ ark-auth-secret references found"
else
  echo "❌ ark-auth-secret references not found"
  exit 1
fi

echo ""
echo "🎉 All pipeline configuration tests passed!"
echo ""
echo "📋 Next steps:"
echo "1. Set up GitHub secrets in your repository:"
echo "   - ARK_OIDC_ISSUER (optional, has default)"
echo "   - ARK_OIDC_APPLICATION_ID (optional, has default)"
echo "   - ARK_SKIP_AUTH (optional, has default)"
echo "2. The pipeline will automatically create the ark-auth-secret"
echo "3. The ark-api service will be deployed with authentication enabled"
echo ""
echo "📖 See services/ark-api/AUTHENTICATION_PIPELINE.md for detailed instructions"
