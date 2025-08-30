"""
Integration example showing how to use the ARK SDK Event Helper Library
with the existing event evaluation provider.

This demonstrates how to replace complex CEL expressions with human-friendly 
semantic methods for common evaluation scenarios.
"""

from typing import Dict, Any
from .event_analyzer import EventAnalyzer
from .tool_helper import ToolHelper
from .agent_helper import AgentHelper
from .team_helper import TeamHelper
from .llm_helper import LLMHelper
from .types import EventScope


class SemanticEventEvaluator:
    """
    Semantic event evaluator that uses the helper library to replace
    complex expressions with readable method calls.
    """
    
    def __init__(self, namespace: str, query_name: str = None, session_id: str = None):
        self.analyzer = EventAnalyzer(namespace, query_name, session_id)
        self.tools = ToolHelper(self.analyzer)
        self.agents = AgentHelper(self.analyzer)
        self.teams = TeamHelper(self.analyzer)
        self.llm = LLMHelper(self.analyzer)
    
    async def evaluate_rule(self, rule_name: str, expression: str) -> bool:
        """
        Evaluate a rule using semantic methods instead of CEL expressions.
        
        This method maps common evaluation patterns to semantic helper calls.
        """
        # Replace common CEL patterns with semantic method calls
        
        # Tool-related evaluations
        if expression == "ToolCallComplete":
            return await self.tools.was_tool_called()
        elif "events.filter(e, e.reason == 'ToolCallComplete').size() >= 2" in expression:
            return await self.tools.get_tool_call_count() >= 2
        elif "ToolCallStart" in expression:
            return await self.tools.was_tool_called()
            
        # Agent-related evaluations  
        elif expression == "AgentExecutionComplete":
            return await self.agents.was_agent_executed()
        elif "events.filter(e, e.reason == 'AgentExecution').size() >= 2" in expression:
            return await self.agents.get_agent_execution_count() >= 2
        elif "AgentExecutionStart" in expression:
            return await self.agents.was_agent_executed()
            
        # Team-related evaluations
        elif expression == "TeamExecutionStart":
            return await self.teams.was_team_executed()
        elif expression == "TeamExecutionComplete":
            return await self.teams.was_team_executed()
        elif "TeamMember" in expression:
            return await self.teams.get_team_member_count() > 0
            
        # LLM-related evaluations
        elif "LLMCall" in expression:
            return await self.llm.were_llm_calls_made()
            
        # Size-based evaluations
        elif "events.size() > 0" in expression:
            events = await self.analyzer.get_events()
            return len(events) > 0
        elif "events.size() >= 3" in expression:
            events = await self.analyzer.get_events()
            return len(events) >= 3
        elif "events.size() >= 5" in expression:
            events = await self.analyzer.get_events()
            return len(events) >= 5
        elif "events.size() <= 30" in expression:
            events = await self.analyzer.get_events()
            return len(events) <= 30
            
        # Complex size evaluations
        elif "&& events.size() <=" in expression:
            events = await self.analyzer.get_events()
            # Parse min and max from expression
            if "events.size() >= 3 && events.size() <= 30" in expression:
                return 3 <= len(events) <= 30
            elif "events.size() >= 5 && events.size() <= 50" in expression:
                return 5 <= len(events) <= 50
                
        # Metadata-based evaluations
        elif "events.exists(e, e.message.contains('sessionId'))" in expression:
            events = await self.analyzer.get_events()
            return any(e.metadata and e.metadata.sessionId for e in events)
            
        # Fallback to basic pattern matching
        else:
            events = await self.analyzer.get_events()
            return len(events) > 0
    
    async def get_evaluation_insights(self) -> Dict[str, Any]:
        """
        Provide rich insights about the execution using semantic methods.
        This goes beyond simple pass/fail to provide detailed analytics.
        """
        insights = {}
        
        # Tool insights
        insights["tools"] = {
            "used": await self.tools.get_tools_used(),
            "call_count": await self.tools.get_tool_call_count(),
            "success_rate": await self.tools.get_tool_success_rate(),
            "avg_execution_time": await self.tools.get_average_tool_execution_time()
        }
        
        # Agent insights  
        insights["agents"] = {
            "used": await self.agents.get_agents_used(),
            "execution_count": await self.agents.get_agent_execution_count(),
            "success_rate": await self.agents.get_agent_success_rate(),
            "avg_execution_time": await self.agents.get_average_agent_execution_time()
        }
        
        # Team insights
        insights["teams"] = {
            "used": await self.teams.get_teams_used(),
            "member_count": await self.teams.get_team_member_count(),
            "collaboration_pattern": await self.teams.get_team_collaboration_pattern(),
            "a2a_calls": await self.teams.get_agent_to_agent_call_count()
        }
        
        # LLM insights
        insights["llm"] = {
            "models_used": await self.llm.get_models_used(),
            "call_count": await self.llm.get_llm_call_count(),
            "avg_response_time": await self.llm.get_average_llm_response_time(),
            "usage_by_model": await self.llm.get_llm_usage_by_model(),
            "fastest_model": await self.llm.get_fastest_model()
        }
        
        # Overall event statistics
        events = await self.analyzer.get_events()
        insights["overall"] = {
            "total_events": len(events),
            "event_types": await self.analyzer.count_events_by_type(),
            "has_errors": len(await self.analyzer.get_error_events()) > 0
        }
        
        return insights


# Example usage in event_evaluation.py integration
async def example_integration_usage():
    """
    Example showing how to integrate semantic evaluation with existing provider.
    """
    
    # Initialize semantic evaluator
    evaluator = SemanticEventEvaluator(
        namespace="default",
        query_name="my-query", 
        session_id="session-123"
    )
    
    # Example rule evaluation (replaces complex CEL)
    rules = [
        {"name": "tools_were_used", "expression": "ToolCallComplete", "weight": 1},
        {"name": "multiple_tool_calls", "expression": "events.filter(e, e.reason == 'ToolCallComplete').size() >= 2", "weight": 2},
        {"name": "agent_executed", "expression": "AgentExecutionComplete", "weight": 1},
        {"name": "reasonable_event_count", "expression": "events.size() >= 3 && events.size() <= 30", "weight": 1}
    ]
    
    passed_rules = 0
    total_weight = 0
    
    for rule in rules:
        rule_passed = await evaluator.evaluate_rule(rule["name"], rule["expression"])
        weight = rule["weight"]
        
        if rule_passed:
            passed_rules += weight
        total_weight += weight
        
        print(f"Rule '{rule['name']}': {'PASSED' if rule_passed else 'FAILED'}")
    
    # Calculate score
    score = passed_rules / total_weight if total_weight > 0 else 0.0
    print(f"Overall score: {score:.3f}")
    
    # Get rich insights
    insights = await evaluator.get_evaluation_insights()
    print(f"Tools used: {insights['tools']['used']}")
    print(f"Agent success rate: {insights['agents']['success_rate']:.2f}")
    print(f"Total events: {insights['overall']['total_events']}")