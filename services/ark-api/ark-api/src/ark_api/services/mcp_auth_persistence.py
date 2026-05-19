"""Kubernetes Secret and MCPServer-annotation helpers for the MCP auth flow."""
from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from kubernetes_asyncio import client
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.client.rest import ApiException

logger = logging.getLogger(__name__)

TOKEN_SECRET_LABEL = "ark.mckinsey.com/mcp-token-secret"
ANNOTATION_AUTHORIZED_BY = "ark.mckinsey.com/mcp-auth-authorized-by"
ANNOTATION_AUTHORIZED_AT = "ark.mckinsey.com/mcp-auth-authorized-at"

DEFAULT_ACCESS_TOKEN_KEY = "access_token"
DEFAULT_REFRESH_TOKEN_KEY = "refresh_token"
DEFAULT_EXPIRES_AT_KEY = "expires_at"
DEFAULT_CLIENT_ID_KEY = "client_id"
DEFAULT_CLIENT_SECRET_KEY = "client_secret"


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


def _decode_b64(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    try:
        return base64.b64decode(value).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return None


async def read_cached_client_creds(
    namespace: str, secret_name: str, keys: SecretKeys
) -> CachedClientCreds:
    """Read client_id / client_secret from the Secret (returns empty if missing)."""
    async with ApiClient() as api:
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


def compute_expires_at(expires_in: Optional[int], now: Optional[datetime] = None) -> Optional[str]:
    """Compute RFC 3339 UTC expires_at = now + expires_in - 30s for positive expires_in."""
    if expires_in is None or expires_in <= 0:
        logger.warning("Token endpoint did not advertise a positive expires_in; omitting expires_at")
        return None
    now = now or datetime.now(timezone.utc)
    expires = now.timestamp() + expires_in - 30
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
    """Create-or-patch the Secret with the token payload and stamp the mcp-token-secret label."""
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

    async with ApiClient() as api:
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
    """Clear token (and optionally client) keys on the Secret. Returns None when the Secret is absent."""
    cleared: dict[str, str] = {
        keys.access_token: "",
        keys.refresh_token: "",
        keys.expires_at: "",
    }
    if not keep_client:
        cleared[keys.client_id] = ""
        cleared[keys.client_secret] = ""

    async with ApiClient() as api:
        v1 = client.CoreV1Api(api)
        try:
            await v1.patch_namespaced_secret(
                name=secret_name,
                namespace=namespace,
                body={"stringData": cleared},
            )
        except ApiException as e:
            if e.status == 404:
                return None
            raise
    return list(cleared.keys())


async def delete_token_secret(*, namespace: str, secret_name: str) -> bool:
    """Delete the Secret. Returns False if absent."""
    async with ApiClient() as api:
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


async def annotate_mcpserver_authorized(
    ark_client, name: str, authorized_by: str
) -> None:
    """Set the authorized-by / authorized-at annotations on the MCPServer."""
    mcp = await ark_client.mcpservers.a_get(name)
    obj = mcp.to_dict()
    metadata = obj.setdefault("metadata", {})
    annotations = dict(metadata.get("annotations") or {})
    annotations[ANNOTATION_AUTHORIZED_BY] = authorized_by
    annotations[ANNOTATION_AUTHORIZED_AT] = now_rfc3339()
    metadata["annotations"] = annotations
    obj["metadata"] = metadata

    # Patch via the underlying core API client (works regardless of SDK update semantics).
    from ark_sdk.models.mcp_server_v1alpha1 import MCPServerV1alpha1

    updated = MCPServerV1alpha1(**obj)
    await ark_client.mcpservers.a_update(updated)


async def strip_mcpserver_auth_annotations(ark_client, name: str) -> None:
    """Remove the authorized-by / authorized-at annotations from the MCPServer."""
    mcp = await ark_client.mcpservers.a_get(name)
    obj = mcp.to_dict()
    metadata = obj.setdefault("metadata", {})
    annotations = dict(metadata.get("annotations") or {})
    changed = False
    for key in (ANNOTATION_AUTHORIZED_BY, ANNOTATION_AUTHORIZED_AT):
        if key in annotations:
            annotations.pop(key, None)
            changed = True
    if not changed:
        return
    metadata["annotations"] = annotations
    obj["metadata"] = metadata

    from ark_sdk.models.mcp_server_v1alpha1 import MCPServerV1alpha1

    updated = MCPServerV1alpha1(**obj)
    await ark_client.mcpservers.a_update(updated)
