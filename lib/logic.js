// ============================================
// HABBY — shared game logic
// Used by frontend (js/*) AND backend (app.js)
// ============================================

// --- Todo priorities ---
export const PRIORITIES = ['low', 'medium', 'high']
export const PRIORITY_XP = { high: 25, medium: 15, low: 10 }

// --- XP per completed task ---
export function calcXpForTask(priority) {
  return PRIORITY_XP[priority] || 10
}

// --- XP & Levels ---
export function calcLevel(totalXP) {
  return Math.floor(totalXP / 100) + 1
}

export function calcXpForLevel(level) {
  return (level - 1) * 100
}

export function calcXpProgress(totalXP) {
  const level = calcLevel(totalXP)
  const current = totalXP - calcXpForLevel(level)
  const needed = 100
  return { level, xp: totalXP, current, needed, progress: current / needed }
}

// --- Recurring tasks ---
export const REPEAT_OPTIONS = ['none', 'daily', 'weekly', 'monthly']
export const REPEAT_LABELS = { none: 'NO REPEAT', daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY' }

export function nextDueDate(dueDate, repeat) {
  if (!repeat || repeat === 'none') return null
  const base = dueDate || todayStr(new Date(Date.now() - 86400000))
  let d = new Date(base + 'T00:00:00Z')
  if (isNaN(d)) return null
  if (repeat === 'daily') d.setUTCDate(d.getUTCDate() + 1)
  else if (repeat === 'weekly') d.setUTCDate(d.getUTCDate() + 7)
  else if (repeat === 'monthly') {
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth()
    const day = d.getUTCDate()
    const nextMonth = month + 1
    const nextYear = nextMonth > 11 ? year + 1 : year
    const normalizedMonth = nextMonth > 11 ? 0 : nextMonth
    const lastDay = new Date(Date.UTC(nextYear, normalizedMonth + 1, 0)).getUTCDate()
    const newDay = Math.min(day, lastDay)
    // Build fresh Date to avoid month-overflow side-effects from setUTCMonth
    d = new Date(Date.UTC(nextYear, normalizedMonth, newDay))
  }
  else return null
  return d.toISOString().slice(0, 10)
}

// --- Date helpers ---
export function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a, b) {
  // both 'YYYY-MM-DD', computed in UTC
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

// --- Streak ---
// dateSet: Set of 'YYYY-MM-DD' strings, each = a day with ≥1 completion
export function calcStreak(dateSet, today = todayStr()) {
  const dates = [...dateSet].sort()
  if (dates.length === 0) return { current: 0, longest: 0, lastDate: null }

  const has = d => dateSet.has(d)

  // Walk sorted dates first to compute longest streak
  let longest = 1
  let run = 1
  for (let i = 1; i < dates.length; i++) {
    if (daysBetween(dates[i - 1], dates[i]) === 1) run++
    else run = 1
    if (run > longest) longest = run
  }

  // Current streak: consecutive days ending today (or yesterday if today not done yet)
  const todayUTC = today
  const yesterdayUTC = todayStr(new Date(Date.now() - 86400000))
  let cursorStr = has(todayUTC) ? todayUTC : (has(yesterdayUTC) ? yesterdayUTC : null)
  if (!cursorStr) return { current: 0, longest, lastDate: dates[dates.length - 1] }
  let current = 0
  while (has(cursorStr)) {
    current++
    const [y, m, d] = cursorStr.split('-').map(Number)
    cursorStr = new Date(Date.UTC(y, m - 1, d) - 86400000).toISOString().slice(0, 10)
  }

  const lastDate = dates[dates.length - 1]
  return { current, longest, lastDate }
}

// --- Weekly goal ---
export const WEEK_GOAL = 5 // completions per rolling 7 days

// --- Achievements ---
export const ACHIEVEMENTS = [
  { id: 'first', name: 'First Blood', desc: 'Complete your first task' },
  { id: 'ten', name: 'Double Digits', desc: 'Complete 10 tasks' },
  { id: 'twenty-five', name: 'Task Slayer', desc: 'Complete 25 tasks' },
  { id: 'fifty', name: 'Half Century', desc: 'Complete 50 tasks' },
  { id: 'level5', name: 'Rising Star', desc: 'Reach Level 5' },
  { id: 'level10', name: 'Legend', desc: 'Reach Level 10' },
  { id: 'streak3', name: 'Warm Up', desc: 'Hit a 3-day streak' },
  { id: 'streak7', name: 'On Fire', desc: 'Hit a 7-day streak' },
  { id: 'streak30', name: 'Unstoppable', desc: 'Hit a 30-day streak' },
  { id: 'weekgoal', name: 'Weekly Warrior', desc: `Hit the weekly goal (${WEEK_GOAL} tasks in 7 days)` },
  { id: 'perfect', name: 'Perfect Day', desc: 'Complete every due task on time' }
]

// state: { totalCompleted, level, streak, weekDone, perfectDay }
// unlocked: array of already-unlocked ids
// returns array of newly unlocked ids
export function checkNewAchievements(state, unlocked = []) {
  const have = new Set(unlocked)
  const newly = []
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.id)) continue
    let hit = false
    switch (a.id) {
      case 'first': hit = state.totalCompleted >= 1; break
      case 'ten': hit = state.totalCompleted >= 10; break
      case 'twenty-five': hit = state.totalCompleted >= 25; break
      case 'fifty': hit = state.totalCompleted >= 50; break
      case 'level5': hit = state.level >= 5; break
      case 'level10': hit = state.level >= 10; break
      case 'streak3': hit = state.streak >= 3; break
      case 'streak7': hit = state.streak >= 7; break
      case 'streak30': hit = state.streak >= 30; break
      case 'weekgoal': hit = (state.weekDone || 0) >= WEEK_GOAL; break
      case 'perfect': hit = !!state.perfectDay; break
    }
    if (hit) newly.push(a.id)
  }
  return newly
}

// --- Natural language due date parsing ---
// "Buy milk tomorrow" → { date: 'YYYY-MM-DD', name: 'Buy milk' }
const WEEKDAY_NAMES = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6
}

export function parseDueDate(input) {
  const name = input.trim()
  if (!name) return { date: null, name: '' }
  const s = ' ' + name.toLowerCase() + ' '
  let date = null
  // All arithmetic in UTC — the app's dates (todayStr, dueDate, completed: keys)
  // are UTC-based. Mixing local "today" with toISOString output shifts dates by TZ.
  const now = new Date()
  const utcStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const iso = d => d.toISOString().slice(0, 10)
  const addDays = n => new Date(utcStart + n * 86400000)
  const nextWeekday = (day, includeToday) => {
    let d = includeToday ? new Date(utcStart) : addDays(1)
    for (let i = 0; i < 8; i++) {
      if (d.getUTCDay() === day) return d
      d = new Date(d.getTime() + 86400000)
    }
    return null
  }

  const rules = [
    { re: /\b(day after tomorrow)\b/, d: () => addDays(2) },
    { re: /\b(tomorrow|tmrw|tmr)\b/, d: () => addDays(1) },
    { re: /\b(today|tonight)\b/, d: () => new Date(utcStart) },
    { re: /\bin\s+(\d+)\s+days?\b/, d: (m) => addDays(parseInt(m[1], 10)) },
    { re: /\bnext\s+week\b/, d: () => addDays(7) },
    { re: /\b(this\s+weekend|weekend)\b/, d: () => nextWeekday(6, false) }, // next Saturday
    { re: /\b(next\s+)?(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/, d: (m) => nextWeekday(WEEKDAY_NAMES[m[2]], m[1] === 'next ') }
  ]

  let matched = null
  for (const { re, d } of rules) {
    const m = s.match(re)
    if (m) { matched = m; date = d(m); break }
  }

  if (!date) return { date: null, name }
  let cleaned = s.replace(new RegExp('\\s*(?:' + matched[0] + ')\\s*'), ' ').trim()
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  return { date: iso(date), name: cleaned }
}
