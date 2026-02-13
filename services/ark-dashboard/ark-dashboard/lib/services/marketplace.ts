import { apiClient } from '@/lib/api/client';
import type {
  MarketplaceFilters,
  MarketplaceItem,
  MarketplaceItemDetail,
  MarketplaceResponse,
} from '@/lib/api/generated/marketplace-types';

const marketplaceService = {
  async getMarketplaceItems(
    filters?: MarketplaceFilters,
  ): Promise<MarketplaceResponse> {
    try {
      const params = new URLSearchParams();
      if (filters?.category) params.append('category', filters.category);
      if (filters?.type) params.append('type', filters.type);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.featured !== undefined)
        params.append('featured', String(filters.featured));

      const queryString = params.toString();
      const url = queryString
        ? `/api/marketplace?${queryString}`
        : '/api/marketplace';

      return await apiClient.get<MarketplaceResponse>(url);
    } catch {
      // For now, return mock data if the API doesn't exist yet
      return getMockMarketplaceData(filters);
    }
  },

  async getMarketplaceItemById(id: string): Promise<MarketplaceItemDetail> {
    try {
      return await apiClient.get<MarketplaceItemDetail>(
        `/api/marketplace/${id}`,
      );
    } catch {
      // For now, return mock data if the API doesn't exist yet
      const mockItem = getMockMarketplaceData().items.find(
        item => item.id === id,
      );
      if (!mockItem) {
        throw new Error(`Marketplace item with id ${id} not found`);
      }
      return {
        ...mockItem,
        longDescription: `${mockItem.description}\n\nThis is a detailed description of ${mockItem.name}. It provides comprehensive functionality for ${mockItem.category} use cases.`,
        requirements: ['Kubernetes 1.29+', 'Ark 0.1.0+'],
        dependencies: ['postgres', 'redis'],
        changelog: [
          {
            version: mockItem.version,
            date: new Date().toISOString().split('T')[0],
            changes: ['Initial release'],
          },
        ],
      };
    }
  },

  async installMarketplaceItem(id: string): Promise<void> {
    try {
      await apiClient.post(`/api/marketplace/${id}/install`);
    } catch {
      console.log(`Installing marketplace item ${id}`);
      // Mock implementation for now
    }
  },

  async uninstallMarketplaceItem(id: string): Promise<void> {
    try {
      await apiClient.delete(`/api/marketplace/${id}/install`);
    } catch {
      console.log(`Uninstalling marketplace item ${id}`);
      // Mock implementation for now
    }
  },
};

// Mock data for development
function getMockMarketplaceData(
  filters?: MarketplaceFilters,
): MarketplaceResponse {
  const allItems: MarketplaceItem[] = [
    {
      id: 'phoenix-observability',
      name: 'Phoenix',
      description:
        'Open-source observability platform for AI applications with tracing, metrics, and evaluation capabilities.',
      shortDescription: 'AI observability and tracing platform',
      category: 'observability',
      type: 'service',
      version: '0.2.0',
      author: 'Arize AI',
      repository: 'https://github.com/Arize-ai/phoenix',
      documentation: 'https://docs.arize.com/phoenix',
      installCommand: 'make install-phoenix',
      status: 'available',
      featured: true,
      downloads: 1250,
      rating: 4.8,
      tags: ['observability', 'tracing', 'metrics', 'llm'],
      icon: '📊',
      createdAt: '2024-01-15T00:00:00Z',
      updatedAt: '2024-02-01T00:00:00Z',
    },
    {
      id: 'langfuse',
      name: 'Langfuse',
      description:
        'Open-source LLM engineering platform for debugging, analytics, and improvements of LLM applications.',
      shortDescription: 'LLM engineering and analytics platform',
      category: 'observability',
      type: 'service',
      version: '2.0.0',
      author: 'Langfuse',
      repository: 'https://github.com/langfuse/langfuse',
      documentation: 'https://langfuse.com/docs',
      installCommand: 'make install-langfuse',
      status: 'available',
      featured: true,
      downloads: 890,
      rating: 4.7,
      tags: ['observability', 'analytics', 'debugging', 'llm'],
      icon: '🔍',
      createdAt: '2024-01-20T00:00:00Z',
      updatedAt: '2024-02-05T00:00:00Z',
    },
    {
      id: 'github-mcp',
      name: 'GitHub MCP Server',
      description:
        'Model Context Protocol server for GitHub integration, enabling AI agents to interact with repositories, issues, and pull requests.',
      shortDescription: 'GitHub integration via MCP',
      category: 'mcp-servers',
      type: 'component',
      version: '1.0.0',
      author: 'Ark Team',
      repository:
        'https://github.com/mckinsey/agents-at-scale/tree/main/mcp/github',
      documentation: '/docs/mcp/github',
      installCommand: 'kubectl apply -f mcp/github.yaml',
      status: 'installed',
      featured: false,
      downloads: 450,
      rating: 4.5,
      tags: ['mcp', 'github', 'git', 'vcs'],
      icon: '🐙',
      createdAt: '2024-01-10T00:00:00Z',
      updatedAt: '2024-01-25T00:00:00Z',
    },
    {
      id: 'jira-mcp',
      name: 'Jira MCP Server',
      description:
        'Connect AI agents to Jira for issue tracking, project management, and workflow automation.',
      shortDescription: 'Jira integration for AI agents',
      category: 'mcp-servers',
      type: 'component',
      version: '1.0.0',
      author: 'Ark Team',
      repository:
        'https://github.com/mckinsey/agents-at-scale/tree/main/mcp/atlassian',
      documentation: '/docs/mcp/jira',
      status: 'available',
      featured: false,
      downloads: 320,
      rating: 4.3,
      tags: ['mcp', 'jira', 'atlassian', 'project-management'],
      icon: '📋',
      createdAt: '2024-01-12T00:00:00Z',
      updatedAt: '2024-01-28T00:00:00Z',
    },
    {
      id: 'rag-agent-template',
      name: 'RAG Agent Template',
      description:
        'Production-ready template for Retrieval-Augmented Generation agents with vector store integration.',
      shortDescription: 'Template for RAG-based AI agents',
      category: 'agents',
      type: 'template',
      version: '1.2.0',
      author: 'Ark Community',
      repository:
        'https://github.com/mckinsey/agents-at-scale-marketplace/templates/rag-agent',
      documentation: '/docs/templates/rag-agent',
      status: 'available',
      featured: true,
      downloads: 780,
      rating: 4.6,
      tags: ['agent', 'rag', 'template', 'vector-store'],
      icon: '🤖',
      createdAt: '2024-01-18T00:00:00Z',
      updatedAt: '2024-02-03T00:00:00Z',
    },
    {
      id: 'code-review-workflow',
      name: 'Code Review Workflow',
      description:
        'Automated code review workflow using AI agents for PR analysis, security checks, and best practices.',
      shortDescription: 'AI-powered code review automation',
      category: 'workflows',
      type: 'template',
      version: '1.0.0',
      author: 'Ark Community',
      repository:
        'https://github.com/mckinsey/agents-at-scale-marketplace/workflows/code-review',
      documentation: '/docs/workflows/code-review',
      status: 'available',
      featured: false,
      downloads: 560,
      rating: 4.4,
      tags: ['workflow', 'code-review', 'automation', 'devops'],
      icon: '👁️',
      createdAt: '2024-01-22T00:00:00Z',
      updatedAt: '2024-02-06T00:00:00Z',
    },
    {
      id: 'slack-integration',
      name: 'Slack Integration',
      description:
        'Connect Ark agents to Slack for interactive conversations, notifications, and workflow triggers.',
      shortDescription: 'Slack connector for Ark agents',
      category: 'integrations',
      type: 'plugin',
      version: '1.1.0',
      author: 'Ark Team',
      repository:
        'https://github.com/mckinsey/agents-at-scale-marketplace/integrations/slack',
      documentation: '/docs/integrations/slack',
      status: 'available',
      featured: false,
      downloads: 920,
      rating: 4.7,
      tags: ['integration', 'slack', 'chat', 'notifications'],
      icon: '💬',
      createdAt: '2024-01-14T00:00:00Z',
      updatedAt: '2024-01-30T00:00:00Z',
    },
    {
      id: 'python-executor',
      name: 'Python Code Executor',
      description:
        'Secure Python code execution tool for AI agents with sandboxing and resource limits.',
      shortDescription: 'Execute Python code safely',
      category: 'tools',
      type: 'component',
      version: '2.0.0',
      author: 'Ark Team',
      repository:
        'https://github.com/mckinsey/agents-at-scale/tree/main/tools/python-executor',
      documentation: '/docs/tools/python-executor',
      status: 'installed',
      featured: false,
      downloads: 1100,
      rating: 4.5,
      tags: ['tool', 'python', 'executor', 'sandbox'],
      icon: '🐍',
      createdAt: '2024-01-08T00:00:00Z',
      updatedAt: '2024-01-24T00:00:00Z',
    },
  ];

  let filteredItems = [...allItems];

  if (filters?.category) {
    filteredItems = filteredItems.filter(
      item => item.category === filters.category,
    );
  }

  if (filters?.type) {
    filteredItems = filteredItems.filter(item => item.type === filters.type);
  }

  if (filters?.status) {
    filteredItems = filteredItems.filter(
      item => item.status === filters.status,
    );
  }

  if (filters?.featured !== undefined) {
    filteredItems = filteredItems.filter(
      item => item.featured === filters.featured,
    );
  }

  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    filteredItems = filteredItems.filter(
      item =>
        item.name.toLowerCase().includes(searchLower) ||
        item.description.toLowerCase().includes(searchLower) ||
        item.tags.some(tag => tag.toLowerCase().includes(searchLower)),
    );
  }

  return {
    items: filteredItems,
    total: filteredItems.length,
    page: 1,
    pageSize: 20,
  };
}

export { marketplaceService };
