import {describe, expect, it} from '@jest/globals';
import {
  getMarketplaceItem,
  getAllMarketplaceServices,
  getAllMarketplaceAgents,
  isMarketplaceService,
} from './marketplaceServices.js';

describe('marketplaceServices', () => {
  describe('getMarketplaceItem', () => {
    it('should return a service for marketplace/services/ path', () => {
      const result = getMarketplaceItem('marketplace/services/phoenix');
      expect(result).toBeDefined();
      expect(result?.name).toBe('phoenix');
    });

    it('should return an agent for marketplace/agents/ path', () => {
      const result = getMarketplaceItem('marketplace/agents/noah');
      expect(result).toBeDefined();
      expect(result?.name).toBe('noah');
    });

    it('should return undefined for non-existent service', () => {
      const result = getMarketplaceItem('marketplace/services/nonexistent');
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-existent agent', () => {
      const result = getMarketplaceItem('marketplace/agents/nonexistent');
      expect(result).toBeUndefined();
    });

    it('should return undefined for invalid path', () => {
      const result = getMarketplaceItem('invalid/path');
      expect(result).toBeUndefined();
    });

    it('should not return noah from services path', () => {
      const result = getMarketplaceItem('marketplace/services/noah');
      expect(result).toBeUndefined();
    });

    it('should not return phoenix from agents path', () => {
      const result = getMarketplaceItem('marketplace/agents/phoenix');
      expect(result).toBeUndefined();
    });
  });

  describe('getAllMarketplaceServices', () => {
    it('should return all marketplace services', () => {
      const services = getAllMarketplaceServices();
      expect(services).toBeDefined();
      expect(services.phoenix).toBeDefined();
      expect(services.langfuse).toBeDefined();
      expect(services.noah).toBeUndefined();
    });
  });

  describe('getAllMarketplaceAgents', () => {
    it('should return all marketplace agents', () => {
      const agents = getAllMarketplaceAgents();
      expect(agents).toBeDefined();
      expect(agents.noah).toBeDefined();
      expect(agents.phoenix).toBeUndefined();
      expect(agents.langfuse).toBeUndefined();
    });
  });

  describe('isMarketplaceService', () => {
    it('should return true for marketplace/services/ paths', () => {
      expect(isMarketplaceService('marketplace/services/phoenix')).toBe(true);
      expect(isMarketplaceService('marketplace/services/langfuse')).toBe(true);
    });

    it('should return true for marketplace/agents/ paths', () => {
      expect(isMarketplaceService('marketplace/agents/noah')).toBe(true);
    });

    it('should return false for other paths', () => {
      expect(isMarketplaceService('phoenix')).toBe(false);
      expect(isMarketplaceService('services/phoenix')).toBe(false);
      expect(isMarketplaceService('marketplace/phoenix')).toBe(false);
    });
  });
});
