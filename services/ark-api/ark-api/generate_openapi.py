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

# Generate base OpenAPI schema
openapi_schema: Dict[str, Any] = app.openapi()

# Inject security based on AUTH_MODE (same logic as /openapi.json)
auth_mode = os.getenv("AUTH_MODE", "").lower() or AuthMode.OPEN
components: Dict[str, Any] = openapi_schema.setdefault("components", {})
security_schemes: Dict[str, Any] = {}
global_security: list = []

if auth_mode in [AuthMode.SSO, AuthMode.HYBRID]:
    security_schemes["bearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "Provide a valid OIDC/JWT bearer token.",
    }
    global_security.append({"bearerAuth": []})

if auth_mode in [AuthMode.BASIC, AuthMode.HYBRID]:
    security_schemes["basicAuth"] = {
        "type": "http",
        "scheme": "basic",
        "description": "Use API key pair as Basic auth: public_key:secret_key.",
    }
    if {"basicAuth": []} not in global_security:
        global_security.append({"basicAuth": []})

if security_schemes:
    components["securitySchemes"] = security_schemes
    openapi_schema["components"] = components
    openapi_schema["security"] = global_security
else:
    openapi_schema.pop("security", None)

# Clear security on explicit public routes
public_routes = get_public_routes()
paths = openapi_schema.get("paths", {})
for path, path_item in paths.items():
    if path in public_routes:
        for method, operation in list(path_item.items()):
            if method.lower() in ["get", "post", "put", "patch", "delete", "options", "head"]:
                operation["security"] = []

# Write to file
with open("openapi.json", "w") as f:
    json.dump(openapi_schema, f, indent=2)

print("OpenAPI schema written to openapi.json")