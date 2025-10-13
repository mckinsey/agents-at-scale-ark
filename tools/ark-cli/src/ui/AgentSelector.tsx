import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import {Agent, ArkApiClient} from '../lib/arkApiClient.js';

interface AgentSelectorProps {
  arkApiClient: ArkApiClient;
  onSelect: (agent: Agent) => void;
  onExit: () => void;
}

export function AgentSelector({
  arkApiClient,
  onSelect,
  onExit,
}: AgentSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    arkApiClient
      .getAgents()
      .then((fetchedAgents) => {
        setAgents(fetchedAgents);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch agents');
        setLoading(false);
      });
  }, [arkApiClient]);

  useInput((input: string, key: any) => {
    if (key.escape) {
      onExit();
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => (prev === 0 ? agents.length - 1 : prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => (prev === agents.length - 1 ? 0 : prev + 1));
    } else if (key.return) {
      onSelect(agents[selectedIndex]);
    } else {
      // Handle number keys for quick selection
      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= agents.length) {
        onSelect(agents[num - 1]);
      }
    }
  });

  if (loading) {
    return (
      <Box>
        <Text>Loading agents...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (agents.length === 0) {
    return (
      <Box>
        <Text>No agents available</Text>
      </Box>
    );
  }

  const selectedAgent = agents[selectedIndex];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold>Select Agent</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Choose an agent to start a conversation with</Text>
      </Box>

      <Box flexDirection="column">
        {agents.map((agent, index) => (
          <Box key={agent.name} marginBottom={0}>
            <Text color={index === selectedIndex ? 'green' : undefined}>
              {index === selectedIndex ? '❯ ' : '  '}
              {index + 1}. {agent.name}
            </Text>
          </Box>
        ))}
      </Box>

      {selectedAgent.description && (
        <Box marginTop={1} paddingLeft={2}>
          <Text dimColor wrap="wrap">
            {selectedAgent.description}
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Enter to confirm · Number to select · Esc to exit</Text>
      </Box>
    </Box>
  );
}
