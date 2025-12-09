#!/usr/bin/env python3
"""Generate OpenAPI schema without running the server."""
import json
import os
import sys
from pathlib import Path
from typing import Dict, Any

# Add the src directory to Python path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from ark_api.main import app
from ark_api.auth.constants import AuthMode
from ark_api.auth.config import get_public_routes
from ark_api.openapi.security import add_security_to_openapi

# Generate base OpenAPI schema
openapi_schema: Dict[str, Any] = app.openapi()

# Inject security based on AUTH_MODE (same logic as /openapi.json) via helper
auth_mode = os.getenv("AUTH_MODE", "").lower() or AuthMode.OPEN
openapi_schema = add_security_to_openapi(
    openapi_schema,
    auth_mode=auth_mode,
    public_routes=get_public_routes(),
)

# Write to file
with open("openapi.json", "w") as f:
    json.dump(openapi_schema, f, indent=2)

print("OpenAPI schema written to openapi.json")