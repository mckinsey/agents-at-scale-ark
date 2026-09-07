/* Copyright 2025. McKinsey & Company */

package controller

import (
	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/event"
)

var _ = Describe("dataChangedPredicate", func() {
	configMap := func(data map[string]string, annotation string) *corev1.ConfigMap {
		return &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{
				Name:        "config",
				Namespace:   "default",
				Annotations: map[string]string{"ark.mckinsey.com/description": annotation},
			},
			Data: data,
		}
	}

	It("passes an update that changes ConfigMap data", func() {
		e := event.UpdateEvent{
			ObjectOld: configMap(map[string]string{"value": "old"}, "same"),
			ObjectNew: configMap(map[string]string{"value": "new"}, "same"),
		}
		Expect(dataChangedPredicate().Update(e)).To(BeTrue())
	})

	It("drops an update that only changes ConfigMap metadata", func() {
		e := event.UpdateEvent{
			ObjectOld: configMap(map[string]string{"value": "same"}, "before"),
			ObjectNew: configMap(map[string]string{"value": "same"}, "after"),
		}
		Expect(dataChangedPredicate().Update(e)).To(BeFalse())
	})

	It("passes an update that changes ConfigMap binary data", func() {
		old := configMap(map[string]string{"value": "same"}, "same")
		old.BinaryData = map[string][]byte{"blob": []byte("old")}
		updated := configMap(map[string]string{"value": "same"}, "same")
		updated.BinaryData = map[string][]byte{"blob": []byte("new")}

		Expect(dataChangedPredicate().Update(event.UpdateEvent{ObjectOld: old, ObjectNew: updated})).To(BeTrue())
	})

	It("passes an update that changes Secret data and drops one that does not", func() {
		secret := func(value, annotation string) *corev1.Secret {
			return &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:        "token",
					Namespace:   "default",
					Annotations: map[string]string{"ark.mckinsey.com/description": annotation},
				},
				Data: map[string][]byte{"access_token": []byte(value)},
			}
		}

		Expect(dataChangedPredicate().Update(event.UpdateEvent{
			ObjectOld: secret("old", "same"),
			ObjectNew: secret("new", "same"),
		})).To(BeTrue())

		Expect(dataChangedPredicate().Update(event.UpdateEvent{
			ObjectOld: secret("same", "before"),
			ObjectNew: secret("same", "after"),
		})).To(BeFalse())
	})

	It("passes creates, deletes and updates to unrecognised types", func() {
		Expect(dataChangedPredicate().Create(event.CreateEvent{})).To(BeTrue())
		Expect(dataChangedPredicate().Delete(event.DeleteEvent{})).To(BeTrue())
		Expect(dataChangedPredicate().Generic(event.GenericEvent{})).To(BeTrue())
		Expect(dataChangedPredicate().Update(event.UpdateEvent{
			ObjectOld: &corev1.Pod{},
			ObjectNew: &corev1.Pod{},
		})).To(BeTrue())
	})
})
