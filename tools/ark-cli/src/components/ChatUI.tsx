import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import * as React from 'react';
import { ChatClient, QueryTarget } from '../lib/chatClient.js';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

const ChatUI: React.FC = () => {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);
  const [target, setTarget] = React.useState<QueryTarget | null>(null);
  const [showTargetSelector, setShowTargetSelector] = React.useState(true);
  const [availableTargets, setAvailableTargets] = React.useState<QueryTarget[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  
  const chatClientRef = React.useRef<ChatClient | undefined>(undefined);

  // Initialize chat client and fetch targets on mount
  React.useEffect(() => {
    const initializeChat = async () => {
      try {
        const client = new ChatClient();
        await client.initialize();
        chatClientRef.current = client;
        
        const targets = await client.getQueryTargets();
        setAvailableTargets(targets);
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize chat');
        setIsLoading(false);
      }
    };

    initializeChat();
  }, []);

  const handleTargetSelect = (item: { value: QueryTarget | null }) => {
    if (item.value === null) {
      process.exit(0);
      return;
    }
    
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
    if (!value.trim() || !target || !chatClientRef.current) return;

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
      // Convert messages to format expected by OpenAI API
      const apiMessages = messages
        .filter(msg => msg.role !== 'system' || msg === messages[0]) // Keep only first system message
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));
      
      // Add the new user message
      apiMessages.push({
        role: 'user' as const,
        content: value
      });

      // Send message and get response
      let responseContent = '';
      await chatClientRef.current.sendMessage(
        target.id,
        apiMessages,
        (chunk) => {
          // Handle streaming response
          responseContent += chunk;
          // Update the UI with streaming content
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            
            if (lastMessage && lastMessage.role === 'assistant') {
              // Update existing assistant message
              lastMessage.content = responseContent;
            } else {
              // Add new assistant message
              newMessages.push({
                role: 'assistant',
                content: responseContent,
                timestamp: new Date(),
              });
            }
            return newMessages;
          });
        }
      );

      setIsTyping(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setIsTyping(false);
      
      // Add error as a system message
      setMessages((prev) => [...prev, {
        role: 'system',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to send message'}`,
        timestamp: new Date(),
      }]);
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
    // Prepare items for SelectInput
    const selectItems = [
      ...availableTargets.map(t => ({
        label: `${t.type === 'agent' ? '🤖' : t.type === 'model' ? '🧠' : '🔧'} ${t.type}: ${t.name}`,
        value: t
      })),
      { label: '❌ Exit', value: null }
    ];

    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color="cyan" bold>
            💬 ARK Chat Interface
          </Text>
        </Box>
        
        {isLoading ? (
          <Text color="yellow">Loading available targets...</Text>
        ) : error ? (
          <Box flexDirection="column">
            <Text color="red">Error: {error}</Text>
            <Text color="gray">Using fallback targets...</Text>
          </Box>
        ) : (
          <>
            <Text color="gray">Select a target to chat with:</Text>
            <Box marginTop={1}>
              <SelectInput
                items={selectItems}
                onSelect={handleTargetSelect}
              />
            </Box>
          </>
        )}
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
        <Text color="gray"> (Ctrl+C to exit)</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} marginBottom={1}>
        {messages.length === 0 ? (
          <Text color="gray">Start typing to begin the conversation...</Text>
        ) : (
          messages.map(renderMessage)
        )}
        {isTyping && !messages.find(m => m.role === 'assistant' && m.timestamp.getTime() > Date.now() - 1000) && (
          <Box>
            <Text color="gray">
              {target?.name} is typing...
            </Text>
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