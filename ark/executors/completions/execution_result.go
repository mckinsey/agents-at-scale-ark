package completions

import (
	arka2a "mckinsey.com/ark/internal/a2a"
)

type Signal interface {
	SignalType() string
}

type TerminateSignal struct{}

func (s *TerminateSignal) SignalType() string { return "terminate" }

type SelectionMadeSignal struct {
	SelectedName string
}

func (s *SelectionMadeSignal) SignalType() string { return "selection_made" }

type ExecutionResult struct {
	Messages    []Message
	A2AResponse *arka2a.A2AResponse
	Signal      Signal
}
