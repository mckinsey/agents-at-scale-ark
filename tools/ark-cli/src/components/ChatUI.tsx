import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import * as React from 'react';
import { ChatClient, QueryTarget } from '../lib/chatClient.js';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  targetName?: string;  // Store the target name with the message
}

interface ChatUIProps {
  initialTargetId?: string;
}

const ChatUI: React.FC<ChatUIProps> = ({ initialTargetId }) => {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);
  const [target, setTarget] = React.useState<QueryTarget | null>(null);
  const [showTargetSelector, setShowTargetSelector] = React.useState(!initialTargetId);
  const [availableTargets, setAvailableTargets] = React.useState<QueryTarget[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [targetIndex, setTargetIndex] = React.useState(0);
  
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
        
        if (initialTargetId) {
          // If initialTargetId is provided, find and set the target
          const matchedTarget = targets.find(t => t.id === initialTargetId);
          const matchedIndex = targets.findIndex(t => t.id === initialTargetId);
          if (matchedTarget) {
            setTarget(matchedTarget);
            setTargetIndex(matchedIndex >= 0 ? matchedIndex : 0);
            setShowTargetSelector(false);
            setMessages([]);
          } else {
            // If target not found, show selector
            setShowTargetSelector(true);
            setError(`Target "${initialTargetId}" not found`);
          }
        } else if (targets.length > 0) {
          // No initial target specified - auto-select first available
          // Priority: agents > models > tools
          const agents = targets.filter(t => t.type === 'agent');
          const models = targets.filter(t => t.type === 'model');
          const tools = targets.filter(t => t.type === 'tool');
          
          let selectedTarget: QueryTarget | null = null;
          let selectedIndex = 0;
          
          if (agents.length > 0) {
            selectedTarget = agents[0];
            selectedIndex = targets.findIndex(t => t.id === agents[0].id);
          } else if (models.length > 0) {
            selectedTarget = models[0];
            selectedIndex = targets.findIndex(t => t.id === models[0].id);
          } else if (tools.length > 0) {
            selectedTarget = tools[0];
            selectedIndex = targets.findIndex(t => t.id === tools[0].id);
          }
          
          if (selectedTarget) {
            setTarget(selectedTarget);
            setTargetIndex(selectedIndex);
            setShowTargetSelector(false);
            setMessages([]);
          } else {
            setError('No targets available');
          }
        } else {
          setError('No agents, models, or tools available');
        }
        
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize chat');
        setIsLoading(false);
      }
    };

    initializeChat();
  }, [initialTargetId]);

  // Handle shift+tab to cycle through targets
  useInput((input, key) => {
    if (!showTargetSelector && key.shift && key.tab && availableTargets.length > 0) {
      // Cycle to next target
      const nextIndex = (targetIndex + 1) % availableTargets.length;
      const nextTarget = availableTargets[nextIndex];
      
      setTargetIndex(nextIndex);
      setTarget(nextTarget);
    }
  });

  const handleTargetSelect = (item: { value: QueryTarget | null }) => {
    if (item.value === null) {
      process.exit(0);
      return;
    }
    
    const selectedIndex = availableTargets.findIndex(t => t.id === item.value!.id);
    setTarget(item.value);
    setTargetIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setShowTargetSelector(false);
    // Don't add system message, just start with empty messages
    setMessages([]);
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
      // Convert messages to format expected by OpenAI API - only include user and assistant messages
      const apiMessages = messages
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));
      
      // Add the new user message
      apiMessages.push({
        role: 'user' as const,
        content: value
      });

      // Add a placeholder message for the assistant while thinking
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        targetName: target.name,  // Store just the name
      }]);

      // Send message and get response
      const fullResponse = await chatClientRef.current.sendMessage(
        target.id,
        apiMessages
      );

      // Update the assistant's message with the actual response
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          lastMessage.content = fullResponse || 'No response received';
        }
        return newMessages;
      });

      setIsTyping(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      setIsTyping(false);
      
      // Update the assistant's message with the error
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
          lastMessage.content = `Error: ${errorMessage}`;
        }
        return newMessages;
      });
    }
  };

  const renderMessage = (msg: Message, index: number) => {
    const isUser = msg.role === 'user';
    const isSystem = msg.role === 'system';
    const isAssistant = msg.role === 'assistant';
    
    // Determine if this is the last assistant message and we're typing
    const isCurrentlyTyping = isAssistant && isTyping && index === messages.length - 1;
    const hasError = isAssistant && (msg.content.startsWith('Error:') || msg.content === 'No response received');
    
    // Don't render system messages separately anymore
    if (isSystem) {
      return null;
    }
    
    return (
      <Box key={index} flexDirection="column" marginBottom={1}>
        <Box>
          {/* Status indicator */}
          {isUser && <Text color="cyan">●</Text>}
          {isAssistant && !isCurrentlyTyping && !hasError && <Text color="green">●</Text>}
          {isAssistant && isCurrentlyTyping && (
            <Text>
              <Spinner type="dots" />
            </Text>
          )}
          {isAssistant && hasError && <Text color="red">●</Text>}
          <Text> </Text>
          
          {/* Name */}
          <Text color={isUser ? 'cyan' : isCurrentlyTyping ? 'gray' : hasError ? 'red' : 'green'} bold>
            {isUser ? 'You' : msg.targetName || target?.name}
          </Text>
          
          {/* Timestamp */}
          <Text color="gray"> {msg.timestamp.toLocaleTimeString()}</Text>
        </Box>
        
        {/* Message content */}
        {msg.content && (
          <Box marginLeft={2}>
            <Text>
              {msg.content}
            </Text>
          </Box>
        )}
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

  // Show error if no targets available
  if (!target && error) {
    return (
      <Box flexDirection="column">
        <Text color="red">⚠ Error: {error}</Text>
        <Box marginTop={1}>
          <Text color="gray">Please ensure ark-api is running and has available agents, models, or tools.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="column" flexGrow={1}>
        {messages.length === 0 ? (
          <Box flexDirection="column">
            {target && (
              <Box marginBottom={1}>
                <Text color="gray">Connected to </Text>
                <Text color="gray">{target.type} </Text>
                <Text color="green">{target.name}</Text>
              </Box>
            )}
            <Text color="gray">Start typing to begin the conversation...</Text>
          </Box>
        ) : (
          messages.map(renderMessage)
        )}
      </Box>

      <Box flexDirection="column">
        <Box 
          borderStyle="round" 
          borderColor="cyan"
          paddingX={1}
        >
          <Box flexDirection="row" width="100%">
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
        <Box marginLeft={1} marginTop={0}>
          <Box flexDirection="row">
            {target && (
              <>
                <Text color="gray">⏵⏵ Chatting with </Text>
                <Text color="gray">{target.type} </Text>
                <Text color="green">{target.name}</Text>
                <Text color="gray"> • Shift+Tab to cycle • </Text>
              </>
            )}
            <Text color="gray">Ctrl+C to exit</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default ChatUI;