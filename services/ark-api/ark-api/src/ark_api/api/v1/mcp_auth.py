"""MCP authorization endpoints (auth/start, auth/callback, auth/status, auth/logout)."""
from __future__ import annotations

import html
import logging
from typing import Optional
from urllib.parse import quote, urlencode

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response

from ark_sdk.client import with_ark_client

from ...core.mcp_auth_config import McpAuthConfigError, get_mcp_auth_config
from ...models.mcp_auth import (
    AuthLogoutRequest,
    AuthLogoutResponse,
    AuthStartRequest,
    AuthStartResponse,
    AuthStatusResponse,
)
from ...services.mcp_auth_persistence import (
    SecretKeys,
    SecretPatchPayload,
    annotate_mcpserver_authorized,
    clear_token_secret,
    compute_expires_at,
    delete_token_secret,
    ensure_mcpserver_token_secret_ref,
    flow_deadline_rfc3339,
    mark_flow_authorized,
    mark_flow_failed,
    read_cached_client_creds,
    read_flow_state_by_auth_id,
    read_flow_state_by_state_param,
    strip_mcpserver_auth_annotations,
    write_flow_state,
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
from ...services.mcp_auth_log_filter import SensitiveDataFilter
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)
logger.addFilter(SensitiveDataFilter())

router = APIRouter(tags=["mcp-auth"])

VERSION = "v1alpha1"
DEFAULT_AUTHORIZED_BY = "cli"
MAX_AUTH_ERROR_DESC = 200
TOKEN_EXCHANGE_FAILED_CODE = "token_exchange_failed"
INVALID_REQUEST_CODE = "invalid_request"


def _resolve_caller_identity(request: Request) -> str:
    """Resolve the caller's identity from the impersonation middleware.

    Returns the authenticated user's resolved identity when present, else the
    literal string ``cli`` (in-cluster Service path, or impersonation disabled).
    """
    identity = getattr(request.state, "user_identity", None)
    if identity is not None and getattr(identity, "username", None):
        return identity.username
    return DEFAULT_AUTHORIZED_BY


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


def _read_authorization_status(mcp_server):
    status = mcp_server.status
    if not status or not status.authorization:
        return None
    return status.authorization


def _read_token_secret_ref(mcp_server):
    spec = mcp_server.spec
    if not spec or not spec.authorization:
        return None
    return spec.authorization.token_secret_ref


def _get_available_condition_message(mcp_server) -> Optional[str]:
    status = mcp_server.status
    if not status or not status.conditions:
        return None
    for cond in status.conditions:
        if cond.type == "Available":
            return cond.message
    return None


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


@router.post(
    "/mcp-servers/{mcp_server_name}/auth/start",
    response_model=AuthStartResponse,
)
@handle_k8s_errors(operation="start auth", resource_type="mcp_server")
async def start_mcp_auth(
    request: Request,
    mcp_server_name: str,
    body: AuthStartRequest,
    namespace: Optional[str] = Query(
        None, description="Namespace for this request (defaults to current context)"
    ),
) -> AuthStartResponse:
    cfg = _get_config_or_503()
    redirect_uri = cfg.public_callback_url
    force = bool(body.force)
    caller_identity = _resolve_caller_identity(request)

    async with with_ark_client(namespace, VERSION) as ark_client:
        mcp_server = await ark_client.mcpservers.a_get(mcp_server_name)
        mcp_dict = mcp_server.to_dict()
        ns = (mcp_dict.get("metadata") or {}).get("namespace") or namespace

        authorization = _read_authorization_status(mcp_server)
        if not authorization:
            raise HTTPException(
                status_code=422,
                detail="MCPServer has no status.authorization metadata",
            )

        state_value = authorization.state

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

        token_endpoint = authorization.token_endpoint
        authorization_endpoint = authorization.authorization_endpoint
        registration_endpoint = authorization.registration_endpoint
        resource = authorization.resource
        if not authorization_endpoint or not token_endpoint or not resource:
            raise HTTPException(
                status_code=422,
                detail=(
                    "MCPServer status.authorization is missing required fields "
                    "(authorizationEndpoint, tokenEndpoint, resource)"
                ),
            )

        token_ref = _read_token_secret_ref(mcp_server)
        if not token_ref or not token_ref.name:
            await ensure_mcpserver_token_secret_ref(ark_client, mcp_server_name)
            mcp_server = await ark_client.mcpservers.a_get(mcp_server_name)
            token_ref = _read_token_secret_ref(mcp_server)
        if not token_ref or not token_ref.name:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"could not provision spec.authorization.tokenSecretRef.name "
                    f"on MCPServer {mcp_server_name!r}"
                ),
            )
        secret_name = token_ref.name
        keys = SecretKeys.from_typed_ref(token_ref)

        cached = await read_cached_client_creds(ns, secret_name, keys)
        do_dcr = force or not cached.both_present
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
            advertised = authorization.scopes_supported
            scopes = list(advertised) if advertised else None

        verifier = generate_verifier()
        challenge = derive_challenge(verifier)
        state_random = generate_state()
        auth_id = generate_auth_id()
        external_state = f"{ns}.{state_random}"

        flow_expires = flow_deadline_rfc3339(cfg.cache_ttl_seconds)

        await write_flow_state(
            namespace=ns,
            secret_name=secret_name,
            auth_id=auth_id,
            state_param=state_random,
            verifier=verifier,
            expires_at=flow_expires,
            caller_identity=caller_identity,
            server_name=mcp_server_name,
            client_id=client_id,
            client_secret=client_secret,
            keys=keys,
            redirect_on_complete=bool(body.redirect_on_complete),
        )

        authorization_url = _build_authorization_url(
            authorization_endpoint=authorization_endpoint,
            client_id=client_id,
            redirect_uri=redirect_uri,
            state=external_state,
            code_challenge=challenge,
            resource=resource,
            scopes=scopes,
        )

        return AuthStartResponse(
            auth_id=auth_id,
            authorization_url=authorization_url,
            flow_expires_at=flow_expires,
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


def _dashboard_redirect(cfg, params: list[tuple[str, str]]) -> RedirectResponse:
    """Build a 302 to the dashboard /mcp page.

    The host and path come solely from ARK_API_DASHBOARD_URL; only the query
    params (built from trusted cache values) vary, so this is not an
    open-redirect vector. Values are URL-encoded with %20 for spaces.
    """
    base = cfg.dashboard_mcp_url()
    location = f"{base}?{urlencode(params, quote_via=quote)}"
    return RedirectResponse(url=location, status_code=302)


def _dashboard_success_redirect(cfg, *, name: str, namespace: str, auth_id: str) -> RedirectResponse:
    return _dashboard_redirect(
        cfg,
        [("authorized", name), ("namespace", namespace), ("auth_id", auth_id)],
    )


def _dashboard_error_redirect(
    cfg, *, name: str, namespace: str, code: str, desc: Optional[str]
) -> RedirectResponse:
    params = [("authorized", name), ("namespace", namespace), ("auth_error", code)]
    if desc:
        params.append(("auth_error_desc", desc[:MAX_AUTH_ERROR_DESC]))
    return _dashboard_redirect(cfg, params)


def _cache_miss_response(cfg) -> Response:
    """Response when the flow's client is unknown (missing/expired/replayed state)."""
    if cfg.is_dashboard_url_set:
        return _dashboard_redirect(cfg, [("auth_error", "expired")])
    return _html_response(
        title="Authorization failed",
        body="Unknown or expired state",
        status_code=400,
    )


@router.get("/mcp/auth/callback")
async def mcp_auth_callback(
    request: Request,
    state: Optional[str] = Query(None),
    code: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
) -> Response:
    cfg = _get_config_or_503()

    if not state:
        return _html_response(
            title="Authorization failed",
            body="Missing state parameter",
            status_code=400,
        )

    dot = state.find(".")
    if dot < 1:
        return _cache_miss_response(cfg)
    cb_namespace = state[:dot]
    state_random = state[dot + 1:]

    flow = await read_flow_state_by_state_param(cb_namespace, state_random)
    if flow is None or flow.is_expired or not flow.secret_name:
        return _cache_miss_response(cfg)

    secret_ns = flow.namespace
    secret_name_for_flow = flow.secret_name
    use_redirect = flow.redirect_on_complete and cfg.is_dashboard_url_set
    name = flow.server_name
    ns = flow.namespace

    if error:
        message = f"{error}: {error_description}" if error_description else error
        await mark_flow_failed(secret_ns, secret_name_for_flow, message)
        if use_redirect:
            return _dashboard_error_redirect(
                cfg, name=name, namespace=ns, code=error, desc=error_description
            )
        return _html_response(
            title="Authorization failed",
            body=message,
            status_code=400,
        )

    if not code:
        await mark_flow_failed(secret_ns, secret_name_for_flow, "missing authorization code")
        if use_redirect:
            return _dashboard_error_redirect(
                cfg,
                name=name,
                namespace=ns,
                code=INVALID_REQUEST_CODE,
                desc="Missing authorization code",
            )
        return _html_response(
            title="Authorization failed",
            body="Missing authorization code",
            status_code=400,
        )

    async with with_ark_client(secret_ns, VERSION) as ark_client:
        mcp_server = await ark_client.mcpservers.a_get(flow.server_name)
        authorization = _read_authorization_status(mcp_server)
        token_ref = _read_token_secret_ref(mcp_server)

        if (
            not authorization
            or not authorization.token_endpoint
            or not authorization.resource
            or not token_ref
            or not token_ref.name
        ):
            await mark_flow_failed(secret_ns, secret_name_for_flow, "MCPServer authorization metadata went missing")
            if use_redirect:
                return _dashboard_error_redirect(
                    cfg,
                    name=name,
                    namespace=ns,
                    code=INVALID_REQUEST_CODE,
                    desc="MCPServer authorization metadata went missing",
                )
            return _html_response(
                title="Authorization failed",
                body="MCPServer authorization metadata went missing",
                status_code=400,
            )
        secret_name = token_ref.name
        keys = SecretKeys.from_typed_ref(token_ref)

        try:
            token = await exchange_code(
                token_endpoint=authorization.token_endpoint,
                code=code,
                redirect_uri=cfg.public_callback_url,
                code_verifier=flow.verifier,
                resource=authorization.resource,
                client_id=flow.client_id,
                client_secret=flow.client_secret,
                timeout_seconds=cfg.token_timeout_seconds,
            )
        except TokenExchangeError as exc:
            await mark_flow_failed(secret_ns, secret_name_for_flow, str(exc))
            if use_redirect:
                return _dashboard_error_redirect(
                    cfg,
                    name=name,
                    namespace=ns,
                    code=TOKEN_EXCHANGE_FAILED_CODE,
                    desc=str(exc),
                )
            return _html_response(
                title="Authorization failed",
                body=str(exc),
                status_code=400,
            )

        expires_at = compute_expires_at(token.expires_in)
        await write_token_secret(
            namespace=secret_ns,
            secret_name=secret_name,
            keys=keys,
            payload=SecretPatchPayload(
                access_token=token.access_token,
                refresh_token=token.refresh_token,
                expires_at=expires_at,
                client_id=flow.client_id,
                client_secret=flow.client_secret,
            ),
        )
        await annotate_mcpserver_authorized(
            ark_client, flow.server_name, flow.caller_identity
        )
        await mark_flow_authorized(secret_ns, secret_name_for_flow, expires_at)

    if use_redirect:
        return _dashboard_success_redirect(
            cfg, name=name, namespace=ns, auth_id=flow.auth_id
        )
    return _html_response(
        title="Authorization complete",
        body=f"Authorization for {flow.server_name} succeeded.",
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
    _get_config_or_503()

    async with with_ark_client(namespace, VERSION) as ark_client:
        mcp_server = await ark_client.mcpservers.a_get(mcp_server_name)
        authorization = _read_authorization_status(mcp_server)
        server_state = authorization.state if authorization else None
        condition_message = _get_available_condition_message(mcp_server)

        token_ref = _read_token_secret_ref(mcp_server)
        if not token_ref or not token_ref.name:
            return AuthStatusResponse(
                state="expired",
                message="MCPServer has no tokenSecretRef",
                controller_state=server_state,
                controller_message=condition_message,
            )
        secret_name = token_ref.name
        mcp_dict = mcp_server.to_dict()
        ns = (mcp_dict.get("metadata") or {}).get("namespace") or namespace

    flow = await read_flow_state_by_auth_id(ns, secret_name)
    if flow is None or flow.auth_id != auth_id:
        return AuthStatusResponse(
            state="expired",
            message="Unknown or expired auth_id",
            controller_state=server_state,
            controller_message=condition_message,
        )

    if flow.is_expired and flow.status == "pending":
        return AuthStatusResponse(
            state="expired",
            message="Flow expired",
            controller_state=server_state,
            controller_message=condition_message,
        )

    if flow.status == "failed":
        return AuthStatusResponse(
            state="failed",
            message=flow.message,
            controller_state=server_state,
            controller_message=condition_message,
        )

    if flow.status == "authorized":
        if server_state == "Authorized":
            return AuthStatusResponse(
                state="authorized",
                expires_at=flow.token_expires_at or None,
                controller_state=server_state,
                controller_message=condition_message,
            )
        return AuthStatusResponse(
            state="pending",
            message="Token written; awaiting MCPServer status reconciliation",
            controller_state=server_state,
            controller_message=condition_message,
        )

    return AuthStatusResponse(
        state="pending",
        controller_state=server_state,
        controller_message=condition_message,
    )


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
        token_ref = _read_token_secret_ref(mcp_server)
        if not token_ref or not token_ref.name:
            await strip_mcpserver_auth_annotations(ark_client, mcp_server_name)
            return AuthLogoutResponse(noop=True)
        secret_name = token_ref.name
        keys = SecretKeys.from_typed_ref(token_ref)

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
