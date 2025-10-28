export interface Engine {
  id: string;
  name: string;
}

// Test data
const testEngines: Engine[] = [
  {
    id: '650e8400-e29b-41d4-a716-446655440001',
    name: 'Local Python Runtime',
  },
  {
    id: '650e8400-e29b-41d4-a716-446655440002',
    name: 'Docker Container Engine',
  },
  {
    id: '650e8400-e29b-41d4-a716-446655440003',
    name: 'Kubernetes Cluster',
  },
  {
    id: '650e8400-e29b-41d4-a716-446655440004',
    name: 'AWS Lambda Runtime',
  },
];

// Service with read-only operations
export const enginesService = {
  // Get all engines
  async getAll(): Promise<Engine[]> {
    return Promise.resolve([...testEngines]);
  },

  // Get a single engine by ID
  async getById(id: string): Promise<Engine | null> {
    const engine = testEngines.find(e => e.id === id);
    return Promise.resolve(engine || null);
  },
};
