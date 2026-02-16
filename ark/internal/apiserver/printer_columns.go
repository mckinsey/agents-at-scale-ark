/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"strings"
	"sync"

	"sigs.k8s.io/yaml"

	"mckinsey.com/ark/internal/apiserver/registry"
)

type crdPrinterColumns struct {
	Spec struct {
		Names struct {
			Kind string `json:"kind"`
		} `json:"names"`
		Versions []struct {
			Name                     string                   `json:"name"`
			AdditionalPrinterColumns []registry.PrinterColumn `json:"additionalPrinterColumns"`
		} `json:"versions"`
	} `json:"spec"`
}

var (
	printerLoadOnce       sync.Once
	printerColumnRegistry *registry.PrinterColumnRegistry
)

func loadPrinterColumns() {
	printerColumnRegistry = registry.NewPrinterColumnRegistry()

	entries, err := crdFS.ReadDir("crds")
	if err != nil {
		return
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}

		data, err := crdFS.ReadFile("crds/" + entry.Name())
		if err != nil {
			continue
		}

		var crd crdPrinterColumns
		if err := yaml.Unmarshal(data, &crd); err != nil {
			continue
		}

		kind := crd.Spec.Names.Kind
		if kind == "" {
			continue
		}

		for _, version := range crd.Spec.Versions {
			if len(version.AdditionalPrinterColumns) > 0 {
				printerColumnRegistry.Register(kind, version.AdditionalPrinterColumns)
				break
			}
		}
	}
}

func GetPrinterColumnRegistry() *registry.PrinterColumnRegistry {
	printerLoadOnce.Do(loadPrinterColumns)
	return printerColumnRegistry
}
