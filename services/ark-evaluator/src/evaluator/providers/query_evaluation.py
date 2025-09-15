from fastapi import HTTPException
import logging
from kubernetes import client, config
from kubernetes.client.rest import ApiException

from .base import EvaluationProvider
from ..types import (
    UnifiedEvaluationRequest, EvaluationResponse, EvaluationRequest,
    Response, QueryTarget, EvaluationParameters
)
from ..evaluator import LLMEvaluator

logger = logging.getLogger(__name__)


class QueryEvaluationProvider(EvaluationProvider):
    """
    Provider for query-based evaluation type.
    Evaluates existing query results by resolving query data from Kubernetes.
    """
    
    def get_evaluation_type(self) -> str:
        return "query"
    
    async def evaluate(self, request: UnifiedEvaluationRequest) -> EvaluationResponse:
        """
        Execute query-based evaluation by resolving query data and evaluating results.
        """
        logger.info(f"Processing query evaluation with evaluator: {request.evaluatorName}")
        
        # Validate query evaluation requirements
        if not request.config or not hasattr(request.config, 'queryRef'):
            raise HTTPException(status_code=422, detail="Query evaluation requires queryRef in config")
        
        # Extract query reference details
        query_ref = request.config.queryRef
        query_name = query_ref.name
        query_namespace = query_ref.namespace
        response_target = query_ref.responseTarget
        
        logger.info(f"ark-evaluator: Received queryRef: name={query_name}, namespace={query_namespace}, responseTarget={response_target}")
        
        if not query_namespace:
            logger.warning(f"QueryRef namespace is empty for query {query_name}, this may cause query resolution to fail")
            query_namespace = "default"
            logger.debug(f"ARK-EVALUATOR: Defaulting to namespace: {query_namespace}")
        
        try:
            # Initialize Kubernetes client
            try:
                config.load_incluster_config()
            except config.ConfigException:
                config.load_kube_config()
            
            # Create API client for custom resources
            api_client = client.ApiClient()
            custom_api = client.CustomObjectsApi(api_client)
            
            # Fetch the Query resource
            logger.debug(f"ARK-EVALUATOR: Fetching query {query_name} from namespace {query_namespace}")
            
            query_resource = custom_api.get_namespaced_custom_object(
                group="ark.mckinsey.com",
                version="v1alpha1",
                namespace=query_namespace,
                plural="queries",
                name=query_name
            )
            
            logger.debug(f"ARK-EVALUATOR: Successfully fetched query {query_name}")
            
            # Extract input and output
            input_text = query_resource["spec"].get("input", "")
            logger.debug(f"ARK-EVALUATOR: Extracted input: {input_text[:100]}...")
            
            # Extract actual agent name from query targets for agent context resolution
            actual_agent_name = None
            if query_resource.get("spec", {}).get("targets"):
                targets = query_resource["spec"]["targets"]
                agent_targets = [t for t in targets if t.get("type") == "agent"]
                if agent_targets:
                    actual_agent_name = agent_targets[0].get("name")
                    logger.info(f"ARK-EVALUATOR: Found agent target: {actual_agent_name}")
            
            output_text = ""
            if query_resource.get("status", {}).get("responses"):
                responses = query_resource["status"]["responses"]
                if response_target:
                    # Parse response_target format (could be "name" or "type:name")
                    if ":" in response_target:
                        target_type, target_name = response_target.split(":", 1)
                        # Find response from specific target matching both type and name
                        target_responses = [r for r in responses 
                                          if r.get("target", {}).get("type") == target_type 
                                          and r.get("target", {}).get("name") == target_name]
                    else:
                        # Legacy format: just the name
                        target_responses = [r for r in responses if r.get("target", {}).get("name") == response_target]
                    if target_responses:
                        output_text = target_responses[0].get("content", "")
                        logger.debug(f"ARK-EVALUATOR: Found response from target {response_target}")
                    else:
                        logger.warning(f"ARK-EVALUATOR: No response found from target {response_target}")
                        available_targets = [r.get("target", {}).get("name") for r in responses]
                        logger.debug(f"ARK-EVALUATOR: Available response targets: {available_targets}")
                else:
                    # Use first response if no specific target
                    output_text = responses[0].get("content", "")
                    logger.debug(f"ARK-EVALUATOR: Using first response (no specific target)")
            
            logger.debug(f"ARK-EVALUATOR: Extracted output: {output_text[:100]}...")
            
        except ApiException as e:
            logger.error(f"ARK-EVALUATOR: Kubernetes API error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch query {query_name}: {e}")
        except Exception as e:
            logger.error(f"ARK-EVALUATOR: Unexpected error fetching query: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to process query {query_name}: {e}")
        
        # Extract model reference from parameters
        model_ref = self._extract_model_ref(request.parameters)
        if not model_ref:
            raise HTTPException(status_code=422, detail="Query evaluation requires model configuration in parameters")
        
        # Create evaluation request with proper agent name for context resolution
        target_name = response_target or actual_agent_name or "query-response"
        logger.info(f"ARK-EVALUATOR: Using target name for evaluation: {target_name}")
        
        eval_request = EvaluationRequest(
            queryId=f"query-evaluation-{query_name}",
            input=input_text,
            responses=[Response(
                target=QueryTarget(type="agent", name=target_name),
                content=output_text
            )],
            query={"metadata": {"name": query_name, "namespace": query_namespace}, "spec": {"input": input_text}},
            modelRef=model_ref
        )
        
        # Extract golden examples from parameters if present
        golden_examples = self._extract_golden_examples(request.parameters)
        
        # Create and use evaluator
        evaluator = LLMEvaluator(session=self.shared_session)
        
        result = await evaluator.evaluate(
            eval_request,
            EvaluationParameters.from_request_params(request.parameters or {}),
            golden_examples=golden_examples
        )
        
        # Add query evaluation metadata
        if not result.metadata:
            result.metadata = {}
        result.metadata["query.name"] = query_name
        result.metadata["query.namespace"] = query_namespace
        if response_target:
            result.metadata["query.responseTarget"] = response_target
        
        logger.info(f"Query evaluation completed: score={result.score}, passed={result.passed}")
        return result