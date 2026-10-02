import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Combobox,
  ComboboxAnchor,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from '@/components/ui/combobox';
import { InputGroup } from '@/components/ui/input-group';

describe('Combobox', () => {
  describe('Combobox Component', () => {
    it('should render combobox with input', () => {
      render(
        <Combobox>
          <ComboboxAnchor>
            <InputGroup>
              <ComboboxInput placeholder="Type to search..." />
            </InputGroup>
          </ComboboxAnchor>
        </Combobox>,
      );

      expect(screen.getByPlaceholderText('Type to search...')).toBeInTheDocument();
    });

    it('should render with trigger', () => {
      render(
        <Combobox>
          <ComboboxAnchor>
            <InputGroup>
              <ComboboxInput placeholder="Select..." />
              <ComboboxTrigger />
            </InputGroup>
          </ComboboxAnchor>
        </Combobox>,
      );

      expect(screen.getByPlaceholderText('Select...')).toBeInTheDocument();
    });
  });

  describe('ComboboxContent', () => {
    it('should render content when open', () => {
      render(
        <Combobox open>
          <ComboboxAnchor>
            <InputGroup>
              <ComboboxInput placeholder="Search" />
            </InputGroup>
          </ComboboxAnchor>
          <ComboboxContent>
            <ComboboxList>
              <ComboboxItem value="item1">Item 1</ComboboxItem>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>,
      );

      expect(screen.getByText('Item 1')).toBeInTheDocument();
    });

    it('should render multiple items', () => {
      render(
        <Combobox open>
          <ComboboxAnchor>
            <InputGroup>
              <ComboboxInput />
            </InputGroup>
          </ComboboxAnchor>
          <ComboboxContent>
            <ComboboxList>
              <ComboboxItem value="1">Option 1</ComboboxItem>
              <ComboboxItem value="2">Option 2</ComboboxItem>
              <ComboboxItem value="3">Option 3</ComboboxItem>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>,
      );

      expect(screen.getByText('Option 1')).toBeInTheDocument();
      expect(screen.getByText('Option 2')).toBeInTheDocument();
      expect(screen.getByText('Option 3')).toBeInTheDocument();
    });
  });

  describe('ComboboxItem', () => {
    it('should render item with value', () => {
      render(
        <Combobox open>
          <ComboboxAnchor>
            <InputGroup>
              <ComboboxInput />
            </InputGroup>
          </ComboboxAnchor>
          <ComboboxContent>
            <ComboboxList>
              <ComboboxItem value="test">Test Item</ComboboxItem>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>,
      );

      expect(screen.getByText('Test Item')).toBeInTheDocument();
    });

    it('should render with role option', () => {
      render(
        <Combobox open>
          <ComboboxAnchor>
            <InputGroup>
              <ComboboxInput />
            </InputGroup>
          </ComboboxAnchor>
          <ComboboxContent>
            <ComboboxList>
              <ComboboxItem value="test">Test</ComboboxItem>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>,
      );

      expect(screen.getByRole('option')).toBeInTheDocument();
    });
  });

  describe('ComboboxValue', () => {
    it('should render with placeholder', () => {
      render(
        <Combobox>
          <ComboboxAnchor>
            <InputGroup>
              <ComboboxValue placeholder="Select an option" />
            </InputGroup>
          </ComboboxAnchor>
        </Combobox>,
      );

      expect(screen.getByText('Select an option')).toBeInTheDocument();
    });
  });

  describe('ComboboxAnchor', () => {
    it('should render anchor wrapper', () => {
      const { container } = render(
        <Combobox>
          <ComboboxAnchor>
            <InputGroup>
              <ComboboxInput />
            </InputGroup>
          </ComboboxAnchor>
        </Combobox>,
      );

      expect(container.querySelector('[data-slot="combobox-anchor"]')).toBeInTheDocument();
    });
  });
});
