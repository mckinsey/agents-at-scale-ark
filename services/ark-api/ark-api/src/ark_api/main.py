import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from kubernetes_asyncio import client

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

from .api import router
from .core.config import setup_logging
from .auth.middleware import AuthMiddleware
from ark_sdk.k8s import init_k8s

# Initialize logging
logger = setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up ARK API...")
    await init_k8s()
    logger.info("Kubernetes clients initialized")
    yield
    # Shutdown
    logger.info("Shutting down ARK API...")
    # Close all kubernetes async clients
    await client.ApiClient().close()


app = FastAPI(
    title="ARK API",
    description="Agentic Runtime for Kubenetes API",
    version="1.0.0",
    lifespan=lifespan,
    # Auto-detect root path from X-Forwarded-Prefix header  
    root_path_in_servers=True,
    openapi_url=None,  # Disable default openapi, we'll use custom one
    docs_url=None  # Disable default docs, we'll use custom one
)

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
