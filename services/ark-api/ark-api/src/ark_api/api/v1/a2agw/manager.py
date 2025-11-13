import asyncio
import contextlib
import logging
import os
import threading

from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from ark_sdk.k8s import get_namespace, is_k8s
from starlette.applications import Starlette
from starlette.types import ASGIApp, Receive, Scope, Send

from .execution import ARKAgentExecutor
from .registry import get_registry

logger = logging.getLogger(__name__)

POLL_INTERVAL = 30 if is_k8s() else int(os.getenv('A2A_POLL_INTERVAL_SECONDS', 3))


class ProxyApp:
    """Thread-safe ASGI proxy for dynamic route updates.
    
    This proxy is critical for safely updating agent routes while the server is running.
    
    Architecture:
    - FastAPI mounts this ProxyApp at /agent (stable mount point)
    - ProxyApp holds a reference to a Starlette app containing all agent routes
    - When agents change, we create a new Starlette app and atomically swap it
    
    Why this is necessary:
    - Starlette's routing wasn't designed for concurrent modification
    - Direct route list manipulation (clear/append) causes race conditions:
      * Requests during clear() get 404s
      * Requests during append() might see partial route lists
      * Concurrent iteration and modification can raise RuntimeError
    - The proxy pattern ensures atomic updates without affecting in-flight requests
    
    Request flow:
    1. Request arrives at FastAPI -> /agent/* 
    2. FastAPI routes to this ProxyApp (stable mount)
    3. ProxyApp forwards to current Starlette app (atomically swapped)
    4. Starlette routes to specific agent's A2AStarletteApplication
    5. A2AStarletteApplication handles the agent protocol
    """
    
    def __init__(self):
        self._app = None
        self._lock = threading.RLock()
    
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Grab current app reference under lock (atomic read)
        with self._lock:
            app = self._app
        
        if app is None:
            # No app mounted yet - return 404
            await send({
                'type': 'http.response.start',
                'status': 404,
                'headers': [[b'content-type', b'text/plain']],
            })
            await send({
                'type': 'http.response.body',
                'body': b'Not Found',
            })
            return
        
        # Forward to current app - this is safe because we hold a reference
        # Even if set_app() is called during this await, we continue using
        # the app instance we already have
        await app(scope, receive, send)
    
    def set_app(self, app: ASGIApp):
        """Atomically replace the target app.
        
        Old app continues serving in-flight requests.
        New requests will use the new app.
        """
        with self._lock:
            self._app = app


class DynamicManager:
    def __init__(self):
        self.agents = {}
        self.lock = threading.Lock()
        self.app = ProxyApp()  # Use proxy instead of Starlette
        self.registry = get_registry()
        self._refresh_task = None
        self._running = False

    async def start_periodic_sync(self):
        """Start the periodic registry sync task"""
        if self._refresh_task is None:
            self._running = True
            self._refresh_task = asyncio.create_task(self._periodic_sync_loop())
            logger.info(f"Started periodic registry sync task ({POLL_INTERVAL}s)")
    
    async def stop_periodic_sync(self):
        """Stop the periodic registry sync task"""
        self._running = False
        if self._refresh_task:
            self._refresh_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._refresh_task
            self._refresh_task = None
            logger.info("Stopped periodic registry sync task")
    
    async def _periodic_sync_loop(self):
        """Periodically sync agents with registry every 30 seconds"""
        while self._running:
            try:
                await self._sync_with_registry()
            except Exception as e:
                logger.error(f"Error during registry sync: {e}", exc_info=True)
            
            # Wait N seconds before next sync
            try:
                await asyncio.sleep(POLL_INTERVAL)
            except asyncio.CancelledError:
                break
    
    async def _sync_with_registry(self):
        """Sync agents with registry and update routes if needed"""
        try:
            # Get current agents from registry
            logger.debug("Fetching agents from registry...")
            agent_cards = await self.registry.list_agents()
            registry_agents = {card.name: card for card in agent_cards}
            
            # Check for changes
            changes_detected = False
            
            with self.lock:
                current_names = set(self.agents.keys())
                registry_names = set(registry_agents.keys())
                
                # Find agents to remove
                to_remove = current_names - registry_names
                for name in to_remove:
                    del self.agents[name]
                    logger.info(f"Removed agent: {name}")
                    changes_detected = True
                
                # Find agents to add or update
                for name, card in registry_agents.items():
                    if name not in self.agents or self.agents[name] != card:
                        self.agents[name] = card
                        logger.info(f"Added/Updated agent: {name}")
                        changes_detected = True
            
            # Only update routes if changes were detected
            if changes_detected:
                logger.info("Agent changes detected, updating routes...")
                self._update_routes()
            else:
                logger.debug("No agent changes detected, routes unchanged")
                
        except Exception as e:
            logger.error(f"Failed to sync with registry: {e}", exc_info=True)

    async def initialize(self):
        """Initialize the manager with agents from registry and start periodic sync"""
        # Do initial sync
        await self._sync_with_registry()
        
        # Start periodic sync task
        await self.start_periodic_sync()
    
    async def shutdown(self):
        """Shutdown the manager and stop periodic sync"""
        await self.stop_periodic_sync()

    def _update_routes(self):
        # Create a new Starlette app with all routes
        new_app = Starlette()
        
        # Add routes for each agent
        for name, agent_card in self.agents.items():
            request_handler = DefaultRequestHandler(
                agent_executor=ARKAgentExecutor(name, get_namespace()),
                task_store=InMemoryTaskStore(),
            )

            server = A2AStarletteApplication(
                agent_card=agent_card,
                http_handler=request_handler
            )

            new_app.mount(f"/{name}/", server.build())

        # Atomically swap the entire app
        self.app.set_app(new_app)
        
        logger.info(f"Updated routes - Active agents: {list(self.agents.keys())}")

