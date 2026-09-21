package apiserver

import (
	"context"
	"fmt"

	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	genericrequest "k8s.io/apiserver/pkg/endpoints/request"
	"k8s.io/apiserver/pkg/registry/rest"
	"k8s.io/apiserver/pkg/warning"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/apiserver/registry"
	"mckinsey.com/ark/internal/inlinetools"
	"mckinsey.com/ark/internal/validation"
)

type AdmissionStorage struct {
	*registry.GenericStorage
	validator *validation.Validator
	// inlineReviewer backs the inline author permission. The host apiserver does
	// not run the CRD webhook chain for aggregated resources, so this path has to
	// reach the same decision in-process.
	inlineReviewer inlinetools.Reviewer
}

func NewAdmissionStorage(inner *registry.GenericStorage, validator *validation.Validator, inlineReviewer inlinetools.Reviewer) *AdmissionStorage {
	return &AdmissionStorage{GenericStorage: inner, validator: validator, inlineReviewer: inlineReviewer}
}

// admitInline applies the shared inline decision using the authenticated request
// context. obj is mutated in place with the admitted authorship.
func (s *AdmissionStorage) admitInline(ctx context.Context, obj, old runtime.Object) error {
	tool, ok := obj.(*arkv1alpha1.Tool)
	if !ok {
		return nil
	}
	oldTool, _ := old.(*arkv1alpha1.Tool)

	var subject *inlinetools.Subject
	if u, ok := genericrequest.UserFrom(ctx); ok {
		subject = &inlinetools.Subject{Username: u.GetName(), UID: u.GetUID(), Groups: u.GetGroups(), Extra: map[string]authorizationv1.ExtraValue{}}
		for k, v := range u.GetExtra() {
			subject.Extra[k] = authorizationv1.ExtraValue(v)
		}
	}

	// The request namespace is the server-validated one; a body naming another
	// namespace must not move the permission check.
	if reqInfo, ok := genericrequest.RequestInfoFrom(ctx); ok && reqInfo.Namespace != "" {
		ns := reqInfo.Namespace
		if tool.Namespace != "" && tool.Namespace != ns {
			return fmt.Errorf("tool namespace %q does not match request namespace %q", tool.Namespace, ns)
		}
		tool.Namespace = ns
	}

	return inlinetools.Admit(ctx, tool, oldTool, subject, s.inlineReviewer)
}

// Create order matters: PrepareForCreate, then Ark defaulting/validation, then the generic
// admission callback inside GenericStorage.Create. Ark validators resolve valueFrom refs
// against obj.GetNamespace(), so the object must be formed before they run.
func (s *AdmissionStorage) Create(ctx context.Context, obj runtime.Object, createValidation rest.ValidateObjectFunc, options *metav1.CreateOptions) (runtime.Object, error) {
	if err := registry.PrepareForCreate(ctx, obj); err != nil {
		return nil, err
	}
	if err := s.admitInline(ctx, obj, nil); err != nil {
		return nil, err
	}
	validation.ApplyDefaults(ctx, obj, nil)
	warnings, err := s.validator.Validate(ctx, obj)
	if err != nil {
		return nil, err
	}
	for _, w := range warnings {
		warning.AddWarning(ctx, "", w)
	}
	// Dropping createValidation silently disables all admission-chain policy.
	return s.GenericStorage.Create(ctx, obj, createValidation, options)
}

func (s *AdmissionStorage) Update(ctx context.Context, name string, objInfo rest.UpdatedObjectInfo, createValidation rest.ValidateObjectFunc, updateValidation rest.ValidateObjectUpdateFunc, forceAllowCreate bool, options *metav1.UpdateOptions) (runtime.Object, bool, error) {
	// Each closure runs Ark's defaulting/validation, then chains to the generic
	// validating-admission callback.
	admissionCreate := func(ctx context.Context, obj runtime.Object) error {
		if err := s.admitInline(ctx, obj, nil); err != nil {
			return err
		}
		validation.ApplyDefaults(ctx, obj, nil)
		warnings, err := s.validator.Validate(ctx, obj)
		for _, w := range warnings {
			warning.AddWarning(ctx, "", w)
		}
		if err != nil {
			return err
		}
		if createValidation != nil {
			return createValidation(ctx, obj)
		}
		return nil
	}
	admissionUpdate := func(ctx context.Context, obj, old runtime.Object) error {
		if err := validation.ValidateTransition(old, obj); err != nil {
			return err
		}
		if err := s.admitInline(ctx, obj, old); err != nil {
			return err
		}
		validation.ApplyDefaults(ctx, obj, nil)
		warnings, err := s.validator.Validate(ctx, obj)
		for _, w := range warnings {
			warning.AddWarning(ctx, "", w)
		}
		if err != nil {
			return err
		}
		if updateValidation != nil {
			return updateValidation(ctx, obj, old)
		}
		return nil
	}
	return s.GenericStorage.Update(ctx, name, objInfo, admissionCreate, admissionUpdate, forceAllowCreate, options)
}
