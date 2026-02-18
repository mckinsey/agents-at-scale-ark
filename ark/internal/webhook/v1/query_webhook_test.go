/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/validation"
)

var _ = Describe("Query Webhook", func() {
	var (
		obj       *arkv1alpha1.Query
		oldObj    *arkv1alpha1.Query
		validator *validation.WebhookValidator
	)

	BeforeEach(func() {
		s := runtime.NewScheme()
		Expect(arkv1alpha1.AddToScheme(s)).To(Succeed())

		fakeClient := fake.NewClientBuilder().WithScheme(s).Build()
		validator = &validation.WebhookValidator{
			V: validation.NewValidator(&validation.WebhookLookup{Client: fakeClient}),
		}

		obj = &arkv1alpha1.Query{}
		oldObj = &arkv1alpha1.Query{}
		Expect(validator).NotTo(BeNil())
		Expect(oldObj).NotTo(BeNil())
		Expect(obj).NotTo(BeNil())
	})

	Context("When creating or updating Query under Validating Webhook", func() {
		It("Should require target or selector", func() {
			ctx := context.Background()
			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("target or selector must be specified"))
		})
	})
})
