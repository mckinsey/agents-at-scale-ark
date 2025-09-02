/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

var _ = Describe("EvaluationController Parameter Logic", func() {
	var reconciler *EvaluationReconciler

	BeforeEach(func() {
		reconciler = &EvaluationReconciler{}
	})

	Describe("mergeParameters", func() {
		It("should merge parameters with evaluation taking precedence", func() {
			evaluatorParams := []arkv1alpha1.Parameter{
				{Name: "tokens", Value: "1000"},
				{Name: "duration", Value: "2m"},
				{Name: "scope", Value: "accuracy,clarity"},
			}

			evaluationParams := []arkv1alpha1.Parameter{
				{Name: "tokens", Value: "5000"},     // Override
				{Name: "temperature", Value: "0.1"}, // New
			}

			merged := reconciler.mergeParameters(evaluatorParams, evaluationParams)

			Expect(merged).To(HaveLen(4))

			// Check that tokens was overridden
			tokenParam := findParam(merged, "tokens")
			Expect(tokenParam).ToNot(BeNil())
			Expect(tokenParam.Value).To(Equal("5000"))

			// Check that duration was preserved from evaluator
			durationParam := findParam(merged, "duration")
			Expect(durationParam).ToNot(BeNil())
			Expect(durationParam.Value).To(Equal("2m"))

			// Check that scope was preserved from evaluator
			scopeParam := findParam(merged, "scope")
			Expect(scopeParam).ToNot(BeNil())
			Expect(scopeParam.Value).To(Equal("accuracy,clarity"))

			// Check that temperature was added from evaluation
			tempParam := findParam(merged, "temperature")
			Expect(tempParam).ToNot(BeNil())
			Expect(tempParam.Value).To(Equal("0.1"))
		})

		It("should handle empty evaluator parameters", func() {
			var evaluatorParams []arkv1alpha1.Parameter

			evaluationParams := []arkv1alpha1.Parameter{
				{Name: "tokens", Value: "5000"},
				{Name: "temperature", Value: "0.1"},
			}

			merged := reconciler.mergeParameters(evaluatorParams, evaluationParams)

			Expect(merged).To(HaveLen(2))
			Expect(findParam(merged, "tokens").Value).To(Equal("5000"))
			Expect(findParam(merged, "temperature").Value).To(Equal("0.1"))
		})

		It("should handle empty evaluation parameters", func() {
			evaluatorParams := []arkv1alpha1.Parameter{
				{Name: "tokens", Value: "1000"},
				{Name: "duration", Value: "2m"},
			}

			var evaluationParams []arkv1alpha1.Parameter

			merged := reconciler.mergeParameters(evaluatorParams, evaluationParams)

			Expect(merged).To(HaveLen(2))
			Expect(findParam(merged, "tokens").Value).To(Equal("1000"))
			Expect(findParam(merged, "duration").Value).To(Equal("2m"))
		})

		It("should handle both parameters being empty", func() {
			var evaluatorParams []arkv1alpha1.Parameter
			var evaluationParams []arkv1alpha1.Parameter

			merged := reconciler.mergeParameters(evaluatorParams, evaluationParams)

			Expect(merged).To(BeEmpty())
		})

		It("should override all evaluator parameters", func() {
			evaluatorParams := []arkv1alpha1.Parameter{
				{Name: "tokens", Value: "1000"},
				{Name: "duration", Value: "2m"},
			}

			evaluationParams := []arkv1alpha1.Parameter{
				{Name: "tokens", Value: "5000"},
				{Name: "duration", Value: "5m"},
			}

			merged := reconciler.mergeParameters(evaluatorParams, evaluationParams)

			Expect(merged).To(HaveLen(2))
			Expect(findParam(merged, "tokens").Value).To(Equal("5000"))
			Expect(findParam(merged, "duration").Value).To(Equal("5m"))
		})
	})

	Describe("convertParametersToMap", func() {
		It("should convert parameters to map", func() {
			params := []arkv1alpha1.Parameter{
				{Name: "tokens", Value: "1000"},
				{Name: "scope", Value: "accuracy,clarity"},
			}

			paramMap := reconciler.convertParametersToMap(context.Background(), params, "test-namespace")

			Expect(paramMap).To(HaveLen(3))
			Expect(paramMap["tokens"]).To(Equal("1000"))
			Expect(paramMap["scope"]).To(Equal("accuracy,clarity"))
			Expect(paramMap["model.namespace"]).To(Equal("test-namespace"))
		})

		It("should handle empty parameters", func() {
			var params []arkv1alpha1.Parameter

			paramMap := reconciler.convertParametersToMap(context.Background(), params, "test-namespace")

			Expect(paramMap).To(HaveLen(1))
			Expect(paramMap["model.namespace"]).To(Equal("test-namespace"))
		})
	})
})

// Helper function to find parameter by name
func findParam(params []arkv1alpha1.Parameter, name string) *arkv1alpha1.Parameter {
	for _, param := range params {
		if param.Name == name {
			return &param
		}
	}
	return nil
}
