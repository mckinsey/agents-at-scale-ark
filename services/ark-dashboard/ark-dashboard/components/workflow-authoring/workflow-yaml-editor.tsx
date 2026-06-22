'use client';

interface WorkflowYamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function WorkflowYamlEditor({
  value,
  onChange,
  readOnly = false,
}: Readonly<WorkflowYamlEditorProps>) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      readOnly={readOnly}
      spellCheck={false}
      placeholder="The workflow YAML will appear here as the agent writes it. You can also edit it directly."
      className="bg-muted/30 h-full w-full resize-none rounded-md border p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-1 read-only:opacity-70"
    />
  );
}
