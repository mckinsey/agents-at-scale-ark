package validation

import (
	"context"
	"fmt"

	authzv1 "k8s.io/api/authorization/v1"
	"k8s.io/apimachinery/pkg/runtime"
	apirequest "k8s.io/apiserver/pkg/endpoints/request"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// serviceAccountAuthzSkipKey marks a request context where the Query's
// spec.serviceAccount is unchanged from the stored object. Impersonation
// authorization only gates the choice of service account, so when it is not
// changing the check has already been enforced at create (or the last change)
// and must not run again. This lets the controller update its own Query
// (finalizers, status and approval annotations) and lets operators update an
// existing Query (labels, annotations, spec.cancel) without re-proving
// impersonate rights they may not hold.
type serviceAccountAuthzSkipKey struct{}

func withServiceAccountAuthzSkipped(ctx context.Context) context.Context {
	return context.WithValue(ctx, serviceAccountAuthzSkipKey{}, true)
}

func serviceAccountAuthzSkipped(ctx context.Context) bool {
	skip, _ := ctx.Value(serviceAccountAuthzSkipKey{}).(bool)
	return skip
}

// ServiceAccountAuthzContextForUpdate returns a context that skips Query
// service-account authorization when spec.serviceAccount is unchanged between
// oldObj and newObj. It is a no-op for non-Query objects and for updates that
// change the requested service account, which are still fully authorized.
func ServiceAccountAuthzContextForUpdate(ctx context.Context, oldObj, newObj runtime.Object) context.Context {
	oldQuery, ok := oldObj.(*arkv1alpha1.Query)
	if !ok {
		return ctx
	}
	newQuery, ok := newObj.(*arkv1alpha1.Query)
	if !ok {
		return ctx
	}
	if oldQuery.Spec.ServiceAccount == newQuery.Spec.ServiceAccount {
		return withServiceAccountAuthzSkipped(ctx)
	}
	return ctx
}

// ServiceAccountAuthorizer authorizes whether the user issuing an admission
// request may run a Query as the requested service account. It maps directly
// to a Kubernetes SubjectAccessReview for the "impersonate" verb on the target
// serviceaccount, so the same RBAC that governs `kubectl --as` also governs
// which service account a Query may request.
type ServiceAccountAuthorizer struct {
	Client client.Client
}

// requester is the normalized identity of whoever issued the write, resolved
// from either the admission webhook request or the aggregated-apiserver request
// context. fromAdmission records the webhook origin: only there is the
// authorizing client the controller (the impersonator), so only there does the
// controller-capability precondition apply.
type requester struct {
	username      string
	groups        []string
	uid           string
	extra         map[string]authzv1.ExtraValue
	fromAdmission bool
}

// requesterFromContext resolves the write's identity. The admission webhook path
// (etcd mode) carries it via admission.RequestFromContext; the aggregated
// apiserver path (postgres mode) carries it via request.UserFrom, populated by
// delegated authentication. Returns false when neither is present (e.g. internal
// callers with no user), where authorization is skipped.
func requesterFromContext(ctx context.Context) (requester, bool) {
	if req, err := admission.RequestFromContext(ctx); err == nil {
		u := req.UserInfo
		extra := make(map[string]authzv1.ExtraValue, len(u.Extra))
		for k, v := range u.Extra {
			extra[k] = authzv1.ExtraValue(v)
		}
		return requester{username: u.Username, groups: u.Groups, uid: u.UID, extra: extra, fromAdmission: true}, true
	}
	if u, ok := apirequest.UserFrom(ctx); ok {
		extra := make(map[string]authzv1.ExtraValue, len(u.GetExtra()))
		for k, v := range u.GetExtra() {
			extra[k] = authzv1.ExtraValue(v)
		}
		return requester{username: u.GetName(), groups: u.GetGroups(), uid: u.GetUID(), extra: extra}, true
	}
	return requester{}, false
}

// AuthorizeQueryServiceAccount rejects a Query naming a service account its
// requester may not run as. The requester must be authorized to impersonate the
// target service account (the same RBAC that governs `kubectl --as`), checked
// via a SubjectAccessReview so it is enforced identically on the admission
// webhook path (etcd mode) and the aggregated apiserver path (postgres mode).
//
// On the webhook path it additionally runs a controller-capability precondition:
// the controller must itself be able to impersonate the account, so a Query that
// would die at reconcile with a 403 is rejected up front with a clear message.
// That precondition is a SelfSubjectAccessReview against the authorizing client,
// which is only the controller (the impersonator) on the webhook path; in
// apiserver mode the client is the apiserver's own identity, so the precondition
// is skipped there and capability mismatches surface at reconcile as before.
//
// It is a no-op when no service account is requested, when spec.serviceAccount is
// unchanged on update, or when no requester identity is present in context.
func (a *ServiceAccountAuthorizer) AuthorizeQueryServiceAccount(ctx context.Context, query *arkv1alpha1.Query) error {
	if query.Spec.ServiceAccount == "" {
		return nil
	}

	if serviceAccountAuthzSkipped(ctx) {
		return nil
	}

	user, ok := requesterFromContext(ctx)
	if !ok {
		return nil
	}

	if user.fromAdmission {
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
	}

	sar := &authzv1.SubjectAccessReview{
		Spec: authzv1.SubjectAccessReviewSpec{
			User:   user.username,
			Groups: user.groups,
			UID:    user.uid,
			Extra:  user.extra,
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
		return fmt.Errorf("user %q is not authorized to run queries as service account %q in namespace %q", user.username, query.Spec.ServiceAccount, query.Namespace)
	}

	return nil
}
