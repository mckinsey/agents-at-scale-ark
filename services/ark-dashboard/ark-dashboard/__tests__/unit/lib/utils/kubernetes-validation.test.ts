import { describe, it, expect } from 'vitest'
import { getKubernetesNameError, kubernetesNameSchema } from '@/lib/utils/kubernetes-validation'

describe('getKubernetesNameError', () => {
  it('should return null for valid names', () => {
    expect(getKubernetesNameError('myapp')).toBe(null)
    expect(getKubernetesNameError('my-app')).toBe(null)
    expect(getKubernetesNameError('app123')).toBe(null)
  })

  it('should return error for empty names', () => {
    expect(getKubernetesNameError('')).toBe('Name is required')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getKubernetesNameError(null as any)).toBe('Name is required')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getKubernetesNameError(undefined as any)).toBe('Name is required')
  })

  it('should return error for names exceeding maximum length', () => {
    const tooLongName = 'a'.repeat(254)
    expect(getKubernetesNameError(tooLongName)).toBe('Name must be 253 characters or less')
  })

  it('should return error for names not starting with alphanumeric', () => {
    expect(getKubernetesNameError('-myapp')).toBe('Name must start with a lowercase letter or number')
    expect(getKubernetesNameError('_myapp')).toBe('Name must start with a lowercase letter or number')
    expect(getKubernetesNameError('.myapp')).toBe('Name must start with a lowercase letter or number')
  })

  it('should return error for names not ending with alphanumeric', () => {
    expect(getKubernetesNameError('myapp-')).toBe('Name must end with a lowercase letter or number')
    expect(getKubernetesNameError('myapp_')).toBe('Name must end with a lowercase letter or number')
    expect(getKubernetesNameError('myapp.')).toBe('Name must end with a lowercase letter or number')
  })

  it('should return error for names with invalid characters', () => {
    expect(getKubernetesNameError('my_app')).toBe('Name can only contain lowercase letters, numbers, hyphens, and dots')
    expect(getKubernetesNameError('MyApp')).toBe('Name can only contain lowercase letters, numbers, hyphens, and dots')
    expect(getKubernetesNameError('my app')).toBe('Name can only contain lowercase letters, numbers, hyphens, and dots')
  })

  it('should return the first applicable error', () => {
    // This name has multiple issues: starts with hyphen and contains uppercase
    expect(getKubernetesNameError('-MyApp')).toBe('Name must start with a lowercase letter or number')

    // This name starts valid but has uppercase
    expect(getKubernetesNameError('myApp')).toBe('Name can only contain lowercase letters, numbers, hyphens, and dots')
  })
})

describe('kubernetesNameSchema', () => {
  describe('valid names', () => {
    it('should accept simple lowercase names', () => {
      expect(kubernetesNameSchema.safeParse('myapp').success).toBe(true)
      expect(kubernetesNameSchema.safeParse('app123').success).toBe(true)
      expect(kubernetesNameSchema.safeParse('123app').success).toBe(true)
    })

    it('should accept names with hyphens', () => {
      expect(kubernetesNameSchema.safeParse('my-app').success).toBe(true)
      expect(kubernetesNameSchema.safeParse('app-123').success).toBe(true)
      expect(kubernetesNameSchema.safeParse('my-awesome-app').success).toBe(true)
    })

    it('should accept names with dots', () => {
      expect(kubernetesNameSchema.safeParse('my.app').success).toBe(true)
      expect(kubernetesNameSchema.safeParse('app.123').success).toBe(true)
      expect(kubernetesNameSchema.safeParse('my.awesome.app').success).toBe(true)
    })

    it('should accept single character names', () => {
      expect(kubernetesNameSchema.safeParse('a').success).toBe(true)
      expect(kubernetesNameSchema.safeParse('1').success).toBe(true)
    })

    it('should accept maximum length names', () => {
      const maxLengthName = 'a'.repeat(253)
      expect(kubernetesNameSchema.safeParse(maxLengthName).success).toBe(true)
    })
  })

  describe('invalid names', () => {
    it('should reject empty or null names', () => {
      expect(kubernetesNameSchema.safeParse('').success).toBe(false)
      expect(kubernetesNameSchema.safeParse(null).success).toBe(false)
      expect(kubernetesNameSchema.safeParse(undefined).success).toBe(false)
    })

    it('should reject names with uppercase letters', () => {
      expect(kubernetesNameSchema.safeParse('MyApp').success).toBe(false)
      expect(kubernetesNameSchema.safeParse('MYAPP').success).toBe(false)
      expect(kubernetesNameSchema.safeParse('myApp').success).toBe(false)
    })

    it('should reject names with special characters', () => {
      expect(kubernetesNameSchema.safeParse('my_app').success).toBe(false)
      expect(kubernetesNameSchema.safeParse('my@app').success).toBe(false)
      expect(kubernetesNameSchema.safeParse('my app').success).toBe(false)
      expect(kubernetesNameSchema.safeParse('my/app').success).toBe(false)
    })

    it('should reject names starting with hyphen', () => {
      expect(kubernetesNameSchema.safeParse('-myapp').success).toBe(false)
      expect(kubernetesNameSchema.safeParse('-123').success).toBe(false)
    })

    it('should reject names ending with hyphen', () => {
      expect(kubernetesNameSchema.safeParse('myapp-').success).toBe(false)
      expect(kubernetesNameSchema.safeParse('123-').success).toBe(false)
    })

    it('should reject names exceeding maximum length', () => {
      const tooLongName = 'a'.repeat(254)
      expect(kubernetesNameSchema.safeParse(tooLongName).success).toBe(false)
    })
  })

  describe('error messages', () => {
    it('should return undefined for valid names', () => {
      expect(kubernetesNameSchema.safeParse('myapp').error).toBe(undefined)
      expect(kubernetesNameSchema.safeParse('my-app').error).toBe(undefined)
      expect(kubernetesNameSchema.safeParse('app123').error).toBe(undefined)
    })

    it('should return error for empty names', () => {
      expect(kubernetesNameSchema.safeParse('').error?.issues[0].message).toBe('Name is required')
      expect(kubernetesNameSchema.safeParse(null).error?.issues[0].message).toBe('Name is required')
      expect(kubernetesNameSchema.safeParse(undefined).error?.issues[0].message).toBe('Name is required')
    })

    it('should return error for names exceeding maximum length', () => {
      const tooLongName = 'a'.repeat(254)
      expect(kubernetesNameSchema.safeParse(tooLongName).error?.issues[0].message).toBe('Name must be 253 characters or less')
    })

    it('should return error for names not starting with alphanumeric', () => {
      expect(kubernetesNameSchema.safeParse('-myapp').error?.issues[0].message).toBe('Name must start with a lowercase letter or number')
      expect(kubernetesNameSchema.safeParse('_myapp').error?.issues[0].message).toBe('Name must start with a lowercase letter or number')
      expect(kubernetesNameSchema.safeParse('.myapp').error?.issues[0].message).toBe('Name must start with a lowercase letter or number')
    })

    it('should return error for names not ending with alphanumeric', () => {
      expect(kubernetesNameSchema.safeParse('myapp-').error?.issues[0].message).toBe('Name must end with a lowercase letter or number')
      expect(kubernetesNameSchema.safeParse('myapp_').error?.issues[0].message).toBe('Name must end with a lowercase letter or number')
      expect(kubernetesNameSchema.safeParse('myapp.').error?.issues[0].message).toBe('Name must end with a lowercase letter or number')
    })

    it('should return error for names with invalid characters', () => {
      expect(kubernetesNameSchema.safeParse('my_app').error?.issues[0].message).toBe('Name can only contain lowercase letters, numbers, hyphens, and dots')
      expect(kubernetesNameSchema.safeParse('myApp').error?.issues[0].message).toBe('Name can only contain lowercase letters, numbers, hyphens, and dots')
      expect(kubernetesNameSchema.safeParse('my app').error?.issues[0].message).toBe('Name can only contain lowercase letters, numbers, hyphens, and dots')
    })

    it('should return the first applicable error', () => {
      // This name has multiple issues: starts with hyphen and contains uppercase
      expect(kubernetesNameSchema.safeParse('-MyApp').error?.issues[0].message).toBe('Name must start with a lowercase letter or number')

      // This name starts valid but has uppercase
      expect(kubernetesNameSchema.safeParse('myApp').error?.issues[0].message).toBe('Name can only contain lowercase letters, numbers, hyphens, and dots')
    })
  })
})