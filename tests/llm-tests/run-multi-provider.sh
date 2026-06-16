#!/bin/bash
set -e

echo "=== Running Multi-Provider LLM Tests ==="

MODELS=()
# Index-aligned with MODELS. Indexed arrays (not associative) so this runs
# on macOS /bin/bash 3.2 too.
PASSED_PER_MODEL=()
FAILED_PER_MODEL=()
TOTAL_PER_MODEL=()

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
REPORT=/tmp/chainsaw-report/chainsaw-report.json

# Fallback count if the report is missing (e.g. chainsaw crashed pre-write).
TESTS_PER_PROVIDER=$(find llm-tests -mindepth 1 -maxdepth 1 -type d ! -name setup | wc -l | tr -d ' ')

for i in "${!MODELS[@]}"; do
  MODEL=${MODELS[$i]}
  echo "========================================"
  echo "Testing with MODEL=$MODEL"
  echo "========================================"

  export MODEL
  rm -f "$REPORT"

  chainsaw test llm-tests/ --config .chainsaw.yaml || true

  if [ -f "$REPORT" ]; then
    passed=$(jq '[.tests[]? | select(.status == "passed")] | length' "$REPORT")
    failed=$(jq '[.tests[]? | select(.status == "failed")] | length' "$REPORT")
    total=$(jq  '.tests   | length' "$REPORT")
  else
    passed=0
    failed=$TESTS_PER_PROVIDER
    total=$TESTS_PER_PROVIDER
    echo "WARNING: no chainsaw report at $REPORT; assuming all $total tests failed"
  fi

  PASSED_PER_MODEL[$i]=$passed
  FAILED_PER_MODEL[$i]=$failed
  TOTAL_PER_MODEL[$i]=$total

  if [ "$failed" -eq 0 ] && [ "$total" -gt 0 ]; then
    echo "✓ $MODEL: $passed/$total tests passed"
  else
    echo "✗ $MODEL: $passed/$total tests passed ($failed failed)"
  fi
  echo ""
done

echo "========================================"
echo "Test Summary"
echo "========================================"

total_passed=0
total_tests=0
passed_providers=0
for i in "${!MODELS[@]}"; do
  total_passed=$((total_passed + PASSED_PER_MODEL[$i]))
  total_tests=$((total_tests + TOTAL_PER_MODEL[$i]))
  if [ "${FAILED_PER_MODEL[$i]}" -eq 0 ] && [ "${TOTAL_PER_MODEL[$i]}" -gt 0 ]; then
    passed_providers=$((passed_providers + 1))
  fi
done

echo "Individual Tests: $total_passed/$total_tests passed"
echo ""

for i in "${!MODELS[@]}"; do
  model=${MODELS[$i]}
  if [ "${FAILED_PER_MODEL[$i]}" -eq 0 ] && [ "${TOTAL_PER_MODEL[$i]}" -gt 0 ]; then
    echo "  ✓ $model: ${PASSED_PER_MODEL[$i]}/${TOTAL_PER_MODEL[$i]} tests passed"
  else
    echo "  ✗ $model: ${PASSED_PER_MODEL[$i]}/${TOTAL_PER_MODEL[$i]} tests passed (${FAILED_PER_MODEL[$i]} failed)"
  fi
done

echo ""
echo "Providers: $passed_providers/${#MODELS[@]} passed"

if [ "$passed_providers" -ne "${#MODELS[@]}" ]; then
  echo ""
  echo "ERROR: Some tests failed"
  exit 1
fi

echo ""
echo "SUCCESS: All tests passed!"
exit 0

