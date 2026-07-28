'use client';

import { type CSSProperties, type ReactNode, useRef } from 'react';

import { cn } from '@/lib/utils';

const INDENT = '  ';

const SHARED_TEXT_STYLE: CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.9rem',
  lineHeight: '1.7',
  padding: '1.25rem',
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  tabSize: 2,
  border: 0,
  letterSpacing: 'normal',
};

const CODE_STYLE: CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 'inherit',
  lineHeight: 'inherit',
  letterSpacing: 'inherit',
  whiteSpace: 'inherit',
  wordBreak: 'inherit',
  padding: 0,
  background: 'transparent',
};

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s*#{1,6}(\s.*)?$/;
const BULLET = /^(\s*)([-*+]\s|\d+\.\s)(.*)$/;
const LINK = /^(\[)([^\]]*)(\]\()([^)]*)(\))$/;

type InlineTokenType = 'code' | 'link' | 'emphasis';

interface InlineToken {
  index: number;
  token: string;
  type: InlineTokenType;
}

function isWhitespace(char: string): boolean {
  return char.trim() === '';
}

function parseBlockquote(
  line: string,
): { marker: string; rest: string } | null {
  let index = 0;
  while (index < line.length && isWhitespace(line[index])) {
    index += 1;
  }
  if (line[index] !== '>') {
    return null;
  }
  while (line[index] === '>') {
    index += 1;
  }
  if (index < line.length && isWhitespace(line[index])) {
    index += 1;
  }
  return { marker: line.slice(0, index), rest: line.slice(index) };
}

function scanCode(text: string, start: number): number {
  if (text[start] !== '`') {
    return -1;
  }
  let index = start + 1;
  while (index < text.length && text[index] !== '`' && text[index] !== '\n') {
    index += 1;
  }
  return text[index] === '`' ? index + 1 : -1;
}

function scanLink(text: string, start: number): number {
  if (text[start] !== '[') {
    return -1;
  }
  let index = start + 1;
  while (index < text.length && text[index] !== ']' && text[index] !== '\n') {
    index += 1;
  }
  if (text[index] !== ']') {
    return -1;
  }
  index += 1;
  if (text[index] !== '(') {
    return -1;
  }
  index += 1;
  while (index < text.length && text[index] !== ')' && text[index] !== '\n') {
    index += 1;
  }
  return text[index] === ')' ? index + 1 : -1;
}

function scanBold(text: string, start: number): number {
  if (text[start] !== '*' || text[start + 1] !== '*') {
    return -1;
  }
  let index = start + 2;
  let inner = 0;
  while (index < text.length && text[index] !== '*' && text[index] !== '\n') {
    index += 1;
    inner += 1;
  }
  if (inner > 0 && text[index] === '*' && text[index + 1] === '*') {
    return index + 2;
  }
  return -1;
}

function scanWrapped(text: string, start: number, delimiter: string): number {
  if (text[start] !== delimiter) {
    return -1;
  }
  let index = start + 1;
  let inner = 0;
  while (
    index < text.length &&
    text[index] !== delimiter &&
    text[index] !== '\n'
  ) {
    index += 1;
    inner += 1;
  }
  if (inner > 0 && text[index] === delimiter) {
    return index + 1;
  }
  return -1;
}

function findInlineTokens(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    let end = -1;
    let type: InlineTokenType | null = null;
    if (char === '`') {
      end = scanCode(text, index);
      type = 'code';
    } else if (char === '[') {
      end = scanLink(text, index);
      type = 'link';
    } else if (char === '*') {
      end = scanBold(text, index);
      if (end === -1) {
        end = scanWrapped(text, index, '*');
      }
      type = 'emphasis';
    } else if (char === '_') {
      end = scanWrapped(text, index, '_');
      type = 'emphasis';
    }
    if (end !== -1 && type !== null) {
      tokens.push({ index, token: text.slice(index, end), type });
      index = end;
    } else {
      index += 1;
    }
  }
  return tokens;
}

function renderEmphasis(token: string, key: string): ReactNode {
  const marker = token.startsWith('**') ? '**' : token[0];
  const inner = token.slice(marker.length, token.length - marker.length);
  return (
    <span key={key}>
      <span className="md-tok-punc">{marker}</span>
      {inner}
      <span className="md-tok-punc">{marker}</span>
    </span>
  );
}

function renderLink(token: string, key: string): ReactNode {
  const match = LINK.exec(token);
  if (!match) {
    return token;
  }
  const [, open, text, mid, url, close] = match;
  return (
    <span key={key}>
      <span className="md-tok-punc">{open}</span>
      {text}
      <span className="md-tok-punc">{mid}</span>
      <span className="md-tok-link">{url}</span>
      <span className="md-tok-punc">{close}</span>
    </span>
  );
}

function highlightInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let count = 0;
  for (const { index, token, type } of findInlineTokens(text)) {
    if (index > last) {
      nodes.push(text.slice(last, index));
    }
    const key = `${keyPrefix}-${count++}`;
    if (type === 'code') {
      nodes.push(
        <span key={key} className="md-tok-code">
          {token}
        </span>,
      );
    } else if (type === 'link') {
      nodes.push(renderLink(token, key));
    } else {
      nodes.push(renderEmphasis(token, key));
    }
    last = index + token.length;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}

function highlightTextLine(line: string, index: number): ReactNode {
  if (HEADING.test(line)) {
    return (
      <span key={index} className="md-tok-heading">
        {line}
      </span>
    );
  }

  const quote = parseBlockquote(line);
  if (quote) {
    const { marker, rest } = quote;
    return (
      <span key={index}>
        <span className="md-tok-punc">{marker}</span>
        {highlightInline(rest, `${index}`)}
      </span>
    );
  }

  const bullet = BULLET.exec(line);
  if (bullet) {
    const [, indent, marker, rest] = bullet;
    return (
      <span key={index}>
        {indent}
        <span className="md-tok-punc">{marker}</span>
        {highlightInline(rest, `${index}`)}
      </span>
    );
  }

  return <span key={index}>{highlightInline(line, `${index}`)}</span>;
}

function highlightMarkdown(source: string): ReactNode[] {
  const lines = source.split('\n');
  let inFence = false;
  return lines.map((line, index) => {
    let content: ReactNode;
    const isFence = FENCE.test(line);
    if (inFence) {
      content = (
        <span key={index} className="md-tok-code">
          {line}
        </span>
      );
      if (isFence) {
        inFence = false;
      }
    } else if (isFence) {
      inFence = true;
      content = (
        <span key={index} className="md-tok-code">
          {line}
        </span>
      );
    } else {
      content = highlightTextLine(line, index);
    }
    return (
      <span key={index}>
        {content}
        {index < lines.length - 1 ? '\n' : null}
      </span>
    );
  });
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  'data-testid'?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  disabled = false,
  autoFocus = false,
  className,
  'data-testid': dataTestId,
}: Readonly<MarkdownEditorProps>) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = event.currentTarget.scrollTop;
      highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') {
      return;
    }
    event.preventDefault();
    const textarea = event.currentTarget;
    const { selectionStart, selectionEnd } = textarea;
    const next =
      value.slice(0, selectionStart) + INDENT + value.slice(selectionEnd);
    onChange(next);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const caret = selectionStart + INDENT.length;
        textareaRef.current.selectionStart = caret;
        textareaRef.current.selectionEnd = caret;
      }
    });
  };

  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)}>
      <pre
        ref={highlightRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-auto"
        style={{ ...SHARED_TEXT_STYLE, background: 'transparent' }}>
        <code style={CODE_STYLE}>{highlightMarkdown(value)}</code>
      </pre>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={event => onChange(event.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        autoFocus={autoFocus}
        data-testid={dataTestId}
        style={{ ...SHARED_TEXT_STYLE, color: 'transparent' }}
        className="caret-foreground placeholder:text-muted-foreground absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent outline-none"
      />
    </div>
  );
}
