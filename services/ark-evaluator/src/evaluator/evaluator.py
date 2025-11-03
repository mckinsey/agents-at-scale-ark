import logging
from typing import Dict, Any, Optional
from .types import EvaluationRequest, EvaluationResponse, EvaluationParameters, TokenUsage
from .llm_client import LLMClient
from .model_resolver import ModelResolver
from .agent_resolver import AgentResolver, AgentInstructions
from .prompt_builder import build_evaluation_prompt

logger = logging.getLogger(__name__)

class LLMEvaluator:
    def __init__(self, session=None):
        self.llm_client = LLMClient(session=session)
        self.model_resolver = ModelResolver()
        self.agent_resolver = AgentResolver()
    
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
            
            # Resolve agent instructions if scope includes agent-aware criteria
            agent_instructions = None
            if self._requires_agent_instructions(params):
                logger.info("Attempting to resolve agent instructions...")
                agent_instructions = await self._resolve_agent_instructions(request)
            else:
                logger.info("Agent instructions not required for this evaluation scope")
            
            # Prepare evaluation prompt
            evaluation_prompt = self._build_evaluation_prompt(request, params, golden_examples, agent_instructions)
            logger.info(f"Generated evaluation prompt length: {len(evaluation_prompt)} characters")
            
            # Get LLM evaluation
            evaluation_result, token_usage = await self.llm_client.evaluate(
                prompt=evaluation_prompt,
                model=model,
                params=params
            )

            logger.info(f"Raw LLM evaluation result:\n{evaluation_result}")

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
    
    def _requires_agent_instructions(self, params: EvaluationParameters) -> bool:
        """Check if evaluation scope requires agent instructions"""
        if not params or not params.scope:
            logger.info(f"No agent instructions required: params={params}, scope={params.scope if params else None}")
            return False
        
        scope_lower = params.scope.lower()
        agent_aware_criteria = ["compliance", "appropriateness", "refusal_handling"]
        
        requires_context = any(criteria in scope_lower for criteria in agent_aware_criteria)
        logger.info(f"Agent context required: {requires_context}, scope: {scope_lower}, criteria: {agent_aware_criteria}")
        
        return requires_context
    
    async def _resolve_agent_instructions(self, request: EvaluationRequest) -> Optional[AgentInstructions]:
        """Resolve agent context from the first agent target in responses"""
        try:
            # Find first agent response
            agent_response = next(
                (resp for resp in request.responses if resp.target.type == "agent"), 
                None
            )
            
            if not agent_response:
                logger.warning("No agent response found for agent context resolution")
                return None
            
            # Resolve agent context
            agent_instrunctions = await self.agent_resolver.resolve_agent_instructions(
                agent_name=agent_response.target.name,
                namespace="default"  # Could be extracted from request metadata if needed
            )
            
            if agent_instrunctions:
                logger.info(f"Resolved agent context for {agent_instrunctions.name}")
            
            return agent_instrunctions
            
        except Exception as e:
            logger.warning(f"Failed to resolve agent context: {str(e)}")
            return None
    
    def _build_evaluation_prompt(self, request: EvaluationRequest, params: EvaluationParameters, golden_examples, agent_instructions: Optional[AgentInstructions] = None) -> str:
        """
        Build evaluation prompt using LLM-as-a-Judge pattern with golden dataset context.

        This method now delegates to the EvaluationPromptBuilder for better maintainability.
        """
        return build_evaluation_prompt(
            request=request,
            params=params,
            golden_examples=golden_examples,
            agent_instructions=agent_instructions,
            requires_agent_instructions=self._requires_agent_instructions(params)
        )
    
    def _get_scope_criteria_format(self, params: EvaluationParameters) -> str:
        """Add scope criteria to format string if needed"""
        if params and self._requires_agent_instructions(params):
            return ", compliance=[0-1], appropriateness=[0-1], refusal_handling=[0-1]"
        return ""
    
    
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
                    score_float = float(score_str)

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

                self._parse_individual_criteria_scores(criteria_str, metadata)

        if score == "0.0" or score == "0":
            criteria_avg = self._calculate_criteria_average(metadata.get('criteria_scores', ''))
            if criteria_avg is not None and criteria_avg > 0:
                logger.warning(
                    f"SCORE was {'0' if score else 'missing'}, using criteria average: {criteria_avg:.2f}"
                )
                score = f"{criteria_avg:.2f}"
                passed = criteria_avg >= params.min_score
                metadata['score_adjusted'] = 'true'
                metadata['original_score'] = '0.0'
                metadata['adjustment_reason'] = 'zero_score_fallback'
        else:
            criteria_avg = self._calculate_criteria_average(metadata.get('criteria_scores', ''))
            if criteria_avg is not None:
                overall_score = float(score)
                diff = abs(overall_score - criteria_avg)

                if diff > 0.15:
                    logger.warning(
                        f"Significant mismatch between overall score ({overall_score:.2f}) "
                        f"and criteria average ({criteria_avg:.2f}), difference: {diff:.2f}"
                    )
                    logger.info(f"Using criteria average as the overall score")
                    score = f"{criteria_avg:.2f}"
                    passed = criteria_avg >= params.min_score
                    metadata['score_adjusted'] = 'true'
                    metadata['original_score'] = str(overall_score)
                    metadata['adjustment_reason'] = 'mismatch_correction'

        return score, passed, metadata

    def _calculate_criteria_average(self, criteria_scores_str: str) -> Optional[float]:
        """
        Calculate average score from criteria_scores string
        Returns None if parsing fails
        """
        if not criteria_scores_str:
            return None

        try:
            scores = []
            entries = criteria_scores_str.split(',')
            for entry in entries:
                entry = entry.strip()
                if '=' in entry:
                    _, score_str = entry.split('=', 1)
                    score_val = float(score_str.strip())
                    if 0 <= score_val <= 1:
                        scores.append(score_val)

            if scores:
                avg = sum(scores) / len(scores)
                logger.info(f"Calculated criteria average: {avg:.2f} from {len(scores)} criteria")
                return avg

        except (ValueError, AttributeError) as e:
            logger.warning(f"Failed to calculate criteria average: {str(e)}")

        return None

    def _parse_individual_criteria_scores(self, criteria_str: str, metadata: Dict[str, str]) -> None:
        """
        Parse CRITERIA_SCORES string and extract individual scores into metadata
        Format: "accuracy=0.8, completeness=0.9, usefulness=0.7"
        Results in: metadata['accuracy'] = '0.8', metadata['completeness'] = '0.9', etc.

        Args:
            criteria_str: Comma-separated criterion=score pairs
            metadata: Dictionary to populate with individual scores
        """
        if not criteria_str:
            return

        try:
            entries = criteria_str.split(',')
            for entry in entries:
                entry = entry.strip()
                if '=' in entry:
                    criterion_name, score_str = entry.split('=', 1)
                    criterion_name = criterion_name.strip()
                    score_str = score_str.strip()

                    try:
                        score_val = float(score_str)
                        if 0 <= score_val <= 1:
                            metadata[criterion_name] = score_str
                            logger.debug(f"Extracted criterion score: {criterion_name}={score_str}")
                        else:
                            logger.warning(f"Score out of range for {criterion_name}: {score_val}")
                    except ValueError:
                        logger.warning(f"Invalid score value for {criterion_name}: {score_str}")
        except Exception as e:
            logger.error(f"Failed to parse individual criteria scores: {str(e)}")