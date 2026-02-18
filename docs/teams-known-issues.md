# Ark Teams - Known Issues and Limitations

## Graph Strategy

### 1. Single outgoing edge per node
The `graph` strategy allows only one outgoing edge for each agent, since agents can't choose the next conversant and there's no designated next conversant selector. This means the most complex achievable path through the graph is a simple sequence of agents, possibly looping at the tail. This heavily limits the use case for this strategy, and makes the graph editing UX unintuitive.

### 2. Naming confusion between "graph" and "selector" with graph constraints
The pure `graph` strategy is effectively a linear pipeline (one edge per node). The `selector` strategy with `graph.edges` actually supports real graph topologies with multiple outgoing edges and LLM-based selection. This distinction is not obvious from the strategy names or topology editing UX.

## Selector Strategy

### 3. Silent fallback on unrecognized member name ([#1079](https://github.com/mckinsey/agents-at-scale-ark/issues/1079))
When the selector LLM returns a name that doesn't exactly match any team member, the system silently falls back to the first member in the list (or the second, to avoid repeating the previous speaker). There is no warning or indication that the selector's choice was overridden (`team_selector.go:144-153`). This problem is aggravated by the fact that the selector prompt is editable by the user. This silent fallback may also violate the graph topology specified by the user, possibly resulting in unintended behavior.

### 4. Fragile name matching ([#1079](https://github.com/mckinsey/agents-at-scale-ark/issues/1079))
The selector relies on the LLM returning an exact member name string. If the LLM wraps the name in quotes, adds punctuation, or includes extra text (e.g., "I think agent-a should respond next"), the match fails and triggers the silent fallback.

### 5. No-outgoing-edges fallback behavior undefined ([#1083](https://github.com/mckinsey/agents-at-scale-ark/issues/1083))
When a selector team with graph constraints reaches a node that has no outgoing edges, it falls back to the first member in the list. The correct behavior here is still under investigation.

### 6. No cycle detection
If graph edges form an unescapable cycle (A->B->C->A), the execution loops indefinitely unless `maxTurns` is set. There is no built-in detection or safeguard.

### 7. No detection of unreachable team members
If the graph never reaches one or more of the team members, those members never participate in the conversation. There is no built-in detection or safeguard.

### 8. Inability of the selector agent to terminate the conversation
The selector agent cannot terminate the conversation and is forced to always select the next conversant. This means the selector strategy relies on one or more of the team members to terminate the conversation, and limits the selector agent's ability to act as the orchestrator of the conversation. Moreover, if the selector never selects one of the agents with access to the `terminate` tool due to a poorly written selector prompt or an incorrect team topology (issue 7), the conversation can continue indefinitely if max-turns isn't set.

## Sequential and Round-Robin Strategies

### 9. Similarity between the two strategies
The sequential strategy's behavior can be achieved by using the round-robin strategy with the max-turns limit set to the number of team members. This makes the sequential strategy redundant.

### 10. Unreachable conversants for Round-Robin
If the number of max-turns is less than the number of team members, some of the team members never take part in the conversation. There is no visual feedback for this in the UI

# Proposed Solutions

- (1, 2) Remove the Graph strategy, as its use case is too narrow and a very similar behavior can be achieved with the Sequential or Round-Robin strategies.
- (3, 5) When the selector agent fails to select the next conversant, or if no next-conversant can be selected due to the graph topology, the conversation should terminate in a clear error state instead of silently transitioning to the first team member.
- (3, 4) The selection of the next conversant should happen through a dedicated `select-next-conversant` tool. This tool should specify the available next conversants in its schema. The selector prompt should simply instruct the selector on what criteria to use to select the next conversant, not how to express its decision. Moreover, if we transition to the Responses API, we can force the selector agent to always select the next conversant by setting the `tool_choice` parameter to `required` and passing the selector the `select-next-conversant` tool as the only available tool.
- (8) We should add an option to give the selector access to the `terminate` tool. If we decide to implement the `select-next-conversant` tool and leverage the Responses API to force a tool call, we can pass both tools as the only available tools.
- (5) If no next-conversant is available due to how the graph topology is structured, we should terminate the conversation and clearly state the reason for the termination.
- (6, 7) The frontend should show warnings for possibly incorrect team topologies.
- (9) Remove the Sequential strategy, and set the default value for max-turns to the number of team members for the Round-Robin strategy in the frontend.
- (10) Add a validation for the max-turns field, so that it can never be set to less than the number of team members.
