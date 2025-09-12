"""
ARK SDK Event Helper Library Integration Guide

This module provides comprehensive examples and patterns for integrating
the semantic helper library with existing evaluation configurations.
"""

import asyncio
import logging
from typing import Dict, Any, List

from .event_analyzer import EventAnalyzer
from .tool_helper import ToolHelper
from .agent_helper import AgentHelper
from .query_helper import QueryHelper
from .sequence_helper import SequenceHelper
from .types import EventScope

logger = logging.getLogger(__name__)


class EvaluationIntegration:
    """
    Integration example showing how to use helper classes for evaluations
    """
    
    def __init__(self, namespace: str, query_name: str, session_id: str = None):
        """Initialize integration with evaluation context"""
        self.event_analyzer = EventAnalyzer(
            namespace=namespace,
            query_name=query_name,
            session_id=session_id
        )
        
        # Initialize all helper classes
        self.tool_helper = ToolHelper(self.event_analyzer)
        self.agent_helper = AgentHelper(self.event_analyzer)
        self.query_helper = QueryHelper(self.event_analyzer)
        self.sequence_helper = SequenceHelper(self.event_analyzer)
    
    async def evaluate_comprehensive_execution(self) -> Dict[str, Any]:
        """
        Comprehensive evaluation using all helper classes.
        
        Returns detailed analysis of query execution including:
        - Query resolution status
        - Tool usage patterns
        - Agent execution metrics
        - Sequence validation
        - Performance metrics
        """
        results = {
            "query_analysis": {},
            "tool_analysis": {},
            "agent_analysis": {},
            "sequence_analysis": {},
            "performance_metrics": {},
            "overall_score": 0.0
        }
        
        # Query Analysis
        results["query_analysis"] = {
            "was_resolved": await self.query_helper.was_query_resolved(),
            "resolution_status": await self.query_helper.get_query_resolution_status(),
            "execution_time": await self.query_helper.get_query_execution_time(),
            "target_count": await self.query_helper.get_query_targets(),
            "complexity_metrics": await self.query_helper.get_query_complexity_metrics()
        }
        
        # Tool Analysis
        results["tool_analysis"] = {
            "was_called": await self.tool_helper.was_tool_called(),
            "call_count": await self.tool_helper.get_tool_call_count(),
            "success_rate": await self.tool_helper.get_tool_success_rate(),
            "tools_used": await self.tool_helper.get_tools_used(),
            "average_execution_time": await self.tool_helper.get_average_tool_execution_time(),
            "successful_calls": len(await self.tool_helper.get_successful_tool_calls()),
            "failed_calls": len(await self.tool_helper.get_failed_tool_calls())
        }
        
        # Agent Analysis
        results["agent_analysis"] = {
            "was_executed": await self.agent_helper.was_agent_executed(),
            "execution_count": await self.agent_helper.get_agent_execution_count(),
            "success_rate": await self.agent_helper.get_agent_success_rate(),
            "agents_used": await self.agent_helper.get_agents_used(),
            "average_execution_time": await self.agent_helper.get_average_agent_execution_time(),
            "error_details": await self.agent_helper.get_agent_error_details()
        }
        
        # Sequence Analysis
        standard_sequence = ["ResolveStart", "AgentExecutionStart", "ToolCallStart", "ToolCallComplete", "AgentExecutionComplete", "ResolveComplete"]
        results["sequence_analysis"] = {
            "standard_sequence_completed": await self.sequence_helper.was_sequence_completed(standard_sequence),
            "execution_flow": await self.sequence_helper.get_execution_flow(),
            "parallel_execution_groups": await self.sequence_helper.detect_parallel_execution(),
            "execution_phases": await self.sequence_helper.get_execution_phases()
        }
        
        # Performance Metrics
        results["performance_metrics"] = {
            "total_execution_time": results["query_analysis"]["execution_time"],
            "tool_efficiency": results["tool_analysis"]["success_rate"],
            "agent_efficiency": results["agent_analysis"]["success_rate"],
            "complexity_level": results["query_analysis"]["complexity_metrics"].get("complexity_level", "unknown") if results["query_analysis"]["complexity_metrics"] else "unknown"
        }
        
        # Calculate overall score
        results["overall_score"] = await self._calculate_overall_score(results)
        
        return results
    
    async def _calculate_overall_score(self, results: Dict[str, Any]) -> float:
        """Calculate weighted overall score based on analysis results"""
        score = 0.0
        total_weight = 0.0
        
        # Query resolution (40% weight)
        if results["query_analysis"]["was_resolved"]:
            score += 0.4
        total_weight += 0.4
        
        # Tool success rate (20% weight)
        tool_success = results["tool_analysis"]["success_rate"]
        score += 0.2 * tool_success
        total_weight += 0.2
        
        # Agent success rate (20% weight)
        agent_success = results["agent_analysis"]["success_rate"]
        score += 0.2 * agent_success
        total_weight += 0.2
        
        # Sequence completion (10% weight)
        if results["sequence_analysis"]["standard_sequence_completed"]:
            score += 0.1
        total_weight += 0.1
        
        # Performance bonus/penalty (10% weight)
        exec_time = results["performance_metrics"]["total_execution_time"]
        if exec_time and exec_time <= 30.0:  # Fast execution bonus
            score += 0.1
        elif exec_time and exec_time > 120.0:  # Slow execution penalty
            score -= 0.05
        total_weight += 0.1
        
        return min(score / total_weight if total_weight > 0 else 0.0, 1.0)
    
    async def evaluate_rule_expressions(self, rules: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Evaluate a list of semantic expression rules.
        
        Args:
            rules: List of rule dictionaries with 'name', 'expression', 'weight' keys
            
        Returns:
            List of rule results with evaluation outcomes
        """
        results = []
        
        for rule in rules:
            rule_name = rule.get("name", "unnamed")
            expression = rule.get("expression", "")
            weight = rule.get("weight", 1)
            description = rule.get("description", "")
            
            try:
                # Evaluate the semantic expression
                passed = await self._evaluate_semantic_expression(expression)
                
                results.append({
                    "name": rule_name,
                    "expression": expression,
                    "description": description,
                    "weight": weight,
                    "passed": passed,
                    "error": None
                })
                
            except Exception as e:
                logger.error(f"Failed to evaluate rule '{rule_name}': {e}")
                results.append({
                    "name": rule_name,
                    "expression": expression,
                    "description": description,
                    "weight": weight,
                    "passed": False,
                    "error": str(e)
                })
        
        return results
    
    async def _evaluate_semantic_expression(self, expression: str) -> bool:
        """
        Evaluate semantic helper expressions by replacing method calls with results.
        
        Supported expressions:
        - tool.was_called()
        - tool.get_success_rate() >= 0.8
        - agent.was_executed()
        - agent.get_success_rate() >= 0.9
        - query.was_resolved()
        - query.get_execution_time() <= 30.0
        - sequence.was_completed(['event1', 'event2'])
        """
        try:
            # Replace helper method calls with actual results
            expression = await self._replace_helper_calls(expression)
            
            # Safely evaluate the final boolean expression
            # TODO: replace with domain specific eval
            return bool(eval(expression))
            
        except Exception as e:
            logger.error(f"Failed to evaluate expression '{expression}': {e}")
            return False
    
    async def _replace_helper_calls(self, expression: str) -> str:
        """Replace helper method calls with their actual results"""
        import re
        
        # Tool helper replacements
        if "tool.was_called()" in expression:
            result = await self.tool_helper.was_tool_called()
            expression = expression.replace("tool.was_called()", str(result))
        
        if "tool.get_success_rate()" in expression:
            result = await self.tool_helper.get_tool_success_rate()
            expression = expression.replace("tool.get_success_rate()", str(result))
        
        if "tool.get_call_count()" in expression:
            result = await self.tool_helper.get_tool_call_count()
            expression = expression.replace("tool.get_call_count()", str(result))
        
        # Agent helper replacements
        if "agent.was_executed()" in expression:
            result = await self.agent_helper.was_agent_executed()
            expression = expression.replace("agent.was_executed()", str(result))
        
        if "agent.get_success_rate()" in expression:
            result = await self.agent_helper.get_agent_success_rate()
            expression = expression.replace("agent.get_success_rate()", str(result))
        
        if "agent.get_execution_count()" in expression:
            result = await self.agent_helper.get_agent_execution_count()
            expression = expression.replace("agent.get_execution_count()", str(result))
        
        # Query helper replacements
        if "query.was_resolved()" in expression:
            result = await self.query_helper.was_query_resolved()
            expression = expression.replace("query.was_resolved()", str(result))
        
        if "query.get_execution_time()" in expression:
            result = await self.query_helper.get_query_execution_time()
            result_val = result if result is not None else 0.0
            expression = expression.replace("query.get_execution_time()", str(result_val))
        
        if "query.get_resolution_status()" in expression:
            result = await self.query_helper.get_query_resolution_status()
            expression = expression.replace("query.get_resolution_status()", f"'{result}'")
        
        # Sequence helper replacements (more complex parsing needed)
        sequence_pattern = r"sequence\.was_completed\(\[([^\]]+)\]\)"
        match = re.search(sequence_pattern, expression)
        if match:
            events_str = match.group(1)
            events_list = [e.strip().strip("'\"") for e in events_str.split(',')]
            result = await self.sequence_helper.was_sequence_completed(events_list)
            expression = re.sub(sequence_pattern, str(result), expression)
        
        return expression


# Migration examples and patterns
MIGRATION_PATTERNS = {
    "cel_to_semantic": {
        # Tool patterns
        "events.exists(e, e.reason == 'ToolCallComplete')": "tool.was_called()",
        "events.filter(e, e.reason == 'ToolCallComplete').size()": "tool.get_call_count()",
        "events.filter(e, e.reason == 'ToolCallComplete').size() >= 2": "tool.get_call_count() >= 2",
        
        # Agent patterns  
        "events.exists(e, e.reason == 'AgentExecutionComplete')": "agent.was_executed()",
        "events.filter(e, e.reason == 'AgentExecutionStart').size()": "agent.get_execution_count()",
        
        # Query patterns
        "events.exists(e, e.reason == 'ResolveComplete')": "query.was_resolved()",
        
        # Sequence patterns
        "events.exists(e1, e1.reason == 'ToolCallStart') && events.exists(e2, e2.reason == 'ToolCallComplete')": "sequence.was_completed(['ToolCallStart', 'ToolCallComplete'])",
        
        # Size patterns
        "events.size() > 0": "tool.was_called() or agent.was_executed()",
        "events.size() >= 5": "query.get_complexity_metrics()['total_events'] >= 5"
    }
}


def get_migration_example(cel_expression: str) -> str:
    """Get semantic equivalent for a CEL expression"""
    return MIGRATION_PATTERNS["cel_to_semantic"].get(cel_expression, cel_expression)


async def example_usage():
    """Example usage of the integration classes"""
    
    # Initialize integration
    integration = EvaluationIntegration(
        namespace="default",
        query_name="example-query", 
        session_id="session-123"
    )
    
    # Run comprehensive evaluation
    results = await integration.evaluate_comprehensive_execution()
    
    print("=== Comprehensive Evaluation Results ===")
    print(f"Overall Score: {results['overall_score']:.3f}")
    print(f"Query Resolved: {results['query_analysis']['was_resolved']}")
    print(f"Tools Used: {results['tool_analysis']['was_called']}")
    print(f"Agents Executed: {results['agent_analysis']['was_executed']}")
    
    # Example semantic expression evaluation
    rules = [
        {
            "name": "tools_used",
            "expression": "tool.was_called()",
            "description": "Tools were utilized",
            "weight": 1
        },
        {
            "name": "high_success_rate",
            "expression": "tool.get_success_rate() >= 0.8 and agent.get_success_rate() >= 0.8",
            "description": "High success rates for both tools and agents",
            "weight": 2
        },
        {
            "name": "query_completed",
            "expression": "query.was_resolved() and query.get_resolution_status() == 'success'",
            "description": "Query completed successfully",
            "weight": 3
        }
    ]
    
    rule_results = await integration.evaluate_rule_expressions(rules)
    
    print("\n=== Rule Evaluation Results ===")
    for result in rule_results:
        status = "PASS" if result["passed"] else "FAIL"
        print(f"{result['name']}: {status} (weight: {result['weight']})")
        if result.get("error"):
            print(f"  Error: {result['error']}")


if __name__ == "__main__":
    # Run the example
    asyncio.run(example_usage())