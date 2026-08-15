import { describe, it, expect } from 'vitest'
import {
  calcXpForTask, calcLevel, calcXpForLevel, calcXpProgress, PRIORITY_XP,
  daysBetween, calcStreak, todayStr, nextDueDate, parseDueDate, checkNewAchievements, WEEK_GOAL, ACHIEVEMENTS
} from '../lib/logic.js'

describe('calcXpForTask', () => {
  it('awards XP by priority', () => {
    expect(PRIORITY_XP).toEqual({ high: 25, medium: 15, low: 10 })
    expect(calcXpForTask('high')).toBe(25)
    expect(calcXpForTask('medium')).toBe(15)
    expect(calcXpForTask('low')).toBe(10)
  })

  it('defaults to 10 for unknown priority', () => {
    expect(calcXpForTask('urgent')).toBe(10)
    expect(calcXpForTask(undefined)).toBe(10)
    expect(calcXpForTask(null)).toBe(10)
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

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetween('2025-01-15', '2025-01-15')).toBe(0)
  })

  it('returns positive for later date', () => {
    expect(daysBetween('2025-01-15', '2025-01-20')).toBe(5)
  })

  it('returns negative for earlier date', () => {
    expect(daysBetween('2025-01-20', '2025-01-15')).toBe(-5)
  })

  it('is independent of system timezone', () => {
    expect(daysBetween('2025-01-01', '2025-01-02')).toBe(1)
    expect(daysBetween('2024-12-31', '2025-01-01')).toBe(1)
  })
})

describe('todayStr', () => {
  it('returns YYYY-MM-DD', () => {
    const t = todayStr()
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('nextDueDate', () => {
  it('returns null for none', () => {
    expect(nextDueDate('2025-01-15', 'none')).toBeNull()
  })

  it('adds one day for daily', () => {
    expect(nextDueDate('2025-01-15', 'daily')).toBe('2025-01-16')
  })

  it('adds 7 days for weekly', () => {
    expect(nextDueDate('2025-01-15', 'weekly')).toBe('2025-01-22')
  })

  it('clamps monthly to last day of month', () => {
    expect(nextDueDate('2025-01-31', 'monthly')).toBe('2025-02-28')
  })

  it('rolls over year for daily', () => {
    expect(nextDueDate('2025-12-31', 'daily')).toBe('2026-01-01')
  })
})

describe('parseDueDate', () => {
  it('returns null date with cleaned name when no date keyword', () => {
    const r = parseDueDate('Buy milk')
    expect(r.date).toBeNull()
    expect(r.name).toBe('Buy milk')
  })

  it('parses tomorrow', () => {
    const r = parseDueDate('Buy milk tomorrow')
    expect(r.date).toBe(todayStr(new Date(Date.now() + 86400000)))
    expect(r.name).toBe('buy milk')
  })

  it('parses today', () => {
    const r = parseDueDate('Call mom today')
    expect(r.date).toBe(todayStr())
    expect(r.name).toBe('call mom')
  })

  it('parses in N days', () => {
    const r = parseDueDate('Meeting in 3 days')
    expect(r.date).toBe(todayStr(new Date(Date.now() + 3 * 86400000)))
    expect(r.name).toBe('meeting')
  })

  it('returns empty for empty input', () => {
    expect(parseDueDate('')).toEqual({ date: null, name: '' })
  })
})

describe('calcStreak', () => {
  const buildSet = (dates) => new Set(dates)

  it('returns 0 for empty set', () => {
    const r = calcStreak(new Set())
    expect(r.current).toBe(0)
    expect(r.longest).toBe(0)
  })

  it('returns 0 current when no recent activity', () => {
    const r = calcStreak(buildSet(['2025-01-10', '2025-01-09']), '2025-01-15')
    expect(r.current).toBe(0)
  })

  it('counts current streak up to today', () => {
    const today = todayStr()
    const yesterday = todayStr(new Date(Date.now() - 86400000))
    const r = calcStreak(buildSet([today, yesterday]), today)
    expect(r.current).toBe(2)
  })

  it('counts current streak ending yesterday', () => {
    const today = todayStr()
    const yesterday = todayStr(new Date(Date.now() - 86400000))
    const dayBefore = todayStr(new Date(Date.now() - 2 * 86400000))
    const r = calcStreak(buildSet([yesterday, dayBefore]), today)
    expect(r.current).toBe(2)
  })

  it('computes longest streak', () => {
    const s = buildSet(['2025-01-10', '2025-01-11', '2025-01-12', '2025-01-15', '2025-01-16'])
    const r = calcStreak(s, '2025-01-16')
    expect(r.longest).toBe(3)
  })
})

describe('checkNewAchievements', () => {
  const ids = ACHIEVEMENTS.map(a => a.id)

  it('returns first when totalCompleted >= 1', () => {
    expect(checkNewAchievements({ totalCompleted: 1, level: 1, streak: 0, weekDone: 0 }, ids)).toEqual([])
    expect(checkNewAchievements({ totalCompleted: 1, level: 1, streak: 0, weekDone: 0 }, [])).toEqual(['first'])
  })

  it('returns level achievements', () => {
    const unlocked = checkNewAchievements({ totalCompleted: 0, level: 5, streak: 0, weekDone: 0 }, [])
    expect(unlocked).toContain('level5')
    expect(unlocked).not.toContain('level10')
  })

  it('returns streak achievements', () => {
    const unlocked = checkNewAchievements({ totalCompleted: 0, level: 1, streak: 7, weekDone: 0 }, [])
    expect(unlocked).toContain('streak7')
  })

  it('returns week goal achievement', () => {
    const unlocked = checkNewAchievements({ totalCompleted: 0, level: 1, streak: 0, weekDone: WEEK_GOAL }, [])
    expect(unlocked).toContain('weekgoal')
  })

  it('returns perfect day achievement', () => {
    const unlocked = checkNewAchievements({ totalCompleted: 0, level: 1, streak: 0, weekDone: 0, perfectDay: true }, [])
    expect(unlocked).toContain('perfect')
  })

  it('does not duplicate already unlocked', () => {
    const unlocked = checkNewAchievements({ totalCompleted: 1, level: 1, streak: 0, weekDone: 0 }, ['first'])
    expect(unlocked).not.toContain('first')
  })
})
