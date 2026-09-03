package completions

import (
	"context"
	"fmt"
	"sync"

	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type imagePolicy struct {
	limits toolImageLimits
}

var (
	defaultImagePolicyOnce sync.Once
	cachedDefaultPolicy    *imagePolicy
)

func newImagePolicy(limits toolImageLimits) *imagePolicy {
	return &imagePolicy{limits: limits}
}

// defaultImagePolicy resolves the limits from the environment once, so a tool call does not
// re-read them on every result.
func defaultImagePolicy() *imagePolicy {
	defaultImagePolicyOnce.Do(func() {
		cachedDefaultPolicy = newImagePolicy(toolImageLimitsFromEnv())
	})
	return cachedDefaultPolicy
}

func (p *imagePolicy) NewTurnBudget() *imageTurnBudget {
	return newImageTurnBudget(p.limits.MaxBytesPerTurn)
}

func (p *imagePolicy) ApplyRequestBudget(messages []Message) []Message {
	return applyImageRequestBudget(messages, p.limits.MaxBytesPerRequest)
}

func (p *imagePolicy) NewToolResultAdmitter() *toolImageAdmitter {
	return &toolImageAdmitter{policy: p}
}

// toolImageAdmitter applies the per-image and per-tool-call limits across the images of one
// tool result.
type toolImageAdmitter struct {
	policy   *imagePolicy
	admitted int
}

// Admit reports whether an image may be carried. When it may not, the returned note says why,
// so the model is never told it was shown an image it did not receive.
func (a *toolImageAdmitter) Admit(ctx context.Context, toolName, mediaType string, data []byte) (ToolResultImage, string, bool) {
	log := logf.FromContext(ctx)
	limits := a.policy.limits

	normalized, ok := normalizeImageMediaType(mediaType)
	if !ok {
		log.Info("dropping tool image with unsupported media type", "tool", toolName, "mediaType", mediaType)
		return ToolResultImage{}, imageDroppedNote(mediaType, len(data), "unsupported media type"), false
	}

	if len(data) > limits.MaxBytes {
		log.Info("dropping oversized tool image", "tool", toolName, "mediaType", normalized, "bytes", len(data), "maxBytes", limits.MaxBytes)
		return ToolResultImage{}, imageDroppedNote(normalized, len(data),
			fmt.Sprintf("exceeds the %d byte limit", limits.MaxBytes)), false
	}

	if a.admitted >= limits.MaxPerToolCall {
		log.Info("dropping tool image beyond the per tool call limit", "tool", toolName, "mediaType", normalized, "bytes", len(data), "maxPerToolCall", limits.MaxPerToolCall)
		return ToolResultImage{}, imageDroppedNote(normalized, len(data),
			fmt.Sprintf("image limit of %d per tool call reached", limits.MaxPerToolCall)), false
	}

	a.admitted++
	return newToolResultImage(normalized, data), "", true
}

func imageReturnedNote(mediaType string, bytes int) string {
	return fmt.Sprintf("[image returned: %s, %d bytes]", mediaType, bytes)
}

func imageDroppedNote(mediaType string, bytes int, reason string) string {
	return fmt.Sprintf("[image returned: %s, %d bytes - %s, not shown to the model]", mediaType, bytes, reason)
}
