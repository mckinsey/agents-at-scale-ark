/* Copyright 2025. McKinsey & Company */

// Package redact scrubs credentials from strings before they reach spans or logs. Keep in
// sync with ark-api's sensitive_data_filter.py; the shared testdata fixtures enforce parity.
package redact

import "regexp"

const redactedPlaceholder = "[REDACTED]"

var keyAnchoredPattern = regexp.MustCompile(
	`(?i)(?P<key>['"]?(?:access_token|refresh_token|client_secret|code_verifier|authorization)['"]?)` +
		`(?P<sep>\s*[=:]\s*)` +
		`(?P<val>'[^']*'|"[^"]*"|(?:[Bb]earer|[Bb]asic)\s+[^\s,;]+|[^\s,;&}'"]+)`,
)

// Case-sensitive by design: the prefixes are what keep false positives low.
var shapePattern = regexp.MustCompile(
	`eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` + // JWT
		`|sk-(?:ant-|proj-)?[A-Za-z0-9_-]{40,}` + // OpenAI/Anthropic
		`|gh[pousr]_[A-Za-z0-9]{36,}` + // GitHub
		`|github_pat_[A-Za-z0-9_]{22,}` + // GitHub PAT
		`|(?:AKIA|ASIA)[0-9A-Z]{16}` + // AWS
		`|AIza[0-9A-Za-z_-]{35}` + // Google
		`|xox[baprs]-[A-Za-z0-9-]{10,}` + // Slack
		`|(?:sk|rk)_live_[A-Za-z0-9]{16,}` + // Stripe
		`|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[A-Za-z0-9._~+/=-]{16,}` + // McKinsey Service Credential (uuid:token)
		`|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----`, // PEM
)

// Redact replaces credential values in s with [REDACTED]. Idempotent; the MatchString
// guards keep the common no-match path allocation-free.
func Redact(s string) string {
	if keyAnchoredPattern.MatchString(s) {
		s = keyAnchoredPattern.ReplaceAllString(s, "${key}${sep}"+redactedPlaceholder)
	}
	if shapePattern.MatchString(s) {
		s = shapePattern.ReplaceAllString(s, redactedPlaceholder)
	}
	return s
}
