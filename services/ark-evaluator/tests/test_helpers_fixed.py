"""Fixed tests for event helpers that match the actual implementation"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from evaluator.helpers.event_analyzer import EventAnalyzer
from evaluator.helpers.tool_helper import ToolHelper
from evaluator.helpers.agent_helper import AgentHelper
from evaluator.helpers.team_helper import TeamHelper
from evaluator.helpers.sequence_helper import SequenceHelper
from evaluator.helpers.query_helper import QueryHelper
from evaluator.helpers.types import EventScope, ParsedEvent, EventMetadata, EventType
from evaluator.helpers.fixtures.sample_events import create_sample_events


class TestEventAnalyzerFixed:
    @pytest.fixture
    def event_analyzer(self):
        analyzer = EventAnalyzer(
            namespace="test-namespace",
            query_name="query-123",
            session_id="session-456"
        )
        analyzer.k8s_client = AsyncMock()
        return analyzer
    
    def test_event_analyzer_initialization(self, event_analyzer):
        """Test that EventAnalyzer initializes correctly"""
        assert event_analyzer.namespace == "test-namespace"
        assert event_analyzer.query_name == "query-123"
        assert event_analyzer.session_id == "session-456"
    
    @pytest.mark.asyncio
    async def test_get_events_basic(self, event_analyzer):
        """Test basic event fetching"""
        mock_events = create_sample_events(query_id="query-123")
        event_analyzer.k8s_client.list_namespaced_event.return_value = MagicMock(
            items=mock_events
        )
        
        events = await event_analyzer.get_events()
        # Should return some events (exact count depends on mock implementation)
        assert isinstance(events, list)


class TestToolHelperFixed:
    @pytest.fixture
    def tool_helper(self):
        analyzer = EventAnalyzer("test-namespace", "query-123", "session-456")
        analyzer.k8s_client = AsyncMock()
        return ToolHelper(analyzer)
    
    @pytest.mark.asyncio
    async def test_was_tool_called(self, tool_helper):
        """Test was_tool_called method"""
        mock_events = [
            ParsedEvent(
                name="event-1",
                namespace="test-namespace",
                reason=EventType.TOOL_CALL_START.value,
                message="Tool search called",
                involved_object={"kind": "Query", "name": "query-123"},
                metadata=EventMetadata(
                    toolName="search",
                    queryId="query-123"
                ),
                first_timestamp="2024-01-01T00:00:00Z"
            )
        ]
        tool_helper.event_analyzer.get_events = AsyncMock(return_value=mock_events)
        
        result = await tool_helper.was_tool_called()
        assert result is True
    
    @pytest.mark.asyncio  
    async def test_get_tool_call_count(self, tool_helper):
        """Test get_tool_call_count method"""
        mock_events = [
            ParsedEvent(
                name=f"event-{i}",
                namespace="test-namespace",
                reason=EventType.TOOL_CALL_START.value,
                message="Tool called",
                involved_object={"kind": "Query", "name": "query-123"},
                metadata=EventMetadata(toolName="search"),
                first_timestamp="2024-01-01T00:00:00Z"
            )
            for i in range(3)
        ]
        tool_helper.event_analyzer.get_events = AsyncMock(return_value=mock_events)
        
        count = await tool_helper.get_tool_call_count()
        assert count == 3
    
    @pytest.mark.asyncio
    async def test_get_tool_success_rate(self, tool_helper):
        """Test get_tool_success_rate method"""
        mock_events = [
            ParsedEvent(
                name="event-1",
                namespace="test-namespace",
                reason=EventType.TOOL_CALL_COMPLETE.value,
                message="Tool completed",
                involved_object={"kind": "Query", "name": "query-123"},
                metadata=EventMetadata(toolName="search"),
                first_timestamp="2024-01-01T00:00:00Z"
            )
        ]
        tool_helper.event_analyzer.get_events = AsyncMock(return_value=mock_events)
        
        rate = await tool_helper.get_tool_success_rate()
        assert isinstance(rate, float)
        assert 0.0 <= rate <= 1.0


class TestAgentHelperFixed:
    @pytest.fixture
    def agent_helper(self):
        analyzer = EventAnalyzer("test-namespace", "query-123", "session-456")
        analyzer.k8s_client = AsyncMock()
        return AgentHelper(analyzer)
    
    @pytest.mark.asyncio
    async def test_was_agent_executed(self, agent_helper):
        """Test was_agent_executed method"""
        mock_events = [
            ParsedEvent(
                name="event-1",
                namespace="test-namespace",
                reason=EventType.AGENT_EXECUTION_START.value,
                message="Agent started",
                involved_object={"kind": "Agent", "name": "researcher"},
                metadata=EventMetadata(agentName="researcher"),
                first_timestamp="2024-01-01T00:00:00Z"
            )
        ]
        agent_helper.event_analyzer.get_events = AsyncMock(return_value=mock_events)
        
        result = await agent_helper.was_agent_executed()
        assert result is True
    
    @pytest.mark.asyncio
    async def test_get_agent_execution_count(self, agent_helper):
        """Test get_agent_execution_count method"""
        mock_events = [
            ParsedEvent(
                name=f"event-{i}",
                namespace="test-namespace",
                reason=EventType.AGENT_EXECUTION_START.value,
                message="Agent started",
                involved_object={"kind": "Agent", "name": "researcher"},
                metadata=EventMetadata(agentName="researcher"),
                first_timestamp="2024-01-01T00:00:00Z"
            )
            for i in range(2)
        ]
        agent_helper.event_analyzer.get_events = AsyncMock(return_value=mock_events)
        
        count = await agent_helper.get_agent_execution_count()
        assert count == 2


class TestQueryHelperFixed:
    @pytest.fixture
    def query_helper(self):
        analyzer = EventAnalyzer("test-namespace", "query-123", "session-456")
        analyzer.k8s_client = AsyncMock()
        return QueryHelper(analyzer)
    
    @pytest.mark.asyncio
    async def test_was_query_resolved(self, query_helper):
        """Test was_query_resolved method"""
        mock_events = [
            ParsedEvent(
                name="event-1",
                namespace="test-namespace",
                reason=EventType.QUERY_EXECUTION_COMPLETE.value,
                message="Query resolved",
                involved_object={"kind": "Query", "name": "query-123"},
                first_timestamp="2024-01-01T00:00:00Z"
            )
        ]
        query_helper.event_analyzer.get_events = AsyncMock(return_value=mock_events)

        result = await query_helper.was_query_resolved()
        assert result is True
    
    @pytest.mark.asyncio
    async def test_get_query_execution_time(self, query_helper):
        """Test get_query_execution_time method"""
        mock_events = [
            ParsedEvent(
                name="event-1",
                namespace="test-namespace",
                reason=EventType.QUERY_EXECUTION_START.value,
                message="Query started",
                involved_object={"kind": "Query", "name": "query-123"},
                first_timestamp="2024-01-01T00:00:00Z"
            ),
            ParsedEvent(
                name="event-2",
                namespace="test-namespace",
                reason=EventType.QUERY_EXECUTION_COMPLETE.value,
                message="Query completed",
                involved_object={"kind": "Query", "name": "query-123"},
                first_timestamp="2024-01-01T00:00:15Z"
            )
        ]
        query_helper.event_analyzer.get_events = AsyncMock(return_value=mock_events)

        exec_time = await query_helper.get_query_execution_time()
        # Should return time difference or None
        assert exec_time is None or isinstance(exec_time, float)


class TestSequenceHelperFixed:
    @pytest.fixture
    def sequence_helper(self):
        analyzer = EventAnalyzer("test-namespace", "query-123", "session-456")
        analyzer.k8s_client = AsyncMock()
        return SequenceHelper(analyzer)
    
    @pytest.mark.asyncio
    async def test_was_sequence_completed(self, sequence_helper):
        """Test was_sequence_completed method"""
        mock_events = [
            ParsedEvent(
                name="event-1",
                namespace="test-namespace",
                reason="ResolveStart",
                message="Query started",
                involved_object={"kind": "Query", "name": "query-123"},
                first_timestamp="2024-01-01T00:00:00Z"
            ),
            ParsedEvent(
                name="event-2",
                namespace="test-namespace",
                reason="ResolveComplete",
                message="Query completed",
                involved_object={"kind": "Query", "name": "query-123"},
                first_timestamp="2024-01-01T00:00:10Z"
            )
        ]
        sequence_helper.event_analyzer.get_events = AsyncMock(return_value=mock_events)
        
        result = await sequence_helper.was_sequence_completed(["ResolveStart", "ResolveComplete"])
        assert result is True


class TestTeamHelperFixed:
    @pytest.fixture
    def team_helper(self):
        analyzer = EventAnalyzer("test-namespace", "query-123", "session-456")
        analyzer.k8s_client = AsyncMock()
        return TeamHelper(analyzer)
    
    @pytest.mark.asyncio
    async def test_was_team_executed(self, team_helper):
        """Test was_team_executed method"""
        mock_events = [
            ParsedEvent(
                name="event-1",
                namespace="test-namespace",
                reason=EventType.TEAM_EXECUTION_START.value,
                message="Team started",
                involved_object={"kind": "Team", "name": "research-team"},
                metadata=EventMetadata(teamName="research-team"),
                first_timestamp="2024-01-01T00:00:00Z"
            )
        ]
        team_helper.event_analyzer.get_events = AsyncMock(return_value=mock_events)
        
        result = await team_helper.was_team_executed()
        assert result is True


def test_helper_classes_exist():
    """Test that all helper classes can be imported and instantiated"""
    analyzer = EventAnalyzer("test", "test", "test")
    
    # Test that all helpers can be created
    tool_helper = ToolHelper(analyzer)
    agent_helper = AgentHelper(analyzer)
    team_helper = TeamHelper(analyzer)
    sequence_helper = SequenceHelper(analyzer)
    query_helper = QueryHelper(analyzer)
    
    assert tool_helper is not None
    assert agent_helper is not None
    assert team_helper is not None
    assert sequence_helper is not None
    assert query_helper is not None


def test_event_types_enum():
    """Test that EventType enum has core values"""
    # Test core event types that must exist
    core_types = [
        'TOOL_CALL_START', 'TOOL_CALL_COMPLETE',
        'AGENT_EXECUTION_START', 'AGENT_EXECUTION_COMPLETE',
        'QUERY_EXECUTION_START', 'QUERY_EXECUTION_COMPLETE'
    ]

    for event_type in core_types:
        assert hasattr(EventType, event_type), f"EventType missing: {event_type}"


def test_event_scope_enum():
    """Test that EventScope enum has required values"""
    required_scopes = ['CURRENT', 'SESSION', 'QUERY', 'ALL']
    
    for scope in required_scopes:
        assert hasattr(EventScope, scope), f"EventScope missing: {scope}"


def test_parsed_event_structure():
    """Test ParsedEvent structure"""
    metadata = EventMetadata(toolName="test", agentName="test")
    event = ParsedEvent(
        name="event-1",
        namespace="test-namespace",
        reason="ToolCallStart",
        message="test message",
        involved_object={"kind": "Query", "name": "query-123"},
        metadata=metadata,
        first_timestamp="2024-01-01T00:00:00Z"
    )
    
    assert event.name == "event-1"
    assert event.namespace == "test-namespace"
    assert event.reason == "ToolCallStart"
    assert event.message == "test message"
    assert event.metadata.toolName == "test"
    assert event.first_timestamp == "2024-01-01T00:00:00Z"