import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import {Tool, ArkApiClient} from '../lib/arkApiClient.js';

interface ToolSelectorProps {
  arkApiClient: ArkApiClient;
  onSelect: (tool: Tool) => void;
  onExit: () => void;
}

export function ToolSelector({
  arkApiClient,
  onSelect,
  onExit,
}: ToolSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    arkApiClient
      .getTools()
      .then((fetchedTools) => {
        setTools(fetchedTools);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch tools');
        setLoading(false);
      });
  }, [arkApiClient]);

  useInput((input: string, key: any) => {
    if (key.escape) {
      onExit();
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => (prev === 0 ? tools.length - 1 : prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => (prev === tools.length - 1 ? 0 : prev + 1));
    } else if (key.return) {
      onSelect(tools[selectedIndex]);
    } else {
      // Handle number keys for quick selection
      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= tools.length) {
        onSelect(tools[num - 1]);
      }
    }
  });

  if (loading) {
    return (
      <Box>
        <Text>Loading tools...</Text>
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

  if (tools.length === 0) {
    return (
      <Box>
        <Text>No tools available</Text>
      </Box>
    );
  }

  const selectedTool = tools[selectedIndex];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold>Select Tool</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Choose a tool to start a conversation with</Text>
      </Box>

      <Box flexDirection="column">
        {tools.map((tool, index) => (
          <Box key={tool.name} marginBottom={0}>
            <Text color={index === selectedIndex ? 'green' : undefined}>
              {index === selectedIndex ? '❯ ' : '  '}
              {index + 1}. {tool.name}
            </Text>
          </Box>
        ))}
      </Box>

      {selectedTool && selectedTool.description && (
        <Box marginTop={1} paddingLeft={2}>
          <Text dimColor wrap="wrap">
            {selectedTool.description}
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Enter to confirm · Number to select · Esc to exit</Text>
      </Box>
    </Box>
  );
}
