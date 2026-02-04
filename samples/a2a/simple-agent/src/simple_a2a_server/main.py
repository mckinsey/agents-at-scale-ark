"""Main A2A server implementation."""

import asyncio
import logging
import os
import uuid
from typing import Any, Dict

import uvicorn
from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill, Message, Part, Role, TextPart
from starlette.applications import Starlette
from starlette.routing import Route
from starlette.responses import JSONResponse

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SimpleAgentExecutor:
    """Simple agent executor that processes text messages and responds with basic functionality."""
    
    def __init__(self):
        self.name = "Simple Agent"
        self.version = "1.0.0"
    
    async def execute(self, context, event_queue):
        """Execute a task and send response back through the event queue."""
        try:
            # Extract the user's message
            message_text = ""
            if context.message and context.message.parts:
                first_part = context.message.parts[0]
                if hasattr(first_part, "root") and hasattr(first_part.root, "text"):
                    message_text = first_part.root.text
            
            logger.info(f"Processing message: {message_text}")
            
            # Process the message with simple logic
            result = await self._process_message(message_text)
            
            # Send response back
            response_message = Message(
                messageId=str(uuid.uuid4()),
                contextId=context.message.context_id if context.message else str(uuid.uuid4()),
                taskId=context.task_id,
                role=Role.agent,
                parts=[Part(root=TextPart(kind="text", text=result))],
            )
            await event_queue.enqueue_event(response_message)
            
        except Exception as e:
            logger.error(f"Error processing message: {e}")
            # Send error response
            error_message = Message(
                messageId=str(uuid.uuid4()),
                contextId=context.message.context_id if context.message else str(uuid.uuid4()),
                taskId=context.task_id,
                role=Role.agent,
                parts=[Part(root=TextPart(kind="text", text=f"Error: {str(e)}"))],
            )
            await event_queue.enqueue_event(error_message)
    
    async def cancel(self, context, event_queue):
        """Cancel a running task."""
        logger.info(f"Cancelling task: {context.task_id}")
        # For this simple example, we don't have long-running tasks to cancel
    
    async def _process_message(self, message: str) -> str:
        """Process the incoming message and generate a response."""
        if not message:
            return "Hello! I'm a simple A2A agent. How can I help you today?"
        
        message_lower = message.lower()
        
        # Simple keyword-based responses
        if "hello" in message_lower or "hi" in message_lower:
            return "Hello! Nice to meet you. I'm a simple A2A agent that can help with basic tasks."
        
        elif "help" in message_lower:
            return """I can help you with:
- Greetings and basic conversation
- Simple calculations (try asking me to calculate something)
- Echo back your messages
- Tell you about myself

What would you like to do?"""
        
        elif "calculate" in message_lower or "math" in message_lower:
            # Simple math processing
            try:
                # Extract numbers and basic operations
                words = message.split()
                numbers = []
                for word in words:
                    try:
                        numbers.append(float(word))
                    except ValueError:
                        continue
                
                if len(numbers) >= 2:
                    if "add" in message_lower or "+" in message:
                        result = sum(numbers)
                        return f"The sum of {numbers} is {result}"
                    elif "multiply" in message_lower or "*" in message:
                        result = 1
                        for num in numbers:
                            result *= num
                        return f"The product of {numbers} is {result}"
                    else:
                        return f"I found these numbers: {numbers}. Try asking me to add or multiply them!"
                else:
                    return "I can help with simple math! Try asking me to add or multiply some numbers."
            except Exception:
                return "I can help with simple math! Try asking me to add or multiply some numbers."
        
        elif "echo" in message_lower:
            return f"You said: {message}"
        
        elif "about" in message_lower and ("you" in message_lower or "yourself" in message_lower):
            return f"""I'm {self.name} version {self.version}. 

I'm a simple A2A (Agent-to-Agent) server that demonstrates:
- Basic A2A protocol implementation
- Message processing and response generation
- Integration with ARK's agent ecosystem

I'm designed to be a starting point for building more complex A2A agents."""
        
        else:
            return f"I received your message: '{message}'. I'm a simple agent, so I can help with basic tasks like greetings, simple math, or just echoing your messages back to you. Try asking for help to see what I can do!"


def create_agent_card() -> AgentCard:
    """Create the agent card that describes this agent's capabilities."""
    
    # Define capabilities
    capabilities = AgentCapabilities(streaming=False)
    
    # Define skills
    skills = [
        AgentSkill(
            id="basic_conversation",
            name="Basic Conversation",
            description="Engage in simple conversation and respond to greetings",
            tags=["conversation", "greeting", "basic"],
            examples=[
                "Hello, how are you?",
                "Hi there!",
                "Tell me about yourself"
            ],
            inputModes=["text/plain"],
            outputModes=["text/plain"],
        ),
        AgentSkill(
            id="simple_math",
            name="Simple Math",
            description="Perform basic mathematical calculations",
            tags=["math", "calculation", "arithmetic"],
            examples=[
                "Calculate 5 + 3",
                "What is 10 * 4?",
                "Add 2, 3, and 5"
            ],
            inputModes=["text/plain"],
            outputModes=["text/plain"],
        ),
        AgentSkill(
            id="echo_messages",
            name="Echo Messages",
            description="Echo back user messages",
            tags=["echo", "repeat", "utility"],
            examples=[
                "Echo: Hello world",
                "Repeat this message",
                "Say back what I just said"
            ],
            inputModes=["text/plain"],
            outputModes=["text/plain"],
        ),
    ]
    
    # Get server URL from environment or use default
    server_url = os.getenv("A2A_SERVER_URL", "http://localhost:8000")
    
    return AgentCard(
        name="simple-agent",
        description="A simple agent demonstrating basic functionality",
        url=f"{server_url}",
        version="1.0.0",
        defaultInputModes=["text/plain"],
        defaultOutputModes=["text/plain"],
        capabilities=capabilities,
        skills=skills,
    )


def create_app() -> Starlette:
    """Create and configure the Starlette application."""
    
    # Create agent executor
    executor = SimpleAgentExecutor()
    
    # Create agent card
    agent_card = create_agent_card()
    
    # Create request handler
    handler = DefaultRequestHandler(
        agent_executor=executor,
        task_store=InMemoryTaskStore(),
    )
    
    # Create A2A application
    a2a_app = A2AStarletteApplication(
        agent_card=agent_card,
        http_handler=handler,
    )
    
    # Health check endpoint
    async def health(request):
        return JSONResponse({
            "status": "healthy",
            "agent": executor.name,
            "version": executor.version,
            "timestamp": asyncio.get_event_loop().time()
        })
    
    # Build the complete application
    built_a2a_app = a2a_app.build()
    routes = [Route("/health", health, methods=["GET"])]
    
    # Extract A2A routes
    for route in built_a2a_app.routes:
        if hasattr(route, 'path'):
            if route.path == "/":
                routes.append(Route("/", route.endpoint, methods=route.methods))
            elif route.path == "/.well-known/agent-card.json":
                routes.append(route)
            elif route.path.startswith("/jsonrpc"):
                routes.append(route)
    
    return Starlette(routes=routes)


# Create app instance for uvicorn hot reload
app = create_app()


def main():
    """Main entry point for the A2A server."""
    app = create_app()
    
    # Get configuration from environment
    host = os.getenv("A2A_HOST", "0.0.0.0")
    port = int(os.getenv("A2A_PORT", "8000"))
    
    logger.info(f"Starting Simple Agent on {host}:{port}")
    logger.info(f"Agent card available at: http://{host}:{port}/.well-known/agent-card.json")
    logger.info(f"Health check available at: http://{host}:{port}/health")
    
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
