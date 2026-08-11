export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id: string;
        type: 'function';
        function: {name: string; arguments: string};
      }>;
    };
    finish_reason?: string;
  }>;
}

export const createTextChunk = (
  content: string,
  index: number = 0
): ChatCompletionChunk => ({
  id: `chatcmpl-${Date.now()}`,
  object: 'chat.completion.chunk',
  created: Date.now(),
  model: 'gpt-4',
  choices: [{index, delta: {content}}],
});

export const createToolCallChunk = (
  toolName: string,
  args: string,
  index: number = 0
): ChatCompletionChunk => ({
  id: `chatcmpl-${Date.now()}`,
  object: 'chat.completion.chunk',
  created: Date.now(),
  model: 'gpt-4',
  choices: [
    {
      index,
      delta: {
        tool_calls: [
          {
            index: 0,
            id: `call_${Date.now()}`,
            type: 'function',
            function: {
              name: toolName,
              arguments: args,
            },
          },
        ],
      },
    },
  ],
});

export const createFinishChunk = (
  reason: string = 'stop'
): ChatCompletionChunk => ({
  id: `chatcmpl-${Date.now()}`,
  object: 'chat.completion.chunk',
  created: Date.now(),
  model: 'gpt-4',
  choices: [
    {
      index: 0,
      delta: {},
      finish_reason: reason,
    },
  ],
});
