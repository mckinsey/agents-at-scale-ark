import sys
import types


langchain_module = types.ModuleType("langchain")
langchain_schema_module = types.ModuleType("langchain.schema")
langchain_text_splitter_module = types.ModuleType("langchain.text_splitter")
langchain_community_module = types.ModuleType("langchain_community")
langchain_community_vectorstores_module = types.ModuleType("langchain_community.vectorstores")


class Document:
    def __init__(self, page_content="", metadata=None):
        self.page_content = page_content
        self.metadata = metadata or {}


class HumanMessage:
    def __init__(self, content):
        self.content = content


class AIMessage:
    def __init__(self, content):
        self.content = content


class SystemMessage:
    def __init__(self, content):
        self.content = content


class RecursiveCharacterTextSplitter:
    def __init__(self, *args, **kwargs):
        pass

    def split_documents(self, documents):
        return documents


class FAISS:
    @classmethod
    def from_documents(cls, chunks, embeddings):
        return cls()

    def similarity_search(self, query, k=5):
        return []


langchain_schema_module.Document = Document
langchain_schema_module.HumanMessage = HumanMessage
langchain_schema_module.AIMessage = AIMessage
langchain_schema_module.SystemMessage = SystemMessage
langchain_text_splitter_module.RecursiveCharacterTextSplitter = RecursiveCharacterTextSplitter
langchain_community_vectorstores_module.FAISS = FAISS

langchain_module.schema = langchain_schema_module
langchain_module.text_splitter = langchain_text_splitter_module
langchain_community_module.vectorstores = langchain_community_vectorstores_module

sys.modules.setdefault("langchain", langchain_module)
sys.modules.setdefault("langchain.schema", langchain_schema_module)
sys.modules.setdefault("langchain.text_splitter", langchain_text_splitter_module)
sys.modules.setdefault("langchain_community", langchain_community_module)
sys.modules.setdefault("langchain_community.vectorstores", langchain_community_vectorstores_module)

langchain_openai_module = types.ModuleType("langchain_openai")
langchain_openai_module.ChatOpenAI = object
langchain_openai_module.OpenAIEmbeddings = object
sys.modules.setdefault("langchain_openai", langchain_openai_module)
