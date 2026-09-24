/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"fmt"
	"net"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

const (
	EndpointResolutionAddress  = "address"
	EndpointResolutionCardPath = "cardPath"
	EndpointResolutionCardURL  = "cardUrl"
)

const TransportJSONRPC = "JSONRPC"

const (
	ReasonNoAgentCardURL       = "NoAgentCardURL"
	ReasonInvalidAgentCardURL  = "InvalidAgentCardURL"
	ReasonInvalidAddress       = "InvalidAddress"
	ReasonCrossOriginNotAllow  = "CrossOriginNotAllowed"
	ReasonSchemeDowngrade      = "SchemeDowngrade"
	ReasonUnsupportedTransport = "UnsupportedTransport"
)

type ResolvedEndpoint struct {
	URL      string
	Rejected string
	Reason   string
	Message  string
}

var hostnamePattern = regexp.MustCompile(`^[a-zA-Z0-9]([-a-zA-Z0-9]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([-a-zA-Z0-9]*[a-zA-Z0-9])?)*$`)

func UsesCardEndpoint(mode string) bool {
	return mode == EndpointResolutionCardPath || mode == EndpointResolutionCardURL
}

func normalizeTransport(transport string) string {
	replacer := strings.NewReplacer("-", "", "_", "", " ", "")
	return strings.ToUpper(replacer.Replace(strings.TrimSpace(transport)))
}

func CardTransportURL(card *A2AAgentCard) (string, error) {
	if card == nil {
		return "", fmt.Errorf("agent card is nil")
	}

	preferred := ""
	if card.PreferredTransport != nil {
		preferred = *card.PreferredTransport
	}

	if preferred == "" || normalizeTransport(preferred) == TransportJSONRPC {
		return card.URL, nil
	}

	for _, iface := range card.AdditionalInterfaces {
		if normalizeTransport(iface.Transport) == TransportJSONRPC {
			return iface.URL, nil
		}
	}

	declared := []string{preferred}
	for _, iface := range card.AdditionalInterfaces {
		declared = append(declared, iface.Transport)
	}

	return "", fmt.Errorf("agent card declares no %s interface, only %s", TransportJSONRPC, strings.Join(declared, ", "))
}

func ResolveUnsupportedTransport(address string, err error) ResolvedEndpoint {
	return ResolvedEndpoint{
		URL:     strings.TrimSuffix(address, "/"),
		Reason:  ReasonUnsupportedTransport,
		Message: fmt.Sprintf("Ark only speaks %s: %v, using spec.address", TransportJSONRPC, err),
	}
}

func ResolveEndpoint(address, cardURL, mode string, allowedHosts []string) ResolvedEndpoint {
	address = strings.TrimSuffix(address, "/")

	if !UsesCardEndpoint(mode) {
		return ResolvedEndpoint{URL: address, Message: "Using spec.address"}
	}

	parsedAddress, err := url.Parse(address)
	if err != nil || parsedAddress.Host == "" || !isHTTPScheme(parsedAddress.Scheme) {
		return ResolvedEndpoint{
			URL:      address,
			Rejected: cardURL,
			Reason:   ReasonInvalidAddress,
			Message:  fmt.Sprintf("Resolved address %q is not a valid absolute http or https URL, cannot apply the agent card URL", address),
		}
	}

	if cardURL == "" {
		return ResolvedEndpoint{
			URL:     address,
			Reason:  ReasonNoAgentCardURL,
			Message: "Agent card declares no URL, using spec.address",
		}
	}

	parsedCard, err := parseCardURL(cardURL)
	if err != nil {
		return ResolvedEndpoint{
			URL:      address,
			Rejected: cardURL,
			Reason:   ReasonInvalidAgentCardURL,
			Message:  fmt.Sprintf("Agent card URL %q %s, using spec.address", cardURL, err),
		}
	}

	if mode == EndpointResolutionCardPath {
		return resolveCardPath(address, parsedAddress, parsedCard, cardURL)
	}

	return resolveCardURL(address, parsedAddress, parsedCard, cardURL, allowedHosts)
}

func isHTTPScheme(scheme string) bool {
	scheme = strings.ToLower(scheme)
	return scheme == "http" || scheme == "https"
}

func parseCardURL(cardURL string) (*url.URL, error) {
	parsed, err := url.Parse(cardURL)
	if err != nil {
		return nil, fmt.Errorf("is not a valid URL")
	}
	if parsed.Opaque != "" {
		return nil, fmt.Errorf("is not a hierarchical URL")
	}
	if !isHTTPScheme(parsed.Scheme) || parsed.Host == "" {
		return nil, fmt.Errorf("is not an absolute http or https URL")
	}
	if parsed.User != nil {
		return nil, fmt.Errorf("contains userinfo")
	}
	if parsed.Hostname() == "" {
		return nil, fmt.Errorf("has no host")
	}
	return parsed, nil
}

func normalizeCardPath(escapedPath string) (string, error) {
	if escapedPath == "" {
		return "", nil
	}
	if !strings.HasPrefix(escapedPath, "/") {
		escapedPath = "/" + escapedPath
	}
	for _, segment := range strings.Split(escapedPath, "/") {
		if segment == ".." {
			return "", fmt.Errorf("path %q escapes the root", escapedPath)
		}
	}
	cleaned := path.Clean(escapedPath)
	if cleaned == "/" {
		return "", nil
	}
	return cleaned, nil
}

func resolveCardPath(address string, parsedAddress, parsedCard *url.URL, cardURL string) ResolvedEndpoint {
	cardPath, err := normalizeCardPath(parsedCard.EscapedPath())
	if err != nil {
		return ResolvedEndpoint{
			URL:      address,
			Rejected: cardURL,
			Reason:   ReasonInvalidAgentCardURL,
			Message:  fmt.Sprintf("Agent card URL %s, using spec.address", err),
		}
	}
	if cardPath == "" {
		return ResolvedEndpoint{
			URL:     address,
			Message: "Agent card URL declares no path, using spec.address",
		}
	}

	endpoint := url.URL{
		Scheme:  strings.ToLower(parsedAddress.Scheme),
		Host:    parsedAddress.Host,
		RawPath: cardPath,
	}
	endpoint.Path = unescapeOrKeep(cardPath)

	return ResolvedEndpoint{
		URL:     endpoint.String(),
		Message: fmt.Sprintf("Using path %q from the agent card with the host from spec.address", cardPath),
	}
}

func resolveCardURL(address string, parsedAddress, parsedCard *url.URL, cardURL string, allowedHosts []string) ResolvedEndpoint {
	if !sameOrigin(parsedAddress, parsedCard) && !hostAllowed(parsedCard, allowedHosts) {
		return ResolvedEndpoint{
			URL:      address,
			Rejected: cardURL,
			Reason:   ReasonCrossOriginNotAllow,
			Message: fmt.Sprintf("Agent card URL points at %s, which is not the origin of spec.address and is not in spec.allowedEndpointHosts, using spec.address",
				hostPort(parsedCard)),
		}
	}

	if strings.EqualFold(parsedAddress.Scheme, "https") && strings.EqualFold(parsedCard.Scheme, "http") {
		return ResolvedEndpoint{
			URL:      address,
			Rejected: cardURL,
			Reason:   ReasonSchemeDowngrade,
			Message:  fmt.Sprintf("Agent card URL %q downgrades spec.address from https to http, using spec.address", cardURL),
		}
	}

	cardPath := strings.TrimSuffix(parsedCard.EscapedPath(), "/")
	endpoint := url.URL{
		Scheme:  strings.ToLower(parsedCard.Scheme),
		Host:    parsedCard.Host,
		RawPath: cardPath,
	}
	endpoint.Path = unescapeOrKeep(cardPath)

	return ResolvedEndpoint{
		URL:     endpoint.String(),
		Message: fmt.Sprintf("Using agent card URL %q", cardURL),
	}
}

func unescapeOrKeep(escaped string) string {
	unescaped, err := url.PathUnescape(escaped)
	if err != nil {
		return escaped
	}
	return unescaped
}

func effectivePort(u *url.URL) string {
	if port := u.Port(); port != "" {
		return port
	}
	if strings.EqualFold(u.Scheme, "https") {
		return "443"
	}
	return "80"
}

func hostPort(u *url.URL) string {
	return net.JoinHostPort(u.Hostname(), effectivePort(u))
}

func sameOrigin(a, b *url.URL) bool {
	return strings.EqualFold(a.Scheme, b.Scheme) &&
		strings.EqualFold(a.Hostname(), b.Hostname()) &&
		effectivePort(a) == effectivePort(b)
}

func splitAllowedHost(entry string) (host, port string) {
	if !strings.Contains(entry, ":") {
		return entry, ""
	}
	host, port, err := net.SplitHostPort(entry)
	if err != nil {
		return entry, ""
	}
	return host, port
}

func hostMatches(host, pattern string) bool {
	if strings.EqualFold(host, pattern) {
		return true
	}
	if suffix, found := strings.CutPrefix(pattern, "*."); found {
		if label := strings.Index(host, "."); label > 0 && strings.EqualFold(host[label+1:], suffix) {
			return true
		}
	}
	return false
}

func hostAllowed(card *url.URL, allowedHosts []string) bool {
	cardHost := card.Hostname()
	cardPort := effectivePort(card)

	for _, allowed := range allowedHosts {
		allowed = strings.TrimSpace(allowed)
		if allowed == "" {
			continue
		}

		host, port := splitAllowedHost(allowed)
		if port != "" && port != cardPort {
			continue
		}
		if hostMatches(cardHost, host) {
			return true
		}
	}
	return false
}

func ValidateAllowedEndpointHost(entry string) error {
	entry = strings.TrimSpace(entry)
	if entry == "" {
		return fmt.Errorf("must not be empty")
	}

	host, port := splitAllowedHost(entry)
	if strings.Contains(entry, ":") && port == "" {
		return fmt.Errorf("%q is not a valid host or host:port", entry)
	}
	if port != "" {
		number, err := strconv.Atoi(port)
		if err != nil || number < 1 || number > 65535 {
			return fmt.Errorf("%q has an invalid port", entry)
		}
	}

	host = strings.TrimPrefix(host, "*.")
	if host == "" || len(host) > 253 || !hostnamePattern.MatchString(host) {
		return fmt.Errorf("%q is not a valid hostname", entry)
	}
	return nil
}

func RPCEndpoint(a2aServer *arkv1prealpha1.A2AServer) string {
	if a2aServer.Status.LastResolvedEndpoint != "" {
		return a2aServer.Status.LastResolvedEndpoint
	}
	return a2aServer.Status.LastResolvedAddress
}
