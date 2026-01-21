import { describe, expect, it } from 'vitest';

import {
  CONFIGURATION_SECTIONS,
  DASHBOARD_SECTIONS,
  OPERATION_SECTIONS,
  RUNTIME_SECTIONS,
  SERVICE_SECTIONS,
} from '@/lib/constants/dashboard-icons';

describe('Dashboard Sections - enabledWhen', () => {
  describe('DASHBOARD_SECTIONS filtering', () => {
    it('should return the expected total number of sections', () => {
      const allSections = Object.values(DASHBOARD_SECTIONS);
      // 6 configurations + 7 operations + 4 runtime + 1 service = 18 total
      expect(allSections).toHaveLength(18);
    });
  });

  describe('CONFIGURATION_SECTIONS', () => {
    it('should have the expected number of configuration sections', () => {
      expect(CONFIGURATION_SECTIONS).toHaveLength(6);

      // Verify it matches the count from DASHBOARD_SECTIONS
      const configFromDashboard = Object.values(DASHBOARD_SECTIONS).filter(
        s => s.group === 'configurations',
      );
      expect(CONFIGURATION_SECTIONS).toHaveLength(configFromDashboard.length);
    });

    it('should have all expected configuration sections', () => {
      const configKeys = CONFIGURATION_SECTIONS.map(s => s.key);
      expect(configKeys).toContain('agents');
      expect(configKeys).toContain('teams');
      expect(configKeys).toContain('models');
      expect(configKeys).toContain('secrets');
      expect(configKeys).toContain('evaluators');
      expect(configKeys).toContain('workflow-templates');
    });

    it('should only contain sections with group "configurations"', () => {
      expect(
        CONFIGURATION_SECTIONS.every(s => s.group === 'configurations'),
      ).toBe(true);
    });
  });

  describe('OPERATION_SECTIONS', () => {
    it('should have the expected sections', () => {
      expect(OPERATION_SECTIONS).toHaveLength(7);

      // Verify it matches the count from DASHBOARD_SECTIONS
      const opsFromDashboard = Object.values(DASHBOARD_SECTIONS).filter(
        s => s.group === 'operations',
      );
      expect(OPERATION_SECTIONS).toHaveLength(opsFromDashboard.length);

      const opKeys = OPERATION_SECTIONS.map(s => s.key);
      expect(opKeys).toContain('queries');
      expect(opKeys).toContain('evaluations');
      expect(opKeys).toContain('events');
      expect(opKeys).toContain('memory');
      expect(opKeys).toContain('files');
      expect(opKeys).toContain('tasks');
      expect(opKeys).toContain('broker');
    });

    it('should only contain sections with group "operations"', () => {
      expect(OPERATION_SECTIONS.every(s => s.group === 'operations')).toBe(
        true,
      );
    });
  });

  describe('RUNTIME_SECTIONS', () => {
    it('should have the expected number of runtime sections', () => {
      expect(RUNTIME_SECTIONS).toHaveLength(4);

      // Verify it matches the count from DASHBOARD_SECTIONS
      const runtimeFromDashboard = Object.values(DASHBOARD_SECTIONS).filter(
        s => s.group === 'runtime',
      );
      expect(RUNTIME_SECTIONS).toHaveLength(runtimeFromDashboard.length);
    });

    it('should have all expected runtime sections', () => {
      const runtimeKeys = RUNTIME_SECTIONS.map(s => s.key);
      expect(runtimeKeys).toContain('tools');
      expect(runtimeKeys).toContain('mcp');
      expect(runtimeKeys).toContain('a2a');
      expect(runtimeKeys).toContain('services');
    });

    it('should only contain sections with group "runtime"', () => {
      expect(RUNTIME_SECTIONS.every(s => s.group === 'runtime')).toBe(true);
    });
  });

  describe('SERVICE_SECTIONS', () => {
    it('should have the expected number of service sections', () => {
      expect(SERVICE_SECTIONS).toHaveLength(1);

      // Verify it matches the count from DASHBOARD_SECTIONS
      const serviceFromDashboard = Object.values(DASHBOARD_SECTIONS).filter(
        s => s.group === 'service',
      );
      expect(SERVICE_SECTIONS).toHaveLength(serviceFromDashboard.length);
    });

    it('should have all expected service sections', () => {
      const serviceKeys = SERVICE_SECTIONS.map(s => s.key);
      expect(serviceKeys).toContain('api-keys');
    });

    it('should only contain sections with group "service"', () => {
      expect(SERVICE_SECTIONS.every(s => s.group === 'service')).toBe(true);
    });
  });
});
