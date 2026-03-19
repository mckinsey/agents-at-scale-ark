import { describe, expect, it } from 'vitest';

import {
  AGENT_BUILDER_SECTIONS,
  DASHBOARD_SECTIONS,
  MONITORING_SECTIONS,
} from '@/lib/constants/dashboard-icons';

describe('dashboard-icons', () => {
  describe('DASHBOARD_SECTIONS', () => {
    it('should have all section definitions', () => {
      expect(DASHBOARD_SECTIONS.agents).toBeDefined();
      expect(DASHBOARD_SECTIONS.teams).toBeDefined();
      expect(DASHBOARD_SECTIONS.models).toBeDefined();
      expect(DASHBOARD_SECTIONS.secrets).toBeDefined();
      expect(DASHBOARD_SECTIONS['workflow-templates']).toBeDefined();
      expect(DASHBOARD_SECTIONS.queries).toBeDefined();
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
      expect(DASHBOARD_SECTIONS.sessions).toBeDefined();
    });

    it('should have correct structure for each section', () => {
      expect(DASHBOARD_SECTIONS['workflow-templates']).toEqual({
        key: 'workflow-templates',
        title: 'Workflows',
        icon: expect.any(Object),
        group: 'workflow-templates',
      });
    });

    it('should have icons for all sections', () => {
      Object.values(DASHBOARD_SECTIONS).forEach(section => {
        expect(section.icon).toBeDefined();
        expect(section.key).toBeDefined();
        expect(section.title).toBeDefined();
        expect(section.group).toBeDefined();
      });
    });
  });

  describe('Section groups', () => {
    it('should filter agent builder sections correctly', () => {
      expect(AGENT_BUILDER_SECTIONS).toBeDefined();
      expect(AGENT_BUILDER_SECTIONS.length).toBeGreaterThan(0);
      expect(
        AGENT_BUILDER_SECTIONS.every(s => s.group === 'agent-builder'),
      ).toBe(true);
      expect(
        AGENT_BUILDER_SECTIONS.find(s => s.key === 'agents'),
      ).toBeDefined();
      expect(
        AGENT_BUILDER_SECTIONS.find(s => s.key === 'teams'),
      ).toBeDefined();
      expect(
        AGENT_BUILDER_SECTIONS.find(s => s.key === 'queries'),
      ).toBeDefined();
    });

    it('should filter monitoring sections correctly', () => {
      expect(MONITORING_SECTIONS).toBeDefined();
      expect(MONITORING_SECTIONS.length).toBeGreaterThan(0);
      expect(MONITORING_SECTIONS.every(s => s.group === 'monitoring')).toBe(
        true,
      );
      expect(
        MONITORING_SECTIONS.find(s => s.key === 'sessions'),
      ).toBeDefined();
      expect(MONITORING_SECTIONS.find(s => s.key === 'events')).toBeDefined();
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
