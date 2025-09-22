import logging
from typing import Dict, Any, Optional
from .types import EvaluationRequest, EvaluationResponse, EvaluationParameters, TokenUsage
from .llm_client import LLMClient
from .model_resolver import ModelResolver
from .agent_resolver import AgentResolver, AgentInstructions

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
                agent_instructions = await self._resolve_agent_context(request)
                if agent_instructions:
                    logger.info(f"Agent instructions resolved: name={agent_instructions.name}, hints={len(agent_instructions.scope_hints)}")
                else:
                    logger.warning("Agent instructions resolution failed")
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
    
    async def _resolve_agent_context(self, request: EvaluationRequest) -> Optional[AgentInstructions]:
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
            agent_context = await self.agent_resolver.resolve_agent(
                agent_name=agent_response.target.name,
                namespace="default"  # Could be extracted from request metadata if needed
            )
            
            if agent_context:
                logger.info(f"Resolved agent context for {agent_context.name} with {len(agent_context.scope_hints)} scope hints")
            
            return agent_context
            
        except Exception as e:
            logger.warning(f"Failed to resolve agent context: {str(e)}")
            return None
    
    def _build_evaluation_prompt(self, request: EvaluationRequest, params: EvaluationParameters, golden_examples, agent_instructions: Optional[AgentInstructions] = None) -> str:
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

        # Use custom evaluator role or default
        evaluator_role = (params.evaluator_role if params and params.evaluator_role 
                         else "You are an AI evaluator tasked with assessing the quality of responses to user input and provided response.")
        
        logger.info(f"Using evaluator role: {evaluator_role[:100]}...")
        
        # Build agent instructions section
        agent_section = ""
        if agent_instructions:
            scope_text = ", ".join(agent_instructions.scope_hints) if agent_instructions.scope_hints else "general purpose"
            agent_section = f"""
                    AGENT INSTRUCTIONS:
                    Name: {agent_instructions.name}
                    Purpose: {agent_instructions.description}
                    Scope: {scope_text}

                    Expected Behavior:
                    - Should handle: {self._get_expected_inputs(agent_instructions)}
                    - Should refuse: {self._get_expected_refusals(agent_instructions)}
                    """
        
        # Enhanced criteria definitions
        base_criteria = """
                    1. Relevance: How well do the responses address the user's query?
                    2. Accuracy: Are the responses factually correct and reliable?
                    3. Completeness: Do the responses provide comprehensive information?
                    4. Conciseness: Do the responses provide a concise information?
                    5. Clarity: Are the responses clear and easy to understand?
                    6. Usefulness: How helpful are the responses to the user?
                    7. Context_Precision: How precise is the retrieved context in relation to the query?
                    8. Context_Recall: How well does the response recall relevant information from the provided context?"""
        
        scope_criteria = ""
        scope_instructions = ""
        if agent_instructions and self._requires_agent_instructions(params):
            logger.info(f"Adding scope instructions for agent: {agent_instructions.name}")
            scope_criteria = """
                    9. Compliance: Does the response stay within the agent's intended scope and domain?
                    10. Appropriateness: Is the response appropriate given the input type and agent's specialty?
                    11. Refusal Handling: If input is outside scope, does the agent properly refuse with explanation?"""

            # Add strict scope evaluation instructions
            scope_instructions = f"""

                    CRITICAL SCOPE EVALUATION RULES:

                    The agent "{agent_instructions.name}" is specialized for: {self._get_expected_inputs(agent_instructions)}
                    Should refuse: {self._get_expected_refusals(agent_instructions)}

                    *** SCOPE VIOLATION PENALTY: If the agent processes input that should be refused, this is a SEVERE violation deserving LOW score (0.0-0.3). ***

                    SCORING GUIDELINES:
                    - If input IS within agent scope AND agent provides good processing: HIGH score (0.8-1.0)
                    - If input is within agent scope BUT agent refuses unnecessarily: MEDIUM score (0.4-0.7)
                    - If input is outside agent scope AND agent properly refuses with explanation: HIGH score (0.8-1.0)
                    - If input is outside agent scope BUT agent processes it anyway: LOW score (0.0-0.3) - THIS IS CRITICAL

                    IMPORTANT: Analyze the input yourself to determine if it matches the agent's specialty. Look for language markers, syntax patterns, and content type.
                    """
            logger.info("Scope instructions added to prompt")
        else:
            logger.info(f"No scope instructions added. Agent instructions: {agent_instructions is not None}, requires instructions: {self._requires_agent_instructions(params) if params else False}")

        # Add ADDITIONAL CONTEXT section if evaluation context is provided
        context_section = ""
        if params and params.context:
            logger.info(f"Adding additional context section, length: {len(params.context)} characters")
            context_section = f"""

                    ADDITIONAL CONTEXT:
                    The following context should be considered when evaluating the response:

                    {params.context}

                    This context represents the reference material or retrieval results that should be used to assess accuracy, relevance, context precision, and context recall.
                    """

        prompt = f"""{evaluator_role}

                    USER QUERY:
                    {request.input}

                    RESPONSE TO EVALUATE:
                    {response_text}

                    {agent_section}
                    {context_section}
                    {examples_section}
                    {scope_instructions}
                    
                    Consider all following criteria definition:
                    {base_criteria}
                    {scope_criteria}

                    Evaluate the response only on the following criteria: {evaluation_scope}

                    Assessment 

                    Provide your evaluation in the following format:
                    SCORE: [0-1]
                    PASSED: [true/false] (by default true if SCORE >= 0.7)
                    REASONING: [Brief explanation of your evaluation focusing on scope compliance]
                    CRITERIA_SCORES: relevance=[0-1], accuracy=[0-1], completeness=[0-1], conciseness=[0-1], clarity=[0-1], usefulness=[0-1], context_precision=[0-1], context_recall=[0-1]{self._get_scope_criteria_format(params)}
                    for CRITERIA_SCORES, only include the criteria in {evaluation_scope}

                    Be objective and thorough in your assessment. PRIORITIZE scope compliance over other factors.
                """

        return prompt
    
    def _get_expected_inputs(self, agent_instructions: AgentInstructions) -> str:
        """Generate expected inputs text based on agent scope hints"""
        if "java" in agent_instructions.scope_hints and "javascript" in agent_instructions.scope_hints:
            return "Java 8 code for modernization to JavaScript"
        elif "code-conversion" in agent_instructions.scope_hints:
            return "Code in the agent's source language"
        else:
            return "Inputs within the agent's specialty area"
    
    def _get_expected_refusals(self, agent_instructions: AgentInstructions) -> str:
        """Generate expected refusals text based on agent scope hints"""
        refusals = []

        if "should-refuse-non-scope" in agent_instructions.scope_hints:
            if "java" in agent_instructions.scope_hints:
                refusals.append("Non-Java code (Python, C++, etc.)")

        if "should-refuse-malformed" in agent_instructions.scope_hints:
            refusals.append("Malformed or incomplete code")

        if not refusals:
            refusals.append("Inputs outside its intended scope")

        return ", ".join(refusals)
    
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