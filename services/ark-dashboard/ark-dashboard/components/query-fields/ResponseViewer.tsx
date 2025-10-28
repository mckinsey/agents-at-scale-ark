'use client';

import { useEffect, useMemo, useState } from 'react';

import JsonDisplay from '@/components/JsonDisplay';
import type { ResponseForView, ViewMode } from '@/lib/utils/jsons';
import { pickDefaultView, responseIsJson } from '@/lib/utils/jsons';

type Props = {
  response: ResponseForView;
  initialMode?: ViewMode;
  userInput?: string;
};

function ViewToggle({
  mode,
  setMode,
  showJson,
}: {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  showJson: boolean;
}) {
  return (
    <div className="mb-2 inline-flex gap-2">
      <button
        className={`rounded px-2 py-1 ${mode === 'text' ? 'bg-gray-800 text-white' : 'bg-gray-200'}`}
        onClick={() => setMode('text')}>
        Text
      </button>
      <button
        className={`rounded px-2 py-1 ${mode === 'markdown' ? 'bg-gray-800 text-white' : 'bg-gray-200'}`}
        onClick={() => setMode('markdown')}>
        Markdown
      </button>
      {showJson && (
        <button
          className={`rounded px-2 py-1 ${mode === 'json' ? 'bg-gray-800 text-white' : 'bg-gray-200'}`}
          onClick={() => setMode('json')}>
          JSON
        </button>
      )}
      <button
        className={`rounded px-2 py-1 ${mode === 'chat' ? 'bg-gray-800 text-white' : 'bg-gray-200'}`}
        onClick={() => setMode('chat')}>
        Chat
      </button>
    </div>
  );
}

export default function ResponseViewer({
  response,
  initialMode,
  userInput,
}: Props) {
  const showJson = responseIsJson(response);
  const [mode, setMode] = useState<ViewMode>(
    initialMode ?? pickDefaultView(response, 'text'),
  );

  useEffect(() => {
    setMode(initialMode ?? pickDefaultView(response, 'text'));
  }, [response, initialMode]);

  const textBody = useMemo(() => {
    if (typeof response.body === 'string') return response.body;
    try {
      return JSON.stringify(response.body, null, 2);
    } catch {
      return String(response.body);
    }
  }, [response.body]);

  const jsonValue = response.rawJson ?? response.body;

  return (
    <div className="flex flex-col">
      <ViewToggle mode={mode} setMode={setMode} showJson={showJson} />
      {mode === 'json' && showJson && <JsonDisplay value={jsonValue} />}
      {mode === 'markdown' && (
        <pre className="break-words whitespace-pre-wrap">{textBody}</pre>
      )}
      {mode === 'text' && (
        <pre className="break-words whitespace-pre-wrap">{textBody}</pre>
      )}
      {mode === 'chat' && (
        <div className="max-h-96 space-y-3 overflow-auto bg-gray-50 px-3 pt-2 pb-3 dark:bg-gray-900">
          {/* User message bubble */}
          <div className="flex justify-end">
            <div className="max-w-[70%] rounded-2xl rounded-br-md bg-blue-500 px-4 py-2 text-white shadow-sm">
              <div className="text-sm break-words whitespace-pre-wrap">
                {userInput || ''}
              </div>
            </div>
          </div>

          {/* Assistant message bubble */}
          <div className="flex justify-start">
            <div className="max-w-[70%] rounded-2xl rounded-bl-md border border-gray-200 bg-white px-4 py-2 text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              <div className="text-sm break-words whitespace-pre-wrap">
                {textBody}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
