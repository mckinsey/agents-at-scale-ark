from fastapi import HTTPException
from kubernetes_asyncio.client.rest import ApiException

from ..models.marketplace_installs import MarketplaceInstallErrorDetail


def install_error(status_code: int, code: str, message: str) -> HTTPException:
    detail = MarketplaceInstallErrorDetail(code=code, message=message)
    return HTTPException(status_code=status_code, detail=detail.model_dump())


def describe_error(error: Exception) -> str:
    if isinstance(error, ApiException):
        return f"{error.status} {error.reason}"
    return f"{type(error).__name__}: {error}"
