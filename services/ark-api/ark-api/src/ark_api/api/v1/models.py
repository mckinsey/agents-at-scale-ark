"""Kubernetes models API endpoints."""
import logging

from fastapi import APIRouter, Query
from typing import Optional

from ark_sdk.client import with_ark_client

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
    
    Args:
        namespace: The namespace to create the model in
        body: The model creation request
        
    Returns:
        ModelDetailResponse: The created model details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Build the config based on the provider
        config_dict = {}

        if body.config.openai and body.provider == PROVIDER_OPENAI:
            config_dict[PROVIDER_OPENAI] = {}
            # Convert to the expected format with value/valueFrom
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
                elif isinstance(value, dict) and ("value" in value or "valueFrom" in value):
                    config_dict[PROVIDER_AZURE][field] = value
                elif isinstance(value, str):
                    config_dict[PROVIDER_AZURE][field] = {"value": value}

        elif body.config.bedrock and body.provider == PROVIDER_BEDROCK:
            config_dict[PROVIDER_BEDROCK] = {}
            for field, value in body.config.bedrock.model_dump(by_alias=True).items():
                if value is not None:
                    # Handle non-ValueSource fields (maxTokens, temperature)
                    if field in ["maxTokens", "temperature"]:
                        config_dict[PROVIDER_BEDROCK][field] = value
                    elif isinstance(value, dict) and ("value" in value or "valueFrom" in value):
                        config_dict[PROVIDER_BEDROCK][field] = value
                    elif isinstance(value, str):
                        config_dict[PROVIDER_BEDROCK][field] = {"value": value}

        # Build the model spec
        model_spec = {
            "type": MODEL_TYPE_COMPLETIONS,
            "provider": body.provider,
            "model": {
                "value": body.model
            },
            "config": config_dict
        }
        
        # Create the ModelV1alpha1 object
        from ark_sdk.models.model_v1alpha1 import ModelV1alpha1
        from ark_sdk.models.model_v1alpha1_spec import ModelV1alpha1Spec
        
        model_resource = ModelV1alpha1(
            metadata={
                "name": body.name,
                "namespace": namespace
            },
            spec=ModelV1alpha1Spec(**model_spec)
        )
        
        created_model = await ark_client.models.a_create(model_resource)
        
        return model_to_detail_response(created_model.to_dict())


@router.get("/{model_name}", response_model=ModelDetailResponse)
@handle_k8s_errors(operation="get", resource_type="model")
async def get_model(model_name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> ModelDetailResponse:
    """
    Get a specific Model CR by name.
    
    Args:
        namespace: The namespace to get the model from
        model_name: The name of the model
        
    Returns:
        ModelDetailResponse: The model details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        model = await ark_client.models.a_get(model_name)
        
        return model_to_detail_response(model.to_dict())


@router.put("/{model_name}", response_model=ModelDetailResponse)
@handle_k8s_errors(operation="update", resource_type="model")
async def update_model(model_name: str, body: ModelUpdateRequest, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> ModelDetailResponse:
    """
    Update a Model CR by name.
    
    Args:
        namespace: The namespace containing the model
        model_name: The name of the model
        body: The model update request
        
    Returns:
        ModelDetailResponse: The updated model details
    """
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Get the existing model first
        existing_model = await ark_client.models.a_get(model_name)
        existing_spec = existing_model.to_dict()["spec"]
        provider = get_provider_from_spec(existing_spec)

        # Update only the fields that are provided
        if body.model is not None:
            existing_spec["model"] = {"value": body.model}

        if body.config is not None:
            # Build the config based on the provider
            config_dict = {}

            if body.config.openai and provider == PROVIDER_OPENAI:
                config_dict[PROVIDER_OPENAI] = {}
                for field, value in body.config.openai.model_dump(by_alias=True, exclude_none=True).items():
                    if field == "headers" and value is not None:
                        config_dict[PROVIDER_OPENAI][field] = value
                    elif isinstance(value, dict) and ("value" in value or "valueFrom" in value):
                        config_dict[PROVIDER_OPENAI][field] = value
                    elif isinstance(value, str):
                        config_dict[PROVIDER_OPENAI][field] = {"value": value}

            elif body.config.azure and provider == PROVIDER_AZURE:
                config_dict[PROVIDER_AZURE] = {}
                for field, value in body.config.azure.model_dump(by_alias=True, exclude_none=True).items():
                    if field == "headers" and value is not None:
                        config_dict[PROVIDER_AZURE][field] = value
                    elif isinstance(value, dict) and ("value" in value or "valueFrom" in value):
                        config_dict[PROVIDER_AZURE][field] = value
                    elif isinstance(value, str):
                        config_dict[PROVIDER_AZURE][field] = {"value": value}

            elif body.config.bedrock and provider == PROVIDER_BEDROCK:
                config_dict[PROVIDER_BEDROCK] = {}
                for field, value in body.config.bedrock.model_dump(by_alias=True).items():
                    if value is not None:
                        # Handle non-ValueSource fields (maxTokens, temperature)
                        if field in ["maxTokens", "temperature"]:
                            config_dict[PROVIDER_BEDROCK][field] = value
                        elif isinstance(value, dict) and ("value" in value or "valueFrom" in value):
                            config_dict[PROVIDER_BEDROCK][field] = value
                        elif isinstance(value, str):
                            config_dict[PROVIDER_BEDROCK][field] = {"value": value}

            existing_spec["config"] = config_dict
        
        # Update the model - need to update the entire resource object
        existing_model_dict = existing_model.to_dict()
        existing_model_dict["spec"] = existing_spec
        
        from ark_sdk.models.model_v1alpha1 import ModelV1alpha1
        updated_resource = ModelV1alpha1(**existing_model_dict)
        
        updated_model = await ark_client.models.a_update(updated_resource)
        
        return model_to_detail_response(updated_model.to_dict())


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
