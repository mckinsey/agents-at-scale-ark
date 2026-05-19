"""MCP authorization endpoints (auth/start, auth/callback, auth/status, auth/logout)."""
from __future__ import annotations

import html
import logging
import time
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse

from ark_sdk.client import with_ark_client

from ...core.mcp_auth_config import McpAuthConfigError, get_mcp_auth_config
from ...models.mcp_auth import (
    AuthLogoutRequest,
    AuthLogoutResponse,
    AuthStartRequest,
    AuthStartResponse,
    AuthStatusResponse,
)
from ...services.mcp_auth_cache import CacheEntry, get_mcp_auth_cache
from ...services.mcp_auth_persistence import (
    SecretKeys,
    SecretPatchPayload,
    annotate_mcpserver_authorized,
    clear_token_secret,
    compute_expires_at,
    delete_token_secret,
    read_cached_client_creds,
    strip_mcpserver_auth_annotations,
    write_token_secret,
)
from ...services.oauth_dcr import DcrError, register_client
from ...services.oauth_token import TokenExchangeError, exchange_code
from ...services.pkce import (
    derive_challenge,
    generate_auth_id,
    generate_state,
    generate_verifier,
)
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(tags=["mcp-auth"])

VERSION = "v1alpha1"
DEFAULT_AUTHORIZED_BY = "cli"


def _get_config_or_503():
    try:
        cfg = get_mcp_auth_config()
    except McpAuthConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not cfg.is_callback_url_set:
        raise HTTPException(
            status_code=503,
            detail="MCP auth endpoints are disabled: ARK_API_PUBLIC_CALLBACK_URL is not set",
        )
    return cfg


def _authorization_from_status(mcp_server_dict: dict) -> dict:
    status = mcp_server_dict.get("status") or {}
    return status.get("authorization") or {}


def _token_secret_ref(mcp_server_dict: dict) -> Optional[dict]:
    spec = mcp_server_dict.get("spec") or {}
    authorization = spec.get("authorization") or {}
    return authorization.get("tokenSecretRef")


def _build_authorization_url(
    *,
    authorization_endpoint: str,
    client_id: str,
    redirect_uri: str,
    state: str,
    code_challenge: str,
    resource: str,
    scopes: Optional[list[str]],
) -> str:
    params = [
        ("response_type", "code"),
        ("client_id", client_id),
        ("redirect_uri", redirect_uri),
        ("state", state),
        ("code_challenge", code_challenge),
        ("code_challenge_method", "S256"),
        ("resource", resource),
    ]
    if scopes:
        params.append(("scope", " ".join(scopes)))
    separator = "&" if "?" in authorization_endpoint else "?"
    return f"{authorization_endpoint}{separator}{urlencode(params)}"


def _flow_expires_at_rfc3339(entry: CacheEntry) -> str:
    return (
        datetime.fromtimestamp(entry.flow_expires_at_epoch, tz=timezone.utc)
        .strftime("%Y-%m-%dT%H:%M:%SZ")
    )


@router.post(
    "/mcp-servers/{mcp_server_name}/auth/start",
    response_model=AuthStartResponse,
)
@handle_k8s_errors(operation="start auth", resource_type="mcp_server")
async def start_mcp_auth(
    mcp_server_name: str,
    body: AuthStartRequest,
    namespace: Optional[str] = Query(
        None, description="Namespace for this request (defaults to current context)"
    ),
) -> AuthStartResponse:
    cfg = _get_config_or_503()
    redirect_uri = cfg.public_callback_url
    force = bool(body.force)
    force_registration = bool(body.force_registration)

    async with with_ark_client(namespace, VERSION) as ark_client:
        mcp_server = await ark_client.mcpservers.a_get(mcp_server_name)
        mcp_dict = mcp_server.to_dict()
        ns = (mcp_dict.get("metadata") or {}).get("namespace") or namespace

        authorization = _authorization_from_status(mcp_dict)
        state_value = authorization.get("state")

        if state_value == "Authorized" and not force:
            raise HTTPException(
                status_code=409,
                detail="MCPServer is already Authorized; pass force=true to start a new flow",
            )
        if state_value == "DiscoveryFailed":
            raise HTTPException(
                status_code=422,
                detail=(
                    "MCPServer status.authorization.state is DiscoveryFailed; "
                    "no registration or token endpoint to drive a flow"
                ),
            )

        token_endpoint = authorization.get("tokenEndpoint")
        authorization_endpoint = authorization.get("authorizationEndpoint")
        registration_endpoint = authorization.get("registrationEndpoint")
        resource = authorization.get("resource")
        if not authorization_endpoint or not token_endpoint or not resource:
            raise HTTPException(
                status_code=422,
                detail=(
                    "MCPServer status.authorization is missing required fields "
                    "(authorizationEndpoint, tokenEndpoint, resource)"
                ),
            )

        token_ref = _token_secret_ref(mcp_dict)
        if not token_ref or not token_ref.get("name"):
            raise HTTPException(
                status_code=422,
                detail="MCPServer spec.authorization.tokenSecretRef.name is not set",
            )
        secret_name = token_ref["name"]
        keys = SecretKeys.from_token_secret_ref(token_ref)

        cached = await read_cached_client_creds(ns, secret_name, keys)
        do_dcr = force_registration or not cached.both_present
        if do_dcr and not registration_endpoint:
            if not cached.both_present:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "MCPServer has no registrationEndpoint and the Secret carries no "
                        "cached client credentials; cannot proceed"
                    ),
                )
            do_dcr = False

        if do_dcr:
            try:
                dcr = await register_client(
                    registration_endpoint=registration_endpoint,
                    redirect_uri=redirect_uri,
                    timeout_seconds=cfg.dcr_timeout_seconds,
                )
            except DcrError as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
            client_id = dcr.client_id
            client_secret = dcr.client_secret
        else:
            client_id = cached.client_id or ""
            client_secret = cached.client_secret or ""

        scopes: Optional[list[str]]
        if body.scopes is not None:
            scopes = body.scopes
        else:
            advertised = authorization.get("scopesSupported")
            scopes = list(advertised) if advertised else None

        verifier = generate_verifier()
        challenge = derive_challenge(verifier)
        state = generate_state()
        auth_id = generate_auth_id()

        cache = get_mcp_auth_cache(cfg.cache_ttl_seconds)

        entry = CacheEntry(
            auth_id=auth_id,
            state=state,
            mcp_server_name=mcp_server_name,
            namespace=ns,
            verifier=verifier,
            client_id=client_id,
            client_secret=client_secret,
            caller_identity=DEFAULT_AUTHORIZED_BY,
            created_at=time.time(),
            ttl_seconds=cfg.cache_ttl_seconds,
        )
        await cache.put(entry)

        authorization_url = _build_authorization_url(
            authorization_endpoint=authorization_endpoint,
            client_id=client_id,
            redirect_uri=redirect_uri,
            state=state,
            code_challenge=challenge,
            resource=resource,
            scopes=scopes,
        )

        return AuthStartResponse(
            auth_id=auth_id,
            authorization_url=authorization_url,
            flow_expires_at=_flow_expires_at_rfc3339(entry),
        )


def _html_response(*, title: str, body: str, status_code: int = 200) -> HTMLResponse:
    safe_title = html.escape(title)
    safe_body = html.escape(body)
    page = (
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>"
        f"{safe_title}</title></head><body>"
        f"<h1>{safe_title}</h1><p>{safe_body}</p>"
        "<p>You may close this window.</p></body></html>"
    )
    return HTMLResponse(content=page, status_code=status_code)


@router.get("/mcp/auth/callback")
async def mcp_auth_callback(
    request: Request,
    state: Optional[str] = Query(None),
    code: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
) -> HTMLResponse:
    cfg = _get_config_or_503()
    cache = get_mcp_auth_cache(cfg.cache_ttl_seconds)

    if not state:
        return _html_response(
            title="Authorization failed",
            body="Missing state parameter",
            status_code=400,
        )

    entry = await cache.take_by_state(state)
    if entry is None:
        return _html_response(
            title="Authorization failed",
            body="Unknown or expired state",
            status_code=400,
        )

    if error:
        message = f"{error}: {error_description}" if error_description else error
        await cache.mark_failed(entry.auth_id, message)
        return _html_response(
            title="Authorization failed",
            body=message,
            status_code=400,
        )

    if not code:
        await cache.mark_failed(entry.auth_id, "missing authorization code")
        return _html_response(
            title="Authorization failed",
            body="Missing authorization code",
            status_code=400,
        )

    async with with_ark_client(entry.namespace, VERSION) as ark_client:
        mcp_server = await ark_client.mcpservers.a_get(entry.mcp_server_name)
        mcp_dict = mcp_server.to_dict()
        authorization = _authorization_from_status(mcp_dict)
        token_endpoint = authorization.get("tokenEndpoint")
        resource = authorization.get("resource")
        token_ref = _token_secret_ref(mcp_dict)
        if not token_endpoint or not resource or not token_ref or not token_ref.get("name"):
            await cache.mark_failed(entry.auth_id, "MCPServer authorization metadata went missing")
            return _html_response(
                title="Authorization failed",
                body="MCPServer authorization metadata went missing",
                status_code=400,
            )
        secret_name = token_ref["name"]
        keys = SecretKeys.from_token_secret_ref(token_ref)

        try:
            token = await exchange_code(
                token_endpoint=token_endpoint,
                code=code,
                redirect_uri=cfg.public_callback_url,
                code_verifier=entry.verifier,
                resource=resource,
                client_id=entry.client_id,
                client_secret=entry.client_secret,
                timeout_seconds=cfg.token_timeout_seconds,
            )
        except TokenExchangeError as exc:
            await cache.mark_failed(entry.auth_id, str(exc))
            return _html_response(
                title="Authorization failed",
                body=str(exc),
                status_code=400,
            )

        expires_at = compute_expires_at(token.expires_in)
        await write_token_secret(
            namespace=entry.namespace,
            secret_name=secret_name,
            keys=keys,
            payload=SecretPatchPayload(
                access_token=token.access_token,
                refresh_token=token.refresh_token,
                expires_at=expires_at,
                client_id=entry.client_id,
                client_secret=entry.client_secret,
            ),
        )
        await annotate_mcpserver_authorized(
            ark_client, entry.mcp_server_name, entry.caller_identity
        )
        await cache.mark_authorized(entry.auth_id, expires_at)

    return _html_response(
        title="Authorization complete",
        body=f"Authorization for {entry.mcp_server_name} succeeded.",
    )


@router.get(
    "/mcp-servers/{mcp_server_name}/auth/status",
    response_model=AuthStatusResponse,
)
@handle_k8s_errors(operation="get auth status", resource_type="mcp_server")
async def get_mcp_auth_status(
    mcp_server_name: str,
    auth_id: str = Query(..., description="auth_id returned by auth/start"),
    namespace: Optional[str] = Query(
        None, description="Namespace for this request (defaults to current context)"
    ),
) -> AuthStatusResponse:
    cfg = _get_config_or_503()
    cache = get_mcp_auth_cache(cfg.cache_ttl_seconds)

    async with with_ark_client(namespace, VERSION) as ark_client:
        mcp_server = await ark_client.mcpservers.a_get(mcp_server_name)
        mcp_dict = mcp_server.to_dict()
        authorization = _authorization_from_status(mcp_dict)
        server_state = authorization.get("state")

    entry = await cache.get_by_auth_id(auth_id)
    if entry is None:
        return AuthStatusResponse(state="expired", message="Unknown or expired auth_id")

    if entry.flow_state == "failed":
        return AuthStatusResponse(state="failed", message=entry.message)
    if entry.flow_state == "expired":
        return AuthStatusResponse(state="expired", message=entry.message)
    if entry.flow_state == "authorized":
        if server_state == "Authorized":
            return AuthStatusResponse(
                state="authorized", expires_at=entry.token_expires_at
            )
        return AuthStatusResponse(
            state="pending",
            message="Token written; awaiting MCPServer status reconciliation",
        )
    return AuthStatusResponse(state="pending")


@router.post(
    "/mcp-servers/{mcp_server_name}/auth/logout",
    response_model=AuthLogoutResponse,
)
@handle_k8s_errors(operation="logout auth", resource_type="mcp_server")
async def logout_mcp_auth(
    mcp_server_name: str,
    body: AuthLogoutRequest,
    namespace: Optional[str] = Query(
        None, description="Namespace for this request (defaults to current context)"
    ),
) -> AuthLogoutResponse:
    keep_client = bool(body.keep_client)
    delete_secret = bool(body.delete_secret)
    if keep_client and delete_secret:
        raise HTTPException(
            status_code=400,
            detail="keep_client and delete_secret are mutually exclusive",
        )

    async with with_ark_client(namespace, VERSION) as ark_client:
        mcp_server = await ark_client.mcpservers.a_get(mcp_server_name)
        mcp_dict = mcp_server.to_dict()
        ns = (mcp_dict.get("metadata") or {}).get("namespace") or namespace
        token_ref = _token_secret_ref(mcp_dict)
        if not token_ref or not token_ref.get("name"):
            await strip_mcpserver_auth_annotations(ark_client, mcp_server_name)
            return AuthLogoutResponse(noop=True)
        secret_name = token_ref["name"]
        keys = SecretKeys.from_token_secret_ref(token_ref)

        if delete_secret:
            deleted = await delete_token_secret(namespace=ns, secret_name=secret_name)
            await strip_mcpserver_auth_annotations(ark_client, mcp_server_name)
            if not deleted:
                return AuthLogoutResponse(noop=True)
            return AuthLogoutResponse(deleted=True)

        cleared = await clear_token_secret(
            namespace=ns,
            secret_name=secret_name,
            keys=keys,
            keep_client=keep_client,
        )
        await strip_mcpserver_auth_annotations(ark_client, mcp_server_name)
        if cleared is None:
            return AuthLogoutResponse(noop=True)
        return AuthLogoutResponse(cleared_keys=cleared)
