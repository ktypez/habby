import { describe, it, expect } from 'vitest'
import { calcXpForCheckin, calcLevel, calcXpForLevel, calcXpProgress } from '../lib/logic.js'

describe('calcXpForCheckin', () => {
  it('returns 10 for 0 streak', () => {
    expect(calcXpForCheckin(0)).toBe(10)
  })

  it('returns 10 for streak 0', () => {
    expect(calcXpForCheckin(0)).toBe(10)
  })

  it('caps at 40 (10 + 30)', () => {
    expect(calcXpForCheckin(50)).toBe(40)
  })

  it('scales linearly up to cap', () => {
    expect(calcXpForCheckin(1)).toBe(11)
    expect(calcXpForCheckin(10)).toBe(20)
    expect(calcXpForCheckin(30)).toBe(40)
  })
})

describe('calcLevel', () => {
  it('returns 1 for 0 XP', () => {
    expect(calcLevel(0)).toBe(1)
  })

  it('returns 1 for 99 XP', () => {
    expect(calcLevel(99)).toBe(1)
  })

  it('returns 2 at 100 XP', () => {
    expect(calcLevel(100)).toBe(2)
  })

  it('returns 5 at 400 XP', () => {
    expect(calcLevel(400)).toBe(5)
  })
})

describe('calcXpForLevel', () => {
  it('returns 0 for level 1', () => {
    expect(calcXpForLevel(1)).toBe(0)
  })

  it('returns 100 for level 2', () => {
    expect(calcXpForLevel(2)).toBe(100)
  })

  it('returns 400 for level 5', () => {
    expect(calcXpForLevel(5)).toBe(400)
  })
})

describe('calcXpProgress', () => {
  it('returns level 1 with 0 progress for 0 XP', () => {
    const p = calcXpProgress(0)
    expect(p.level).toBe(1)
    expect(p.current).toBe(0)
    expect(p.progress).toBe(0)
  })

  it('returns level 2 with correct progress', () => {
    const p = calcXpProgress(150)
    expect(p.level).toBe(2)
    expect(p.current).toBe(50)
    expect(p.progress).toBe(0.5)
  })
})
