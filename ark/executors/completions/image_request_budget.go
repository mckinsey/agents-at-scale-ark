package completions

import (
	"fmt"
	"slices"

	"github.com/openai/openai-go"
)

// applyImageRequestBudget bounds the image bytes in one outbound request. The per-turn budget
// only covers images admitted this turn; images already in the history are replayed on every
// subsequent turn, so without this the total grows without bound over a conversation.
//
// Newest messages keep their images: the image the model is being asked about is the one it
// needs. An image that no longer fits is replaced by the same breadcrumb text a dropped image
// gets elsewhere, so the model is never left assuming it saw something it did not.
func applyImageRequestBudget(messages []Message, maxBytes int) []Message {
	if maxBytes <= 0 {
		return messages
	}

	remaining := maxBytes
	var trimmed []Message

	for i := len(messages) - 1; i >= 0; i-- {
		message, changed := trimImageParts(messages[i], maxBytes, &remaining)
		if !changed {
			continue
		}
		if trimmed == nil {
			trimmed = slices.Clone(messages)
		}
		trimmed[i] = message
	}

	if trimmed == nil {
		return messages
	}
	return trimmed
}

func trimImageParts(message Message, maxBytes int, remaining *int) (Message, bool) {
	user := openai.ChatCompletionMessageParamUnion(message).OfUser
	if user == nil {
		return message, false
	}

	parts := user.Content.OfArrayOfContentParts
	if len(parts) == 0 {
		return message, false
	}

	changed := false
	kept := make([]openai.ChatCompletionContentPartUnionParam, 0, len(parts))
	for _, part := range parts {
		image, ok := imagePartSize(part)
		if !ok {
			kept = append(kept, part)
			continue
		}

		if image.Bytes <= *remaining {
			*remaining -= image.Bytes
			kept = append(kept, part)
			continue
		}

		changed = true
		kept = append(kept, openai.TextContentPart(imageDroppedNote(image.MediaType, image.Bytes,
			fmt.Sprintf("the %d byte image budget for this request is exhausted", maxBytes))))
	}

	if !changed {
		return message, false
	}

	rebuilt := openai.UserMessage(kept)
	rebuilt.OfUser.Name = user.Name
	return Message(rebuilt), true
}

func imagePartSize(part openai.ChatCompletionContentPartUnionParam) (ToolResultImage, bool) {
	if part.OfImageURL == nil {
		return ToolResultImage{}, false
	}
	return imageFromDataURL(part.OfImageURL.ImageURL.URL)
}
