package completions

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestHTTPExecutor_resolveRequestBody_EmptyBody(t *testing.T) {
	h := &HTTPExecutor{}
	spec := &arkv1alpha1.HTTPSpec{Body: ""}
	body, err := h.resolveRequestBody(context.Background(), spec, "POST", "default", nil)
	require.NoError(t, err)
	assert.Nil(t, body)
}

func TestHTTPExecutor_resolveRequestBody_GetMethod(t *testing.T) {
	h := &HTTPExecutor{}
	spec := &arkv1alpha1.HTTPSpec{Body: "some-template"}
	body, err := h.resolveRequestBody(context.Background(), spec, "GET", "default", nil)
	require.NoError(t, err)
	assert.Nil(t, body)
}

func TestHTTPExecutor_resolveRequestBody_DeleteMethod(t *testing.T) {
	h := &HTTPExecutor{}
	spec := &arkv1alpha1.HTTPSpec{Body: "some-template"}
	body, err := h.resolveRequestBody(context.Background(), spec, "DELETE", "default", nil)
	require.NoError(t, err)
	assert.Nil(t, body)
}
