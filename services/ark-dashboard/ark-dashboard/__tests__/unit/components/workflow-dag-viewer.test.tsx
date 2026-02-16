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
        expect(
          screen.getByTestId('node-task-a.task-a-template'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-task-b.task-b-template'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-task-c.task-c-template'),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByTestId('edge-task-a.task-a-template-task-b.task-b-template'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('edge-task-a.task-a-template-task-c.task-c-template'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('edge-task-b.task-b-template-task-c.task-c-template'),
      ).toBeInTheDocument();
    });

    it('should parse and render DAG workflow with depends field using && syntax', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
metadata:
  name: dag-workflow-depends
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
          - name: task-c
            template: task-c-template
            depends: task-a && task-b
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
                  { name: 'task-b', template: 'task-b-template' },
                  {
                    name: 'task-c',
                    template: 'task-c-template',
                    depends: 'task-a && task-b',
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
        expect(
          screen.getByTestId('node-task-a.task-a-template'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-task-b.task-b-template'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-task-c.task-c-template'),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByTestId('edge-task-a.task-a-template-task-c.task-c-template'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('edge-task-b.task-b-template-task-c.task-c-template'),
      ).toBeInTheDocument();
    });

    it('should parse and render DAG workflow with depends field using || syntax', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
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
          - name: task-c
            template: task-c-template
            depends: task-a || task-b
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
                  { name: 'task-b', template: 'task-b-template' },
                  {
                    name: 'task-c',
                    template: 'task-c-template',
                    depends: 'task-a || task-b',
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
        expect(
          screen.getByTestId('node-task-a.task-a-template'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-task-b.task-b-template'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-task-c.task-c-template'),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByTestId('edge-task-a.task-a-template-task-c.task-c-template'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('edge-task-b.task-b-template-task-c.task-c-template'),
      ).toBeInTheDocument();
    });

    it('should parse complex depends field with single dependency', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  entrypoint: main
  templates:
    - name: main
      dag:
        tasks:
          - name: validate
            template: validate-template
          - name: build
            template: build-template
            depends: validate
`;

      const parsed = {
        spec: {
          entrypoint: 'main',
          templates: [
            {
              name: 'main',
              dag: {
                tasks: [
                  { name: 'validate', template: 'validate-template' },
                  {
                    name: 'build',
                    template: 'build-template',
                    depends: 'validate',
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
        expect(
          screen.getByTestId('node-validate.validate-template'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-build.build-template'),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByTestId('edge-validate.validate-template-build.build-template'),
      ).toBeInTheDocument();
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
        expect(
          screen.getByTestId('node-single-task.single-template'),
        ).toBeInTheDocument();
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
        expect(
          screen.getByTestId('node-step1-task1.step1-task1'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-step2-task1.step2-task1'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-step3-task1.step3-task1'),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByTestId('edge-step1-task1.step1-task1-step2-task1.step2-task1'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('edge-step2-task1.step2-task1-step3-task1.step3-task1'),
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
        expect(
          screen.getByTestId('node-parallel-task1.parallel-task1'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-parallel-task2.parallel-task2'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-next-task.next-task'),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByTestId('edge-parallel-task1.parallel-task1-next-task.next-task'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('edge-parallel-task2.parallel-task2-next-task.next-task'),
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
          screen.getByText('No entrypoint, DAG, or steps found in workflow'),
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
        expect(
          screen.getByText('No tasks found after expanding templates'),
        ).toBeInTheDocument();
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
        expect(
          screen.getByTestId('node-task-a.template-a'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-task-b.template-b'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('edge-task-a.template-a-task-b.template-b'),
        ).toBeInTheDocument();
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
        expect(
          screen.getByTestId('node-task-old.template-old'),
        ).toBeInTheDocument();
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
        expect(
          screen.getByTestId('node-task-new.template-new'),
        ).toBeInTheDocument();
        expect(
          screen.queryByTestId('node-task-old.template-old'),
        ).not.toBeInTheDocument();
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
        expect(
          screen.getByTestId('node-first-step.first-step'),
        ).toBeInTheDocument();
      });

      expect(screen.queryByTestId(/^edge-/)).not.toBeInTheDocument();
    });
  });

  describe('Nested template expansion', () => {
    it('should handle nested templates with depends field', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  entrypoint: main
  templates:
    - name: main
      dag:
        tasks:
          - name: build
            template: build-pipeline
          - name: test
            template: test-pipeline
            depends: build
          - name: deploy
            template: deploy-step
            depends: test
    - name: build-pipeline
      dag:
        tasks:
          - name: compile
            template: compile-step
          - name: package
            template: package-step
            depends: compile
    - name: test-pipeline
      dag:
        tasks:
          - name: unit-test
            template: test-step
          - name: integration-test
            template: test-step
            depends: unit-test
`;

      const parsed = {
        spec: {
          entrypoint: 'main',
          templates: [
            {
              name: 'main',
              dag: {
                tasks: [
                  { name: 'build', template: 'build-pipeline' },
                  { name: 'test', template: 'test-pipeline', depends: 'build' },
                  { name: 'deploy', template: 'deploy-step', depends: 'test' },
                ],
              },
            },
            {
              name: 'build-pipeline',
              dag: {
                tasks: [
                  { name: 'compile', template: 'compile-step' },
                  { name: 'package', template: 'package-step', depends: 'compile' },
                ],
              },
            },
            {
              name: 'test-pipeline',
              dag: {
                tasks: [
                  { name: 'unit-test', template: 'test-step' },
                  { name: 'integration-test', template: 'test-step', depends: 'unit-test' },
                ],
              },
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(
          screen.getByTestId('node-build.compile.compile-step'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-build.package.package-step'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-test.unit-test.test-step'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-test.integration-test.test-step'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-deploy.deploy-step'),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByTestId('edge-build.compile.compile-step-build.package.package-step'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('edge-build.package.package-step-test.unit-test.test-step'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('edge-test.unit-test.test-step-test.integration-test.test-step'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('edge-test.integration-test.test-step-deploy.deploy-step'),
      ).toBeInTheDocument();
    });

    it('should expand nested DAG templates and connect edges correctly', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  entrypoint: main
  templates:
    - name: main
      dag:
        tasks:
          - name: task-a
            template: nested-template
          - name: task-b
            template: another-template
            dependencies: [task-a]
    - name: nested-template
      steps:
        - - name: subtask-1
        - - name: subtask-2
    - name: another-template
      dag:
        tasks:
          - name: leaf-task
            template: leaf
`;

      const parsed = {
        spec: {
          entrypoint: 'main',
          templates: [
            {
              name: 'main',
              dag: {
                tasks: [
                  { name: 'task-a', template: 'nested-template' },
                  {
                    name: 'task-b',
                    template: 'another-template',
                    dependencies: ['task-a'],
                  },
                ],
              },
            },
            {
              name: 'nested-template',
              steps: [
                [{ name: 'subtask-1', template: 'subtask-1' }],
                [{ name: 'subtask-2', template: 'subtask-2' }],
              ],
            },
            {
              name: 'another-template',
              dag: {
                tasks: [{ name: 'leaf-task', template: 'leaf' }],
              },
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(
          screen.getByTestId('node-task-a.subtask-1.subtask-1'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-task-a.subtask-2.subtask-2'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-task-b.leaf-task.leaf'),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByTestId('edge-task-a.subtask-1.subtask-1-task-a.subtask-2.subtask-2'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('edge-task-a.subtask-2.subtask-2-task-b.leaf-task.leaf'),
      ).toBeInTheDocument();
    });

    it('should handle deeply nested templates with multiple levels', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  entrypoint: level-0
  templates:
    - name: level-0
      dag:
        tasks:
          - name: start
            template: level-1
    - name: level-1
      dag:
        tasks:
          - name: middle
            template: level-2
    - name: level-2
      steps:
        - - name: end
`;

      const parsed = {
        spec: {
          entrypoint: 'level-0',
          templates: [
            {
              name: 'level-0',
              dag: {
                tasks: [{ name: 'start', template: 'level-1' }],
              },
            },
            {
              name: 'level-1',
              dag: {
                tasks: [{ name: 'middle', template: 'level-2' }],
              },
            },
            {
              name: 'level-2',
              steps: [[{ name: 'end', template: 'end' }]],
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(
          screen.getByTestId('node-start.middle.end.end'),
        ).toBeInTheDocument();
      });
    });

    it('should handle nested templates with parallel branches', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  entrypoint: main
  templates:
    - name: main
      dag:
        tasks:
          - name: branch-a
            template: branch-template
          - name: branch-b
            template: branch-template
    - name: branch-template
      steps:
        - - name: step-1
        - - name: step-2
`;

      const parsed = {
        spec: {
          entrypoint: 'main',
          templates: [
            {
              name: 'main',
              dag: {
                tasks: [
                  { name: 'branch-a', template: 'branch-template' },
                  { name: 'branch-b', template: 'branch-template' },
                ],
              },
            },
            {
              name: 'branch-template',
              steps: [
                [{ name: 'step-1', template: 'step-1' }],
                [{ name: 'step-2', template: 'step-2' }],
              ],
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(
          screen.getByTestId('node-branch-a.step-1.step-1'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-branch-a.step-2.step-2'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-branch-b.step-1.step-1'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-branch-b.step-2.step-2'),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByTestId('edge-branch-a.step-1.step-1-branch-a.step-2.step-2'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('edge-branch-b.step-1.step-1-branch-b.step-2.step-2'),
      ).toBeInTheDocument();
    });

    it('should connect dependencies to exit nodes of expanded templates', async () => {
      const manifest = `
apiVersion: argoproj.io/v1alpha1
kind: WorkflowTemplate
spec:
  entrypoint: main
  templates:
    - name: main
      dag:
        tasks:
          - name: first
            template: multi-step
          - name: second
            template: single-task
            dependencies: [first]
    - name: multi-step
      steps:
        - - name: step-1
        - - name: step-2
        - - name: step-3
    - name: single-task
      dag:
        tasks:
          - name: final
            template: final
`;

      const parsed = {
        spec: {
          entrypoint: 'main',
          templates: [
            {
              name: 'main',
              dag: {
                tasks: [
                  { name: 'first', template: 'multi-step' },
                  {
                    name: 'second',
                    template: 'single-task',
                    dependencies: ['first'],
                  },
                ],
              },
            },
            {
              name: 'multi-step',
              steps: [
                [{ name: 'step-1', template: 'step-1' }],
                [{ name: 'step-2', template: 'step-2' }],
                [{ name: 'step-3', template: 'step-3' }],
              ],
            },
            {
              name: 'single-task',
              dag: {
                tasks: [{ name: 'final', template: 'final' }],
              },
            },
          ],
        },
      };

      vi.mocked(yaml.load).mockReturnValue(parsed);

      render(<WorkflowDagViewer manifest={manifest} />);

      await waitFor(() => {
        expect(
          screen.getByTestId('node-first.step-1.step-1'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-first.step-2.step-2'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-first.step-3.step-3'),
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('node-second.final.final'),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByTestId('edge-first.step-3.step-3-second.final.final'),
      ).toBeInTheDocument();
    });
  });
});
