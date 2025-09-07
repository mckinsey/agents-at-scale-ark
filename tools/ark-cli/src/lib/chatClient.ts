import OpenAI from 'openai';
import { ConfigManager } from '../config.js';

export interface QueryTarget {
  id: string;
  name: string;
  type: 'agent' | 'model' | 'tool' | string;
  description?: string;
}

// Enable streaming - set to false to disable streaming globally
const ENABLE_STREAMING = true;

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
    } catch (error) {
      console.error('Failed to fetch query targets:', error);
      // Return mock data as fallback
      return [
        { id: 'agent:weather', name: 'weather', type: 'agent', description: 'Weather information agent' },
        { id: 'agent:math', name: 'math', type: 'agent', description: 'Mathematical calculations agent' },
        { id: 'model:default', name: 'default', type: 'model', description: 'Default language model' },
      ];
    }
  }

  /**
   * Send a chat completion request
   */
  async sendMessage(
    targetId: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    if (!this.openai) {
      await this.initialize();
    }

    try {
      // Use streaming if enabled and onChunk is provided
      const shouldStream = ENABLE_STREAMING && !!onChunk;
      
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