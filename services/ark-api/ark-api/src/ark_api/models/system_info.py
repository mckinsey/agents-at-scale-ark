from pydantic import BaseModel


class SystemInfo(BaseModel):
    kubernetes_version: str
    system_version: str
    argo_server_configured: bool