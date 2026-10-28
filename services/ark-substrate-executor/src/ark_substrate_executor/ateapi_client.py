"""Real Substrate ateapi client (OpenSpec task 2.2).

Wraps the generated `Control` gRPC stub (ateapi_gen/) with the lifecycle operations the
executor needs: ensure an ActorTemplate carrying the ark-runner image + per-query env,
create/resume/suspend/delete an Actor, and create its EgressPolicy. This is the path that
`kubectl ate` cannot cover (template creation with a custom image+env).

Message/field shapes mirror substrate pkg/proto/ateapipb/ateapi.proto; regenerate the stubs
with scripts/gen_ateapi.sh when bumping the pinned Substrate version.

The generated stub is synchronous; each call is run in a thread so this presents an async
surface to the executor.
"""

from __future__ import annotations

import asyncio
import logging
import os

import grpc

from .ateapi_gen import ateapi_pb2 as pb
from .ateapi_gen import ateapi_pb2_grpc as rpc

logger = logging.getLogger(__name__)

# Substrate version these generated stubs were built against. Keep in sync with
# scripts/gen_ateapi.sh; preflight() surfaces protobuf/API skew against a live server.
SUBSTRATE_VERSION = "v0.4.1-0.20261009152331-f6a1dc72a35d"

# Auto-detect paths (mirror AX internal/substrate/client.go) for the in-cluster token + CA
# that the Substrate api service (TLS on :443, SPIFFE-style auth) requires.
_TOKEN_PATHS = ("/var/run/secrets/ateapi/token",)
_CA_PATHS = ("/run/servicedns-ca/trust-bundle.pem", "/run/servicedns-ca/ca.pem")
_DEFAULT_AUTHORITY = "api.ate-system.svc"

_SANDBOX_CLASS = {
    "gvisor": pb.SANDBOX_CLASS_GVISOR,
    "microvm": pb.SANDBOX_CLASS_MICROVM,
}


def _first_existing(explicit: str, candidates: tuple[str, ...]) -> str:
    if explicit:
        return explicit
    return next((p for p in candidates if os.path.exists(p)), "")


class _TokenAuth(grpc.AuthMetadataPlugin):
    """Per-RPC credential: sends `authorization: Bearer <token-file>` (matches AX tokenAuth)."""

    def __init__(self, token_file: str) -> None:
        self._token_file = token_file

    def __call__(self, context, callback):
        try:
            with open(self._token_file) as f:
                token = f.read().strip()
            callback((("authorization", f"Bearer {token}"),), None)
        except Exception as e:  # noqa: BLE001 - surface as RPC auth failure
            callback((), e)


def _make_channel(address: str) -> grpc.Channel:
    """Build the ateapi channel. TLS + token by default (the api service is TLS on :443);
    set ARK_SUBSTRATE_PLAINTEXT=true only for an insecure local endpoint.

    Config (mirrors AX): SUBSTRATE_CA_FILE, SUBSTRATE_TOKEN_FILE, SUBSTRATE_AUTHORITY.
    """
    if os.environ.get("ARK_SUBSTRATE_PLAINTEXT", "").lower() in ("1", "true", "yes"):
        return grpc.insecure_channel(address)

    authority = os.environ.get("SUBSTRATE_AUTHORITY") or (
        _DEFAULT_AUTHORITY if _DEFAULT_AUTHORITY in address else ""
    )
    ca_file = _first_existing(os.environ.get("SUBSTRATE_CA_FILE", ""), _CA_PATHS)
    root_certs = None
    if ca_file:
        with open(ca_file, "rb") as f:
            root_certs = f.read()
    channel_creds = grpc.ssl_channel_credentials(root_certificates=root_certs)

    token_file = _first_existing(os.environ.get("SUBSTRATE_TOKEN_FILE", ""), _TOKEN_PATHS)
    if token_file:
        call_creds = grpc.metadata_call_credentials(_TokenAuth(token_file))
        channel_creds = grpc.composite_channel_credentials(channel_creds, call_creds)

    options = [("grpc.ssl_target_name_override", authority)] if authority else []
    return grpc.secure_channel(address, channel_creds, options=options)


class AteapiClient:
    def __init__(
        self,
        address: str,
        atespace: str = "default",
        *,
        snapshot_uri: str,
        sandbox_class: str = "gvisor",
        sandbox_config_name: str = "default",
    ) -> None:
        self.address = address
        self.atespace = atespace
        self.snapshot_uri = snapshot_uri
        self.sandbox_class = sandbox_class
        self.sandbox_config_name = sandbox_config_name
        self._channel = _make_channel(address)
        self._stub = rpc.ControlStub(self._channel)

    def _ref(self, name: str) -> pb.ObjectRef:
        return pb.ObjectRef(atespace=self.atespace, name=name)

    async def preflight(self) -> None:
        """Verify connectivity and protobuf/API compatibility against the live server.

        A lightweight ListAtespaces round-trip fails fast on an unreachable server or a
        schema/version skew (pre-1.0 Substrate breaks interop on protobuf drift)."""
        def invoke():
            return self._stub.ListAtespaces(pb.ListAtespacesRequest())

        try:
            await asyncio.to_thread(invoke)
        except grpc.RpcError as e:
            raise RuntimeError(
                f"ateapi preflight failed against {self.address} "
                f"(stubs pinned to Substrate {SUBSTRATE_VERSION}; version skew?): "
                f"{e.code()}: {e.details()}"
            ) from e
        logger.info("ateapi preflight OK @ %s (pinned %s)", self.address, SUBSTRATE_VERSION)

    async def _call(self, method, request):
        """Run a blocking unary RPC off the event loop, swallowing ALREADY_EXISTS."""
        def invoke():
            try:
                return method(request)
            except grpc.RpcError as e:
                if e.code() == grpc.StatusCode.ALREADY_EXISTS:
                    logger.info("ateapi %s: already exists", method._method)
                    return None
                raise
        return await asyncio.to_thread(invoke)

    async def ensure_template(
        self, name: str, image: str, env: dict[str, str], *, wakeup_path: str = "/healthz", wakeup_port: int = 80
    ) -> None:
        container = pb.Container(
            name="runner",
            image=image,
            env=[pb.EnvVar(name=k, value=v) for k, v in env.items()],
            wakeup_probe=pb.ContainerWakeupProbe(
                http_get=pb.HTTPGetAction(path=wakeup_path, port=wakeup_port),
                timeout_seconds=300,
            ),
        )
        template = pb.ActorTemplate(
            metadata=pb.ResourceMetadata(atespace=self.atespace, name=name),
            containers=[container],
            snapshot_config=pb.SnapshotConfig(
                storage_location=self.snapshot_uri,
                preferred_fidelity=pb.SNAPSHOT_FIDELITY_MEMORY,
            ),
            sandbox_config=pb.SandboxConfig(
                sandbox_class=_SANDBOX_CLASS.get(self.sandbox_class, pb.SANDBOX_CLASS_GVISOR),
                config_name=self.sandbox_config_name,
            ),
        )
        await self._call(self._stub.CreateActorTemplate, pb.CreateActorTemplateRequest(actor_template=template))

    async def actor_worker_pod(self, name: str) -> tuple[str, str]:
        """Return (worker_namespace, worker_pod) hosting the actor, or ("","") if unassigned.
        The actor's stdout (incl. the result sentinel) lands in that pod's `ateom` container log."""
        def invoke():
            return self._stub.GetActor(pb.GetActorRequest(actor=self._ref(name)))

        actor = await asyncio.to_thread(invoke)
        wa = actor.status.worker_assignment
        return wa.worker_namespace, wa.worker_pod

    async def create_actor(self, name: str, template: str) -> None:
        actor = pb.Actor(
            metadata=pb.ResourceMetadata(atespace=self.atespace, name=name),
            actor_template=self._ref(template),
        )
        await self._call(self._stub.CreateActor, pb.CreateActorRequest(actor=actor))

    async def resume_actor(self, name: str) -> None:
        await self._call(self._stub.ResumeActor, pb.ResumeActorRequest(actor=self._ref(name)))

    async def delete_actor_template(self, name: str) -> None:
        await self._call(
            self._stub.DeleteActorTemplate,
            pb.DeleteActorTemplateRequest(actor_template=self._ref(name)),
        )

    async def suspend_actor(self, name: str) -> None:
        await self._call(self._stub.SuspendActor, pb.SuspendActorRequest(actor=self._ref(name)))

    async def delete_actor(self, name: str) -> None:
        await self._call(self._stub.DeleteActor, pb.DeleteActorRequest(actor=self._ref(name)))

    async def create_egress_policy(
        self,
        actor: str,
        *,
        http_hosts: list[str],
        https_hosts: list[str],
        inject: list[dict] | None = None,
    ) -> None:
        """Create the actor's egress policy. `inject` attaches credential-injection effects to
        the HTTPS rule: each {header, prefix, credential_uri} makes the egress gateway replace
        that header (sent with a placeholder by the actor) with the real secret, so the
        credential never lives in the sandbox (specs/substrate-egress-credentials)."""
        effects = None
        if inject:
            effects = pb.HttpRuleEffects(
                replace_headers=[
                    pb.CredentialHeader(
                        header=h["header"], prefix=h.get("prefix", ""), credential_uri=h["credential_uri"]
                    )
                    for h in inject
                ]
            )
        rules = []
        if http_hosts:
            rules.append(pb.EgressRule(http=pb.HTTPRule(hostnames=http_hosts)))
        if https_hosts:
            https = pb.HTTPSRule(hostnames=https_hosts)
            if effects is not None:
                https.effects.CopyFrom(effects)
            rules.append(pb.EgressRule(https=https))
        policy = pb.EgressPolicy(
            metadata=pb.ResourceMetadata(atespace=self.atespace, name="default"),
            rules=rules,
        )
        await self._call(
            self._stub.CreateActorEgressPolicy,
            pb.CreateActorEgressPolicyRequest(actor=self._ref(actor), egress_policy=policy),
        )

    def close(self) -> None:
        self._channel.close()
