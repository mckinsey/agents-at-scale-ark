# Team of Teams Test

Tests hierarchical team structures with teams containing other teams as members.

## What it tests
- **Hierarchical Team Structure**: Parent team coordinating multiple sub-teams
- **Nested Team Execution**: Teams as members of other teams
- **Multi-Level Coordination**: 
  - Parent team (sequential strategy)
  - Research sub-team (researcher → analyst)
  - Synthesis sub-team (synthesizer → coordinator)
- **Sequential Workflow**: Sub-teams execute in defined order
- **Comprehensive Response Generation**: Multiple levels of team collaboration

## Team Architecture
```
parent-team (sequential)
├── research-team (sequential)
│   ├── researcher
│   └── analyst
└── synthesis-team (sequential)
    ├── synthesizer
    └── coordinator
```

## Running
```bash
chainsaw test
```

## How the mock LLM validates the chain

Each agent has a unique phrase in its system prompt. The mock LLM matches on that phrase and returns a distinct response (`researcher-output`, `analyst-output`, etc.), with a 500 fallback for any unrecognised agent. The test asserts `response.content == 'coordinator-output'`, which proves coordinator (the last member of the last sub-team) was reached. Any earlier failure in the chain would either error the query (via the 500 fallback) or produce a different final response.

Validates hierarchical team coordination across two levels of nesting.