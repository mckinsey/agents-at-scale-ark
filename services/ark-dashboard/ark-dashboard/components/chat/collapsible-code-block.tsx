'use client';

import { useAtomValue } from 'jotai';
import { type ReactNode, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  oneDark,
  oneLight,
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import { isExperimentalDarkModeEnabledAtom } from '@/atoms/experimental-features';
import { ChevronDown, ChevronRight } from '@/components/icons';
import { cn } from '@/lib/utils';

interface CollapsibleCodeBlockProps {
  language: string;
  className?: string;
  defaultCollapsed?: boolean;
  children: ReactNode;
}

export function CollapsibleCodeBlock({
  language,
  className,
  defaultCollapsed = false,
  children,
}: Readonly<CollapsibleCodeBlockProps>) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const isDarkMode = useAtomValue(isExperimentalDarkModeEnabledAtom);
  const code = String(children).replace(/\n$/, '');

  return (
    <div className="bg-surface-bg-tertiary my-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        className="focus-visible:ring-stroke-status-focus text-fg-secondary hover:text-fg-primary flex w-full items-center gap-2 px-4 py-2 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-inset">
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <span>{language}</span>
      </button>
      <div className={cn(!open && 'hidden')}>
        <SyntaxHighlighter
          language={language}
          style={isDarkMode ? oneDark : oneLight}
          customStyle={{
            margin: 0,
            padding: '1rem',
            fontSize: '0.875rem',
            background: 'transparent',
          }}
          codeTagProps={{ className }}>
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
