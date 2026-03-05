/* Copyright 2025. McKinsey & Company */

package validation

import (
	"os"
	"testing"
)

// TestMain sets up test environment for the entire validation package.
// This runs once before any tests in this package execute.
//
// Environment setup:
//   - WHITELISTED_MODEL_DOMAINS: Required for ValidateBaseURL tests
//     Simulates the ConfigMap-based whitelist.
func TestMain(m *testing.M) {
	// Set default whitelist for all tests in the validation package
	if err := os.Setenv("WHITELISTED_MODEL_DOMAINS", `api.openai.com
		openai.azure.com
		api.anthropic.com
		generativelanguage.googleapis.com
		amazonaws.com`); err != nil {
		panic(err)
	}

	// Run all tests in the package
	code := m.Run()

	// Exit with the test result code
	os.Exit(code)
}
