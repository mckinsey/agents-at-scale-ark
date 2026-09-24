/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	authorizationv1 "k8s.io/api/authorization/v1"
	"k8s.io/client-go/kubernetes"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/webhook"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools"
)

// InlineToolWebhookPath is registered separately from the ordinary Tool
// validation webhook on purpose: this one carries the author permission check,
// so it must not inherit the skip label, the configurable failure policy, or the
// namespace selectors that the convenience webhooks accept.
const InlineToolWebhookPath = "/admit-inline-ark-mckinsey-com-v1alpha1-tool"

// +kubebuilder:webhook:path=/admit-inline-ark-mckinsey-com-v1alpha1-tool,mutating=true,failurePolicy=fail,sideEffects=None,groups=ark.mckinsey.com,resources=tools,verbs=create;update,versions=v1alpha1,name=minlinetool-v1.kb.io,admissionReviewVersions=v1
// +kubebuilder:rbac:groups=authorization.k8s.io,resources=subjectaccessreviews,verbs=create

type inlineToolHandler struct {
	decoder  admission.Decoder
	reviewer inlinetools.Reviewer
}

func (h *inlineToolHandler) Handle(ctx context.Context, req admission.Request) admission.Response {
	tool := &arkv1alpha1.Tool{}
	if err := h.decoder.Decode(req, tool); err != nil {
		return admission.Errored(http.StatusBadRequest, err)
	}

	var oldTool *arkv1alpha1.Tool
	if len(req.OldObject.Raw) > 0 {
		oldTool = &arkv1alpha1.Tool{}
		if err := h.decoder.DecodeRaw(req.OldObject, oldTool); err != nil {
			return admission.Errored(http.StatusBadRequest, err)
		}
	}

	// The request namespace is the server-validated one; a body claiming another
	// namespace must not move the permission check. A mismatch is rejected rather
	// than silently rewritten, matching internal/apiserver/admission.go so both
	// storage backends answer the same request the same way.
	if req.Namespace != "" {
		if tool.Namespace != "" && tool.Namespace != req.Namespace {
			return admission.Denied(fmt.Sprintf("tool namespace %q does not match request namespace %q", tool.Namespace, req.Namespace))
		}
		tool.Namespace = req.Namespace
	}

	subject := &inlinetools.Subject{
		Username: req.UserInfo.Username,
		UID:      req.UserInfo.UID,
		Groups:   req.UserInfo.Groups,
		Extra:    map[string]authorizationv1.ExtraValue{},
	}
	for k, v := range req.UserInfo.Extra {
		subject.Extra[k] = authorizationv1.ExtraValue(v)
	}

	if err := inlinetools.Admit(ctx, tool, oldTool, subject, h.reviewer); err != nil {
		return admission.Denied(err.Error())
	}

	patched, err := json.Marshal(tool)
	if err != nil {
		return admission.Errored(http.StatusInternalServerError, err)
	}
	return admission.PatchResponseFromRaw(req.Object.Raw, patched)
}

func SetupInlineToolWebhookWithManager(mgr ctrl.Manager) error {
	clientset, err := kubernetes.NewForConfig(mgr.GetConfig())
	if err != nil {
		return fmt.Errorf("inline tool admission needs a kube client for SubjectAccessReview: %w", err)
	}
	reviewer := &inlinetools.SARReviewer{Create: clientset.AuthorizationV1().SubjectAccessReviews().Create}
	handler := &inlineToolHandler{decoder: admission.NewDecoder(mgr.GetScheme()), reviewer: reviewer}
	mgr.GetWebhookServer().Register(InlineToolWebhookPath, &webhook.Admission{Handler: handler})
	return nil
}
