#!/usr/bin/env bash
# Dump k3s control-plane and host state for diagnosing a control plane that
# crashed during e2e bootstrap. Every command is best-effort: the apiserver is
# usually already dead when this runs, so kubectl calls will fail - that is
# expected and must not abort the dump. Hence no `set -e`.
set +e

reason="${1:-k3s diagnostics}"
since="${2:-10 minutes ago}"

echo "::group::k3s state dump (${reason})"

echo "--- systemctl status k3s ---"
sudo systemctl status k3s --no-pager

echo "--- journalctl -u k3s (since ${since}) ---"
sudo journalctl -u k3s --no-pager --since "${since}" --lines=300

# OOM is the prime suspect for "apiserver bound :6443, then died": grep both the
# kernel journal and dmesg for the killer's fingerprints.
echo "--- kernel OOM / killed-process events ---"
sudo journalctl -k --no-pager --since "${since}" \
  | grep -iE 'oom|killed process|out of memory' \
  || echo "no OOM events in kernel journal"
sudo dmesg | grep -iE 'oom|killed process|out of memory' \
  || echo "no OOM events in dmesg"

echo "--- memory ---"
free -h
grep -E 'MemTotal|MemAvailable|SwapTotal|SwapFree' /proc/meminfo

echo "--- disk (root) ---"
df -h /

echo "--- cluster state (best-effort; apiserver may be down) ---"
kubectl get nodes -o wide --request-timeout 180s
kubectl get pods -A -o wide --request-timeout 180s

echo "::endgroup::"
