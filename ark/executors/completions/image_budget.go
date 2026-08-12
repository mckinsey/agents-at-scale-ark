package completions

import (
	"context"
	"fmt"

	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type imageTurnBudget struct {
	total     int
	remaining int
}

func newImageTurnBudget() *imageTurnBudget {
	total := toolImageLimitsFromEnv().MaxBytesPerTurn
	return &imageTurnBudget{total: total, remaining: total}
}

func (b *imageTurnBudget) admit(ctx context.Context, toolName string, images []ToolResultImage) ([]ToolResultImage, string) {
	if len(images) == 0 {
		return nil, ""
	}

	log := logf.FromContext(ctx)
	var kept []ToolResultImage
	var note string
	for _, image := range images {
		if len(image.Data) > b.remaining {
			log.Info("dropping tool image beyond the per turn budget", "tool", toolName, "mediaType", image.MediaType, "bytes", len(image.Data), "remainingBytes", b.remaining, "maxBytesPerTurn", b.total)
			note += fmt.Sprintf("[image returned: %s, %d bytes - the %d byte image budget for this turn is exhausted, not shown to the model]", image.MediaType, len(image.Data), b.total)
			continue
		}
		b.remaining -= len(image.Data)
		kept = append(kept, image)
	}
	return kept, note
}
