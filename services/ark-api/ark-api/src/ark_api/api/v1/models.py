"""Kubernetes models API endpoints."""
import logging

from fastapi import APIRouter, Query
from typing import Optional

from kubernetes_asyncio.client import CustomObjectsApi
from kubernetes_asyncio.client.api_client import ApiClient

from ark_sdk.client import with_ark_client
from ark_sdk.k8s import get_context

from ...models.models import (
    ModelResponse,
    ModelListResponse,
    ModelCreateRequest,
    ModelUpdateRequest,
    ModelDetailResponse,
    DEPRECATED_PROVIDER_TYPES,
    PROVIDER_OPENAI,
    PROVIDER_AZURE,
    PROVIDER_BEDROCK,
    MODEL_TYPE_COMPLETIONS,
)
from ...models.common import extract_availability_from_conditions
from .exceptions import handle_k8s_errors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/models", tags=["models"])

# CRD configuration
VERSION = "v1alpha1"
MODEL_CRD_GROUP = "ark.mckinsey.com"
MODEL_CRD_PLURAL = "models"


def get_provider_from_spec(spec: dict) -> str:
    """Extract provider from spec, with fallback for deprecated format."""
    provider = spec.get("provider", "")
    if provider:
        return provider
    # Fallback: check if type contains a deprecated provider value
    type_value = spec.get("type", "")
    if type_value in DEPRECATED_PROVIDER_TYPES:
        return type_value
    return ""


def model_to_response(model: dict) -> ModelResponse:
    """Convert a Kubernetes Model CR to a response model."""
    metadata = model.get("metadata", {})
    spec = model.get("spec", {})
    status = model.get("status", {})

    # Extract availability from conditions
    conditions = status.get("conditions", [])
    availability = extract_availability_from_conditions(conditions, "ModelAvailable")

    return ModelResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        provider=get_provider_from_spec(spec),
        model=spec.get("model", {}).get("value", "") if isinstance(spec.get("model"), dict) else "",
        available=availability,
        annotations=metadata.get("annotations", {})
    )


def model_to_detail_response(model: dict) -> ModelDetailResponse:
    """Convert a Kubernetes Model CR to a detailed response model."""
    metadata = model.get("metadata", {})
    spec = model.get("spec", {})
    status = model.get("status", {})

    # Extract availability from conditions
    conditions = status.get("conditions", [])
    availability = extract_availability_from_conditions(conditions, "ModelAvailable")
    
    # Process config to preserve value/valueFrom structure
    raw_config = spec.get("config", {})
    processed_config = {}

    for provider, provider_config in raw_config.items():
        if isinstance(provider_config, dict):
            processed_config[provider] = {}
            for key, value_obj in provider_config.items():
                if key == "headers" and isinstance(value_obj, list):
                    # Preserve headers as a list structure, not wrapped in value
                    processed_config[provider][key] = value_obj
                elif isinstance(value_obj, dict):
                    # Preserve the full structure for both value and valueFrom
                    processed_config[provider][key] = value_obj
                else:
                    # If it's already a string, wrap it in a value structure
                    processed_config[provider][key] = {"value": str(value_obj)}
    
    return ModelDetailResponse(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        provider=get_provider_from_spec(spec),
        model=spec.get("model", {}).get("value", "") if isinstance(spec.get("model"), dict) else spec.get("model", ""),
        config=processed_config,
        available=availability,
        resolved_address=status.get("resolvedAddress"),
        annotations=metadata.get("annotations", {})
    )


@router.get("", response_model=ModelListResponse)
@handle_k8s_errors(operation="list", resource_type="model")
async def list_models(namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> ModelListResponse:
    """
    List all Model CRs in a namespace.
    
    Args:
        namespace: The namespace to list models from
        
    Returns:
        ModelListResponse: List of all models in the namespace
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        models = await ark_client.models.a_list()
        
        model_list = []
        for model in models:
            model_list.append(model_to_response(model.to_dict()))
        
        return ModelListResponse(
            items=model_list,
            count=len(model_list)
        )


@router.post("", response_model=ModelDetailResponse)
@handle_k8s_errors(operation="create", resource_type="model")
async def create_model(body: ModelCreateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> ModelDetailResponse:
    """
    Create a new Model CR.

    Uses CustomObjectsApi so the full spec (e.g. config.azure.auth for
    managed/workload identity) is stored in the cluster.
    
    Args:
        namespace: The namespace to create the model in
        body: The model creation request
        
    Returns:
        ModelDetailResponse: The created model details
    """
    if namespace is None:
        namespace = get_context()["namespace"]

    config_dict = {}
    if body.config.openai and body.provider == PROVIDER_OPENAI:
        config_dict[PROVIDER_OPENAI] = {}
        for field, value in body.config.openai.model_dump(by_alias=True, exclude_none=True).items():
            if field == "headers" and value is not None:
                config_dict[PROVIDER_OPENAI][field] = value
            elif isinstance(value, dict) and ("value" in value or "valueFrom" in value):
                config_dict[PROVIDER_OPENAI][field] = value
            elif isinstance(value, str):
                config_dict[PROVIDER_OPENAI][field] = {"value": value}

    elif body.config.azure and body.provider == PROVIDER_AZURE:
        config_dict[PROVIDER_AZURE] = {}
        for field, value in body.config.azure.model_dump(by_alias=True, exclude_none=True).items():
            if field == "headers" and value is not None:
                config_dict[PROVIDER_AZURE][field] = value
            elif field == "auth" and value is not None:
                config_dict[PROVIDER_AZURE][field] = value
            elif isinstance(value, dict) and ("value" in value or "valueFrom" in value):
                config_dict[PROVIDER_AZURE][field] = value
            elif isinstance(value, str):
                config_dict[PROVIDER_AZURE][field] = {"value": value}
        if "apiKey" not in config_dict[PROVIDER_AZURE] and "auth" in config_dict[PROVIDER_AZURE]:
            auth = config_dict[PROVIDER_AZURE]["auth"]
            if isinstance(auth, dict):
                if auth.get("apiKey") is not None:
                    config_dict[PROVIDER_AZURE]["apiKey"] = auth["apiKey"]
                elif auth.get("managedIdentity") is not None or auth.get("workloadIdentity") is not None:
                    config_dict[PROVIDER_AZURE]["apiKey"] = {"value": ""}

    elif body.config.bedrock and body.provider == PROVIDER_BEDROCK:
        config_dict[PROVIDER_BEDROCK] = {}
        for field, value in body.config.bedrock.model_dump(by_alias=True).items():
            if value is not None:
                if field in ["maxTokens", "temperature"]:
                    config_dict[PROVIDER_BEDROCK][field] = value
                elif isinstance(value, dict) and ("value" in value or "valueFrom" in value):
                    config_dict[PROVIDER_BEDROCK][field] = value
                elif isinstance(value, str):
                    config_dict[PROVIDER_BEDROCK][field] = {"value": value}

    model_spec = {
        "type": MODEL_TYPE_COMPLETIONS,
        "provider": body.provider,
        "model": {"value": body.model},
        "config": config_dict,
    }
    cr_body = {
        "apiVersion": f"{MODEL_CRD_GROUP}/{VERSION}",
        "kind": "Model",
        "metadata": {"name": body.name, "namespace": namespace},
        "spec": model_spec,
    }
    async with ApiClient() as api_client:
        custom_api = CustomObjectsApi(api_client)
        created_cr = await custom_api.create_namespaced_custom_object(
            group=MODEL_CRD_GROUP,
            version=VERSION,
            namespace=namespace,
            plural=MODEL_CRD_PLURAL,
            body=cr_body,
        )
    return model_to_detail_response(created_cr)


@router.get("/{model_name}", response_model=ModelDetailResponse)
@handle_k8s_errors(operation="get", resource_type="model")
async def get_model(model_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> ModelDetailResponse:
    """
    Get a specific Model CR by name.
    
    Uses the raw Kubernetes CustomObjectsApi so the response includes the full
    spec (e.g. config.azure.auth for managed/workload identity).
    
    Args:
        namespace: The namespace to get the model from
        model_name: The name of the model
        
    Returns:
        ModelDetailResponse: The model details
    """
    if namespace is None:
        namespace = get_context()["namespace"]
    async with ApiClient() as api_client:
        custom_api = CustomObjectsApi(api_client)
        model_cr = await custom_api.get_namespaced_custom_object(
            group=MODEL_CRD_GROUP,
            version=VERSION,
            namespace=namespace,
            plural=MODEL_CRD_PLURAL,
            name=model_name,
        )
    return model_to_detail_response(model_cr)


def _build_config_dict_from_body(body_config, provider: str) -> dict:
    """Build config dict from request body for update; preserves auth.managedIdentity.clientId etc."""
    config_dict = {}
    if body_config.openai and provider == PROVIDER_OPENAI:
        config_dict[PROVIDER_OPENAI] = {}
        for field, value in body_config.openai.model_dump(by_alias=True, exclude_none=True).items():
            if field == "headers" and value is not None:
                config_dict[PROVIDER_OPENAI][field] = value
            elif isinstance(value, dict) and ("value" in value or "valueFrom" in value):
                config_dict[PROVIDER_OPENAI][field] = value
            elif isinstance(value, str):
                config_dict[PROVIDER_OPENAI][field] = {"value": value}
    elif body_config.azure and provider == PROVIDER_AZURE:
        config_dict[PROVIDER_AZURE] = {}
        for field, value in body_config.azure.model_dump(by_alias=True, exclude_none=True).items():
            if field == "headers" and value is not None:
                config_dict[PROVIDER_AZURE][field] = value
            elif field == "auth" and value is not None:
                config_dict[PROVIDER_AZURE][field] = value
            elif isinstance(value, dict) and ("value" in value or "valueFrom" in value):
                config_dict[PROVIDER_AZURE][field] = value
            elif isinstance(value, str):
                config_dict[PROVIDER_AZURE][field] = {"value": value}
        if "apiKey" not in config_dict[PROVIDER_AZURE] and "auth" in config_dict[PROVIDER_AZURE]:
            auth = config_dict[PROVIDER_AZURE]["auth"]
            if isinstance(auth, dict):
                if auth.get("apiKey") is not None:
                    config_dict[PROVIDER_AZURE]["apiKey"] = auth["apiKey"]
                elif auth.get("managedIdentity") is not None or auth.get("workloadIdentity") is not None:
                    config_dict[PROVIDER_AZURE]["apiKey"] = {"value": ""}
    elif body_config.bedrock and provider == PROVIDER_BEDROCK:
        config_dict[PROVIDER_BEDROCK] = {}
        for field, value in body_config.bedrock.model_dump(by_alias=True).items():
            if value is not None:
                if field in ["maxTokens", "temperature"]:
                    config_dict[PROVIDER_BEDROCK][field] = value
                elif isinstance(value, dict) and ("value" in value or "valueFrom" in value):
                    config_dict[PROVIDER_BEDROCK][field] = value
                elif isinstance(value, str):
                    config_dict[PROVIDER_BEDROCK][field] = {"value": value}
    return config_dict


@router.put("/{model_name}", response_model=ModelDetailResponse)
@handle_k8s_errors(operation="update", resource_type="model")
async def update_model(model_name: str, body: ModelUpdateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> ModelDetailResponse:
    """
    Update a Model CR by name.

    Uses CustomObjectsApi so the full spec (e.g. auth.managedIdentity.clientId)
    is persisted without being dropped by the SDK.
    """
    if namespace is None:
        namespace = get_context()["namespace"]
    async with ApiClient() as api_client:
        custom_api = CustomObjectsApi(api_client)
        existing_cr = await custom_api.get_namespaced_custom_object(
            group=MODEL_CRD_GROUP,
            version=VERSION,
            namespace=namespace,
            plural=MODEL_CRD_PLURAL,
            name=model_name,
        )
    spec = existing_cr.get("spec", {})
    provider = get_provider_from_spec(spec)

    if body.model is not None:
        spec["model"] = {"value": body.model}

    if body.config is not None:
        spec["config"] = _build_config_dict_from_body(body.config, provider)

    existing_cr["spec"] = spec
    async with ApiClient() as api_client:
        custom_api = CustomObjectsApi(api_client)
        updated_cr = await custom_api.replace_namespaced_custom_object(
            group=MODEL_CRD_GROUP,
            version=VERSION,
            namespace=namespace,
            plural=MODEL_CRD_PLURAL,
            name=model_name,
            body=existing_cr,
        )
    return model_to_detail_response(updated_cr)


@router.delete("/{model_name}", status_code=204)
@handle_k8s_errors(operation="delete", resource_type="model")
async def delete_model(model_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> None:
    """
    Delete a Model CR by name.
    
    Args:
        namespace: The namespace containing the model
        model_name: The name of the model
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        await ark_client.models.a_delete(model_name)
