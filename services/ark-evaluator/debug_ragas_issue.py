#!/usr/bin/env python3
"""
Debug script to replicate the exact RAGAS IndexError issue
"""

import asyncio
import os
import sys
import logging
from datasets import Dataset

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

async def test_ragas_dataset_issue():
    """Test the exact dataset structure causing IndexError"""

    try:
        from ragas.metrics import answer_relevancy, answer_correctness
        from ragas import evaluate as ev_ragas
        from langchain_openai import AzureChatOpenAI, AzureOpenAIEmbeddings
        from ragas.llms import LangchainLLMWrapper
        from ragas.embeddings import LangchainEmbeddingsWrapper

        # Use your actual Azure config
        llm = AzureChatOpenAI(
            model="gpt-4.1-mini",
            azure_endpoint="https://lxo.openai.azure.com/",
            azure_deployment="gpt-4.1-mini",
            openai_api_version="2024-12-01-preview",
            api_key=os.getenv('AZURE_OPENAI_API_KEY', 'dummy'),
            temperature=0.0
        )

        embeddings = AzureOpenAIEmbeddings(
            model="text-embedding-ada-002",
            azure_endpoint="https://lxo.openai.azure.com/",
            deployment="text-embedding-ada-002",
            openai_api_version="2024-12-01-preview",
            api_key=os.getenv('AZURE_OPENAI_API_KEY', 'dummy')
        )

        # Wrap for RAGAS
        ragas_llm = LangchainLLMWrapper(llm)
        ragas_embeddings = LangchainEmbeddingsWrapper(embeddings)

        # Initialize metrics like our code does
        metrics = []

        # Test relevancy metric
        relevancy_metric = answer_relevancy()
        relevancy_metric.llm = ragas_llm
        relevancy_metric.embeddings = ragas_embeddings
        metrics.append(relevancy_metric)

        # Test correctness metric
        correctness_metric = answer_correctness()
        correctness_metric.llm = ragas_llm
        metrics.append(correctness_metric)

        # Create dataset exactly like our code
        input_text = "What is the square root of 25?"
        output_text = "The square root of 25 is 5"
        contexts = ["No specific context provided"]  # This might be the issue!
        ground_truth = "5"

        dataset_entry = {
            'question': input_text,
            'answer': output_text,
            'contexts': contexts,
            'ground_truth': ground_truth
        }

        dataset = Dataset.from_list([dataset_entry])

        logger.info(f"Dataset columns: {dataset.column_names}")
        logger.info(f"Dataset: {dataset[0]}")
        logger.info(f"Contexts type: {type(contexts)}, value: {contexts}")

        # This is where the IndexError likely occurs
        logger.info("About to call RAGAS evaluate...")
        result = ev_ragas(dataset=dataset, metrics=metrics)
        logger.info(f"RAGAS result: {result}")

        return True

    except Exception as e:
        logger.error(f"Error: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return False

if __name__ == "__main__":
    # You need to set this with your actual Azure OpenAI key
    if not os.getenv('AZURE_OPENAI_API_KEY'):
        print("Set AZURE_OPENAI_API_KEY environment variable")
        sys.exit(1)

    asyncio.run(test_ragas_dataset_issue())