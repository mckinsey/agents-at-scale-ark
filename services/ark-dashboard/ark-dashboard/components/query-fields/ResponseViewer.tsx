"use client";

import { useEffect, useMemo, useState } from "react";
import JsonDisplay from "@/components/JsonDisplay";
import { ResponseForView, responseIsJson, ViewMode, pickDefaultView } from "@/lib/utils/jsons";

type Props = { response: ResponseForView; initialMode?: ViewMode; userInput?: string };

function ViewToggle({
  mode, setMode, showJson
}:{ mode: ViewMode; setMode:(m: ViewMode)=>void; showJson:boolean }) {
  return (
    <div className="inline-flex gap-2 mb-2">
      <button className={`px-2 py-1 rounded ${mode === "text" ? "bg-gray-800 text-white" : "bg-gray-200"}`} onClick={() => setMode("text")}>Text</button>
      <button className={`px-2 py-1 rounded ${mode === "markdown" ? "bg-gray-800 text-white" : "bg-gray-200"}`} onClick={() => setMode("markdown")}>Markdown</button>
      {showJson && (
        <button className={`px-2 py-1 rounded ${mode === "json" ? "bg-gray-800 text-white" : "bg-gray-200"}`} onClick={() => setMode("json")}>JSON</button>
      )}
      <button className={`px-2 py-1 rounded ${mode === "chat" ? "bg-gray-800 text-white" : "bg-gray-200"}`} onClick={() => setMode("chat")}>Chat</button>
    </div>
  );
}

export default function ResponseViewer({ response, initialMode, userInput }: Props) {
  // Helper function to clean user input
  const cleanUserInput = (input: string): string => {
    if (input.toLowerCase().startsWith('user:')) {
      return input.substring(5).trim()
    }
    return input
  }
  const showJson = responseIsJson(response);
  const [mode, setMode] = useState<ViewMode>(initialMode ?? pickDefaultView(response, "text"));

  useEffect(() => {
    setMode(initialMode ?? pickDefaultView(response, "text"));
  }, [response, initialMode]);

  const textBody = useMemo(() => {
    if (typeof response.body === "string") return response.body;
    try { return JSON.stringify(response.body, null, 2); } catch { return String(response.body); }
  }, [response.body]);

  const jsonValue = response.rawJson ?? response.body;

  return (
    <div className="flex flex-col">
      <ViewToggle mode={mode} setMode={setMode} showJson={showJson} />
      {mode === "json" && showJson && <JsonDisplay value={jsonValue} />}
      {mode === "markdown" && <pre className="whitespace-pre-wrap break-words">{textBody}</pre>}
      {mode === "text" && <pre className="whitespace-pre-wrap break-words">{textBody}</pre>}
      {mode === "chat" && (
        <div className="space-y-3 px-3 pb-3 pt-2 max-h-96 overflow-auto bg-gray-50 dark:bg-gray-900">
          {/* User message bubble */}
          <div className="flex justify-end">
            <div className="bg-blue-500 text-white rounded-2xl rounded-br-md px-4 py-2 max-w-[70%] shadow-sm">
              <div className="text-sm whitespace-pre-wrap break-words">{cleanUserInput(userInput || "")}</div>
            </div>
          </div>
          
          
          {/* Assistant message bubble */}
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-2xl rounded-bl-md px-4 py-2 max-w-[70%] shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="text-sm whitespace-pre-wrap break-words">{textBody}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
