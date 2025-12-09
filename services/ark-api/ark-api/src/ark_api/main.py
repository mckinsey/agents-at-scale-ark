import os
import time
from contextlib import asynccontextmanager
from importlib.metadata import version, PackageNotFoundError
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from kubernetes_asyncio import client
from dotenv import load_dotenv
from typing import Dict, Any
from opentelemetry import baggage, propagate, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from .api import router
from .core.config import setup_logging
from .auth.middleware import AuthMiddleware
from .auth.constants import AuthMode
from .auth.config import get_public_routes
from .openapi.security import add_security_to_openapi
from .api.v1.a2a_gateway import get_a2a_manager
from ark_sdk.k8s import init_k8s

# Load environment variables from .env file
load_dotenv()

# Initialize logging
logger = setup_logging()

# Get version from package metadata (pyproject.toml)
try:
    VERSION = version("ark-api")
except PackageNotFoundError:
    VERSION = "0.0.0-dev"  # Fallback for development


def setup_telemetry():
    """Initialize OpenTelemetry tracing"""
    otel_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not otel_endpoint:
        logger.info("OTEL_EXPORTER_OTLP_ENDPOINT not set, telemetry disabled")
        return
    
    service_name = os.getenv("OTEL_SERVICE_NAME", "ark-api")
    
    # Set up resource
    resource = Resource.create({
        "service.name": service_name,
        "service.version": VERSION,
    })
    
    # Set up tracer provider
    tracer_provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(tracer_provider)
    
    # Set up OTLP exporter
    otlp_exporter = OTLPSpanExporter(endpoint=f"{otel_endpoint}/v1/traces")
    span_processor = BatchSpanProcessor(otlp_exporter)
    tracer_provider.add_span_processor(span_processor)
    
    logger.info(f"Telemetry initialized for {service_name} -> {otel_endpoint}")


def extract_session_context(request: Request):
    """Extract OTEL context and session ID from request headers"""
    # Extract OTEL trace context from headers
    ctx = propagate.extract(request.headers)
    
    # Extract session ID from custom header
    session_id = request.headers.get("x-session-id")
    if session_id:
        # Add session to baggage
        ctx = baggage.set_baggage("session.id", session_id, context=ctx)
    
    return ctx, session_id


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting up ARK API v{VERSION}")

    # Initialize telemetry
    setup_telemetry()

    await init_k8s()
    logger.info("Kubernetes clients initialized")
    
    # Initialize A2A manager and mount dynamic agent routes under /a2a
    a2a_manager = get_a2a_manager()
    await a2a_manager.initialize()
    app.mount("/a2a/agent", a2a_manager.app)
    logger.info("A2A Gateway initialized at /a2a")
    
    yield
    # Shutdown
    logger.info("Shutting down ARK API...")
    
    # Shutdown A2A manager
    await a2a_manager.shutdown()
    
    # Close all kubernetes async clients
    await client.ApiClient().close()


app = FastAPI(
    title="ARK API",
    description="Agentic Runtime for Kubernetes API",
    version=VERSION,
    lifespan=lifespan,
    # Auto-detect root path from X-Forwarded-Prefix header  
    root_path_in_servers=True,
    openapi_url=None,  # Disable default openapi, we'll use custom one
    docs_url=None  # Disable default docs, we'll use custom one
)

# Instrument FastAPI and HTTPx for automatic tracing
FastAPIInstrumentor.instrument_app(app)
HTTPXClientInstrumentor().instrument()

# Custom docs endpoint that respects X-Forwarded-Prefix header
# The dashboard middleware and ingresses set this header to indicate the external path prefix
# This allows the API to be served from any root (/, /api, /whatever) as long as the proxy sets the correct header

@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html(request: Request):
    # Check if we have X-Forwarded-Prefix header
    forwarded_prefix = request.headers.get("x-forwarded-prefix", "")
    openapi_url = f"{forwarded_prefix}/openapi.json"
    
    return get_swagger_ui_html(
        openapi_url=openapi_url,
        title=app.title + " - Swagger UI",
    )

# Custom OpenAPI spec that respects standard HTTP forwarding headers
# Uses X-Forwarded-Prefix, X-Forwarded-Host, and X-Forwarded-Proto headers
# set by dashboard middleware and ingress routes to determine the external server URL
# This allows the backend to be served from any path (/, /api, /something-else) 
# without hardcoding deployment paths
@app.get("/openapi.json", include_in_schema=False)
async def custom_openapi(request: Request):
    # Get the default OpenAPI spec
    openapi_schema = app.openapi()
    
    # Inject auth security schemes based on AUTH_MODE so that generated SDKs include auth
    auth_mode = os.getenv("AUTH_MODE", "").lower() or AuthMode.OPEN
    openapi_schema = add_security_to_openapi(
        openapi_schema,
        auth_mode=auth_mode,
        public_routes=get_public_routes(),
    )
    
    # Check if we have X-Forwarded-Prefix header indicating external path prefix
    forwarded_prefix = request.headers.get("x-forwarded-prefix", "")
    
    if forwarded_prefix:
        # Construct the external server URL using standard forwarding headers
        host = request.headers.get("x-forwarded-host") or request.headers.get("host", "localhost:8000")
        protocol = request.headers.get("x-forwarded-proto", "http")
        server_url = f"{protocol}://{host}{forwarded_prefix}"
        
        # Update the servers in the OpenAPI spec for correct Swagger UI "Try it out" functionality
        openapi_schema["servers"] = [{"url": server_url, "description": "Current server"}]
    
    return openapi_schema

# Configure CORS
cors_origins = os.getenv("CORS_ORIGINS", "").strip()
allowed_origins = [origin.strip() for origin in cors_origins.split(",") if origin.strip()] if cors_origins else []

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Log CORS origins at startup
if allowed_origins:
    logger.info(f"CORS origins configured: {allowed_origins}")
else:
    logger.info("No CORS origins configured - CORS will block all cross-origin requests")


# Include routes
app.include_router(router)

# Add global authentication middleware (protects all routes by default except PUBLIC_ROUTES)
app.add_middleware(AuthMiddleware)


@app.middleware("http")
async def session_aware_middleware(request: Request, call_next):
    """Middleware for session tracking and request timing with OTEL context"""
    start_time = time.time()
    
    # Extract OTEL context and session ID
    otel_ctx, session_id = extract_session_context(request)
    
    # Add session info to logs
    session_info = f"session={session_id}" if session_id else "no-session"
    logger.info(
        f"Request: {request.method} {request.url.path} - {session_info} - Query: {dict(request.query_params)}"
    )
    
    # Process request with OTEL context
    response = await call_next(request)
    
    process_time = time.time() - start_time
    logger.info(
        f"Response: {request.method} {request.url.path} - {session_info} - Status: {response.status_code} - Time: {process_time:.3f}s"
    )
    
    return response


# Custom exception handler for validation errors
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors with detailed logging."""
    # Log the full error details
    logger.error(f"Validation error for {request.method} {request.url}")
    logger.error(f"Request body: {await request.body()}")
    logger.error(f"Validation errors: {exc.errors()}")
    
    # Return a detailed error response
    return JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "body": exc.body
        }
    )
