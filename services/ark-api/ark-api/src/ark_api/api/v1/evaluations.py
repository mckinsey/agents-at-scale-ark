"""API routes for Evaluation resources."""

from fastapi import APIRouter, Query
from ark_sdk.models.evaluation_v1alpha1 import EvaluationV1alpha1
from ...core.constants import GROUP
from ark_sdk.client import with_ark_client
from typing import Union, Optional

from ...models.evaluations import (
    EvaluationListResponse,
    EnhancedEvaluationListResponse,
    EvaluationCreateRequest,
    EvaluationUpdateRequest,
    EvaluationDetailResponse,
    EnhancedEvaluationDetailResponse,
    EvaluationType,
    evaluation_to_response,
    evaluation_to_detail_response,
    enhanced_evaluation_to_response,
    enhanced_evaluation_to_detail_response
)
from .exceptions import handle_k8s_errors

router = APIRouter(
    prefix="/evaluations",
    tags=["evaluations"]
)

# CRD configuration
VERSION = "v1alpha1"


@router.get("")
@handle_k8s_errors(operation="list", resource_type="evaluation")
async def list_evaluations(
    enhanced: bool = Query(False, description="Include enhanced metadata from annotations"),
    query_ref: str = Query(None, description="Filter evaluations by query reference name"),
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> Union[EvaluationListResponse, EnhancedEvaluationListResponse]:
    """List all evaluations in a namespace."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.evaluations.a_list()
        
        # Filter by query_ref if provided
        if query_ref:
            filtered_result = []
            for item in result:
                item_dict = item.to_dict()
                # Check if this evaluation has a queryRef that matches
                if (item_dict.get('spec', {}).get('config', {}).get('queryRef', {}).get('name') == query_ref):
                    filtered_result.append(item)
            result = filtered_result
        
        if enhanced:
            evaluations = [enhanced_evaluation_to_response(item.to_dict()) for item in result]
            return EnhancedEvaluationListResponse(
                items=evaluations,
                count=len(evaluations)
            )
        else:
            evaluations = [evaluation_to_response(item.to_dict()) for item in result]
            return EvaluationListResponse(
                items=evaluations,
                count=len(evaluations)
            )


@router.post("", response_model=EvaluationDetailResponse)
@handle_k8s_errors(operation="create", resource_type="evaluation")
async def create_evaluation(
    evaluation: EvaluationCreateRequest,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> EvaluationDetailResponse:
    """Create a new evaluation."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Build the spec dict directly to match new CRD structure
        spec_dict = {
            "type": evaluation.type.value if evaluation.type else "direct",
            "config": {}
        }
        
        # Build evaluator reference
        spec_dict["evaluator"] = {"name": evaluation.evaluator.name}
        if evaluation.evaluator.namespace:
            spec_dict["evaluator"]["namespace"] = evaluation.evaluator.namespace
        if evaluation.evaluator.parameters:
            spec_dict["evaluator"]["parameters"] = evaluation.evaluator.parameters
        
        # Build config based on type
        if evaluation.type == EvaluationType.DIRECT:
            if evaluation.config.input:
                spec_dict["config"]["input"] = evaluation.config.input
            if evaluation.config.output:
                spec_dict["config"]["output"] = evaluation.config.output
                
        elif evaluation.type == EvaluationType.QUERY:
            if evaluation.config.queryRef:
                spec_dict["config"]["queryRef"] = {
                    "name": evaluation.config.queryRef.name
                }
                if evaluation.config.queryRef.namespace:
                    spec_dict["config"]["queryRef"]["namespace"] = evaluation.config.queryRef.namespace
                if evaluation.config.queryRef.responseTarget:
                    spec_dict["config"]["queryRef"]["responseTarget"] = evaluation.config.queryRef.responseTarget
                    
        elif evaluation.type == EvaluationType.BATCH:
            if evaluation.config.evaluations:
                spec_dict["config"]["evaluations"] = []
                for eval_ref in evaluation.config.evaluations:
                    eval_dict = {"name": eval_ref.name}
                    if eval_ref.namespace:
                        eval_dict["namespace"] = eval_ref.namespace
                    spec_dict["config"]["evaluations"].append(eval_dict)
                    
        elif evaluation.type == EvaluationType.EVENT:
            if evaluation.config.rules:
                spec_dict["config"]["rules"] = evaluation.config.rules
        
        # Add optional fields
        if evaluation.ttl:
            spec_dict["ttl"] = evaluation.ttl
        if evaluation.timeout:
            spec_dict["timeout"] = evaluation.timeout
        
        # Create evaluation object using raw dict
        evaluation_obj = EvaluationV1alpha1(
            api_version=f"{GROUP}/{VERSION}",
            kind="Evaluation",
            metadata={
                "name": evaluation.name,
                "namespace": namespace
            },
            spec=spec_dict
        )
        
        result = await ark_client.evaluations.a_create(evaluation_obj)
        return evaluation_to_detail_response(result.to_dict())


@router.get("/{name}")
@handle_k8s_errors(operation="get", resource_type="evaluation")
async def get_evaluation(
    name: str,
    enhanced: bool = Query(False, description="Include enhanced metadata from annotations"),
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> Union[EvaluationDetailResponse, EnhancedEvaluationDetailResponse]:
    """Get details of a specific evaluation."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.evaluations.a_get(name)
        
        if enhanced:
            return enhanced_evaluation_to_detail_response(result.to_dict())
        else:
            return evaluation_to_detail_response(result.to_dict())


@router.put("/{name}", response_model=EvaluationDetailResponse)
@handle_k8s_errors(operation="update", resource_type="evaluation")
async def update_evaluation(
    name: str,
    evaluation: EvaluationUpdateRequest,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> EvaluationDetailResponse:
    """Update an existing evaluation."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Get existing evaluation
        existing = await ark_client.evaluations.a_get(name)
        existing_dict = existing.to_dict()
        
        # Update spec with provided values
        spec = existing_dict.get("spec", {})
        
        if evaluation.evaluator:
            evaluator_dict = {"name": evaluation.evaluator.name}
            if evaluation.evaluator.namespace:
                evaluator_dict["namespace"] = evaluation.evaluator.namespace
            if evaluation.evaluator.parameters:
                evaluator_dict["parameters"] = evaluation.evaluator.parameters
            spec["evaluator"] = evaluator_dict
        
        if evaluation.type:
            spec["type"] = evaluation.type.value
        
        if evaluation.config:
            if "config" not in spec:
                spec["config"] = {}
            
            # Update config based on type
            if evaluation.config.input is not None:
                spec["config"]["input"] = evaluation.config.input
            if evaluation.config.output is not None:
                spec["config"]["output"] = evaluation.config.output
                
            if evaluation.config.queryRef is not None:
                if evaluation.config.queryRef:
                    spec["config"]["queryRef"] = {
                        "name": evaluation.config.queryRef.name
                    }
                    if evaluation.config.queryRef.namespace:
                        spec["config"]["queryRef"]["namespace"] = evaluation.config.queryRef.namespace
                    if evaluation.config.queryRef.responseTarget:
                        spec["config"]["queryRef"]["responseTarget"] = evaluation.config.queryRef.responseTarget
                else:
                    spec["config"].pop("queryRef", None)
            
            if evaluation.config.evaluations is not None:
                if evaluation.config.evaluations:
                    spec["config"]["evaluations"] = []
                    for eval_ref in evaluation.config.evaluations:
                        eval_dict = {"name": eval_ref.name}
                        if eval_ref.namespace:
                            eval_dict["namespace"] = eval_ref.namespace
                        spec["config"]["evaluations"].append(eval_dict)
                else:
                    spec["config"].pop("evaluations", None)
                    
            if evaluation.config.rules is not None:
                spec["config"]["rules"] = evaluation.config.rules
        
        if evaluation.ttl is not None:
            spec["ttl"] = evaluation.ttl
            
        if evaluation.timeout is not None:
            spec["timeout"] = evaluation.timeout
        
        # Update evaluation object
        existing_dict["spec"] = spec
        updated_evaluation = EvaluationV1alpha1.from_dict(existing_dict)
        
        result = await ark_client.evaluations.a_update(updated_evaluation)
        return evaluation_to_detail_response(result.to_dict())


@router.delete("/{name}")
@handle_k8s_errors(operation="delete", resource_type="evaluation")
async def delete_evaluation(name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> dict:
    """Delete an evaluation."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        await ark_client.evaluations.a_delete(name)
        return {"message": f"Evaluation '{name}' deleted successfully"}


@router.patch("/{name}/cancel")
@handle_k8s_errors(operation="cancel", resource_type="evaluation")
async def cancel_evaluation(name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> EvaluationDetailResponse:
    """Cancel a running evaluation."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Get existing evaluation
        existing = await ark_client.evaluations.a_get(name)
        existing_dict = existing.to_dict()
        
        # Set cancel flag in spec
        if "spec" not in existing_dict:
            existing_dict["spec"] = {}
        existing_dict["spec"]["cancel"] = True
        
        # Update evaluation
        updated_evaluation = EvaluationV1alpha1.from_dict(existing_dict)
        result = await ark_client.evaluations.a_update(updated_evaluation)
        
        return evaluation_to_detail_response(result.to_dict())