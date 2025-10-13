"""
UV Loop Handler for managing asyncio event loops in threaded environments.
Handles detection and mitigation of uvloop conflicts for RAGAS evaluation.
"""

import asyncio
import logging
import threading
import concurrent.futures
from typing import Callable, Any, Dict

logger = logging.getLogger(__name__)


class UVLoopHandler:
    """
    Manages UV loop detection and provides thread-safe execution for RAGAS.
    
    This class handles the compatibility issues between uvloop and RAGAS by:
    1. Detecting if the current event loop is uvloop
    2. Running RAGAS in a separate thread with a clean asyncio environment when needed
    3. Properly managing event loop lifecycle in threads
    """
    
    @staticmethod
    def detect_uvloop() -> bool:
        """
        Detect if the current event loop is using uvloop.
        
        Returns:
            bool: True if uvloop is detected, False otherwise
        """
        try:
            current_loop = asyncio.get_event_loop()
            is_uvloop = 'uvloop' in str(type(current_loop))
            if is_uvloop:
                logger.info(f"Detected uvloop: {type(current_loop)}")
            return is_uvloop
        except RuntimeError:
            logger.debug("No event loop found, uvloop not detected")
            return False
    
    @staticmethod
    def run_in_thread_with_clean_loop(
        sync_func: Callable,
        *args,
        **kwargs
    ) -> Any:
        """
        Run a function in a separate thread with a clean asyncio event loop.
        
        This is used to isolate RAGAS execution from uvloop environments.
        
        Args:
            sync_func: The synchronous function to run in the thread
            *args: Positional arguments for the function
            **kwargs: Keyword arguments for the function
            
        Returns:
            The result from the function execution
        """
        logger.info(f"Running function in separate thread: {threading.current_thread().name}")
        
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(sync_func, *args, **kwargs)
            return future.result()
    
    @staticmethod
    def create_clean_event_loop() -> asyncio.AbstractEventLoop:
        """
        Create a clean asyncio event loop without uvloop.
        
        This resets the event loop policy to default and creates a standard asyncio loop.
        
        Returns:
            A new asyncio event loop (not uvloop)
        """
        # CRITICAL: Reset the event loop policy to default BEFORE creating the loop
        # This ensures the thread doesn't inherit uvloop from the main thread
        asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())
        
        # Now create a standard asyncio loop (not uvloop)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        logger.info(f"Created clean event loop: {type(loop)}")
        return loop
    
    @staticmethod
    async def run_async_in_clean_loop(
        async_func: Callable,
        *args,
        **kwargs
    ) -> Any:
        """
        Run an async function ensuring compatibility with the current loop type.
        
        Args:
            async_func: The async function to run
            *args: Positional arguments for the function
            **kwargs: Keyword arguments for the function
            
        Returns:
            The result from the async function
        """
        if UVLoopHandler.detect_uvloop():
            logger.info("Detected uvloop, running in separate thread with clean loop")
            
            def run_in_thread():
                loop = UVLoopHandler.create_clean_event_loop()
                try:
                    return loop.run_until_complete(async_func(*args, **kwargs))
                except Exception as e:
                    logger.error(f"Error in thread execution: {e}")
                    raise
                finally:
                    loop.close()
                    logger.info("Closed thread event loop")
            
            return UVLoopHandler.run_in_thread_with_clean_loop(run_in_thread)
        else:
            # No uvloop, can run directly
            logger.debug("No uvloop detected, running directly")
            return await async_func(*args, **kwargs)
    
    @staticmethod
    def wrap_sync_for_thread(
        sync_func: Callable,
        env_vars: Dict[str, str] = None
    ) -> Callable:
        """
        Wrap a synchronous function to run in a thread with clean environment.
        
        Args:
            sync_func: The synchronous function to wrap
            env_vars: Optional environment variables to set in the thread
            
        Returns:
            A wrapped function that runs in a clean thread
        """
        import os
        
        def wrapper(*args, **kwargs):
            logger.info(f"Running wrapped function in thread: {threading.current_thread().name}")
            
            # Set environment variables if provided
            env_vars_set = []
            if env_vars:
                for key, value in env_vars.items():
                    os.environ[key] = value
                    env_vars_set.append(key)
                logger.info(f"Set environment variables in thread: {env_vars_set}")
            
            try:
                # Create clean event loop and run the function
                loop = UVLoopHandler.create_clean_event_loop()
                try:
                    return sync_func(*args, **kwargs)
                finally:
                    loop.close()
            finally:
                # Clean up environment variables
                if env_vars_set:
                    for var in env_vars_set:
                        os.environ.pop(var, None)
                    logger.info(f"Cleaned up environment variables: {env_vars_set}")
        
        return wrapper