import { describe, expect, it } from 'vitest'
import { PERSONAS, getPersona } from './personas'
import { getAIConfig } from './difficulty'
import { SERVE_BY_SHOT } from '../character/serve'

describe('named AI personas', () => {
  it('has four uniquely named personas with distinct styles and valid serves', () => {
    expect(PERSONAS).toHaveLength(4)
    expect(new Set(PERSONAS.map(p => p.name)).size).toBe(4)
    expect(new Set(PERSONAS.map(p => p.style + p.difficulty)).size).toBeGreaterThanOrEqual(3)
    const serveTypes = new Set(Object.values(SERVE_BY_SHOT))
    for (const persona of PERSONAS) {
      expect(serveTypes.has(persona.serve), persona.id).toBe(true)
      expect(persona.bio.length).toBeGreaterThan(10)
    }
  })
  it('maps each persona to a real AI config and defaults safely', () => {
    for (const persona of PERSONAS) {
      const config = getAIConfig(persona.difficulty, persona.style)
      expect(config.style).toBe(persona.style)
      expect(config.difficulty).toBe(persona.difficulty)
    }
    expect(getPersona('unknown').name).toBe(PERSONAS[1].name)
  })
})
