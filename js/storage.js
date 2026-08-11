// ============================================
// HABBY — Storage adapter
// Guest: localStorage · Owner: Redis via /api
// Includes: offline outbox (owner), export/import
// ============================================

import {
  PRIORITIES, REPEAT_OPTIONS, ACHIEVEMENTS,
  calcXpForTask, calcXpProgress, calcStreak, todayStr,
  nextDueDate, checkNewAchievements
} from '../lib/logic.js'

const API = '/api'
let accessPassword = localStorage.getItem('habby-password') || ''
let onChangeCallback = null

export function setAccessPassword(pw) {
  accessPassword = pw
  if (pw) localStorage.setItem('habby-password', pw)
  else localStorage.removeItem('habby-password')
}

export function isOwner() { return !!accessPassword }
export function setOnChange(fn) { onChangeCallback = fn }

function notifyChange() { if (onChangeCallback) onChangeCallback() }

// ============================================
// GUEST STORAGE
// ============================================

function guestGet(key) {
  try {
    const raw = localStorage.getItem('habby:' + key)
    if (raw === null) return null
    return JSON.parse(raw)
  } catch { return null }
}
function guestSet(key, value) { localStorage.setItem('habby:' + key, JSON.stringify(value)) }
function guestRemove(key) { localStorage.removeItem('habby:' + key) }
function guestGetTodos() { return guestGet('todos') || [] }
function guestSaveTodos(list) { guestSet('todos', list) }
function guestGetXp() { return guestGet('xp') || 0 }
function guestSaveXp(xp) { guestSet('xp', Math.max(0, xp)) }
function guestGetCompletedCount() { return guestGet('completed') || 0 }
function guestSetCompletedCount(n) { guestSet('completed', Math.max(0, n)) }
function guestGetAchievements() { return guestGet('achievements') || [] }
function guestSetAchievements(ids) { guestSet('achievements', ids) }

function guestCompletionDates() {
  const dates = new Set()
  for (const t of guestGetTodos()) {
    for (const d of t.completionDates || []) dates.add(d)
  }
  return dates
}

// ============================================
// OWNER API + OFFLINE OUTBOX
// ============================================

export class OfflineError extends Error {
  constructor() {
    super('Offline — changes queued')
    this.offline = true
  }
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (accessPassword) headers['x-access-password'] = accessPassword
  let res
  try {
    res = await fetch(`${API}${path}`, { headers, ...options })
  } catch (err) {
    if (isOwner()) throw new OfflineError()
    throw err
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    const e = new Error(err.error || `HTTP ${res.status}`)
    e.status = res.status
    throw e
  }
  return res.json()
}

function getOutbox() { return guestGet('outbox') || [] }
function setOutbox(entries) { guestSet('outbox', entries); notifyChange() }
function enqueue(entry) {
  const box = getOutbox()
  box.push({ actionId: Math.random().toString(36).slice(2, 10), ...entry })
  setOutbox(box)
}
export function pendingCount() { return getOutbox().length }

// --- Flush offline outbox (owner mode) ---
// Returns { synced: n, dropped: n, resync: bool }
export async function flushOutbox() {
  const box = getOutbox()
  if (!box.length || !isOwner()) return { synced: 0, dropped: 0, resync: false }
  const remaining = []
  let synced = 0
  let dropped = 0
  for (const entry of box) {
    try {
      switch (entry.type) {
        case 'add':
          await api('/todos', { method: 'POST', body: JSON.stringify(entry.payload) })
          break
        case 'edit':
          await api(`/todos/${entry.payload.id}`, { method: 'PATCH', body: JSON.stringify(entry.payload.fields) })
          break
        case 'complete':
          await api(`/todos/${entry.payload.id}/complete`, { method: 'POST' })
          break
        case 'undo':
          await api(`/todos/${entry.payload.id}/complete`, { method: 'DELETE' })
          break
        case 'delete':
          await api(`/todos/${entry.payload.id}`, { method: 'DELETE' })
          break
      }
      synced++
    } catch (err) {
      // State-mismatch (already done/deleted elsewhere) → drop; network → keep for later
      if (err.status === 400 || err.status === 404) dropped++
      else remaining.push(entry)
    }
  }
  setOutbox(remaining)
  return { synced, dropped, resync: synced > 0 || dropped > 0 }
}

// ============================================
// STORAGE ADAPTER
// ============================================

function newGuestTodo(name, emoji, priority, dueDate, notes, repeat) {
  return {
    id: randomId(), name, emoji, priority, dueDate,
    completed: false, completedAt: null, xpEarned: 0,
    repeat: repeat || 'none', notes: notes || '',
    completionDates: [],
    created_at: new Date().toISOString()
  }
}

export const Storage = {
  isOwner,

  // --- Todos ---
  async getTodos() {
    if (isOwner()) {
      const data = await api('/todos')
      return {
        todos: data.todos,
        xp: data.xp,
        streak: await this.getStreak(),
        achievements: await this.getAchievements()
      }
    }
    const list = guestGetTodos()
    const xp = guestGetXp()
    return {
      todos: list,
      xp: calcXpProgress(xp),
      streak: calcStreak(guestCompletionDates()),
      achievements: guestGetAchievements()
    }
  },

  async addTodo(task) {
    const { name, emoji, priority, dueDate, notes, repeat } = task || {}
    if (isOwner()) {
      try {
        return await api('/todos', {
          method: 'POST',
          body: JSON.stringify({ name, emoji, priority, dueDate, notes, repeat })
        })
      } catch (err) {
        if (err instanceof OfflineError) {
          const tempId = 'temp-' + Date.now().toString(36)
          enqueue({ type: 'add', payload: { name, emoji, priority, dueDate, notes, repeat, tempId } })
          return { ...newGuestTodo(name, emoji, priority, dueDate, notes, repeat), id: tempId, queued: true }
        }
        throw err
      }
    }
    const todo = newGuestTodo(name, emoji, priority, dueDate, notes, repeat)
    const list = guestGetTodos()
    list.push(todo)
    guestSaveTodos(list)
    return todo
  },

  async editTodo(id, fields) {
    if (isOwner()) {
      try {
        const data = await api(`/todos/${id}`, { method: 'PATCH', body: JSON.stringify(fields) })
        return data.todo
      } catch (err) {
        if (err instanceof OfflineError) {
          enqueue({ type: 'edit', payload: { id, fields } })
          return { id, queued: true, ...fields }
        }
        throw err
      }
    }
    const list = guestGetTodos()
    const todo = list.find(t => t.id === id)
    if (!todo) return null
    if (fields.name !== undefined) todo.name = fields.name.trim().slice(0, 120)
    if (fields.emoji !== undefined) todo.emoji = fields.emoji
    if (fields.priority !== undefined) todo.priority = fields.priority
    if (fields.dueDate !== undefined) todo.dueDate = fields.dueDate || null
    if (fields.notes !== undefined) todo.notes = String(fields.notes).slice(0, 500)
    if (fields.repeat !== undefined) todo.repeat = fields.repeat
    guestSaveTodos(list)
    return { ...todo }
  },

  async toggleComplete(id) {
    if (isOwner()) {
      const res = await api(`/todos/${id}/complete`, { method: 'POST' })
      return res
    }
    const list = guestGetTodos()
    const todo = list.find(t => t.id === id)
    if (!todo) return null

    if (todo.completed) {
      // undo
      const xpLost = todo.xpEarned || 0
      todo.completed = false
      todo.completedAt = null
      todo.xpEarned = 0
      if (todo.completionDates && todo.completionDates.length) todo.completionDates.pop()
      guestSaveXp(guestGetXp() - xpLost)
      guestSetCompletedCount(guestGetCompletedCount() - 1)
      guestSaveTodos(list)
      return {
        xpGained: 0, xpLost,
        xp: calcXpProgress(guestGetXp()),
        todo: { ...todo },
        nextTodo: null,
        unlocked: [],
        streak: calcStreak(guestCompletionDates())
      }
    }

    const xpGained = calcXpForTask(todo.priority)
    const date = todayStr()
    todo.completed = true
    todo.completedAt = date
    todo.xpEarned = xpGained
    if (!todo.completionDates) todo.completionDates = []
    todo.completionDates.push(date)
    guestSaveXp(guestGetXp() + xpGained)
    guestSetCompletedCount(guestGetCompletedCount() + 1)
    guestSaveTodos(list)

    // Streak + achievements (guest-local)
    const streak = calcStreak(guestCompletionDates())
    const totalCompleted = guestGetCompletedCount()
    const level = Math.floor(guestGetXp() / 100) + 1
    const weekDone = this.guestWeekDone()
    const open = list.filter(t => !t.completed && t.dueDate && t.dueDate <= todayStr())
    const perfectDay = todo.dueDate && todo.dueDate <= date && open.length === 0
    const unlocked = checkNewAchievements(
      { totalCompleted, level, streak: streak.current, weekDone, perfectDay },
      guestGetAchievements()
    )
    if (unlocked.length) guestSetAchievements([...new Set([...guestGetAchievements(), ...unlocked])])

    // Recurring: spawn next instance
    let nextTodo = null
    if (todo.repeat && todo.repeat !== 'none') {
      nextTodo = newGuestTodo(todo.name, todo.emoji, todo.priority, nextDueDate(todo.dueDate || date, todo.repeat), todo.notes, todo.repeat)
      list.push(nextTodo)
      guestSaveTodos(list)
    }

    return {
      xpGained, xpLost: 0,
      xp: calcXpProgress(guestGetXp()),
      todo: { ...todo },
      nextTodo,
      unlocked,
      streak
    }
  },

  guestWeekDone() {
    const dates = guestCompletionDates()
    const today = new Date()
    const cutoff = new Date(today)
    cutoff.setDate(cutoff.getDate() - 6)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    let count = 0
    for (const d of dates) if (d >= cutoffStr) count++
    return count
  },

  async deleteTodo(id) {
    if (isOwner()) {
      try {
        return await api(`/todos/${id}`, { method: 'DELETE' })
      } catch (err) {
        if (err instanceof OfflineError) {
          enqueue({ type: 'delete', payload: { id } })
          return { success: true, queued: true }
        }
        throw err
      }
    }
    const list = guestGetTodos()
    const todo = list.find(t => t.id === id)
    if (!todo) return
    const idx = list.indexOf(todo)
    list.splice(idx, 1)
    guestSaveTodos(list)
    if (todo.completed && todo.xpEarned) {
      guestSaveXp(guestGetXp() - todo.xpEarned)
      guestSetCompletedCount(guestGetCompletedCount() - 1)
    }
  },

  async clearDone() {
    if (isOwner()) {
      return api('/todos/clear-done', { method: 'POST' })
    }
    const list = guestGetTodos()
    const keep = list.filter(t => !t.completed)
    guestSaveTodos(keep)
    return { success: true, removed: list.length - keep.length }
  },

  // --- Stats ---
  async getStats() {
    if (isOwner()) {
      return api('/stats')
    }
    const list = guestGetTodos()
    const totalXP = guestGetXp()
    const now = new Date()
    const todayStrNow = todayStr()
    const weekAgo = new Date(now)
    weekAgo.setDate(weekAgo.getDate() - 6)
    const weekDates = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekAgo)
      d.setDate(d.getDate() + i)
      weekDates.push(d.toISOString().slice(0, 10))
    }

    const active = list.filter(t => !t.completed)
    const completed = list.filter(t => t.completed)
    const overdue = active.filter(t => t.dueDate && t.dueDate < todayStrNow)
    const dueToday = active.filter(t => t.dueDate === todayStrNow)

    const weekDailyCounts = weekDates.map(() => 0)
    const weekDailyXp = weekDates.map(() => 0)
    let weekXP = 0
    for (const t of completed) {
      if (t.completedAt && t.completedAt >= weekDates[0]) {
        const idx = weekDates.indexOf(t.completedAt)
        if (idx !== -1) {
          weekDailyCounts[idx]++
          weekDailyXp[idx] += t.xpEarned || 0
        }
        weekXP += t.xpEarned || 0
      }
    }

    const completedCount = list.length > 0 ? completed.length : 0
    const completionRate = list.length > 0 ? Math.round((completed.length / list.length) * 100) : 0

    return {
      totalTodos: list.length,
      activeTodos: active.length,
      completedTodos: completedCount,
      overdueCount: overdue.length,
      dueTodayCount: dueToday.length,
      completionRate,
      totalXP,
      totalCompleted: guestGetCompletedCount(),
      weekXP,
      weekDailyCounts,
      weekDailyXp,
      weekDates,
      weekGoal: { target: 5, done: this.guestWeekDone() },
      streak: calcStreak(guestCompletionDates())
    }
  },

  // --- Streak ---
  async getStreak() {
    if (isOwner()) return api('/streak')
    return calcStreak(guestCompletionDates())
  },

  // --- Achievements ---
  async getAchievements() {
    if (isOwner()) return api('/achievements')
    const unlocked = new Set(guestGetAchievements())
    return { achievements: ACHIEVEMENTS.map(a => ({ ...a, unlocked: unlocked.has(a.id) })) }
  },

  // --- Digest ---
  async getDigest() {
    if (isOwner()) {
      return api('/digest')
    }
    const list = guestGetTodos()
    const totalXP = guestGetXp()
    const todayStrNow = todayStr()

    const active = list.filter(t => !t.completed)
    const dueToday = active.filter(t => t.dueDate === todayStrNow)
    const overdue = active.filter(t => t.dueDate && t.dueDate < todayStrNow)
    const completedToday = list.filter(t => t.completed && t.completedAt === todayStrNow)

    let xpToday = 0
    for (const t of completedToday) xpToday += t.xpEarned || 0

    const dateStr = new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })

    return {
      date: dateStr,
      openCount: active.length,
      dueTodayCount: dueToday.length,
      overdueCount: overdue.length,
      completedTodayCount: completedToday.length,
      totalXP,
      xpToday,
      dueToday: dueToday.map(t => ({ id: t.id, name: t.name, emoji: t.emoji, priority: t.priority })),
      overdue: overdue.map(t => ({ id: t.id, name: t.name, emoji: t.emoji, priority: t.priority, dueDate: t.dueDate })),
      completedToday: completedToday.map(t => ({ id: t.id, name: t.name, emoji: t.emoji, priority: t.priority }))
    }
  },

  // --- Notifications ---
  async getNotifSettings() {
    if (isOwner()) return api('/notifications/settings')
    return {
      enabled: guestGet('notif:enabled') || false,
      time: guestGet('notif:time') || '09:00'
    }
  },

  async saveNotifSettings(enabled, time) {
    if (isOwner()) {
      return api('/notifications/settings', { method: 'PUT', body: JSON.stringify({ enabled, time }) })
    }
    guestSet('notif:enabled', enabled)
    guestSet('notif:time', time)
  },

  // --- Export / Import ---
  async exportData() {
    if (isOwner()) {
      return api('/export')
    }
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      todos: guestGetTodos(),
      xp: guestGetXp(),
      totalCompleted: guestGetCompletedCount(),
      achievements: guestGetAchievements()
    }
  },

  async importData(data, mode = 'merge') {
    if (!data || !Array.isArray(data.todos)) throw new Error('Invalid backup file')

    if (isOwner()) {
      const res = await api('/import', { method: 'POST', body: JSON.stringify({ mode, data }) })
      return res
    }

    if (mode === 'replace') {
      guestRemove('todos')
      guestRemove('xp')
      guestRemove('completed')
      guestRemove('achievements')
    }

    const clean = data.todos
      .filter(t => t && typeof t.name === 'string' && t.name.trim())
      .map(t => ({
        id: String(t.id || randomId()),
        name: t.name.trim().slice(0, 120),
        emoji: t.emoji || '✅',
        priority: PRIORITIES.includes(t.priority) ? t.priority : 'medium',
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate || '') ? t.dueDate : null,
        completed: !!t.completed,
        completedAt: /^\d{4}-\d{2}-\d{2}$/.test(t.completedAt || '') ? t.completedAt : null,
        xpEarned: parseInt(t.xpEarned || '0', 10),
        repeat: REPEAT_OPTIONS.includes(t.repeat) ? t.repeat : 'none',
        notes: String(t.notes || '').slice(0, 500),
        completionDates: Array.isArray(t.completionDates) ? t.completionDates : (t.completed && t.completedAt ? [t.completedAt] : []),
        created_at: t.created_at || new Date().toISOString()
      }))

    if (mode === 'replace') {
      guestSaveTodos(clean)
      guestSaveXp(parseInt(data.xp || '0', 10))
      guestSetCompletedCount(parseInt(data.totalCompleted || '0', 10))
      if (Array.isArray(data.achievements)) guestSetAchievements(data.achievements.map(String))
    } else {
      const existing = new Set(guestGetTodos().map(t => t.id))
      const fresh = clean.filter(t => !existing.has(t.id))
      guestSaveTodos([...guestGetTodos(), ...fresh])
    }
    return { success: true, added: clean.length }
  }
}

// ============================================
// HELPERS
// ============================================

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function clearGuestData() {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('habby:')) keys.push(k)
  }
  keys.forEach(k => localStorage.removeItem(k))
}

