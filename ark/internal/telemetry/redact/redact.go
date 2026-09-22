/* Copyright 2025. McKinsey & Company */

// Package redact scrubs credentials from strings before they reach spans or logs. Keep in
// sync with ark-api's sensitive_data_filter.py; the shared testdata fixtures enforce parity.
package redact

import "regexp"

const redactedPlaceholder = "[REDACTED]"

var keyAnchoredPattern = regexp.MustCompile(
	`(?i)(?P<key>['"]?(?:access_token|refresh_token|client_secret|code_verifier|authorization|` +
		`password|passwd|api_key|apikey|api-key|secret|client_key|aws_secret_access_key|` +
		`secret_access_key|private_key|cookie|token)['"]?)` +
		`(?P<sep>\s*[=:]\s*)` +
		`(?P<val>'[^']*'|"[^"]*"|(?:[Bb]earer|[Bb]asic)\s+[^\s,;]+|[^\s,;&}'"]+)`,
)

// Matches credentials embedded as URL userinfo (scheme://user:<secret>@host), which the
// key-anchored pattern above cannot see since there is no key=value pair. Scheme and user
// are preserved; only the password segment is replaced. Each delimiter (://, :, @) is
// matched in either its literal or percent-encoded form (%3A/%2F/%40), since the same DSN
// reaches the uvicorn access log still URL-encoded when it arrived as a query parameter,
// while it reaches application-level logs already decoded by the framework.
var userinfoPattern = regexp.MustCompile(
	`(?P<scheme>[A-Za-z][A-Za-z0-9+.-]*(?:://|%3[Aa]%2[Ff]%2[Ff]))` +
		`(?P<user>[^\s@]*?)(?P<colon>:|%3[Aa])(?P<pass>[^\s@]+?)(?P<at>@|%40)`,
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
	if userinfoPattern.MatchString(s) {
		s = userinfoPattern.ReplaceAllString(s, "${scheme}${user}${colon}"+redactedPlaceholder+"${at}")
	}
	if shapePattern.MatchString(s) {
		s = shapePattern.ReplaceAllString(s, redactedPlaceholder)
	}
	return s
}
