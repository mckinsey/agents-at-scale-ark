import subprocess
from pathlib import Path
from typing import List, Tuple

_FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "rbac-test-bindings.yaml"
_SAMPLES = Path(__file__).resolve().parents[4] / "samples" / "rbac-test-bindings.yaml"
RBAC_BINDINGS = _FIXTURES if _FIXTURES.exists() else _SAMPLES

NAMESPACE = "default"
# A namespace with no RBAC test bindings, used to prove the RoleBindings are
# namespace-scoped (multi-tenant isolation), not cluster-wide.
OTHER_NAMESPACE = "kube-system"
API_GROUP = "ark.mckinsey.com"

ADMIN_USER = "admin@acme.com"
ADMIN_GROUP = "ark-admin"
VIEWER_USER = "viewer@acme.com"
VIEWER_GROUP = "ark-viewers"


class RBACHelper:
    def _run(self, cmd: List[str], timeout: int = 30) -> Tuple[bool, str, str]:
        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=timeout
            )
            return result.returncode == 0, result.stdout, result.stderr
        except subprocess.TimeoutExpired:
            return False, "", f"timed out after {timeout}s"
        except Exception as e:
            return False, "", str(e)

    def apply_bindings(self) -> Tuple[bool, str]:
        ok, _, stderr = self._run(["kubectl", "apply", "-f", str(RBAC_BINDINGS)])
        return ok, stderr

    def delete_bindings(self) -> Tuple[bool, str]:
        ok, _, stderr = self._run(
            ["kubectl", "delete", "-f", str(RBAC_BINDINGS), "--ignore-not-found=true"]
        )
        return ok, stderr

    def can_i(
        self,
        verb: str,
        resource: str,
        user: str,
        group: str = None,
        namespace: str = NAMESPACE,
    ) -> bool:
        cmd = [
            "kubectl",
            "auth",
            "can-i",
            verb,
            f"{resource}.{API_GROUP}",
            f"--as={user}",
            "-n",
            namespace,
        ]
        if group:
            cmd.append(f"--as-group={group}")
        ok, stdout, _ = self._run(cmd)
        return ok and stdout.strip() == "yes"
