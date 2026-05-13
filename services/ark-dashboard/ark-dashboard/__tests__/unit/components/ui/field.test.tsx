import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
} from '@/components/ui/field';

describe('Field', () => {
  describe('Field Component', () => {
    it('should render field with role group', () => {
      render(<Field>Content</Field>);

      expect(screen.getByRole('group')).toBeInTheDocument();
    });

    it('should apply orientation prop', () => {
      const { container } = render(<Field orientation="horizontal">Content</Field>);

      const field = container.querySelector('[data-slot="field"]');
      expect(field).toHaveAttribute('data-orientation', 'horizontal');
    });
  });

  describe('FieldLabel', () => {
    it('should render label element', () => {
      render(<FieldLabel>Field Label</FieldLabel>);

      expect(screen.getByText('Field Label')).toBeInTheDocument();
    });
  });

  describe('FieldDescription', () => {
    it('should render description text', () => {
      render(<FieldDescription>Description text</FieldDescription>);

      expect(screen.getByText('Description text')).toBeInTheDocument();
    });
  });

  describe('FieldError', () => {
    it('should render error message', () => {
      render(<FieldError>Error message</FieldError>);

      const error = screen.getByRole('alert');
      expect(error).toHaveTextContent('Error message');
    });

    it('should render error from errors array', () => {
      const errors = [{ message: 'First error' }];
      render(<FieldError errors={errors} />);

      expect(screen.getByText('First error')).toBeInTheDocument();
    });

    it('should render multiple errors as list', () => {
      const errors = [
        { message: 'First error' },
        { message: 'Second error' },
      ];
      render(<FieldError errors={errors} />);

      expect(screen.getByText('First error')).toBeInTheDocument();
      expect(screen.getByText('Second error')).toBeInTheDocument();
    });

    it('should deduplicate error messages', () => {
      const errors = [
        { message: 'Same error' },
        { message: 'Same error' },
      ];
      render(<FieldError errors={errors} />);

      // When only one unique error, it renders as plain text, not a list
      expect(screen.getByText('Same error')).toBeInTheDocument();
    });

    it('should not render when no errors', () => {
      const { container } = render(<FieldError errors={[]} />);

      expect(container.querySelector('[role="alert"]')).not.toBeInTheDocument();
    });
  });

  describe('FieldGroup', () => {
    it('should render field group', () => {
      const { container } = render(
        <FieldGroup>
          <Field>Field 1</Field>
        </FieldGroup>,
      );

      expect(container.querySelector('[data-slot="field-group"]')).toBeInTheDocument();
    });
  });

  describe('FieldSet', () => {
    it('should render fieldset element', () => {
      const { container } = render(
        <FieldSet>
          <Field>Field</Field>
        </FieldSet>,
      );

      const fieldset = container.querySelector('fieldset');
      expect(fieldset).toBeInTheDocument();
    });
  });

  describe('FieldSeparator', () => {
    it('should render separator', () => {
      const { container } = render(<FieldSeparator />);

      expect(container.querySelector('[data-slot="field-separator"]')).toBeInTheDocument();
    });

    it('should render separator with content', () => {
      render(<FieldSeparator>OR</FieldSeparator>);

      expect(screen.getByText('OR')).toBeInTheDocument();
    });
  });

  describe('FieldContent', () => {
    it('should render content wrapper', () => {
      const { container } = render(
        <FieldContent>
          <div>Content</div>
        </FieldContent>,
      );

      expect(container.querySelector('[data-slot="field-content"]')).toBeInTheDocument();
    });
  });
});
