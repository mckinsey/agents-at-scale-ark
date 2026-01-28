'use client';

import { useAtomValue } from 'jotai';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  oneDark,
  oneLight,
} from 'react-syntax-highlighter/dist/esm/styles/prism';

import { isExperimentalDarkModeEnabledAtom } from '@/atoms/experimental-features';

const customLightTheme = {
  ...oneLight,
  'pre[class*="language-"]': {
    ...oneLight['pre[class*="language-"]'],
    background: '#f5f6f6',
  },
  'code[class*="language-"]': {
    ...oneLight['code[class*="language-"]'],
    background: '#f5f6f6',
  },
};

const customDarkTheme = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: '#1b1e2a',
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: '#1b1e2a',
  },
};

interface CodeViewerProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  wrapLongLines?: boolean;
  fontSize?: string;
}

export function CodeViewer({
  code,
  language = 'yaml',
  showLineNumbers = false,
  fontSize = '0.75rem',
}: CodeViewerProps) {
  const isDarkMode = useAtomValue(isExperimentalDarkModeEnabledAtom);

  return (
    <div className="border">
      <SyntaxHighlighter
        language={language}
        customStyle={{
          margin: 0,
          fontSize,
          padding: '1rem',
        }}
        style={isDarkMode ? customDarkTheme : customLightTheme}
        showLineNumbers={showLineNumbers}
        lineProps={{
          style: { wordBreak: 'break-all', whiteSpace: 'pre-wrap' },
        }}
        wrapLines={true}>
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
