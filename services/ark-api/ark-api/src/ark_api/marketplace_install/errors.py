from typing import Optional

from fastapi import HTTPException
from kubernetes_asyncio.client.rest import ApiException

from ..models.marketplace_installs import MarketplaceInstallErrorDetail, MarketplaceInstallRecord


def install_error(
    status_code: int, code: str, message: str, record: Optional[MarketplaceInstallRecord] = None
) -> HTTPException:
    detail = MarketplaceInstallErrorDetail(code=code, message=message, record=record).model_dump(mode="json")
    if record is None:
        del detail["record"]
    return HTTPException(status_code=status_code, detail=detail)


def describe_error(error: Exception) -> str:
    if isinstance(error, ApiException):
        return f"{error.status} {error.reason}"
    return f"{type(error).__name__}: {error}"
