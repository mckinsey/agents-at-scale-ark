from typing import Optional

from pydantic import BaseModel


class SystemInfo(BaseModel):
    kubernetes_version: str
    system_version: str
    argo_server_configured: bool
    argo_server_version_supported: Optional[bool] = None
