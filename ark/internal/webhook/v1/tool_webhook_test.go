/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/validation"
)

var _ = Describe("Tool Webhook", func() {
	var (
		ctx       context.Context
		validator *validation.WebhookValidator
	)

	BeforeEach(func() {
		ctx = context.Background()

		s := runtime.NewScheme()
		Expect(arkv1alpha1.AddToScheme(s)).To(Succeed())

		fakeClient := fake.NewClientBuilder().WithScheme(s).Build()
		validator = &validation.WebhookValidator{
			V: validation.NewValidator(&validation.WebhookLookup{Client: fakeClient}),
		}
	})

	Context("When validating team tool", func() {
		It("Should validate team tool with team name", func() {
			tool := &arkv1alpha1.Tool{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "team-tool",
					Namespace: "default",
				},
				Spec: arkv1alpha1.ToolSpec{
					Type: validation.ToolTypeTeam,
					Team: &arkv1alpha1.TeamToolRef{
						Name: "test-team",
					},
				},
			}

			warnings, err := validator.ValidateCreate(ctx, tool)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})

		It("Should reject team tool without team name", func() {
			tool := &arkv1alpha1.Tool{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "team-tool",
					Namespace: "default",
				},
				Spec: arkv1alpha1.ToolSpec{
					Type: validation.ToolTypeTeam,
					Team: &arkv1alpha1.TeamToolRef{
						Name: "",
					},
				},
			}

			warnings, err := validator.ValidateCreate(ctx, tool)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("team field is required"))
			Expect(warnings).To(BeEmpty())
		})
	})
})
