import logging
from typing import Dict, Any
from .types import EvaluationRequest, EvaluationResponse, EvaluationParameters, TokenUsage
from .llm_client import LLMClient
from .model_resolver import ModelResolver

logger = logging.getLogger(__name__)


class LLMEvaluator:
    def __init__(self, session=None):
        self.llm_client = LLMClient(session=session)
        self.model_resolver = ModelResolver()
    
    async def evaluate(self, request: EvaluationRequest, params: EvaluationParameters = None, golden_examples=None) -> EvaluationResponse:
        """
        Evaluate query performance using LLM-as-a-Judge approach
        """
        try:
            logger.info(f"Starting evaluation for query {request.queryId}")
            
            # Use default parameters if none provided
            if params is None:
                params = EvaluationParameters()

            # Resolve model configuration using the model resolver
            logger.info(f"Resolving model configuration - modelRef: {request.modelRef}")
            model = await self.model_resolver.resolve_model(
                model_ref=request.modelRef, 
                query_context=request.query
            )
            
            # Log full model configuration for troubleshooting
            logger.info(f"Resolved model configuration:")
            logger.info(f"  - model: {model.model}")
            logger.info(f"  - base_url: {model.base_url}")
            logger.info(f"  - api_version: {model.api_version}")
            logger.info(f"  - api_key: {model.api_key[:8] if model.api_key else 'None'}...{model.api_key[-4:] if model.api_key and len(model.api_key) > 8 else ''}")
            
            # Prepare evaluation prompt
            evaluation_prompt = self._build_evaluation_prompt(request, params, golden_examples)
            
            # Get LLM evaluation
            evaluation_result, token_usage = await self.llm_client.evaluate(
                prompt=evaluation_prompt,
                model=model,
                params=params
            )
            
            # Parse evaluation result
            score, passed, metadata = self._parse_evaluation_result(evaluation_result, params)
            
            logger.info(f"Evaluation completed for query {request.queryId}: score={score}, passed={passed}")
            
            # Add additional metadata for better tracking
            metadata['model_used'] = model.model if hasattr(model, 'model') else 'unknown'
            metadata['model_base_url'] = model.base_url if hasattr(model, 'base_url') else 'unknown'
            metadata['evaluation_scope'] = params.scope
            metadata['min_score_threshold'] = str(params.min_score)
            metadata['query_id'] = request.queryId
            
            return EvaluationResponse(
                score=score,
                passed=passed,
                metadata=metadata,
                tokenUsage=token_usage
            )
            
        except Exception as e:
            logger.error(f"Evaluation failed for query {request.queryId}: {str(e)}")
            return EvaluationResponse(
                error=str(e),
                passed=False,
                tokenUsage=TokenUsage()  # Default to zero tokens on error
            )
    
    def _build_evaluation_prompt(self, request: EvaluationRequest, params: EvaluationParameters, golden_examples) -> str:
        """
        Build evaluation prompt using LLM-as-a-Judge pattern with golden dataset context
        """
        response_text = "\n".join([
            f"Response from {resp.target.type} '{resp.target.name}':\n{resp.content}"
            for resp in request.responses
        ])
        
        evaluation_scope = ",".join(params.get_scope_list())

        # Build golden examples section
        examples_section = ""
        if golden_examples:
            examples_list = []
            for example in golden_examples:
                metadata_str = ""
                if hasattr(example, 'metadata') and example.metadata:
                    metadata_items = [f"{k}: {v}" for k, v in example.metadata.items()]
                    metadata_str = f" ({', '.join(metadata_items)})"
                examples_list.append(f"Input: {example.input}\nExpected Output: {example.expectedOutput}{metadata_str}")
            
            examples_text = "\n".join(f"Example {i+1}:\n{example}" for i, example in enumerate(examples_list))
            examples_section = f"""
                    REFERENCE EXAMPLES:
                    Here are some reference examples to help guide your evaluation:
                    
                    {examples_text}
                    
                    Use these examples to understand the expected quality and style of responses for similar queries.
                    """

        prompt = f"""You are an AI evaluator tasked with assessing the quality of responses to user input and provided response.

                    USER QUERY:
                    {request.input}

                    RESPONSE TO EVALUATE:
                    {response_text}

                    {examples_section}
                    
                    Consider all following criteria definition:
                    1. Relevance: How well do the responses address the user's query?
                    2. Accuracy: Are the responses factually correct and reliable?
                    3. Completeness: Do the responses provide comprehensive information?
                    4. Conciseness: Do the responses provide a concise information?
                    5. Clarity: Are the responses clear and easy to understand?
                    6. Usefulness: How helpful are the responses to the user?

                    Evaluate the response only on the following criteria: {evaluation_scope}

                    Assessment 

                    Provide your evaluation in the following format:
                    SCORE: [0-1]
                    PASSED: [true/false] (by default true if SCORE >= 0.7)
                    REASONING: [Brief explanation of your evaluation]
                    CRITERIA_SCORES: relevance=[0-1], accuracy=[0-1], completeness=[0-1], conciseness=[0-1], clarity=[0-1], usefulness=[0-1]
                    for CRITERIA_SCORES, only include the criteria in {evaluation_scope}

                    Be objective and thorough in your assessment.
                """

        return prompt
    
    def _parse_evaluation_result(self, result: str, params: EvaluationParameters) -> tuple[str, bool, Dict[str, str]]:
        """
        Parse LLM evaluation result into structured format
        """
        lines = result.strip().split('\n')
        score = "0"
        passed = False
        metadata = {}
        
        for line in lines:
            line = line.strip()
            if line.startswith('SCORE:'):
                score_str = line.split(':', 1)[1].strip()
                try:
                    # Try to parse as float first (0-1 scale)
                    score_float = float(score_str)
                    
                    # If score > 1, assume it's 0-100 scale and convert
                    if score_float > 1:
                        score_float = score_float / 100.0
                    
                    score = f"{score_float:.2f}"
                    passed = score_float >= params.min_score
                except ValueError:
                    score = "0.0"
                    passed = False
            elif line.startswith('PASSED:'):
                passed_str = line.split(':', 1)[1].strip().lower()
                passed = passed_str == 'true'
            elif line.startswith('REASONING:'):
                metadata['reasoning'] = line.split(':', 1)[1].strip()
            elif line.startswith('CRITERIA_SCORES:'):
                criteria_str = line.split(':', 1)[1].strip()
                metadata['criteria_scores'] = criteria_str
        
        return score, passed, metadata