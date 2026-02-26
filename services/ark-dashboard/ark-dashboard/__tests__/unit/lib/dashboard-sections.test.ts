import { describe, expect, it } from 'vitest';

import {
  AGENT_BUILDER_SECTIONS,
  DASHBOARD_SECTIONS,
  MONITORING_SECTIONS,
} from '@/lib/constants/dashboard-icons';

describe('Dashboard Sections - enabledWhen', () => {
  describe('DASHBOARD_SECTIONS filtering', () => {
    it('should return the expected total number of sections', () => {
      const allSections = Object.values(DASHBOARD_SECTIONS);
      expect(allSections.length).toBeGreaterThan(0);
    });
  });

  describe('AGENT_BUILDER_SECTIONS', () => {
    it('should have the expected number of agent builder sections', () => {
      expect(AGENT_BUILDER_SECTIONS.length).toBeGreaterThan(0);

      const agentBuilderFromDashboard = Object.values(DASHBOARD_SECTIONS).filter(
        s => s.group === 'agent-builder',
      );
      expect(AGENT_BUILDER_SECTIONS).toHaveLength(agentBuilderFromDashboard.length);
    });

    it('should have all expected agent builder sections', () => {
      const agentBuilderKeys = AGENT_BUILDER_SECTIONS.map(s => s.key);
      expect(agentBuilderKeys).toContain('agents');
      expect(agentBuilderKeys).toContain('teams');
      expect(agentBuilderKeys).toContain('queries');
    });

    it('should only contain sections with group "agent-builder"', () => {
      expect(
        AGENT_BUILDER_SECTIONS.every(s => s.group === 'agent-builder'),
      ).toBe(true);
    });
  });

  describe('MONITORING_SECTIONS', () => {
    it('should have the expected sections', () => {
      expect(MONITORING_SECTIONS.length).toBeGreaterThan(0);

      const monitoringFromDashboard = Object.values(DASHBOARD_SECTIONS).filter(
        s => s.group === 'monitoring',
      );
      expect(MONITORING_SECTIONS).toHaveLength(monitoringFromDashboard.length);

      const monitoringKeys = MONITORING_SECTIONS.map(s => s.key);
      expect(monitoringKeys).toContain('sessions');
      expect(monitoringKeys).toContain('events');
      expect(monitoringKeys).toContain('broker');
      expect(monitoringKeys).toContain('evals');
    });

    it('should only contain sections with group "monitoring"', () => {
      expect(MONITORING_SECTIONS.every(s => s.group === 'monitoring')).toBe(
        true,
      );
    });
  });

  describe('Configuration sections', () => {
    it('should have configuration sections in DASHBOARD_SECTIONS', () => {
      const configSections = Object.values(DASHBOARD_SECTIONS).filter(
        s => s.group === 'configurations',
      );
      expect(configSections.length).toBeGreaterThan(0);

      const configKeys = configSections.map(s => s.key);
      expect(configKeys).toContain('models');
      expect(configKeys).toContain('secrets');
      expect(configKeys).toContain('evaluators');
    });
  });

  describe('Operation sections', () => {
    it('should have operation sections in DASHBOARD_SECTIONS', () => {
      const opSections = Object.values(DASHBOARD_SECTIONS).filter(
        s => s.group === 'operations',
      );
      expect(opSections.length).toBeGreaterThan(0);

      const opKeys = opSections.map(s => s.key);
      expect(opKeys).toContain('memory');
      expect(opKeys).toContain('files');
      expect(opKeys).toContain('tasks');
    });
  });

  describe('Runtime sections', () => {
    it('should have runtime sections in DASHBOARD_SECTIONS', () => {
      const runtimeSections = Object.values(DASHBOARD_SECTIONS).filter(
        s => s.group === 'runtime',
      );
      expect(runtimeSections.length).toBeGreaterThan(0);

      const runtimeKeys = runtimeSections.map(s => s.key);
      expect(runtimeKeys).toContain('tools');
      expect(runtimeKeys).toContain('mcp');
      expect(runtimeKeys).toContain('a2a');
      expect(runtimeKeys).toContain('services');
    });
  });

  describe('Service sections', () => {
    it('should have service sections in DASHBOARD_SECTIONS', () => {
      const serviceSections = Object.values(DASHBOARD_SECTIONS).filter(
        s => s.group === 'service',
      );
      expect(serviceSections.length).toBeGreaterThan(0);

      const serviceKeys = serviceSections.map(s => s.key);
      expect(serviceKeys).toContain('api-keys');
      expect(serviceKeys).toContain('export');
    });
  });
});
