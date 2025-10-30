import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';

export interface Target {
  name: string;
  namespace: string;
  description?: string;
}

interface TargetSelectorProps {
  targets: Target[];
  title: string;
  subtitle: string;
  onSelect: (target: Target) => void;
  onExit: () => void;
  formatLabel?: (target: Target) => string;
  formatInlineDetail?: (target: Target) => string | undefined;
  showDetailPanel?: boolean;
  loading?: boolean;
  error?: string;
}

export function TargetSelector({
  targets,
  title,
  subtitle,
  onSelect,
  onExit,
  formatLabel = (target) => target.name,
  formatInlineDetail,
  showDetailPanel = false,
  loading = false,
  error,
}: TargetSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input: string, key: any) => {
    if (key.escape) {
      onExit();
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => (prev === 0 ? targets.length - 1 : prev - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => (prev === targets.length - 1 ? 0 : prev + 1));
    } else if (key.return) {
      onSelect(targets[selectedIndex]);
    } else {
      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= targets.length) {
        onSelect(targets[num - 1]);
      }
    }
  });

  const truncate = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  };

  if (loading) {
    return (
      <Box>
        <Text>Loading {title.toLowerCase()}...</Text>
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

  if (targets.length === 0) {
    return (
      <Box>
        <Text>No {title.toLowerCase()} available</Text>
      </Box>
    );
  }

  const selectedTarget = targets[selectedIndex];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold>{title}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>{subtitle}</Text>
      </Box>

      <Box flexDirection="column">
        {targets.map((target, index) => {
          const label = formatLabel(target);
          const prefix = `${index === selectedIndex ? '❯ ' : '  '}${index + 1}. ${label}`;
          const inlineDetail = formatInlineDetail?.(target);
          const maxDetailLength = 80 - prefix.length;

          return (
            <Box key={`${target.namespace}-${target.name}`} marginBottom={0}>
              <Text color={index === selectedIndex ? 'green' : undefined}>
                {prefix}
              </Text>
              {inlineDetail && (
                <Text color="gray" dimColor>
                  {' '}
                  {truncate(inlineDetail, maxDetailLength)}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {showDetailPanel && selectedTarget.description && (
        <Box marginTop={1} paddingLeft={2}>
          <Text dimColor wrap="wrap">
            {selectedTarget.description}
          </Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Enter to confirm · Number to select · Esc to exit</Text>
      </Box>
    </Box>
  );
}
