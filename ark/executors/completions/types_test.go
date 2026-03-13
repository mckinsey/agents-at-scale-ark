package completions

import (
	"errors"
	"testing"
)

func TestIsTerminateTeam(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name:     "nil error",
			err:      nil,
			expected: false,
		},
		{
			name:     "standard TerminateTeam",
			err:      &TerminateTeam{},
			expected: true,
		},
		{
			name:     "TerminateTeamWithReason",
			err:      NewTerminateTeamWithReason("max iterations"),
			expected: true,
		},
		{
			name:     "wrapped TerminateTeamWithReason",
			err:      errors.Join(NewTerminateTeamWithReason("timeout"), errors.New("context cancelled")),
			expected: true,
		},
		{
			name:     "other error",
			err:      errors.New("some other error"),
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsTerminateTeam(tt.err)
			if result != tt.expected {
				t.Errorf("IsTerminateTeam() = %v, expected %v for error: %v", result, tt.expected, tt.err)
			}
		})
	}
}

func TestTerminateTeamWithReason(t *testing.T) {
	t.Run("error message includes reason", func(t *testing.T) {
		err := NewTerminateTeamWithReason("max depth")
		expectedMsg := "TerminateTeam: max depth"
		if err.Error() != expectedMsg {
			t.Errorf("Error() = %q, expected %q", err.Error(), expectedMsg)
		}
	})

	t.Run("error message without reason", func(t *testing.T) {
		err := NewTerminateTeamWithReason("")
		expectedMsg := "TerminateTeam"
		if err.Error() != expectedMsg {
			t.Errorf("Error() = %q, expected %q", err.Error(), expectedMsg)
		}
	})

	t.Run("preserves reason field", func(t *testing.T) {
		reason := "condition met"
		err := NewTerminateTeamWithReason(reason)

		var terminateErr *TerminateTeamWithReason
		if !errors.As(err, &terminateErr) {
			t.Fatal("Expected error to be TerminateTeamWithReason")
		}

		if terminateErr.Reason != reason {
			t.Errorf("Reason = %q, expected %q", terminateErr.Reason, reason)
		}
	})
}
