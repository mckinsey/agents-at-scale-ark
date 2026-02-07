"""Tests for the FastAPI app module."""

import pytest


class TestApp:
    """Tests for app creation and configuration."""

    def test_create_app(self):
        from openai_executor.app import create_app
        from fastapi import FastAPI
        
        app = create_app()
        
        assert isinstance(app, FastAPI)

    def test_executor_instance(self):
        from openai_executor.app import executor
        from openai_executor.executor import OpenAIAgentsExecutor
        
        assert isinstance(executor, OpenAIAgentsExecutor)

    def test_app_instance(self):
        from openai_executor.app import app_instance
        from ark_executor_common import ExecutorApp
        
        assert isinstance(app_instance, ExecutorApp)
