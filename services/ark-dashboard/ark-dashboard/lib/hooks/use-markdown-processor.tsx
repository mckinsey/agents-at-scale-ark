import mermaid from 'mermaid';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Initialize mermaid
if (typeof window !== 'undefined') {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      primaryColor: '#3b82f6',
      primaryTextColor: '#ffffff',
      primaryBorderColor: '#1f2937',
      lineColor: '#374151',
      secondaryColor: '#1f2937',
      tertiaryColor: '#111827',
    },
  });
}

export const useMarkdownProcessor = (content: string) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children, ...props }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
            {...props}>
            {children}
          </a>
        ),
        h1: ({ children, ...props }) => (
          <h1 className="mt-6 mb-4 text-2xl font-bold first:mt-0" {...props}>
            {children}
          </h1>
        ),
        h2: ({ children, ...props }) => (
          <h2 className="mt-5 mb-3 text-xl font-bold first:mt-0" {...props}>
            {children}
          </h2>
        ),
        h3: ({ children, ...props }) => (
          <h3 className="mt-4 mb-2 text-lg font-bold first:mt-0" {...props}>
            {children}
          </h3>
        ),
        h4: ({ children, ...props }) => (
          <h4 className="mt-3 mb-2 text-base font-bold first:mt-0" {...props}>
            {children}
          </h4>
        ),
        h5: ({ children, ...props }) => (
          <h5 className="mt-3 mb-2 text-sm font-bold first:mt-0" {...props}>
            {children}
          </h5>
        ),
        h6: ({ children, ...props }) => (
          <h6 className="mt-3 mb-2 text-xs font-bold first:mt-0" {...props}>
            {children}
          </h6>
        ),
        p: ({ children, ...props }) => (
          <p className="mb-4 last:mb-0" {...props}>
            {children}
          </p>
        ),
        strong: ({ children, ...props }) => (
          <strong className="font-bold" {...props}>
            {children}
          </strong>
        ),
        em: ({ children, ...props }) => (
          <em className="italic" {...props}>
            {children}
          </em>
        ),
        code: props => {
          const { className, children } = props;
          const inline = !className?.includes('language-');
          const match = /language-(\w+)/.exec(className || '');
          const isMermaid = match && match[1] === 'mermaid';

          if (!inline && isMermaid) {
            return (
              <MermaidCode content={String(children).replace(/\n$/, '')} />
            );
          }

          if (!inline) {
            return (
              <div className="my-4 overflow-hidden rounded-md bg-gray-900 dark:bg-gray-800">
                <pre className="overflow-x-auto p-4 text-sm text-gray-100">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            );
          }

          return (
            <code
              className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs dark:bg-gray-800"
              {...props}>
              {children}
            </code>
          );
        },
        ul: ({ children, ...props }) => (
          <ul className="mb-4 list-inside list-disc space-y-1 pl-4" {...props}>
            {children}
          </ul>
        ),
        ol: ({ children, ...props }) => (
          <ol
            className="mb-4 list-inside list-decimal space-y-1 pl-4"
            {...props}>
            {children}
          </ol>
        ),
        li: ({ children, ...props }) => (
          <li className="text-sm" {...props}>
            {children}
          </li>
        ),
        table: ({ children, ...props }) => (
          <div className="my-4 overflow-x-auto rounded-md border">
            <table
              className="min-w-full divide-y divide-gray-200 dark:divide-gray-700"
              {...props}>
              {children}
            </table>
          </div>
        ),
        thead: ({ children, ...props }) => (
          <thead className="bg-gray-50 dark:bg-gray-800" {...props}>
            {children}
          </thead>
        ),
        th: ({ children, ...props }) => (
          <th
            className="px-4 py-2 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400"
            {...props}>
            {children}
          </th>
        ),
        td: ({ children, ...props }) => (
          <td
            className="border-t border-gray-200 px-4 py-2 text-sm text-gray-900 dark:border-gray-700 dark:text-gray-100"
            {...props}>
            {children}
          </td>
        ),
        blockquote: ({ children, ...props }) => (
          <blockquote
            className="my-4 border-l-4 border-gray-300 pl-4 text-gray-600 italic dark:border-gray-600 dark:text-gray-400"
            {...props}>
            {children}
          </blockquote>
        ),
        hr: props => (
          <hr
            className="my-6 border-gray-200 dark:border-gray-700"
            {...props}
          />
        ),
      }}>
      {content}
    </ReactMarkdown>
  );
};

const MermaidCode = ({ content }: { content: string }) => {
  const [showMermaidPreview, setShowMermaidPreview] = useState(false);

  return (
    <div className="my-4">
      <div className="overflow-hidden rounded-md bg-gray-900 dark:bg-gray-800">
        <pre className="overflow-x-auto p-4 text-sm text-gray-100">
          <code>{content}</code>
        </pre>
      </div>
      <div className="mt-2">
        <button
          type="button"
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white transition-colors hover:bg-blue-700"
          onClick={() => setShowMermaidPreview(true)}>
          View Diagram
        </button>
        {showMermaidPreview && (
          <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
            <div className="max-h-[80vh] max-w-4xl overflow-auto rounded-lg bg-white p-6 dark:bg-gray-800">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold">Mermaid Diagram</h3>
                <button
                  onClick={() => setShowMermaidPreview(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  ✕
                </button>
              </div>
              <MermaidDiagram content={content} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MermaidDiagram = ({ content }: { content: string }) => {
  const [diagram, setDiagram] = useState<string | boolean>(true);

  useEffect(() => {
    const render = async () => {
      const id = `mermaid-svg-${Math.round(Math.random() * 10000000)}`;

      try {
        if (await mermaid.parse(content, { suppressErrors: true })) {
          const { svg } = await mermaid.render(id, content);
          setDiagram(svg);
        } else {
          setDiagram(false);
        }
      } catch {
        setDiagram(false);
      }
    };
    render();
  }, [content]);

  if (diagram === true) {
    return <p className="py-4 text-center">Rendering diagram...</p>;
  } else if (diagram === false) {
    return (
      <p className="py-4 text-center text-red-500">Unable to render diagram.</p>
    );
  } else {
    return <div dangerouslySetInnerHTML={{ __html: diagram ?? '' }} />;
  }
};
