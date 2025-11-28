import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from .event_analyzer import EventAnalyzer
from .types import EventScope, ParsedEvent, EventType, EventFilter

logger = logging.getLogger(__name__)


class QueryHelper:
    """
    Helper class for analyzing query resolution events and session patterns.
    Provides semantic methods for query execution analysis and session metrics.
    """
    
    def __init__(self, event_analyzer: EventAnalyzer):
        """
        Initialize QueryHelper with an EventAnalyzer instance.
        
        Args:
            event_analyzer: EventAnalyzer instance for fetching events
        """
        self.event_analyzer = event_analyzer
    
    async def was_query_resolved(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> bool:
        """
        Check if query completed successfully.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            True if query completed successfully, False otherwise
        """
        events = await self.event_analyzer.get_events(scope=scope)
        
        # Look for ResolveComplete events
        resolve_complete_events = [
            e for e in events 
            if e.reason == EventType.QUERY_EXECUTION_COMPLETE.value
        ]
        
        return len(resolve_complete_events) > 0
    
    async def get_query_execution_time(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> Optional[float]:
        """
        Calculate total query execution duration from start to completion.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            Total query duration in seconds, or None if cannot be determined
        """
        events = await self.event_analyzer.get_events(scope=scope)
        
        # Find resolve start and complete events
        resolve_start = None
        resolve_complete = None
        
        for event in events:
            if event.reason == EventType.QUERY_EXECUTION_START.value and resolve_start is None:
                resolve_start = event
            elif event.reason == EventType.QUERY_EXECUTION_COMPLETE.value:
                resolve_complete = event
        
        if not resolve_start or not resolve_complete:
            return None
        
        start_time = self._parse_timestamp(resolve_start.first_timestamp or resolve_start.last_timestamp)
        end_time = self._parse_timestamp(resolve_complete.first_timestamp or resolve_complete.last_timestamp)
        
        if not start_time or not end_time:
            return None
        
        return (end_time - start_time).total_seconds()
    
    async def get_query_resolution_status(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> str:
        """
        Get the final status of query resolution (success/error/incomplete).
        
        Args:
            scope: Event scope to search within
            
        Returns:
            Status string: "success", "error", or "incomplete"
        """
        events = await self.event_analyzer.get_events(scope=scope)
        
        # Check for completion and error events
        has_resolve_complete = any(e.reason == EventType.QUERY_EXECUTION_COMPLETE.value for e in events)
        has_resolve_error = any(e.reason == EventType.QUERY_EXECUTION_ERROR.value for e in events)
        has_resolve_start = any(e.reason == EventType.QUERY_EXECUTION_START.value for e in events)
        
        if has_resolve_error:
            return "error"
        elif has_resolve_complete:
            return "success"
        elif has_resolve_start:
            return "incomplete"
        else:
            return "unknown"
    
    async def get_session_query_count(
        self,
        session_scope: EventScope = EventScope.SESSION
    ) -> int:
        """
        Count the number of queries executed in the session.
        
        Args:
            session_scope: Event scope to search within (typically SESSION)
            
        Returns:
            Number of queries resolved in the session
        """
        events = await self.event_analyzer.get_events(scope=session_scope)
        
        # Count unique queries by looking for ResolveStart events
        query_ids = set()
        for event in events:
            if (event.reason == EventType.QUERY_EXECUTION_START.value and 
                event.metadata and event.metadata.queryId):
                query_ids.add(event.metadata.queryId)
        
        return len(query_ids)
    
    async def get_query_targets(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> int:
        """
        Get the number of resolution targets processed for the query.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            Number of targets resolved
        """
        events = await self.event_analyzer.get_events(scope=scope)
        
        # Look for agent and team execution events as indicators of targets
        target_events = [
            e for e in events 
            if e.reason in [
                EventType.AGENT_EXECUTION_START.value,
                EventType.TEAM_EXECUTION_START.value
            ]
        ]
        
        # Count unique targets by agent/team name
        targets = set()
        for event in target_events:
            if event.metadata:
                if event.metadata.agentName:
                    targets.add(f"agent:{event.metadata.agentName}")
                elif event.metadata.teamName:
                    targets.add(f"team:{event.metadata.teamName}")
        
        return len(targets)
    
    async def get_query_error_details(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> List[str]:
        """
        Get error messages from query resolution failures.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            List of error messages
        """
        events = await self.event_analyzer.get_events(scope=scope)
        
        error_messages = []
        for event in events:
            if event.reason == EventType.QUERY_EXECUTION_ERROR.value:
                if event.metadata and event.metadata.error:
                    error_messages.append(event.metadata.error)
                elif "error" in event.message.lower():
                    error_messages.append(event.message)
        
        return error_messages
    
    async def get_session_summary(
        self,
        session_scope: EventScope = EventScope.SESSION
    ) -> Dict[str, Any]:
        """
        Get comprehensive session summary with metrics and status.
        
        Args:
            session_scope: Event scope to search within (typically SESSION)
            
        Returns:
            Dictionary with session metrics and summary
        """
        events = await self.event_analyzer.get_events(scope=session_scope)
        
        # Calculate session metrics
        query_count = await self.get_session_query_count(session_scope)
        
        # Count different event types
        event_counts = {}
        session_ids = set()
        agent_names = set()
        tool_names = set()
        model_names = set()
        
        for event in events:
            event_counts[event.reason] = event_counts.get(event.reason, 0) + 1
            
            if event.metadata:
                if event.metadata.sessionId:
                    session_ids.add(event.metadata.sessionId)
                if event.metadata.agentName:
                    agent_names.add(event.metadata.agentName)
                if event.metadata.toolName:
                    tool_names.add(event.metadata.toolName)
                if event.metadata.modelName:
                    model_names.add(event.metadata.modelName)
        
        # Calculate success rates
        successful_queries = event_counts.get(EventType.QUERY_EXECUTION_COMPLETE.value, 0)
        failed_queries = event_counts.get(EventType.QUERY_EXECUTION_ERROR.value, 0)
        total_queries = max(successful_queries + failed_queries, query_count)
        
        successful_agents = event_counts.get(EventType.AGENT_EXECUTION_COMPLETE.value, 0)
        failed_agents = event_counts.get(EventType.AGENT_EXECUTION_ERROR.value, 0)
        
        successful_tools = event_counts.get(EventType.TOOL_CALL_COMPLETE.value, 0)
        failed_tools = event_counts.get(EventType.TOOL_CALL_ERROR.value, 0)
        
        return {
            "session_ids": sorted(list(session_ids)),
            "total_events": len(events),
            "query_count": query_count,
            "query_success_rate": successful_queries / total_queries if total_queries > 0 else 0.0,
            "agent_success_rate": successful_agents / (successful_agents + failed_agents) if (successful_agents + failed_agents) > 0 else 0.0,
            "tool_success_rate": successful_tools / (successful_tools + failed_tools) if (successful_tools + failed_tools) > 0 else 0.0,
            "unique_agents": len(agent_names),
            "unique_tools": len(tool_names),
            "unique_models": len(model_names),
            "agents_used": sorted(list(agent_names)),
            "tools_used": sorted(list(tool_names)),
            "models_used": sorted(list(model_names)),
            "event_type_counts": event_counts
        }
    
    async def get_query_complexity_metrics(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> Dict[str, Any]:
        """
        Calculate query complexity based on execution patterns.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            Dictionary with complexity metrics
        """
        events = await self.event_analyzer.get_events(scope=scope)
        
        # Count different types of operations
        agent_executions = len([e for e in events if e.reason == EventType.AGENT_EXECUTION_START.value])
        tool_calls = len([e for e in events if e.reason == EventType.TOOL_CALL_START.value])
        llm_calls = len([e for e in events if e.reason == EventType.LLM_CALL_START.value])
        team_executions = len([e for e in events if e.reason == EventType.TEAM_EXECUTION_START.value])
        
        # Calculate execution time
        execution_time = await self.get_query_execution_time(scope)
        
        # Determine complexity level
        complexity_score = 0
        if agent_executions > 0:
            complexity_score += min(agent_executions, 5)
        if tool_calls > 0:
            complexity_score += min(tool_calls, 10)
        if team_executions > 0:
            complexity_score += team_executions * 3  # Teams add more complexity
        if llm_calls > 10:
            complexity_score += 2  # Many LLM calls indicate complex reasoning
        
        # Classify complexity
        if complexity_score <= 2:
            complexity_level = "simple"
        elif complexity_score <= 8:
            complexity_level = "moderate"
        elif complexity_score <= 15:
            complexity_level = "complex"
        else:
            complexity_level = "highly_complex"
        
        return {
            "complexity_level": complexity_level,
            "complexity_score": complexity_score,
            "agent_executions": agent_executions,
            "tool_calls": tool_calls,
            "llm_calls": llm_calls,
            "team_executions": team_executions,
            "execution_time_seconds": execution_time,
            "total_events": len(events)
        }
    
    async def was_query_timeout(
        self,
        timeout_threshold: float = 300.0,  # 5 minutes default
        scope: EventScope = EventScope.CURRENT
    ) -> bool:
        """
        Check if query execution exceeded a timeout threshold.
        
        Args:
            timeout_threshold: Timeout threshold in seconds
            scope: Event scope to search within
            
        Returns:
            True if query timed out, False otherwise
        """
        execution_time = await self.get_query_execution_time(scope)
        if execution_time is None:
            return False
        
        return execution_time > timeout_threshold
    
    async def get_parallel_execution_events(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> List[List[ParsedEvent]]:
        """
        Find events that occurred in parallel during query execution.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            List of event groups that occurred in parallel
        """
        events = await self.event_analyzer.get_events(scope=scope)
        
        # Group events by timestamp (within 1 second window)
        parallel_groups = []
        events_by_time = {}
        
        for event in events:
            timestamp = event.first_timestamp or event.last_timestamp
            if timestamp:
                # Round timestamp to second for grouping
                time_key = timestamp[:19]  # YYYY-MM-DDTHH:MM:SS
                if time_key not in events_by_time:
                    events_by_time[time_key] = []
                events_by_time[time_key].append(event)
        
        # Only include groups with multiple events
        for time_key, time_events in events_by_time.items():
            if len(time_events) > 1:
                parallel_groups.append(time_events)
        
        return parallel_groups
    
    def _parse_timestamp(self, timestamp_str: str) -> Optional[datetime]:
        """Parse ISO timestamp string to datetime object"""
        if not timestamp_str:
            return None
        
        try:
            # Handle various ISO formats
            if timestamp_str.endswith('Z'):
                return datetime.fromisoformat(timestamp_str[:-1] + '+00:00')
            else:
                return datetime.fromisoformat(timestamp_str)
        except (ValueError, TypeError):
            return None