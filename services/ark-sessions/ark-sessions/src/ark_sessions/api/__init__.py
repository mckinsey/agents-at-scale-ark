"""API routes for ark-sessions."""

from fastapi import APIRouter

from ark_sessions.api import health, messages, otlp, sessions

router = APIRouter()

# Health
router.add_api_route("/health", health.health_check, methods=["GET"])

# Messages
router.add_api_route("/messages", messages.add_messages, methods=["POST"])
router.add_api_route("/messages", messages.get_messages, methods=["GET"])

# Sessions
router.add_api_route("/sessions", sessions.list_sessions, methods=["GET"])
router.add_api_route("/sessions/{session_id}", sessions.get_session_by_id, methods=["GET"])

# OTLP
router.add_api_route("/v1/traces", otlp.receive_otlp_traces, methods=["POST"])

__all__ = ["router"]
