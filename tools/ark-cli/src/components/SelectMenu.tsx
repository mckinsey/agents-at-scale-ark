import {Box, Text, useInput} from 'ink';
import * as React from 'react';

export interface SelectMenuItem {
  /** Menu item label */
  label: string;
  /** Optional description shown in gray */
  description?: string;
  /** Called when item is selected */
  onSelect: () => void;
}

interface SelectMenuProps {
  /** Menu items to display */
  items: SelectMenuItem[];
  /** Initial selected index (default: 0) */
  initialIndex?: number;
}

export const SelectMenu: React.FC<SelectMenuProps> = ({
  items,
  initialIndex = 0,
}) => {
  const [selectedIndex, setSelectedIndex] = React.useState(initialIndex);

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      items[selectedIndex].onSelect();
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={index} flexDirection="row">
            <Text color={isSelected ? 'green' : 'gray'}>
              {isSelected ? '❯ ' : '  '}
            </Text>
            <Text color={isSelected ? 'green' : 'white'}>{item.label}</Text>
            {item.description && (
              <>
                <Text> </Text>
                <Text color="gray">{item.description}</Text>
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
