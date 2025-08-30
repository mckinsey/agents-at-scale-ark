#!/usr/bin/env python3

import os
import uvicorn
from .app import create_app


def main():
    app = create_app()
    
    # Get concurrency settings from environment
    workers = int(os.getenv("UVICORN_WORKERS", "1"))
    worker_class = os.getenv("UVICORN_WORKER_CLASS", "uvicorn.workers.UvicornWorker")
    
    if workers > 1:
        # Use gunicorn for multiple workers
        import gunicorn.app.base
        
        class StandaloneApplication(gunicorn.app.base.BaseApplication):
            def __init__(self, app, options=None):
                self.options = options or {}
                self.application = app
                super().__init__()
            
            def load_config(self):
                for key, value in self.options.items():
                    self.cfg.set(key.lower(), value)
            
            def load(self):
                return self.application
        
        options = {
            'bind': '0.0.0.0:8000',
            'workers': workers,
            'worker_class': 'uvicorn.workers.UvicornWorker',
            'worker_connections': 1000,
            'max_requests': 1000,
            'max_requests_jitter': 100,
        }
        
        StandaloneApplication(app, options).run()
    else:
        # Single worker mode
        uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()