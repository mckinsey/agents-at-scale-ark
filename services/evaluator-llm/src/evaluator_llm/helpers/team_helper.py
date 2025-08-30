import logging
from typing import List, Dict, Any, Optional

from .event_analyzer import EventAnalyzer
from .types import EventScope, ParsedEvent, EventType, EventFilter

logger = logging.getLogger(__name__)


class TeamHelper:
    """
    Helper class for analyzing team execution events and patterns.
    Provides semantic methods for common team evaluation scenarios.
    """
    
    def __init__(self, event_analyzer: EventAnalyzer):
        """
        Initialize TeamHelper with an EventAnalyzer instance.
        
        Args:
            event_analyzer: EventAnalyzer instance for fetching events
        """
        self.event_analyzer = event_analyzer
    
    async def was_team_executed(
        self,
        team_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> bool:
        """
        Check if any team was executed (or specific team if team_name provided).
        
        Args:
            team_name: Specific team name to check, or None for any team
            scope: Event scope to search within
            
        Returns:
            True if team was executed, False otherwise
        """
        events = await self.event_analyzer.get_team_events(team_name=team_name, scope=scope)
        return len(events) > 0
    
    async def get_team_execution_count(
        self,
        team_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> int:
        """
        Count the number of team executions.
        
        Args:
            team_name: Specific team name to count, or None for all teams
            scope: Event scope to search within
            
        Returns:
            Number of team executions
        """
        events = await self.event_analyzer.get_team_events(team_name=team_name, scope=scope)
        # Count only start or complete events to avoid double counting
        execution_events = [e for e in events if e.reason in [EventType.TEAM_EXECUTION_START.value, EventType.TEAM_EXECUTION_COMPLETE.value]]
        return len(execution_events)
    
    async def get_successful_team_executions(
        self,
        team_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[ParsedEvent]:
        """
        Get all successful team execution events.
        
        Args:
            team_name: Specific team name to filter by
            scope: Event scope to search within
            
        Returns:
            List of successful team execution events
        """
        events = await self.event_analyzer.get_team_events(team_name=team_name, scope=scope)
        return [e for e in events if e.reason == EventType.TEAM_EXECUTION_COMPLETE.value]
    
    async def get_team_member_events(
        self,
        team_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[ParsedEvent]:
        """
        Get all team member execution events.
        
        Args:
            team_name: Specific team name to filter by
            scope: Event scope to search within
            
        Returns:
            List of team member events
        """
        events = await self.event_analyzer.get_team_events(team_name=team_name, scope=scope)
        return [e for e in events if e.reason == EventType.TEAM_MEMBER.value]
    
    async def get_team_member_count(
        self,
        team_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> int:
        """
        Count the number of team members that participated.
        
        Args:
            team_name: Specific team name to analyze
            scope: Event scope to search within
            
        Returns:
            Number of unique team members
        """
        member_events = await self.get_team_member_events(team_name=team_name, scope=scope)
        member_names = set()
        
        for event in member_events:
            if event.metadata and event.metadata.agentName:
                member_names.add(event.metadata.agentName)
        
        return len(member_names)
    
    async def get_team_members(
        self,
        team_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[str]:
        """
        Get list of team members that participated.
        
        Args:
            team_name: Specific team name to analyze
            scope: Event scope to search within
            
        Returns:
            List of unique team member names
        """
        member_events = await self.get_team_member_events(team_name=team_name, scope=scope)
        member_names = set()
        
        for event in member_events:
            if event.metadata and event.metadata.agentName:
                member_names.add(event.metadata.agentName)
        
        return sorted(list(member_names))
    
    async def get_team_execution_times(
        self,
        team_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[float]:
        """
        Get execution times for team executions in seconds.
        
        Args:
            team_name: Specific team name to analyze
            scope: Event scope to search within
            
        Returns:
            List of execution times in seconds
        """
        events = await self.get_successful_team_executions(team_name=team_name, scope=scope)
        execution_times = []
        
        for event in events:
            if event.metadata and event.metadata.duration:
                try:
                    duration = self._parse_duration(event.metadata.duration)
                    execution_times.append(duration)
                except ValueError:
                    continue
        
        return execution_times
    
    async def get_average_team_execution_time(
        self,
        team_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> Optional[float]:
        """
        Get average execution time for team executions.
        
        Args:
            team_name: Specific team name to analyze
            scope: Event scope to search within
            
        Returns:
            Average execution time in seconds, or None if no data
        """
        execution_times = await self.get_team_execution_times(team_name=team_name, scope=scope)
        if not execution_times:
            return None
        
        return sum(execution_times) / len(execution_times)
    
    async def get_teams_used(self, scope: EventScope = EventScope.CURRENT) -> List[str]:
        """
        Get list of all teams that were executed.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            List of unique team names that were executed
        """
        events = await self.event_analyzer.get_team_events(scope=scope)
        team_names = set()
        
        for event in events:
            if event.metadata and event.metadata.teamName:
                team_names.add(event.metadata.teamName)
        
        return sorted(list(team_names))
    
    async def get_team_turn_count(
        self,
        team_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> int:
        """
        Count the number of turns taken by team members.
        This is a proxy for team collaboration intensity.
        
        Args:
            team_name: Specific team name to analyze
            scope: Event scope to search within
            
        Returns:
            Number of turns (member events)
        """
        member_events = await self.get_team_member_events(team_name=team_name, scope=scope)
        return len(member_events)
    
    async def get_team_collaboration_pattern(
        self,
        team_name: Optional[str] = None,
        scope: EventScope = EventScope.CURRENT
    ) -> List[str]:
        """
        Get the sequence of team member participation.
        
        Args:
            team_name: Specific team name to analyze
            scope: Event scope to search within
            
        Returns:
            List of agent names in order of participation
        """
        member_events = await self.get_team_member_events(team_name=team_name, scope=scope)
        
        # Sort by timestamp
        member_events.sort(
            key=lambda e: e.last_timestamp or e.first_timestamp or "",
        )
        
        participation_order = []
        for event in member_events:
            if event.metadata and event.metadata.agentName:
                participation_order.append(event.metadata.agentName)
        
        return participation_order
    
    async def was_agent_to_agent_call_made(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> bool:
        """
        Check if any agent-to-agent calls were made.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            True if A2A calls were made, False otherwise
        """
        event_filter = EventFilter(event_types=[EventType.A2A_CALL])
        events = await self.event_analyzer.get_events(scope=scope, event_filter=event_filter)
        return len(events) > 0
    
    async def get_agent_to_agent_call_count(
        self,
        scope: EventScope = EventScope.CURRENT
    ) -> int:
        """
        Count agent-to-agent calls.
        
        Args:
            scope: Event scope to search within
            
        Returns:
            Number of A2A calls
        """
        event_filter = EventFilter(event_types=[EventType.A2A_CALL])
        events = await self.event_analyzer.get_events(scope=scope, event_filter=event_filter)
        return len(events)
    
    def _parse_duration(self, duration_str: str) -> float:
        """Parse duration string (e.g., '1.234s') to float seconds"""
        if duration_str.endswith('s'):
            return float(duration_str[:-1])
        elif duration_str.endswith('ms'):
            return float(duration_str[:-2]) / 1000.0
        else:
            return float(duration_str)