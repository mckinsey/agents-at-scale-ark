/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"math/rand/v2"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkmcp "mckinsey.com/ark/internal/mcp"
)

// tokenRenewalSkew is how long before expiry a token is treated as
// stale. Both the staleness check and the renewal requeue derive from
// this single value, so they cannot disagree.
//
// pollInterval defaults to 1m, so the controller normally wakes at least
// once inside this window regardless of the requeue.
const tokenRenewalSkew = 60 * time.Second

// renewalJitterDivisor bounds the random subtraction applied to the
// renewal delay: up to 1/renewalJitterDivisor of the remaining wait.
const renewalJitterDivisor = 10

// isMachineManaged reports whether the controller mints this server's
// token itself, rather than waiting for ark-api to write one after a
// browser flow.
func isMachineManaged(mcpServer *arkv1alpha1.MCPServer) bool {
	return mcpServer.Spec.Authorization != nil && mcpServer.Spec.Authorization.ClientCredentials != nil
}

// ensureToken implements the client-credentials half of the token
// lifecycle: check the current token, mint a replacement when it is
// missing or stale, and write it back to the Secret named by
// tokenSecretRef.
//
// The staleness check is also the idempotency guard — while a token is
// valid this returns early, so a reconcile triggered by the controller's
// own Secret write cannot mint again.
//
// Returns the material the caller should use, and an error describing an
// acquisition failure. A returned error is not a reconcile error — an
// unreachable authorization server should not spin the work queue — but
// the caller must decide whether the remaining material is still usable.
//
// Deferring because discovery has not run yet is not a failure and
// returns a nil error.
func (r *MCPServerReconciler) ensureToken(ctx context.Context, mcpServer *arkv1alpha1.MCPServer, material *authorizationMaterial) (*authorizationMaterial, error) {
	if !isMachineManaged(mcpServer) || material == nil {
		return material, nil
	}
	if !tokenNeedsRenewal(material) {
		return material, nil
	}

	log := logf.FromContext(ctx)
	cc := mcpServer.Spec.Authorization.ClientCredentials

	pkjwt := cc.ClientAuthentication.PrivateKeyJWT
	if pkjwt == nil {
		// Admission enforces exactly-one-of, so this is only reachable on
		// an object written before the CEL rule existed.
		return material, fmt.Errorf("authorization.clientCredentials.clientAuthentication has no method set")
	}

	tokenEndpoint := resolveTokenEndpoint(mcpServer)
	if tokenEndpoint == "" {
		// Discovery has not run yet. The existing 401 path populates
		// status.authorization and the next reconcile has what it needs.
		log.Info("client credentials configured but no token endpoint known yet; deferring to discovery", "server", mcpServer.Name)
		return material, nil
	}

	if mcpServer.Status.Authorization == nil {
		// An explicit spec.tokenEndpoint can produce an endpoint before
		// discovery has ever run. Capabilities come only from discovery,
		// so validating now would report a spurious failure on the first
		// reconcile. Defer instead — the 401 path populates them.
		log.Info("client credentials configured but discovery has not run yet; deferring acquisition", "server", mcpServer.Name)
		return material, nil
	}

	if err := arkmcp.ValidateASCapabilities(capabilitiesFromStatus(mcpServer), cc.ClientAuthentication.PrivateKeyJWT.Algorithm); err != nil {
		return material, err
	}

	keyPEM, err := r.readSigningKey(ctx, mcpServer)
	if err != nil {
		return material, err
	}

	assertion, err := arkmcp.BuildAssertion(arkmcp.AssertionParams{
		ClientID:      cc.ClientID,
		TokenEndpoint: tokenEndpoint,
		Algorithm:     pkjwt.Algorithm,
		KeyID:         pkjwt.KeyID,
		PrivateKeyPEM: keyPEM,
	})
	if err != nil {
		return material, fmt.Errorf("building client assertion: %w", err)
	}

	tr, err := arkmcp.RequestToken(ctx, arkmcp.TokenRequestParams{
		TokenEndpoint: tokenEndpoint,
		ClientID:      cc.ClientID,
		Assertion:     assertion,
		Resource:      resolveTokenResource(mcpServer),
		Scopes:        cc.Scopes,
		Timeout:       parseTimeout(mcpServer.Spec.Timeout),
	})
	if err != nil {
		return material, fmt.Errorf("token request failed: %w", err)
	}

	// expires_in is attacker- or bug-controlled input. Above ~292 years
	// the multiplication overflows int64 and yields a negative duration,
	// putting expiresAt in the past and re-minting on every reconcile.
	// Clamp to something no legitimate access token exceeds.
	const maxExpiresIn = int64(10 * 365 * 24 * 3600)
	var expiresAt *metav1.Time
	if tr.ExpiresIn > 0 {
		seconds := min(tr.ExpiresIn, maxExpiresIn)
		if seconds != tr.ExpiresIn {
			log.Info("authorization server returned an implausible expires_in; clamping",
				"server", mcpServer.Name, "expiresIn", tr.ExpiresIn, "clampedTo", seconds)
		}
		t := metav1.NewTime(time.Now().Add(time.Duration(seconds) * time.Second))
		expiresAt = &t
	}

	if err := r.writeTokenSecret(ctx, mcpServer, tr.AccessToken, expiresAt); err != nil {
		return material, fmt.Errorf("writing token secret: %w", err)
	}

	expiryField := "none"
	if expiresAt != nil {
		expiryField = expiresAt.UTC().Format(time.RFC3339)
	}
	log.Info("acquired access token via client_credentials",
		"server", mcpServer.Name,
		"clientID", cc.ClientID,
		"tokenEndpoint", tokenEndpoint,
		"expiresAt", expiryField,
		"expiresIn", tr.ExpiresIn)

	r.Eventing.MCPServerRecorder().TokenAcquired(ctx, mcpServer, fmt.Sprintf(
		"acquired access token via client_credentials for client %q at %s", cc.ClientID, tokenEndpoint))

	return &authorizationMaterial{
		accessToken: tr.AccessToken,
		expiresAt:   expiresAt,
		secretName:  material.secretName,
	}, nil
}

// hasUsableToken reports whether material carries a token that has not
// already expired. A token inside the renewal skew is still usable — the
// skew is headroom, not an expiry.
func hasUsableToken(material *authorizationMaterial) bool {
	if material == nil || material.accessToken == "" {
		return false
	}
	if material.expiresAt == nil {
		return true
	}
	return time.Now().Before(material.expiresAt.Time)
}

// tokenNeedsRenewal reports whether the current material is missing a
// token or is within tokenRenewalSkew of expiry. A token with no
// recorded expiry is left alone — the 401 path handles rejection.
func tokenNeedsRenewal(material *authorizationMaterial) bool {
	if material.accessToken == "" {
		return true
	}
	if material.expiresAt == nil {
		return false
	}
	return time.Until(material.expiresAt.Time) < tokenRenewalSkew
}

// resolveTokenEndpoint prefers the explicit spec override, falling back
// to what RFC 8414 discovery recorded in status.
func resolveTokenEndpoint(mcpServer *arkv1alpha1.MCPServer) string {
	if ep := mcpServer.Spec.Authorization.ClientCredentials.TokenEndpoint; ep != "" {
		return ep
	}
	if auth := mcpServer.Status.Authorization; auth != nil {
		return auth.TokenEndpoint
	}
	return ""
}

// resolveTokenResource prefers the explicit spec override, falling back
// to the discovered protected-resource identifier and finally the
// resolved address.
func resolveTokenResource(mcpServer *arkv1alpha1.MCPServer) string {
	if res := mcpServer.Spec.Authorization.ClientCredentials.Resource; res != "" {
		return res
	}
	if auth := mcpServer.Status.Authorization; auth != nil && auth.Resource != "" {
		return auth.Resource
	}
	return mcpServer.Status.ResolvedAddress
}

func capabilitiesFromStatus(mcpServer *arkv1alpha1.MCPServer) arkmcp.ASCapabilities {
	auth := mcpServer.Status.Authorization
	if auth == nil {
		return arkmcp.ASCapabilities{}
	}
	return arkmcp.ASCapabilities{
		GrantTypesSupported:                        auth.GrantTypesSupported,
		TokenEndpointAuthMethodsSupported:          auth.TokenEndpointAuthMethodsSupported,
		TokenEndpointAuthSigningAlgValuesSupported: auth.TokenEndpointAuthSigningAlgValuesSupported,
	}
}

// readSigningKey loads the PEM private key through APIReader so the
// manager never caches Secrets. The key material is returned to the
// caller and never stored on the MCPServer.
func (r *MCPServerReconciler) readSigningKey(ctx context.Context, mcpServer *arkv1alpha1.MCPServer) ([]byte, error) {
	pkjwt := mcpServer.Spec.Authorization.ClientCredentials.ClientAuthentication.PrivateKeyJWT
	if pkjwt == nil {
		return nil, fmt.Errorf("authorization.clientCredentials.clientAuthentication has no method set")
	}
	ref := pkjwt.SecretKeyRef
	key := ref.Key
	if key == "" {
		key = "private.pem"
	}

	secret := &corev1.Secret{}
	nn := types.NamespacedName{Name: ref.Name, Namespace: mcpServer.Namespace}
	if err := r.APIReader.Get(ctx, nn, secret); err != nil {
		if apierrors.IsNotFound(err) {
			return nil, fmt.Errorf("signing key Secret %q not found in namespace %q", ref.Name, mcpServer.Namespace)
		}
		return nil, fmt.Errorf("reading signing key Secret %q: %w", ref.Name, err)
	}

	pem, ok := secret.Data[key]
	if !ok || len(pem) == 0 {
		return nil, fmt.Errorf("signing key Secret %q has no non-empty key %q", ref.Name, key)
	}
	return pem, nil
}

// writeTokenSecret updates the access token and expiry in the Secret
// named by tokenSecretRef, creating it when absent. The Secret's name
// never changes, so consumers holding a reference keep working across
// renewals. Existing keys the controller does not own — refresh_token,
// client_id from a prior browser flow — are preserved.
func (r *MCPServerReconciler) writeTokenSecret(ctx context.Context, mcpServer *arkv1alpha1.MCPServer, accessToken string, expiresAt *metav1.Time) error {
	ref := mcpServer.Spec.Authorization.TokenSecretRef
	accessKey := ref.AccessTokenKey
	if accessKey == "" {
		accessKey = "access_token"
	}
	expiresKey := ref.ExpiresAtKey
	if expiresKey == "" {
		expiresKey = "expires_at"
	}

	secret := &corev1.Secret{}
	nn := types.NamespacedName{Name: ref.Name, Namespace: mcpServer.Namespace}
	err := r.APIReader.Get(ctx, nn, secret)

	switch {
	case apierrors.IsNotFound(err):
		secret = &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      ref.Name,
				Namespace: mcpServer.Namespace,
			},
			Type: corev1.SecretTypeOpaque,
			Data: map[string][]byte{},
		}
		applyTokenData(secret, accessKey, expiresKey, accessToken, expiresAt)
		if cerr := controllerutil.SetControllerReference(mcpServer, secret, r.Scheme); cerr != nil {
			return cerr
		}
		return r.Create(ctx, secret)
	case err != nil:
		return err
	default:
		applyTokenData(secret, accessKey, expiresKey, accessToken, expiresAt)
		return r.Update(ctx, secret)
	}
}

func applyTokenData(secret *corev1.Secret, accessKey, expiresKey, accessToken string, expiresAt *metav1.Time) {
	if secret.Data == nil {
		secret.Data = map[string][]byte{}
	}
	secret.Data[accessKey] = []byte(accessToken)
	if expiresAt != nil {
		secret.Data[expiresKey] = []byte(expiresAt.UTC().Format(time.RFC3339))
	} else {
		delete(secret.Data, expiresKey)
	}
}

// reconcileConditionsTokenAcquisitionFailed terminates the reconcile when
// no usable token could be obtained.
//
// Connecting anyway would present no credential and earn a 401, and the
// 401 handler would overwrite this reason with AuthorizationRequired —
// telling the dashboard to offer an authorize button that cannot fix a
// missing signing key. Short-circuiting is what keeps the two failure
// modes distinguishable.
//
// status.authorization.state is deliberately left alone: an acquisition
// failure says nothing about whether the server requires authorization.
func (r *MCPServerReconciler) reconcileConditionsTokenAcquisitionFailed(ctx context.Context, mcpServer *arkv1alpha1.MCPServer, cause error) (ctrl.Result, error) {
	reason := cause.Error()
	logf.FromContext(ctx).Info("token acquisition failed", "server", mcpServer.Name, "reason", reason)

	mcpServer.Status.ToolCount = 0
	changed1 := r.reconcileCondition(mcpServer, MCPServerAvailable, metav1.ConditionFalse, MCPServerReasonTokenAcquisitionFailed, reason)
	changed2 := r.reconcileCondition(mcpServer, MCPServerDiscovering, metav1.ConditionFalse, MCPServerReasonTokenAcquisitionFailed, "Cannot attempt tool discovery without a token")
	if changed1 || changed2 {
		r.Eventing.MCPServerRecorder().TokenAcquisitionFailed(ctx, mcpServer, reason)
		if err := r.updateStatus(ctx, mcpServer); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Back off to the poll interval rather than the renewal timer. An
	// expired token would otherwise floor the requeue at one second and
	// retry against a failing authorization server every second.
	return ctrl.Result{RequeueAfter: getPollInterval(mcpServer.Spec.PollInterval)}, nil
}

// tokenRenewalRequeue returns the interval after which the controller
// should wake to renew, bounded by the configured poll interval. A
// token with no recorded expiry falls back to the poll interval.
//
// Callers must not use this after a failed acquisition: a token already
// inside the skew floors the result at one second, which against a
// failing authorization server becomes a retry every second.
func tokenRenewalRequeue(mcpServer *arkv1alpha1.MCPServer, material *authorizationMaterial) time.Duration {
	poll := getPollInterval(mcpServer.Spec.PollInterval)
	if mcpServer.Spec.Authorization == nil || mcpServer.Spec.Authorization.ClientCredentials == nil {
		return poll
	}
	if material == nil || material.expiresAt == nil {
		return poll
	}

	untilRenewal := time.Until(material.expiresAt.Time) - tokenRenewalSkew

	// Disperse the herd. A fixed authorization-server policy hands every
	// client the same TTL, so servers minted in the same moment — an
	// operator applying a bundle, or the controller restarting and
	// reconciling everything at once — compute an identical renewal
	// instant and then re-synchronise on every cycle thereafter. Skew is
	// headroom before expiry; jitter is what stops the burst.
	if untilRenewal > 0 {
		untilRenewal -= rand.N(untilRenewal/renewalJitterDivisor + 1)
	}

	if untilRenewal < time.Second {
		untilRenewal = time.Second
	}
	if untilRenewal < poll {
		return untilRenewal
	}
	return poll
}
