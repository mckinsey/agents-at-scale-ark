export const createTextChunk = (content: string, index: number = 0) => ({
  id: `chatcmpl-${Date.now()}`,
  object: 'chat.completion.chunk',
  created: Date.now(),
  model: 'gpt-4',
  choices: [{ index, delta: { content } }]
});

export const createToolCallChunk = (toolName: string, args: string, index: number = 0) => ({
  id: `chatcmpl-${Date.now()}`,
  object: 'chat.completion.chunk',
  created: Date.now(),
  model: 'gpt-4',
  choices: [{
    index,
    delta: {
      tool_calls: [{
        index: 0,
        id: `call_${Date.now()}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: args
        }
      }]
    }
  }]
});

export const createFinishChunk = (reason: string = 'stop') => ({
  id: `chatcmpl-${Date.now()}`,
  object: 'chat.completion.chunk',
  created: Date.now(),
  model: 'gpt-4',
  choices: [{
    index: 0,
    delta: {},
    finish_reason: reason
  }]
});
