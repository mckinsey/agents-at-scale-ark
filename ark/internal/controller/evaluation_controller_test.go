/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

var _ = Describe("Evaluation Controller", func() {
	Context("When creating an Evaluation", func() {
		It("Should attempt to call evaluator service in manual evaluation", func() {
			ctx := context.Background()

			// First create an evaluator that the evaluation can reference
			evaluator := &arkv1alpha1.Evaluator{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-evaluator",
					Namespace: "default",
				},
				Spec: arkv1alpha1.EvaluatorSpec{
					Address: arkv1alpha1.ValueSource{
						Value: "http://evaluator-service:8080",
					},
				},
			}
			Expect(k8sClient.Create(ctx, evaluator)).Should(Succeed())

			// Update the evaluator status to ready
			evaluator.Status.Phase = statusReady
			Expect(k8sClient.Status().Update(ctx, evaluator)).Should(Succeed())

			evaluation := &arkv1alpha1.Evaluation{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-evaluation",
					Namespace: "default",
				},
				Spec: arkv1alpha1.EvaluationSpec{
					Type: "direct",
					Config: arkv1alpha1.EvaluationConfig{
						DirectEvaluationConfig: &arkv1alpha1.DirectEvaluationConfig{
							Input:  "What is 2+2?",
							Output: "4",
						},
					},
					Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
						Name: "test-evaluator",
						Parameters: []arkv1alpha1.Parameter{
							{
								Name:  "scope",
								Value: "correctness",
							},
						},
					},
				},
			}

			Expect(k8sClient.Create(ctx, evaluation)).Should(Succeed())

			evaluationLookupKey := types.NamespacedName{Name: "test-evaluation", Namespace: "default"}

			By("Reconciling the created resource directly")
			controllerReconciler := &EvaluationReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			// First reconcile: initialize to running state
			_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Second reconcile: will attempt to call evaluator service and fail with connection error
			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify the status shows evaluator call failure (since service isn't running in test)
			createdEvaluation := &arkv1alpha1.Evaluation{}
			Expect(k8sClient.Get(ctx, evaluationLookupKey, createdEvaluation)).Should(Succeed())
			Expect(createdEvaluation.Status.Phase).Should(Equal(statusError))
			Expect(createdEvaluation.Status.Message).Should(ContainSubstring("Evaluator call failed"))

			// Cleanup
			Expect(k8sClient.Delete(ctx, createdEvaluation)).Should(Succeed())
			Expect(k8sClient.Delete(ctx, evaluator)).Should(Succeed())
		})

		It("Should fail with missing evaluator", func() {
			ctx := context.Background()

			evaluation := &arkv1alpha1.Evaluation{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-evaluation-no-evaluator",
					Namespace: "default",
				},
				Spec: arkv1alpha1.EvaluationSpec{
					Type: "direct",
					Config: arkv1alpha1.EvaluationConfig{
						DirectEvaluationConfig: &arkv1alpha1.DirectEvaluationConfig{
							Input:  "What is 2+2?",
							Output: "4",
						},
					},
					Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
						Name: "non-existent-evaluator",
					},
				},
			}

			Expect(k8sClient.Create(ctx, evaluation)).Should(Succeed())

			evaluationLookupKey := types.NamespacedName{Name: "test-evaluation-no-evaluator", Namespace: "default"}

			controllerReconciler := &EvaluationReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			// First reconcile: initialize to running state
			_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Second reconcile: should fail due to missing evaluator
			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify error status
			createdEvaluation := &arkv1alpha1.Evaluation{}
			Expect(k8sClient.Get(ctx, evaluationLookupKey, createdEvaluation)).Should(Succeed())
			Expect(createdEvaluation.Status.Phase).Should(Equal(statusError))
			Expect(createdEvaluation.Status.Message).Should(ContainSubstring("not found"))

			// Cleanup
			Expect(k8sClient.Delete(ctx, createdEvaluation)).Should(Succeed())
		})

		It("Should fail with empty input in manual mode", func() {
			ctx := context.Background()

			// Create evaluator first
			evaluator := &arkv1alpha1.Evaluator{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-evaluator-2",
					Namespace: "default",
				},
				Spec: arkv1alpha1.EvaluatorSpec{
					Address: arkv1alpha1.ValueSource{
						Value: "http://evaluator-service:8080",
					},
				},
			}
			Expect(k8sClient.Create(ctx, evaluator)).Should(Succeed())

			// Update the evaluator status to ready
			evaluator.Status.Phase = statusReady
			Expect(k8sClient.Status().Update(ctx, evaluator)).Should(Succeed())

			evaluation := &arkv1alpha1.Evaluation{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-evaluation-empty-input",
					Namespace: "default",
				},
				Spec: arkv1alpha1.EvaluationSpec{
					Type: "direct",
					Config: arkv1alpha1.EvaluationConfig{
						DirectEvaluationConfig: &arkv1alpha1.DirectEvaluationConfig{
							Input:  "", // Empty input
							Output: "4",
						},
					},
					Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
						Name: "test-evaluator-2",
					},
				},
			}

			Expect(k8sClient.Create(ctx, evaluation)).Should(Succeed())

			evaluationLookupKey := types.NamespacedName{Name: "test-evaluation-empty-input", Namespace: "default"}

			controllerReconciler := &EvaluationReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			// First reconcile: initialize to running state
			_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Second reconcile: should fail due to empty input
			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify error status
			createdEvaluation := &arkv1alpha1.Evaluation{}
			Expect(k8sClient.Get(ctx, evaluationLookupKey, createdEvaluation)).Should(Succeed())
			Expect(createdEvaluation.Status.Phase).Should(Equal(statusError))
			Expect(createdEvaluation.Status.Message).Should(ContainSubstring("requires non-empty input"))

			// Cleanup
			Expect(k8sClient.Delete(ctx, createdEvaluation)).Should(Succeed())
			Expect(k8sClient.Delete(ctx, evaluator)).Should(Succeed())
		})

		// GoldenDataset tests are deprecated - CRD has been removed
		/*
			It("Should fail when GoldenDataset does not exist", func() {
				ctx := context.Background()

				evaluator := &arkv1alpha1.Evaluator{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "test-evaluator-dataset-2",
						Namespace: "default",
					},
					Spec: arkv1alpha1.EvaluatorSpec{
						Address: arkv1alpha1.ValueSource{
							Value: "http://evaluator-service:8080",
						},
					},
				}
				Expect(k8sClient.Create(ctx, evaluator)).Should(Succeed())

				evaluator.Status.Phase = statusReady
				Expect(k8sClient.Status().Update(ctx, evaluator)).Should(Succeed())

				evaluation := &arkv1alpha1.Evaluation{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "test-dataset-missing-ref",
						Namespace: "default",
					},
					Spec: arkv1alpha1.EvaluationSpec{
						Type: "direct", // Note: dataset mode is deprecated
						Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
							Name: "test-evaluator-dataset-2",
						},
						// GoldenDatasetRef deprecated and removed
						// GoldenDatasetRef: &arkv1alpha1.GoldenDatasetRef{
						//	Name: "non-existent-dataset",
						// },
					},
				}

				Expect(k8sClient.Create(ctx, evaluation)).Should(Succeed())

				evaluationLookupKey := types.NamespacedName{Name: "test-dataset-missing-ref", Namespace: "default"}

				controllerReconciler := &EvaluationReconciler{
					Client: k8sClient,
					Scheme: k8sClient.Scheme(),
				}

				_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
					NamespacedName: evaluationLookupKey,
				})
				Expect(err).NotTo(HaveOccurred())

				_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
					NamespacedName: evaluationLookupKey,
				})
				Expect(err).NotTo(HaveOccurred())

				createdEvaluation := &arkv1alpha1.Evaluation{}
				Expect(k8sClient.Get(ctx, evaluationLookupKey, createdEvaluation)).Should(Succeed())
				Expect(createdEvaluation.Status.Phase).Should(Equal(statusError))
				Expect(createdEvaluation.Status.Message).Should(ContainSubstring("Failed to fetch GoldenDataset"))

				Expect(k8sClient.Delete(ctx, createdEvaluation)).Should(Succeed())
				Expect(k8sClient.Delete(ctx, evaluator)).Should(Succeed())
			})
		*/

		// Dataset evaluation tests removed - GoldenDataset CRD deprecated
		/*
			It("Should handle dataset evaluation with mock GoldenDataset", func() {
				ctx := context.Background()

				evaluator := &arkv1alpha1.Evaluator{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "test-evaluator-dataset-3",
						Namespace: "default",
					},
					Spec: arkv1alpha1.EvaluatorSpec{
						Address: arkv1alpha1.ValueSource{
							Value: "http://evaluator-service:8080",
						},
					},
				}
				Expect(k8sClient.Create(ctx, evaluator)).Should(Succeed())

				evaluator.Status.Phase = statusReady
				Expect(k8sClient.Status().Update(ctx, evaluator)).Should(Succeed())

				// goldenDataset := &arkv1alpha1.GoldenDataset{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "test-dataset-eval",
						Namespace: "default",
					},
					// Spec: arkv1alpha1.GoldenDatasetSpec{
						Description: "Test dataset for unit tests",
						TestCases: map[string]arkv1alpha1.GoldenTestCase{
							"test-case-1": {
								Input:            "What is 2+2?",
								ExpectedOutput:   "4",
								ExpectedMinScore: "0.8",
								Difficulty:       "easy",
								Category:         "math",
							},
							"test-case-2": {
								Input:            "What is 3*3?",
								ExpectedOutput:   "9",
								ExpectedMinScore: "0.8",
								Difficulty:       "easy",
								Category:         "math",
							},
						},
					},
				}
				Expect(k8sClient.Create(ctx, goldenDataset)).Should(Succeed())

				goldenDataset.Status.Phase = statusReady
				Expect(k8sClient.Status().Update(ctx, goldenDataset)).Should(Succeed())

				evaluation := &arkv1alpha1.Evaluation{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "test-dataset-evaluation",
						Namespace: "default",
					},
					Spec: arkv1alpha1.EvaluationSpec{
						Type: "direct", // Note: dataset mode is deprecated
						Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
							Name: "test-evaluator-dataset-3",
							Parameters: []arkv1alpha1.Parameter{
								{
									Name:  "scope",
									Value: "accuracy",
								},
								{
									Name:  "min-score",
									Value: "0.7",
								},
							},
						},
						// GoldenDatasetRef deprecated and removed
						// GoldenDatasetRef: &arkv1alpha1.GoldenDatasetRef{
						//	Name: "test-dataset-eval",
						// },
					},
				}

				Expect(k8sClient.Create(ctx, evaluation)).Should(Succeed())

				evaluationLookupKey := types.NamespacedName{Name: "test-dataset-evaluation", Namespace: "default"}

				controllerReconciler := &EvaluationReconciler{
					Client: k8sClient,
					Scheme: k8sClient.Scheme(),
				}

				_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
					NamespacedName: evaluationLookupKey,
				})
				Expect(err).NotTo(HaveOccurred())

				_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
					NamespacedName: evaluationLookupKey,
				})
				Expect(err).NotTo(HaveOccurred())

				createdEvaluation := &arkv1alpha1.Evaluation{}
				Expect(k8sClient.Get(ctx, evaluationLookupKey, createdEvaluation)).Should(Succeed())
				Expect(createdEvaluation.Status.Phase).Should(Equal(statusError))
				Expect(createdEvaluation.Status.Message).Should(ContainSubstring("Dataset evaluation failed"))

				Expect(k8sClient.Delete(ctx, createdEvaluation)).Should(Succeed())
				Expect(k8sClient.Delete(ctx, goldenDataset)).Should(Succeed())
				Expect(k8sClient.Delete(ctx, evaluator)).Should(Succeed())
			})
		*/

		/*
			It("Should validate GoldenDataset status is ready", func() {
				ctx := context.Background()

				evaluator := &arkv1alpha1.Evaluator{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "test-evaluator-dataset-4",
						Namespace: "default",
					},
					Spec: arkv1alpha1.EvaluatorSpec{
						Address: arkv1alpha1.ValueSource{
							Value: "http://evaluator-service:8080",
						},
					},
				}
				Expect(k8sClient.Create(ctx, evaluator)).Should(Succeed())

				evaluator.Status.Phase = statusReady
				Expect(k8sClient.Status().Update(ctx, evaluator)).Should(Succeed())

				// goldenDataset := &arkv1alpha1.GoldenDataset{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "test-dataset-not-ready",
						Namespace: "default",
					},
					// Spec: arkv1alpha1.GoldenDatasetSpec{
						Description: "Test dataset not ready",
						TestCases: map[string]arkv1alpha1.GoldenTestCase{
							"test-case-1": {
								Input:            "What is 2+2?",
								ExpectedOutput:   "4",
								ExpectedMinScore: "0.8",
								Difficulty:       "easy",
								Category:         "math",
							},
						},
					},
				}
				Expect(k8sClient.Create(ctx, goldenDataset)).Should(Succeed())

				evaluation := &arkv1alpha1.Evaluation{
					ObjectMeta: metav1.ObjectMeta{
						Name:      "test-dataset-not-ready-eval",
						Namespace: "default",
					},
					Spec: arkv1alpha1.EvaluationSpec{
						Type: "direct", // Note: dataset mode is deprecated
						Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
							Name: "test-evaluator-dataset-4",
						},
						// GoldenDatasetRef deprecated and removed
						// GoldenDatasetRef: &arkv1alpha1.GoldenDatasetRef{
						//	Name: "test-dataset-not-ready",
						// },
					},
				}

				Expect(k8sClient.Create(ctx, evaluation)).Should(Succeed())

				evaluationLookupKey := types.NamespacedName{Name: "test-dataset-not-ready-eval", Namespace: "default"}

				controllerReconciler := &EvaluationReconciler{
					Client: k8sClient,
					Scheme: k8sClient.Scheme(),
				}

				_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
					NamespacedName: evaluationLookupKey,
				})
				Expect(err).NotTo(HaveOccurred())

				_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
					NamespacedName: evaluationLookupKey,
				})
				Expect(err).NotTo(HaveOccurred())

				createdEvaluation := &arkv1alpha1.Evaluation{}
				Expect(k8sClient.Get(ctx, evaluationLookupKey, createdEvaluation)).Should(Succeed())
				Expect(createdEvaluation.Status.Phase).Should(Equal(statusError))
				Expect(createdEvaluation.Status.Message).Should(ContainSubstring("is not ready"))

				Expect(k8sClient.Delete(ctx, createdEvaluation)).Should(Succeed())
				Expect(k8sClient.Delete(ctx, goldenDataset)).Should(Succeed())
				Expect(k8sClient.Delete(ctx, evaluator)).Should(Succeed())
			})
		*/

		It("Should require queryRef for query mode", func() {
			ctx := context.Background()

			evaluator := &arkv1alpha1.Evaluator{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-evaluator-query",
					Namespace: "default",
				},
				Spec: arkv1alpha1.EvaluatorSpec{
					Address: arkv1alpha1.ValueSource{
						Value: "http://evaluator-service:8080",
					},
				},
			}
			Expect(k8sClient.Create(ctx, evaluator)).Should(Succeed())

			evaluator.Status.Phase = statusReady
			Expect(k8sClient.Status().Update(ctx, evaluator)).Should(Succeed())

			evaluation := &arkv1alpha1.Evaluation{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-query-no-ref",
					Namespace: "default",
				},
				Spec: arkv1alpha1.EvaluationSpec{
					Type: "query",
					Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
						Name: "test-evaluator-query",
					},
				},
			}

			Expect(k8sClient.Create(ctx, evaluation)).Should(Succeed())

			evaluationLookupKey := types.NamespacedName{Name: "test-query-no-ref", Namespace: "default"}

			controllerReconciler := &EvaluationReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			createdEvaluation := &arkv1alpha1.Evaluation{}
			Expect(k8sClient.Get(ctx, evaluationLookupKey, createdEvaluation)).Should(Succeed())
			Expect(createdEvaluation.Status.Phase).Should(Equal(statusError))
			Expect(createdEvaluation.Status.Message).Should(ContainSubstring("Query evaluation requires queryRef"))

			Expect(k8sClient.Delete(ctx, createdEvaluation)).Should(Succeed())
			Expect(k8sClient.Delete(ctx, evaluator)).Should(Succeed())
		})

		It("Should fail when Query does not exist", func() {
			ctx := context.Background()

			evaluator := &arkv1alpha1.Evaluator{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-evaluator-query-2",
					Namespace: "default",
				},
				Spec: arkv1alpha1.EvaluatorSpec{
					Address: arkv1alpha1.ValueSource{
						Value: "http://evaluator-service:8080",
					},
				},
			}
			Expect(k8sClient.Create(ctx, evaluator)).Should(Succeed())

			evaluator.Status.Phase = statusReady
			Expect(k8sClient.Status().Update(ctx, evaluator)).Should(Succeed())

			evaluation := &arkv1alpha1.Evaluation{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-query-missing-ref",
					Namespace: "default",
				},
				Spec: arkv1alpha1.EvaluationSpec{
					Type: "query",
					Config: arkv1alpha1.EvaluationConfig{
						QueryBasedEvaluationConfig: &arkv1alpha1.QueryBasedEvaluationConfig{
							QueryRef: &arkv1alpha1.QueryRef{
								Name: "non-existent-query",
							},
						},
					},
					Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
						Name: "test-evaluator-query-2",
					},
				},
			}

			Expect(k8sClient.Create(ctx, evaluation)).Should(Succeed())

			evaluationLookupKey := types.NamespacedName{Name: "test-query-missing-ref", Namespace: "default"}

			controllerReconciler := &EvaluationReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			createdEvaluation := &arkv1alpha1.Evaluation{}
			Expect(k8sClient.Get(ctx, evaluationLookupKey, createdEvaluation)).Should(Succeed())
			Expect(createdEvaluation.Status.Phase).Should(Equal(statusError))
			Expect(createdEvaluation.Status.Message).Should(ContainSubstring("Failed to fetch Query"))

			Expect(k8sClient.Delete(ctx, createdEvaluation)).Should(Succeed())
			Expect(k8sClient.Delete(ctx, evaluator)).Should(Succeed())
		})

		It("Should handle query evaluation with mock Query", func() {
			ctx := context.Background()

			evaluator := &arkv1alpha1.Evaluator{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-evaluator-query-3",
					Namespace: "default",
				},
				Spec: arkv1alpha1.EvaluatorSpec{
					Address: arkv1alpha1.ValueSource{
						Value: "http://evaluator-service:8080",
					},
				},
			}
			Expect(k8sClient.Create(ctx, evaluator)).Should(Succeed())

			evaluator.Status.Phase = statusReady
			Expect(k8sClient.Status().Update(ctx, evaluator)).Should(Succeed())

			query := &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-query",
					Namespace: "default",
				},
				Spec: arkv1alpha1.QuerySpec{
					Input: "What is 2+2?",
				},
				Status: arkv1alpha1.QueryStatus{
					Phase: "done",
					Responses: []arkv1alpha1.Response{
						{
							Content: "4",
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, query)).Should(Succeed())

			query.Status.Phase = statusDone
			Expect(k8sClient.Status().Update(ctx, query)).Should(Succeed())

			evaluation := &arkv1alpha1.Evaluation{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-query-evaluation",
					Namespace: "default",
				},
				Spec: arkv1alpha1.EvaluationSpec{
					Type: "query",
					Config: arkv1alpha1.EvaluationConfig{
						QueryBasedEvaluationConfig: &arkv1alpha1.QueryBasedEvaluationConfig{
							QueryRef: &arkv1alpha1.QueryRef{
								Name: "test-query",
							},
						},
					},
					Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
						Name: "test-evaluator-query-3",
						Parameters: []arkv1alpha1.Parameter{
							{
								Name:  "scope",
								Value: "accuracy",
							},
							{
								Name:  "min-score",
								Value: "0.7",
							},
						},
					},
				},
			}

			Expect(k8sClient.Create(ctx, evaluation)).Should(Succeed())

			evaluationLookupKey := types.NamespacedName{Name: "test-query-evaluation", Namespace: "default"}

			controllerReconciler := &EvaluationReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			createdEvaluation := &arkv1alpha1.Evaluation{}
			Expect(k8sClient.Get(ctx, evaluationLookupKey, createdEvaluation)).Should(Succeed())
			Expect(createdEvaluation.Status.Phase).Should(Equal(statusError))
			Expect(createdEvaluation.Status.Message).Should(ContainSubstring("failed to call evaluator"))

			Expect(k8sClient.Delete(ctx, createdEvaluation)).Should(Succeed())
			Expect(k8sClient.Delete(ctx, query)).Should(Succeed())
			Expect(k8sClient.Delete(ctx, evaluator)).Should(Succeed())
		})

		It("Should validate Query status is done", func() {
			ctx := context.Background()

			evaluator := &arkv1alpha1.Evaluator{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-evaluator-query-4",
					Namespace: "default",
				},
				Spec: arkv1alpha1.EvaluatorSpec{
					Address: arkv1alpha1.ValueSource{
						Value: "http://evaluator-service:8080",
					},
				},
			}
			Expect(k8sClient.Create(ctx, evaluator)).Should(Succeed())

			evaluator.Status.Phase = statusReady
			Expect(k8sClient.Status().Update(ctx, evaluator)).Should(Succeed())

			query := &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-query-not-done",
					Namespace: "default",
				},
				Spec: arkv1alpha1.QuerySpec{
					Input: "What is 2+2?",
				},
				Status: arkv1alpha1.QueryStatus{
					Phase: "running",
					Responses: []arkv1alpha1.Response{
						{
							Content: "4",
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, query)).Should(Succeed())

			evaluation := &arkv1alpha1.Evaluation{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-query-not-done-eval",
					Namespace: "default",
				},
				Spec: arkv1alpha1.EvaluationSpec{
					Type: "query",
					Config: arkv1alpha1.EvaluationConfig{
						QueryBasedEvaluationConfig: &arkv1alpha1.QueryBasedEvaluationConfig{
							QueryRef: &arkv1alpha1.QueryRef{
								Name: "test-query-not-done",
							},
						},
					},
					Evaluator: arkv1alpha1.EvaluationEvaluatorRef{
						Name: "test-evaluator-query-4",
					},
				},
			}

			Expect(k8sClient.Create(ctx, evaluation)).Should(Succeed())

			evaluationLookupKey := types.NamespacedName{Name: "test-query-not-done-eval", Namespace: "default"}

			controllerReconciler := &EvaluationReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: evaluationLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			createdEvaluation := &arkv1alpha1.Evaluation{}
			Expect(k8sClient.Get(ctx, evaluationLookupKey, createdEvaluation)).Should(Succeed())
			Expect(createdEvaluation.Status.Phase).Should(Equal(statusError))
			Expect(createdEvaluation.Status.Message).Should(ContainSubstring("is not complete"))

			Expect(k8sClient.Delete(ctx, createdEvaluation)).Should(Succeed())
			Expect(k8sClient.Delete(ctx, query)).Should(Succeed())
			Expect(k8sClient.Delete(ctx, evaluator)).Should(Succeed())
		})
	})
})
