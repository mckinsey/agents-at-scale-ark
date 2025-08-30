import logging
from typing import List, Dict, Any, Optional

from .event_analyzer import EventAnalyzer
from .types import EventScope, ParsedEvent, EventType, EventFilter

logger = logging.getLogger(__name__)


class AgentHelper:
    """
    Helper class for analyzing agent execution events and patterns.
    Provides semantic methods for common agent evaluation scenarios.
    """
    
    def __init__(self, event_analyzer: EventAnalyzer):
        """
        Initialize AgentHelper with an EventAnalyzer instance.
        
        Args:
            event_analyzer: EventAnalyzer instance for fetching events
        """
        self.event_analyzer = event_analyzer
    
    async def was_agent_executed(
        self,
        agent_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> bool:
        """
        Check if any agent was executed (or specific agent if agent_name provided).
        
        Args:
            agent_name: Specific agent name to check, or None for any agent
            scope: Event scope to search within
            
        Returns:
            True if agent was executed, False otherwise
        """
        events = await self.event_analyzer.get_agent_events(agent_name=agent_name, scope=scope)
        return len(events) > 0
    
    async def get_agent_execution_count(
        self,
        agent_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> int:
        """
        Count the number of agent executions.
        
        Args:
            agent_name: Specific agent name to count, or None for all agents
            scope: Event scope to search within
            
        Returns:
            Number of agent executions
        """
        events = await self.event_analyzer.get_agent_events(agent_name=agent_name, scope=scope)
        # Count only start or complete events to avoid double counting
        execution_events = [e for e in events if e.reason in [EventType.AGENT_EXECUTION_START.value, EventType.AGENT_EXECUTION_COMPLETE.value]]
        return len(execution_events)
    
    async def get_successful_agent_executions(
        self,
        agent_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[ParsedEvent]:
        """
        Get all successful agent execution events.
        
        Args:
            agent_name: Specific agent name to filter by
            scope: Event scope to search within
            
        Returns:
            List of successful agent execution events
        """
        events = await self.event_analyzer.get_agent_events(agent_name=agent_name, scope=scope)
        return [e for e in events if e.reason == EventType.AGENT_EXECUTION_COMPLETE.value]
    
    async def get_failed_agent_executions(
        self,
        agent_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[ParsedEvent]:
        """
        Get all failed agent execution events.
        
        Args:
            agent_name: Specific agent name to filter by
            scope: Event scope to search within
            
        Returns:
            List of failed agent execution events
        """
        events = await self.event_analyzer.get_agent_events(agent_name=agent_name, scope=scope)
        return [e for e in events if e.reason == EventType.AGENT_EXECUTION_ERROR.value]
    
    async def get_agent_success_rate(
        self,
        agent_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> float:
        """
        Calculate agent execution success rate.
        
        Args:
            agent_name: Specific agent name to analyze
            scope: Event scope to search within
            
        Returns:
            Success rate as float between 0.0 and 1.0
        """
        successful = await self.get_successful_agent_executions(agent_name=agent_name, scope=scope)
        failed = await self.get_failed_agent_executions(agent_name=agent_name, scope=scope)
        
        total = len(successful) + len(failed)
        if total == 0:
            return 0.0
        
        return len(successful) / total
    
    async def get_agent_execution_times(
        self,
        agent_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[float]:
        """
        Get execution times for agent executions in seconds.
        
        Args:
            agent_name: Specific agent name to analyze
            scope: Event scope to search within
            
        Returns:
            List of execution times in seconds
        """
        events = await self.get_successful_agent_executions(agent_name=agent_name, scope=scope)
        execution_times = []
        
        for event in events:
            if event.metadata and event.metadata.duration:
                try:
                    duration = self._parse_duration(event.metadata.duration)
                    execution_times.append(duration)
                except ValueError:
                    continue
        
        return execution_times
    
    async def get_average_agent_execution_time(
        self,
        agent_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> Optional[float]:
        """
        Get average execution time for agent executions.
        
        Args:
            agent_name: Specific agent name to analyze
            scope: Event scope to search within
            
        Returns:
            Average execution time in seconds, or None if no data
        """
        execution_times = await self.get_agent_execution_times(agent_name=agent_name, scope=scope)
        if not execution_times:
            return None
        
        return sum(execution_times) / len(execution_times)
    
    async def get_agents_used(self, scope: EventScope = EventScope.CURRENT) -> List[str]:
        """
        Get list of all agents that were executed.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            List of unique agent names that were executed
        """
        events = await self.event_analyzer.get_agent_events(scope=scope)
        agent_names = set()
        
        for event in events:
            if event.metadata and event.metadata.agentName:
                agent_names.add(event.metadata.agentName)
        
        return sorted(list(agent_names))
    
    async def get_models_used_by_agent(
        self,
        agent_name: str,
        scope: EventScope = EventScope.CURRENT
    ) -> List[str]:
        """
        Get list of models used by a specific agent.
        
        Args:
            agent_name: Name of the agent to analyze
            scope: Event scope to search within
            
        Returns:
            List of unique model names used by the agent
        """
        # Get LLM events for this agent
        llm_events = await self.event_analyzer.get_llm_events(scope=scope)
        model_names = set()
        
        for event in llm_events:
            if (event.metadata and 
                event.metadata.agentName == agent_name and 
                event.metadata.modelName):
                model_names.add(event.metadata.modelName)
        
        return sorted(list(model_names))
    
    async def get_agent_llm_call_count(
        self,
        agent_name: str,
        scope: EventScope = EventScope.CURRENT
    ) -> int:
        """
        Count LLM calls made by a specific agent.
        
        Args:
            agent_name: Name of the agent to analyze
            scope: Event scope to search within
            
        Returns:
            Number of LLM calls made by the agent
        """
        llm_events = await self.event_analyzer.get_llm_events(scope=scope)
        agent_llm_calls = [
            e for e in llm_events 
            if (e.metadata and 
                e.metadata.agentName == agent_name and 
                e.reason == EventType.LLM_CALL_COMPLETE.value)
        ]
        return len(agent_llm_calls)
    
    async def get_agent_error_details(
        self,
        agent_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[str]:
        """
        Get error messages from failed agent executions.
        
        Args:
            agent_name: Specific agent name to analyze
            scope: Event scope to search within
            
        Returns:
            List of error messages
        """
        failed_events = await self.get_failed_agent_executions(agent_name=agent_name, scope=scope)
        error_messages = []
        
        for event in failed_events:
            if event.metadata and event.metadata.error:
                error_messages.append(event.metadata.error)
            elif "error" in event.message.lower():
                error_messages.append(event.message)
        
        return error_messages
    
    def _parse_duration(self, duration_str: str) -> float:
        """Parse duration string (e.g., '1.234s') to float seconds"""
        if duration_str.endswith('s'):
            return float(duration_str[:-1])
        elif duration_str.endswith('ms'):
            return float(duration_str[:-2]) / 1000.0
        else:
            return float(duration_str)