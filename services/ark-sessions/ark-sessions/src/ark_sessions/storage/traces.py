"""Trace storage operations."""

from datetime import datetime
from typing import Optional

from sqlmodel import select
from sqlmodel.ext.asyncio import AsyncSession

from ark_sessions.models import Span, SpanEvent, Trace
from ark_sessions.storage.sessions import SessionStorage


class TraceStorage:
    """Storage for trace/span operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.session_storage = SessionStorage(session)
    
    async def store_trace(
        self,
        trace: Trace,
        spans: list[Span],
        span_events: list[SpanEvent],
    ) -> None:
        """Store a trace, its spans, and span events."""
        # Ensure session exists
        await self.session_storage.create_session(trace.session_id)
        
        # Create or update trace
        statement = select(Trace).where(Trace.trace_id == trace.trace_id)
        result = await self.session.exec(statement)
        existing_trace = result.first()
        
        if existing_trace:
            # Update end_time if new trace has later end_time
            if trace.end_time and (
                not existing_trace.end_time or trace.end_time > existing_trace.end_time
            ):
                existing_trace.end_time = trace.end_time
            await self.session.add(existing_trace)
        else:
            await self.session.add(trace)
        
        # Create or update spans
        for span in spans:
            statement = select(Span).where(Span.span_id == span.span_id)
            result = await self.session.exec(statement)
            existing_span = result.first()
            
            if existing_span:
                # Update end_time and status if provided
                if span.end_time and (
                    not existing_span.end_time or span.end_time > existing_span.end_time
                ):
                    existing_span.end_time = span.end_time
                if span.status:
                    existing_span.status = span.status
                await self.session.add(existing_span)
            else:
                await self.session.add(span)
        
        # Add span events (append only)
        for event in span_events:
            await self.session.add(event)
        
        await self.session.commit()
    
    async def get_traces_by_session(self, session_id: str) -> list[Trace]:
        """Get all traces for a session."""
        statement = (
            select(Trace)
            .where(Trace.session_id == session_id)
            .order_by(Trace.start_time)
        )
        result = await self.session.exec(statement)
        return list(result.all())
    
    async def get_spans_by_trace(self, trace_id: str) -> list[Span]:
        """Get all spans for a trace."""
        statement = (
            select(Span)
            .where(Span.trace_id == trace_id)
            .order_by(Span.start_time)
        )
        result = await self.session.exec(statement)
        return list(result.all())
    
    async def get_span_events_by_span(self, span_id: str) -> list[SpanEvent]:
        """Get all span events for a span."""
        statement = (
            select(SpanEvent)
            .where(SpanEvent.span_id == span_id)
            .order_by(SpanEvent.time)
        )
        result = await self.session.exec(statement)
        return list(result.all())

