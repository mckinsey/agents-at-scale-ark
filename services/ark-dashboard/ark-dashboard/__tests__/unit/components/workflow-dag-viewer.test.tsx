import { render, screen, waitFor } from '@testing-library/react';

import dagre from 'dagre';
import yaml from 'js-yaml';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkflowDagViewer } from '@/components/workflow-dag-viewer';

vi.mock('@xyflow/react', () => ({
  ReactFlow: vi.fn(({ nodes, edges }) => (
    <div data-testid="react-flow">
      {nodes.map((node: { id: string; data: { label: string } }) => (
        <div key={node.id} data-testid={`node-${node.id}`}>
          {node.data.label}
        </div>
      ))}
      {edges.map((edge: { id: string; source: string; target: string }) => (
        <div key={edge.id} data-testid={`edge-${edge.id}`}>
          {edge.source} → {edge.target}
        </div>
      ))}
    </div>
  )),
  Background: vi.fn(() => <div data-testid="background" />),
  Controls: vi.fn(() => <div data-testid="controls" />),
  Handle: vi.fn(() => <div data-testid="handle" />),
  Position: {
    Left: 'left',
    Right: 'right',
  },
  MarkerType: {
    Arrow: 'arrow',
  },
}));

vi.mock('dagre', () => ({
  default: {
    graphlib: {
      Graph: vi.fn().mockImplementation(() => ({
        setDefaultEdgeLabel: vi.fn(),
        setGraph: vi.fn(),
        setNode: vi.fn(),
        setEdge: vi.fn(),
        node: vi.fn((_id: string) => ({
          x: 100,
          y: 100,
        })),
      })),
    },
    layout: vi.fn(),
  },
}));

vi.mock('js-yaml', () => ({
  default: {
    load: vi.fn(),
  },
}));

describe('WorkflowDagViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DAG workflow parsing', () => {
    it('should parse and render DAG workflow with dependencies', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: dag-workflow
spec:
  entrypoint: main
  templates:
    - name: main
      dag:
        tasks:
          - name: task-a
            template: task-a-template
          - name: task-b
            template: task-b-template
            dependencies: [task-a]
          - name: task-c
            template: task-c-template
            dependencies: [task-a, task-b]
`;

      const parsed = {
        spec: {
          entrypoint: 'main',
          templates: [
            {
              name: 'main',
              dag: {
                tasks: [
                  { name: 'task-a', template: 'task-a-template' },
                  {
                    name: 'task-b',
                    template: 'task-b-template',
                    dependencies: ['task-a'],
                  },
                  {
                    name: 'task-c',
                    template: 'task-c-template',
                    dependencies: ['task-a', 'task-b'],
                  },
                ],
              },
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(screen.getByTestId('react-flow')).toBeInTheDocument();
        expect(screen.getByTestId('node-task-a')).toBeInTheDocument();
        expect(screen.getByTestId('node-task-b')).toBeInTheDocument();
        expect(screen.getByTestId('node-task-c')).toBeInTheDocument();
      });

      expect(screen.getByTestId('edge-task-a-task-b')).toBeInTheDocument();
      expect(screen.getByTestId('edge-task-a-task-c')).toBeInTheDocument();
      expect(screen.getByTestId('edge-task-b-task-c')).toBeInTheDocument();
    });

    it('should parse DAG workflow without dependencies', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  templates:
    - name: main
      dag:
        tasks:
          - name: single-task
            template: single-template
`;

      const parsed = {
        spec: {
          templates: [
            {
              name: 'main',
              dag: {
                tasks: [{ name: 'single-task', template: 'single-template' }],
              },
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(screen.getByTestId('node-single-task')).toBeInTheDocument();
      });

      expect(screen.queryByTestId(/^edge-/)).not.toBeInTheDocument();
    });
  });

  describe('Steps workflow parsing', () => {
    it('should parse and render Steps workflow with sequential tasks', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  templates:
    - name: main
      steps:
        - - name: step1-task1
        - - name: step2-task1
        - - name: step3-task1
`;

      const parsed = {
        spec: {
          templates: [
            {
              name: 'main',
              steps: [
                [{ name: 'step1-task1' }],
                [{ name: 'step2-task1' }],
                [{ name: 'step3-task1' }],
              ],
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(screen.getByTestId('node-step1-task1')).toBeInTheDocument();
        expect(screen.getByTestId('node-step2-task1')).toBeInTheDocument();
        expect(screen.getByTestId('node-step3-task1')).toBeInTheDocument();
      });

      expect(
        screen.getByTestId('edge-step1-task1-step2-task1'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('edge-step2-task1-step3-task1'),
      ).toBeInTheDocument();
    });

    it('should parse Steps workflow with parallel tasks in same step', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  templates:
    - name: main
      steps:
        - - name: parallel-task1
          - name: parallel-task2
        - - name: next-task
`;

      const parsed = {
        spec: {
          templates: [
            {
              name: 'main',
              steps: [
                [{ name: 'parallel-task1' }, { name: 'parallel-task2' }],
                [{ name: 'next-task' }],
              ],
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(screen.getByTestId('node-parallel-task1')).toBeInTheDocument();
        expect(screen.getByTestId('node-parallel-task2')).toBeInTheDocument();
        expect(screen.getByTestId('node-next-task')).toBeInTheDocument();
      });

      expect(
        screen.getByTestId('edge-parallel-task1-next-task'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('edge-parallel-task2-next-task'),
      ).toBeInTheDocument();
    });
  });

  describe('Entrypoint workflow parsing', () => {
    it('should render single node for entrypoint-only workflow', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  entrypoint: main-task
  templates:
    - name: main-task
`;

      const parsed = {
        spec: {
          entrypoint: 'main-task',
          templates: [{ name: 'main-task' }],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(screen.getByTestId('node-main-task')).toBeInTheDocument();
      });

      expect(screen.queryByTestId(/^edge-/)).not.toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('should display error when YAML parsing fails', async () => {
      const manifest = 'invalid: yaml: content: [';

      vi.mocked(yaml.load).mockImplementation(() => {
        throw new Error('YAML parse error');
      });

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(screen.getByText('YAML parse error')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument();
    });

    it('should display error when no templates found', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  entrypoint: main
`;

      const parsed = {
        spec: {
          entrypoint: 'main',
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(
          screen.getByText('No templates found in workflow manifest'),
        ).toBeInTheDocument();
      });
    });

    it('should display error when no DAG, Steps, or entrypoint found', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  templates:
    - name: some-template
`;

      const parsed = {
        spec: {
          templates: [{ name: 'some-template' }],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(
          screen.getByText('No DAG, Steps, or entrypoint found in workflow'),
        ).toBeInTheDocument();
      });
    });

    it('should display generic error message for non-Error exceptions', async () => {
      const manifest = 'some yaml';

      vi.mocked(yaml.load).mockImplementation(() => {
        throw 'String error';
      });

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(
          screen.getByText('Failed to parse workflow manifest'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Empty state handling', () => {
    it('should display empty state when no tasks found', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  templates:
    - name: main
      dag:
        tasks: []
`;

      const parsed = {
        spec: {
          templates: [
            {
              name: 'main',
              dag: {
                tasks: [],
              },
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(screen.getByText('No tasks found in DAG')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument();
    });
  });

  describe('Layout logic', () => {
    it('should render nodes and edges after applying layout', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  templates:
    - name: main
      dag:
        tasks:
          - name: task-a
            template: template-a
          - name: task-b
            template: template-b
            dependencies: [task-a]
`;

      const parsed = {
        spec: {
          templates: [
            {
              name: 'main',
              dag: {
                tasks: [
                  { name: 'task-a', template: 'template-a' },
                  {
                    name: 'task-b',
                    template: 'template-b',
                    dependencies: ['task-a'],
                  },
                ],
              },
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(screen.getByTestId('react-flow')).toBeInTheDocument();
        expect(screen.getByTestId('node-task-a')).toBeInTheDocument();
        expect(screen.getByTestId('node-task-b')).toBeInTheDocument();
        expect(screen.getByTestId('edge-task-a-task-b')).toBeInTheDocument();
      });

      expect(dagre.layout).toHaveBeenCalled();
    });
  });

  describe('Manifest updates', () => {
    it('should update visualization when manifest changes', async () => {
      const manifest1 = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  templates:
    - name: main
      dag:
        tasks:
          - name: task-old
            template: template-old
`;

      const parsed1 = {
        spec: {
          templates: [
            {
              name: 'main',
              dag: {
                tasks: [{ name: 'task-old', template: 'template-old' }],
              },
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed1);

      const { rerender } = render(<WorkflowDagViewer manifest={manifest1} />);

      await waitFor(() => {
        expect(screen.getByTestId('node-task-old')).toBeInTheDocument();
      });

      const manifest2 = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  templates:
    - name: main
      dag:
        tasks:
          - name: task-new
            template: template-new
`;

      const parsed2 = {
        spec: {
          templates: [
            {
              name: 'main',
              dag: {
                tasks: [{ name: 'task-new', template: 'template-new' }],
              },
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed2);

      rerender(<WorkflowDagViewer manifest={manifest2} />);

      await waitFor(() => {
        expect(screen.getByTestId('node-task-new')).toBeInTheDocument();
        expect(screen.queryByTestId('node-task-old')).not.toBeInTheDocument();
      });
    });
  });

  describe('Steps workflow edge cases', () => {
    it('should handle steps workflow with first step having no dependencies', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  templates:
    - name: main
      steps:
        - - name: first-step
`;

      const parsed = {
        spec: {
          templates: [
            {
              name: 'main',
              steps: [[{ name: 'first-step' }]],
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(screen.getByTestId('node-first-step')).toBeInTheDocument();
      });

      expect(screen.queryByTestId(/^edge-/)).not.toBeInTheDocument();
    });
  });
});
