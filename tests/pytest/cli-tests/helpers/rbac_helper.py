import subprocess
from pathlib import Path
from typing import List, Tuple

from helpers.k8s import apply_yaml, delete_resource as k8s_delete_resource

# Role + RoleBinding granting the demo group create access on secrets, models,
# queries and teams. Used to prove RBAC gates resource creation rather than
# everything being denied.
GRANT = Path(__file__).resolve().parent.parent / "fixtures" / "rbac-model-secret-grant.yaml"

NAMESPACE = "default"
API_GROUP = "ark.mckinsey.com"

# Subject and resource names for the resource-creation RBAC tests. The group is
# the subject bound by GRANT; the user value is arbitrary (authorization is by
# group membership).
DEMO_USER = "rbac-demo@acme.com"
DEMO_GROUP = "rbac-demo-group"
DEMO_SECRET = "rbac-demo-secret"
DEMO_MODEL = "rbac-demo-model"
DEMO_QUERY = "rbac-demo-query"
DEMO_TEAM = "rbac-demo-team"
# A real agent that queries and teams target so they pass the validating
# webhook (which checks referenced agents exist). Created as admin; not under
# test itself.
DEMO_TARGET_AGENT = "rbac-demo-target-agent"


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

    def apply_grant(self) -> Tuple[bool, str]:
        ok, _, stderr = self._run(["kubectl", "apply", "-f", str(GRANT)])
        return ok, stderr

    def delete_grant(self) -> Tuple[bool, str]:
        ok, _, stderr = self._run(
            ["kubectl", "delete", "-f", str(GRANT), "--ignore-not-found=true"]
        )
        return ok, stderr

    def delete_resource(
        self, kind: str, name: str, namespace: str = NAMESPACE
    ) -> Tuple[bool, str]:
        return k8s_delete_resource(kind, name, namespace)

    def _create_as(
        self, manifest: str, user: str, group: str, namespace: str = NAMESPACE
    ) -> Tuple[bool, str]:
        cmd = [
            "kubectl", "create", "-f", "-",
            "-n", namespace,
            f"--as={user}",
            f"--as-group={group}",
        ]
        try:
            result = subprocess.run(
                cmd, input=manifest, capture_output=True, text=True, timeout=30
            )
        except subprocess.TimeoutExpired:
            return False, "timed out after 30s"
        return result.returncode == 0, (result.stdout + result.stderr).strip()

    def create_secret_as(self, name: str, user: str, group: str) -> Tuple[bool, str]:
        manifest = f"""apiVersion: v1
kind: Secret
metadata:
  name: {name}
  namespace: {NAMESPACE}
type: Opaque
stringData:
  token: placeholder
"""
        return self._create_as(manifest, user, group)

    def create_model_as(self, name: str, user: str, group: str) -> Tuple[bool, str]:
        manifest = f"""apiVersion: {API_GROUP}/v1alpha1
kind: Model
metadata:
  name: {name}
  namespace: {NAMESPACE}
spec:
  type: openai
  model:
    value: gpt-4
  config:
    openai:
      baseUrl:
        value: https://api.openai.com/v1
      apiKey:
        value: placeholder
"""
        return self._create_as(manifest, user, group)

    def apply_agent(self, name: str, namespace: str = NAMESPACE) -> Tuple[bool, str]:
        manifest = f"""apiVersion: {API_GROUP}/v1alpha1
kind: Agent
metadata:
  name: {name}
  namespace: {namespace}
spec:
  prompt: rbac demo target
"""
        return apply_yaml(manifest)

    def create_query_as(self, name: str, user: str, group: str) -> Tuple[bool, str]:
        manifest = f"""apiVersion: {API_GROUP}/v1alpha1
kind: Query
metadata:
  name: {name}
  namespace: {NAMESPACE}
spec:
  input: rbac access check
  target:
    name: {DEMO_TARGET_AGENT}
    type: agent
"""
        return self._create_as(manifest, user, group)

    def create_team_as(self, name: str, user: str, group: str) -> Tuple[bool, str]:
        manifest = f"""apiVersion: {API_GROUP}/v1alpha1
kind: Team
metadata:
  name: {name}
  namespace: {NAMESPACE}
spec:
  strategy: sequential
  members:
    - name: {DEMO_TARGET_AGENT}
      type: agent
"""
        return self._create_as(manifest, user, group)
