/* Copyright 2025. McKinsey & Company */

// Package redact scrubs credentials from strings before they reach spans or logs. Keep in
// sync with ark-api's sensitive_data_filter.py; the shared testdata fixtures enforce parity.
package redact

import (
	"regexp"
	"strings"
)

const redactedPlaceholder = "[REDACTED]"

// cookie is handled by its own pattern below (a Cookie header is a ;-separated list, which
// the shared val group here cannot represent), so it is excluded from this alternation.
var keyAnchoredPattern = regexp.MustCompile(
	`(?i)(?P<key>['"]?(?:access_token|refresh_token|client_secret|code_verifier|authorization|` +
		`password|passwd|api_key|apikey|api-key|secret|client_key|aws_secret_access_key|` +
		`secret_access_key|private_key|token)['"]?)` +
		`(?P<sep>\s*[=:]\s*)` +
		`(?P<val>'[^']*'|"[^"]*"|(?:[Bb]earer|[Bb]asic)\s+[^\s,;]+|[^\s,;&}'"]+)`,
)

// A Cookie/Set-Cookie header is one or more ;-separated pairs (Cookie: a=1; session=SECRET),
// so unlike every other key here the unquoted value must run to end of line rather than
// stopping at the first ';'. The quoted alternatives still take priority and stay bounded by
// their closing quote, so a JSON-embedded cookie value doesn't swallow trailing structure
// (e.g. the closing '}'). Kept separate from keyAnchoredPattern for that reason.
var cookiePattern = regexp.MustCompile(
	`(?i)(?P<key>['"]?(?:cookie|set-cookie)['"]?)(?P<sep>\s*:\s*)(?P<val>'[^']*'|"[^"]*"|[^\r\n]+)`,
)

// userinfoBoundary bounds the user/password segments of a URL's userinfo. It excludes
// whitespace and '@' (the real delimiter) plus URL/JSON structural characters that would
// otherwise let the match run past the credential into unrelated surrounding content — e.g.
// a URL and an email address sharing one whitespace-free JSON blob, where an unbounded class
// would merge the two into a single bogus "redaction" that silently mangles both.
const userinfoBoundary = `[^\s@/?#"',;&}\\]`

// Matches a URL with literal delimiters: scheme://user:<secret>@host. The user/pass groups
// are greedy so an already-percent-encoded character inside the password itself (e.g. a
// literal '%40' standing for an '@' the password needed) is treated as ordinary text and the
// match still runs to the real, final '@' rather than stopping at the first look-alike.
var userinfoLiteralPattern = regexp.MustCompile(
	`(?P<scheme>[A-Za-z][A-Za-z0-9+.-]*://)` +
		`(?P<user>` + userinfoBoundary + `*)(?P<colon>:)(?P<pass>` + userinfoBoundary + `+)(?P<at>@)`,
)

// Matches the same shape after the entire URL has been percent-encoded (e.g. it arrived as a
// query-parameter value): scheme%3a%2f%2fuser%3a<secret>%40host. Kept as a separate pattern
// from the literal one above — mixing literal-or-encoded per delimiter independently (the
// original design) let a URL that was literal everywhere else falsely match against a
// percent-encoded look-alike substring elsewhere in the line. Lazy here (unlike the greedy
// literal pattern) to avoid running past the end of a short encoded query value into
// unrelated, alphanumeric-and-'%'-shaped content later in the same log line.
var userinfoEncodedPattern = regexp.MustCompile(
	`(?P<scheme>[A-Za-z][A-Za-z0-9+.-]*%3[Aa]%2[Ff]%2[Ff])` +
		`(?P<user>` + userinfoBoundary + `*?)(?P<colon>%3[Aa])(?P<pass>` + userinfoBoundary + `+?)(?P<at>%40)`,
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

// Redact replaces credential values in s with [REDACTED]. Idempotent; the MatchString/
// strings.Contains guards keep the common no-match path allocation-free.
//
// The shape pass runs first, deliberately: it matches self-contained anchors (a full
// -----BEGIN...END----- block) that do not depend on delimiter context, whereas the
// key-anchored pass after it has a val group bounded by the first whitespace/comma/etc. If
// the key-anchored pass ran first, a key like private_key= or secret= would eat only the
// "-----BEGIN" prefix off a PEM value (unquoted values stop at the first space) and destroy
// the anchor the shape pass needs to see, redacting only the front of the key and leaking
// the rest verbatim.
func Redact(s string) string {
	if shapePattern.MatchString(s) {
		s = shapePattern.ReplaceAllString(s, redactedPlaceholder)
	}
	if keyAnchoredPattern.MatchString(s) {
		s = keyAnchoredPattern.ReplaceAllString(s, "${key}${sep}"+redactedPlaceholder)
	}
	if cookiePattern.MatchString(s) {
		s = cookiePattern.ReplaceAllString(s, "${key}${sep}"+redactedPlaceholder)
	}
	if strings.Contains(s, "@") || strings.Contains(s, "%40") {
		s = userinfoLiteralPattern.ReplaceAllString(s, "${scheme}${user}${colon}"+redactedPlaceholder+"${at}")
		s = userinfoEncodedPattern.ReplaceAllString(s, "${scheme}${user}${colon}"+redactedPlaceholder+"${at}")
	}
	return s
}
