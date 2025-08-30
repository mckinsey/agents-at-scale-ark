import logging
from typing import List, Dict, Any, Optional

from .event_analyzer import EventAnalyzer
from .types import EventScope, ParsedEvent, EventType, EventFilter

logger = logging.getLogger(__name__)


class LLMHelper:
    """
    Helper class for analyzing LLM call events and patterns.
    Provides semantic methods for common LLM evaluation scenarios.
    """
    
    def __init__(self, event_analyzer: EventAnalyzer):
        """
        Initialize LLMHelper with an EventAnalyzer instance.
        
        Args:
            event_analyzer: EventAnalyzer instance for fetching events
        """
        self.event_analyzer = event_analyzer
    
    async def were_llm_calls_made(
        self,
        model_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> bool:
        """
        Check if any LLM calls were made (or specific model if model_name provided).
        
        Args:
            model_name: Specific model name to check, or None for any model
            scope: Event scope to search within
            
        Returns:
            True if LLM calls were made, False otherwise
        """
        events = await self.event_analyzer.get_llm_events(model_name=model_name, scope=scope)
        return len(events) > 0
    
    async def get_llm_call_count(
        self,
        model_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> int:
        """
        Count the number of LLM calls.
        
        Args:
            model_name: Specific model name to count, or None for all models
            scope: Event scope to search within
            
        Returns:
            Number of LLM calls
        """
        events = await self.event_analyzer.get_llm_events(model_name=model_name, scope=scope)
        # Count only complete events to avoid double counting
        call_events = [e for e in events if e.reason == EventType.LLM_CALL_COMPLETE.value]
        return len(call_events)
    
    async def get_successful_llm_calls(
        self,
        model_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[ParsedEvent]:
        """
        Get all successful LLM call events.
        
        Args:
            model_name: Specific model name to filter by
            scope: Event scope to search within
            
        Returns:
            List of successful LLM call events
        """
        events = await self.event_analyzer.get_llm_events(model_name=model_name, scope=scope)
        return [e for e in events if e.reason == EventType.LLM_CALL_COMPLETE.value]
    
    async def get_llm_response_times(
        self,
        model_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[float]:
        """
        Get response times for LLM calls in seconds.
        
        Args:
            model_name: Specific model name to analyze
            scope: Event scope to search within
            
        Returns:
            List of response times in seconds
        """
        events = await self.get_successful_llm_calls(model_name=model_name, scope=scope)
        response_times = []
        
        for event in events:
            if event.metadata and event.metadata.duration:
                try:
                    duration = self._parse_duration(event.metadata.duration)
                    response_times.append(duration)
                except ValueError:
                    continue
        
        return response_times
    
    async def get_average_llm_response_time(
        self,
        model_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> Optional[float]:
        """
        Get average response time for LLM calls.
        
        Args:
            model_name: Specific model name to analyze
            scope: Event scope to search within
            
        Returns:
            Average response time in seconds, or None if no data
        """
        response_times = await self.get_llm_response_times(model_name=model_name, scope=scope)
        if not response_times:
            return None
        
        return sum(response_times) / len(response_times)
    
    async def get_models_used(self, scope: EventScope = EventScope.CURRENT) -> List[str]:
        """
        Get list of all models that were used for LLM calls.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            List of unique model names that were used
        """
        events = await self.event_analyzer.get_llm_events(scope=scope)
        model_names = set()
        
        for event in events:
            if event.metadata and event.metadata.modelName:
                model_names.add(event.metadata.modelName)
        
        return sorted(list(model_names))
    
    async def get_llm_calls_by_agent(
        self,
        agent_name: str,
        scope: EventScope = EventScope.CURRENT
    ) -> List[ParsedEvent]:
        """
        Get LLM calls made by a specific agent.
        
        Args:
            agent_name: Name of the agent to analyze
            scope: Event scope to search within
            
        Returns:
            List of LLM call events made by the agent
        """
        events = await self.event_analyzer.get_llm_events(scope=scope)
        agent_calls = []
        
        for event in events:
            if (event.metadata and 
                event.metadata.agentName == agent_name):
                agent_calls.append(event)
        
        return agent_calls
    
    async def get_total_llm_time(
        self,
        model_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> float:
        """
        Get total time spent on LLM calls.
        
        Args:
            model_name: Specific model name to analyze
            scope: Event scope to search within
            
        Returns:
            Total time in seconds
        """
        response_times = await self.get_llm_response_times(model_name=model_name, scope=scope)
        return sum(response_times)
    
    async def get_llm_usage_by_model(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> Dict[str, int]:
        """
        Get usage statistics by model.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            Dictionary mapping model names to call counts
        """
        events = await self.event_analyzer.get_llm_events(scope=scope)
        model_counts = {}
        
        for event in events:
            if (event.metadata and 
                event.metadata.modelName and 
                event.reason == EventType.LLM_CALL_COMPLETE.value):
                model_name = event.metadata.modelName
                model_counts[model_name] = model_counts.get(model_name, 0) + 1
        
        return model_counts
    
    async def get_llm_usage_by_agent(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> Dict[str, int]:
        """
        Get LLM usage statistics by agent.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            Dictionary mapping agent names to call counts
        """
        events = await self.event_analyzer.get_llm_events(scope=scope)
        agent_counts = {}
        
        for event in events:
            if (event.metadata and 
                event.metadata.agentName and 
                event.reason == EventType.LLM_CALL_COMPLETE.value):
                agent_name = event.metadata.agentName
                agent_counts[agent_name] = agent_counts.get(agent_name, 0) + 1
        
        return agent_counts
    
    async def get_fastest_model(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> Optional[str]:
        """
        Get the fastest model based on average response time.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            Name of the fastest model, or None if no data
        """
        models = await self.get_models_used(scope=scope)
        if not models:
            return None
        
        fastest_model = None
        fastest_time = float('inf')
        
        for model in models:
            avg_time = await self.get_average_llm_response_time(model_name=model, scope=scope)
            if avg_time and avg_time < fastest_time:
                fastest_time = avg_time
                fastest_model = model
        
        return fastest_model
    
    async def get_slowest_model(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> Optional[str]:
        """
        Get the slowest model based on average response time.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            Name of the slowest model, or None if no data
        """
        models = await self.get_models_used(scope=scope)
        if not models:
            return None
        
        slowest_model = None
        slowest_time = 0.0
        
        for model in models:
            avg_time = await self.get_average_llm_response_time(model_name=model, scope=scope)
            if avg_time and avg_time > slowest_time:
                slowest_time = avg_time
                slowest_model = model
        
        return slowest_model
    
    def _parse_duration(self, duration_str: str) -> float:
        """Parse duration string (e.g., '1.234s') to float seconds"""
        if duration_str.endswith('s'):
            return float(duration_str[:-1])
        elif duration_str.endswith('ms'):
            return float(duration_str[:-2]) / 1000.0
        else:
            return float(duration_str)