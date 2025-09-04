import json
import logging
import re
from typing import List, Dict, Any
from kubernetes import client, config
from kubernetes.client.rest import ApiException

from .base import EvaluationProvider
from ..types import UnifiedEvaluationRequest, EvaluationResponse
from ..helpers import (
    EventAnalyzer, ToolHelper, AgentHelper, TeamHelper, 
    LLMHelper, SequenceHelper, QueryHelper, EventScope
)

logger = logging.getLogger(__name__)


class EventEvaluationProvider(EvaluationProvider):
    """
    Provider for event-based evaluation type.
    Uses expressions to evaluate Kubernetes events for tool, agent, and team interactions.
    """
    
    def __init__(self, shared_session=None):
        super().__init__(shared_session)
        try:
            config.load_incluster_config()
            logger.info("Loaded in-cluster Kubernetes configuration")
        except:
            try:
                config.load_kube_config()
                logger.info("Loaded local Kubernetes configuration")
            except Exception as e:
                logger.warning(f"Could not load Kubernetes config: {e}")
                self.k8s_client = None
                return
        
        self.k8s_client = client.CoreV1Api()
        
        # Helper instances will be initialized per evaluation with context
        self.event_analyzer = None
        self.tool_helper = None
        self.agent_helper = None
        self.team_helper = None
        self.llm_helper = None
        self.sequence_helper = None
        self.query_helper = None
    
    def get_evaluation_type(self) -> str:
        return "event"
    
    def _initialize_helpers(self, query_namespace: str, query_name: str, session_id: str = None):
        """Initialize helper classes with current evaluation context"""
        self.event_analyzer = EventAnalyzer(
            namespace=query_namespace,
            query_name=query_name,
            session_id=session_id
        )
        
        self.tool_helper = ToolHelper(self.event_analyzer)
        self.agent_helper = AgentHelper(self.event_analyzer)
        self.team_helper = TeamHelper(self.event_analyzer)
        self.llm_helper = LLMHelper(self.event_analyzer)
        self.sequence_helper = SequenceHelper(self.event_analyzer)
        self.query_helper = QueryHelper(self.event_analyzer)
    
    async def evaluate(self, request: UnifiedEvaluationRequest) -> EvaluationResponse:
        """
        Execute event-based evaluation using basic pattern matching against Kubernetes events.
        """
        logger.info(f"Processing event evaluation with evaluator: {request.evaluatorName}")
        
        # Extract rules from config
        rules = request.config.rules or []
        if not rules:
            return EvaluationResponse(
                score="0.0",
                passed=False,
                reasoning="Event evaluation requires rules in config",
                metadata={"error": "no_rules_provided"}
            )
        
        logger.info(f"Found {len(rules)} expression rules for event evaluation")
        
        # Extract query context for event filtering
        query_name = request.parameters.get("query.name")
        query_namespace = request.parameters.get("query.namespace") 
        session_id = request.parameters.get("sessionId")
        
        if not query_name or not query_namespace:
            return EvaluationResponse(
                score="0.0",
                passed=False,
                reasoning="Event evaluation requires query.name and query.namespace parameters",
                metadata={"error": "missing_query_context"}
            )
        
        # Initialize helper classes with context
        self._initialize_helpers(query_namespace, query_name, session_id)
        
        # Fetch events filtered by query and session for backward compatibility
        events = await self._fetch_k8s_events(query_namespace, query_name, session_id)
        logger.info(f"Fetched {len(events)} events for evaluation")
        
        # Evaluate rules using semantic helpers and basic pattern matching
        rule_results = []
        total_weight = 0
        weighted_score = 0
        
        for rule in rules:
            rule_name = rule.get("name", "unnamed")
            expression = rule.get("expression", "")
            weight = rule.get("weight", 1)
            description = rule.get("description", "")
            
            total_weight += weight
            
            # Evaluate expression using semantic helpers or basic pattern matching
            passed = await self._evaluate_expression(expression, events)
            
            rule_results.append({
                "name": rule_name,
                "passed": passed,
                "description": description,
                "weight": weight
            })
            
            # Add to weighted score (1.0 for pass, 0.0 for fail)
            weighted_score += weight * (1.0 if passed else 0.0)
            
            logger.info(f"Rule '{rule_name}': {'PASSED' if passed else 'FAILED'}")
        
        # Calculate overall score and pass/fail
        overall_score = weighted_score / total_weight if total_weight > 0 else 0.0
        min_score_threshold = float(request.parameters.get("min-score", "0.7"))
        overall_passed = overall_score >= min_score_threshold
        
        # Create comprehensive metadata
        metadata = {
            "total_rules": str(len(rules)),
            "passed_rules": str(sum(1 for r in rule_results if r["passed"])),
            "failed_rules": str(len(rules) - sum(1 for r in rule_results if r["passed"])),
            "total_weight": str(total_weight),
            "weighted_score": f"{weighted_score:.3f}",
            "min_score_threshold": str(min_score_threshold),
            "events_analyzed": str(len(events)),
            "query_name": query_name,
            "session_id": session_id or "none"
        }
        
        # Add individual rule results to metadata
        for i, result in enumerate(rule_results):
            prefix = f"rule_{i}_{result['name']}"
            metadata[f"{prefix}_passed"] = str(result["passed"])
            metadata[f"{prefix}_weight"] = str(result["weight"])
        
        logger.info(f"Event evaluation completed: score={overall_score:.3f}, passed={overall_passed}")
        
        return EvaluationResponse(
            score=f"{overall_score:.3f}",
            passed=overall_passed,
            reasoning=f"Event evaluation with {len(rules)} rules, {len(events)} events analyzed",
            metadata=metadata
        )
    
    async def _evaluate_expression(self, expression: str, events: List[Dict[str, Any]]) -> bool:
        """
        Evaluate expression using semantic helpers or fall back to basic pattern matching.
        """
        # Check if expression uses semantic helper syntax (contains helper method calls)
        if self._is_semantic_expression(expression):
            try:
                return await self._evaluate_semantic_expression(expression)
            except Exception as e:
                logger.warning(f"Semantic expression evaluation failed: {e}, falling back to basic pattern matching")
                return self._evaluate_basic_pattern(expression, events)
        else:
            # Use basic pattern matching for backward compatibility
            return self._evaluate_basic_pattern(expression, events)
    
    def _is_semantic_expression(self, expression: str) -> bool:
        """Check if expression uses semantic helper syntax"""
        semantic_patterns = [
            r'\btools?\.',      # tool.method() or tools.method()
            r'\bagents?\.',     # agent.method() or agents.method()  
            r'\bteams?\.',      # team.method() or teams.method()
            r'\bllm\.',         # llm.method()
            r'\bsequence\.',    # sequence.method()
            r'\bquery\.',       # query.method()
        ]
        
        return any(re.search(pattern, expression, re.IGNORECASE) for pattern in semantic_patterns)
    
    async def _evaluate_semantic_expression(self, expression: str) -> bool:
        """
        Evaluate semantic helper expressions.
        
        Examples:
        - "tool.was_called()"
        - "tool.get_success_rate() >= 0.8"
        - "agent.was_executed('my-agent')"
        - "query.was_resolved()"
        - "sequence.check_execution_order(['ToolCallStart', 'ToolCallComplete'])"
        """
        try:
            # Simple expression evaluation - replace helper calls with actual results
            expression = await self._replace_helper_calls(expression)
            
            # Evaluate the final boolean expression
            return eval(expression)
            
        except Exception as e:
            logger.error(f"Failed to evaluate semantic expression '{expression}': {e}")
            return False
    
    async def _replace_helper_calls(self, expression: str) -> str:
        """Replace helper method calls with their actual results"""
        # Tool helper patterns
        expression = await self._replace_tool_calls(expression)
        
        # Agent helper patterns
        expression = await self._replace_agent_calls(expression)
        
        # Team helper patterns  
        expression = await self._replace_team_calls(expression)
        
        # LLM helper patterns
        expression = await self._replace_llm_calls(expression)
        
        # Sequence helper patterns
        expression = await self._replace_sequence_calls(expression)
        
        # Query helper patterns
        expression = await self._replace_query_calls(expression)
        
        return expression
    
    async def _replace_tool_calls(self, expression: str) -> str:
        """Replace tool helper calls with results"""
        # tool.was_called() or tools.was_called()
        if re.search(r'\btool[s]?\.was_called\(\)', expression, re.IGNORECASE):
            result = await self.tool_helper.was_tool_called()
            expression = re.sub(r'\btool[s]?\.was_called\(\)', str(result), expression, flags=re.IGNORECASE)
        
        # tool.get_success_rate()
        if re.search(r'\btool[s]?\.get_success_rate\(\)', expression, re.IGNORECASE):
            result = await self.tool_helper.get_tool_success_rate()
            expression = re.sub(r'\btool[s]?\.get_success_rate\(\)', str(result), expression, flags=re.IGNORECASE)
        
        # tool.get_call_count()
        if re.search(r'\btool[s]?\.get_call_count\(\)', expression, re.IGNORECASE):
            result = await self.tool_helper.get_tool_call_count()
            expression = re.sub(r'\btool[s]?\.get_call_count\(\)', str(result), expression, flags=re.IGNORECASE)
        
        return expression
    
    async def _replace_agent_calls(self, expression: str) -> str:
        """Replace agent helper calls with results"""
        # agent.was_executed() or agents.was_executed()
        if re.search(r'\bagent[s]?\.was_executed\(\)', expression, re.IGNORECASE):
            result = await self.agent_helper.was_agent_executed()
            expression = re.sub(r'\bagent[s]?\.was_executed\(\)', str(result), expression, flags=re.IGNORECASE)
        
        # agent.get_success_rate()
        if re.search(r'\bagent[s]?\.get_success_rate\(\)', expression, re.IGNORECASE):
            result = await self.agent_helper.get_agent_success_rate()
            expression = re.sub(r'\bagent[s]?\.get_success_rate\(\)', str(result), expression, flags=re.IGNORECASE)
        
        # agent.get_execution_count()
        if re.search(r'\bagent[s]?\.get_execution_count\(\)', expression, re.IGNORECASE):
            result = await self.agent_helper.get_agent_execution_count()
            expression = re.sub(r'\bagent[s]?\.get_execution_count\(\)', str(result), expression, flags=re.IGNORECASE)
        
        return expression
    
    async def _replace_team_calls(self, expression: str) -> str:
        """Replace team helper calls with results"""
        # team.was_executed() or teams.was_executed()
        if re.search(r'\bteam[s]?\.was_executed\(\)', expression, re.IGNORECASE):
            result = await self.team_helper.was_team_executed()
            expression = re.sub(r'\bteam[s]?\.was_executed\(\)', str(result), expression, flags=re.IGNORECASE)
        
        # team.get_success_rate()
        if re.search(r'\bteam[s]?\.get_success_rate\(\)', expression, re.IGNORECASE):
            result = await self.team_helper.get_team_success_rate()
            expression = re.sub(r'\bteam[s]?\.get_success_rate\(\)', str(result), expression, flags=re.IGNORECASE)
        
        return expression
    
    async def _replace_llm_calls(self, expression: str) -> str:
        """Replace LLM helper calls with results"""
        # llm.get_call_count()
        if re.search(r'\bllm\.get_call_count\(\)', expression, re.IGNORECASE):
            result = await self.llm_helper.get_llm_call_count()
            expression = re.sub(r'\bllm\.get_call_count\(\)', str(result), expression, flags=re.IGNORECASE)
        
        # llm.get_success_rate()
        if re.search(r'\bllm\.get_success_rate\(\)', expression, re.IGNORECASE):
            result = await self.llm_helper.get_llm_success_rate()
            expression = re.sub(r'\bllm\.get_success_rate\(\)', str(result), expression, flags=re.IGNORECASE)
        
        return expression
    
    async def _replace_sequence_calls(self, expression: str) -> str:
        """Replace sequence helper calls with results"""
        # sequence.was_completed(['event1', 'event2'])
        sequence_complete_pattern = r"\bsequence\.was_completed\(\[([^\]]+)\]\)"
        match = re.search(sequence_complete_pattern, expression, re.IGNORECASE)
        if match:
            events_str = match.group(1)
            # Parse the event list (simplified - assumes quoted strings)
            events_list = [e.strip().strip("'\"") for e in events_str.split(',')]
            result = await self.sequence_helper.was_sequence_completed(events_list)
            expression = re.sub(sequence_complete_pattern, str(result), expression, flags=re.IGNORECASE)
        
        return expression
    
    async def _replace_query_calls(self, expression: str) -> str:
        """Replace query helper calls with results"""
        # query.was_resolved()
        if re.search(r'\bquery\.was_resolved\(\)', expression, re.IGNORECASE):
            result = await self.query_helper.was_query_resolved()
            expression = re.sub(r'\bquery\.was_resolved\(\)', str(result), expression, flags=re.IGNORECASE)
        
        # query.get_execution_time()
        if re.search(r'\bquery\.get_execution_time\(\)', expression, re.IGNORECASE):
            result = await self.query_helper.get_query_execution_time()
            result_val = result if result is not None else 0.0
            expression = re.sub(r'\bquery\.get_execution_time\(\)', str(result_val), expression, flags=re.IGNORECASE)
        
        # query.get_resolution_status()
        if re.search(r'\bquery\.get_resolution_status\(\)', expression, re.IGNORECASE):
            result = await self.query_helper.get_query_resolution_status()
            expression = re.sub(r'\bquery\.get_resolution_status\(\)', f"'{result}'", expression, flags=re.IGNORECASE)
        
        return expression

    def _evaluate_basic_pattern(self, expression: str, events: List[Dict[str, Any]]) -> bool:
        """
        Enhanced pattern matching for Phase 2 complex expressions.
        """
        # Simple reason matching (exact matches)
        if expression == "ToolCallComplete":
            return any(event.get("reason") == "ToolCallComplete" for event in events)
        elif expression == "ToolCallStart":
            return any(event.get("reason") == "ToolCallStart" for event in events)
        elif expression == "AgentExecutionStart":
            return any(event.get("reason") == "AgentExecutionStart" for event in events)
        elif expression == "AgentExecutionComplete":
            return any(event.get("reason") == "AgentExecutionComplete" for event in events)
        elif expression == "TeamExecutionStart":
            return any(event.get("reason") == "TeamExecutionStart" for event in events)
        elif expression == "TeamExecutionComplete":
            return any(event.get("reason") == "TeamExecutionComplete" for event in events)
        elif "AgentExecution" in expression:
            return any(event.get("reason") == "AgentExecution" for event in events)
        elif "TeamMember" in expression:
            return any(event.get("reason") == "TeamMember" for event in events)
        elif "TeamExecution" in expression:
            return any(event.get("reason") == "TeamExecution" for event in events)
        elif "A2ACall" in expression:
            return any(event.get("reason") == "A2ACall" for event in events)
            
        # Enhanced CEL-like expressions
        elif "events.exists(e, e.reason == 'ToolCallComplete')" in expression:
            return any(event.get("reason") == "ToolCallComplete" for event in events)
        elif "events.filter(e, e.reason == 'ToolCallComplete').size() >= 2" in expression:
            tool_events = [e for e in events if e.get("reason") == "ToolCallComplete"]
            return len(tool_events) >= 2
        elif "events.exists(e, e.reason == 'AgentExecution')" in expression:
            return any(event.get("reason") == "AgentExecution" for event in events)
        elif "events.exists(e, e.reason == 'TeamExecution')" in expression:
            return any(event.get("reason") == "TeamExecution" for event in events)
        elif "events.filter(e, e.reason == 'AgentExecution').size() >= 2" in expression:
            agent_events = [e for e in events if e.get("reason") == "AgentExecution"]
            return len(agent_events) >= 2
        elif "events.exists(e, e.message.contains('sessionId') && e.message.contains('Metadata'))" in expression:
            return any("sessionId" in event.get("message", "") and "Metadata" in event.get("message", "") for event in events)
        elif "events.exists(e, e.reason.contains('Complete'))" in expression:
            return any("Complete" in event.get("reason", "") for event in events)
            
        # Size comparison expressions
        elif "events.size() > 0" in expression:
            return len(events) > 0
        elif "events.size() >= 3" in expression:
            return len(events) >= 3
        elif "events.size() >= 5" in expression:
            return len(events) >= 5
        elif "events.size() <= 30" in expression:
            return len(events) <= 30
        elif "events.size() <= 50" in expression:
            return len(events) <= 50
        elif "&& events.size() <=" in expression:
            # Handle complex size expressions like "events.size() >= 3 && events.size() <= 30"
            parts = expression.split("&&")
            results = []
            for part in parts:
                part = part.strip()
                if "events.size() >=" in part:
                    try:
                        min_events = int(part.split(">=")[1].strip())
                        results.append(len(events) >= min_events)
                    except:
                        results.append(True)
                elif "events.size() <=" in part:
                    try:
                        max_events = int(part.split("<=")[1].strip())
                        results.append(len(events) <= max_events)
                    except:
                        results.append(True)
                elif "events.size() >" in part:
                    try:
                        min_events = int(part.split(">")[1].strip())
                        results.append(len(events) > min_events)
                    except:
                        results.append(True)
            return all(results)
        elif "events.size()" in expression and ">=" in expression:
            # Extract number after >=
            try:
                min_events = int(expression.split(">=")[1].strip())
                return len(events) >= min_events
            except:
                return len(events) > 0
        else:
            # Default: just check if we have any events
            return len(events) > 0
    
    async def _fetch_k8s_events(self, namespace: str, query_name: str, session_id: str = None) -> List[Dict[str, Any]]:
        """Fetch Kubernetes events related to the query and session"""
        if not self.k8s_client:
            logger.warning("Kubernetes client not available, returning empty events")
            return []
            
        logger.info(f"Fetching events for query {query_name} in namespace {namespace}")
        
        # Get events where involvedObject is the query
        field_selector = f"involvedObject.name={query_name},involvedObject.kind=Query"
        
        try:
            events = self.k8s_client.list_namespaced_event(
                namespace=namespace,
                field_selector=field_selector
            )
        except ApiException as e:
            logger.error(f"Failed to fetch Kubernetes events: {e}")
            return []
        except Exception as e:
            logger.error(f"Unexpected error fetching events: {e}")
            return []
        
        # Convert to list and filter by session if provided
        event_list = []
        for event in events.items:
            event_dict = self._event_to_dict(event)
            
            # Filter by sessionId if provided
            if session_id:
                try:
                    msg_data = json.loads(event_dict['message'])
                    # Only include events from this session
                    if msg_data.get('Metadata', {}).get('sessionId') != session_id:
                        continue
                except (json.JSONDecodeError, KeyError, TypeError):
                    # Skip events without proper JSON or sessionId
                    continue
                    
            event_list.append(event_dict)
        
        logger.info(f"Filtered to {len(event_list)} events for session {session_id}")
        return event_list
    
    def _event_to_dict(self, event) -> Dict[str, Any]:
        """Convert Kubernetes event to dictionary for evaluation"""
        return {
            "name": event.metadata.name if event.metadata else "",
            "namespace": event.metadata.namespace if event.metadata else "",
            "reason": event.reason or "",
            "message": event.message or "",
            "firstTimestamp": event.first_timestamp.isoformat() if event.first_timestamp else "",
            "lastTimestamp": event.last_timestamp.isoformat() if event.last_timestamp else "",
            "count": event.count or 1,
            "type": event.type or "",
            "involvedObject": {
                "kind": event.involved_object.kind if event.involved_object else "",
                "name": event.involved_object.name if event.involved_object else "",
                "namespace": event.involved_object.namespace if event.involved_object else ""
            }
        }