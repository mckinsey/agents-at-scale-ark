/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

var _ = Describe("Team CRD schema validation", func() {
	ctx := context.Background()

	newTeam := func(name, strategy, memberType string) *arkv1alpha1.Team {
		return &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Members:  []arkv1alpha1.TeamMember{{Name: "m1", Type: memberType}},
				Strategy: strategy,
			},
		}
	}

	It("accepts a valid strategy and member type", func() {
		team := newTeam("schema-valid-team", "sequential", "agent")
		Expect(k8sClient.Create(ctx, team)).To(Succeed())
		Expect(k8sClient.Delete(ctx, team)).To(Succeed())
	})

	It("rejects an invalid strategy at the apiserver", func() {
		team := newTeam("schema-bad-strategy", "bogus", "agent")
		err := k8sClient.Create(ctx, team)
		Expect(err).To(HaveOccurred())
		Expect(apierrors.IsInvalid(err)).To(BeTrue())
		Expect(err.Error()).To(ContainSubstring("spec.strategy"))
	})

	It("rejects an invalid member type at the apiserver", func() {
		team := newTeam("schema-bad-member-type", "sequential", "robot")
		err := k8sClient.Create(ctx, team)
		Expect(err).To(HaveOccurred())
		Expect(apierrors.IsInvalid(err)).To(BeTrue())
		Expect(err.Error()).To(ContainSubstring("spec.members[0].type"))
	})
})
