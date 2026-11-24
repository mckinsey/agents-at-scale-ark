import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/button';

describe('Button', () => {
  describe('Button Component', () => {
    it('should render button element', () => {
      render(<Button>Click me</Button>);

      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
    });

    it('should have correct data-slot attribute', () => {
      const { container } = render(<Button>Test</Button>);

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <Button className="custom-button">Test</Button>,
      );

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toHaveClass('custom-button');
    });

    it('should handle disabled state', () => {
      render(<Button disabled>Test</Button>);

      const button = screen.getByRole('button', { name: 'Test' });
      expect(button).toBeDisabled();
    });

    it('should handle click events', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<Button onClick={handleClick}>Click</Button>);

      const button = screen.getByRole('button', { name: 'Click' });
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <Button disabled onClick={handleClick}>
          Click
        </Button>,
      );

      const button = screen.getByRole('button', { name: 'Click' });
      await user.click(button);

      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should render children', () => {
      render(
        <Button>
          <span data-testid="child">Child content</span>
        </Button>,
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should wrap text nodes in span for underline effect', () => {
      const { container } = render(<Button>Text content</Button>);

      const textSpan = container.querySelector(
        'span.group-hover\\/btn\\:underline',
      );
      expect(textSpan).toBeInTheDocument();
      expect(textSpan).toHaveTextContent('Text content');
    });
  });

  describe('Button Variants', () => {
    it('should accept variant prop', () => {
      const { container } = render(<Button variant="accent">Accent</Button>);

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should work with different variants', () => {
      const { container, rerender } = render(
        <Button variant="default">Default</Button>,
      );

      expect(container.querySelector('[data-slot="button"]')).toBeInTheDocument();

      rerender(<Button variant="ghost">Ghost</Button>);

      expect(container.querySelector('[data-slot="button"]')).toBeInTheDocument();
    });
  });

  describe('Button Sizes', () => {
    it('should accept size prop', () => {
      const { container } = render(<Button size="lg">Large</Button>);

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
    });

    it('should work with different sizes', () => {
      const { container, rerender } = render(
        <Button size="sm">Small</Button>,
      );

      expect(container.querySelector('[data-slot="button"]')).toBeInTheDocument();

      rerender(<Button size="icon">Icon</Button>);

      expect(container.querySelector('[data-slot="button"]')).toBeInTheDocument();
    });
  });

  describe('Button Integration', () => {
    it('should combine variant and size props', () => {
      const { container } = render(
        <Button variant="accent" size="lg">
          Large Accent
        </Button>,
      );

      const button = container.querySelector('[data-slot="button"]');
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('Large Accent');
    });

    it('should support aria-label for accessibility', () => {
      render(<Button aria-label="Close dialog">×</Button>);

      expect(
        screen.getByRole('button', { name: 'Close dialog' }),
      ).toBeInTheDocument();
    });

    it('should support type attribute', () => {
      render(<Button type="submit">Submit</Button>);

      const button = screen.getByRole('button', { name: 'Submit' });
      expect(button).toHaveAttribute('type', 'submit');
    });
  });
});
