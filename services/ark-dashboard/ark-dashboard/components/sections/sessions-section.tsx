'use client';

import {
  AlertCircle,
  ArrowUpDown,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Container,
  Cpu,
  ExternalLink,
  FileCode,
  FileText,
  GitBranch,
  HardDrive,
  Loader2,
  MessageSquare,
  Play,
  RefreshCw,
  Search,
  Terminal,
  Users,
  Workflow,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useState, useRef } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useWorkflows, useWorkflow } from '@/lib/services/workflows-hooks';
import { mapArgoWorkflowToSession, mapArgoWorkflowsToSessions } from '@/lib/services/workflow-mapper';

type SessionSourceFilter = 'all' | 'workflows' | 'teams' | 'agents';
type SessionType = 'workflow' | 'team' | 'agent';
type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
type WorkflowStepType = 'dag' | 'steps' | 'container' | 'script' | 'suspend';
type SortOrder = 'newest' | 'oldest';
type TeamStepType =
  | 'orchestrator'
  | 'agent'
  | 'delegation'
  | 'tool-call'
  | 'response';

interface WorkflowStepDetail {
  image?: string;
  command?: string[];
  args?: string[];
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  logs?: string[];
  exitCode?: number;
  resources?: {
    cpu?: string;
    memory?: string;
  };
  workflowName?: string;
  nodeId?: string;
  namespace?: string;
}

interface TeamStepDetail {
  model?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
  input?: string;
  output?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  thinking?: string;
}

interface WorkflowStep {
  id: string;
  name: string;
  displayName: string;
  type: WorkflowStepType;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  duration?: string;
  message?: string;
  detail?: WorkflowStepDetail;
  children?: WorkflowStep[];
}

interface TeamStep {
  id: string;
  agentName: string;
  displayName: string;
  type: TeamStepType;
  status: StepStatus;
  startedAt?: string;
  finishedAt?: string;
  duration?: string;
  message?: string;
  detail?: TeamStepDetail;
  children?: TeamStep[];
}

interface BaseSession {
  id: string;
  name: string;
  status: StepStatus;
  startedAt: string;
  finishedAt?: string;
  duration: string;
  namespace?: string;
  uid?: string;
}

interface WorkflowSession extends BaseSession {
  type: 'workflow';
  steps: WorkflowStep[];
}

interface TeamSession extends BaseSession {
  type: 'team';
  steps: TeamStep[];
}

type Session = WorkflowSession | TeamSession;

const MOCK_WORKFLOW_SESSIONS: WorkflowSession[] = [
  // 1. SIMPLE: Health Check Workflow (3 steps, linear)
  {
    id: 'wf-health-001',
    name: 'api-health-check',
    type: 'workflow',
    status: 'succeeded',
    startedAt: '2024-01-15T14:00:00Z',
    finishedAt: '2024-01-15T14:00:45Z',
    duration: '45s',
    steps: [
      {
        id: 'health-1',
        name: 'api-health-check',
        displayName: 'Health Check',
        type: 'steps',
        status: 'succeeded',
        startedAt: '2024-01-15T14:00:00Z',
        finishedAt: '2024-01-15T14:00:45Z',
        duration: '45s',
        children: [
          {
            id: 'health-1-1',
            name: 'check-api',
            displayName: 'Check API Endpoints',
            type: 'script',
            status: 'succeeded',
            startedAt: '2024-01-15T14:00:02Z',
            finishedAt: '2024-01-15T14:00:18Z',
            duration: '16s',
            detail: {
              inputs: {
                endpoints: '/health,/ready,/metrics',
                timeout: '5s',
                expected_status: '200',
              },
              outputs: {
                health_status: 'healthy',
                response_time_avg: '23ms',
                endpoints_checked: '3',
              },
              logs: [
                '[INFO] Checking endpoint /health... OK (18ms)',
                '[INFO] Checking endpoint /ready... OK (25ms)',
                '[INFO] Checking endpoint /metrics... OK (26ms)',
                '[INFO] All endpoints healthy',
              ],
              exitCode: 0,
            },
          },
          {
            id: 'health-1-2',
            name: 'check-database',
            displayName: 'Check Database Connection',
            type: 'container',
            status: 'succeeded',
            startedAt: '2024-01-15T14:00:20Z',
            finishedAt: '2024-01-15T14:00:32Z',
            duration: '12s',
            detail: {
              image: 'postgres:15-alpine',
              command: ['pg_isready', '-h', 'db.internal'],
              outputs: {
                connection_status: 'accepting connections',
                latency: '3ms',
              },
              logs: [
                '[INFO] Testing database connection...',
                '[INFO] db.internal:5432 - accepting connections',
              ],
              exitCode: 0,
              resources: { cpu: '50m', memory: '64Mi' },
            },
          },
          {
            id: 'health-1-3',
            name: 'send-notification',
            displayName: 'Send Status Notification',
            type: 'script',
            status: 'succeeded',
            startedAt: '2024-01-15T14:00:34Z',
            finishedAt: '2024-01-15T14:00:43Z',
            duration: '9s',
            detail: {
              inputs: {
                channel: '#ops-alerts',
                message_type: 'success',
              },
              outputs: {
                notification_sent: 'true',
                message_id: 'msg-12847',
              },
              logs: [
                '[INFO] Composing health check summary',
                '[INFO] Sending to Slack channel #ops-alerts',
                '[INFO] Notification delivered successfully',
              ],
              exitCode: 0,
            },
          },
        ],
      },
    ],
  },

  // 2. MEDIUM: CI/CD Pipeline (8 steps with some nesting)
  {
    id: 'wf-cicd-002',
    name: 'frontend-deploy-pipeline',
    type: 'workflow',
    status: 'succeeded',
    startedAt: '2024-01-15T11:00:00Z',
    finishedAt: '2024-01-15T11:12:45Z',
    duration: '12m 45s',
    steps: [
      {
        id: 'cicd-1',
        name: 'frontend-deploy',
        displayName: 'Frontend Deploy Pipeline',
        type: 'dag',
        status: 'succeeded',
        startedAt: '2024-01-15T11:00:00Z',
        finishedAt: '2024-01-15T11:12:45Z',
        duration: '12m 45s',
        children: [
          {
            id: 'cicd-1-1',
            name: 'checkout',
            displayName: 'Checkout Code',
            type: 'container',
            status: 'succeeded',
            startedAt: '2024-01-15T11:00:02Z',
            finishedAt: '2024-01-15T11:00:28Z',
            duration: '26s',
            detail: {
              image: 'alpine/git:2.43.0',
              command: ['git', 'clone', '--depth=1'],
              inputs: {
                repository: 'github.com/company/frontend',
                branch: 'main',
                commit: 'abc1234',
              },
              outputs: {
                files_cloned: '847',
                repo_size: '45 MB',
              },
              logs: [
                '[INFO] Cloning repository...',
                '[INFO] Checking out commit abc1234',
                '[INFO] Clone complete: 847 files',
              ],
              exitCode: 0,
              resources: { cpu: '100m', memory: '256Mi' },
            },
          },
          {
            id: 'cicd-1-2',
            name: 'install-deps',
            displayName: 'Install Dependencies',
            type: 'container',
            status: 'succeeded',
            startedAt: '2024-01-15T11:00:30Z',
            finishedAt: '2024-01-15T11:02:15Z',
            duration: '1m 45s',
            detail: {
              image: 'node:20-alpine',
              command: ['npm', 'ci'],
              inputs: {
                node_version: '20.10.0',
                package_manager: 'npm',
              },
              outputs: {
                packages_installed: '1,247',
                cache_hit: 'true',
              },
              logs: [
                '[INFO] npm ci --legacy-peer-deps',
                '[INFO] Using cached packages',
                '[INFO] Added 1,247 packages in 1m 42s',
              ],
              exitCode: 0,
              resources: { cpu: '500m', memory: '1Gi' },
            },
          },
          {
            id: 'cicd-1-3',
            name: 'test-suite',
            displayName: 'Run Tests',
            type: 'steps',
            status: 'succeeded',
            startedAt: '2024-01-15T11:02:20Z',
            finishedAt: '2024-01-15T11:06:10Z',
            duration: '3m 50s',
            children: [
              {
                id: 'cicd-1-3-1',
                name: 'unit-tests',
                displayName: 'Unit Tests',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T11:02:22Z',
                finishedAt: '2024-01-15T11:04:00Z',
                duration: '1m 38s',
                detail: {
                  image: 'node:20-alpine',
                  command: ['npm', 'run', 'test:unit'],
                  outputs: {
                    tests_passed: '342',
                    tests_failed: '0',
                    coverage: '87.3%',
                  },
                  logs: [
                    '[INFO] Running Jest unit tests...',
                    '[INFO] Test Suites: 28 passed, 28 total',
                    '[INFO] Tests: 342 passed, 342 total',
                    '[INFO] Coverage: 87.3%',
                  ],
                  exitCode: 0,
                  resources: { cpu: '1', memory: '2Gi' },
                },
              },
              {
                id: 'cicd-1-3-2',
                name: 'e2e-tests',
                displayName: 'E2E Tests',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T11:04:05Z',
                finishedAt: '2024-01-15T11:06:08Z',
                duration: '2m 3s',
                detail: {
                  image: 'mcr.microsoft.com/playwright:v1.40.0',
                  command: ['npx', 'playwright', 'test'],
                  outputs: {
                    tests_passed: '47',
                    tests_failed: '0',
                    browsers_tested: 'chromium,firefox,webkit',
                  },
                  logs: [
                    '[INFO] Running Playwright E2E tests...',
                    '[INFO] Testing on 3 browsers',
                    '[INFO] 47 passed (2m 1s)',
                  ],
                  exitCode: 0,
                  resources: { cpu: '2', memory: '4Gi' },
                },
              },
            ],
          },
          {
            id: 'cicd-1-4',
            name: 'build',
            displayName: 'Build Application',
            type: 'container',
            status: 'succeeded',
            startedAt: '2024-01-15T11:06:15Z',
            finishedAt: '2024-01-15T11:08:30Z',
            duration: '2m 15s',
            detail: {
              image: 'node:20-alpine',
              command: ['npm', 'run', 'build'],
              inputs: {
                node_env: 'production',
                build_target: 'es2022',
              },
              outputs: {
                bundle_size: '1.2 MB',
                chunks: '12',
                build_time: '2m 12s',
              },
              logs: [
                '[INFO] Creating production build...',
                '[INFO] Compiling TypeScript',
                '[INFO] Optimizing bundle',
                '[INFO] Build complete: 1.2 MB (gzipped: 380 KB)',
              ],
              exitCode: 0,
              resources: { cpu: '2', memory: '4Gi' },
            },
          },
          {
            id: 'cicd-1-5',
            name: 'docker-build',
            displayName: 'Build Docker Image',
            type: 'container',
            status: 'succeeded',
            startedAt: '2024-01-15T11:08:35Z',
            finishedAt: '2024-01-15T11:10:20Z',
            duration: '1m 45s',
            detail: {
              image: 'gcr.io/kaniko-project/executor:v1.19.0',
              inputs: {
                dockerfile: 'Dockerfile',
                context: '.',
                destination: 'gcr.io/company/frontend:abc1234',
              },
              outputs: {
                image_size: '125 MB',
                layers: '8',
                digest: 'sha256:9f8e7d6c...',
              },
              logs: [
                '[INFO] Building Docker image...',
                '[INFO] Layer 1/8: base image',
                '[INFO] Layer 8/8: application',
                '[INFO] Pushing to gcr.io/company/frontend:abc1234',
                '[INFO] Image pushed successfully',
              ],
              exitCode: 0,
              resources: { cpu: '1', memory: '2Gi' },
            },
          },
          {
            id: 'cicd-1-6',
            name: 'deploy-staging',
            displayName: 'Deploy to Staging',
            type: 'container',
            status: 'succeeded',
            startedAt: '2024-01-15T11:10:25Z',
            finishedAt: '2024-01-15T11:11:40Z',
            duration: '1m 15s',
            detail: {
              image: 'bitnami/kubectl:1.29',
              command: ['kubectl', 'apply', '-f', 'k8s/staging/'],
              inputs: {
                cluster: 'staging-cluster',
                namespace: 'frontend',
                replicas: '2',
              },
              outputs: {
                pods_updated: '2',
                rollout_status: 'complete',
              },
              logs: [
                '[INFO] Applying Kubernetes manifests...',
                '[INFO] deployment.apps/frontend configured',
                '[INFO] Waiting for rollout...',
                '[INFO] Rollout complete: 2/2 pods ready',
              ],
              exitCode: 0,
              resources: { cpu: '100m', memory: '256Mi' },
            },
          },
          {
            id: 'cicd-1-7',
            name: 'smoke-test',
            displayName: 'Smoke Test',
            type: 'script',
            status: 'succeeded',
            startedAt: '2024-01-15T11:11:45Z',
            finishedAt: '2024-01-15T11:12:15Z',
            duration: '30s',
            detail: {
              inputs: {
                target_url: 'https://staging.company.com',
                checks: 'homepage,login,api',
              },
              outputs: {
                all_checks_passed: 'true',
                response_time: '145ms',
              },
              logs: [
                '[INFO] Running smoke tests against staging...',
                '[INFO] Homepage: OK (120ms)',
                '[INFO] Login flow: OK (180ms)',
                '[INFO] API health: OK (135ms)',
              ],
              exitCode: 0,
            },
          },
          {
            id: 'cicd-1-8',
            name: 'notify',
            displayName: 'Send Notification',
            type: 'script',
            status: 'succeeded',
            startedAt: '2024-01-15T11:12:20Z',
            finishedAt: '2024-01-15T11:12:42Z',
            duration: '22s',
            detail: {
              inputs: {
                channel: '#deployments',
                mention: '@frontend-team',
              },
              outputs: {
                notification_sent: 'true',
              },
              logs: [
                '[INFO] Deployment successful!',
                '[INFO] Notifying #deployments channel',
              ],
              exitCode: 0,
            },
          },
        ],
      },
    ],
  },

  // 3. COMPLEX: ML Training Pipeline (deeply nested, multiple phases)
  {
    id: 'wf-ml-003',
    name: 'recommendation-model-training',
    type: 'workflow',
    status: 'running',
    startedAt: '2024-01-15T08:00:00Z',
    duration: '2h 15m',
    steps: [
      {
        id: 'ml-1',
        name: 'ml-pipeline',
        displayName: 'ML Training Pipeline',
        type: 'dag',
        status: 'running',
        startedAt: '2024-01-15T08:00:00Z',
        duration: '2h 15m',
        children: [
          {
            id: 'ml-1-1',
            name: 'data-preparation',
            displayName: 'Data Preparation',
            type: 'dag',
            status: 'succeeded',
            startedAt: '2024-01-15T08:00:05Z',
            finishedAt: '2024-01-15T08:45:30Z',
            duration: '45m 25s',
            children: [
              {
                id: 'ml-1-1-1',
                name: 'extract-features',
                displayName: 'Extract Features',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T08:00:10Z',
                finishedAt: '2024-01-15T08:20:45Z',
                duration: '20m 35s',
                detail: {
                  image: 'spark:3.5.0-python3',
                  command: ['spark-submit', 'extract_features.py'],
                  inputs: {
                    source_tables: 'user_events,products,interactions',
                    date_range: '90 days',
                    feature_set: 'v3.2',
                  },
                  outputs: {
                    records_processed: '127,483,921',
                    features_extracted: '256',
                    output_size: '45 GB',
                  },
                  logs: [
                    '[INFO] Starting feature extraction job',
                    '[INFO] Processing user_events: 89M records',
                    '[INFO] Processing products: 2.1M records',
                    '[INFO] Processing interactions: 36M records',
                    '[INFO] Feature extraction complete',
                  ],
                  exitCode: 0,
                  resources: { cpu: '8', memory: '32Gi' },
                },
              },
              {
                id: 'ml-1-1-2',
                name: 'data-validation',
                displayName: 'Validate Data Quality',
                type: 'script',
                status: 'succeeded',
                startedAt: '2024-01-15T08:20:50Z',
                finishedAt: '2024-01-15T08:28:15Z',
                duration: '7m 25s',
                detail: {
                  inputs: {
                    checks: 'null_ratio,distribution,outliers,schema',
                    threshold: '0.99',
                  },
                  outputs: {
                    validation_score: '0.997',
                    issues_found: '3',
                    issues_severity: 'low',
                  },
                  logs: [
                    '[INFO] Running data quality checks...',
                    '[INFO] Null ratio check: PASS (0.001%)',
                    '[INFO] Distribution check: PASS',
                    '[WARN] 3 minor outliers detected in price feature',
                    '[INFO] Schema validation: PASS',
                  ],
                  exitCode: 0,
                },
              },
              {
                id: 'ml-1-1-3',
                name: 'split-data',
                displayName: 'Train/Val/Test Split',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T08:28:20Z',
                finishedAt: '2024-01-15T08:45:25Z',
                duration: '17m 5s',
                detail: {
                  image: 'python:3.11-slim',
                  inputs: {
                    train_ratio: '0.8',
                    val_ratio: '0.1',
                    test_ratio: '0.1',
                    stratify_by: 'user_segment',
                  },
                  outputs: {
                    train_samples: '101,987,137',
                    val_samples: '12,748,392',
                    test_samples: '12,748,392',
                  },
                  logs: [
                    '[INFO] Splitting dataset with stratification',
                    '[INFO] Train set: 101.9M samples',
                    '[INFO] Validation set: 12.7M samples',
                    '[INFO] Test set: 12.7M samples',
                  ],
                  exitCode: 0,
                  resources: { cpu: '4', memory: '16Gi' },
                },
              },
            ],
          },
          {
            id: 'ml-1-2',
            name: 'model-training',
            displayName: 'Model Training',
            type: 'dag',
            status: 'running',
            startedAt: '2024-01-15T08:45:35Z',
            duration: '1h 29m',
            children: [
              {
                id: 'ml-1-2-1',
                name: 'train-embedding',
                displayName: 'Train Embedding Layer',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T08:45:40Z',
                finishedAt: '2024-01-15T09:25:10Z',
                duration: '39m 30s',
                detail: {
                  image: 'pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime',
                  inputs: {
                    embedding_dim: '128',
                    vocab_size: '2,100,000',
                    learning_rate: '0.001',
                  },
                  outputs: {
                    final_loss: '0.0342',
                    epochs_completed: '15',
                    checkpoint: 's3://models/embedding_v3.2.pt',
                  },
                  logs: [
                    '[INFO] Initializing embedding model',
                    '[INFO] Epoch 1/15 - Loss: 0.2841',
                    '[INFO] Epoch 8/15 - Loss: 0.0512',
                    '[INFO] Epoch 15/15 - Loss: 0.0342',
                    '[INFO] Saving checkpoint',
                  ],
                  exitCode: 0,
                  resources: { cpu: '8', memory: '64Gi' },
                },
              },
              {
                id: 'ml-1-2-2',
                name: 'train-recommender',
                displayName: 'Train Recommender Model',
                type: 'container',
                status: 'running',
                startedAt: '2024-01-15T09:25:15Z',
                duration: '49m 45s',
                detail: {
                  image: 'pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime',
                  inputs: {
                    model_type: 'transformer',
                    num_layers: '12',
                    attention_heads: '8',
                    batch_size: '2048',
                  },
                  logs: [
                    '[INFO] Loading pretrained embeddings',
                    '[INFO] Initializing transformer model',
                    '[INFO] Epoch 1/20 - Loss: 0.4521 - Val Loss: 0.4102',
                    '[INFO] Epoch 10/20 - Loss: 0.1823 - Val Loss: 0.1956',
                    '[INFO] Epoch 15/20 - Loss: 0.0891 - Val Loss: 0.1012',
                    '[INFO] Training epoch 16/20...',
                  ],
                  resources: { cpu: '16', memory: '128Gi' },
                },
              },
            ],
          },
          {
            id: 'ml-1-3',
            name: 'evaluation',
            displayName: 'Model Evaluation',
            type: 'dag',
            status: 'pending',
            children: [
              {
                id: 'ml-1-3-1',
                name: 'offline-metrics',
                displayName: 'Compute Offline Metrics',
                type: 'container',
                status: 'pending',
                detail: {
                  image: 'python:3.11-slim',
                  inputs: {
                    metrics: 'ndcg@10,mrr,hit_rate@20,coverage',
                    test_set: 's3://data/test_set.parquet',
                  },
                },
              },
              {
                id: 'ml-1-3-2',
                name: 'bias-check',
                displayName: 'Bias & Fairness Check',
                type: 'script',
                status: 'pending',
                detail: {
                  inputs: {
                    protected_attributes: 'gender,age_group,region',
                    fairness_threshold: '0.8',
                  },
                },
              },
            ],
          },
          {
            id: 'ml-1-4',
            name: 'deployment',
            displayName: 'Model Deployment',
            type: 'steps',
            status: 'pending',
            children: [
              {
                id: 'ml-1-4-1',
                name: 'register-model',
                displayName: 'Register Model',
                type: 'script',
                status: 'pending',
                detail: {
                  inputs: {
                    registry: 'mlflow',
                    model_name: 'recommendation-v3.2',
                  },
                },
              },
              {
                id: 'ml-1-4-2',
                name: 'deploy-canary',
                displayName: 'Canary Deployment',
                type: 'container',
                status: 'pending',
                detail: {
                  image: 'bitnami/kubectl:1.29',
                  inputs: {
                    traffic_percentage: '5%',
                    namespace: 'ml-serving',
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  },

  // 4. COMPLEX: Multi-Region Deployment (parallel branches)
  {
    id: 'wf-deploy-004',
    name: 'global-service-rollout',
    type: 'workflow',
    status: 'failed',
    startedAt: '2024-01-15T06:00:00Z',
    finishedAt: '2024-01-15T06:25:30Z',
    duration: '25m 30s',
    steps: [
      {
        id: 'deploy-1',
        name: 'global-rollout',
        displayName: 'Global Service Rollout',
        type: 'dag',
        status: 'failed',
        startedAt: '2024-01-15T06:00:00Z',
        finishedAt: '2024-01-15T06:25:30Z',
        duration: '25m 30s',
        children: [
          {
            id: 'deploy-1-1',
            name: 'pre-deploy-checks',
            displayName: 'Pre-Deployment Checks',
            type: 'steps',
            status: 'succeeded',
            startedAt: '2024-01-15T06:00:05Z',
            finishedAt: '2024-01-15T06:02:30Z',
            duration: '2m 25s',
            children: [
              {
                id: 'deploy-1-1-1',
                name: 'validate-image',
                displayName: 'Validate Container Image',
                type: 'script',
                status: 'succeeded',
                startedAt: '2024-01-15T06:00:08Z',
                finishedAt: '2024-01-15T06:01:15Z',
                duration: '1m 7s',
                detail: {
                  inputs: {
                    image: 'gcr.io/company/api:v2.5.0',
                    scan_vulnerabilities: 'true',
                  },
                  outputs: {
                    vulnerabilities_critical: '0',
                    vulnerabilities_high: '2',
                    scan_status: 'passed',
                  },
                  logs: [
                    '[INFO] Pulling image for scanning...',
                    '[INFO] Running vulnerability scan',
                    '[WARN] 2 high severity vulnerabilities (accepted)',
                    '[INFO] Image validation passed',
                  ],
                  exitCode: 0,
                },
              },
              {
                id: 'deploy-1-1-2',
                name: 'check-capacity',
                displayName: 'Check Cluster Capacity',
                type: 'script',
                status: 'succeeded',
                startedAt: '2024-01-15T06:01:20Z',
                finishedAt: '2024-01-15T06:02:28Z',
                duration: '1m 8s',
                detail: {
                  inputs: {
                    regions: 'us-east,us-west,eu-west,ap-south',
                    min_available_nodes: '3',
                  },
                  outputs: {
                    us_east_capacity: 'OK (8 nodes)',
                    us_west_capacity: 'OK (6 nodes)',
                    eu_west_capacity: 'OK (5 nodes)',
                    ap_south_capacity: 'OK (4 nodes)',
                  },
                  logs: [
                    '[INFO] Checking cluster capacity...',
                    '[INFO] us-east-1: 8 nodes available',
                    '[INFO] us-west-2: 6 nodes available',
                    '[INFO] eu-west-1: 5 nodes available',
                    '[INFO] ap-south-1: 4 nodes available',
                  ],
                  exitCode: 0,
                },
              },
            ],
          },
          {
            id: 'deploy-1-2',
            name: 'deploy-us-east',
            displayName: 'Deploy US-East',
            type: 'steps',
            status: 'succeeded',
            startedAt: '2024-01-15T06:02:35Z',
            finishedAt: '2024-01-15T06:10:20Z',
            duration: '7m 45s',
            children: [
              {
                id: 'deploy-1-2-1',
                name: 'us-east-rollout',
                displayName: 'Rollout',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T06:02:40Z',
                finishedAt: '2024-01-15T06:07:15Z',
                duration: '4m 35s',
                detail: {
                  image: 'bitnami/kubectl:1.29',
                  command: ['kubectl', 'rollout', 'restart'],
                  inputs: {
                    cluster: 'us-east-1-prod',
                    deployment: 'api-service',
                    replicas: '12',
                  },
                  outputs: {
                    pods_updated: '12/12',
                    rollout_status: 'complete',
                  },
                  logs: [
                    '[INFO] Starting rollout in us-east-1',
                    '[INFO] Updating pod 1/12...',
                    '[INFO] Updating pod 12/12...',
                    '[INFO] Rollout complete',
                  ],
                  exitCode: 0,
                  resources: { cpu: '100m', memory: '256Mi' },
                },
              },
              {
                id: 'deploy-1-2-2',
                name: 'us-east-verify',
                displayName: 'Verify Health',
                type: 'script',
                status: 'succeeded',
                startedAt: '2024-01-15T06:07:20Z',
                finishedAt: '2024-01-15T06:10:18Z',
                duration: '2m 58s',
                detail: {
                  inputs: {
                    endpoint: 'https://us-east.api.company.com/health',
                    success_threshold: '99%',
                  },
                  outputs: {
                    success_rate: '99.8%',
                    avg_latency: '45ms',
                  },
                  exitCode: 0,
                },
              },
            ],
          },
          {
            id: 'deploy-1-3',
            name: 'deploy-us-west',
            displayName: 'Deploy US-West',
            type: 'steps',
            status: 'succeeded',
            startedAt: '2024-01-15T06:02:35Z',
            finishedAt: '2024-01-15T06:11:10Z',
            duration: '8m 35s',
            children: [
              {
                id: 'deploy-1-3-1',
                name: 'us-west-rollout',
                displayName: 'Rollout',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T06:02:40Z',
                finishedAt: '2024-01-15T06:08:30Z',
                duration: '5m 50s',
                detail: {
                  image: 'bitnami/kubectl:1.29',
                  inputs: {
                    cluster: 'us-west-2-prod',
                    replicas: '8',
                  },
                  outputs: {
                    pods_updated: '8/8',
                    rollout_status: 'complete',
                  },
                  exitCode: 0,
                  resources: { cpu: '100m', memory: '256Mi' },
                },
              },
              {
                id: 'deploy-1-3-2',
                name: 'us-west-verify',
                displayName: 'Verify Health',
                type: 'script',
                status: 'succeeded',
                startedAt: '2024-01-15T06:08:35Z',
                finishedAt: '2024-01-15T06:11:08Z',
                duration: '2m 33s',
                detail: {
                  outputs: {
                    success_rate: '99.6%',
                    avg_latency: '52ms',
                  },
                  exitCode: 0,
                },
              },
            ],
          },
          {
            id: 'deploy-1-4',
            name: 'deploy-eu-west',
            displayName: 'Deploy EU-West',
            type: 'steps',
            status: 'failed',
            startedAt: '2024-01-15T06:02:35Z',
            finishedAt: '2024-01-15T06:18:45Z',
            duration: '16m 10s',
            message: 'Health check failed after rollout',
            children: [
              {
                id: 'deploy-1-4-1',
                name: 'eu-west-rollout',
                displayName: 'Rollout',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T06:02:40Z',
                finishedAt: '2024-01-15T06:09:20Z',
                duration: '6m 40s',
                detail: {
                  image: 'bitnami/kubectl:1.29',
                  inputs: {
                    cluster: 'eu-west-1-prod',
                    replicas: '6',
                  },
                  outputs: {
                    pods_updated: '6/6',
                    rollout_status: 'complete',
                  },
                  exitCode: 0,
                },
              },
              {
                id: 'deploy-1-4-2',
                name: 'eu-west-verify',
                displayName: 'Verify Health',
                type: 'script',
                status: 'failed',
                startedAt: '2024-01-15T06:09:25Z',
                finishedAt: '2024-01-15T06:15:40Z',
                duration: '6m 15s',
                message: 'Success rate below threshold',
                detail: {
                  inputs: {
                    endpoint: 'https://eu-west.api.company.com/health',
                    success_threshold: '99%',
                    retry_count: '3',
                  },
                  outputs: {
                    success_rate: '87.2%',
                    avg_latency: '850ms',
                    error_rate: '12.8%',
                  },
                  logs: [
                    '[INFO] Checking health endpoint...',
                    '[WARN] Success rate: 89.1% (below 99%)',
                    '[INFO] Retry 1/3...',
                    '[WARN] Success rate: 87.5%',
                    '[INFO] Retry 2/3...',
                    '[ERROR] Success rate: 87.2% - threshold not met',
                    '[ERROR] Health check FAILED',
                  ],
                  exitCode: 1,
                },
              },
              {
                id: 'deploy-1-4-3',
                name: 'eu-west-rollback',
                displayName: 'Rollback',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T06:15:45Z',
                finishedAt: '2024-01-15T06:18:42Z',
                duration: '2m 57s',
                detail: {
                  image: 'bitnami/kubectl:1.29',
                  command: ['kubectl', 'rollout', 'undo'],
                  outputs: {
                    rollback_status: 'complete',
                    previous_version: 'v2.4.8',
                  },
                  logs: [
                    '[INFO] Initiating rollback...',
                    '[INFO] Rolling back to v2.4.8',
                    '[INFO] Rollback complete',
                    '[INFO] Health restored: 99.9%',
                  ],
                  exitCode: 0,
                },
              },
            ],
          },
          {
            id: 'deploy-1-5',
            name: 'deploy-ap-south',
            displayName: 'Deploy AP-South',
            type: 'steps',
            status: 'skipped',
            message: 'Skipped due to EU-West failure',
            children: [
              {
                id: 'deploy-1-5-1',
                name: 'ap-south-rollout',
                displayName: 'Rollout',
                type: 'container',
                status: 'skipped',
              },
              {
                id: 'deploy-1-5-2',
                name: 'ap-south-verify',
                displayName: 'Verify Health',
                type: 'script',
                status: 'skipped',
              },
            ],
          },
          {
            id: 'deploy-1-6',
            name: 'post-deploy',
            displayName: 'Post-Deployment',
            type: 'steps',
            status: 'succeeded',
            startedAt: '2024-01-15T06:18:50Z',
            finishedAt: '2024-01-15T06:25:28Z',
            duration: '6m 38s',
            children: [
              {
                id: 'deploy-1-6-1',
                name: 'update-status',
                displayName: 'Update Deployment Status',
                type: 'script',
                status: 'succeeded',
                startedAt: '2024-01-15T06:18:55Z',
                finishedAt: '2024-01-15T06:19:30Z',
                duration: '35s',
                detail: {
                  outputs: {
                    status: 'partial_failure',
                    regions_succeeded: 'us-east,us-west',
                    regions_failed: 'eu-west',
                    regions_skipped: 'ap-south',
                  },
                  exitCode: 0,
                },
              },
              {
                id: 'deploy-1-6-2',
                name: 'create-incident',
                displayName: 'Create Incident Ticket',
                type: 'script',
                status: 'succeeded',
                startedAt: '2024-01-15T06:19:35Z',
                finishedAt: '2024-01-15T06:20:10Z',
                duration: '35s',
                detail: {
                  outputs: {
                    incident_id: 'INC-2024-0892',
                    severity: 'P2',
                    assigned_team: 'platform-oncall',
                  },
                  exitCode: 0,
                },
              },
              {
                id: 'deploy-1-6-3',
                name: 'notify-failure',
                displayName: 'Send Failure Notification',
                type: 'script',
                status: 'succeeded',
                startedAt: '2024-01-15T06:20:15Z',
                finishedAt: '2024-01-15T06:25:25Z',
                duration: '5m 10s',
                detail: {
                  inputs: {
                    channels: '#incidents,#platform-team',
                    pagerduty: 'true',
                  },
                  outputs: {
                    slack_notified: 'true',
                    pagerduty_alerted: 'true',
                  },
                  logs: [
                    '[INFO] Sending failure notification',
                    '[INFO] Slack: #incidents notified',
                    '[INFO] Slack: #platform-team notified',
                    '[INFO] PagerDuty: Alert triggered',
                  ],
                  exitCode: 0,
                },
              },
            ],
          },
        ],
      },
    ],
  },

  // 5. MEDIUM-COMPLEX: Data Sync Pipeline (ETL with parallel streams)
  {
    id: 'wf-sync-005',
    name: 'data-warehouse-sync',
    type: 'workflow',
    status: 'succeeded',
    startedAt: '2024-01-15T03:00:00Z',
    finishedAt: '2024-01-15T04:35:20Z',
    duration: '1h 35m 20s',
    steps: [
      {
        id: 'sync-1',
        name: 'warehouse-sync',
        displayName: 'Data Warehouse Sync',
        type: 'dag',
        status: 'succeeded',
        startedAt: '2024-01-15T03:00:00Z',
        finishedAt: '2024-01-15T04:35:20Z',
        duration: '1h 35m 20s',
        children: [
          {
            id: 'sync-1-1',
            name: 'extract-sources',
            displayName: 'Extract from Sources',
            type: 'dag',
            status: 'succeeded',
            startedAt: '2024-01-15T03:00:05Z',
            finishedAt: '2024-01-15T03:45:30Z',
            duration: '45m 25s',
            children: [
              {
                id: 'sync-1-1-1',
                name: 'extract-postgres',
                displayName: 'Extract PostgreSQL',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T03:00:10Z',
                finishedAt: '2024-01-15T03:25:45Z',
                duration: '25m 35s',
                detail: {
                  image: 'airbyte/source-postgres:1.2.0',
                  inputs: {
                    host: 'prod-db.internal',
                    tables: 'users,orders,products,inventory',
                    incremental: 'true',
                    watermark: '2024-01-14T03:00:00Z',
                  },
                  outputs: {
                    rows_extracted: '2,847,392',
                    tables_synced: '4',
                    new_records: '156,432',
                  },
                  logs: [
                    '[INFO] Connecting to PostgreSQL...',
                    '[INFO] Extracting users: 45,231 new rows',
                    '[INFO] Extracting orders: 89,421 new rows',
                    '[INFO] Extracting products: 1,280 new rows',
                    '[INFO] Extracting inventory: 20,500 new rows',
                    '[INFO] Extraction complete',
                  ],
                  exitCode: 0,
                  resources: { cpu: '500m', memory: '1Gi' },
                },
              },
              {
                id: 'sync-1-1-2',
                name: 'extract-mongodb',
                displayName: 'Extract MongoDB',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T03:00:10Z',
                finishedAt: '2024-01-15T03:35:20Z',
                duration: '35m 10s',
                detail: {
                  image: 'airbyte/source-mongodb:1.3.0',
                  inputs: {
                    connection_string: 'mongodb://analytics-cluster',
                    collections: 'events,sessions,page_views',
                    batch_size: '10000',
                  },
                  outputs: {
                    documents_extracted: '18,492,103',
                    collections_synced: '3',
                  },
                  logs: [
                    '[INFO] Connecting to MongoDB cluster...',
                    '[INFO] Extracting events: 12.4M documents',
                    '[INFO] Extracting sessions: 4.2M documents',
                    '[INFO] Extracting page_views: 1.9M documents',
                  ],
                  exitCode: 0,
                  resources: { cpu: '1', memory: '2Gi' },
                },
              },
              {
                id: 'sync-1-1-3',
                name: 'extract-s3',
                displayName: 'Extract S3 Files',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T03:00:10Z',
                finishedAt: '2024-01-15T03:45:25Z',
                duration: '45m 15s',
                detail: {
                  image: 'airbyte/source-s3:1.0.0',
                  inputs: {
                    bucket: 's3://raw-data-lake',
                    prefix: 'clickstream/2024/01/14/',
                    format: 'parquet',
                  },
                  outputs: {
                    files_processed: '288',
                    total_size: '45.2 GB',
                    records: '89,234,102',
                  },
                  logs: [
                    '[INFO] Listing S3 objects...',
                    '[INFO] Found 288 parquet files',
                    '[INFO] Processing files in parallel (8 workers)',
                    '[INFO] Processed 89.2M records',
                  ],
                  exitCode: 0,
                  resources: { cpu: '2', memory: '4Gi' },
                },
              },
            ],
          },
          {
            id: 'sync-1-2',
            name: 'transform',
            displayName: 'Transform Data',
            type: 'dag',
            status: 'succeeded',
            startedAt: '2024-01-15T03:45:35Z',
            finishedAt: '2024-01-15T04:20:10Z',
            duration: '34m 35s',
            children: [
              {
                id: 'sync-1-2-1',
                name: 'dbt-staging',
                displayName: 'DBT Staging Models',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T03:45:40Z',
                finishedAt: '2024-01-15T03:58:15Z',
                duration: '12m 35s',
                detail: {
                  image: 'ghcr.io/dbt-labs/dbt-bigquery:1.7.0',
                  command: ['dbt', 'run', '--select', 'staging'],
                  outputs: {
                    models_run: '24',
                    models_success: '24',
                    rows_affected: '110,573,597',
                  },
                  logs: [
                    '[INFO] Running dbt staging models...',
                    '[INFO] 24 of 24 OK',
                    '[INFO] Finished in 12m 32s',
                  ],
                  exitCode: 0,
                  resources: { cpu: '2', memory: '4Gi' },
                },
              },
              {
                id: 'sync-1-2-2',
                name: 'dbt-intermediate',
                displayName: 'DBT Intermediate Models',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T03:58:20Z',
                finishedAt: '2024-01-15T04:10:45Z',
                duration: '12m 25s',
                detail: {
                  image: 'ghcr.io/dbt-labs/dbt-bigquery:1.7.0',
                  command: ['dbt', 'run', '--select', 'intermediate'],
                  outputs: {
                    models_run: '18',
                    models_success: '18',
                  },
                  exitCode: 0,
                  resources: { cpu: '2', memory: '4Gi' },
                },
              },
              {
                id: 'sync-1-2-3',
                name: 'dbt-marts',
                displayName: 'DBT Mart Models',
                type: 'container',
                status: 'succeeded',
                startedAt: '2024-01-15T04:10:50Z',
                finishedAt: '2024-01-15T04:20:05Z',
                duration: '9m 15s',
                detail: {
                  image: 'ghcr.io/dbt-labs/dbt-bigquery:1.7.0',
                  command: ['dbt', 'run', '--select', 'marts'],
                  outputs: {
                    models_run: '12',
                    models_success: '12',
                  },
                  exitCode: 0,
                  resources: { cpu: '4', memory: '8Gi' },
                },
              },
            ],
          },
          {
            id: 'sync-1-3',
            name: 'quality-tests',
            displayName: 'Data Quality Tests',
            type: 'container',
            status: 'succeeded',
            startedAt: '2024-01-15T04:20:15Z',
            finishedAt: '2024-01-15T04:28:40Z',
            duration: '8m 25s',
            detail: {
              image: 'ghcr.io/dbt-labs/dbt-bigquery:1.7.0',
              command: ['dbt', 'test'],
              outputs: {
                tests_run: '156',
                tests_passed: '156',
                tests_failed: '0',
              },
              logs: [
                '[INFO] Running data quality tests...',
                '[INFO] unique_users_id: PASS',
                '[INFO] not_null_orders_amount: PASS',
                '[INFO] relationships_orders_user: PASS',
                '[INFO] 156 of 156 PASS',
              ],
              exitCode: 0,
              resources: { cpu: '1', memory: '2Gi' },
            },
          },
          {
            id: 'sync-1-4',
            name: 'notify-completion',
            displayName: 'Send Completion Report',
            type: 'script',
            status: 'succeeded',
            startedAt: '2024-01-15T04:28:45Z',
            finishedAt: '2024-01-15T04:35:18Z',
            duration: '6m 33s',
            detail: {
              inputs: {
                recipients: 'data-team@company.com',
                include_metrics: 'true',
              },
              outputs: {
                email_sent: 'true',
                dashboard_updated: 'true',
              },
              logs: [
                '[INFO] Generating sync report...',
                '[INFO] Total records processed: 110.5M',
                '[INFO] Sending email to data-team',
                '[INFO] Updating Grafana dashboard',
              ],
              exitCode: 0,
            },
          },
        ],
      },
    ],
  },
];

const MOCK_TEAM_SESSIONS: TeamSession[] = [
  {
    id: 'team-xyz789',
    name: 'customer-support-team',
    type: 'team',
    status: 'succeeded',
    startedAt: '2024-01-15T09:15:00Z',
    finishedAt: '2024-01-15T09:18:30Z',
    duration: '3m 30s',
    steps: [
      {
        id: 'team-1',
        agentName: 'support-orchestrator',
        displayName: 'Support Orchestrator',
        type: 'orchestrator',
        status: 'succeeded',
        startedAt: '2024-01-15T09:15:00Z',
        finishedAt: '2024-01-15T09:18:30Z',
        duration: '3m 30s',
        message: 'Received customer inquiry about billing',
        detail: {
          model: 'claude-3-5-sonnet',
          tokensUsed: { input: 1250, output: 890 },
          input:
            'Customer inquiry: "I was charged twice for my subscription this month. Order ID: ORD-2024-78432. Please help resolve this issue."',
          thinking:
            'This is a billing-related inquiry about duplicate charges. I need to: 1) Classify the intent, 2) Look up the account and invoice details, 3) Investigate the duplicate charge, 4) Compose an appropriate response.',
        },
        children: [
          {
            id: 'team-1-1',
            agentName: 'triage-agent',
            displayName: 'Triage Agent',
            type: 'agent',
            status: 'succeeded',
            startedAt: '2024-01-15T09:15:05Z',
            finishedAt: '2024-01-15T09:15:25Z',
            duration: '20s',
            message: 'Classified as billing inquiry',
            detail: {
              model: 'claude-3-haiku',
              tokensUsed: { input: 320, output: 85 },
              input:
                'Classify the following customer message: "I was charged twice for my subscription this month. Order ID: ORD-2024-78432. Please help resolve this issue."',
              output:
                'Category: BILLING\nSubcategory: DUPLICATE_CHARGE\nPriority: HIGH\nSentiment: FRUSTRATED\nRequires escalation: NO',
            },
            children: [
              {
                id: 'team-1-1-1',
                agentName: 'classification-tool',
                displayName: 'Intent Classification',
                type: 'tool-call',
                status: 'succeeded',
                startedAt: '2024-01-15T09:15:10Z',
                finishedAt: '2024-01-15T09:15:15Z',
                duration: '5s',
                detail: {
                  toolInput: {
                    text: 'I was charged twice for my subscription this month',
                    categories: [
                      'billing',
                      'technical',
                      'account',
                      'shipping',
                      'general',
                    ],
                  },
                  toolOutput: {
                    category: 'billing',
                    confidence: 0.97,
                    subcategory: 'duplicate_charge',
                    keywords: ['charged', 'twice', 'subscription'],
                  },
                },
              },
            ],
          },
          {
            id: 'team-1-2',
            agentName: 'billing-specialist',
            displayName: 'Billing Specialist',
            type: 'delegation',
            status: 'succeeded',
            startedAt: '2024-01-15T09:15:30Z',
            finishedAt: '2024-01-15T09:17:00Z',
            duration: '1m 30s',
            message: 'Handling billing inquiry',
            detail: {
              model: 'claude-3-5-sonnet',
              tokensUsed: { input: 2100, output: 1450 },
              thinking:
                'I need to look up the customer account using the order ID, retrieve recent invoices, and identify if there was indeed a duplicate charge.',
            },
            children: [
              {
                id: 'team-1-2-1',
                agentName: 'account-lookup',
                displayName: 'Account Lookup',
                type: 'tool-call',
                status: 'succeeded',
                startedAt: '2024-01-15T09:15:35Z',
                finishedAt: '2024-01-15T09:15:45Z',
                duration: '10s',
                detail: {
                  toolInput: {
                    order_id: 'ORD-2024-78432',
                  },
                  toolOutput: {
                    customer_id: 'CUST-92847',
                    name: 'Jane Smith',
                    email: 'jane.smith@email.com',
                    plan: 'Professional',
                    monthly_rate: 49.99,
                    billing_cycle: 'monthly',
                    next_billing_date: '2024-02-15',
                  },
                },
              },
              {
                id: 'team-1-2-2',
                agentName: 'invoice-retrieval',
                displayName: 'Invoice Retrieval',
                type: 'tool-call',
                status: 'succeeded',
                startedAt: '2024-01-15T09:15:50Z',
                finishedAt: '2024-01-15T09:16:10Z',
                duration: '20s',
                detail: {
                  toolInput: {
                    customer_id: 'CUST-92847',
                    date_range: 'last_60_days',
                  },
                  toolOutput: {
                    invoices: [
                      {
                        id: 'INV-2024-1501',
                        date: '2024-01-15',
                        amount: 49.99,
                        status: 'paid',
                      },
                      {
                        id: 'INV-2024-1502',
                        date: '2024-01-15',
                        amount: 49.99,
                        status: 'paid',
                      },
                      {
                        id: 'INV-2023-1215',
                        date: '2023-12-15',
                        amount: 49.99,
                        status: 'paid',
                      },
                    ],
                  },
                },
              },
              {
                id: 'team-1-2-3',
                agentName: 'billing-analysis',
                displayName: 'Billing Analysis',
                type: 'agent',
                status: 'succeeded',
                startedAt: '2024-01-15T09:16:15Z',
                finishedAt: '2024-01-15T09:16:45Z',
                duration: '30s',
                message: 'Found discrepancy in charges',
                detail: {
                  model: 'claude-3-5-sonnet',
                  tokensUsed: { input: 890, output: 420 },
                  input:
                    'Analyze the following invoice data for customer CUST-92847 and determine if there is a duplicate charge issue.',
                  output:
                    'CONFIRMED DUPLICATE CHARGE DETECTED\n\nAnalysis:\n- Two invoices (INV-2024-1501 and INV-2024-1502) were generated on the same date (2024-01-15)\n- Both charges are for $49.99 (Professional plan monthly rate)\n- This appears to be a system error that caused double billing\n\nRecommendation:\n- Issue refund for INV-2024-1502 ($49.99)\n- Apply 10% courtesy credit for inconvenience ($5.00)\n- Total refund: $54.99',
                },
              },
            ],
          },
          {
            id: 'team-1-3',
            agentName: 'response-composer',
            displayName: 'Response Composer',
            type: 'agent',
            status: 'succeeded',
            startedAt: '2024-01-15T09:17:05Z',
            finishedAt: '2024-01-15T09:18:00Z',
            duration: '55s',
            message: 'Drafting customer response',
            detail: {
              model: 'claude-3-5-sonnet',
              tokensUsed: { input: 1580, output: 620 },
              thinking:
                'I need to compose a professional, empathetic response that acknowledges the error, confirms the refund, and apologizes for the inconvenience.',
            },
            children: [
              {
                id: 'team-1-3-1',
                agentName: 'template-lookup',
                displayName: 'Template Lookup',
                type: 'tool-call',
                status: 'succeeded',
                startedAt: '2024-01-15T09:17:10Z',
                finishedAt: '2024-01-15T09:17:15Z',
                duration: '5s',
                detail: {
                  toolInput: {
                    category: 'billing',
                    subcategory: 'refund_confirmation',
                    tone: 'apologetic',
                  },
                  toolOutput: {
                    template_id: 'TMPL-BILL-007',
                    template_name: 'Duplicate Charge Refund',
                    placeholders: [
                      'customer_name',
                      'refund_amount',
                      'invoice_id',
                      'processing_time',
                    ],
                  },
                },
              },
              {
                id: 'team-1-3-2',
                agentName: 'tone-check',
                displayName: 'Tone Verification',
                type: 'tool-call',
                status: 'succeeded',
                startedAt: '2024-01-15T09:17:40Z',
                finishedAt: '2024-01-15T09:17:50Z',
                duration: '10s',
                detail: {
                  toolInput: {
                    text: 'Dear Jane, We sincerely apologize for the billing error...',
                    expected_tone: ['professional', 'empathetic', 'apologetic'],
                  },
                  toolOutput: {
                    tone_scores: {
                      professional: 0.92,
                      empathetic: 0.88,
                      apologetic: 0.95,
                    },
                    suggestions: [],
                    approved: true,
                  },
                },
              },
            ],
          },
          {
            id: 'team-1-4',
            agentName: 'final-response',
            displayName: 'Final Response',
            type: 'response',
            status: 'succeeded',
            startedAt: '2024-01-15T09:18:05Z',
            finishedAt: '2024-01-15T09:18:25Z',
            duration: '20s',
            message: 'Response sent to customer',
            detail: {
              output:
                "Dear Jane,\n\nThank you for bringing this to our attention, and we sincerely apologize for the billing error.\n\nWe have confirmed that you were incorrectly charged twice for your Professional subscription on January 15, 2024. We have initiated a refund of $49.99 for the duplicate charge (Invoice INV-2024-1502), plus a $5.00 courtesy credit for the inconvenience.\n\nTotal refund: $54.99\n\nYou should see this reflected in your account within 3-5 business days.\n\nIf you have any further questions, please don't hesitate to reach out.\n\nBest regards,\nCustomer Support Team",
            },
          },
        ],
      },
    ],
  },
  {
    id: 'team-failed-001',
    name: 'research-team',
    type: 'team',
    status: 'failed',
    startedAt: '2024-01-15T08:00:00Z',
    finishedAt: '2024-01-15T08:05:45Z',
    duration: '5m 45s',
    steps: [
      {
        id: 'research-1',
        agentName: 'research-coordinator',
        displayName: 'Research Coordinator',
        type: 'orchestrator',
        status: 'failed',
        startedAt: '2024-01-15T08:00:00Z',
        finishedAt: '2024-01-15T08:05:45Z',
        duration: '5m 45s',
        message: 'Research task failed',
        detail: {
          model: 'claude-3-5-sonnet',
          tokensUsed: { input: 3200, output: 1100 },
          input:
            'Research the latest developments in quantum computing for enterprise applications, focusing on practical use cases and timeline for commercial viability.',
        },
        children: [
          {
            id: 'research-1-1',
            agentName: 'web-researcher',
            displayName: 'Web Researcher',
            type: 'agent',
            status: 'succeeded',
            startedAt: '2024-01-15T08:00:05Z',
            finishedAt: '2024-01-15T08:02:30Z',
            duration: '2m 25s',
            detail: {
              model: 'claude-3-5-sonnet',
              tokensUsed: { input: 1850, output: 2100 },
              output:
                'Found 47 relevant sources on quantum computing developments:\n\n1. IBM Quantum Roadmap 2024 - 1000+ qubit systems expected by 2025\n2. Google Quantum AI - Error correction breakthrough announced\n3. Enterprise applications in cryptography, optimization, ML\n4. Current limitations: decoherence, error rates, cooling requirements\n5. Timeline: 3-5 years for practical enterprise applications',
            },
            children: [
              {
                id: 'research-1-1-1',
                agentName: 'search-api',
                displayName: 'Search API',
                type: 'tool-call',
                status: 'succeeded',
                startedAt: '2024-01-15T08:00:10Z',
                finishedAt: '2024-01-15T08:00:45Z',
                duration: '35s',
                detail: {
                  toolInput: {
                    query: 'quantum computing enterprise applications 2024',
                    max_results: 50,
                    sources: ['arxiv', 'techcrunch', 'ieee', 'company_blogs'],
                  },
                  toolOutput: {
                    total_results: 47,
                    top_sources: [
                      'IBM Research Blog',
                      'Google AI Blog',
                      'Nature Quantum',
                    ],
                    relevance_score: 0.89,
                  },
                },
              },
            ],
          },
          {
            id: 'research-1-2',
            agentName: 'data-analyst',
            displayName: 'Data Analyst',
            type: 'delegation',
            status: 'failed',
            startedAt: '2024-01-15T08:02:35Z',
            finishedAt: '2024-01-15T08:05:40Z',
            duration: '3m 5s',
            message: 'Failed to process data: Rate limit exceeded',
            detail: {
              model: 'claude-3-5-sonnet',
              tokensUsed: { input: 4200, output: 0 },
              thinking:
                'I need to analyze the research data and extract key insights, but the analysis engine is not responding...',
            },
            children: [
              {
                id: 'research-1-2-1',
                agentName: 'data-fetch',
                displayName: 'Data Fetch',
                type: 'tool-call',
                status: 'succeeded',
                startedAt: '2024-01-15T08:02:40Z',
                finishedAt: '2024-01-15T08:03:10Z',
                duration: '30s',
                detail: {
                  toolInput: {
                    source_ids: ['src-001', 'src-002', 'src-003', 'src-047'],
                    fetch_full_content: true,
                  },
                  toolOutput: {
                    documents_fetched: 47,
                    total_tokens: 125000,
                    status: 'complete',
                  },
                },
              },
              {
                id: 'research-1-2-2',
                agentName: 'analysis-engine',
                displayName: 'Analysis Engine',
                type: 'tool-call',
                status: 'failed',
                startedAt: '2024-01-15T08:03:15Z',
                finishedAt: '2024-01-15T08:05:35Z',
                duration: '2m 20s',
                message: 'Rate limit exceeded after 3 retries',
                detail: {
                  toolInput: {
                    documents: '<47 documents>',
                    analysis_type: 'comprehensive',
                    extract: [
                      'key_findings',
                      'timeline',
                      'challenges',
                      'opportunities',
                    ],
                  },
                  toolOutput: {
                    error: 'RATE_LIMIT_EXCEEDED',
                    error_message:
                      'API rate limit exceeded. Maximum 100 requests per minute. Current: 127 requests.',
                    retry_after: 60,
                    retries_attempted: 3,
                  },
                },
              },
            ],
          },
          {
            id: 'research-1-3',
            agentName: 'report-generator',
            displayName: 'Report Generator',
            type: 'agent',
            status: 'skipped',
            message: 'Skipped due to upstream failure',
            detail: {
              input:
                'Generate comprehensive research report on quantum computing',
              output:
                'SKIPPED: Cannot generate report - analysis phase failed due to rate limiting.',
            },
          },
        ],
      },
    ],
  },
];


function getStatusIcon(status: StepStatus) {
  switch (status) {
    case 'succeeded':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'pending':
      return <Circle className="text-muted-foreground h-4 w-4" />;
    case 'skipped':
      return <Circle className="h-4 w-4 text-yellow-500" />;
  }
}

function getWorkflowTypeIcon(type: WorkflowStepType) {
  switch (type) {
    case 'dag':
      return <GitBranch className="h-4 w-4" />;
    case 'steps':
      return <Play className="h-4 w-4" />;
    case 'container':
      return <Container className="h-4 w-4" />;
    case 'script':
      return <FileCode className="h-4 w-4" />;
    case 'suspend':
      return <Clock className="h-4 w-4" />;
  }
}

function getTeamTypeIcon(type: TeamStepType) {
  switch (type) {
    case 'orchestrator':
      return <Users className="h-4 w-4" />;
    case 'agent':
      return <Bot className="h-4 w-4" />;
    case 'delegation':
      return <GitBranch className="h-4 w-4" />;
    case 'tool-call':
      return <Workflow className="h-4 w-4" />;
    case 'response':
      return <MessageSquare className="h-4 w-4" />;
  }
}

function getSessionTypeIcon(type: SessionType) {
  switch (type) {
    case 'workflow':
      return <Workflow className="h-4 w-4" />;
    case 'team':
      return <Users className="h-4 w-4" />;
    case 'agent':
      return <Bot className="h-4 w-4" />;
  }
}

function getStatusBadgeVariant(
  status: StepStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'succeeded':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'running':
      return 'secondary';
    default:
      return 'outline';
  }
}

function WorkflowStepDetail({ detail, message }: { detail: WorkflowStepDetail; message?: string }) {
  const [logs, setLogs] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  
  const shouldFetchLogs = detail.workflowName && detail.nodeId && detail.namespace;

  useEffect(() => {
    if (shouldFetchLogs) {
      const fetchLogs = async () => {
        setLoadingLogs(true);
        setLogsError(null);
        try {
          const { workflowsService } = await import('@/lib/services/workflows');
          const logData = await workflowsService.getWorkflowLogs(
            detail.workflowName!,
            detail.nodeId!,
            detail.namespace!,
          );
          setLogs(logData);
        } catch (error) {
          console.error('Failed to fetch logs:', error);
          setLogsError('Failed to load logs');
        } finally {
          setLoadingLogs(false);
        }
      };
      void fetchLogs();
    }
  }, [detail.workflowName, detail.nodeId, detail.namespace, shouldFetchLogs]);
  return (
    <div className="bg-muted/30 mt-2 space-y-3 rounded-md border p-3 text-sm">
      {detail.image && (
        <div className="flex items-start gap-2">
          <Container className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div>
            <span className="text-muted-foreground text-xs">Image</span>
            <p className="font-mono text-xs">{detail.image}</p>
          </div>
        </div>
      )}

      {detail.command && (
        <div className="flex items-start gap-2">
          <Terminal className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div>
            <span className="text-muted-foreground text-xs">Command</span>
            <p className="font-mono text-xs">
              {detail.command.join(' ')} {detail.args?.join(' ')}
            </p>
          </div>
        </div>
      )}

      {detail.inputs && Object.keys(detail.inputs).length > 0 && (
        <div className="flex items-start gap-2">
          <FileText className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Inputs</span>
            <div className="bg-background mt-1 rounded border p-2">
              {Object.entries(detail.inputs).map(([key, value]) => (
                <div key={key} className="flex gap-2 font-mono text-xs">
                  <span className="text-muted-foreground">{key}:</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {detail.outputs && Object.keys(detail.outputs).length > 0 && (
        <div className="flex items-start gap-2">
          <Zap className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Outputs</span>
            <div className="bg-background mt-1 rounded border p-2">
              {Object.entries(detail.outputs).map(([key, value]) => (
                <div key={key} className="flex gap-2 font-mono text-xs">
                  <span className="text-muted-foreground">{key}:</span>
                  <span>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {message && (
        <div className="flex items-start gap-2">
          <AlertCircle className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Message</span>
            <div className="bg-background mt-1 rounded border p-2">
              <div className="flex gap-2 font-mono text-xs">
                <span>{message}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {shouldFetchLogs && (
        <div className="flex items-start gap-2">
          <Terminal className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Logs</span>
            <div className="bg-black mt-1 max-h-64 overflow-auto rounded border p-3">
              {loadingLogs && (
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span className="font-mono text-xs">Loading logs...</span>
                </div>
              )}
              {logsError && (
                <div className="font-mono text-xs text-red-400">{logsError}</div>
              )}
              {logs && !loadingLogs && (
                <pre className="font-mono text-xs whitespace-pre-wrap">
                  {logs}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {detail.resources && (
        <div className="flex items-center gap-4">
          {detail.resources.cpu && (
            <div className="flex items-center gap-1">
              <Cpu className="text-muted-foreground h-3 w-3" />
              <span className="text-muted-foreground text-xs">CPU:</span>
              <span className="text-xs">{detail.resources.cpu}</span>
            </div>
          )}
          {detail.resources.memory && (
            <div className="flex items-center gap-1">
              <HardDrive className="text-muted-foreground h-3 w-3" />
              <span className="text-muted-foreground text-xs">Memory:</span>
              <span className="text-xs">{detail.resources.memory}</span>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function TeamStepDetail({ detail }: { detail: TeamStepDetail }) {
  return (
    <div className="bg-muted/30 mt-2 space-y-3 rounded-md border p-3 text-sm">
      {detail.model && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Bot className="text-muted-foreground h-3 w-3" />
            <span className="text-muted-foreground text-xs">Model:</span>
            <span className="text-xs font-medium">{detail.model}</span>
          </div>
          {detail.tokensUsed && (
            <div className="flex items-center gap-1">
              <Zap className="text-muted-foreground h-3 w-3" />
              <span className="text-muted-foreground text-xs">Tokens:</span>
              <span className="text-xs">
                {detail.tokensUsed.input.toLocaleString()} in /{' '}
                {detail.tokensUsed.output.toLocaleString()} out
              </span>
            </div>
          )}
        </div>
      )}

      {detail.input && (
        <div className="flex items-start gap-2">
          <MessageSquare className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Input</span>
            <div className="bg-background mt-1 rounded border p-2">
              <p className="text-xs whitespace-pre-wrap">{detail.input}</p>
            </div>
          </div>
        </div>
      )}

      {detail.thinking && (
        <div className="flex items-start gap-2">
          <Bot className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Thinking</span>
            <div className="bg-background mt-1 rounded border border-blue-200 p-2 dark:border-blue-800">
              <p className="text-xs text-blue-600 italic dark:text-blue-400">
                {detail.thinking}
              </p>
            </div>
          </div>
        </div>
      )}

      {detail.toolInput && (
        <div className="flex items-start gap-2">
          <Workflow className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Tool Input</span>
            <div className="bg-background mt-1 rounded border p-2">
              <pre className="overflow-auto text-xs">
                {JSON.stringify(detail.toolInput, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {detail.toolOutput !== undefined && (
        <div className="flex items-start gap-2">
          <Zap className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Tool Output</span>
            <div className="bg-background mt-1 rounded border p-2">
              <pre className="overflow-auto text-xs">
                {JSON.stringify(detail.toolOutput, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {detail.output && (
        <div className="flex items-start gap-2">
          <MessageSquare className="text-muted-foreground mt-0.5 h-4 w-4" />
          <div className="flex-1">
            <span className="text-muted-foreground text-xs">Output</span>
            <div className="bg-background mt-1 rounded border border-green-200 p-2 dark:border-green-800">
              <p className="text-xs whitespace-pre-wrap">{detail.output}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowStepNode({
  step,
  depth = 0,
  isLast = false,
}: {
  step: WorkflowStep;
  depth?: number;
  isLast?: boolean;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const hasChildren = step.children && step.children.length > 0;
  const hasDetail = step.detail && Object.keys(step.detail).length > 0;

  const getBorderColor = () => {
    if (step.status === 'running') return 'border-l-blue-500';
    if (step.status === 'succeeded') return 'border-l-green-500';
    if (step.status === 'failed') return 'border-l-red-500';
    return 'border-l-gray-300 dark:border-l-gray-700';
  };

  return (
    <div className={cn('relative flex gap-2', depth > 0 && 'ml-4')}>
      {depth > 0 && (
        <>
          <div className="absolute -left-4 top-0 flex h-full w-4 flex-col items-center">
            <div className="bg-border mt-5 w-px flex-1" style={{ display: isLast ? 'none' : 'block' }} />
          </div>
          <div className="bg-border absolute -left-4 top-5 h-px w-4" />
        </>
      )}

      <div className="flex-1">
        <div
          className={cn(
            'hover:bg-muted/50 group relative flex items-center gap-2 rounded-lg border border-l-2 bg-card p-2.5 shadow-sm transition-all',
            getBorderColor(),
            step.status === 'running' && 'bg-blue-50/50 dark:bg-blue-950/20',
            step.status === 'failed' && 'bg-red-50/50 dark:bg-red-950/20',
          )}>
          {hasDetail ? (
            <button
              onClick={() => setShowDetail(!showDetail)}
              className="hover:bg-muted -m-1 rounded p-1 transition-colors"
              aria-label={showDetail ? 'Hide details' : 'Show details'}>
              {showDetail ? (
                <ChevronDown className="text-muted-foreground h-4 w-4" />
              ) : (
                <ChevronRight className="text-muted-foreground h-4 w-4" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}

          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            {getStatusIcon(step.status)}
            <div className="text-muted-foreground shrink-0">
              {getWorkflowTypeIcon(step.type)}
            </div>
            <span className="truncate font-medium">{step.displayName}</span>
            {step.name !== step.displayName && (
              <span className="text-muted-foreground truncate text-xs">
                ({step.name})
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {step.duration && (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {step.duration}
              </span>
            )}

            <Badge
              variant={getStatusBadgeVariant(step.status)}
              className="text-xs">
              {step.status}
            </Badge>
          </div>
        </div>

        {hasDetail && showDetail && (
          <div className="ml-6 mt-2">
            <WorkflowStepDetail detail={step.detail!} message={step.message} />
          </div>
        )}

        {hasChildren && (
          <div className="mt-2 space-y-2">
            {step.children!.map((child, index) => (
              <WorkflowStepNode
                key={child.id}
                step={child}
                depth={depth + 1}
                isLast={index === step.children!.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamStepNode({
  step,
  depth = 0,
  isLast = false,
}: {
  step: TeamStep;
  depth?: number;
  isLast?: boolean;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const hasChildren = step.children && step.children.length > 0;
  const hasDetail = step.detail && Object.keys(step.detail).length > 0;

  const getBorderColor = () => {
    if (step.status === 'running') return 'border-l-blue-500';
    if (step.status === 'succeeded') return 'border-l-green-500';
    if (step.status === 'failed') return 'border-l-red-500';
    return 'border-l-gray-300 dark:border-l-gray-700';
  };

  return (
    <div className={cn('relative flex gap-2', depth > 0 && 'ml-4')}>
      {depth > 0 && (
        <>
          <div className="absolute -left-4 top-0 flex h-full w-4 flex-col items-center">
            <div className="bg-border mt-5 w-px flex-1" style={{ display: isLast ? 'none' : 'block' }} />
          </div>
          <div className="bg-border absolute -left-4 top-5 h-px w-4" />
        </>
      )}

      <div className="flex-1">
        <div
          className={cn(
            'hover:bg-muted/50 group relative flex items-center gap-2 rounded-lg border border-l-2 bg-card p-2.5 shadow-sm transition-all',
            getBorderColor(),
            step.status === 'running' && 'bg-blue-50/50 dark:bg-blue-950/20',
            step.status === 'failed' && 'bg-red-50/50 dark:bg-red-950/20',
          )}>
          {hasDetail ? (
            <button
              onClick={() => setShowDetail(!showDetail)}
              className="hover:bg-muted -m-1 rounded p-1 transition-colors"
              aria-label={showDetail ? 'Hide details' : 'Show details'}>
              {showDetail ? (
                <ChevronDown className="text-muted-foreground h-4 w-4" />
              ) : (
                <ChevronRight className="text-muted-foreground h-4 w-4" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}

          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            {getStatusIcon(step.status)}
            <div className="text-muted-foreground shrink-0">
              {getTeamTypeIcon(step.type)}
            </div>
            <span className="truncate font-medium">{step.displayName}</span>
            <span className="text-muted-foreground truncate text-xs">
              ({step.agentName})
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {step.message && (
              <span className="text-muted-foreground max-w-[200px] truncate text-xs">
                {step.message}
              </span>
            )}

            {step.duration && (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {step.duration}
              </span>
            )}

            <Badge
              variant={getStatusBadgeVariant(step.status)}
              className="text-xs">
              {step.status}
            </Badge>
          </div>
        </div>

        {hasDetail && showDetail && (
          <div className="ml-6 mt-2">
            <TeamStepDetail detail={step.detail!} />
          </div>
        )}

        {hasChildren && (
          <div className="mt-2 space-y-2">
            {step.children!.map((child, index) => (
              <TeamStepNode
                key={child.id}
                step={child}
                depth={depth + 1}
                isLast={index === step.children!.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionDetailView({
  session,
  isLoading = false
}: {
  session: Session;
  isLoading?: boolean;
}) {
  return (
    <Card className="min-h-0 flex-1 overflow-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-muted-foreground">
              {getSessionTypeIcon(session.type)}
            </div>
            <CardTitle>{session.name}</CardTitle>
            <Badge variant={getStatusBadgeVariant(session.status)}>
              {session.status}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {session.type}
            </Badge>
            {isLoading && (
              <span className="text-muted-foreground flex items-center gap-2 text-xs">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Updating...
              </span>
            )}
          </div>
          <div className="text-muted-foreground flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {session.duration}
            </span>
            <span>Started: {new Date(session.startedAt).toLocaleString()}</span>
            {session.type === 'workflow' && session.namespace && session.uid && (
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="h-8 w-8"
              >
                <a
                  href={`http://argo.127.0.0.1.nip.io:8080/workflows/${session.namespace}/${session.name}?uid=${session.uid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View in Argo Workflows"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {session.type === 'workflow'
            ? session.steps.map(step => (
              <WorkflowStepNode key={step.id} step={step} />
            ))
            : session.steps.map(step => (
              <TeamStepNode key={step.id} step={step} />
            ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SessionListItem({
  session,
  isSelected,
  onClick,
}: {
  session: Session;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'hover:bg-muted/50 flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors',
        isSelected && 'bg-muted border-primary',
      )}>
      <div className="text-muted-foreground">
        {getSessionTypeIcon(session.type)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{session.name}</span>
          <Badge
            variant={getStatusBadgeVariant(session.status)}
            className="text-xs">
            {session.status}
          </Badge>
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span>{session.type}</span>
          <span>·</span>
          <span>{session.duration}</span>
          <span>·</span>
          <span>{new Date(session.startedAt).toLocaleTimeString()}</span>
        </div>
      </div>
      {getStatusIcon(session.status)}
    </button>
  );
}

export function SessionsSection() {
  const [sourceFilter, setSourceFilter] = useState<SessionSourceFilter>('all');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [useRealData, setUseRealData] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const { workflows, loading, error, refetch: refetchWorkflows } = useWorkflows('default');

  const allSessions = mapArgoWorkflowsToSessions(workflows);

  const filteredAndSortedSessions = allSessions
    .filter(session => {
      if (sourceFilter === 'all') return true;
      if (sourceFilter === 'workflows') return session.type === 'workflow';
      return true;
    })
    .filter(session => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        session.name.toLowerCase().includes(query) ||
        session.status.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      const timeA = new Date(a.startedAt).getTime();
      const timeB = new Date(b.startedAt).getTime();
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

  useEffect(() => {
    if (
      filteredAndSortedSessions.length > 0 &&
      !filteredAndSortedSessions.find(s => s.id === selectedSessionId)
    ) {
      setSelectedSessionId(filteredAndSortedSessions[0].id);
    }
  }, [filteredAndSortedSessions, selectedSessionId]);

  const selectedSessionFromList = filteredAndSortedSessions.find(s => s.id === selectedSessionId);

  const { workflow: selectedWorkflowDetail, loading: loadingDetail } = useWorkflow(
    useRealData && selectedSessionFromList?.type === 'workflow' ? selectedSessionId || '' : '',
    'default',
  );

  const selectedSession =
    useRealData && selectedWorkflowDetail
      ? mapArgoWorkflowToSession(selectedWorkflowDetail)
      : selectedSessionFromList;

  const previousStatusRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (selectedWorkflowDetail && useRealData) {
      const currentStatus = selectedWorkflowDetail.status.phase;
      const previousStatus = previousStatusRef.current;

      const isTerminalState =
        currentStatus === 'Succeeded' ||
        currentStatus === 'Failed' ||
        currentStatus === 'Error';

      const wasRunning = previousStatus === 'Running' || previousStatus === 'Pending';

      if (isTerminalState && wasRunning) {
        void refetchWorkflows();
      }

      previousStatusRef.current = currentStatus;
    }
  }, [selectedWorkflowDetail, useRealData, refetchWorkflows]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sortOrder} onValueChange={value => setSortOrder(value as SortOrder)}>
          <SelectTrigger className="w-40">
            <ArrowUpDown className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
          </SelectContent>
        </Select>
        {loading && (
          <span className="text-muted-foreground text-sm">Loading...</span>
        )}
        {error && (
          <span className="text-sm text-red-500">
            Error: {error.message}
          </span>
        )}
        <span className="text-muted-foreground text-sm">
          {filteredAndSortedSessions.length} session
          {filteredAndSortedSessions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin" />
          <span>Loading sessions...</span>
        </div>
      ) : filteredAndSortedSessions.length > 0 ? (
        <div className="flex flex-1 gap-4 overflow-hidden">
          <div className="flex w-80 flex-col gap-2 overflow-auto">
            {filteredAndSortedSessions.map(session => (
              <SessionListItem
                key={session.id}
                session={session}
                isSelected={session.id === selectedSessionId}
                onClick={() => setSelectedSessionId(session.id)}
              />
            ))}
          </div>
          <div className="flex flex-1 overflow-hidden">
            {selectedSession ? (
              <SessionDetailView
                session={selectedSession}
                isLoading={loadingDetail && useRealData}
              />
            ) : (
              <div className="text-muted-foreground flex flex-1 items-center justify-center">
                Select a session to view details
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2">
          {searchQuery ? (
            <>
              <Search className="h-12 w-12 opacity-20" />
              <span>No sessions found matching "{searchQuery}"</span>
            </>
          ) : (
            <span>No {sourceFilter === 'all' ? '' : sourceFilter} sessions to display</span>
          )}
        </div>
      )}
    </div>
  );
}
