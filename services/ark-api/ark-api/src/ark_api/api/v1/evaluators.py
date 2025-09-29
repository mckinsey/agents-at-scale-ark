"""API routes for Evaluator resources."""

from fastapi import APIRouter, Query
from typing import Optional
from ark_sdk.models.evaluator_v1alpha1 import EvaluatorV1alpha1
from ark_sdk.models.evaluator_v1alpha1_spec import EvaluatorV1alpha1Spec
from ark_sdk.models.evaluator_v1alpha1_spec_address import EvaluatorV1alpha1SpecAddress
from ark_sdk.models.agent_v1alpha1_spec_parameters_inner import AgentV1alpha1SpecParametersInner as EvaluatorV1alpha1SpecParametersInner
from ark_sdk.models.agent_v1alpha1_spec_parameters_inner_value_from import AgentV1alpha1SpecParametersInnerValueFrom as EvaluatorV1alpha1SpecParametersInnerValueFrom
from ark_sdk.models.evaluator_v1alpha1_spec_selector import EvaluatorV1alpha1SpecSelector

from ...core.constants import GROUP
from ark_sdk.client import with_ark_client

from ...models.evaluators import (
    EvaluatorListResponse,
    EvaluatorCreateRequest,
    EvaluatorUpdateRequest,
    EvaluatorDetailResponse,
    evaluator_to_response,
    evaluator_to_detail_response
)
from .exceptions import handle_k8s_errors

router = APIRouter(
    prefix="/evaluators",
    tags=["evaluators"]
)

# CRD configuration
VERSION = "v1alpha1"


@router.get("", response_model=EvaluatorListResponse)
@handle_k8s_errors(operation="list", resource_type="evaluator")
async def list_evaluators(namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> EvaluatorListResponse:
    """List all evaluators in a namespace."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.evaluators.a_list()
        
        evaluators = [evaluator_to_response(item.to_dict()) for item in result]
        
        return EvaluatorListResponse(
            items=evaluators,
            count=len(evaluators)
        )


@router.post("", response_model=EvaluatorDetailResponse)
@handle_k8s_errors(operation="create", resource_type="evaluator")
async def create_evaluator(
    evaluator: EvaluatorCreateRequest,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> EvaluatorDetailResponse:
    """Create a new evaluator."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Build address spec
        address_spec = {}
        if evaluator.address.value:
            address_spec["value"] = evaluator.address.value
        if evaluator.address.valueFrom:
            value_from = {}
            if evaluator.address.valueFrom.configMapKeyRef:
                value_from["configMapKeyRef"] = {
                    "key": evaluator.address.valueFrom.configMapKeyRef.key,
                    "name": evaluator.address.valueFrom.configMapKeyRef.name
                }
                if evaluator.address.valueFrom.configMapKeyRef.optional is not None:
                    value_from["configMapKeyRef"]["optional"] = evaluator.address.valueFrom.configMapKeyRef.optional
            if evaluator.address.valueFrom.secretKeyRef:
                value_from["secretKeyRef"] = {
                    "key": evaluator.address.valueFrom.secretKeyRef.key,
                    "name": evaluator.address.valueFrom.secretKeyRef.name
                }
                if evaluator.address.valueFrom.secretKeyRef.optional is not None:
                    value_from["secretKeyRef"]["optional"] = evaluator.address.valueFrom.secretKeyRef.optional
            address_spec["valueFrom"] = value_from
        
        spec = EvaluatorV1alpha1Spec(
            address=EvaluatorV1alpha1SpecAddress.from_dict(address_spec)
        )
        
        # Add optional fields
        if evaluator.description:
            spec.description = evaluator.description
        
        
        if evaluator.parameters:
            params = []
            for p in evaluator.parameters:
                param_dict = {"name": p.name}
                if p.value:
                    param_dict["value"] = p.value
                if p.valueFrom:
                    value_from = {}
                    if p.valueFrom.configMapKeyRef:
                        value_from["configMapKeyRef"] = {
                            "key": p.valueFrom.configMapKeyRef.key,
                            "name": p.valueFrom.configMapKeyRef.name
                        }
                        if p.valueFrom.configMapKeyRef.optional is not None:
                            value_from["configMapKeyRef"]["optional"] = p.valueFrom.configMapKeyRef.optional
                    if p.valueFrom.secretKeyRef:
                        value_from["secretKeyRef"] = {
                            "key": p.valueFrom.secretKeyRef.key,
                            "name": p.valueFrom.secretKeyRef.name
                        }
                        if p.valueFrom.secretKeyRef.optional is not None:
                            value_from["secretKeyRef"]["optional"] = p.valueFrom.secretKeyRef.optional
                    param_dict["valueFrom"] = EvaluatorV1alpha1SpecParametersInnerValueFrom.from_dict(value_from)
                params.append(EvaluatorV1alpha1SpecParametersInner.from_dict(param_dict))
            spec.parameters = params
        
        if evaluator.selector:
            selector_dict = {"resourceType": evaluator.selector.resource}
            if evaluator.selector.labelSelector:
                if evaluator.selector.labelSelector.matchLabels:
                    selector_dict["matchLabels"] = evaluator.selector.labelSelector.matchLabels
                if evaluator.selector.labelSelector.matchExpressions:
                    match_expressions = []
                    for expr in evaluator.selector.labelSelector.matchExpressions:
                        match_expressions.append({
                            "key": expr.key,
                            "operator": expr.operator,
                            "values": expr.values
                        })
                    selector_dict["matchExpressions"] = match_expressions
            spec.selector = EvaluatorV1alpha1SpecSelector.from_dict(selector_dict)
        
        # Create evaluator object
        evaluator_obj = EvaluatorV1alpha1(
            api_version=f"{GROUP}/{VERSION}",
            kind="Evaluator",
            metadata={
                "name": evaluator.name,
                "namespace": namespace
            },
            spec=spec
        )
        
        result = await ark_client.evaluators.a_create(evaluator_obj)
        return evaluator_to_detail_response(result.to_dict())


@router.get("/{name}", response_model=EvaluatorDetailResponse)
@handle_k8s_errors(operation="get", resource_type="evaluator")
async def get_evaluator(name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> EvaluatorDetailResponse:
    """Get details of a specific evaluator."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        result = await ark_client.evaluators.a_get(name)
        return evaluator_to_detail_response(result.to_dict())


@router.put("/{name}", response_model=EvaluatorDetailResponse)
@handle_k8s_errors(operation="update", resource_type="evaluator")
async def update_evaluator(
    name: str,
    evaluator: EvaluatorUpdateRequest,
    namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")
) -> EvaluatorDetailResponse:
    """Update an existing evaluator."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        # Get existing evaluator
        existing = await ark_client.evaluators.a_get(name)
        existing_dict = existing.to_dict()
        
        # Update spec with provided values
        spec = existing_dict.get("spec", {})
        
        if evaluator.address:
            address_spec = {}
            if evaluator.address.value:
                address_spec["value"] = evaluator.address.value
            if evaluator.address.valueFrom:
                value_from = {}
                if evaluator.address.valueFrom.configMapKeyRef:
                    value_from["configMapKeyRef"] = {
                        "key": evaluator.address.valueFrom.configMapKeyRef.key,
                        "name": evaluator.address.valueFrom.configMapKeyRef.name
                    }
                    if evaluator.address.valueFrom.configMapKeyRef.optional is not None:
                        value_from["configMapKeyRef"]["optional"] = evaluator.address.valueFrom.configMapKeyRef.optional
                if evaluator.address.valueFrom.secretKeyRef:
                    value_from["secretKeyRef"] = {
                        "key": evaluator.address.valueFrom.secretKeyRef.key,
                        "name": evaluator.address.valueFrom.secretKeyRef.name
                    }
                    if evaluator.address.valueFrom.secretKeyRef.optional is not None:
                        value_from["secretKeyRef"]["optional"] = evaluator.address.valueFrom.secretKeyRef.optional
                address_spec["valueFrom"] = value_from
            spec["address"] = address_spec
        
        if evaluator.description is not None:
            spec["description"] = evaluator.description
        
        
        if evaluator.parameters is not None:
            if evaluator.parameters:
                params = []
                for p in evaluator.parameters:
                    param_dict = {"name": p.name}
                    if p.value:
                        param_dict["value"] = p.value
                    if p.valueFrom:
                        value_from = {}
                        if p.valueFrom.configMapKeyRef:
                            value_from["configMapKeyRef"] = {
                                "key": p.valueFrom.configMapKeyRef.key,
                                "name": p.valueFrom.configMapKeyRef.name
                            }
                            if p.valueFrom.configMapKeyRef.optional is not None:
                                value_from["configMapKeyRef"]["optional"] = p.valueFrom.configMapKeyRef.optional
                        if p.valueFrom.secretKeyRef:
                            value_from["secretKeyRef"] = {
                                "key": p.valueFrom.secretKeyRef.key,
                                "name": p.valueFrom.secretKeyRef.name
                            }
                            if p.valueFrom.secretKeyRef.optional is not None:
                                value_from["secretKeyRef"]["optional"] = p.valueFrom.secretKeyRef.optional
                        param_dict["valueFrom"] = value_from
                    params.append(param_dict)
                spec["parameters"] = params
            else:
                spec.pop("parameters", None)
        
        if evaluator.selector is not None:
            if evaluator.selector:
                selector_dict = {"resourceType": evaluator.selector.resource}
                if evaluator.selector.labelSelector:
                    if evaluator.selector.labelSelector.matchLabels:
                        selector_dict["matchLabels"] = evaluator.selector.labelSelector.matchLabels
                    if evaluator.selector.labelSelector.matchExpressions:
                        selector_dict["matchExpressions"] = [
                            {
                                "key": expr.key,
                                "operator": expr.operator,
                                "values": expr.values
                            }
                            for expr in evaluator.selector.labelSelector.matchExpressions
                        ]
                spec["selector"] = selector_dict
            else:
                spec.pop("selector", None)
        
        # Update evaluator object
        existing_dict["spec"] = spec
        updated_evaluator = EvaluatorV1alpha1.from_dict(existing_dict)
        
        result = await ark_client.evaluators.a_update(updated_evaluator)
        return evaluator_to_detail_response(result.to_dict())


@router.delete("/{name}")
@handle_k8s_errors(operation="delete", resource_type="evaluator")
async def delete_evaluator(name: str, namespace: Optional[str] = Query(None, description="Namespace for this request (defaults to current context)")) -> dict:
    """Delete an evaluator."""
    async with with_ark_client(namespace, VERSION) as ark_client:
        await ark_client.evaluators.a_delete(name)
        return {"message": f"Evaluator '{name}' deleted successfully"}