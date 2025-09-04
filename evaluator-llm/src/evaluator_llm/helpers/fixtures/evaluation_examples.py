"""
Example evaluation configurations showing migration from CEL to semantic helpers
"""

EVALUATION_EXAMPLES = {
    "migration_examples": {
        "description": "Examples showing how to migrate from raw CEL expressions to semantic helpers",
        
        "tool_evaluation": {
            "old_cel_expression": "events.exists(e, e.reason == 'ToolCallComplete')",
            "new_semantic_expression": "tool.was_called()",
            "description": "Check if any tool was called during execution"
        },
        
        "tool_success_rate": {
            "old_cel_expression": "events.filter(e, e.reason == 'ToolCallComplete').size() / (events.filter(e, e.reason == 'ToolCallComplete').size() + events.filter(e, e.reason == 'ToolCallError').size()) >= 0.8",
            "new_semantic_expression": "tool.get_success_rate() >= 0.8",
            "description": "Check if tool success rate is at least 80%"
        },
        
        "agent_execution": {
            "old_cel_expression": "events.exists(e, e.reason == 'AgentExecutionComplete')",
            "new_semantic_expression": "agent.was_executed()",
            "description": "Check if any agent was executed"
        },
        
        "query_resolution": {
            "old_cel_expression": "events.exists(e, e.reason == 'ResolveComplete')",
            "new_semantic_expression": "query.was_resolved()",
            "description": "Check if query was successfully resolved"
        },
        
        "execution_order": {
            "old_cel_expression": "events.exists(e1, e1.reason == 'ToolCallStart') && events.exists(e2, e2.reason == 'ToolCallComplete')",
            "new_semantic_expression": "sequence.was_completed(['ToolCallStart', 'ToolCallComplete'])",
            "description": "Check if tool execution sequence was completed"
        }
    },
    
    "complete_evaluation_configs": {
        "description": "Complete evaluation configurations using semantic helpers",
        
        "basic_tool_evaluation": {
            "rules": [
                {
                    "name": "tools_were_used",
                    "expression": "tool.was_called()",
                    "description": "At least one tool was called during execution",
                    "weight": 1
                },
                {
                    "name": "tool_success_rate",
                    "expression": "tool.get_success_rate() >= 0.8",
                    "description": "Tool success rate is at least 80%",
                    "weight": 2
                },
                {
                    "name": "multiple_tools",
                    "expression": "tool.get_call_count() >= 2",
                    "description": "At least 2 tool calls were made",
                    "weight": 1
                }
            ],
            "min_score": 0.7
        },
        
        "agent_performance_evaluation": {
            "rules": [
                {
                    "name": "agent_executed",
                    "expression": "agent.was_executed()",
                    "description": "Agent execution occurred",
                    "weight": 1
                },
                {
                    "name": "agent_success",
                    "expression": "agent.get_success_rate() >= 0.9",
                    "description": "Agent execution success rate >= 90%",
                    "weight": 2
                },
                {
                    "name": "reasonable_execution_count",
                    "expression": "agent.get_execution_count() <= 5",
                    "description": "Agent didn't retry excessively",
                    "weight": 1
                }
            ],
            "min_score": 0.8
        },
        
        "query_resolution_evaluation": {
            "rules": [
                {
                    "name": "query_resolved",
                    "expression": "query.was_resolved()",
                    "description": "Query was successfully resolved",
                    "weight": 3
                },
                {
                    "name": "reasonable_execution_time",
                    "expression": "query.get_execution_time() <= 30.0",
                    "description": "Query completed within 30 seconds",
                    "weight": 1
                },
                {
                    "name": "successful_status",
                    "expression": "query.get_resolution_status() == 'success'",
                    "description": "Query resolution status is success",
                    "weight": 2
                }
            ],
            "min_score": 0.75
        },
        
        "comprehensive_evaluation": {
            "rules": [
                {
                    "name": "query_completed",
                    "expression": "query.was_resolved()",
                    "description": "Query was resolved successfully",
                    "weight": 5
                },
                {
                    "name": "agents_used",
                    "expression": "agent.was_executed()",
                    "description": "Agents were utilized",
                    "weight": 2
                },
                {
                    "name": "tools_used",
                    "expression": "tool.was_called()",
                    "description": "Tools were utilized",
                    "weight": 2
                },
                {
                    "name": "execution_sequence",
                    "expression": "sequence.was_completed(['ResolveStart', 'AgentExecutionStart', 'ToolCallStart', 'ToolCallComplete', 'AgentExecutionComplete', 'ResolveComplete'])",
                    "description": "Proper execution sequence was followed",
                    "weight": 3
                },
                {
                    "name": "high_success_rates",
                    "expression": "agent.get_success_rate() >= 0.8 and tool.get_success_rate() >= 0.8",
                    "description": "Both agent and tool success rates are high",
                    "weight": 2
                },
                {
                    "name": "efficient_execution",
                    "expression": "query.get_execution_time() <= 60.0",
                    "description": "Execution completed within reasonable time",
                    "weight": 1
                }
            ],
            "min_score": 0.8
        }
    },
    
    "migration_guide": {
        "description": "Step-by-step migration from CEL to semantic helpers",
        "steps": [
            {
                "step": 1,
                "title": "Identify CEL patterns",
                "description": "Review existing CEL expressions and identify common patterns",
                "examples": [
                    "events.exists(e, e.reason == 'EventType')",
                    "events.filter(e, condition).size()",
                    "Complex nested conditions"
                ]
            },
            {
                "step": 2,
                "title": "Map to semantic helpers",
                "description": "Replace CEL expressions with appropriate helper methods",
                "mappings": {
                    "Tool patterns": "Use ToolHelper methods",
                    "Agent patterns": "Use AgentHelper methods", 
                    "Query patterns": "Use QueryHelper methods",
                    "Sequence patterns": "Use SequenceHelper methods"
                }
            },
            {
                "step": 3,
                "title": "Test migration",
                "description": "Test new expressions with sample data",
                "verification": [
                    "Compare results between old and new expressions",
                    "Verify edge cases work correctly",
                    "Check performance improvements"
                ]
            },
            {
                "step": 4,
                "title": "Update configurations",
                "description": "Roll out new expressions to evaluation configurations",
                "best_practices": [
                    "Update one rule at a time",
                    "Keep old expressions as comments initially",
                    "Monitor evaluation results closely"
                ]
            }
        ]
    },
    
    "advanced_patterns": {
        "description": "Advanced semantic expression patterns",
        
        "conditional_logic": {
            "description": "Combining multiple helper calls with conditional logic",
            "examples": [
                {
                    "expression": "query.was_resolved() and (agent.was_executed() or tool.was_called())",
                    "description": "Query resolved AND either agents or tools were used"
                },
                {
                    "expression": "tool.get_success_rate() >= 0.8 if tool.was_called() else True",
                    "description": "High tool success rate if tools were used, otherwise pass"
                },
                {
                    "expression": "agent.get_execution_count() <= 3 and agent.get_success_rate() >= 0.7",
                    "description": "Efficient agent execution with good success rate"
                }
            ]
        },
        
        "performance_thresholds": {
            "description": "Performance-based evaluation patterns",
            "examples": [
                {
                    "expression": "query.get_execution_time() <= 30.0",
                    "description": "Query completed within 30 seconds"
                },
                {
                    "expression": "tool.get_call_count() >= 2 and tool.get_call_count() <= 10",
                    "description": "Reasonable number of tool calls (2-10)"
                },
                {
                    "expression": "agent.get_success_rate() >= 0.9 or query.get_execution_time() <= 10.0",
                    "description": "Either very high success rate or very fast execution"
                }
            ]
        },
        
        "sequence_validation": {
            "description": "Complex sequence and flow validation",
            "examples": [
                {
                    "expression": "sequence.was_completed(['ResolveStart', 'ResolveComplete'])",
                    "description": "Basic query resolution sequence"
                },
                {
                    "expression": "sequence.was_completed(['AgentExecutionStart', 'ToolCallStart', 'ToolCallComplete', 'AgentExecutionComplete'])",
                    "description": "Agent with tool execution sequence"
                }
            ]
        }
    }
}

# Sample evaluation request for testing
SAMPLE_EVALUATION_REQUEST = {
    "evaluatorName": "sample-evaluator",
    "config": {
        "rules": [
            {
                "name": "tools_used",
                "expression": "tool.was_called()",
                "description": "Tools were used during execution",
                "weight": 1
            },
            {
                "name": "query_resolved",
                "expression": "query.was_resolved()",
                "description": "Query was successfully resolved",
                "weight": 2
            }
        ]
    },
    "parameters": {
        "query.name": "test-query",
        "query.namespace": "default",
        "sessionId": "session-456",
        "min-score": "0.7"
    }
}