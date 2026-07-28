import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';

describe('InputGroup', () => {
  describe('InputGroup Component', () => {
    it('should render input group container', () => {
      const { container } = render(
        <InputGroup>
          <InputGroupInput placeholder="Test" />
        </InputGroup>,
      );

      const inputGroup = container.querySelector('[data-slot="input-group"]');
      expect(inputGroup).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <InputGroup className="custom-group">
          <InputGroupInput placeholder="Test" />
        </InputGroup>,
      );

      const inputGroup = container.querySelector('[data-slot="input-group"]');
      expect(inputGroup).toHaveClass('custom-group');
    });

    it('should render children', () => {
      render(
        <InputGroup>
          <InputGroupInput data-testid="test-input" placeholder="Test" />
        </InputGroup>,
      );

      expect(screen.getByTestId('test-input')).toBeInTheDocument();
    });
  });

  describe('InputGroupInput', () => {
    it('should render input element', () => {
      render(
        <InputGroup>
          <InputGroupInput placeholder="Enter text" />
        </InputGroup>,
      );

      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });

    it('should have correct data-slot attribute', () => {
      const { container } = render(
        <InputGroup>
          <InputGroupInput placeholder="Test" />
        </InputGroup>,
      );

      const input = container.querySelector('[data-slot="input-group-control"]');
      expect(input).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <InputGroup>
          <InputGroupInput className="custom-input" placeholder="Test" />
        </InputGroup>,
      );

      const input = container.querySelector('[data-slot="input-group-control"]');
      expect(input).toHaveClass('custom-input');
    });

    it('should handle disabled state', () => {
      render(
        <InputGroup>
          <InputGroupInput disabled placeholder="Test" />
        </InputGroup>,
      );

      const input = screen.getByPlaceholderText('Test');
      expect(input).toBeDisabled();
    });

    it('should accept input value', () => {
      render(
        <InputGroup>
          <InputGroupInput value="test value" readOnly placeholder="Test" />
        </InputGroup>,
      );

      const input = screen.getByDisplayValue('test value');
      expect(input).toBeInTheDocument();
    });
  });

  describe('InputGroupButton', () => {
    it('should render button element', () => {
      render(
        <InputGroup>
          <InputGroupInput placeholder="Test" />
          <InputGroupButton>Click</InputGroupButton>
        </InputGroup>,
      );

      expect(screen.getByRole('button', { name: 'Click' })).toBeInTheDocument();
    });

    it('should have correct data-slot attribute', () => {
      const { container } = render(
        <InputGroup>
          <InputGroupInput placeholder="Test" />
          <InputGroupButton>Action</InputGroupButton>
        </InputGroup>,
      );

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <InputGroup>
          <InputGroupInput placeholder="Test" />
          <InputGroupButton className="custom-button">
            Action
          </InputGroupButton>
        </InputGroup>,
      );

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toHaveClass('custom-button');
    });

    it('should handle disabled state', () => {
      render(
        <InputGroup>
          <InputGroupInput placeholder="Test" />
          <InputGroupButton disabled>Action</InputGroupButton>
        </InputGroup>,
      );

      const button = screen.getByRole('button', { name: 'Action' });
      expect(button).toBeDisabled();
    });
  });

  describe('InputGroupText', () => {
    it('should render text element', () => {
      render(
        <InputGroup>
          <InputGroupText>$</InputGroupText>
          <InputGroupInput placeholder="Test" />
        </InputGroup>,
      );

      expect(screen.getByText('$')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <InputGroup>
          <InputGroupText className="custom-text">@</InputGroupText>
          <InputGroupInput placeholder="Test" />
        </InputGroup>,
      );

      const text = screen.getByText('@');
      expect(text).toHaveClass('custom-text');
    });
  });

  describe('InputGroup Composition', () => {
    it('should render with leading text', () => {
      render(
        <InputGroup>
          <InputGroupText>@</InputGroupText>
          <InputGroupInput placeholder="username" />
        </InputGroup>,
      );

      expect(screen.getByText('@')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('username')).toBeInTheDocument();
    });

    it('should render with trailing button', () => {
      render(
        <InputGroup>
          <InputGroupInput placeholder="Search" />
          <InputGroupButton>Go</InputGroupButton>
        </InputGroup>,
      );

      expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
    });

    it('should render with both leading and trailing elements', () => {
      render(
        <InputGroup>
          <InputGroupText>$</InputGroupText>
          <InputGroupInput placeholder="0.00" />
          <InputGroupText>.00</InputGroupText>
        </InputGroup>,
      );

      expect(screen.getByText('$')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
      expect(screen.getByText('.00')).toBeInTheDocument();
    });

    it('should render with multiple buttons', () => {
      render(
        <InputGroup>
          <InputGroupInput placeholder="Test" />
          <InputGroupButton>Action 1</InputGroupButton>
          <InputGroupButton>Action 2</InputGroupButton>
        </InputGroup>,
      );

      expect(
        screen.getByRole('button', { name: 'Action 1' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Action 2' }),
      ).toBeInTheDocument();
    });

    it('should work with disabled children', () => {
      render(
        <InputGroup>
          <InputGroupText>Label</InputGroupText>
          <InputGroupInput disabled placeholder="Test" />
          <InputGroupButton disabled>Action</InputGroupButton>
        </InputGroup>,
      );

      const input = screen.getByPlaceholderText('Test');
      const button = screen.getByRole('button', { name: 'Action' });

      expect(input).toBeDisabled();
      expect(button).toBeDisabled();
    });
  });

});
