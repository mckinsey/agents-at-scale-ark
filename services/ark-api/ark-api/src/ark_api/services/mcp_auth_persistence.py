"""Kubernetes Secret and MCPServer-annotation helpers for the MCP auth flow."""
from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from kubernetes_asyncio import client
from kubernetes_asyncio.client.rest import ApiException
from ark_sdk.k8s import create_api_client
from ark_sdk.models.mcp_server_v1alpha1 import MCPServerV1alpha1

logger = logging.getLogger(__name__)

TOKEN_SECRET_LABEL = "ark.mckinsey.com/mcp-token-secret"
FLOW_STATE_LABEL = "ark.mckinsey.com/oauth-state"
ANNOTATION_AUTHORIZED_BY = "ark.mckinsey.com/mcp-auth-authorized-by"
ANNOTATION_AUTHORIZED_AT = "ark.mckinsey.com/mcp-auth-authorized-at"

TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS = 30
MCPSERVER_UPDATE_MAX_RETRIES = 3

DEFAULT_ACCESS_TOKEN_KEY = "access_token"
DEFAULT_REFRESH_TOKEN_KEY = "refresh_token"
DEFAULT_EXPIRES_AT_KEY = "expires_at"
DEFAULT_CLIENT_ID_KEY = "client_id"
DEFAULT_CLIENT_SECRET_KEY = "client_secret"

FLOW_AUTH_ID_KEY = "_flow_auth_id"
FLOW_STATE_PARAM_KEY = "_flow_state_param"
FLOW_VERIFIER_KEY = "_flow_verifier"
FLOW_STATUS_KEY = "_flow_status"
FLOW_MESSAGE_KEY = "_flow_message"
FLOW_EXPIRES_AT_KEY = "_flow_expires_at"
FLOW_CALLER_IDENTITY_KEY = "_flow_caller_identity"
FLOW_TOKEN_EXPIRES_AT_KEY = "_flow_token_expires_at"
FLOW_SERVER_NAME_KEY = "_flow_server_name"
FLOW_NAMESPACE_KEY = "_flow_namespace"
FLOW_REDIRECT_ON_COMPLETE_KEY = "_flow_redirect_on_complete"

FLOW_KEYS = [
    FLOW_AUTH_ID_KEY,
    FLOW_STATE_PARAM_KEY,
    FLOW_VERIFIER_KEY,
    FLOW_STATUS_KEY,
    FLOW_MESSAGE_KEY,
    FLOW_EXPIRES_AT_KEY,
    FLOW_CALLER_IDENTITY_KEY,
    FLOW_TOKEN_EXPIRES_AT_KEY,
    FLOW_SERVER_NAME_KEY,
    FLOW_NAMESPACE_KEY,
    FLOW_REDIRECT_ON_COMPLETE_KEY,
]


@dataclass
class SecretKeys:
    access_token: str = DEFAULT_ACCESS_TOKEN_KEY
    refresh_token: str = DEFAULT_REFRESH_TOKEN_KEY
    expires_at: str = DEFAULT_EXPIRES_AT_KEY
    client_id: str = DEFAULT_CLIENT_ID_KEY
    client_secret: str = DEFAULT_CLIENT_SECRET_KEY

    @classmethod
    def from_token_secret_ref(cls, ref: Optional[dict]) -> "SecretKeys":
        if not ref:
            return cls()
        return cls(
            access_token=ref.get("accessTokenKey") or DEFAULT_ACCESS_TOKEN_KEY,
            refresh_token=ref.get("refreshTokenKey") or DEFAULT_REFRESH_TOKEN_KEY,
            expires_at=ref.get("expiresAtKey") or DEFAULT_EXPIRES_AT_KEY,
            client_id=ref.get("clientIDKey") or DEFAULT_CLIENT_ID_KEY,
            client_secret=ref.get("clientSecretKey") or DEFAULT_CLIENT_SECRET_KEY,
        )

    @classmethod
    def from_typed_ref(cls, ref) -> "SecretKeys":
        if not ref:
            return cls()
        return cls(
            access_token=ref.access_token_key or DEFAULT_ACCESS_TOKEN_KEY,
            refresh_token=ref.refresh_token_key or DEFAULT_REFRESH_TOKEN_KEY,
            expires_at=ref.expires_at_key or DEFAULT_EXPIRES_AT_KEY,
            client_id=ref.client_id_key or DEFAULT_CLIENT_ID_KEY,
            client_secret=ref.client_secret_key or DEFAULT_CLIENT_SECRET_KEY,
        )

    def as_list(self) -> list[str]:
        return [
            self.access_token,
            self.refresh_token,
            self.expires_at,
            self.client_id,
            self.client_secret,
        ]


@dataclass
class CachedClientCreds:
    client_id: Optional[str]
    client_secret: Optional[str]

    @property
    def both_present(self) -> bool:
        return bool(self.client_id) and bool(self.client_secret)


@dataclass
class FlowState:
    auth_id: str
    state_param: str
    verifier: str
    status: str
    message: str
    expires_at: str
    caller_identity: str
    token_expires_at: str
    server_name: str
    namespace: str
    client_id: str
    client_secret: str
    secret_name: str = ""
    redirect_on_complete: bool = False

    @property
    def is_expired(self) -> bool:
        if not self.expires_at:
            return True
        try:
            deadline = datetime.strptime(self.expires_at, "%Y-%m-%dT%H:%M:%SZ").replace(
                tzinfo=timezone.utc
            )
            return datetime.now(timezone.utc) >= deadline
        except ValueError:
            return True


def _decode_b64(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    try:
        return base64.b64decode(value).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return None


def _decode_b64_or_empty(value: Optional[str]) -> str:
    return _decode_b64(value) or ""


async def read_cached_client_creds(
    namespace: str, secret_name: str, keys: SecretKeys
) -> CachedClientCreds:
    async with create_api_client() as api:
        v1 = client.CoreV1Api(api)
        try:
            secret = await v1.read_namespaced_secret(name=secret_name, namespace=namespace)
        except ApiException as e:
            if e.status == 404:
                return CachedClientCreds(client_id=None, client_secret=None)
            raise

    data = secret.data or {}
    return CachedClientCreds(
        client_id=_decode_b64(data.get(keys.client_id)),
        client_secret=_decode_b64(data.get(keys.client_secret)),
    )


async def write_flow_state(
    *,
    namespace: str,
    secret_name: str,
    auth_id: str,
    state_param: str,
    verifier: str,
    expires_at: str,
    caller_identity: str,
    server_name: str,
    client_id: str,
    client_secret: str,
    keys: SecretKeys,
    redirect_on_complete: bool = False,
) -> None:
    string_data = {
        FLOW_AUTH_ID_KEY: auth_id,
        FLOW_STATE_PARAM_KEY: state_param,
        FLOW_VERIFIER_KEY: verifier,
        FLOW_STATUS_KEY: "pending",
        FLOW_MESSAGE_KEY: "",
        FLOW_EXPIRES_AT_KEY: expires_at,
        FLOW_CALLER_IDENTITY_KEY: caller_identity,
        FLOW_TOKEN_EXPIRES_AT_KEY: "",
        FLOW_SERVER_NAME_KEY: server_name,
        FLOW_NAMESPACE_KEY: namespace,
        FLOW_REDIRECT_ON_COMPLETE_KEY: "true" if redirect_on_complete else "false",
        keys.client_id: client_id,
        keys.client_secret: client_secret,
    }

    body = {
        "metadata": {
            "labels": {
                TOKEN_SECRET_LABEL: "true",
                FLOW_STATE_LABEL: state_param,
            },
        },
        "stringData": string_data,
    }

    async with create_api_client() as api:
        v1 = client.CoreV1Api(api)
        try:
            await v1.create_namespaced_secret(
                namespace=namespace,
                body=client.V1Secret(
                    api_version="v1",
                    kind="Secret",
                    metadata=client.V1ObjectMeta(
                        name=secret_name,
                        labels={
                            TOKEN_SECRET_LABEL: "true",
                            FLOW_STATE_LABEL: state_param,
                        },
                    ),
                    string_data=string_data,
                    type="Opaque",
                ),
            )
            logger.info("Created flow-state Secret %s/%s", namespace, secret_name)
            return
        except ApiException as e:
            if e.status != 409:
                raise

        await v1.patch_namespaced_secret(name=secret_name, namespace=namespace, body=body)
        logger.info("Patched flow-state into Secret %s/%s", namespace, secret_name)


async def read_flow_state_by_state_param(
    namespace: str, state_param: str
) -> Optional[FlowState]:
    async with create_api_client() as api:
        v1 = client.CoreV1Api(api)
        secrets = await v1.list_namespaced_secret(
            namespace=namespace,
            label_selector=f"{FLOW_STATE_LABEL}={state_param}",
        )
        if not secrets.items:
            return None
        secret = secrets.items[0]
        flow = _extract_flow_state(secret)
        if flow is not None:
            flow.secret_name = secret.metadata.name
        return flow


async def read_flow_state_by_auth_id(
    namespace: str, secret_name: str
) -> Optional[FlowState]:
    async with create_api_client() as api:
        v1 = client.CoreV1Api(api)
        try:
            secret = await v1.read_namespaced_secret(name=secret_name, namespace=namespace)
        except ApiException as e:
            if e.status == 404:
                return None
            raise
        flow = _extract_flow_state(secret)
        if flow is None:
            return None
        return flow


def _extract_flow_state(secret) -> Optional[FlowState]:
    data = secret.data or {}
    auth_id = _decode_b64(data.get(FLOW_AUTH_ID_KEY))
    if not auth_id:
        return None
    keys = SecretKeys()
    return FlowState(
        auth_id=auth_id,
        state_param=_decode_b64_or_empty(data.get(FLOW_STATE_PARAM_KEY)),
        verifier=_decode_b64_or_empty(data.get(FLOW_VERIFIER_KEY)),
        status=_decode_b64_or_empty(data.get(FLOW_STATUS_KEY)) or "pending",
        message=_decode_b64_or_empty(data.get(FLOW_MESSAGE_KEY)),
        expires_at=_decode_b64_or_empty(data.get(FLOW_EXPIRES_AT_KEY)),
        caller_identity=_decode_b64_or_empty(data.get(FLOW_CALLER_IDENTITY_KEY)),
        token_expires_at=_decode_b64_or_empty(data.get(FLOW_TOKEN_EXPIRES_AT_KEY)),
        server_name=_decode_b64_or_empty(data.get(FLOW_SERVER_NAME_KEY)),
        namespace=_decode_b64_or_empty(data.get(FLOW_NAMESPACE_KEY)),
        client_id=_decode_b64_or_empty(data.get(keys.client_id)),
        client_secret=_decode_b64_or_empty(data.get(keys.client_secret)),
        redirect_on_complete=_decode_b64_or_empty(data.get(FLOW_REDIRECT_ON_COMPLETE_KEY)) == "true",
    )


async def mark_flow_authorized(
    namespace: str, secret_name: str, token_expires_at: Optional[str]
) -> None:
    body = {
        "metadata": {"labels": {FLOW_STATE_LABEL: None}},
        "stringData": {
            FLOW_STATUS_KEY: "authorized",
            FLOW_STATE_PARAM_KEY: "",
            FLOW_MESSAGE_KEY: "",
            FLOW_TOKEN_EXPIRES_AT_KEY: token_expires_at or "",
        },
    }
    async with create_api_client() as api:
        v1 = client.CoreV1Api(api)
        await v1.patch_namespaced_secret(name=secret_name, namespace=namespace, body=body)


async def mark_flow_failed(namespace: str, secret_name: str, message: str) -> None:
    body = {
        "metadata": {"labels": {FLOW_STATE_LABEL: None}},
        "stringData": {
            FLOW_STATUS_KEY: "failed",
            FLOW_STATE_PARAM_KEY: "",
            FLOW_MESSAGE_KEY: message,
        },
    }
    async with create_api_client() as api:
        v1 = client.CoreV1Api(api)
        await v1.patch_namespaced_secret(name=secret_name, namespace=namespace, body=body)


def compute_expires_at(expires_in: Optional[int], now: Optional[datetime] = None) -> Optional[str]:
    if expires_in is None or expires_in <= 0:
        logger.warning("Token endpoint did not advertise a positive expires_in; omitting expires_at")
        return None
    now = now or datetime.now(timezone.utc)
    expires = now.timestamp() + expires_in - TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS
    return datetime.fromtimestamp(expires, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class SecretPatchPayload:
    access_token: str
    refresh_token: Optional[str]
    expires_at: Optional[str]
    client_id: str
    client_secret: str


async def write_token_secret(
    *,
    namespace: str,
    secret_name: str,
    keys: SecretKeys,
    payload: SecretPatchPayload,
) -> None:
    string_data: dict[str, str] = {
        keys.access_token: payload.access_token,
        keys.client_id: payload.client_id,
        keys.client_secret: payload.client_secret,
    }
    if payload.refresh_token:
        string_data[keys.refresh_token] = payload.refresh_token
    if payload.expires_at:
        string_data[keys.expires_at] = payload.expires_at

    metadata = client.V1ObjectMeta(
        name=secret_name,
        labels={TOKEN_SECRET_LABEL: "true"},
    )
    secret = client.V1Secret(
        api_version="v1",
        kind="Secret",
        metadata=metadata,
        string_data=string_data,
        type="Opaque",
    )

    async with create_api_client() as api:
        v1 = client.CoreV1Api(api)
        try:
            await v1.create_namespaced_secret(namespace=namespace, body=secret)
            logger.info("Created MCP token secret %s/%s", namespace, secret_name)
            return
        except ApiException as e:
            if e.status != 409:
                raise

        body = {
            "metadata": {"labels": {TOKEN_SECRET_LABEL: "true"}},
            "stringData": string_data,
        }
        await v1.patch_namespaced_secret(name=secret_name, namespace=namespace, body=body)
        logger.info("Patched MCP token secret %s/%s", namespace, secret_name)


async def clear_token_secret(
    *,
    namespace: str,
    secret_name: str,
    keys: SecretKeys,
    keep_client: bool,
) -> Optional[list[str]]:
    cleared: dict[str, str] = {
        keys.access_token: "",
        keys.refresh_token: "",
        keys.expires_at: "",
    }
    if not keep_client:
        cleared[keys.client_id] = ""
        cleared[keys.client_secret] = ""

    for k in FLOW_KEYS:
        cleared[k] = ""

    async with create_api_client() as api:
        v1 = client.CoreV1Api(api)
        try:
            await v1.patch_namespaced_secret(
                name=secret_name,
                namespace=namespace,
                body={
                    "metadata": {"labels": {FLOW_STATE_LABEL: None}},
                    "stringData": cleared,
                },
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise
    visible_cleared = [k for k in cleared if not k.startswith("_flow")]
    return visible_cleared


async def delete_token_secret(*, namespace: str, secret_name: str) -> bool:
    async with create_api_client() as api:
        v1 = client.CoreV1Api(api)
        try:
            await v1.delete_namespaced_secret(name=secret_name, namespace=namespace)
            return True
        except ApiException as e:
            if e.status == 404:
                return False
            raise


def now_rfc3339() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def flow_deadline_rfc3339(ttl_seconds: int) -> str:
    deadline = datetime.now(timezone.utc).timestamp() + ttl_seconds
    return datetime.fromtimestamp(deadline, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


async def _update_mcpserver_with_retry(ark_client, name: str, mutate) -> None:
    """Read-modify-write an MCPServer, retrying on 409 Conflict.

    ``mutate`` receives the MCPServer's dict form and mutates it in place,
    returning True when a write is needed or False to skip it. The object is
    re-read on each attempt so a retry always operates on the latest
    resourceVersion. This tolerates concurrent writes from the reconcile loop
    or overlapping auth flows, which would otherwise surface as a transient,
    retryable failure to the caller.
    """
    last_conflict: Optional[ApiException] = None
    for _ in range(MCPSERVER_UPDATE_MAX_RETRIES):
        mcp = await ark_client.mcpservers.a_get(name)
        obj = mcp.to_dict()
        if not mutate(obj):
            return
        updated = MCPServerV1alpha1(**obj)
        try:
            await ark_client.mcpservers.a_update(updated)
            return
        except ApiException as e:
            if e.status != 409:
                raise
            last_conflict = e
    if last_conflict is not None:
        raise last_conflict


async def annotate_mcpserver_authorized(
    ark_client, name: str, authorized_by: str
) -> None:
    def mutate(obj: dict) -> bool:
        metadata = obj.setdefault("metadata", {})
        annotations = dict(metadata.get("annotations") or {})
        annotations[ANNOTATION_AUTHORIZED_BY] = authorized_by
        annotations[ANNOTATION_AUTHORIZED_AT] = now_rfc3339()
        metadata["annotations"] = annotations
        obj["metadata"] = metadata
        return True

    await _update_mcpserver_with_retry(ark_client, name, mutate)


async def ensure_mcpserver_token_secret_ref(ark_client, name: str) -> str:
    secret_name = f"{name}-oauth"

    def mutate(obj: dict) -> bool:
        nonlocal secret_name
        spec = obj.setdefault("spec", {})
        authorization = dict(spec.get("authorization") or {})
        token_ref = dict(authorization.get("tokenSecretRef") or {})
        existing = token_ref.get("name")
        if existing:
            secret_name = existing
            return False
        token_ref["name"] = secret_name
        authorization["tokenSecretRef"] = token_ref
        spec["authorization"] = authorization
        obj["spec"] = spec
        return True

    await _update_mcpserver_with_retry(ark_client, name, mutate)
    return secret_name


async def strip_mcpserver_auth_annotations(ark_client, name: str) -> None:
    def mutate(obj: dict) -> bool:
        metadata = obj.setdefault("metadata", {})
        annotations = dict(metadata.get("annotations") or {})
        changed = False
        for key in (ANNOTATION_AUTHORIZED_BY, ANNOTATION_AUTHORIZED_AT):
            if key in annotations:
                annotations.pop(key, None)
                changed = True
        if not changed:
            return False
        metadata["annotations"] = annotations
        obj["metadata"] = metadata
        return True

    await _update_mcpserver_with_retry(ark_client, name, mutate)
