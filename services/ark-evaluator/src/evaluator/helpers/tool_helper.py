import logging
from typing import List, Dict, Any, Optional

from .event_analyzer import EventAnalyzer
from .types import EventScope, ParsedEvent, EventType, EventFilter

logger = logging.getLogger(__name__)


class ToolHelper:
    """
    Helper class for analyzing tool execution events and patterns.
    Provides semantic methods for common tool evaluation scenarios.
    """
    
    def __init__(self, event_analyzer: EventAnalyzer):
        """
        Initialize ToolHelper with an EventAnalyzer instance.
        
        Args:
            event_analyzer: EventAnalyzer instance for fetching events
        """
        self.event_analyzer = event_analyzer
    
    async def was_tool_called(
        self,
        tool_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> bool:
        """
        Check if any tool was called (or specific tool if tool_name provided).
        
        Args:
            tool_name: Specific tool name to check, or None for any tool
            scope: Event scope to search within
            
        Returns:
            True if tool was called, False otherwise
        """
        events = await self.event_analyzer.get_tool_events(tool_name=tool_name, scope=scope)
        return len(events) > 0
    
    async def get_tool_call_count(
        self,
        tool_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> int:
        """
        Count the number of tool calls.
        
        Args:
            tool_name: Specific tool name to count, or None for all tools
            scope: Event scope to search within
            
        Returns:
            Number of tool calls
        """
        events = await self.event_analyzer.get_tool_events(tool_name=tool_name, scope=scope)
        logger.info(f"DEBUG: get_tool_call_count for '{tool_name}' found {len(events)} total events")
        
        # Log each event to debug tool name filtering
        for i, event in enumerate(events):
            tool_name_in_metadata = event.metadata.toolName if event.metadata else "NO_METADATA"
            logger.info(f"DEBUG: Event {i}: reason={event.reason}, metadata_tool_name='{tool_name_in_metadata}', has_metadata={event.metadata is not None}")
        
        # Count only start events - each tool call begins with a start event
        call_events = [e for e in events if e.reason == EventType.TOOL_CALL_START.value]
        
        logger.info(f"DEBUG: get_tool_call_count event reasons: {[e.reason for e in events]}")
        logger.info(f"DEBUG: get_tool_call_count valid call events: {len(call_events)} (counting only {EventType.TOOL_CALL_START.value} events)")
        
        return len(call_events)
    
    async def get_successful_tool_calls(
        self,
        tool_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[ParsedEvent]:
        """
        Get all successful tool call events.
        
        Args:
            tool_name: Specific tool name to filter by
            scope: Event scope to search within
            
        Returns:
            List of successful tool call events
        """
        events = await self.event_analyzer.get_tool_events(tool_name=tool_name, scope=scope)
        return [e for e in events if e.reason == EventType.TOOL_CALL_COMPLETE.value]
    
    async def get_failed_tool_calls(
        self,
        tool_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[ParsedEvent]:
        """
        Get all failed tool call events.
        
        Args:
            tool_name: Specific tool name to filter by
            scope: Event scope to search within
            
        Returns:
            List of failed tool call events
        """
        events = await self.event_analyzer.get_tool_events(tool_name=tool_name, scope=scope)
        return [e for e in events if e.reason == EventType.TOOL_CALL_ERROR.value]
    
    async def get_tool_success_rate(
        self,
        tool_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> float:
        """
        Calculate tool call success rate.
        
        Args:
            tool_name: Specific tool name to analyze
            scope: Event scope to search within
            
        Returns:
            Success rate as float between 0.0 and 1.0
        """
        successful = await self.get_successful_tool_calls(tool_name=tool_name, scope=scope)
        failed = await self.get_failed_tool_calls(tool_name=tool_name, scope=scope)
        
        total = len(successful) + len(failed)
        if total == 0:
            return 0.0
        
        return len(successful) / total
    
    async def get_tool_execution_times(
        self,
        tool_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[float]:
        """
        Get execution times for tool calls in seconds.
        
        Args:
            tool_name: Specific tool name to analyze
            scope: Event scope to search within
            
        Returns:
            List of execution times in seconds
        """
        events = await self.event_analyzer.get_tool_events(tool_name=tool_name, scope=scope)
        execution_times = []
        
        for event in events:
            if event.metadata and event.metadata.duration:
                try:
                    duration = self._parse_duration(event.metadata.duration)
                    execution_times.append(duration)
                except ValueError:
                    continue
        
        return execution_times
    
    async def get_average_tool_execution_time(
        self,
        tool_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> Optional[float]:
        """
        Get average execution time for tool calls.
        
        Args:
            tool_name: Specific tool name to analyze
            scope: Event scope to search within
            
        Returns:
            Average execution time in seconds, or None if no data
        """
        execution_times = await self.get_tool_execution_times(tool_name=tool_name, scope=scope)
        if not execution_times:
            return None
        
        return sum(execution_times) / len(execution_times)
    
    async def get_tools_used(self, scope: EventScope = EventScope.CURRENT) -> List[str]:
        """
        Get list of all tools that were used.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            List of unique tool names that were used
        """
        events = await self.event_analyzer.get_tool_events(scope=scope)
        tool_names = set()
        
        for event in events:
            if event.metadata and event.metadata.toolName:
                tool_names.add(event.metadata.toolName)
        
        return sorted(list(tool_names))
    
    async def get_tool_parameters(
        self,
        tool_name: str,
        scope: EventScope = EventScope.CURRENT
    ) -> List[Dict[str, Any]]:
        """
        Get parameters used for tool calls.
        
        Args:
            tool_name: Name of the tool to analyze
            scope: Event scope to search within
            
        Returns:
            List of parameter dictionaries used for tool calls
        """
        events = await self.event_analyzer.get_tool_events(tool_name=tool_name, scope=scope)
        logger.debug(f"DEBUG: get_tool_parameters for '{tool_name}' found {len(events)} events")
        
        parameters = []
        
        for i, event in enumerate(events):
            logger.debug(f"DEBUG: event {i}: reason={event.reason}, has_metadata={event.metadata is not None}, message='{event.message}'")
            if event.metadata:
                logger.debug(f"DEBUG: event {i} metadata: toolName={getattr(event.metadata, 'toolName', None)}, parameters={getattr(event.metadata, 'parameters', None)}")
            if event.metadata and event.metadata.parameters:
                parameters.append(event.metadata.parameters)
                logger.debug(f"DEBUG: added parameters: {event.metadata.parameters}")
        
        logger.debug(f"DEBUG: get_tool_parameters returning {len(parameters)} parameter sets: {parameters}")
        return parameters
    
    def _parse_duration(self, duration_str: str) -> float:
        """Parse duration string (e.g., '1.234s') to float seconds"""
        if duration_str.endswith('s'):
            return float(duration_str[:-1])
        elif duration_str.endswith('ms'):
            return float(duration_str[:-2]) / 1000.0
        else:
            return float(duration_str)