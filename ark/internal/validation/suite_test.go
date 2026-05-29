/* Copyright 2025. McKinsey & Company */

package validation

import (
	"os"
	"testing"

	"go.uber.org/goleak"
)

func TestMain(m *testing.M) {
	_ = os.Unsetenv("WHITELISTED_MODEL_DOMAINS")
	_ = os.Unsetenv("ALLOWED_PRIVATE_IP_RANGES")
	goleak.VerifyTestMain(m)
}
