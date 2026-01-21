import { describe, expect, it } from 'vitest';

import {
  CONFIGURATION_SECTIONS,
  DASHBOARD_SECTIONS,
  OPERATION_SECTIONS,
  RUNTIME_SECTIONS,
  SERVICE_SECTIONS,
  getDashboardIcon,
} from '@/lib/constants/dashboard-icons';

describe('dashboard-icons', () => {
  describe('DASHBOARD_SECTIONS', () => {
    it('should have all section definitions', () => {
      expect(DASHBOARD_SECTIONS.agents).toBeDefined();
      expect(DASHBOARD_SECTIONS.teams).toBeDefined();
      expect(DASHBOARD_SECTIONS.models).toBeDefined();
      expect(DASHBOARD_SECTIONS.secrets).toBeDefined();
      expect(DASHBOARD_SECTIONS.evaluators).toBeDefined();
      expect(DASHBOARD_SECTIONS['workflow-templates']).toBeDefined();
      expect(DASHBOARD_SECTIONS.queries).toBeDefined();
      expect(DASHBOARD_SECTIONS.evaluations).toBeDefined();
      expect(DASHBOARD_SECTIONS.events).toBeDefined();
      expect(DASHBOARD_SECTIONS.memory).toBeDefined();
      expect(DASHBOARD_SECTIONS.files).toBeDefined();
      expect(DASHBOARD_SECTIONS.tasks).toBeDefined();
      expect(DASHBOARD_SECTIONS.broker).toBeDefined();
      expect(DASHBOARD_SECTIONS.tools).toBeDefined();
      expect(DASHBOARD_SECTIONS.mcp).toBeDefined();
      expect(DASHBOARD_SECTIONS.a2a).toBeDefined();
      expect(DASHBOARD_SECTIONS.services).toBeDefined();
      expect(DASHBOARD_SECTIONS['api-keys']).toBeDefined();
    });

    it('should have correct structure for each section', () => {
      expect(DASHBOARD_SECTIONS['workflow-templates']).toEqual({
        key: 'workflow-templates',
        title: 'Workflow Templates',
        icon: expect.any(Object),
        group: 'configurations',
      });
    });
  });

  describe('getDashboardIcon', () => {
    it('should return icon for valid section key', () => {
      const icon = getDashboardIcon('agents');
      expect(icon).toBeDefined();
    });

    it('should return icon for workflow-templates', () => {
      const icon = getDashboardIcon('workflow-templates');
      expect(icon).toBeDefined();
    });

    it('should return icon for all section keys', () => {
      Object.keys(DASHBOARD_SECTIONS).forEach(key => {
        const icon = getDashboardIcon(key as keyof typeof DASHBOARD_SECTIONS);
        expect(icon).toBeDefined();
      });
    });
  });

  describe('Section groups', () => {
    it('should filter configuration sections correctly', () => {
      expect(CONFIGURATION_SECTIONS).toBeDefined();
      expect(CONFIGURATION_SECTIONS.length).toBeGreaterThan(0);
      expect(
        CONFIGURATION_SECTIONS.every(s => s.group === 'configurations'),
      ).toBe(true);
      expect(
        CONFIGURATION_SECTIONS.find(s => s.key === 'agents'),
      ).toBeDefined();
      expect(
        CONFIGURATION_SECTIONS.find(s => s.key === 'workflow-templates'),
      ).toBeDefined();
    });

    it('should filter operation sections correctly', () => {
      expect(OPERATION_SECTIONS).toBeDefined();
      expect(OPERATION_SECTIONS.length).toBeGreaterThan(0);
      expect(OPERATION_SECTIONS.every(s => s.group === 'operations')).toBe(
        true,
      );
      expect(OPERATION_SECTIONS.find(s => s.key === 'queries')).toBeDefined();
    });

    it('should filter runtime sections correctly', () => {
      expect(RUNTIME_SECTIONS).toBeDefined();
      expect(RUNTIME_SECTIONS.length).toBeGreaterThan(0);
      expect(RUNTIME_SECTIONS.every(s => s.group === 'runtime')).toBe(true);
      expect(RUNTIME_SECTIONS.find(s => s.key === 'tools')).toBeDefined();
    });

    it('should filter service sections correctly', () => {
      expect(SERVICE_SECTIONS).toBeDefined();
      expect(SERVICE_SECTIONS.length).toBeGreaterThan(0);
      expect(SERVICE_SECTIONS.every(s => s.group === 'service')).toBe(true);
      expect(SERVICE_SECTIONS.find(s => s.key === 'api-keys')).toBeDefined();
    });
  });

  describe('enablerFeature', () => {
    it('should have enabler feature for files section', () => {
      expect(DASHBOARD_SECTIONS.files.enablerFeature).toBeDefined();
    });

    it('should have enabler feature for broker section', () => {
      expect(DASHBOARD_SECTIONS.broker.enablerFeature).toBeDefined();
    });
  });
});
