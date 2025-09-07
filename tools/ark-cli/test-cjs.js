#!/usr/bin/env node
const React = require('react');
const { render } = require('ink');
const SelectInput = require('ink-select-input').default;

const App = () => {
  const items = [
    { label: 'Option 1', value: '1' },
    { label: 'Option 2', value: '2' },
    { label: 'Option 3', value: '3' },
  ];

  return React.createElement(SelectInput, {
    items: items,
    onSelect: (item) => {
      console.log('Selected:', item.value);
      process.exit(0);
    }
  });
};

render(React.createElement(App));