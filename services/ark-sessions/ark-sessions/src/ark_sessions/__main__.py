"""Main entry point for ark-sessions service."""

import uvicorn

from ark_sessions.main import app

if __name__ == "__main__":
    uvicorn.run(
        "ark_sessions.main:app",
        host="0.0.0.0",
        port=8080,
        reload=False,
    )

