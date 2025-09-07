#!/usr/bin/env node
import { render } from 'ink';
import SelectInput from 'ink-select-input';
import React from 'react';

const App = () => {
  const items = [
    { label: 'Option 1', value: '1' },
    { label: 'Option 2', value: '2' },
    { label: 'Option 3', value: '3' },
  ];

  return (
    <SelectInput
      items={items}
      onSelect={(item) => {
        console.log('Selected:', item.value);
        process.exit(0);
      }}
    />
  );
};

render(<App />);