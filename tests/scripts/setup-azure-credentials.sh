#!/bin/bash

source "$(dirname "$0")/defaults.sh"

set -u
echo "{\"token\": \"$E2E_TEST_AZURE_OPENAI_KEY\", \"url\": \"$E2E_TEST_AZURE_OPENAI_BASE_URL\", \"model\": \"$E2E_TEST_AZURE_OPENAI_MODEL\"}"
