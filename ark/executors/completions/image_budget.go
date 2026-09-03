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

func newImageTurnBudget(maxBytes int) *imageTurnBudget {
	return &imageTurnBudget{total: maxBytes, remaining: maxBytes}
}

func (b *imageTurnBudget) admit(ctx context.Context, toolName string, images []ToolResultImage) ([]ToolResultImage, string) {
	if len(images) == 0 {
		return nil, ""
	}

	log := logf.FromContext(ctx)
	kept := make([]ToolResultImage, 0, len(images))
	var note string
	for _, image := range images {
		if image.Bytes > b.remaining {
			log.Info("dropping tool image beyond the per turn budget", "tool", toolName, "mediaType", image.MediaType, "bytes", image.Bytes, "remainingBytes", b.remaining, "maxBytesPerTurn", b.total)
			note += imageDroppedNote(image.MediaType, image.Bytes,
				fmt.Sprintf("the %d byte image budget for this turn is exhausted", b.total))
			continue
		}
		b.remaining -= image.Bytes
		kept = append(kept, image)
	}
	return kept, note
}
