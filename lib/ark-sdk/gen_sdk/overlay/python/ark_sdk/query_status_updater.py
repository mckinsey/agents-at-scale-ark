import logging
from datetime import datetime, timezone
from typing import Optional

from kubernetes_asyncio import client
from ark_sdk.k8s import create_api_client

from .extensions.query import QueryRef
from .k8s import init_k8s

logger = logging.getLogger(__name__)

ARK_API_GROUP = "ark.mckinsey.com"
ARK_API_VERSION = "v1alpha1"
QUERY_PLURAL = "queries"


class QueryStatusUpdater:
    def __init__(self, query_ref: Optional[QueryRef] = None):
        self._query_ref = query_ref

    async def update_query_phase(
        self, phase: str, reason: str, message: str = ""
    ) -> None:
        if not self._query_ref:
            logger.warning(
                "QueryStatusUpdater: no query ref available, skipping status update"
            )
            return

        await init_k8s()

        body = {
            "status": {
                "phase": phase,
                "conditions": [
                    {
                        "type": "Completed",
                        "status": "False",
                        "reason": reason,
                        "message": message,
                        "lastTransitionTime": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    }
                ],
            }
        }

        try:
            async with create_api_client() as api:
                custom = client.CustomObjectsApi(api)
                await custom.patch_namespaced_custom_object_status(
                    group=ARK_API_GROUP,
                    version=ARK_API_VERSION,
                    namespace=self._query_ref.namespace,
                    plural=QUERY_PLURAL,
                    name=self._query_ref.name,
                    body=body,
                    _content_type="application/merge-patch+json",
                )
                logger.info(
                    "Updated query %s/%s phase to %s (reason=%s)",
                    self._query_ref.namespace,
                    self._query_ref.name,
                    phase,
                    reason,
                )
        except Exception as e:
            logger.error(
                "Failed to update query %s/%s status: %s",
                self._query_ref.namespace,
                self._query_ref.name,
                e,
            )
