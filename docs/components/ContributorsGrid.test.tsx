import { describe, it, expect } from 'vitest'
import { getContributors } from './ContributorsGrid'

describe('getContributors', () => {
  it('should be defined', () => {
    expect(getContributors).toBeDefined()
  })

  it('should return an array', () => {
    const result = getContributors()
    expect(Array.isArray(result)).toBe(true)
  })

  it('should return contributors with required fields', () => {
    const contributors = getContributors()
    
    if (contributors.length > 0) {
      const contributor = contributors[0]
      expect(contributor).toHaveProperty('profile')
      expect(contributor).toHaveProperty('avatar_url')
      expect(contributor).toHaveProperty('name')
      expect(contributor).toHaveProperty('contributions')
      expect(Array.isArray(contributor.contributions)).toBe(true)
    }
  })
})
