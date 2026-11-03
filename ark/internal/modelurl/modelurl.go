package modelurl

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
)

const (
	WhitelistedDomainsEnv    = "WHITELISTED_MODEL_DOMAINS"
	AllowedPrivateIPRangeEnv = "ALLOWED_PRIVATE_IP_RANGES"
)

type Rule string

const (
	RuleInvalidURL Rule = "the URL cannot be parsed"
	RuleScheme     Rule = "the URL scheme is not supported"
	RuleHostname   Rule = "the URL has no hostname"
	RuleHTTPS      Rule = "hosts outside the cluster must use HTTPS"
	RuleLoopback   Rule = "loopback addresses are not allowed"
	RuleLinkLocal  Rule = "link-local metadata addresses are not allowed"
	RulePrivateIP  Rule = "private addresses outside ALLOWED_PRIVATE_IP_RANGES are not allowed"
	RuleDomain     Rule = "the host is not in WHITELISTED_MODEL_DOMAINS"
)

type Error struct {
	Rule  Rule
	cause error
}

func (e *Error) Error() string {
	return e.cause.Error()
}

func (e *Error) Unwrap() error {
	return e.cause
}

func RuleOf(err error) (Rule, bool) {
	var urlErr *Error
	if errors.As(err, &urlErr) {
		return urlErr.Rule, true
	}
	return "", false
}

func reject(rule Rule, format string, args ...any) error {
	return &Error{Rule: rule, cause: fmt.Errorf(format, args...)}
}

func Validate(baseURL string) error {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return reject(RuleInvalidURL, "invalid URL format: %w", err)
	}

	if parsed.Scheme == "file" || parsed.Scheme == "data" || parsed.Scheme == "javascript" || parsed.Scheme == "ftp" {
		return reject(RuleScheme, "invalid URL format: unsupported scheme %s://", parsed.Scheme)
	}

	if parsed.Scheme == "" {
		return reject(RuleScheme, "invalid URL format: missing scheme")
	}

	host := parsed.Hostname()
	if host == "" {
		return reject(RuleHostname, "URL must contain a hostname")
	}

	isClusterInternal := strings.HasSuffix(host, ".svc.cluster.local")

	if !isClusterInternal && parsed.Scheme != "https" {
		return reject(RuleHTTPS, "all URLs must use HTTPS; got %s://", parsed.Scheme)
	}

	if ip := net.ParseIP(host); ip != nil {
		if err := validateIPAddress(ip); err != nil {
			return err
		}
	}

	whitelist := whitelistedDomains()
	if len(whitelist) > 0 {
		if !isWhitelistedDomain(host, whitelist) {
			return reject(RuleDomain, "domain not in whitelist: %s (allowed domains: %s)",
				host, strings.Join(whitelist, ", "))
		}
	}

	return nil
}

func whitelistedDomains() []string {
	domains := os.Getenv(WhitelistedDomainsEnv)
	if domains == "" {
		return nil
	}

	lines := strings.Split(domains, "\n")
	var filtered []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			filtered = append(filtered, trimmed)
		}
	}
	return filtered
}

func allowedPrivateIPRanges() []*net.IPNet {
	ranges := os.Getenv(AllowedPrivateIPRangeEnv)
	if ranges == "" {
		return nil
	}

	lines := strings.Split(ranges, "\n")
	cidrs := make([]*net.IPNet, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		_, ipNet, err := net.ParseCIDR(trimmed)
		if err != nil {
			continue
		}
		cidrs = append(cidrs, ipNet)
	}
	return cidrs
}

func validateIPAddress(ip net.IP) error {
	if ip.IsLoopback() {
		return reject(RuleLoopback, "loopback IP addresses are not allowed: %s", ip.String())
	}

	if strings.HasPrefix(ip.String(), "169.254.") {
		return reject(RuleLinkLocal, "metadata service IP range is not allowed: %s", ip.String())
	}

	for _, allowedRange := range allowedPrivateIPRanges() {
		if allowedRange.Contains(ip) {
			return nil
		}
	}

	if ip.IsPrivate() {
		return reject(RulePrivateIP, "private IP addresses are not allowed: %s (use ALLOWED_PRIVATE_IP_RANGES to allow specific ranges)", ip.String())
	}

	return nil
}

func isWhitelistedDomain(hostname string, whitelist []string) bool {
	hostname = strings.ToLower(strings.TrimSpace(hostname))

	for _, pattern := range whitelist {
		if matchDomainPattern(hostname, pattern) {
			return true
		}
	}

	return false
}

func matchDomainPattern(hostname, pattern string) bool {
	pattern = strings.ToLower(strings.TrimSpace(pattern))

	if pattern == "" {
		return false
	}

	if strings.HasPrefix(pattern, "*.") {
		suffix := pattern[2:]
		if hostname == suffix {
			return true
		}
		if strings.HasSuffix(hostname, "."+suffix) {
			return true
		}
		return false
	}

	if strings.Contains(pattern, "*") {
		return matchWildcard(hostname, pattern)
	}

	if hostname == pattern {
		return true
	}

	if strings.HasSuffix(hostname, "."+pattern) {
		return true
	}

	return false
}

func matchWildcard(hostname, pattern string) bool {
	if !strings.Contains(pattern, "*") {
		return hostname == pattern
	}

	parts := strings.Split(pattern, "*")
	if len(parts) != 2 {
		return false
	}

	prefix, suffix := parts[0], parts[1]

	if !strings.HasPrefix(hostname, prefix) {
		return false
	}

	if !strings.HasSuffix(hostname, suffix) {
		return false
	}

	return len(hostname) >= len(prefix)+len(suffix)
}
