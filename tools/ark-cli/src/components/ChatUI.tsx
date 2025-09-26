import {Box, Text, useInput, useApp} from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import chalk from 'chalk';
import * as React from 'react';
import {marked} from 'marked';
// @ts-ignore - no types available
import TerminalRenderer from 'marked-terminal';
import {
  ChatClient,
  QueryTarget,
  ChatConfig,
  ToolCall,
  ArkMetadata,
} from '../lib/chatClient.js';
import {ArkApiClient} from '../lib/arkApiClient.js';
import {ArkApiProxy} from '../lib/arkApiProxy.js';
import {AgentSelector} from '../ui/AgentSelector.js';
import {ModelSelector} from '../ui/ModelSelector.js';
import {TeamSelector} from '../ui/TeamSelector.js';
import {ToolSelector} from '../ui/ToolSelector.js';

type SlashCommand =
  | '/output'
  | '/streaming'
  | '/agents'
  | '/models'
  | '/teams'
  | '/tools'
  | '/reset';

interface BaseMessage {
  id: string;
  timestamp: Date;
  cancelled?: boolean;
}

interface UserMessage extends BaseMessage {
  type: 'user';
  content: string;
}

interface AgentMessage extends BaseMessage {
  type: 'agent';
  targetName: string;
  content: string;
  toolCalls?: ToolCall[];
}

interface TeamMessage extends BaseMessage {
  type: 'team';
  targetName: string;
  members: TeamMemberMessage[];
}

interface TeamMemberMessage {
  agentName: string;
  content: string;
  toolCalls?: ToolCall[];
  color?: string;
}

interface SystemMessage extends BaseMessage {
  type: 'system';
  content: string;
  command?: SlashCommand;
}

type Message = UserMessage | AgentMessage | TeamMessage | SystemMessage;

interface ChatUIProps {
  initialTargetId?: string;
  arkApiClient: ArkApiClient;
  arkApiProxy: ArkApiProxy;
  config?: {
    chat?: {
      streaming?: boolean;
      outputFormat?: 'text' | 'markdown';
    };
  };
}

// Output format configuration (default: text)
type OutputFormat = 'text' | 'markdown';

// Generate a unique ID for messages
let messageIdCounter = 0;
const generateMessageId = (): string => {
  return `msg-${Date.now()}-${messageIdCounter++}`;
};

// Configure marked with terminal renderer for markdown output
const configureMarkdown = () => {
  marked.setOptions({
    renderer: new TerminalRenderer({
      showSectionPrefix: false,
      width: 80,
      reflowText: true,
      preserveNewlines: true,
    }),
  });
};

const ChatUI: React.FC<ChatUIProps> = ({
  initialTargetId,
  arkApiClient,
  arkApiProxy,
  config,
}) => {
  const {exit} = useApp();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [isTyping, setIsTyping] = React.useState(false);
  const [target, setTarget] = React.useState<QueryTarget | null>(null);
  const [availableTargets, setAvailableTargets] = React.useState<QueryTarget[]>(
    []
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [targetIndex, setTargetIndex] = React.useState(0);
  const [abortController, setAbortController] =
    React.useState<AbortController | null>(null);
  const [showCommands, setShowCommands] = React.useState(false);
  const [filteredCommands, setFilteredCommands] = React.useState<
    Array<{command: string; description: string}>
  >([]);
  const [inputKey, setInputKey] = React.useState(0); // Key to force re-mount of TextInput
  const [outputFormat, setOutputFormat] = React.useState<OutputFormat>(
    config?.chat?.outputFormat || 'text'
  );
  const [showAgentSelector, setShowAgentSelector] = React.useState(false);
  const [showModelSelector, setShowModelSelector] = React.useState(false);
  const [showTeamSelector, setShowTeamSelector] = React.useState(false);
  const [showToolSelector, setShowToolSelector] = React.useState(false);

  // Message history navigation
  const [messageHistory, setMessageHistory] = React.useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = React.useState(-1);

  // Initialize chat config from config prop
  const [chatConfig, setChatConfig] = React.useState<ChatConfig>({
    streamingEnabled: config?.chat?.streaming ?? true,
    currentTarget: undefined,
  });

  const chatClientRef = React.useRef<ChatClient | undefined>(undefined);

  // Configure markdown when output format changes
  React.useEffect(() => {
    if (outputFormat === 'markdown') {
      configureMarkdown();
    }
  }, [outputFormat]);

  // Initialize chat client and fetch targets on mount
  React.useEffect(() => {
    const initializeChat = async () => {
      try {
        // Use the provided ArkApiClient to create ChatClient
        const client = new ChatClient(arkApiClient);
        chatClientRef.current = client;

        const targets = await client.getQueryTargets();
        setAvailableTargets(targets);

        if (initialTargetId) {
          // If initialTargetId is provided, find and set the target
          const matchedTarget = targets.find((t) => t.id === initialTargetId);
          const matchedIndex = targets.findIndex(
            (t) => t.id === initialTargetId
          );
          if (matchedTarget) {
            setTarget(matchedTarget);
            setTargetIndex(matchedIndex >= 0 ? matchedIndex : 0);
            setChatConfig((prev) => ({...prev, currentTarget: matchedTarget}));
            setMessages([]);
          } else {
            // If target not found, show error and exit
            console.error(
              chalk.red('Error:'),
              `Target "${initialTargetId}" not found`
            );
            console.error(
              chalk.gray('Use "ark targets list" to see available targets')
            );
            if (arkApiProxy) {
              arkApiProxy.stop();
            }
            exit();
          }
        } else if (targets.length > 0) {
          // No initial target specified - auto-select first available
          // Priority: agents > models > tools
          const agents = targets.filter((t) => t.type === 'agent');
          const models = targets.filter((t) => t.type === 'model');
          const tools = targets.filter((t) => t.type === 'tool');

          let selectedTarget: QueryTarget | null = null;
          let selectedIndex = 0;

          if (agents.length > 0) {
            selectedTarget = agents[0];
            selectedIndex = targets.findIndex((t) => t.id === agents[0].id);
          } else if (models.length > 0) {
            selectedTarget = models[0];
            selectedIndex = targets.findIndex((t) => t.id === models[0].id);
          } else if (tools.length > 0) {
            selectedTarget = tools[0];
            selectedIndex = targets.findIndex((t) => t.id === tools[0].id);
          }

          if (selectedTarget) {
            setTarget(selectedTarget);
            setTargetIndex(selectedIndex);
            setChatConfig((prev) => ({...prev, currentTarget: selectedTarget}));
            setMessages([]);
          } else {
            setError('No targets available');
          }
        } else {
          setError('No agents, models, or tools available');
        }

        setIsLoading(false);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to initialize chat';
        console.error(chalk.red('Error:'), errorMessage);
        if (arkApiProxy) {
          arkApiProxy.stop();
        }
        exit();
      }
    };

    initializeChat();

    // Cleanup function to close port forward when component unmounts
    return () => {
      if (arkApiProxy) {
        arkApiProxy.stop();
      }
      chatClientRef.current = undefined;
    };
  }, [initialTargetId]);

  // Handle keyboard input
  useInput((inputChar, key) => {
    // Handle Ctrl+C to exit cleanly
    if (inputChar === '\x03' || (key.ctrl && inputChar === 'c')) {
      // Clean up resources
      if (arkApiProxy) {
        arkApiProxy.stop();
      }
      if (abortController) {
        abortController.abort();
      }
      // Exit the app properly
      exit();
      return;
    }

    // Note: Ctrl+W for word deletion doesn't work reliably due to terminal/readline
    // intercepting it before it reaches the app. Most terminals handle this at a lower level.

    // Handle arrow keys for message history navigation
    if (!showCommands && messageHistory.length > 0) {
      if (key.upArrow && input === '') {
        // Go back in history
        const newIndex =
          historyIndex === -1
            ? messageHistory.length - 1
            : Math.max(0, historyIndex - 1);

        if (newIndex >= 0 && newIndex < messageHistory.length) {
          setHistoryIndex(newIndex);
          setInput(messageHistory[newIndex]);
          setInputKey((prev) => prev + 1); // Force re-mount to update cursor
        }
        return;
      }

      if (key.downArrow && input === '') {
        // Go forward in history
        if (historyIndex >= 0) {
          const newIndex = Math.min(
            messageHistory.length - 1,
            historyIndex + 1
          );

          if (newIndex === messageHistory.length - 1) {
            // At the end of history, clear input
            setHistoryIndex(-1);
            setInput('');
          } else {
            setHistoryIndex(newIndex);
            setInput(messageHistory[newIndex]);
          }
          setInputKey((prev) => prev + 1); // Force re-mount to update cursor
        }
        return;
      }
    }

    // Tab to autocomplete when there's a single matching command
    if (
      key.tab &&
      !key.shift &&
      showCommands &&
      filteredCommands.length === 1
    ) {
      // Set the completed command with a space at the end
      const completedCommand = filteredCommands[0].command + ' ';
      setInput(completedCommand);
      // Keep the command hint visible but update to show only the completed command
      setFilteredCommands([filteredCommands[0]]);
      // Force re-mount of TextInput to reset cursor position
      setInputKey((prev) => prev + 1);
      return;
    }

    // Shift+Tab to cycle through targets
    if (key.shift && key.tab && availableTargets.length > 0) {
      // Cycle to next target
      const nextIndex = (targetIndex + 1) % availableTargets.length;
      const nextTarget = availableTargets[nextIndex];

      setTargetIndex(nextIndex);
      setTarget(nextTarget);
      setChatConfig((prev) => ({...prev, currentTarget: nextTarget}));
    }

    // Esc to cancel current request
    if (key.escape && isTyping && abortController) {
      abortController.abort();
      setAbortController(null);
      setIsTyping(false);

      // Mark the agent/team message as cancelled and add system message
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (
          lastMessage &&
          (lastMessage.type === 'agent' || lastMessage.type === 'team')
        ) {
          lastMessage.cancelled = true;
          // Remove the message if it has no content
          if (lastMessage.type === 'agent' && !lastMessage.content) {
            newMessages.pop();
          } else if (
            lastMessage.type === 'team' &&
            lastMessage.members.length === 0
          ) {
            newMessages.pop();
          }
        }
        // Add system message about interruption
        const systemMessage: SystemMessage = {
          id: generateMessageId(),
          type: 'system',
          content: 'Interrupted by user',
          timestamp: new Date(),
        };
        newMessages.push(systemMessage);
        return newMessages;
      });
    }
  });

  const handleSubmit = async (value: string) => {
    if (!value.trim()) return;

    // Check for slash commands first (these work without a target)
    if (value.startsWith('/output')) {
      const parts = value.split(' ');
      const arg = parts[1]?.toLowerCase();

      if (arg === 'text' || arg === 'markdown') {
        // Set output format
        setOutputFormat(arg);

        // Add system message to show the change
        const systemMessage: SystemMessage = {
          id: generateMessageId(),
          type: 'system',
          content: `Output format set to ${arg}`,
          timestamp: new Date(),
          command: '/output',
        };
        setMessages((prev) => [...prev, systemMessage]);
      } else if (!arg) {
        // Show current format
        const systemMessage: SystemMessage = {
          id: generateMessageId(),
          type: 'system',
          content: `Current output format: ${outputFormat}`,
          timestamp: new Date(),
          command: '/output',
        };
        setMessages((prev) => [...prev, systemMessage]);
      } else {
        // Show usage message
        const systemMessage: SystemMessage = {
          id: generateMessageId(),
          type: 'system',
          content: `Use 'text' or 'markdown' e.g. /output markdown`,
          timestamp: new Date(),
          command: '/output',
        };
        setMessages((prev) => [...prev, systemMessage]);
      }

      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    if (value.startsWith('/streaming')) {
      const parts = value.split(' ');
      const arg = parts[1]?.toLowerCase();

      if (arg === 'on' || arg === 'off') {
        // Set streaming based on argument
        const newState = arg === 'on';
        setChatConfig((prev) => ({...prev, streamingEnabled: newState}));

        // Add system message to show the change
        const systemMessage: SystemMessage = {
          id: generateMessageId(),
          type: 'system',
          content: `Streaming ${newState ? 'enabled' : 'disabled'}`,
          timestamp: new Date(),
          command: '/streaming',
        };
        setMessages((prev) => [...prev, systemMessage]);
      } else {
        // Show usage message
        const systemMessage: SystemMessage = {
          id: generateMessageId(),
          type: 'system',
          content: `Use either 'on' or 'off' e.g. /streaming on`,
          timestamp: new Date(),
          command: '/streaming',
        };
        setMessages((prev) => [...prev, systemMessage]);
      }

      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    if (value.startsWith('/reset')) {
      // Clear all messages
      setMessages([]);

      // Add system message to show the reset
      const systemMessage: SystemMessage = {
        id: generateMessageId(),
        type: 'system',
        content: 'Message history cleared',
        timestamp: new Date(),
        command: '/reset',
      };
      setMessages([systemMessage]);

      // Clear message history for arrow key navigation
      setMessageHistory([]);
      setHistoryIndex(-1);

      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    if (value.startsWith('/agents')) {
      setShowAgentSelector(true);
      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    if (value.startsWith('/models')) {
      setShowModelSelector(true);
      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    if (value.startsWith('/teams')) {
      setShowTeamSelector(true);
      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    if (value.startsWith('/tools')) {
      setShowToolSelector(true);
      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    // For regular messages, we need a target and client
    if (!target || !chatClientRef.current) {
      const systemMessage: SystemMessage = {
        id: generateMessageId(),
        type: 'system',
        content: 'No target selected. Use Shift+Tab to select a target.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, systemMessage]);
      setInput('');
      setShowCommands(false);
      setFilteredCommands([]);
      return;
    }

    const userMessage: UserMessage = {
      id: generateMessageId(),
      type: 'user',
      content: value,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);

    // Add to message history
    setMessageHistory((prev) => [...prev, value]);
    setHistoryIndex(-1); // Reset history navigation

    setInput('');
    setIsTyping(true);
    setError(null);

    try {
      // Create abort controller for this request
      const controller = new AbortController();
      setAbortController(controller);

      // Convert messages to format expected by OpenAI API - only include user and agent messages
      const apiMessages = messages
        .filter(
          (msg) =>
            msg.type === 'user' || msg.type === 'agent' || msg.type === 'team'
        )
        .map((msg) => {
          if (msg.type === 'user') {
            return {
              role: 'user' as const,
              content: msg.content,
            };
          } else if (msg.type === 'agent') {
            return {
              role: 'assistant' as const,
              content: msg.content,
            };
          } else if (msg.type === 'team') {
            // For teams, concatenate all member responses
            const content = msg.members.map((m) => m.content).join(' ');
            return {
              role: 'assistant' as const,
              content: content || '',
            };
          }
          return {role: 'user' as const, content: ''};
        });

      // Add the new user message
      apiMessages.push({
        role: 'user' as const,
        content: value,
      });

      // Add a placeholder message based on target type
      const messageId = generateMessageId();
      if (target.type === 'team') {
        // For teams, create a TeamMessage
        const teamMessage: TeamMessage = {
          id: messageId,
          type: 'team',
          targetName: target.name,
          timestamp: new Date(),
          members: [],
        };
        setMessages((prev) => [...prev, teamMessage]);
      } else {
        // For agents/models, create an AgentMessage
        const agentMessage: AgentMessage = {
          id: messageId,
          type: 'agent',
          targetName: target.name,
          timestamp: new Date(),
          content: '',
        };
        setMessages((prev) => [...prev, agentMessage]);
      }

      // Send message and get response with abort signal
      const fullResponse = await chatClientRef.current.sendMessage(
        target.id,
        apiMessages,
        chatConfig,
        (chunk: string, toolCalls?: ToolCall[], arkMetadata?: ArkMetadata) => {
          // Update message progressively as chunks arrive
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];

            // Only update if not cancelled
            if (lastMessage && !lastMessage.cancelled) {
              if (lastMessage.type === 'team' && arkMetadata?.agent) {
                // Handle team messages with agent metadata
                const teamMsg = lastMessage as TeamMessage;

                // Find or create team member entry
                let member = teamMsg.members.find(
                  (m) => m.agentName === arkMetadata.agent
                );
                if (!member) {
                  member = {
                    agentName: arkMetadata.agent,
                    content: '',
                    color: 'blueBright',
                  };
                  teamMsg.members.push(member);
                }

                // Update member's content or tool calls
                if (chunk) {
                  member.content += chunk;
                }
                if (toolCalls) {
                  member.toolCalls = toolCalls;
                }
              } else if (lastMessage.type === 'agent') {
                // Handle regular agent messages
                const agentMsg = lastMessage as AgentMessage;
                if (chunk) {
                  agentMsg.content += chunk;
                }
                if (toolCalls) {
                  agentMsg.toolCalls = toolCalls;
                }
              }
            }
            return newMessages;
          });
        },
        controller.signal
      );

      // For non-streaming responses or final validation
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];

        // Only update if not cancelled
        if (lastMessage && !lastMessage.cancelled) {
          if (lastMessage.type === 'agent') {
            const agentMsg = lastMessage as AgentMessage;
            // If content is empty (no streaming occurred), set the full response
            if (!agentMsg.content && fullResponse) {
              agentMsg.content = fullResponse;
            }
            // If no content at all, show a default message
            if (!agentMsg.content && !agentMsg.toolCalls) {
              agentMsg.content = 'No response received';
            }
          } else if (lastMessage.type === 'team') {
            const teamMsg = lastMessage as TeamMessage;
            // For teams in non-streaming mode, add the full response as a single member
            if (
              !chatConfig.streamingEnabled &&
              fullResponse &&
              teamMsg.members.length === 0
            ) {
              teamMsg.members.push({
                agentName: 'team',
                content: fullResponse,
                color: 'blueBright',
              });
            }
          }
        }
        return newMessages;
      });

      setIsTyping(false);
      setAbortController(null);
    } catch (err) {
      // Check if this was cancelled by user
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, message already updated by Esc handler
        return;
      }

      const errorMessage =
        err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      setIsTyping(false);
      setAbortController(null);

      // Update the agent/team message with the error
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && !lastMessage.cancelled) {
          if (lastMessage.type === 'agent') {
            lastMessage.content = `Error: ${errorMessage}`;
          } else if (lastMessage.type === 'team') {
            // For team messages, add error as a single member
            lastMessage.members = [
              {
                agentName: 'error',
                content: `Error: ${errorMessage}`,
                color: 'red',
              },
            ];
          }
        }
        return newMessages;
      });
    }
  };

  const renderMessage = (msg: Message, index: number) => {
    const isLastMessage = index === messages.length - 1;
    const isCurrentlyTyping = isTyping && isLastMessage;
    const isCancelled = msg.cancelled === true;

    // Handle different message types
    switch (msg.type) {
      case 'system':
        return renderSystemMessage(msg, index);
      case 'user':
        return renderUserMessage(msg, index);
      case 'agent':
        return renderAgentMessage(msg, index, isCurrentlyTyping, isCancelled);
      case 'team':
        return renderTeamMessage(msg, index, isCurrentlyTyping, isCancelled);
    }
  };

  const renderSystemMessage = (msg: SystemMessage, index: number) => {
    const isInterruption = msg.content === 'Interrupted by user';

    // If it's a slash command response, show with special formatting
    if (msg.command) {
      return (
        <Box key={index} flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="gray">› {msg.command}</Text>
          </Box>
          <Box marginLeft={2}>
            <Text color="gray">⎿ {msg.content}</Text>
          </Box>
        </Box>
      );
    }

    // For other system messages (interruptions, errors, etc.)
    const color = isInterruption ? 'yellow' : 'gray';
    return (
      <Box key={index} flexDirection="column" marginBottom={1}>
        <Box marginLeft={2}>
          <Text color={color}>• {msg.content}</Text>
        </Box>
      </Box>
    );
  };

  const renderUserMessage = (msg: UserMessage, index: number) => {
    return (
      <Box key={index} flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="cyan">●</Text>
          <Text> </Text>
          <Text color="cyan" bold>
            You
          </Text>
          <Text color="gray"> {msg.timestamp.toLocaleTimeString()}</Text>
        </Box>
        <Box marginLeft={2}>
          <Text>{msg.content}</Text>
        </Box>
      </Box>
    );
  };

  const renderAgentMessage = (
    msg: AgentMessage,
    index: number,
    isCurrentlyTyping: boolean,
    isCancelled: boolean
  ) => {
    const hasError =
      msg.content.startsWith('Error:') ||
      msg.content === 'No response received';

    return (
      <Box key={index} flexDirection="column" marginBottom={1}>
        <Box>
          {/* Status indicator */}
          {!isCurrentlyTyping && !hasError && !isCancelled && (
            <Text color="green">●</Text>
          )}
          {isCurrentlyTyping && (
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
          )}
          {hasError && <Text color="red">●</Text>}
          {isCancelled && <Text color="gray">●</Text>}
          <Text> </Text>

          {/* Name */}
          <Text
            color={
              isCurrentlyTyping
                ? 'yellow'
                : isCancelled
                  ? 'gray'
                  : hasError
                    ? 'red'
                    : 'green'
            }
            bold
          >
            {msg.targetName}
          </Text>

          {/* Timestamp or interrupt hint */}
          {isCurrentlyTyping ? (
            <Text color="gray"> (esc to interrupt)</Text>
          ) : (
            <Text color="gray"> {msg.timestamp.toLocaleTimeString()}</Text>
          )}
        </Box>

        {/* Tool calls */}
        {msg.toolCalls &&
          msg.toolCalls.length > 0 &&
          renderToolCalls(msg.toolCalls)}

        {/* Content */}
        {msg.content && (
          <Box marginLeft={2}>
            {outputFormat === 'markdown' ? (
              <Text>{marked.parseInline(msg.content)}</Text>
            ) : (
              <Text>{msg.content}</Text>
            )}
          </Box>
        )}
      </Box>
    );
  };

  const renderTeamMessage = (
    msg: TeamMessage,
    index: number,
    isCurrentlyTyping: boolean,
    isCancelled: boolean
  ) => {
    return (
      <Box key={index} flexDirection="column" marginBottom={1}>
        <Box>
          {/* Status indicator */}
          {!isCurrentlyTyping && !isCancelled && <Text color="green">●</Text>}
          {isCurrentlyTyping && (
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
          )}
          {isCancelled && <Text color="gray">●</Text>}
          <Text> </Text>

          {/* Team name */}
          <Text
            color={
              isCurrentlyTyping ? 'yellow' : isCancelled ? 'gray' : 'green'
            }
            bold
          >
            {msg.targetName}
          </Text>

          {/* Timestamp or interrupt hint */}
          {isCurrentlyTyping ? (
            <Text color="gray"> (esc to interrupt)</Text>
          ) : (
            <Text color="gray"> {msg.timestamp.toLocaleTimeString()}</Text>
          )}
        </Box>

        {/* Render each team member's contribution */}
        {msg.members.map((member, memberIndex) => (
          <Box
            key={memberIndex}
            flexDirection="column"
            marginLeft={2}
            marginTop={memberIndex > 0 ? 1 : 0}
          >
            <Box>
              <Text color="blueBright">•</Text>
              <Text> </Text>
              <Text color="blueBright" bold>
                {member.agentName}
              </Text>
            </Box>
            {member.toolCalls && member.toolCalls.length > 0 && (
              <Box marginLeft={2}>{renderToolCalls(member.toolCalls)}</Box>
            )}
            {member.content && (
              <Box marginLeft={2}>
                {outputFormat === 'markdown' ? (
                  <Text>{marked.parseInline(member.content)}</Text>
                ) : (
                  <Text>{member.content}</Text>
                )}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    );
  };

  const renderToolCalls = (toolCalls: ToolCall[]) => {
    return (
      <Box flexDirection="column">
        <Text color="magenta" bold>
          Tool Calls:
        </Text>
        {toolCalls.map((toolCall, toolIndex) => (
          <Box key={toolIndex} marginLeft={2} flexDirection="column">
            <Text color="magenta">• {toolCall.function.name}</Text>
            {toolCall.function.arguments && (
              <Box marginLeft={2}>
                <Text color="gray" dimColor>
                  {(() => {
                    try {
                      const args = JSON.parse(toolCall.function.arguments);
                      return JSON.stringify(args, null, 2);
                    } catch {
                      return toolCall.function.arguments;
                    }
                  })()}
                </Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>
    );
  };

  // Show loading state
  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">
          <Spinner type="dots" /> Loading available targets...
        </Text>
      </Box>
    );
  }

  // Show error if no targets available
  if (!target && error) {
    return (
      <Box flexDirection="column">
        <Text color="red">⚠ Error: {error}</Text>
        <Box marginTop={1}>
          <Text color="gray">
            Please ensure ark-api is running and has available agents, models,
            or tools.
          </Text>
        </Box>
      </Box>
    );
  }

  // Show agent selector if requested
  if (showAgentSelector) {
    return (
      <AgentSelector
        arkApiClient={arkApiClient}
        onSelect={(agent) => {
          // Update the target to the selected agent
          const agentTarget: QueryTarget = {
            id: `agent/${agent.name}`,
            name: agent.name,
            type: 'agent',
            description: agent.description,
          };
          setTarget(agentTarget);
          setChatConfig((prev) => ({...prev, currentTarget: agentTarget}));
          setMessages([]);
          setShowAgentSelector(false);

          // Add system message about the selection
          const systemMessage: SystemMessage = {
            id: generateMessageId(),
            type: 'system',
            content: `Switched to agent: ${agent.name}`,
            timestamp: new Date(),
            command: '/agents',
          };
          setMessages([systemMessage]);
        }}
        onExit={() => setShowAgentSelector(false)}
      />
    );
  }

  // Show model selector if requested
  if (showModelSelector) {
    return (
      <ModelSelector
        arkApiClient={arkApiClient}
        onSelect={(model) => {
          // Update the target to the selected model
          const modelTarget: QueryTarget = {
            id: `model/${model.name}`,
            name: model.name,
            type: 'model',
            description: model.type,
          };
          setTarget(modelTarget);
          setChatConfig((prev) => ({...prev, currentTarget: modelTarget}));
          setMessages([]);
          setShowModelSelector(false);

          // Add system message about the selection
          const systemMessage: SystemMessage = {
            id: generateMessageId(),
            type: 'system',
            content: `Switched to model: ${model.name}`,
            timestamp: new Date(),
            command: '/models',
          };
          setMessages([systemMessage]);
        }}
        onExit={() => setShowModelSelector(false)}
      />
    );
  }

  // Show team selector if requested
  if (showTeamSelector) {
    return (
      <TeamSelector
        arkApiClient={arkApiClient}
        onSelect={(team) => {
          // Update the target to the selected team
          const teamTarget: QueryTarget = {
            id: `team/${team.name}`,
            name: team.name,
            type: 'team',
            description: team.strategy,
          };
          setTarget(teamTarget);
          setChatConfig((prev) => ({...prev, currentTarget: teamTarget}));
          setMessages([]);
          setShowTeamSelector(false);

          // Add system message about the selection
          const systemMessage: SystemMessage = {
            id: generateMessageId(),
            type: 'system',
            content: `Switched to team: ${team.name}`,
            timestamp: new Date(),
            command: '/teams',
          };
          setMessages([systemMessage]);
        }}
        onExit={() => setShowTeamSelector(false)}
      />
    );
  }

  // Show tool selector if requested
  if (showToolSelector) {
    return (
      <ToolSelector
        arkApiClient={arkApiClient}
        onSelect={(tool) => {
          // Update the target to the selected tool
          const toolTarget: QueryTarget = {
            id: `tool/${tool.name}`,
            name: tool.name,
            type: 'tool',
            description: tool.description,
          };
          setTarget(toolTarget);
          setChatConfig((prev) => ({...prev, currentTarget: toolTarget}));
          setMessages([]);
          setShowToolSelector(false);

          // Add system message about the selection
          const systemMessage: SystemMessage = {
            id: generateMessageId(),
            type: 'system',
            content: `Switched to tool: ${tool.name}`,
            timestamp: new Date(),
            command: '/tools',
          };
          setMessages([systemMessage]);
        }}
        onExit={() => setShowToolSelector(false)}
      />
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      {/* Welcome header - only show if no messages */}
      {messages.length === 0 && (
        <Box flexDirection="column" marginBottom={1} paddingX={2}>
          <Text bold color="green">
            ✻ Welcome to ARK Chat!
          </Text>
          <Box marginTop={1}>
            <Text dimColor>Type your message and press Enter to start</Text>
          </Box>
          <Box>
            <Text dimColor>Type '/' for available commands</Text>
          </Box>
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1}>
        {messages.map(renderMessage)}
      </Box>

      <Box flexDirection="column">
        <Box borderStyle="round" borderColor="gray" paddingX={1}>
          <Box flexDirection="row" width="100%">
            <Text color="cyan" bold>
              ›
            </Text>
            <Box marginLeft={1} flexGrow={1}>
              <TextInput
                key={inputKey}
                value={input}
                onChange={(value) => {
                  setInput(value);
                  // Show commands menu only when input starts with '/'
                  const shouldShowCommands = value.startsWith('/');
                  setShowCommands(shouldShowCommands);

                  // Update filtered commands
                  if (shouldShowCommands) {
                    const inputLower = value.toLowerCase();
                    const commands = [
                      {
                        command: '/agents',
                        description: 'Select an agent to chat with',
                      },
                      {
                        command: '/models',
                        description: 'Select a model to chat with',
                      },
                      {
                        command: '/teams',
                        description: 'Select a team to chat with',
                      },
                      {
                        command: '/tools',
                        description: 'Select a tool to use',
                      },
                      {
                        command: '/output',
                        description: `Set output format (${outputFormat}) - use: /output text|markdown`,
                      },
                      {
                        command: '/streaming',
                        description: `Toggle streaming mode (${chatConfig.streamingEnabled ? 'on' : 'off'}) - use: /streaming on|off`,
                      },
                      {
                        command: '/reset',
                        description: 'Clear message history',
                      },
                    ];

                    // Check if user has typed a complete command (with space or at exact match)
                    const hasSpace = value.includes(' ');
                    const baseCommand = hasSpace ? value.split(' ')[0] : value;

                    // Filter commands - show matching commands or the current command if fully typed
                    const filtered = commands.filter((cmd) => {
                      if (hasSpace) {
                        // If there's a space, only show the exact matching command
                        return cmd.command === baseCommand;
                      } else {
                        // Otherwise show all commands that start with the input
                        return cmd.command.toLowerCase().startsWith(inputLower);
                      }
                    });
                    setFilteredCommands(filtered);
                  } else {
                    setFilteredCommands([]);
                  }
                }}
                onSubmit={handleSubmit}
                placeholder="Type your message..."
              />
            </Box>
          </Box>
        </Box>

        {/* Command menu */}
        {showCommands && filteredCommands.length > 0 && (
          <Box marginLeft={1} marginTop={1} flexDirection="column">
            {filteredCommands.map((cmd, index) => (
              <Box key={index}>
                <Text color="cyan">{cmd.command}</Text>
                <Text color="gray"> {cmd.description}</Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Status bar - only show when menu is not open */}
        {!showCommands && (
          <Box marginLeft={1} marginTop={0}>
            <Box flexDirection="row">
              {target && (
                <>
                  <Text color="gray">Chatting with </Text>
                  <Text color="gray">{target.type} </Text>
                  <Text color="green">{target.name}</Text>
                  <Text color="gray"> • Shift+Tab to cycle • </Text>
                </>
              )}
              <Text color="gray">Ctrl+C to exit</Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default ChatUI;
