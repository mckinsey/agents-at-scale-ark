/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
)

func TestEvaluatorTypes(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "Evaluator Types Suite")
}

var _ = Describe("Parameter", func() {
	It("should validate required Name field", func() {
		param := Parameter{
			Value: "test-value",
		}
		Expect(param.Name).To(BeEmpty())

		param.Name = "test-param"
		Expect(param.Name).To(Equal("test-param"))
	})

	It("should support direct value", func() {
		param := Parameter{
			Name:  "scope",
			Value: "accuracy,clarity",
		}
		Expect(param.Value).To(Equal("accuracy,clarity"))
		Expect(param.ValueFrom).To(BeNil())
	})

	It("should support ConfigMap reference", func() {
		optional := false
		param := Parameter{
			Name: "tokens",
			ValueFrom: &ValueFromSource{
				ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{
						Name: "eval-config",
					},
					Key:      "tokens",
					Optional: &optional,
				},
			},
		}
		Expect(param.ValueFrom.ConfigMapKeyRef.Name).To(Equal("eval-config"))
		Expect(param.ValueFrom.ConfigMapKeyRef.Key).To(Equal("tokens"))
		Expect(param.ValueFrom.ConfigMapKeyRef.Optional).To(HaveValue(BeFalse()))
	})
})

var _ = Describe("ResourceSelector", func() {
	It("should validate ResourceType enum", func() {
		selector := ResourceSelector{
			ResourceType: "Query",
			APIGroup:     "ark.mckinsey.com",
		}
		Expect(selector.ResourceType).To(Equal("Query"))
	})

	It("should support matchLabels", func() {
		selector := ResourceSelector{
			ResourceType: "Query",
			LabelSelector: metav1.LabelSelector{
				MatchLabels: map[string]string{
					"model":       "gpt-4",
					"environment": "production",
				},
			},
		}
		Expect(selector.LabelSelector.MatchLabels["model"]).To(Equal("gpt-4"))
		Expect(selector.LabelSelector.MatchLabels["environment"]).To(Equal("production"))
	})

	It("should support matchExpressions", func() {
		selector := ResourceSelector{
			ResourceType: "Query",
			LabelSelector: metav1.LabelSelector{
				MatchExpressions: []metav1.LabelSelectorRequirement{
					{
						Key:      "status",
						Operator: metav1.LabelSelectorOpIn,
						Values:   []string{"done"},
					},
				},
			},
		}
		Expect(selector.LabelSelector.MatchExpressions).To(HaveLen(1))
		Expect(selector.LabelSelector.MatchExpressions[0].Key).To(Equal("status"))
		Expect(selector.LabelSelector.MatchExpressions[0].Values).To(ContainElement("done"))
	})
})

// ConfigMapSource tests removed as this type was deprecated in favor of ValueFromSource

// ConfigMapKeySelector tests removed as we now use corev1.ConfigMapKeySelector directly

var _ = Describe("EvaluatorSpec", func() {
	It("should support selector configuration", func() {
		spec := EvaluatorSpec{
			Address: ValueSource{
				Value: "http://evaluator-service:8080",
			},
			Description: "Test evaluator with selector",
			Selector: &ResourceSelector{
				ResourceType: "Query",
				LabelSelector: metav1.LabelSelector{
					MatchLabels: map[string]string{
						"model": "gpt-4",
					},
				},
			},
		}
		Expect(spec.Selector).ToNot(BeNil())
		Expect(spec.Selector.ResourceType).To(Equal("Query"))
		Expect(spec.Selector.LabelSelector.MatchLabels["model"]).To(Equal("gpt-4"))
	})

	It("should support parameters configuration", func() {
		spec := EvaluatorSpec{
			Address: ValueSource{
				Value: "http://evaluator-service:8080",
			},
			Parameters: []Parameter{
				{
					Name:  "scope",
					Value: "accuracy,clarity",
				},
				{
					Name: "tokens",
					ValueFrom: &ValueFromSource{
						ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{
								Name: "eval-config",
							},
							Key: "tokens",
						},
					},
				},
			},
		}
		Expect(spec.Parameters).To(HaveLen(2))
		Expect(spec.Parameters[0].Name).To(Equal("scope"))
		Expect(spec.Parameters[0].Value).To(Equal("accuracy,clarity"))
		Expect(spec.Parameters[1].ValueFrom).ToNot(BeNil())
	})

	It("should work without selector and parameters", func() {
		spec := EvaluatorSpec{
			Address: ValueSource{
				Value: "http://evaluator-service:8080",
			},
			Description: "Simple evaluator",
		}
		Expect(spec.Selector).To(BeNil())
		Expect(spec.Parameters).To(BeEmpty())
	})
})
