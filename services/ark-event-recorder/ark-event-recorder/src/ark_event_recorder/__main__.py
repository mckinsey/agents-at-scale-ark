"""Entry point for running the service."""

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "ark_event_recorder.main:app",
        host="0.0.0.0",
        port=8080,
        reload=True,
    )



