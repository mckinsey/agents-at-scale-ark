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
  /**
   * Visual variant.
   * - `default` (existing styling — bordered, mono font, used by EDIT/VIEW)
   * - `compact` matches Figma 1063:53424 / 1065:55086: borderless
   *   bg-fill-onsurface-ui-2 panel with "txt" sublabel, Inter typography,
   *   38% white placeholder, cyan `{{param}}` highlights, resize-handle footer.
   */
  variant?: 'default' | 'compact';
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
      variant = 'default',
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
    const isCompact = variant === 'compact';

    const renderHighlightedContent = () => {
      if (!value) {
        return (
          <span
            className={cn(
              isCompact ? 'text-white/[0.38]' : 'text-muted-foreground/50',
            )}>
            {placeholder}
          </span>
        );
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
              className={
                isCompact
                  ? isDefined
                    ? 'text-[#08bdba]'
                    : 'text-status-warning'
                  : cn(
                      'rounded-sm',
                      isDefined
                        ? 'bg-emerald-500/25 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.3)] dark:text-emerald-400'
                        : 'bg-amber-500/25 text-amber-700 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.4)] dark:text-amber-400',
                    )
              }
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

    if (isCompact) {
      // Figma 1063:53424 / 1065:55086 — bg panel with "txt" sublabel,
      // Inter typography, 38% placeholder, cyan param highlights, resize footer.
      return (
        <div
          className={cn(
            'bg-fill-onsurface-ui-2 relative flex w-full flex-col',
            className,
          )}>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-clip px-3 pt-3">
            {/* "txt" sublabel */}
            <p className="text-fg-secondary text-xs leading-4 tracking-[0.024px]">
              txt
            </p>

            {/* Textarea + highlight layers — overlay stack */}
            <div className="relative min-h-0 w-full flex-1">
              <div
                ref={highlightRef}
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute inset-0 overflow-hidden',
                  'whitespace-pre-wrap break-words',
                  'text-fg-primary p-0 text-sm leading-5 tracking-[-0.028px]',
                  highlightClassName,
                )}
                style={{ wordBreak: 'break-word' }}>
                {renderHighlightedContent()}
                <br />
              </div>
              <textarea
                ref={textareaRef}
                value={value}
                onChange={e => onChange(e.target.value)}
                onScroll={handleScroll}
                placeholder=""
                disabled={disabled}
                className={cn(
                  'relative z-10 h-full w-full resize-none',
                  'border-0 bg-transparent p-0',
                  'text-sm leading-5 tracking-[-0.028px]',
                  'focus:outline-none focus-visible:outline-none',
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
          </div>

          {/* Footer with resize-handle indicator — figma 1894:42294 */}
          <div className="flex h-4 items-end justify-end overflow-clip pr-1 pb-1">
            <svg
              className="text-white/[0.38] size-2.5"
              viewBox="0 0 10 10"
              aria-hidden="true">
              <line
                x1="9.5"
                y1="6"
                x2="6"
                y2="9.5"
                stroke="currentColor"
                strokeWidth="0.8"
                strokeLinecap="square"
              />
              <line
                x1="9.5"
                y1="2"
                x2="2"
                y2="9.5"
                stroke="currentColor"
                strokeWidth="0.8"
                strokeLinecap="square"
              />
            </svg>
          </div>
        </div>
      );
    }

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
