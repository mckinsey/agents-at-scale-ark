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
			name:     "TerminateTeamWithResponse",
			err:      &TerminateTeamWithResponse{Response: "done"},
			expected: true,
		},
		{
			name:     "SelectionMade is NOT TerminateTeam",
			err:      &SelectionMade{SelectedName: "researcher"},
			expected: false,
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

func TestTerminateTeamWithResponse(t *testing.T) {
	t.Run("error message is TerminateTeam", func(t *testing.T) {
		err := &TerminateTeamWithResponse{Response: "final answer"}
		if err.Error() != terminateTeamMessage {
			t.Errorf("Error() = %q, expected %q", err.Error(), terminateTeamMessage)
		}
	})

	t.Run("IsTerminateTeam returns true", func(t *testing.T) {
		err := &TerminateTeamWithResponse{Response: "final answer"}
		if !IsTerminateTeam(err) {
			t.Error("IsTerminateTeam() should return true for TerminateTeamWithResponse")
		}
	})

	t.Run("preserves response field", func(t *testing.T) {
		response := "Here is your answer"
		err := &TerminateTeamWithResponse{Response: response}

		var terminateErr *TerminateTeamWithResponse
		if !errors.As(err, &terminateErr) {
			t.Fatal("Expected error to be TerminateTeamWithResponse")
		}

		if terminateErr.Response != response {
			t.Errorf("Response = %q, expected %q", terminateErr.Response, response)
		}
	})
}

func TestToolNotCalledError(t *testing.T) {
	t.Run("error message", func(t *testing.T) {
		err := &ToolNotCalledError{}
		expected := "selector agent did not use the select-next-speaker tool"
		if err.Error() != expected {
			t.Errorf("Error() = %q, expected %q", err.Error(), expected)
		}
	})

	t.Run("is not TerminateTeam", func(t *testing.T) {
		err := &ToolNotCalledError{}
		if IsTerminateTeam(err) {
			t.Error("IsTerminateTeam() should return false for ToolNotCalledError")
		}
	})

	t.Run("is not SelectionMade", func(t *testing.T) {
		err := &ToolNotCalledError{}
		if IsSelectionMade(err) {
			t.Error("IsSelectionMade() should return false for ToolNotCalledError")
		}
	})

	t.Run("errors.As matches", func(t *testing.T) {
		var target *ToolNotCalledError
		err := &ToolNotCalledError{}
		if !errors.As(err, &target) {
			t.Error("errors.As should match ToolNotCalledError")
		}
	})
}

func TestSelectionMade(t *testing.T) {
	t.Run("error message includes selected name", func(t *testing.T) {
		err := &SelectionMade{SelectedName: "analyst"}
		expected := "selection made: analyst"
		if err.Error() != expected {
			t.Errorf("Error() = %q, expected %q", err.Error(), expected)
		}
	})

	t.Run("IsSelectionMade returns true", func(t *testing.T) {
		err := &SelectionMade{SelectedName: "analyst"}
		if !IsSelectionMade(err) {
			t.Error("IsSelectionMade() should return true for SelectionMade")
		}
	})

	t.Run("IsSelectionMade returns false for nil", func(t *testing.T) {
		if IsSelectionMade(nil) {
			t.Error("IsSelectionMade() should return false for nil")
		}
	})

	t.Run("IsSelectionMade returns false for other errors", func(t *testing.T) {
		if IsSelectionMade(errors.New("some error")) {
			t.Error("IsSelectionMade() should return false for non-SelectionMade errors")
		}
	})

	t.Run("IsTerminateTeam returns false for SelectionMade", func(t *testing.T) {
		err := &SelectionMade{SelectedName: "analyst"}
		if IsTerminateTeam(err) {
			t.Error("IsTerminateTeam() should return false for SelectionMade after decoupling")
		}
	})

	t.Run("preserves selected name field", func(t *testing.T) {
		name := "researcher"
		err := &SelectionMade{SelectedName: name}

		var selectionErr *SelectionMade
		if !errors.As(err, &selectionErr) {
			t.Fatal("Expected error to be SelectionMade")
		}

		if selectionErr.SelectedName != name {
			t.Errorf("SelectedName = %q, expected %q", selectionErr.SelectedName, name)
		}
	})
}
