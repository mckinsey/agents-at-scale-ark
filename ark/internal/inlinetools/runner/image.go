/* Copyright 2025. McKinsey & Company */

package runner

import (
	"fmt"
	"os"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// Image configuration the controller stamps on runner pods. There is no
// per-tool override: an author cannot choose an image.
const (
	EnvImageRepository = "ARK_INLINE_RUNNER_IMAGE_REPOSITORY"
	EnvImageTag        = "ARK_INLINE_RUNNER_IMAGE_TAG"
)

// imageVariants maps a language to its image suffix. ts and node share one
// image: Node strips TypeScript types itself.
var imageVariants = map[string]string{
	arkv1alpha1.InlineLanguageBash:       "bash",
	arkv1alpha1.InlineLanguagePython:     "python",
	arkv1alpha1.InlineLanguageNode:       "node",
	arkv1alpha1.InlineLanguageTypeScript: "node",
}

// ImageFor returns the runner image for a language, e.g.
// ghcr.io/org/repo/ark-inline-runner-python:v0.1.0.
func ImageFor(lang string) (string, error) {
	variant, ok := imageVariants[lang]
	if !ok {
		return "", fmt.Errorf("unsupported inline language %q", lang)
	}
	repository, tag := os.Getenv(EnvImageRepository), os.Getenv(EnvImageTag)
	if repository == "" || tag == "" {
		return "", fmt.Errorf("inline runner images are not configured: %s and %s must be set", EnvImageRepository, EnvImageTag)
	}
	return fmt.Sprintf("%s-%s:%s", repository, variant, tag), nil
}
