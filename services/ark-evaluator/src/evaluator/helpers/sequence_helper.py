import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from .event_analyzer import EventAnalyzer
from .types import EventScope, ParsedEvent, EventType, EventFilter

logger = logging.getLogger(__name__)


class SequenceHelper:
    """
    Helper class for analyzing event sequences and execution flow patterns.
    Provides semantic methods for checking execution order, timing, and flow analysis.
    """
    
    def __init__(self, event_analyzer: EventAnalyzer):
        """
        Initialize SequenceHelper with an EventAnalyzer instance.
        
        Args:
            event_analyzer: EventAnalyzer instance for fetching events
        """
        self.event_analyzer = event_analyzer
    
    async def check_execution_order(
        self,
        expected_sequence: List[str],
        scope: EventScope = EventScope.CURRENT,
        strict: bool = True
    ) -> bool:
        """
        Verify events happened in expected sequence order.
        
        Args:
            expected_sequence: List of event reasons in expected order
            scope: Event scope to search within
            strict: If True, events must be consecutive. If False, allows other events in between
            
        Returns:
            True if sequence matches expected order, False otherwise
        """
        events = await self.event_analyzer.get_events(scope=scope)
        if not events:
            return False
        
        # Sort events by timestamp
        sorted_events = self._sort_events_by_time(events)
        
        if strict:
            return self._check_strict_sequence(sorted_events, expected_sequence)
        else:
            return self._check_loose_sequence(sorted_events, expected_sequence)
    
    async def get_time_between_events(
        self,
        start_event_reason: str,
        end_event_reason: str,
        scope: EventScope = EventScope.CURRENT
    ) -> Optional[float]:
        """
        Calculate time gap between two event types.
        
        Args:
            start_event_reason: Reason of the starting event
            end_event_reason: Reason of the ending event
            scope: Event scope to search within
            
        Returns:
            Time difference in seconds, or None if events not found
        """
        events = await self.event_analyzer.get_events(scope=scope)
        sorted_events = self._sort_events_by_time(events)
        
        start_event = None
        end_event = None
        
        # Find first occurrence of start event and first occurrence of end event after start
        for event in sorted_events:
            if event.reason == start_event_reason and start_event is None:
                start_event = event
            elif event.reason == end_event_reason and start_event is not None and end_event is None:
                end_event = event
                break
        
        if not start_event or not end_event:
            return None
        
        start_time = self._parse_timestamp(start_event.first_timestamp or start_event.last_timestamp)
        end_time = self._parse_timestamp(end_event.first_timestamp or end_event.last_timestamp)
        
        if not start_time or not end_time:
            return None
        
        return (end_time - start_time).total_seconds()
    
    async def was_sequence_completed(
        self,
        required_events: List[str],
        scope: EventScope = EventScope.CURRENT
    ) -> bool:
        """
        Check if all steps in a sequence occurred (order doesn't matter).
        
        Args:
            required_events: List of event reasons that must all be present
            scope: Event scope to search within
            
        Returns:
            True if all required events occurred, False otherwise
        """
        events = await self.event_analyzer.get_events(scope=scope)
        event_reasons = {event.reason for event in events}
        
        return all(reason in event_reasons for reason in required_events)
    
    async def get_execution_flow(
        self,
        scope: EventScope = EventScope.CURRENT,
        component_filter: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get chronological flow of events with timing information.
        
        Args:
            scope: Event scope to search within
            component_filter: Optional list of components to include
            
        Returns:
            List of event flow items with timestamp, reason, and metadata
        """
        events = await self.event_analyzer.get_events(scope=scope)
        
        # Filter by components if specified
        if component_filter:
            events = [
                e for e in events 
                if e.metadata and e.metadata.component in component_filter
            ]
        
        sorted_events = self._sort_events_by_time(events)
        
        flow = []
        for i, event in enumerate(sorted_events):
            timestamp = event.last_timestamp or event.first_timestamp
            
            flow_item = {
                "sequence": i + 1,
                "timestamp": timestamp,
                "reason": event.reason,
                "component": event.metadata.component if event.metadata else None,
                "agent": event.metadata.agentName if event.metadata else None,
                "tool": event.metadata.toolName if event.metadata else None,
                "duration": event.metadata.duration if event.metadata else None,
                "has_error": bool(event.metadata and event.metadata.error),
            }
            
            # Add time since previous event
            if i > 0:
                prev_timestamp = sorted_events[i-1].last_timestamp or sorted_events[i-1].first_timestamp
                if timestamp and prev_timestamp:
                    prev_time = self._parse_timestamp(prev_timestamp)
                    curr_time = self._parse_timestamp(timestamp)
                    if prev_time and curr_time:
                        flow_item["time_since_previous"] = (curr_time - prev_time).total_seconds()
            
            flow.append(flow_item)
        
        return flow
    
    async def detect_parallel_execution(
        self,
        scope: EventScope = EventScope.CURRENT,
        time_threshold: float = 1.0
    ) -> List[List[ParsedEvent]]:
        """
        Find events that occurred concurrently (parallel execution).
        
        Args:
            scope: Event scope to search within
            time_threshold: Time window in seconds to consider events as parallel
            
        Returns:
            List of event groups that occurred in parallel
        """
        events = await self.event_analyzer.get_events(scope=scope)
        sorted_events = self._sort_events_by_time(events)
        
        parallel_groups = []
        current_group = []
        group_start_time = None
        
        for event in sorted_events:
            event_time = self._parse_timestamp(event.first_timestamp or event.last_timestamp)
            if not event_time:
                continue
            
            if not current_group:
                # Start new group
                current_group = [event]
                group_start_time = event_time
            else:
                # Check if event is within threshold of group start
                time_diff = (event_time - group_start_time).total_seconds()
                if time_diff <= time_threshold:
                    current_group.append(event)
                else:
                    # Save current group if it has multiple events
                    if len(current_group) > 1:
                        parallel_groups.append(current_group)
                    
                    # Start new group
                    current_group = [event]
                    group_start_time = event_time
        
        # Add final group if it has multiple events
        if len(current_group) > 1:
            parallel_groups.append(current_group)
        
        return parallel_groups
    
    async def get_execution_phases(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> Dict[str, List[ParsedEvent]]:
        """
        Group events by execution phases based on start/complete event pairs.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            Dictionary mapping phase names to events in that phase
        """
        events = await self.event_analyzer.get_events(scope=scope)
        phases = {}
        
        # Define phase patterns
        phase_patterns = {
            "query_execution": ["QueryExecutionStart", "QueryExecutionComplete"],
            "agent_execution": ["AgentExecutionStart", "AgentExecutionComplete"],
            "team_execution": ["TeamExecutionStart", "TeamExecutionComplete"],
            "tool_calls": ["ToolCallStart", "ToolCallComplete"],
            "llm_calls": ["LLMCallStart", "LLMCallComplete"]
        }
        
        for phase_name, (start_reason, end_reason) in phase_patterns.items():
            phase_events = []
            in_phase = False
            
            for event in self._sort_events_by_time(events):
                if event.reason == start_reason:
                    in_phase = True
                    phase_events.append(event)
                elif in_phase:
                    phase_events.append(event)
                    if event.reason == end_reason:
                        in_phase = False
            
            if phase_events:
                phases[phase_name] = phase_events
        
        return phases
    
    def _sort_events_by_time(self, events: List[ParsedEvent]) -> List[ParsedEvent]:
        """Sort events by timestamp (earliest first)"""
        def get_sort_time(event):
            timestamp = event.first_timestamp or event.last_timestamp
            if timestamp:
                parsed = self._parse_timestamp(timestamp)
                return parsed if parsed else datetime.min
            return datetime.min
        
        return sorted(events, key=get_sort_time)
    
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
    
    def _check_strict_sequence(
        self,
        events: List[ParsedEvent],
        expected_sequence: List[str]
    ) -> bool:
        """Check if events match expected sequence exactly (consecutive)"""
        if len(events) < len(expected_sequence):
            return False
        
        # Find first event matching the sequence start
        for i in range(len(events) - len(expected_sequence) + 1):
            if all(
                events[i + j].reason == expected_sequence[j]
                for j in range(len(expected_sequence))
            ):
                return True
        
        return False
    
    def _check_loose_sequence(
        self,
        events: List[ParsedEvent],
        expected_sequence: List[str]
    ) -> bool:
        """Check if events contain expected sequence (not necessarily consecutive)"""
        sequence_idx = 0
        
        for event in events:
            if sequence_idx < len(expected_sequence) and event.reason == expected_sequence[sequence_idx]:
                sequence_idx += 1
                if sequence_idx == len(expected_sequence):
                    return True
        
        return sequence_idx == len(expected_sequence)