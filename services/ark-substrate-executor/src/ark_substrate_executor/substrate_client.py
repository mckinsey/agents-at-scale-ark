"""Async wrapper over Agent Substrate for the executor.

Two backends:
  * ateapi (preferred) — the real gRPC Control API (ateapi_client.py). Required for creating
    an ActorTemplate with a custom image + per-query env. Enabled by ARK_SUBSTRATE_ATEAPI_ADDR.
  * kubectl ate (fallback) — drives egress/create/resume/logs by shelling out. Cannot create a
    template with a custom image+env, so the template must pre-exist.

Actor logs are read via `kubectl ate` in both modes: the Control service has no log RPC
(streaming is an atelet concern, out of scope for this client).
"""

from __future__ import annotations

import asyncio
import logging
import os

logger = logging.getLogger(__name__)


class SubstrateError(RuntimeError):
    pass


class SubstrateClient:
    def __init__(self, atespace: str = "default", kube_context: str | None = None):
        self.atespace = atespace
        self.kube_context = kube_context
        self._ateapi = None
        addr = os.environ.get("ARK_SUBSTRATE_ATEAPI_ADDR")
        if addr:
            from .ateapi_client import AteapiClient

            self._ateapi = AteapiClient(
                addr,
                atespace=atespace,
                snapshot_uri=os.environ.get("ARK_SUBSTRATE_SNAPSHOT_URI", ""),
                sandbox_class=os.environ.get("ARK_SUBSTRATE_SANDBOX_CLASS", "gvisor"),
                sandbox_config_name=os.environ.get("ARK_SUBSTRATE_SANDBOX_CONFIG", "default"),
            )
            logger.info("substrate backend: ateapi @ %s", addr)
        else:
            logger.info("substrate backend: kubectl ate (templates must pre-exist)")

    async def _ate(self, *args: str, stdin: str | None = None) -> str:
        cmd = ["kubectl", "ate", *args]
        if self.kube_context:
            cmd += ["--context", self.kube_context]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE if stdin is not None else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        out, _ = await proc.communicate(stdin.encode() if stdin is not None else None)
        text = out.decode(errors="replace")
        if proc.returncode != 0:
            raise SubstrateError(f"`{' '.join(cmd)}` failed: {text.strip()}")
        return text

    async def ensure_template(self, name: str, image: str, env: dict[str, str]) -> None:
        """Create the per-agent ActorTemplate carrying the ark-runner image + env.

        Requires the ateapi backend; `kubectl ate` cannot do this, so the template must be
        provisioned out of band when running in fallback mode.
        """
        if self._ateapi:
            await self._ateapi.ensure_template(name, image, env)
        else:
            logger.warning(
                "no ateapi backend: template %r must already exist with the ark-runner image+env",
                name,
            )

    async def ensure_egress(
        self,
        actor: str,
        *,
        http_hosts: list[str] | None = None,
        https_hosts: list[str] | None = None,
        allow_all: bool = False,
        inject: list[dict] | None = None,
    ) -> None:
        """Grant the actor egress. Default-deny is Substrate's posture; hosts are derived
        from the agent's modelRef + tools (specs/substrate-egress-credentials). allow_all is
        a local-dev convenience only. `inject` adds egress-gateway credential injection on the
        https rule (ateapi backend only)."""
        http = ["*"] if allow_all else (http_hosts or [])
        https = ["*"] if allow_all else (https_hosts or [])
        if self._ateapi:
            await self._ateapi.create_egress_policy(
                actor, http_hosts=http, https_hosts=https, inject=inject
            )
            return
        if allow_all:
            rules = 'rules:\n- http: {hostnames: ["*"], ports: {all: {}}}\n- https: {hostnames: ["*"]}\n'
        elif https or http:
            http_yaml = f"- http: {{hostnames: {http}}}\n" if http else ""
            https_yaml = f"- https: {{hostnames: {https}}}\n" if https else ""
            rules = f"rules:\n{http_yaml}{https_yaml}"
        else:
            rules = "rules: []\n"
        await self._ate("create", "egress-policy", actor, "-a", self.atespace, "-f", "-", stdin=rules)

    async def ensure_actor(self, actor: str, template: str, image: str, env: dict[str, str]) -> None:
        """Ensure the template and the actor exist (does NOT resume — the actor's egress
        policy must be created between actor creation and resume, since it is nested under
        the actor)."""
        if self._ateapi:
            await self._ateapi.ensure_template(template, image, env)
            await self._ateapi.create_actor(actor, template)
            return
        try:
            await self._ate("create", "actor", actor, "-a", self.atespace, "--template", template)
        except SubstrateError as e:
            if "already exists" not in str(e).lower():
                raise

    async def resume_actor(self, actor: str) -> None:
        if self._ateapi:
            await self._ateapi.resume_actor(actor)
            return
        await self._ate("resume", "actor", actor, "-a", self.atespace)

    async def preflight(self) -> None:
        """Fail fast on an unreachable or version-incompatible Substrate (task 5.1).
        No-op in kubectl-ate mode (the CLI enforces its own compatibility)."""
        if self._ateapi:
            await self._ateapi.preflight()

    async def logs(self, actor: str) -> str:
        """Read the actor's stdout. With ateapi: locate the hosting worker pod and read its
        `ateom` container log via the Kubernetes API (no kubectl in the image). Mirrors what
        `kubectl ate logs actors` does."""
        if self._ateapi:
            ns, pod = await self._ateapi.actor_worker_pod(actor)
            if not pod:
                return ""
            return await asyncio.to_thread(self._read_pod_log, ns, pod)
        return await self._ate("logs", "actors", actor, "-a", self.atespace)

    @staticmethod
    def _read_pod_log(namespace: str, pod: str) -> str:
        from kubernetes import client, config

        try:
            config.load_incluster_config()
        except Exception:
            config.load_kube_config()
        return client.CoreV1Api().read_namespaced_pod_log(
            name=pod, namespace=namespace, container="ateom", tail_lines=5000
        )

    async def suspend_actor(self, actor: str) -> None:
        if self._ateapi:
            await self._ateapi.suspend_actor(actor)
            return
        await self._ate("suspend", "actor", actor, "-a", self.atespace)

    async def delete_actor(self, actor: str) -> None:
        if self._ateapi:
            await self._ateapi.delete_actor(actor)
            return
        await self._ate("delete", "actor", actor, "-a", self.atespace)

    async def delete_template(self, template: str) -> None:
        if self._ateapi:
            await self._ateapi.delete_actor_template(template)
            return
        await self._ate("delete", "actor-template", template, "-a", self.atespace)
