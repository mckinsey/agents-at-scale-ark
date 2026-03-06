/* Copyright 2025. McKinsey & Company */

package validation

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	os.Unsetenv("WHITELISTED_MODEL_DOMAINS")
	os.Unsetenv("ALLOWED_PRIVATE_IP_RANGES")
	code := m.Run()
	os.Exit(code)
}
