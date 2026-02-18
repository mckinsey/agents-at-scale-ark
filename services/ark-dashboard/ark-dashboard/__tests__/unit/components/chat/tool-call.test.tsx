import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ToolCall, type ToolCallData } from '@/components/chat/tool-call';

describe('ToolCall', () => {
  const mockToolCall: ToolCallData = {
    id: 'call-1',
    type: 'function',
    function: {
      name: 'search',
      arguments: '{"query":"test query"}',
    },
  };

  describe('basic rendering', () => {
    it('should render tool call with function name', () => {
      render(<ToolCall toolCall={mockToolCall} />);

      expect(screen.getByText('search')).toBeInTheDocument();
    });

    it('should show Input section', () => {
      render(<ToolCall toolCall={mockToolCall} />);

      expect(screen.getByText('Input')).toBeInTheDocument();
    });

    it('should show Output section when result is present', () => {
      const toolCallWithResult: ToolCallData = {
        ...mockToolCall,
        result: '{"data":"test"}',
      };

      render(<ToolCall toolCall={toolCallWithResult} />);

      expect(screen.getByText('Input')).toBeInTheDocument();
      expect(screen.getByText('Output')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <ToolCall toolCall={mockToolCall} className="custom-class" />,
      );

      const element = container.querySelector('.custom-class');
      expect(element).toBeInTheDocument();
    });
  });

  describe('input expansion', () => {
    it('should expand input section when clicked', async () => {
      const user = userEvent.setup();
      render(<ToolCall toolCall={mockToolCall} />);

      const inputButton = screen.getByText('Input').closest('button')!;
      await user.click(inputButton);

      expect(screen.getByText(/"query"/)).toBeInTheDocument();
    });

    it('should collapse input section when clicked again', async () => {
      const user = userEvent.setup();
      render(<ToolCall toolCall={mockToolCall} />);

      const inputButton = screen.getByText('Input').closest('button')!;

      await user.click(inputButton);
      expect(screen.getByText(/"query"/)).toBeInTheDocument();

      await user.click(inputButton);
      expect(screen.queryByText(/"query"/)).not.toBeInTheDocument();
    });

    it('should format JSON arguments', async () => {
      const user = userEvent.setup();
      render(<ToolCall toolCall={mockToolCall} />);

      const inputButton = screen.getByText('Input').closest('button')!;
      await user.click(inputButton);

      expect(screen.getByText(/"query"/)).toBeInTheDocument();
      expect(screen.getByText(/"test query"/)).toBeInTheDocument();
    });

    it('should show raw arguments when JSON parsing fails', async () => {
      const user = userEvent.setup();
      const invalidToolCall: ToolCallData = {
        ...mockToolCall,
        function: {
          name: 'test',
          arguments: 'invalid json',
        },
      };

      render(<ToolCall toolCall={invalidToolCall} />);

      const inputButton = screen.getByText('Input').closest('button')!;
      await user.click(inputButton);

      expect(screen.getByText('invalid json')).toBeInTheDocument();
    });
  });

  describe('output expansion', () => {
    it('should expand output section when clicked', async () => {
      const user = userEvent.setup();
      const toolCallWithResult: ToolCallData = {
        ...mockToolCall,
        result: '{"status":"success"}',
      };

      render(<ToolCall toolCall={toolCallWithResult} />);

      const outputButton = screen.getByText('Output').closest('button')!;
      await user.click(outputButton);

      expect(screen.getByText(/"status"/)).toBeInTheDocument();
    });

    it('should collapse output section when clicked again', async () => {
      const user = userEvent.setup();
      const toolCallWithResult: ToolCallData = {
        ...mockToolCall,
        result: '{"data":"test"}',
      };

      render(<ToolCall toolCall={toolCallWithResult} />);

      const outputButton = screen.getByText('Output').closest('button')!;

      await user.click(outputButton);
      expect(screen.getByText(/"data"/)).toBeInTheDocument();

      await user.click(outputButton);
      expect(screen.queryByText(/"data"/)).not.toBeInTheDocument();
    });

    it('should format JSON result', async () => {
      const user = userEvent.setup();
      const toolCallWithResult: ToolCallData = {
        ...mockToolCall,
        result: '{"status":"success","count":42}',
      };

      render(<ToolCall toolCall={toolCallWithResult} />);

      const outputButton = screen.getByText('Output').closest('button')!;
      await user.click(outputButton);

      expect(screen.getByText(/"status"/)).toBeInTheDocument();
      expect(screen.getByText(/"success"/)).toBeInTheDocument();
      expect(screen.getByText(/"count"/)).toBeInTheDocument();
    });

    it('should show raw result when JSON parsing fails', async () => {
      const user = userEvent.setup();
      const toolCallWithResult: ToolCallData = {
        ...mockToolCall,
        result: 'plain text result',
      };

      render(<ToolCall toolCall={toolCallWithResult} />);

      const outputButton = screen.getByText('Output').closest('button')!;
      await user.click(outputButton);

      expect(screen.getByText('plain text result')).toBeInTheDocument();
    });

    it('should not show output section when result is undefined', () => {
      const toolCallNoResult: ToolCallData = {
        ...mockToolCall,
        result: undefined,
      };

      render(<ToolCall toolCall={toolCallNoResult} />);

      expect(screen.queryByText('Output')).not.toBeInTheDocument();
    });
  });

  describe('different tool functions', () => {
    it('should render different function names', () => {
      const calculateTool: ToolCallData = {
        id: 'call-2',
        type: 'function',
        function: {
          name: 'calculate',
          arguments: '{"expression":"2+2"}',
        },
      };

      render(<ToolCall toolCall={calculateTool} />);

      expect(screen.getByText('calculate')).toBeInTheDocument();
    });

    it('should handle complex nested arguments', async () => {
      const user = userEvent.setup();
      const complexTool: ToolCallData = {
        id: 'call-3',
        type: 'function',
        function: {
          name: 'update',
          arguments:
            '{"user":{"name":"John","age":30},"settings":{"theme":"dark"}}',
        },
      };

      render(<ToolCall toolCall={complexTool} />);

      const inputButton = screen.getByText('Input').closest('button')!;
      await user.click(inputButton);

      expect(screen.getByText(/"user"/)).toBeInTheDocument();
      expect(screen.getByText(/"settings"/)).toBeInTheDocument();
    });
  });
});
