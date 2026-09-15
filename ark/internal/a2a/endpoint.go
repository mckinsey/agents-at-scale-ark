/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"fmt"
	"net/url"
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
	ReasonNoAgentCardURL      = "NoAgentCardURL"
	ReasonInvalidAgentCardURL = "InvalidAgentCardURL"
	ReasonInvalidAddress      = "InvalidAddress"
	ReasonCrossOriginNotAllow = "CrossOriginNotAllowed"
)

type ResolvedEndpoint struct {
	URL      string
	Rejected string
	Reason   string
	Message  string
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

func ResolveEndpoint(address, cardURL, mode string, allowedHosts []string) ResolvedEndpoint {
	address = strings.TrimSuffix(address, "/")

	if mode == "" || mode == EndpointResolutionAddress {
		return ResolvedEndpoint{URL: address, Message: "Using spec.address"}
	}

	if cardURL == "" {
		return ResolvedEndpoint{
			URL:     address,
			Reason:  ReasonNoAgentCardURL,
			Message: "Agent card declares no URL, using spec.address",
		}
	}

	parsedCard, err := url.Parse(cardURL)
	if err != nil {
		return ResolvedEndpoint{
			URL:      address,
			Rejected: cardURL,
			Reason:   ReasonInvalidAgentCardURL,
			Message:  fmt.Sprintf("Agent card URL %q is not a valid URL, using spec.address", cardURL),
		}
	}

	parsedAddress, err := url.Parse(address)
	if err != nil || parsedAddress.Host == "" {
		return ResolvedEndpoint{
			URL:      address,
			Rejected: cardURL,
			Reason:   ReasonInvalidAddress,
			Message:  fmt.Sprintf("Resolved address %q is not a valid absolute URL, cannot apply the agent card URL", address),
		}
	}

	if mode == EndpointResolutionCardPath {
		return resolveCardPath(address, parsedAddress, parsedCard)
	}

	return resolveCardURL(address, parsedAddress, parsedCard, cardURL, allowedHosts)
}

func resolveCardPath(address string, parsedAddress, parsedCard *url.URL) ResolvedEndpoint {
	path := strings.TrimSuffix(parsedCard.Path, "/")
	if path == "" {
		return ResolvedEndpoint{
			URL:     address,
			Message: "Agent card URL declares no path, using spec.address",
		}
	}

	endpoint := *parsedAddress
	endpoint.Path = path
	endpoint.RawQuery = ""
	endpoint.Fragment = ""

	return ResolvedEndpoint{
		URL:     endpoint.String(),
		Message: fmt.Sprintf("Using path %q from the agent card with the host from spec.address", path),
	}
}

func resolveCardURL(address string, parsedAddress, parsedCard *url.URL, cardURL string, allowedHosts []string) ResolvedEndpoint {
	scheme := strings.ToLower(parsedCard.Scheme)
	if (scheme != "http" && scheme != "https") || parsedCard.Host == "" {
		return ResolvedEndpoint{
			URL:      address,
			Rejected: cardURL,
			Reason:   ReasonInvalidAgentCardURL,
			Message:  fmt.Sprintf("Agent card URL %q is not an absolute http or https URL, using spec.address", cardURL),
		}
	}

	cardHost := parsedCard.Hostname()
	if !strings.EqualFold(cardHost, parsedAddress.Hostname()) && !hostAllowed(cardHost, allowedHosts) {
		return ResolvedEndpoint{
			URL:      address,
			Rejected: cardURL,
			Reason:   ReasonCrossOriginNotAllow,
			Message: fmt.Sprintf("Agent card URL points at host %q, which is not the host of spec.address and is not in spec.allowedEndpointHosts, using spec.address",
				cardHost),
		}
	}

	endpoint := *parsedCard
	endpoint.RawQuery = ""
	endpoint.Fragment = ""

	return ResolvedEndpoint{
		URL:     strings.TrimSuffix(endpoint.String(), "/"),
		Message: fmt.Sprintf("Using agent card URL %q", cardURL),
	}
}

func hostAllowed(host string, allowedHosts []string) bool {
	for _, allowed := range allowedHosts {
		allowed = strings.TrimSpace(allowed)
		if allowed == "" {
			continue
		}

		if strings.EqualFold(host, allowed) {
			return true
		}

		if suffix, found := strings.CutPrefix(allowed, "*."); found {
			if label := strings.Index(host, "."); label > 0 && strings.EqualFold(host[label+1:], suffix) {
				return true
			}
		}
	}
	return false
}

func RPCEndpoint(a2aServer *arkv1prealpha1.A2AServer) string {
	if a2aServer.Status.LastResolvedEndpoint != "" {
		return a2aServer.Status.LastResolvedEndpoint
	}
	return a2aServer.Status.LastResolvedAddress
}
