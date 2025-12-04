"""Integration tests for ark-event-manager event processing pipeline."""

import asyncio
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest

# Add src to path for imports
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

# Add generated to path for proto imports
generated_path = Path(__file__).parent.parent / "generated"
if generated_path.exists():
    sys.path.insert(0, str(generated_path))

from ark_event_manager.core.models import Event, EventSeverity, EventSourceType


class MockEventPublisher:
    """Mock event publisher for testing."""

    def __init__(self, base_url: str = "http://localhost:8080"):
        """Initialize mock publisher."""
        self.base_url = base_url.rstrip("/")
        self.url = f"{self.base_url}/events"

    def create_event(
        self,
        event_type: str = "query",
        subtype: str = "execution_start",
        correlation_id: str | None = None,
        severity: EventSeverity = EventSeverity.INFO,
        source_type: EventSourceType = EventSourceType.ARK_CONTROLLER,
        source: str = "mock-publisher",
        payload: dict | None = None,
    ) -> Event:
        """Create a mock event."""
        if correlation_id is None:
            correlation_id = f"test-{uuid.uuid4().hex[:8]}"

        if payload is None:
            payload = {}

        return Event(
            event_id=str(uuid.uuid4()),
            correlation_id=correlation_id,
            timestamp=datetime.now(timezone.utc),
            severity=severity,
            type=event_type,
            subtype=subtype,
            source_type=source_type,
            source=source,
            version="v1",
            payload=payload,
        )

    def event_to_json(self, event: Event) -> dict:
        """Convert Event to JSON dict."""
        return event.model_dump(exclude={"id", "created_at"})

    async def publish(self, event: Event, correlation_id: str | None = None) -> httpx.Response:
        """Publish an event to the event manager."""
        event_dict = self.event_to_json(event)
        corr_id = correlation_id or event.correlation_id

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                self.url,
                json=event_dict,
                headers={
                    "Content-Type": "application/json",
                    "X-Correlation-ID": corr_id,
                },
            )
            return response

    async def publish_batch(
        self, events: list[Event], correlation_id: str | None = None
    ) -> list[httpx.Response]:
        """Publish multiple events."""
        responses = []
        for event in events:
            response = await self.publish(event, correlation_id)
            responses.append(response)
            await asyncio.sleep(0.1)
        return responses


@pytest.mark.integration
@pytest.mark.asyncio
class TestEventPipeline:
    """Integration tests for the event processing pipeline."""

    @pytest.fixture
    def publisher(self, service_process):
        """Create a mock event publisher."""
        return MockEventPublisher(base_url=service_process)

    async def test_health_check(self, service_process):
        """Test service health endpoint."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{service_process}/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "healthy"

    async def test_publish_query_execution_start(self, publisher):
        """Test publishing a query execution start event."""
        query_id = f"query-{uuid.uuid4().hex[:8]}"
        event = publisher.create_event(
            event_type="query",
            subtype="execution_start",
            correlation_id=query_id,
            payload={"queryId": query_id, "queryName": "test-query", "sessionId": "test-session"},
        )
        response = await publisher.publish(event)
        assert response.status_code == 202
        assert event.event_id
        assert event.correlation_id == query_id

    async def test_publish_query_execution_complete(self, publisher):
        """Test publishing a query execution complete event."""
        query_id = f"query-{uuid.uuid4().hex[:8]}"
        event = publisher.create_event(
            event_type="query",
            subtype="execution_complete",
            correlation_id=query_id,
            payload={
                "queryId": query_id,
                "queryName": "test-query",
                "sessionId": "test-session",
                "durationMs": 1234.56,
            },
        )
        response = await publisher.publish(event)
        assert response.status_code == 202

    async def test_publish_workflow_event(self, publisher):
        """Test publishing a workflow event."""
        workflow_id = f"workflow-{uuid.uuid4().hex[:8]}"
        event = publisher.create_event(
            event_type="workflow",
            subtype="succeeded",
            correlation_id=workflow_id,
            source_type=EventSourceType.WATCHER,
            source="argo-watcher",
            payload={"workflowId": workflow_id, "status": "succeeded"},
        )
        response = await publisher.publish(event)
        assert response.status_code == 202

    async def test_publish_error_event(self, publisher):
        """Test publishing an error event."""
        query_id = f"query-{uuid.uuid4().hex[:8]}"
        event = publisher.create_event(
            event_type="error",
            subtype="model_timeout",
            correlation_id=query_id,
            severity=EventSeverity.ERROR,
            payload={"error": "Model timeout", "queryId": query_id},
        )
        response = await publisher.publish(event)
        assert response.status_code == 202

    async def test_publish_batch_events(self, publisher):
        """Test publishing a batch of events."""
        batch_events = [
            publisher.create_event(
                event_type="query",
                subtype="execution_start",
                correlation_id=f"batch-{i}",
                payload={"batch": i},
            )
            for i in range(3)
        ]
        responses = await publisher.publish_batch(batch_events)
        assert len(responses) == 3
        assert all(r.status_code == 202 for r in responses)

