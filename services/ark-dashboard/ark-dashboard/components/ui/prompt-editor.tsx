'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  parameters?: Array<{ name: string }>;
  textareaClassName?: string;
  highlightClassName?: string;
}

export interface PromptEditorRef {
  focus: () => void;
  blur: () => void;
}

const TEMPLATE_REGEX = /(\{\{\s*\.[\w]+\s*\}\})/g;
const PARAM_NAME_REGEX = /\{\{\s*\.([\w]+)\s*\}\}/;

export const PromptEditor = forwardRef<PromptEditorRef, PromptEditorProps>(
  function PromptEditor(
    {
      value,
      onChange,
      placeholder,
      disabled,
      className,
      parameters = [],
      textareaClassName,
      highlightClassName,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const highlightRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      blur: () => textareaRef.current?.blur(),
    }));

    const handleScroll = useCallback(() => {
      if (textareaRef.current && highlightRef.current) {
        highlightRef.current.scrollTop = textareaRef.current.scrollTop;
        highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
    }, []);

    const definedParams = new Set(parameters.map(p => p.name));

    const renderHighlightedContent = () => {
      if (!value) {
        return <span className="text-muted-foreground/50">{placeholder}</span>;
      }

      const parts = value.split(TEMPLATE_REGEX);

      return parts.map((part, index) => {
        const match = part.match(PARAM_NAME_REGEX);
        if (match) {
          const paramName = match?.[1] || '';
          const isDefined = definedParams.has(paramName);

          return (
            <span
              key={index}
              className={cn(
                'rounded-sm',
                isDefined
                  ? 'bg-emerald-500/25 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.3)] dark:text-emerald-400'
                  : 'bg-amber-500/25 text-amber-700 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.4)] dark:text-amber-400',
              )}
              title={
                isDefined
                  ? `Parameter: ${paramName}`
                  : `Undefined parameter: ${paramName}`
              }>
              {part}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      });
    };

    return (
      <div className={cn('relative w-full', className)}>
        {/* Highlighted background layer */}
        <div
          ref={highlightRef}
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 overflow-hidden',
            'break-words whitespace-pre-wrap',
            'rounded-md border border-transparent bg-transparent',
            'p-3 font-mono text-sm leading-relaxed',
            'h-full',
            highlightClassName,
          )}
          style={{ wordBreak: 'break-word' }}>
          {renderHighlightedContent()}
          <br />
        </div>

        {/* Editable textarea layer */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onScroll={handleScroll}
          placeholder=""
          disabled={disabled}
          className={cn(
            'relative z-10 h-full w-full resize-none',
            'rounded-md border bg-transparent p-3',
            'font-mono text-sm leading-relaxed',
            'focus:ring-ring focus:ring-2 focus:ring-offset-2 focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
            textareaClassName,
          )}
          style={{
            color: 'transparent',
            caretColor: 'var(--foreground)',
            WebkitTextFillColor: 'transparent',
          }}
        />
      </div>
    );
  },
);
