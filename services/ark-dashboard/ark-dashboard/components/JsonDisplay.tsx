import { useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

type JsonDisplayProps = {
  value: unknown | string;
  maxPreviewBytes?: number;
  className?: string;
  filename?: string;
};

function tryParse(text: string) {
  try { return JSON.parse(text); } catch { return undefined; }
}

function safePretty(value: unknown, space = 2) {
  try {
    if (typeof value === "string") {
      const parsed = tryParse(value);
      return parsed ? JSON.stringify(parsed, null, space) : value;
    }
    return JSON.stringify(value, null, space);
  } catch {
    return String(value);
  }
}

export default function JsonDisplay({
  value,
  maxPreviewBytes = 50_000,
  className,
  filename = "response.json"
}: JsonDisplayProps) {
  const [expanded, setExpanded] = useState(false);
  const pretty = useMemo(() => safePretty(value, 2), [value]);

  const tooBig = pretty.length > maxPreviewBytes;
  const shown = expanded || !tooBig ? pretty : pretty.slice(0, maxPreviewBytes) + "\n… (truncated)";

  const copy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(pretty);
      } else {
        // Fallback for environments without clipboard API
        const textArea = document.createElement("textarea");
        textArea.value = pretty;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const download = () => {
    const blob = new Blob([pretty], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const parsed = typeof value === "string" ? tryParse(value) : value;

  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-2">
        <button className="px-2 py-1 rounded bg-black text-white border border-gray-600 hover:bg-gray-800" onClick={copy}>Copy</button>
        <button className="px-2 py-1 rounded bg-black text-white border border-gray-600 hover:bg-gray-800" onClick={download}>Download</button>
        {tooBig && (
          <button className="px-2 py-1 rounded bg-gray-200" onClick={() => setExpanded(v => !v)}>
            {expanded ? "Show less" : "Load full"}
          </button>
        )}
      </div>
      <div className="overflow-visible">
        <SyntaxHighlighter 
          language="json"
          style={oneDark}
          customStyle={{
            background: 'transparent',
            color: 'white',
            margin: 0,
            padding: 0
          }}
          codeTagProps={{
            style: {
              color: 'white'
            }
          }}
        >
          {shown}
        </SyntaxHighlighter>
      </div>
      {!parsed && (
        <div className="mt-2 text-amber-700 text-sm">Couldn&apos;t parse JSON. Showing raw text.</div>
      )}
    </div>
  );
}
