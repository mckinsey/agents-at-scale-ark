#!/usr/bin/env bash
set -euo pipefail

NS="wal-reliability-test"
PASSED=0
FAILED=0
START=$(date +%s)

pass() { echo "  PASS: $1"; ((PASSED++)); }
fail() { echo "  FAIL: $1"; ((FAILED++)); }

cleanup() {
    echo "Cleaning up..."
    helm uninstall mock-llm -n "$NS" --wait --timeout=60s 2>/dev/null || true
    kubectl delete namespace "$NS" --wait=false 2>/dev/null || true
}
trap cleanup EXIT

echo "=== WAL CDC Live Reliability Test ==="
echo ""

# Verify postgresql backend
BACKEND=$(kubectl get deploy ark-controller -n ark-system -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="ARK_STORAGE_BACKEND")].value}' 2>/dev/null || echo "unknown")
if [ "$BACKEND" != "postgresql" ]; then
    echo "WARNING: Storage backend is '$BACKEND', expected 'postgresql'"
    echo "This test is designed for postgresql backend with WAL CDC"
fi

# Check WAL consumer is running
if kubectl logs deploy/ark-controller -n ark-system --tail=100 2>/dev/null | grep -q "WAL consumer started"; then
    pass "WAL consumer is running"
else
    fail "WAL consumer not detected in controller logs"
fi

# Create test namespace
kubectl create namespace "$NS" 2>/dev/null || true

echo ""
echo "--- Test 1: MCPServer Status Propagation ---"
echo "  (This is the exact failure scenario from issue #1587)"

helm install mock-llm oci://ghcr.io/dwmkerr/charts/mock-llm \
    --version 0.1.28 \
    --namespace "$NS" \
    --set ark.mcp.enabled=true \
    --set ark.mcp.name=mock-llm-mcp \
    --wait --timeout=120s

T1_START=$(date +%s)
for i in $(seq 1 60); do
    STATUS=$(kubectl get mcpserver mock-llm-mcp -n "$NS" -o jsonpath='{.status.conditions[?(@.type=="Available")].status}' 2>/dev/null || echo "")
    if [ "$STATUS" = "True" ]; then
        T1_END=$(date +%s)
        pass "MCPServer reached Available=True in $((T1_END - T1_START))s"
        break
    fi
    sleep 1
done
if [ "$STATUS" != "True" ]; then
    fail "MCPServer did not reach Available=True within 60s (status: $(kubectl get mcpserver mock-llm-mcp -n "$NS" -o jsonpath='{.status}' 2>/dev/null))"
fi

# Check Tool was discovered
TOOL_STATE=$(kubectl get tool mock-llm-mcp-echo -n "$NS" -o jsonpath='{.status.state}' 2>/dev/null || echo "")
if [ "$TOOL_STATE" = "Ready" ]; then
    pass "Tool mock-llm-mcp-echo discovered and Ready"
else
    fail "Tool not ready (state: $TOOL_STATE)"
fi

echo ""
echo "--- Test 2: Rapid Agent Creation (20 agents) ---"

helm install ark-tenant ../../charts/ark-tenant -n "$NS" --wait --timeout=60s 2>/dev/null || true

for i in $(seq 1 20); do
    kubectl apply -n "$NS" -f - <<EOF
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: test-agent-$i
spec:
  prompt: "Agent $i for WAL reliability test"
  modelRef:
    name: default
  tools:
  - type: mcp
    name: mock-llm-mcp-echo
EOF
done

sleep 3

READY_AGENTS=0
for i in $(seq 1 20); do
    EXISTS=$(kubectl get agent "test-agent-$i" -n "$NS" -o name 2>/dev/null || echo "")
    if [ -n "$EXISTS" ]; then
        ((READY_AGENTS++))
    fi
done

if [ "$READY_AGENTS" -eq 20 ]; then
    pass "All 20 agents created and visible"
else
    fail "Only $READY_AGENTS/20 agents visible"
fi

echo ""
echo "--- Test 3: Status Update Storm ---"
echo "  Rapidly update an agent's annotation 50 times, verify last update visible"

for i in $(seq 1 50); do
    kubectl annotate agent test-agent-1 -n "$NS" \
        "test-iteration=$i" --overwrite 2>/dev/null
done

sleep 2

FINAL=$(kubectl get agent test-agent-1 -n "$NS" -o jsonpath='{.metadata.annotations.test-iteration}' 2>/dev/null || echo "")
if [ "$FINAL" = "50" ]; then
    pass "Final annotation update (50) propagated correctly"
else
    fail "Final annotation is '$FINAL', expected '50'"
fi

echo ""
echo "--- Test 4: Concurrent Resource Creation ---"

for i in $(seq 1 30); do
    kubectl apply -n "$NS" -f - <<EOF &
apiVersion: ark.mckinsey.com/v1alpha1
kind: Agent
metadata:
  name: concurrent-agent-$i
spec:
  prompt: "Concurrent agent $i"
  modelRef:
    name: default
EOF
done
wait

sleep 3

CONCURRENT_COUNT=$(kubectl get agents -n "$NS" -o name 2>/dev/null | grep concurrent-agent | wc -l)
if [ "$CONCURRENT_COUNT" -eq 30 ]; then
    pass "All 30 concurrent agents visible"
else
    fail "Only $CONCURRENT_COUNT/30 concurrent agents visible"
fi

echo ""
END=$(date +%s)
echo "=== Results ==="
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo "  Duration: $((END - START))s"
echo ""

if [ "$FAILED" -gt 0 ]; then
    echo "RELIABILITY TEST FAILED"
    exit 1
else
    echo "ALL RELIABILITY TESTS PASSED"
fi
