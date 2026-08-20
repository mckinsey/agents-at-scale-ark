package validation

import (
	"context"
	"fmt"

	authzv1 "k8s.io/api/authorization/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// ServiceAccountAuthorizer authorizes whether the user issuing an admission
// request may run a Query as the requested service account. It maps directly
// to a Kubernetes SubjectAccessReview for the "impersonate" verb on the target
// serviceaccount, so the same RBAC that governs `kubectl --as` also governs
// which service account a Query may request.
type ServiceAccountAuthorizer struct {
	Client client.Client
}

// AuthorizeQueryServiceAccount rejects a Query naming a service account it
// cannot run as. It enforces two conditions: the controller must itself be
// permitted to impersonate the account (impersonation enabled and, if scoped,
// the account listed in allowedServiceAccounts), and the requester must be
// authorized to impersonate it (the same RBAC that governs `kubectl --as`).
// It is a no-op when no service account is requested, or when there is no
// admission request in context (e.g. the apiserver storage validation path,
// where the admission webhook is the enforcement point).
func (a *ServiceAccountAuthorizer) AuthorizeQueryServiceAccount(ctx context.Context, query *arkv1alpha1.Query) error {
	if query.Spec.ServiceAccount == "" {
		return nil
	}

	req, err := admission.RequestFromContext(ctx)
	if err != nil {
		return nil
	}

	// Precondition: the controller must itself be able to impersonate the
	// requested account. When impersonation is disabled (no grant) or the
	// account is outside allowedServiceAccounts, reject at admission with a
	// clear message rather than admitting a Query that fails at reconcile with
	// a 403. SelfSubjectAccessReview needs no extra RBAC (system:basic-user
	// grants it to every authenticated identity) and reflects the grant's
	// resourceNames scoping.
	ssar := &authzv1.SelfSubjectAccessReview{
		Spec: authzv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authzv1.ResourceAttributes{
				Namespace: query.Namespace,
				Verb:      "impersonate",
				Resource:  "serviceaccounts",
				Name:      query.Spec.ServiceAccount,
			},
		},
	}
	if err := a.Client.Create(ctx, ssar); err != nil {
		return fmt.Errorf("failed to check impersonation capability for service account %q in namespace %q: %w", query.Spec.ServiceAccount, query.Namespace, err)
	}
	if !ssar.Status.Allowed {
		return fmt.Errorf("cannot run query as service account %q in namespace %q: controller impersonation is not enabled for it; set rbac.impersonation.enabled=true (and include it in allowedServiceAccounts if scoped)", query.Spec.ServiceAccount, query.Namespace)
	}

	user := req.UserInfo
	extra := make(map[string]authzv1.ExtraValue, len(user.Extra))
	for k, v := range user.Extra {
		extra[k] = authzv1.ExtraValue(v)
	}

	sar := &authzv1.SubjectAccessReview{
		Spec: authzv1.SubjectAccessReviewSpec{
			User:   user.Username,
			Groups: user.Groups,
			UID:    user.UID,
			Extra:  extra,
			ResourceAttributes: &authzv1.ResourceAttributes{
				Namespace: query.Namespace,
				Verb:      "impersonate",
				Resource:  "serviceaccounts",
				Name:      query.Spec.ServiceAccount,
			},
		},
	}

	if err := a.Client.Create(ctx, sar); err != nil {
		return fmt.Errorf("failed to authorize service account %q in namespace %q: %w", query.Spec.ServiceAccount, query.Namespace, err)
	}

	if !sar.Status.Allowed {
		return fmt.Errorf("user %q is not authorized to run queries as service account %q in namespace %q", user.Username, query.Spec.ServiceAccount, query.Namespace)
	}

	return nil
}
