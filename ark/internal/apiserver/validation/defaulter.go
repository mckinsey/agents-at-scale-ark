package validation

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"
)

type Defaulter interface {
	Default(ctx context.Context, obj runtime.Object) error
}

type DefaulterFactory func() Defaulter

var defaulterFactories = map[string]DefaulterFactory{
	"Agent": func() Defaulter { return &AgentDefaulter{} },
	"Model": func() Defaulter { return &ModelDefaulter{} },
}

func GetDefaulter(kind string) (Defaulter, bool) {
	factory, ok := defaulterFactories[kind]
	if !ok {
		return nil, false
	}
	return factory(), true
}

func HasDefaulter(kind string) bool {
	_, ok := defaulterFactories[kind]
	return ok
}
