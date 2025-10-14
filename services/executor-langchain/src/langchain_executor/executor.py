"""LangChain execution logic."""

import logging
from typing import List, Optional
from langchain.schema import Document, HumanMessage, AIMessage, SystemMessage
from langchain_community.vectorstores import FAISS
from ark_sdk.executor import BaseExecutor, Message
from .utils import (
    create_chat_client,
    create_embeddings_client,
    should_use_rag,
    index_code_files,
    create_vector_store,
    build_rag_context,
)

logger = logging.getLogger(__name__)


class LangChainExecutor(BaseExecutor):
    """Handles LangChain agent execution with optional RAG support."""

    def __init__(self):
        super().__init__("LangChain")
        self.vector_store: Optional[FAISS] = None
        self._indexed = False
        self.code_directory = "."
        self.code_chunks: List[Document] = []

    async def execute_agent(self, request) -> List:
        """Execute agent with LangChain and return response messages."""
        try:
            logger.info(f"Executing LangChain query for agent {request.agent.name}")

            # Create LangChain ChatOpenAI client
            chat_client = create_chat_client(request.agent.model)

            # Check if this agent should use RAG
            use_rag = should_use_rag(request.agent)

            # Get RAG context if enabled
            rag_context = None
            if use_rag:
                logger.info(f"Using RAG for agent: {request.agent.name}")
                embeddings_model_name = request.agent.labels.get("langchain-embeddings-model") if request.agent.labels else None
                rag_context = await self._get_code_context(request.userInput.content, request.agent.model, embeddings_model_name)
            else:
                logger.info(f"Standard LangChain execution (no RAG) for agent: {request.agent.name}")

            # Convert message history to LangChain format
            langchain_messages = []
            for msg in request.history:
                if msg.role == "user":
                    langchain_messages.append(HumanMessage(content=msg.content))
                elif msg.role == "assistant":
                    langchain_messages.append(AIMessage(content=msg.content))
                elif msg.role == "system":
                    langchain_messages.insert(0, SystemMessage(content=msg.content))

            # Add current user message
            if use_rag and rag_context:
                # For RAG, include context in the user message
                rag_instruction = "Use this code context to answer the user's question accurately!"
                user_content = f"🔥 RELEVANT CODE CONTEXT:\n\n{rag_context}\n\n{rag_instruction}\n\nUser: {request.userInput.content}"
            else:
                user_content = request.userInput.content

            langchain_messages.append(HumanMessage(content=user_content))

            # If this is the first message, prepend the agent prompt as a system message
            if len(request.history) == 0:
                resolved_prompt = self._resolve_prompt(request.agent)
                langchain_messages.insert(0, SystemMessage(content=resolved_prompt))

            response = await chat_client.ainvoke(langchain_messages)

            # Handle response content
            if hasattr(response, "content"):
                result = str(response.content)
            else:
                result = str(response)

            # Create response messages
            response_messages = []

            if result:
                assistant_message = Message(
                    role="assistant",
                    content=result,
                    name=request.agent.name,
                )
                response_messages.append(assistant_message)
            else:
                error_message = Message(
                    role="assistant",
                    content="Error: No response generated from LangChain",
                    name=request.agent.name,
                )
                response_messages.append(error_message)

            logger.info(f"LangChain execution completed successfully for agent {request.agent.name}")
            return response_messages

        except Exception as e:
            logger.error(f"Error in LangChain processing: {str(e)}", exc_info=True)
            raise

    async def _get_code_context(self, query_input: str, model_config, embeddings_model_name: Optional[str] = None) -> str:
        """Get relevant code context for a query using embeddings and vector search."""
        logger.info(f"Getting code context for query: {query_input}")

        # Index code if not already done
        if not self._indexed:
            await self._index_code(model_config, embeddings_model_name)

        # Find relevant code sections using vector search
        relevant_docs = self._retrieve_relevant_code(query_input, k=5)

        # Create context from relevant code
        context = build_rag_context(relevant_docs)

        logger.info(f"Generated code context with {len(relevant_docs)} relevant sections")
        return context

    async def _index_code(self, model_config, embeddings_model_name: Optional[str] = None) -> None:
        """Index Python files from local code using embeddings."""
        logger.info(f"Indexing Python files with embeddings from {self.code_directory}")

        # Get document chunks
        self.code_chunks = index_code_files(self.code_directory)

        if not self.code_chunks:
            self._indexed = True
            return

        # Create embeddings
        try:
            embeddings = create_embeddings_client(model_config, embeddings_model_name)
            self.vector_store = create_vector_store(self.code_chunks, embeddings)
        except Exception as e:
            logger.error(f"Failed to create embeddings: {e}")
            logger.info("Falling back to simple approach without embeddings")

        self._indexed = True
        logger.info("Code indexing completed")

    def _retrieve_relevant_code(self, query: str, k: int = 5) -> List[Document]:
        """Retrieve relevant code sections using vector similarity search."""
        if self.vector_store is None:
            # Fallback to simple approach if vector store creation failed
            if self.code_chunks:
                logger.debug(f"Vector store not available, providing all {len(self.code_chunks)} chunks")
                return self.code_chunks[:k]  # Limit to k chunks
            return []

        try:
            # Use vector similarity search
            docs = self.vector_store.similarity_search(query, k=k)
            logger.debug(f"Found {len(docs)} relevant code sections using vector search")
            return docs
        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            return []

