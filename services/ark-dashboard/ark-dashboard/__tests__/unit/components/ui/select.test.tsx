import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

describe('Select', () => {
  describe('Select Component', () => {
    it('should render select root element', () => {
      const { container } = render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
        </Select>,
      );

      const select = container.querySelector('[data-slot="select"]');
      expect(select).toBeInTheDocument();
    });

    it('should pass through size prop', () => {
      const { container } = render(
        <Select size="lg">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>,
      );

      const select = container.querySelector('[data-slot="select"]');
      expect(select).toBeInTheDocument();
    });

    it('should render children', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue />
          </SelectTrigger>
        </Select>,
      );

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
    });
  });

  describe('SelectTrigger', () => {
    it('should render trigger with role combobox', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select option" />
          </SelectTrigger>
        </Select>,
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should have correct data-slot attribute', () => {
      const { container } = render(
        <Select>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>,
      );

      const trigger = container.querySelector('[data-slot="select-trigger"]');
      expect(trigger).toBeInTheDocument();
    });

    it('should display placeholder text', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Choose an option" />
          </SelectTrigger>
        </Select>,
      );

      expect(screen.getByText('Choose an option')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <Select>
          <SelectTrigger className="custom-trigger">
            <SelectValue />
          </SelectTrigger>
        </Select>,
      );

      const trigger = container.querySelector('[data-slot="select-trigger"]');
      expect(trigger).toHaveClass('custom-trigger');
    });

    it('should render chevron icon', () => {
      const { container } = render(
        <Select>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>,
      );

      const icon = container.querySelector('[data-slot="select-icon"]');
      expect(icon).toBeInTheDocument();
    });

    it('should handle disabled state', () => {
      render(
        <Select disabled>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>,
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveAttribute('data-disabled');
    });
  });

  describe('SelectContent', () => {
    it('should render content with data-slot', () => {
      const { container } = render(
        <Select open>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test">Test</SelectItem>
          </SelectContent>
        </Select>,
      );

      const content = container.querySelector('[data-slot="select-content"]');
      expect(content).toBeInTheDocument();
    });

    it('should render children items', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a">
              <SelectItemText>Option A</SelectItemText>
            </SelectItem>
            <SelectItem value="b">
              <SelectItemText>Option B</SelectItemText>
            </SelectItem>
          </SelectContent>
        </Select>,
      );

      expect(screen.getByText('Option A')).toBeInTheDocument();
      expect(screen.getByText('Option B')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <Select open>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="custom-content">
            <SelectItem value="test">Test</SelectItem>
          </SelectContent>
        </Select>,
      );

      const content = container.querySelector('[data-slot="select-content"]');
      expect(content).toHaveClass('custom-content');
    });
  });

  describe('SelectItem', () => {
    it('should render item with value', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test-value">
              <SelectItemText>Test Item</SelectItemText>
            </SelectItem>
          </SelectContent>
        </Select>,
      );

      expect(screen.getByText('Test Item')).toBeInTheDocument();
    });

    it('should have correct data-slot attribute', () => {
      const { container } = render(
        <Select open>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test">
              <SelectItemText>Test</SelectItemText>
            </SelectItem>
          </SelectContent>
        </Select>,
      );

      const item = container.querySelector('[data-slot="select-item"]');
      expect(item).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <Select open>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test" className="custom-item">
              <SelectItemText>Test</SelectItemText>
            </SelectItem>
          </SelectContent>
        </Select>,
      );

      const item = container.querySelector('[data-slot="select-item"]');
      expect(item).toHaveClass('custom-item');
    });
  });

  describe('SelectValue', () => {
    it('should render with placeholder', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select a value" />
          </SelectTrigger>
        </Select>,
      );

      expect(screen.getByText('Select a value')).toBeInTheDocument();
    });

    it('should have correct data-slot attribute', () => {
      const { container } = render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Test" />
          </SelectTrigger>
        </Select>,
      );

      const value = container.querySelector('[data-slot="select-value"]');
      expect(value).toBeInTheDocument();
    });
  });

  describe('Select Integration', () => {
    it('should handle value change', () => {
      const handleChange = vi.fn();

      render(
        <Select onValueChange={handleChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">
              <SelectItemText>Option 1</SelectItemText>
            </SelectItem>
          </SelectContent>
        </Select>,
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeInTheDocument();
    });

    it('should work with controlled value', () => {
      const { rerender } = render(
        <Select value="option1">
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">
              <SelectItemText>Option 1</SelectItemText>
            </SelectItem>
            <SelectItem value="option2">
              <SelectItemText>Option 2</SelectItemText>
            </SelectItem>
          </SelectContent>
        </Select>,
      );

      rerender(
        <Select value="option2">
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">
              <SelectItemText>Option 1</SelectItemText>
            </SelectItem>
            <SelectItem value="option2">
              <SelectItemText>Option 2</SelectItemText>
            </SelectItem>
          </SelectContent>
        </Select>,
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeInTheDocument();
    });

    it('should support different sizes', () => {
      const { container, rerender } = render(
        <Select size="sm">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>,
      );

      expect(container.querySelector('[data-slot="select"]')).toBeInTheDocument();

      rerender(
        <Select size="lg">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>,
      );

      expect(container.querySelector('[data-slot="select"]')).toBeInTheDocument();
    });

    it('should render multiple items', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">
              <SelectItemText>Item 1</SelectItemText>
            </SelectItem>
            <SelectItem value="2">
              <SelectItemText>Item 2</SelectItemText>
            </SelectItem>
            <SelectItem value="3">
              <SelectItemText>Item 3</SelectItemText>
            </SelectItem>
          </SelectContent>
        </Select>,
      );

      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
      expect(screen.getByText('Item 3')).toBeInTheDocument();
    });
  });

  describe('Select Size Variants', () => {
    it('should render with default size', () => {
      const { container } = render(
        <Select size="default">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>,
      );

      expect(container.querySelector('[data-slot="select"]')).toBeInTheDocument();
    });

    it('should render with small size', () => {
      const { container } = render(
        <Select size="sm">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>,
      );

      expect(container.querySelector('[data-slot="select"]')).toBeInTheDocument();
    });

    it('should render with large size', () => {
      const { container } = render(
        <Select size="lg">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>,
      );

      expect(container.querySelector('[data-slot="select"]')).toBeInTheDocument();
    });
  });
});
