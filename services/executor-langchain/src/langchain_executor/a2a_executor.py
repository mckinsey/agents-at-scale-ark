"""A2A-native LangChain execution logic."""

import json
import logging
from typing import Any, List, Optional, TypeGuard
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


def _is_dict(value: object) -> TypeGuard[dict[str, Any]]:
    return isinstance(value, dict)


def _is_list(value: object) -> TypeGuard[list[Any]]:
    return isinstance(value, list)


def _extract_native_text(message: object) -> str:
    content = _extract_native_content(message)
    if isinstance(content, str):
        return content
    values: List[str] = []
    for part in content:
        if not _is_dict(part):
            continue
        if part.get("type") == "text":
            text = part.get("text")
            if isinstance(text, str) and text:
                values.append(text)
            continue
        if part.get("type") == "image_url":
            image_url = part.get("image_url")
            if _is_dict(image_url):
                url = image_url.get("url")
                if isinstance(url, str) and url:
                    values.append(url)
    return "\n".join(values).strip()


def _extract_native_content(message: object) -> str | List[dict[str, Any]]:
    if not _is_dict(message):
        return ""
    parts = message.get("parts")
    if not _is_list(parts):
        return ""
    content_parts: List[dict[str, Any]] = []
    has_image = False
    for part in parts:
        if not _is_dict(part):
            continue
        kind = part.get("kind")
        if kind == "text":
            text = part.get("text")
            if isinstance(text, str) and text:
                content_parts.append({"type": "text", "text": text})
            continue
        if kind == "data":
            data_value = part.get("data")
            if data_value is not None:
                text_value = data_value if isinstance(data_value, str) else json.dumps(data_value)
                if isinstance(text_value, str) and text_value:
                    content_parts.append({"type": "text", "text": text_value})
            continue
        if kind == "file":
            file_payload = part.get("file")
            file_map = file_payload if _is_dict(file_payload) else {}
            uri = part.get("uri")
            if not isinstance(uri, str):
                uri = file_map.get("uri")
            mime_type = part.get("mimeType")
            if not isinstance(mime_type, str):
                mime_type = file_map.get("mimeType")
            bytes_value = part.get("bytes")
            if not isinstance(bytes_value, str):
                bytes_value = file_map.get("bytes")
            name = part.get("name")
            if not isinstance(name, str):
                name = file_map.get("name")

            is_image = isinstance(mime_type, str) and mime_type.startswith("image/")
            if is_image:
                image_url = ""
                if isinstance(uri, str) and uri:
                    image_url = uri
                elif isinstance(bytes_value, str) and bytes_value:
                    image_url = f"data:{mime_type};base64,{bytes_value}"
                if image_url:
                    has_image = True
                    content_parts.append({"type": "image_url", "image_url": {"url": image_url}})
                    continue

            if isinstance(uri, str) and uri:
                content_parts.append({"type": "text", "text": uri})
                continue
            if isinstance(name, str) and name:
                content_parts.append({"type": "text", "text": name})
                continue
            if isinstance(bytes_value, str) and bytes_value:
                content_parts.append({"type": "text", "text": "file-bytes"})
            continue

    if not content_parts:
        return ""
    if has_image:
        return content_parts
    text_values = [part["text"] for part in content_parts if part.get("type") == "text" and isinstance(part.get("text"), str)]
    return "\n".join(text_values).strip()


def _extract_native_role(message: object) -> str:
    if not _is_dict(message):
        return "user"
    role = message.get("role")
    if role == "agent":
        return "assistant"
    if role in {"user", "assistant", "system"}:
        return role
    return "user"


def _build_native_langchain_messages(history: object) -> List:
    native_messages: List = []
    if not _is_list(history):
        return native_messages
    for message in history:
        role = _extract_native_role(message)
        content = _extract_native_content(message)
        if not content:
            continue
        if role == "system":
            native_messages.insert(0, SystemMessage(content=_extract_native_text(message)))
        elif role == "assistant":
            native_messages.append(AIMessage(content=content))
        else:
            native_messages.append(HumanMessage(content=content))
    return native_messages


def _build_compat_langchain_messages(history: object) -> List:
    compat_messages: List = []
    if not _is_list(history):
        return compat_messages
    for message in history:
        role = getattr(message, "role", None)
        content = getattr(message, "content", "")
        if role == "system":
            compat_messages.insert(0, SystemMessage(content=content))
        elif role == "assistant":
            compat_messages.append(AIMessage(content=content))
        elif role == "user":
            compat_messages.append(HumanMessage(content=content))
    return compat_messages


class A2ALangChainExecutor(BaseExecutor):
    """Handles A2A-native LangChain execution with optional RAG support."""

    def __init__(self):
        super().__init__("A2ALangChain")
        self.vector_store: Optional[FAISS] = None
        self._indexed = False
        self.code_directory = "."
        self.code_chunks: List[Document] = []

    async def execute_agent(self, request) -> List:
        """Execute agent with A2A-native payload and return response messages."""
        try:
            logger.info(f"Executing A2A LangChain query for agent {request.agent.name}")

            chat_client = create_chat_client(request.agent.model)
            use_rag = should_use_rag(request.agent)

            native_user_input = getattr(request, "a2aUserInput", None)
            native_history = getattr(request, "a2aHistory", [])
            compat_history = getattr(request, "history", [])

            user_content = _extract_native_content(native_user_input)
            user_query_text = _extract_native_text(native_user_input)
            user_input = getattr(request, "userInput", None)
            if not user_content and user_input is not None:
                user_content = user_input.content
            if not user_query_text and user_input is not None:
                user_query_text = user_input.content
            langchain_messages = _build_native_langchain_messages(native_history)
            if len(langchain_messages) == 0:
                langchain_messages = _build_compat_langchain_messages(compat_history)

            rag_context = None
            if use_rag and user_query_text:
                embeddings_model_name = request.agent.labels.get("langchain-embeddings-model") if request.agent.labels else None
                rag_context = await self._get_code_context(user_query_text, request.agent.model, embeddings_model_name)

            if use_rag and rag_context:
                rag_instruction = "Use this code context to answer the user's question accurately!"
                if isinstance(user_content, list):
                    user_content = [{"type": "text", "text": f"🔥 RELEVANT CODE CONTEXT:\n\n{rag_context}\n\n{rag_instruction}\n\nUser: {user_query_text}"}] + user_content
                else:
                    user_content = f"🔥 RELEVANT CODE CONTEXT:\n\n{rag_context}\n\n{rag_instruction}\n\nUser: {user_content}"

            langchain_messages.append(HumanMessage(content=user_content))

            if len(native_history) == 0 and len(compat_history) == 0:
                resolved_prompt = self._resolve_prompt(request.agent)
                langchain_messages.insert(0, SystemMessage(content=resolved_prompt))

            response = await chat_client.ainvoke(langchain_messages)

            if hasattr(response, "content"):
                result = str(response.content)
            else:
                result = str(response)

            response_messages = []
            if result:
                response_messages.append(
                    Message(
                        role="assistant",
                        content=result,
                        name=request.agent.name,
                    )
                )
            else:
                response_messages.append(
                    Message(
                        role="assistant",
                        content="Error: No response generated from LangChain",
                        name=request.agent.name,
                    )
                )

            logger.info(f"A2A LangChain execution completed successfully for agent {request.agent.name}")
            return response_messages

        except Exception as e:
            logger.error(f"Error in A2A LangChain processing: {str(e)}", exc_info=True)
            raise

    async def _get_code_context(self, query_input: str, model_config, embeddings_model_name: Optional[str] = None) -> str:
        """Get relevant code context for a query using embeddings and vector search."""
        logger.info(f"Getting code context for query: {query_input}")

        if not self._indexed:
            await self._index_code(model_config, embeddings_model_name)

        relevant_docs = self._retrieve_relevant_code(query_input, k=5)
        context = build_rag_context(relevant_docs)

        logger.info(f"Generated code context with {len(relevant_docs)} relevant sections")
        return context

    async def _index_code(self, model_config, embeddings_model_name: Optional[str] = None) -> None:
        """Index Python files from local code using embeddings."""
        logger.info(f"Indexing Python files with embeddings from {self.code_directory}")

        self.code_chunks = index_code_files(self.code_directory)

        if not self.code_chunks:
            self._indexed = True
            return

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
            if self.code_chunks:
                logger.debug(f"Vector store not available, providing all {len(self.code_chunks)} chunks")
                return self.code_chunks[:k]
            return []

        try:
            docs = self.vector_store.similarity_search(query, k=k)
            logger.debug(f"Found {len(docs)} relevant code sections using vector search")
            return docs
        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            return []
