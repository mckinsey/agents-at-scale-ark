import logging
from typing import Dict, Any, Optional
from ..types import (
    UnifiedEvaluationRequest, MetricEvaluationResponse, 
    EvaluationResponse, QueryRef,
    DirectEvaluationConfig, QueryBasedEvaluationConfig,
    MetricEvaluationRequest
)
from .metric_types import (
     DirectRequest, QueryRefRequest
)
from .ark_client import ArkClient
from .metrics import MetricsCalculator

logger = logging.getLogger(__name__)


class MetricEvaluator:
    def __init__(self, parameters: Dict[str, Any]):
        self.parameters = parameters
        self.ark_client = ArkClient()
        self.metrics_calculator = MetricsCalculator(parameters)
    
    async def evaluate_metrics(self, request: MetricEvaluationRequest) -> MetricEvaluationResponse:
        """
        Evaluate query performance metrics
        """
        try:
            logger.info(f"Starting metric evaluation for query {request.queryId}")
            
            # Convert queryId to QueryRef format for ARK SDK
            query_ref = self._parse_query_ref_string(request.queryId)
            
            # Load query from Kubernetes using ARK SDK
            query_config = await self.ark_client.load_query(query_ref)
            
            # Extract metrics from query status
            metrics = await self.ark_client.extract_metrics(query_config)
            
            # Calculate scores
            overall_score = await self.metrics_calculator.calculate_overall_score(metrics)
            passed = self._determine_pass_status(overall_score, metrics)
            
            # Build metadata
            metadata = self._build_metadata(metrics, overall_score)
            
            logger.info(f"Metric evaluation completed for query {request.queryId}: score={overall_score:.2f}, passed={passed}")
            
            return MetricEvaluationResponse(
                score=f"{overall_score:.2f}",
                passed=passed,
                metrics=metrics,
                metadata=metadata
            )
            
        except Exception as e:
            logger.error(f"Metric evaluation failed for query {request.queryId}: {str(e)}")
            return MetricEvaluationResponse(
                score="0.0",
                passed=False,
                error=str(e)
            )
    
    def _determine_pass_status(self, overall_score: float, metrics: Dict[str, Any]) -> bool:
        """
        Determine if the evaluation passes based on score and threshold violations
        """
        # Check if overall score meets minimum threshold
        min_score = float(self.parameters.get("minScore", 0.7))
        if overall_score < min_score:
            return False
        
        # Check for critical threshold violations
        threshold_violations = metrics.get("threshold_violations", [])
        critical_violations = ["maxTokens", "maxCostPerQuery", "maxDuration"]
        
        for violation in threshold_violations:
            if violation in critical_violations:
                return False
        
        return True
    
    def _build_metadata(self, metrics: Dict[str, Any], overall_score: float) -> Dict[str, Any]:
        """
        Build evaluation metadata
        """
        threshold_violations = metrics.get("threshold_violations", [])
        passed_thresholds = metrics.get("passed_thresholds", [])
        
        if threshold_violations:
            reasoning = f"Metrics evaluation failed due to threshold violations: {', '.join(threshold_violations)}"
        elif overall_score >= 0.8:
            reasoning = "All metrics within acceptable thresholds with excellent performance"
        elif overall_score >= 0.6:
            reasoning = "All metrics within acceptable thresholds with good performance"
        else:
            reasoning = "Metrics within thresholds but performance could be improved"
        
        return {
            "reasoning": reasoning,
            "threshold_violations": threshold_violations,
            "passed_thresholds": passed_thresholds,
            "evaluation_type": "performance_metrics"
        }
    
    # ============================================================================
    # UNIFIED REQUEST HANDLERS (Compatible with evaluation controller)
    # ============================================================================
    
    async def evaluate_direct(self, request: DirectRequest) -> EvaluationResponse:
        """
        Handle direct evaluation requests from evaluation controller
        """
        try:
            logger.info(f"Processing direct evaluation request for mode: {request.mode}")
            
            # For direct requests, we need to create synthetic metrics from input/output
            synthetic_metrics = self._create_synthetic_metrics_from_direct(request)
            
            # Calculate scores using our metrics calculator
            overall_score = await self.metrics_calculator.calculate_overall_score(synthetic_metrics)
            passed = self._determine_pass_status(overall_score, synthetic_metrics)
            
            # Build metadata in the format expected by evaluation controller
            metadata = self._build_unified_metadata(synthetic_metrics, overall_score)
            
            logger.info(f"Direct evaluation completed: score={overall_score:.2f}, passed={passed}")
            
            return EvaluationResponse(
                score=f"{overall_score:.2f}",
                passed=passed,
                metadata=metadata
            )
            
        except Exception as e:
            logger.error(f"Direct evaluation failed: {str(e)}")
            return EvaluationResponse(
                score="0.0",
                passed=False,
                error=str(e)
            )
    
    async def evaluate_query_ref(self, request: QueryRefRequest) -> EvaluationResponse:
        """
        Handle query reference evaluation requests
        """
        try:
            logger.info(f"Processing query-ref evaluation for: {request.queryRef.name}")
            
            # Use the QueryRef object directly instead of parsing a string
            query_ref = request.queryRef
            
            # Load query from Kubernetes using ARK SDK
            query_config = await self.ark_client.load_query(query_ref)
            
            # Extract metrics from query status
            metrics = await self.ark_client.extract_metrics(query_config)
            
            # Calculate scores
            overall_score = await self.metrics_calculator.calculate_overall_score(metrics)
            passed = self._determine_pass_status(overall_score, metrics)
            
            # Build metadata
            metadata = self._build_unified_metadata(metrics, overall_score)
            
            logger.info(f"Query-ref evaluation completed: score={overall_score:.2f}, passed={passed}")
            
            return EvaluationResponse(
                score=f"{overall_score:.2f}",
                passed=passed,
                metadata=metadata
            )
            
        except Exception as e:
            logger.error(f"Query-ref evaluation failed: {str(e)}")
            return EvaluationResponse(
                score="0.0",
                passed=False,
                error=str(e)
            )
    
    def _create_synthetic_metrics_from_direct(self, request: DirectRequest) -> Dict[str, Any]:
        """
        Create synthetic metrics from direct request input/output
        """
        input_length = len(request.input) if request.input else 0
        output_length = len(request.output) if request.output else 0
        
        # Estimate token usage (rough approximation: 1 token ≈ 4 characters)
        estimated_prompt_tokens = input_length // 4
        estimated_completion_tokens = output_length // 4
        estimated_total_tokens = estimated_prompt_tokens + estimated_completion_tokens
        
        metrics = {
            "totalTokens": estimated_total_tokens,
            "promptTokens": estimated_prompt_tokens,  
            "completionTokens": estimated_completion_tokens,
            "totalResponseLength": output_length,
            "responseCount": 1,
            "averageResponseLength": output_length,
            "isCompleted": True,
            "hasErrors": False,
            "queryPhase": "direct-evaluation",
            "responseCompleteness": min(1.0, output_length / 50) if output_length > 0 else 0
        }
        
        # Calculate token efficiency
        if estimated_prompt_tokens > 0:
            metrics["tokenEfficiency"] = estimated_completion_tokens / estimated_prompt_tokens
        else:
            metrics["tokenEfficiency"] = 0
        
        return metrics
    
    def _parse_query_ref_string(self, query_ref_str: str) -> QueryRef:
        """
        Parse query reference string into QueryRef object
        Expects format like "namespace/query-name" or just "query-name"
        """
        if "/" in query_ref_str:
            namespace, name = query_ref_str.split("/", 1)
        else:
            namespace = "default"
            name = query_ref_str
        
        return QueryRef(name=name, namespace=namespace)
    
    def _build_unified_metadata(self, metrics: Dict[str, Any], overall_score: float) -> Dict[str, str]:
        """
        Build metadata in the format expected by evaluation controller
        """
        threshold_violations = metrics.get("threshold_violations", [])
        passed_thresholds = metrics.get("passed_thresholds", [])
        
        if threshold_violations:
            reasoning = f"Performance metrics evaluation failed due to threshold violations: {', '.join(threshold_violations)}"
        elif overall_score >= 0.8:
            reasoning = "All performance metrics within acceptable thresholds with excellent scores"
        elif overall_score >= 0.6:
            reasoning = "All performance metrics within acceptable thresholds with good scores"
        else:
            reasoning = "Performance metrics within thresholds but could be improved"
        
        metadata = {
            "reasoning": reasoning,
            "evaluation_type": "performance_metrics",
            "total_tokens": str(metrics.get("totalTokens", 0)),
            "execution_time": metrics.get("executionDuration", "unknown"),
            "cost": str(metrics.get("totalCost", 0.0))
        }
        
        # Add individual scores if available
        if "tokenScore" in metrics:
            metadata["token_score"] = f"{metrics['tokenScore']:.2f}"
        if "costScore" in metrics:
            metadata["cost_score"] = f"{metrics['costScore']:.2f}"
        if "performanceScore" in metrics:
            metadata["performance_score"] = f"{metrics['performanceScore']:.2f}"

        return metadata