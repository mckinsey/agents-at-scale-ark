import OpenAI from 'openai';
import { ConfigManager } from '../config.js';

export interface QueryTarget {
  id: string;
  name: string;
  type: 'agent' | 'model' | 'tool' | string;
  description?: string;
}

export interface ChatConfig {
  streamingEnabled: boolean;
  currentTarget?: QueryTarget;
}

export class ChatClient {
  private openai?: OpenAI;
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();
  }

  async initialize(): Promise<void> {
    const apiBaseUrl = await this.configManager.getApiBaseUrl();
    
    // Configure OpenAI SDK to use ark-api endpoint
    this.openai = new OpenAI({
      baseURL: `${apiBaseUrl}/openai/v1`,
      apiKey: 'dummy', // ark-api doesn't require an API key
      dangerouslyAllowBrowser: false,
    });
  }

  /**
   * Get available query targets (agents and models)
   * The models endpoint returns available targets
   */
  async getQueryTargets(): Promise<QueryTarget[]> {
    if (!this.openai) {
      await this.initialize();
    }

    try {
      const models = await this.openai!.models.list();
      
      // Transform the models into our QueryTarget format
      const targets: QueryTarget[] = models.data.map(model => {
        // Parse the model ID to determine if it's an agent or model
        // Format is "type/name" e.g., "agent/math", "model/default"
        const [type, ...nameParts] = model.id.split('/');
        const name = nameParts.join('/') || model.id;
        
        return {
          id: model.id,
          name: name,
          type: type,
          description: undefined
        };
      });

      return targets;
    } catch (error: any) {
      // Check if it's a connection error
      if (error?.name === 'APIConnectionError' || error?.message?.includes('Connection error')) {
        throw new Error('Cannot connect to ARK API. Please ensure ark-api is running.');
      }
      // For other errors, throw them as-is
      throw error;
    }
  }

  /**
   * Send a chat completion request
   */
  async sendMessage(
    targetId: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    config: ChatConfig,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    if (!this.openai) {
      await this.initialize();
    }

    try {
      // Use streaming from config
      const shouldStream = config.streamingEnabled && !!onChunk;
      
      const completion = await this.openai!.chat.completions.create({
        model: targetId,
        messages: messages,
        stream: shouldStream,
        signal: signal,
      } as any);

      // Handle streaming response
      if (shouldStream && Symbol.asyncIterator in completion) {
        let fullResponse = '';
        for await (const chunk of completion as any) {
          // Check if aborted and break immediately
          if (signal?.aborted) {
            break;
          }
          
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            if (onChunk) {
              onChunk(content);
            }
          }
        }
        return fullResponse;
      } else {
        // Non-streaming response or server doesn't support streaming
        const response = completion as any;
        
        if (!response.choices || !response.choices[0]) {
          console.error('Unexpected response structure:', JSON.stringify(response));
          return '';
        }
        
        const content = response.choices[0].message?.content || '';
        
        // If we requested streaming but got a full response, still call onChunk
        // to maintain consistent behavior
        if (shouldStream && onChunk && content) {
          onChunk(content);
        }
        
        return content;
      }
    } catch (error) {
      throw error;
    }
  }
}