/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"encoding/json"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/storage"
)

type RegistryTypeConverter struct{}

func NewRegistryTypeConverter() *RegistryTypeConverter {
	return &RegistryTypeConverter{}
}

var _ storage.TypeConverter = (*RegistryTypeConverter)(nil)

func (c *RegistryTypeConverter) NewObject(kind string) runtime.Object {
	res, ok := GetResourceByKind(kind)
	if !ok {
		return nil
	}
	return res.NewFunc()
}

func (c *RegistryTypeConverter) NewListObject(kind string) runtime.Object {
	res, ok := GetResourceByKind(kind)
	if !ok {
		return nil
	}
	return res.NewListFunc()
}

func (c *RegistryTypeConverter) Encode(obj runtime.Object) ([]byte, error) {
	return json.Marshal(obj)
}

func (c *RegistryTypeConverter) Decode(kind string, data []byte) (runtime.Object, error) {
	obj := c.NewObject(kind)
	if obj == nil {
		return nil, fmt.Errorf("unknown kind: %s", kind)
	}

	if err := json.Unmarshal(data, obj); err != nil {
		return nil, fmt.Errorf("failed to unmarshal: %w", err)
	}

	return obj, nil
}

func (c *RegistryTypeConverter) APIVersion(kind string) string {
	res, ok := GetResourceByKind(kind)
	if !ok {
		return "ark.mckinsey.com/v1alpha1"
	}
	return "ark.mckinsey.com/" + res.Version
}
