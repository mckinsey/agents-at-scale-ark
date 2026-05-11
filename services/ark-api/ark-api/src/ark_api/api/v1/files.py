"""Unified files dispatch router.

Routes by file purpose:
- /workspace/*           → file-gateway-api (S3-backed persistent storage)
- /model-context/{prov}/* → marketplace executor providing the model-context
                            files API (e.g. executor-openai-file-inputs)

Backends remain separate services with their own semantics (S3 keys vs
provider file IDs). This router is a thin facade that gives the dashboard
a single API surface and a stable place to add cross-cutting concerns
(auth, namespace scoping) later.
"""
import logging
from enum import Enum

from fastapi import APIRouter, HTTPException, Request, Response

from .proxy.proxy import _proxy_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["files"])


WORKSPACE_SERVICE = "file-gateway-api"


class ModelContextProvider(str, Enum):
    OPENAI = "openai"


PROVIDER_SERVICES: dict[ModelContextProvider, str] = {
    ModelContextProvider.OPENAI: "executor-openai-file-inputs:8000",
}


def _workspace_url(path: str) -> str:
    # Pass the path through as-is so callers can hit `files`, `files/{key}/download`,
    # `directories`, etc. on the upstream file-gateway service.
    # NOSONAR - in-cluster service, path comes from FastAPI routing
    return f"http://{WORKSPACE_SERVICE}/{path.lstrip('/')}"


def _model_context_url(provider: ModelContextProvider, file_id: str = "") -> str:
    service = PROVIDER_SERVICES[provider]
    base = f"http://{service}/v1/files"  # NOSONAR - in-cluster service
    return f"{base}/{file_id}" if file_id else base


@router.get("/workspace/{path:path}")
@router.post("/workspace/{path:path}")
@router.put("/workspace/{path:path}")
@router.patch("/workspace/{path:path}")
@router.delete("/workspace/{path:path}")
@router.head("/workspace/{path:path}")
async def workspace_path(path: str, request: Request) -> Response:
    return await _proxy_request(_workspace_url(path), request)


@router.get("/model-context/{provider}")
@router.post("/model-context/{provider}")
async def model_context_root(provider: str, request: Request) -> Response:
    prov = _resolve_provider(provider)
    return await _proxy_request(_model_context_url(prov), request)


@router.get("/model-context/{provider}/{file_id}")
@router.delete("/model-context/{provider}/{file_id}")
async def model_context_file(
    provider: str, file_id: str, request: Request
) -> Response:
    prov = _resolve_provider(provider)
    return await _proxy_request(_model_context_url(prov, file_id), request)


def _resolve_provider(provider: str) -> ModelContextProvider:
    try:
        return ModelContextProvider(provider)
    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown model-context provider '{provider}'. "
            f"Supported: {', '.join(p.value for p in ModelContextProvider)}",
        ) from e
