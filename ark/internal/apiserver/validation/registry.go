package validation

type ValidatorFactory func(*StorageValidator) Validator

var validatorFactories = map[string]ValidatorFactory{
	"Agent":           func(sv *StorageValidator) Validator { return NewAgentValidator(sv) },
	"Team":            func(sv *StorageValidator) Validator { return NewTeamValidator(sv) },
	"Query":           func(sv *StorageValidator) Validator { return NewQueryValidator(sv) },
	"Tool":            func(sv *StorageValidator) Validator { return NewToolValidator(sv) },
	"Model":           func(sv *StorageValidator) Validator { return NewModelValidator(sv) },
	"MCPServer":       func(sv *StorageValidator) Validator { return NewMCPServerValidator(sv) },
	"Evaluator":       func(sv *StorageValidator) Validator { return NewEvaluatorValidator(sv) },
	"Evaluation":      func(sv *StorageValidator) Validator { return NewEvaluationValidator(sv) },
	"A2AServer":       func(sv *StorageValidator) Validator { return NewA2AServerValidator(sv) },
	"ExecutionEngine": func(sv *StorageValidator) Validator { return NewExecutionEngineValidator(sv) },
}

func GetValidator(kind string, sv *StorageValidator) (Validator, bool) {
	factory, ok := validatorFactories[kind]
	if !ok {
		return nil, false
	}
	return factory(sv), true
}

func HasValidator(kind string) bool {
	_, ok := validatorFactories[kind]
	return ok
}
