"""Integration tests for ark-event-manager event processing pipeline."""

import asyncio
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest
from google.protobuf import struct_pb2

# Add src to path for imports
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

# Add generated to path for proto imports
generated_path = Path(__file__).parent.parent / "generated"
if generated_path.exists():
    sys.path.insert(0, str(generated_path))

from ark_event_manager.core.models import Event, EventSeverity, EventSourceType
from ark_event_manager.core.types import Protobuf


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

    def event_to_protobuf_bytes(self, event: Event) -> Protobuf:
        """Convert Event to protobuf-serialized bytes."""
        if isinstance(event.timestamp, datetime):
            timestamp_seconds = int(event.timestamp.timestamp())
            timestamp_nanos = int((event.timestamp.timestamp() - timestamp_seconds) * 1e9)
        else:
            timestamp_seconds = int(datetime.now(timezone.utc).timestamp())
            timestamp_nanos = 0

        import event_pb2

        EventProto = event_pb2.Event

        proto_event = EventProto()
        proto_event.event_id = event.event_id
        proto_event.correlation_id = event.correlation_id
        proto_event.timestamp.seconds = timestamp_seconds
        proto_event.timestamp.nanos = timestamp_nanos
        proto_event.severity = event.severity.value
        proto_event.type = event.type
        proto_event.subtype = event.subtype
        proto_event.source_type = event.source_type.value
        proto_event.source = event.source
        proto_event.version = event.version

        self._dict_to_protobuf_struct(event.payload, proto_event.payload)

        return Protobuf(proto_event.SerializeToString())

    def _dict_to_protobuf_struct(self, data: dict, struct: struct_pb2.Struct) -> None:
        """Convert Python dict to protobuf Struct."""
        for key, value in data.items():
            if isinstance(value, str):
                struct.fields[key].string_value = value
            elif isinstance(value, (int, float)):
                struct.fields[key].number_value = float(value)
            elif isinstance(value, bool):
                struct.fields[key].bool_value = value
            elif isinstance(value, dict):
                self._dict_to_protobuf_struct(value, struct.fields[key].struct_value)
            elif isinstance(value, list):
                list_value = struct.fields[key].list_value
                for item in value:
                    if isinstance(item, str):
                        list_value.values.add().string_value = item
                    elif isinstance(item, (int, float)):
                        list_value.values.add().number_value = float(item)
                    elif isinstance(item, bool):
                        list_value.values.add().bool_value = item
                    elif isinstance(item, dict):
                        self._dict_to_protobuf_struct(item, list_value.values.add().struct_value)
            else:
                struct.fields[key].string_value = str(value)

    async def publish(self, event: Event, correlation_id: str | None = None) -> httpx.Response:
        """Publish an event to the event manager."""
        event_bytes = self.event_to_protobuf_bytes(event)
        corr_id = correlation_id or event.correlation_id

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                self.url,
                content=event_bytes,
                headers={
                    "Content-Type": "application/x-protobuf",
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

