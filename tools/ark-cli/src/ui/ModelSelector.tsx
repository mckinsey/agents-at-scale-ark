import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import {Model, ArkApiClient} from '../lib/arkApiClient.js';

interface ModelSelectorProps {
  arkApiClient: ArkApiClient;
  onSelect: (model: Model) => void;
  onExit: () => void;
}

export function ModelSelector({
  arkApiClient,
  onSelect,
  onExit,
}: ModelSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    arkApiClient
      .getModels()
      .then((fetchedModels) => {
        setModels(fetchedModels);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch models');
        setLoading(false);
      });
  }, [arkApiClient]);

  useInput((input: string, key: any) => {
    if (key.escape) {
      onExit();
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => (prev === 0 ? models.length - 1 : prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => (prev === models.length - 1 ? 0 : prev + 1));
    } else if (key.return) {
      onSelect(models[selectedIndex]);
    } else {
      // Handle number keys for quick selection
      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= models.length) {
        onSelect(models[num - 1]);
      }
    }
  });

  if (loading) {
    return (
      <Box>
        <Text>Loading models...</Text>
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

  if (models.length === 0) {
    return (
      <Box>
        <Text>No models available</Text>
      </Box>
    );
  }

  const selectedModel = models[selectedIndex];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold>Select Model</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Choose a model to start a conversation with</Text>
      </Box>

      <Box flexDirection="column">
        {models.map((model, index) => (
          <Box key={model.name} marginBottom={0}>
            <Text color={index === selectedIndex ? 'green' : undefined}>
              {index === selectedIndex ? '❯ ' : '  '}
              {index + 1}. {model.name}
              {model.type ? ` (${model.type})` : ''}
            </Text>
          </Box>
        ))}
      </Box>

      {selectedModel && selectedModel.model && (
        <Box marginTop={1} paddingLeft={2}>
          <Text dimColor wrap="wrap">
            Model: {selectedModel.model}
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Enter to confirm · Number to select · Esc to exit</Text>
      </Box>
    </Box>
  );
}
