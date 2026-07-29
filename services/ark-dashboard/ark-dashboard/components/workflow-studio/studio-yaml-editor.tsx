'use client';

import { type ReactNode, useRef } from 'react';

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

function highlightValue(value: string, keyPrefix: string): ReactNode {
  const trimmed = value.trimStart();
  if (trimmed === '') {
    return value;
  }
  const leading = value.slice(0, value.length - trimmed.length);
  if (trimmed.startsWith('#')) {
    return (
      <span key={keyPrefix} className="yaml-tok-comment">
        {value}
      </span>
    );
  }
  if (/^["']/.test(trimmed)) {
    return (
      <span key={keyPrefix}>
        {leading}
        <span className="yaml-tok-str">{trimmed}</span>
      </span>
    );
  }
  if (/^(true|false|null)\s*$/i.test(trimmed)) {
    return (
      <span key={keyPrefix}>
        {leading}
        <span className="yaml-tok-bool">{trimmed}</span>
      </span>
    );
  }
  if (/^-?\d[\d.]*\s*$/.test(trimmed)) {
    return (
      <span key={keyPrefix}>
        {leading}
        <span className="yaml-tok-num">{trimmed}</span>
      </span>
    );
  }
  return (
    <span key={keyPrefix} className="yaml-tok-val">
      {value}
    </span>
  );
}

function highlightLine(line: string, index: number): ReactNode {
  if (line.trimStart().startsWith('#')) {
    return (
      <span key={index} className="yaml-tok-comment">
        {line}
      </span>
    );
  }

  const keyMatch = /^(\s*)(- )?([A-Za-z0-9_.\-]+)(:)(?=\s|$)(.*)$/.exec(line);
  if (keyMatch) {
    const [, indent, dash, key, colon, rest] = keyMatch;
    return (
      <span key={index}>
        {indent}
        {dash ? <span className="yaml-tok-punc">{dash}</span> : null}
        <span className="yaml-tok-key">{key}</span>
        <span className="yaml-tok-punc">{colon}</span>
        {highlightValue(rest, `${index}-v`)}
      </span>
    );
  }

  const listMatch = /^(\s*)(- )(.*)$/.exec(line);
  if (listMatch) {
    const [, indent, dash, rest] = listMatch;
    return (
      <span key={index}>
        {indent}
        <span className="yaml-tok-punc">{dash}</span>
        {highlightValue(rest, `${index}-v`)}
      </span>
    );
  }

  return <span key={index}>{line}</span>;
}

function highlightYaml(source: string, errorLine?: number): ReactNode[] {
  const lines = source.split('\n');
  return lines.map((line, index) => {
    const content = highlightLine(line, index);
    const node =
      errorLine && index + 1 === errorLine ? (
        <span key={index} className="yaml-err-line">
          {line === '' ? ' ' : content}
        </span>
      ) : (
        content
      );
    return (
      <span key={index}>
        {node}
        {index < lines.length - 1 ? '\n' : null}
      </span>
    );
  });
}

export function StudioYamlEditor({
  value,
  onChange,
  readOnly,
  error,
}: StudioYamlEditorProps) {
  const highlightRef = useRef<HTMLPreElement>(null);

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <pre
          ref={highlightRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 m-0 overflow-auto p-4 font-mono text-sm leading-relaxed whitespace-pre">
          <code>{highlightYaml(value, error?.line)}</code>
        </pre>
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
          className="caret-fg-primary absolute inset-0 resize-none overflow-auto bg-transparent p-4 font-mono text-sm leading-relaxed whitespace-pre text-transparent outline-none"
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
