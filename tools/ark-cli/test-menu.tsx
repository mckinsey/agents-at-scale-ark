#!/usr/bin/env node
import { Box, Text, render } from 'ink';
import SelectInput from 'ink-select-input';
import * as React from 'react';

const TestMenu = () => {
  const [selected, setSelected] = React.useState<string | null>(null);

  const items = [
    { label: '💬 Chat', value: 'chat' },
    { label: '🏷️  Dashboard', value: 'dashboard' },
    { label: '🔍 Status Check', value: 'status' },
    { label: '🎯 Generate', value: 'generate' },
    { label: '👋 Exit', value: 'exit' },
  ];

  if (selected) {
    return <Text>Selected: {selected}</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text>Test Menu - Arrow keys should work:</Text>
      <SelectInput
        items={items}
        onSelect={(item) => setSelected(item.value)}
      />
    </Box>
  );
};

render(<TestMenu />);