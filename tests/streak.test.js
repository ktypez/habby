import { describe, it, expect } from 'vitest'
import { calculateStreak } from '../lib/logic.js'

describe('calculateStreak', () => {
  it('returns 0 for empty dates', () => {
    expect(calculateStreak([], '2026-07-05')).toBe(0)
  })

  it('returns 0 for null dates', () => {
    expect(calculateStreak(null, '2026-07-05')).toBe(0)
  })

  it('counts 1 for today only', () => {
    expect(calculateStreak(['2026-07-05'], '2026-07-05')).toBe(1)
  })

  it('counts consecutive days going backwards', () => {
    const dates = ['2026-07-05', '2026-07-04', '2026-07-03']
    expect(calculateStreak(dates, '2026-07-05')).toBe(3)
  })

  it('stops at gap', () => {
    const dates = ['2026-07-05', '2026-07-04', '2026-07-02']
    expect(calculateStreak(dates, '2026-07-05')).toBe(2)
  })

  it('handles streak without today (last checkin yesterday)', () => {
    const dates = ['2026-07-04']
    expect(calculateStreak(dates, '2026-07-05')).toBe(1)
  })

  it('handles streak without today and gap yesterday', () => {
    const dates = ['2026-07-03']
    expect(calculateStreak(dates, '2026-07-05')).toBe(0)
  })

  it('handles long streak', () => {
    const dates = Array.from({ length: 30 }, (_, i) => {
      const d = new Date('2026-07-05T00:00:00')
      d.setDate(d.getDate() - i)
      return d.toISOString().slice(0, 10)
    })
    expect(calculateStreak(dates, '2026-07-05')).toBe(30)
  })
})
