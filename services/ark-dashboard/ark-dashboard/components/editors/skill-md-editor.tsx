'use client';

import {
  type ChangeEvent,
  type UIEvent,
  useEffect,
  useMemo,
  useRef,
} from 'react';

interface SkillMdEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

interface RegionToken {
  kind:
    | 'frontmatter-fence'
    | 'frontmatter-content'
    | 'fence-open'
    | 'fence-content'
    | 'fence-close'
    | 'prose'
    | 'blank';
  text: string;
}

interface InlineToken {
  text: string;
  className?: string;
}

const FENCE_RE = /^(```|~~~)/;

/**
 * Walks a SKILL.md document line by line and emits a class-tagged region for
 * each line, plus optional inline tokens for the fence-open line so the
 * `name=…` attribute can be highlighted as a chip.
 */
function tokenize(value: string): { region: RegionToken; inline?: InlineToken[] }[] {
  const lines = value.split('\n');
  const out: { region: RegionToken; inline?: InlineToken[] }[] = [];

  let i = 0;
  // Frontmatter (only counts at the very top, opened by `---`).
  if (lines.length > 0 && lines[0].trim() === '---') {
    out.push({
      region: { kind: 'frontmatter-fence', text: lines[0] },
    });
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') {
      out.push({
        region: { kind: 'frontmatter-content', text: lines[i] },
      });
      i += 1;
    }
    if (i < lines.length) {
      out.push({
        region: { kind: 'frontmatter-fence', text: lines[i] },
      });
      i += 1;
    }
  }

  let inFence = false;
  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = FENCE_RE.exec(line);

    if (!inFence && fenceMatch) {
      // Opening fence — split into delimiter + info string for inline tokens
      const delimiter = fenceMatch[1];
      const info = line.slice(delimiter.length);
      const inline: InlineToken[] = [
        { text: delimiter, className: 'text-emerald-600 dark:text-emerald-400 font-semibold' },
      ];
      // Highlight `name=…` chips inside the info string
      const NAME_ATTR_GLOBAL = /(\bname=("[^"]+"|'[^']+'|\S+))/g;
      let cursor = 0;
      for (const match of info.matchAll(NAME_ATTR_GLOBAL)) {
        const at = match.index ?? 0;
        if (at > cursor) {
          inline.push({ text: info.slice(cursor, at) });
        }
        inline.push({
          text: match[0],
          className:
            'rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1',
        });
        cursor = at + match[0].length;
      }
      if (cursor < info.length) inline.push({ text: info.slice(cursor) });

      out.push({
        region: { kind: 'fence-open', text: line },
        inline,
      });
      inFence = true;
    } else if (inFence && fenceMatch) {
      out.push({
        region: { kind: 'fence-close', text: line },
        inline: [
          { text: fenceMatch[1], className: 'text-emerald-600 dark:text-emerald-400 font-semibold' },
          { text: line.slice(fenceMatch[1].length) },
        ],
      });
      inFence = false;
    } else if (inFence) {
      out.push({ region: { kind: 'fence-content', text: line } });
    } else if (line.trim() === '') {
      out.push({ region: { kind: 'blank', text: line } });
    } else {
      out.push({ region: { kind: 'prose', text: line } });
    }
    i += 1;
  }

  return out;
}

const REGION_CLASS: Record<RegionToken['kind'], string> = {
  'frontmatter-fence': 'text-amber-600 dark:text-amber-400 font-semibold',
  'frontmatter-content': 'bg-amber-500/5 text-amber-900 dark:text-amber-200',
  'fence-open': 'bg-emerald-500/10',
  'fence-content': 'bg-emerald-500/5',
  'fence-close': 'bg-emerald-500/10',
  prose: '',
  blank: '',
};

export function SkillMdEditor({
  value,
  onChange,
  placeholder,
  className,
}: SkillMdEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const tokens = useMemo(() => tokenize(value), [value]);

  // Sync scroll position from textarea → highlight layer.
  const handleScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = target.scrollTop;
      preRef.current.scrollLeft = target.scrollLeft;
    }
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  // When the value is set programmatically (e.g. on edit-mode load), make sure
  // the highlight layer's scroll is reset too.
  useEffect(() => {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, [value]);

  return (
    <div
      className={`bg-card relative h-full overflow-hidden rounded-md border ${className ?? ''}`}>
      <pre
        ref={preRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 m-0 overflow-auto p-4 font-mono text-xs leading-5 whitespace-pre-wrap break-words">
        {tokens.map((tok, lineIndex) => (
          <div
            key={lineIndex}
            className={REGION_CLASS[tok.region.kind]}
            style={{ minHeight: '1.25rem' }}>
            {tok.inline ? (
              tok.inline.map((t, i) =>
                t.className ? (
                  <span key={i} className={t.className}>
                    {t.text}
                  </span>
                ) : (
                  <span key={i}>{t.text}</span>
                ),
              )
            ) : (
              <span>{tok.region.text || ' '}</span>
            )}
          </div>
        ))}
      </pre>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onScroll={handleScroll}
        spellCheck={false}
        placeholder={placeholder}
        className="text-foreground placeholder:text-muted-foreground/60 caret-foreground relative block h-full w-full resize-none bg-transparent p-4 font-mono text-xs leading-5 whitespace-pre-wrap break-words text-transparent outline-none"
      />
    </div>
  );
}
