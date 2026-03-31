"""Namespaces API endpoints."""
import logging
import os

from fastapi import APIRouter
from kubernetes_asyncio import client
from kubernetes_asyncio.client.api_client import ApiClient
from kubernetes_asyncio.client.rest import ApiException

from ark_sdk.models.kubernetes import NamespaceResponse, NamespaceListResponse, NamespaceCreateRequest
from ...core.namespace import get_current_context
from ...models.context import ContextResponse, CapabilitiesResponse
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(tags=["namespaces"])


@router.get("/namespaces", response_model=NamespaceListResponse)
@handle_k8s_errors(operation="list", resource_type="namespace")
async def list_namespaces() -> NamespaceListResponse:
    async with ApiClient() as api:
        v1 = client.CoreV1Api(api)

        try:
            namespace_list_response = await v1.list_namespace()
        except ApiException as e:
            if e.status == 403:
                logger.info("No permission to list namespaces, falling back to context namespace")
                current = get_current_context()
                return NamespaceListResponse(
                    items=[NamespaceResponse(name=current["namespace"])],
                    count=1
                )
            raise

        namespace_list = [
            NamespaceResponse(name=ns.metadata.name)
            for ns in namespace_list_response.items
        ]

        return NamespaceListResponse(
            items=namespace_list,
            count=len(namespace_list)
        )


@router.post("/namespaces", response_model=NamespaceResponse)
@handle_k8s_errors(operation="create", resource_type="namespace")
async def create_namespace(body: NamespaceCreateRequest) -> NamespaceResponse:
    async with ApiClient() as api:
        v1 = client.CoreV1Api(api)

        namespace_body = client.V1Namespace(
            metadata=client.V1ObjectMeta(name=body.name)
        )

        created_namespace = await v1.create_namespace(body=namespace_body)

        return NamespaceResponse(
            name=created_namespace.metadata.name
        )


@router.get("/context", response_model=ContextResponse)
async def get_context_endpoint(namespace: str = None) -> ContextResponse:
    current_context = get_current_context()

    target_namespace = namespace or current_context["namespace"]

    read_only_mode = False
    try:
        async with ApiClient() as api:
            v1 = client.CoreV1Api(api)
            ns = await v1.read_namespace(name=target_namespace)

            if ns.metadata.labels and ns.metadata.labels.get("ark.mckinsey.com/demo") == "true":
                read_only_mode = True
    except Exception as e:
        logger.warning(f"Could not check namespace labels for {target_namespace}: {e}")
        read_only_mode = os.getenv("READ_ONLY_MODE", "false").lower() == "true"

    capabilities = CapabilitiesResponse()
    try:
        async with ApiClient() as api:
            auth_api = client.AuthorizationV1Api(api)
            review = client.V1SelfSubjectAccessReview(
                spec=client.V1SelfSubjectAccessReviewSpec(
                    resource_attributes=client.V1ResourceAttributes(
                        verb="create",
                        resource="namespaces",
                    )
                )
            )
            result = await auth_api.create_self_subject_access_review(body=review)
            capabilities.can_create_namespace = result.status.allowed
    except Exception as e:
        logger.warning(f"Could not check namespace creation permission: {e}")

    return ContextResponse(
        namespace=target_namespace,
        cluster=current_context["cluster"],
        read_only_mode=read_only_mode,
        capabilities=capabilities,
    )
