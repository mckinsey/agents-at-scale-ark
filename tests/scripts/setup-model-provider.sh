#!/bin/bash

set -e

is_azure_configured() {
    [ -n "${E2E_TEST_AZURE_OPENAI_KEY:-}" ] && [ -n "${E2E_TEST_AZURE_OPENAI_BASE_URL:-}" ]
}

is_openai_configured() {
    [ -n "${E2E_TEST_OPENAI_API_KEY:-}" ]
}

is_bedrock_configured() {
    [ -n "${E2E_TEST_BEDROCK_BEARER_TOKEN:-}" ] && [ -n "${E2E_TEST_BEDROCK_REGION:-}" ]
}

detect_provider() {
    if [ -n "${E2E_TEST_PROVIDER:-}" ]; then
        case "$E2E_TEST_PROVIDER" in
            azure) is_azure_configured && echo "azure" && return ;;
            openai) is_openai_configured && echo "openai" && return ;;
            bedrock) is_bedrock_configured && echo "bedrock" && return ;;
            *) echo "Error: Unknown provider: $E2E_TEST_PROVIDER" >&2; exit 1 ;;
        esac
        echo "Error: Provider '$E2E_TEST_PROVIDER' requested but credentials not configured" >&2
        exit 1
    fi
    
    is_azure_configured && echo "azure" && return
    is_openai_configured && echo "openai" && return
    is_bedrock_configured && echo "bedrock" && return
    
    echo "Error: No model provider credentials configured" >&2
    exit 1
}

get_all_available_providers() {
    local providers=()
    is_azure_configured && providers+=("azure")
    is_openai_configured && providers+=("openai")
    is_bedrock_configured && providers+=("bedrock")
    
    [ ${#providers[@]} -eq 0 ] && echo "[]" && return 1
    printf '%s\n' "${providers[@]}" | jq -R . | jq -s .
}

generate_config() {
    case "$1" in
        azure)
            AZURE_API_VERSION="${E2E_TEST_AZURE_OPENAI_API_VERSION:-2024-12-01-preview}"
            echo "{\"type\":\"azure\",\"model\":\"gpt-4.1-mini\",\"token\":\"$E2E_TEST_AZURE_OPENAI_KEY\",\"url\":\"$E2E_TEST_AZURE_OPENAI_BASE_URL\",\"apiVersion\":\"$AZURE_API_VERSION\"}"
            ;;
        openai)
            OPENAI_BASE_URL="${E2E_TEST_OPENAI_BASE_URL:-https://api.openai.com/v1}"
            echo "{\"type\":\"openai\",\"model\":\"gpt-4o-mini\",\"token\":\"$E2E_TEST_OPENAI_API_KEY\",\"url\":\"$OPENAI_BASE_URL\"}"
            ;;
        bedrock)
            BEDROCK_ENDPOINT="${E2E_TEST_BEDROCK_ENDPOINT_URL:-}"
            echo "{\"type\":\"bedrock\",\"model\":\"anthropic.claude-3-5-sonnet-20241022-v2:0\",\"token\":\"$E2E_TEST_BEDROCK_BEARER_TOKEN\",\"region\":\"$E2E_TEST_BEDROCK_REGION\",\"endpoint\":\"$BEDROCK_ENDPOINT\"}"
            ;;
        *)
            echo "Error: Unknown provider: $1" >&2
            exit 1
            ;;
    esac
}

case "${1:-auto}" in
    auto)
        generate_config $(detect_provider)
        ;;
    list)
        get_all_available_providers
        ;;
    azure|openai|bedrock)
        generate_config $1
        ;;
    *)
        echo "Usage: $0 [auto|list|azure|openai|bedrock]" >&2
        exit 1
        ;;
esac
