import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import * as React from 'react';
import chalk from 'chalk';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface ChatTarget {
  type: 'agent' | 'model';
  name: string;
}

const ChatUI: React.FC = () => {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);
  const [target, setTarget] = React.useState<ChatTarget | null>(null);
  const [showTargetSelector, setShowTargetSelector] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Mock targets for now - will be fetched from API later
  const availableTargets = [
    { label: '🤖 Agent: weather', value: { type: 'agent', name: 'weather' } as ChatTarget },
    { label: '🤖 Agent: math', value: { type: 'agent', name: 'math' } as ChatTarget },
    { label: '🧠 Model: default', value: { type: 'model', name: 'default' } as ChatTarget },
  ];

  useInput((input, key) => {
    if (key.escape) {
      if (showTargetSelector) {
        process.exit(0);
      } else {
        setShowTargetSelector(true);
        setTarget(null);
        setMessages([]);
      }
    }
  });

  const handleTargetSelect = (item: { value: ChatTarget }) => {
    setTarget(item.value);
    setShowTargetSelector(false);
    setMessages([
      {
        role: 'system',
        content: `Connected to ${item.value.type}: ${item.value.name}`,
        timestamp: new Date(),
      },
    ]);
  };

  const handleSubmit = async (value: string) => {
    if (!value.trim()) return;

    const userMessage: Message = {
      role: 'user',
      content: value,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);
    setError(null);

    try {
      // TODO: Implement actual API call to agent/model
      // For now, mock a response
      setTimeout(() => {
        const assistantMessage: Message = {
          role: 'assistant',
          content: `This is a mock response from ${target?.name}. Real integration coming soon!`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setIsTyping(false);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsTyping(false);
    }
  };

  const renderMessage = (msg: Message, index: number) => {
    const isUser = msg.role === 'user';
    const isSystem = msg.role === 'system';
    
    return (
      <Box key={index} flexDirection="column" marginBottom={1}>
        <Box>
          <Text color={isUser ? 'cyan' : isSystem ? 'gray' : 'green'} bold>
            {isUser ? 'You' : isSystem ? 'System' : target?.name}
          </Text>
          <Text color="gray"> • {msg.timestamp.toLocaleTimeString()}</Text>
        </Box>
        <Box marginLeft={2}>
          <Text>{msg.content}</Text>
        </Box>
      </Box>
    );
  };

  if (showTargetSelector) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color="cyan" bold>
            💬 ARK Chat Interface
          </Text>
        </Box>
        <Text color="gray">Select a target to chat with:</Text>
        <Box marginTop={1}>
          <SelectInput
            items={availableTargets}
            onSelect={handleTargetSelect}
          />
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            Press ESC to exit
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      <Box
        flexDirection="row"
        borderStyle="single"
        borderColor="cyan"
        paddingX={1}
        marginBottom={1}
      >
        <Text color="cyan" bold>
          💬 Chat with {target?.type}: {target?.name}
        </Text>
        <Text color="gray"> (ESC to change target)</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} marginBottom={1}>
        {messages.length === 0 ? (
          <Text color="gray">Start typing to begin the conversation...</Text>
        ) : (
          messages.map(renderMessage)
        )}
        {isTyping && (
          <Box>
            <Text color="gray">
              {target?.name} is typing...
            </Text>
          </Box>
        )}
        {error && (
          <Box>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}
      </Box>

      <Box flexDirection="row">
        <Text color="cyan" bold>
          › 
        </Text>
        <Box marginLeft={1} flexGrow={1}>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Type your message..."
          />
        </Box>
      </Box>
    </Box>
  );
};

export default ChatUI;