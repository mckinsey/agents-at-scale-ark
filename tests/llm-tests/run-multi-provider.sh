#!/bin/bash
set -e

echo "=== Running Multi-Provider LLM Tests ==="

MODELS=()
FAILED_MODELS=()
PASSED_MODELS=()
TOTAL_TESTS=0
TOTAL_PASSED=0
TOTAL_FAILED=0

# Warm up network connections to external APIs used by tests
echo "Warming up network connections..."
curl -s --max-time 10 https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current_weather=true > /dev/null 2>&1 || true
curl -s --max-time 10 https://geocoding-api.open-meteo.com/v1/search?name=test&count=1 > /dev/null 2>&1 || true
echo "Network warm-up complete"
echo ""

# Check which providers are configured (OpenAI first for better network stability)
if [ -n "${E2E_TEST_OPENAI_API_KEY}" ]; then
  MODELS+=("openai-gpt-4o")
  echo "✓ OpenAI configured"
else
  echo "⊘ OpenAI not configured (missing credentials)"
fi

if [ -n "${E2E_TEST_AZURE_OPENAI_KEY}" ] && [ -n "${E2E_TEST_AZURE_OPENAI_BASE_URL}" ]; then
  MODELS+=("azure-gpt-41")
  echo "✓ Azure OpenAI configured"
else
  echo "⊘ Azure OpenAI not configured (missing credentials)"
fi

if [ ${#MODELS[@]} -eq 0 ]; then
  echo "ERROR: No model providers configured. Set at least one of:"
  echo "  - E2E_TEST_AZURE_OPENAI_KEY + E2E_TEST_AZURE_OPENAI_BASE_URL"
  echo "  - E2E_TEST_OPENAI_API_KEY"
  exit 1
fi

echo ""
echo "Running tests for ${#MODELS[@]} provider(s): ${MODELS[*]}"
echo ""

mkdir -p /tmp/chainsaw-report

for MODEL in "${MODELS[@]}"; do
  echo "========================================"
  echo "Testing with MODEL=$MODEL"
  echo "========================================"
  
  export MODEL
  
  # Count actual test directories (excluding setup/)
  TESTS_PER_PROVIDER=$(find llm-tests -mindepth 1 -maxdepth 1 -type d ! -name setup | wc -l | tr -d ' ')
  
  if chainsaw test llm-tests/ --config .chainsaw.yaml; then
    TOTAL_TESTS=$((TOTAL_TESTS + TESTS_PER_PROVIDER))
    TOTAL_PASSED=$((TOTAL_PASSED + TESTS_PER_PROVIDER))
    
    echo "✓ $MODEL tests PASSED"
    PASSED_MODELS+=("$MODEL")
  else
    TOTAL_TESTS=$((TOTAL_TESTS + TESTS_PER_PROVIDER))
    TOTAL_FAILED=$((TOTAL_FAILED + TESTS_PER_PROVIDER))
    
    echo "✗ $MODEL tests FAILED"
    FAILED_MODELS+=("$MODEL")
  fi
  
  echo ""
done

echo "========================================"
echo "Test Summary"
echo "========================================"
echo "Individual Tests: $TOTAL_PASSED/$TOTAL_TESTS passed"
echo ""

# Count test directories dynamically
TESTS_PER_PROVIDER=$(find llm-tests -mindepth 1 -maxdepth 1 -type d ! -name setup | wc -l | tr -d ' ')

# Show provider-level details
for model in "${PASSED_MODELS[@]}"; do
  echo "  ✓ $model: $TESTS_PER_PROVIDER/$TESTS_PER_PROVIDER tests passed"
done

if [ ${#FAILED_MODELS[@]} -gt 0 ]; then
  for model in "${FAILED_MODELS[@]}"; do
    echo "  ✗ $model: 0/$TESTS_PER_PROVIDER tests passed"
  done
fi

echo ""
echo "Providers: ${#PASSED_MODELS[@]}/${#MODELS[@]} passed"
for model in "${PASSED_MODELS[@]}"; do
  echo "  ✓ $model"
done

if [ ${#FAILED_MODELS[@]} -gt 0 ]; then
  echo ""
  echo "Failed providers:"
  for model in "${FAILED_MODELS[@]}"; do
    echo "  ✗ $model"
  done
  echo ""
  echo "ERROR: Some tests failed"
  exit 1
fi

echo ""
echo "SUCCESS: All tests passed!"
exit 0

