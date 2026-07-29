'use client';

import { useAtomValue } from 'jotai';
import { useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  oneDark,
  oneLight,
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import { isExperimentalDarkModeEnabledAtom } from '@/atoms/experimental-features';
import { ErrorIcon, Lock } from '@/components/icons';

interface StudioYamlEditorError {
  message: string;
  line?: number;
}

interface StudioYamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  error?: StudioYamlEditorError;
}

const EDITOR_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
const EDITOR_FONT_SIZE = '0.875rem';
const EDITOR_LINE_HEIGHT = 1.625;
const EDITOR_PADDING = '1rem';

export function StudioYamlEditor({
  value,
  onChange,
  readOnly,
  error,
}: Readonly<StudioYamlEditorProps>) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const isDarkMode = useAtomValue(isExperimentalDarkModeEnabledAtom);
  const theme = isDarkMode ? oneDark : oneLight;

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={highlightRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden">
          <SyntaxHighlighter
            language="yaml"
            style={theme}
            customStyle={{
              margin: 0,
              padding: EDITOR_PADDING,
              background: 'transparent',
              backgroundColor: 'transparent',
              overflow: 'visible',
              width: 'max-content',
              minWidth: '100%',
              minHeight: '100%',
              fontFamily: EDITOR_FONT_FAMILY,
              fontSize: EDITOR_FONT_SIZE,
              lineHeight: EDITOR_LINE_HEIGHT,
              whiteSpace: 'pre',
            }}
            codeTagProps={{
              style: {
                fontFamily: EDITOR_FONT_FAMILY,
                fontSize: EDITOR_FONT_SIZE,
                lineHeight: EDITOR_LINE_HEIGHT,
                whiteSpace: 'pre',
              },
            }}>
            {value === '' ? ' ' : value}
          </SyntaxHighlighter>
          {error?.line ? (
            <div
              className="yaml-err-line"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                display: 'block',
                fontSize: EDITOR_FONT_SIZE,
                top: `calc(${EDITOR_PADDING} + ${(error.line - 1) * EDITOR_LINE_HEIGHT}em)`,
                height: `${EDITOR_LINE_HEIGHT}em`,
              }}
            />
          ) : null}
        </div>
        <textarea
          data-testid="studio-yaml-editor"
          value={value}
          spellCheck={false}
          wrap="off"
          readOnly={readOnly}
          placeholder="Write your workflow YAML here, or paste an existing manifest."
          onChange={event => onChange(event.target.value)}
          onScroll={event => {
            const target = event.currentTarget;
            if (highlightRef.current) {
              highlightRef.current.scrollTop = target.scrollTop;
              highlightRef.current.scrollLeft = target.scrollLeft;
            }
          }}
          style={{
            fontFamily: EDITOR_FONT_FAMILY,
            fontSize: EDITOR_FONT_SIZE,
            lineHeight: EDITOR_LINE_HEIGHT,
            padding: EDITOR_PADDING,
          }}
          className="caret-fg-primary absolute inset-0 resize-none overflow-auto bg-transparent whitespace-pre text-transparent outline-none"
        />
        {readOnly && (
          <div
            data-testid="studio-build-lock"
            className="bg-background/70 text-fg-secondary absolute inset-0 flex items-center justify-center gap-2 text-sm backdrop-blur-[1px]">
            <Lock className="h-4 w-4" />
            Agent is building — editing locked
          </div>
        )}
      </div>
      {error && (
        <div
          role="alert"
          data-testid="studio-yaml-banner"
          className="border-stroke-status-error bg-status-error/10 flex shrink-0 items-start gap-2 border-t px-4 py-3 text-sm">
          <ErrorIcon className="text-status-error mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex min-w-0 flex-col">
            <span className="text-status-error font-medium">
              Invalid workflow YAML
            </span>
            <span className="text-fg-secondary font-mono text-xs break-words">
              {error.message}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
