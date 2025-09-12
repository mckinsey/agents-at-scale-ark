from fastapi import HTTPException
import logging
import asyncio
from typing import List, Dict, Any

from .base import EvaluationProvider
from ..types import (
    UnifiedEvaluationRequest, EvaluationResponse, EvaluationRequest,
    Response, QueryTarget, EvaluationParameters, GoldenExample, TokenUsage
)
from ..evaluator import LLMEvaluator
from ..llm_client import LLMClient
from ..model_resolver import ModelResolver

logger = logging.getLogger(__name__)


class BaselineEvaluationProvider(EvaluationProvider):
    """
    Provider for baseline evaluation type.
    Evaluates model performance against a comprehensive set of golden examples.
    """
    
    def get_evaluation_type(self) -> str:
        return "baseline"
    
    async def evaluate(self, request: UnifiedEvaluationRequest) -> EvaluationResponse:
        """
        Execute baseline evaluation by testing model against golden examples.
        
        Process:
        1. Extract golden examples from parameters
        2. For each golden example, generate model response
        3. Evaluate generated response against expected output
        4. Aggregate results into overall score and metrics
        """
        logger.info(f"Processing baseline evaluation with evaluator: {request.evaluatorName}")
        
        # Extract and validate golden examples
        golden_examples = self._extract_golden_examples(request.parameters)
        if not golden_examples:
            raise HTTPException(status_code=422, detail="Baseline evaluation requires golden-examples parameter")
        
        logger.info(f"Found {len(golden_examples)} golden examples for baseline evaluation")
        
        # Extract model reference from parameters
        model_ref = self._extract_model_ref(request.parameters)
        if not model_ref:
            raise HTTPException(status_code=422, detail="Baseline evaluation requires model configuration in parameters")
        
        # Extract evaluation parameters
        eval_params = EvaluationParameters.from_request_params(request.parameters or {})
        
        # Process each golden example
        test_results = []
        
        # Initialize token usage accumulator for baseline evaluation
        total_token_usage = TokenUsage()
        
        # Initialize components needed for model response generation
        llm_client = LLMClient(session=self.shared_session)
        model_resolver = ModelResolver()
        evaluator = LLMEvaluator(session=self.shared_session)
        
        try:
            # Resolve model configuration
            model = await model_resolver.resolve_model(model_ref)
            logger.info(f"Resolved model for baseline evaluation: {model.model}")
            
        except Exception as e:
            logger.error(f"Failed to resolve model {model_ref.name}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to resolve model: {e}")
        
        # Process examples (could be parallelized for better performance)
        for i, example in enumerate(golden_examples):
            try:
                logger.info(f"Processing golden example {i+1}/{len(golden_examples)}: {example.input[:50]}...")
                
                # Generate model response for this example's input
                generated_response, example_token_usage = await self._generate_model_response(
                    llm_client, model, example.input, eval_params
                )
                
                # Accumulate token usage
                total_token_usage.promptTokens += example_token_usage.promptTokens
                total_token_usage.completionTokens += example_token_usage.completionTokens
                total_token_usage.totalTokens += example_token_usage.totalTokens
                
                # Evaluate generated response against expected output
                eval_result = await self._evaluate_single_example(
                    evaluator, example, generated_response, eval_params, model_ref
                )
                
                # Store detailed results
                test_result = {
                    "example_index": i,
                    "input": example.input,
                    "expected_output": example.expectedOutput,
                    "generated_output": generated_response,
                    "score": float(eval_result.score) if eval_result.score else 0.0,
                    "passed": eval_result.passed,
                    "reasoning": eval_result.reasoning if hasattr(eval_result, 'reasoning') else "",
                    "metadata": example.metadata or {}
                }
                
                # Add additional fields if present in golden example
                if hasattr(example, 'expectedMinScore'):
                    test_result["expected_min_score"] = getattr(example, 'expectedMinScore', None)
                if hasattr(example, 'difficulty'):
                    test_result["difficulty"] = getattr(example, 'difficulty', None)
                if hasattr(example, 'category'):
                    test_result["category"] = getattr(example, 'category', None)
                
                test_results.append(test_result)
                
                logger.info(f"Example {i+1} completed: score={test_result['score']}, passed={test_result['passed']}")
                
            except Exception as e:
                logger.error(f"Failed to process golden example {i+1}: {e}")
                # Add failed test result
                test_results.append({
                    "example_index": i,
                    "input": example.input,
                    "expected_output": example.expectedOutput,
                    "generated_output": "",
                    "score": 0.0,
                    "passed": False,
                    "reasoning": f"Processing failed: {str(e)}",
                    "metadata": example.metadata or {},
                    "error": str(e)
                })
        
        # Aggregate results
        overall_score, overall_passed, aggregated_metadata = self._aggregate_results(
            test_results, eval_params
        )
        
        logger.info(f"Baseline evaluation completed: overall_score={overall_score}, overall_passed={overall_passed}, examples_processed={len(test_results)}")
        
        # Create response with comprehensive metadata and token usage
        response = EvaluationResponse(
            score=str(overall_score),
            passed=overall_passed,
            metadata=aggregated_metadata,
            tokenUsage=total_token_usage
        )
        
        return response
    
    async def _generate_model_response(self, llm_client: LLMClient, model, input_text: str, params: EvaluationParameters) -> tuple[str, TokenUsage]:
        """
        Generate model response for a given input using the configured model.
        Returns: (response_text, token_usage)
        """
        try:
            # Use a simple prompt to get the model's response to the input
            prompt = f"""Please provide a response to the following input:

Input: {input_text}

Response:"""
            
            response, token_usage = await llm_client.evaluate(prompt=prompt, model=model, params=params)
            return response.strip(), token_usage
            
        except Exception as e:
            logger.error(f"Failed to generate model response: {e}")
            return f"[Error generating response: {str(e)}]", TokenUsage()
    
    async def _evaluate_single_example(
        self, 
        evaluator: LLMEvaluator,
        example: GoldenExample, 
        generated_response: str,
        eval_params: EvaluationParameters,
        model_ref
    ) -> EvaluationResponse:
        """
        Evaluate a single example by comparing generated response to expected output.
        """
        # Create evaluation request for this specific example
        eval_request = EvaluationRequest(
            queryId=f"baseline-example",
            input=example.input,
            responses=[Response(
                target=QueryTarget(type="model", name="baseline-model"),
                content=generated_response
            )],
            query={"metadata": {"type": "baseline-example"}, "spec": {"input": example.input}},
            modelRef=model_ref  # Pass the already resolved model reference
        )
        
        # Use the expected output as a golden example for this evaluation
        single_golden_example = [GoldenExample(
            input=example.input,
            expectedOutput=example.expectedOutput,
            metadata=example.metadata
        )]
        
        return await evaluator.evaluate(eval_request, eval_params, golden_examples=single_golden_example)
    
    def _aggregate_results(self, test_results: List[Dict[str, Any]], eval_params: EvaluationParameters) -> tuple[float, bool, Dict[str, Any]]:
        """
        Aggregate individual test results into overall metrics.
        """
        if not test_results:
            return 0.0, False, {"error": "No test results to aggregate"}
        
        # Calculate basic statistics
        total_examples = len(test_results)
        passed_examples = sum(1 for result in test_results if result["passed"])
        failed_examples = total_examples - passed_examples
        
        # Calculate average score
        total_score = sum(result["score"] for result in test_results)
        average_score = total_score / total_examples if total_examples > 0 else 0.0
        
        # Category-based analysis
        category_stats = {}
        difficulty_stats = {}
        
        for result in test_results:
            # Category statistics
            category = result.get("category", "unknown")
            if category not in category_stats:
                category_stats[category] = {"total": 0, "passed": 0, "score_sum": 0.0}
            category_stats[category]["total"] += 1
            if result["passed"]:
                category_stats[category]["passed"] += 1
            category_stats[category]["score_sum"] += result["score"]
            
            # Difficulty statistics
            difficulty = result.get("difficulty", "unknown")
            if difficulty not in difficulty_stats:
                difficulty_stats[difficulty] = {"total": 0, "passed": 0, "score_sum": 0.0}
            difficulty_stats[difficulty]["total"] += 1
            if result["passed"]:
                difficulty_stats[difficulty]["passed"] += 1
            difficulty_stats[difficulty]["score_sum"] += result["score"]
        
        # Calculate category and difficulty averages
        for category, stats in category_stats.items():
            stats["average_score"] = stats["score_sum"] / stats["total"] if stats["total"] > 0 else 0.0
            stats["pass_rate"] = stats["passed"] / stats["total"] if stats["total"] > 0 else 0.0
        
        for difficulty, stats in difficulty_stats.items():
            stats["average_score"] = stats["score_sum"] / stats["total"] if stats["total"] > 0 else 0.0
            stats["pass_rate"] = stats["passed"] / stats["total"] if stats["total"] > 0 else 0.0
        
        # Determine overall pass/fail based on minimum score threshold
        min_score_threshold = eval_params.min_score if hasattr(eval_params, 'min_score') else 0.7
        overall_passed = average_score >= min_score_threshold
        
        # Create comprehensive metadata with flat string values
        metadata = {
            "total_examples": str(total_examples),
            "passed_examples": str(passed_examples),
            "failed_examples": str(failed_examples),
            "pass_rate": f"{passed_examples / total_examples:.3f}" if total_examples > 0 else "0.000",
            "average_score": f"{average_score:.3f}",
            "min_score_threshold": str(min_score_threshold),
        }
        
        # Add category breakdown as flat key-value pairs
        for category, stats in category_stats.items():
            metadata[f"category_{category}_count"] = str(stats["total"])
            metadata[f"category_{category}_passed"] = str(stats["passed"])
            metadata[f"category_{category}_avg_score"] = f"{stats['average_score']:.3f}"
        
        # Add difficulty breakdown as flat key-value pairs
        for difficulty, stats in difficulty_stats.items():
            metadata[f"difficulty_{difficulty}_count"] = str(stats["total"])
            metadata[f"difficulty_{difficulty}_passed"] = str(stats["passed"])
            metadata[f"difficulty_{difficulty}_avg_score"] = f"{stats['average_score']:.3f}"
        
        return average_score, overall_passed, metadata