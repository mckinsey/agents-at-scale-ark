# example-declarative-agent

This is a simple implementation of a multi-agent LangGraph application. It provides a OpenAI compliant interface. 

When invoked, it will answer the user's question. If a value for target_language is provided, the agent team will translate the answer into the target language as well before returning the message.

The implementation also conforms the Ark's declarative agent specification, namely:

1) Provides an OpenAI interface i.e., /v1/chat/completions
2) Provides a health endpoint i.e. /health
3) Defines configurable values using Pydantic fields, in an object called Config
4) Accepts LLM configuration values passed in follow the ARK_MODEL_* convention

Also included in this implementation is a simple CI workflow implemented in GitHub Actions that extracts the configurable values, and writes it into the metadata of the image that is built. This allows the values to be read by Ark and exposed for configuration as declarative agents.