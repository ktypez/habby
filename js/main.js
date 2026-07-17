// ============================================
// HABBY — Habits & Streaks Tracker
// Public localStorage mode + Owner Redis mode
// ============================================

const API = '/api'
let habits = []
let xpState = { level: 1, xp: 0, current: 0, needed: 100, progress: 0 }
let timerIntervals = {}
let noteTargetId = null
let reminderInterval = null
let accessPassword = localStorage.getItem('habby-password') || ''

// DOM refs
const $ = sel => document.querySelector(sel)

const appEl = $('#app')

const habitsList = $('#habitsList')
const emptyState = $('#emptyState')
const emptyText = $('#emptyText')
const weekGrid = $('#weekGrid')
const weekSection = $('#weekSection')
const habitsCount = $('#habitsCount')
const totalStreaks = $('#totalStreaks')
const habitInput = $('#habitInput')
const addBtn = $('#addHabitBtn')
const toastContainer = $('#toastContainer')

// XP DOM
const xpLevelBadge = $('#xpLevelBadge')
const xpBarFill = $('#xpBarFill')
const xpNumbers = $('#xpNumbers')

// Digest
const digestBtn = $('#digestBtn')
const digestModal = $('#digestModal')
const digestContent = $('#digestContent')
const digestModalClose = $('#digestModalClose')

// Stats
const statsBtn = $('#statsBtn')
const statsModal = $('#statsModal')
const statsGrid = $('#statsGrid')
const statsModalClose = $('#statsModalClose')

// Note modal
const noteModal = $('#noteModal')
const noteModalTitle = $('#noteModalTitle')
const noteInput = $('#noteInput')
const noteSaveBtn = $('#noteSaveBtn')
const noteDeleteBtn = $('#noteDeleteBtn')
const noteModalClose = $('#noteModalClose')

// Notification modal
const notifModal = $('#notifModal')
const notifBtn = $('#notifBtn')
const notifToggle = $('#notifToggle')
const notifTime = $('#notifTime')
const notifTestBtn = $('#notifTestBtn')
const notifModalClose = $('#notifModalClose')

// ============================================
// GUEST STORAGE (localStorage)
// ============================================

function guestGet(key) {
  try {
    const raw = localStorage.getItem('habby:' + key)
    if (raw === null) return null
    return JSON.parse(raw)
  } catch { return null }
}

function guestSet(key, value) {
  localStorage.setItem('habby:' + key, JSON.stringify(value))
}

function guestRemove(key) {
  localStorage.removeItem('habby:' + key)
}

function guestGetHabits() {
  return guestGet('habits') || []
}

function guestSaveHabits(list) {
  guestSet('habits', list)
}

function guestGetHabitDates(id) {
  return guestGet('habit:' + id + ':dates') || []
}

function guestSaveHabitDates(id, dates) {
  guestSet('habit:' + id + ':dates', dates)
}

function guestGetNote(id, date) {
  return guestGet('habit:' + id + ':note:' + date) || null
}

function guestSaveNote(id, date, text) {
  if (text && text.trim()) {
    guestSet('habit:' + id + ':note:' + date, text.trim())
  } else {
    guestRemove('habit:' + id + ':note:' + date)
  }
}

function guestGetTimerTotal(id) {
  return guestGet('habit:' + id + ':timer:total') || 0
}

function guestSaveTimerTotal(id, total) {
  guestSet('habit:' + id + ':timer:total', total)
}

function guestGetTimerRunning(id) {
  return guestGet('habit:' + id + ':timer:running') || null
}

function guestSaveTimerRunning(id, ts) {
  if (ts) guestSet('habit:' + id + ':timer:running', ts)
  else guestRemove('habit:' + id + ':timer:running')
}

function guestGetXp() {
  return guestGet('xp') || 0
}

function guestSaveXp(xp) {
  guestSet('xp', xp)
}

function guestGetNotifSettings() {
  return {
    enabled: guestGet('notif:enabled') || false,
    time: guestGet('notif:time') || '09:00'
  }
}

function guestSaveNotifSettings(enabled, time) {
  guestSet('notif:enabled', enabled)
  guestSet('notif:time', time)
}

// ============================================
// STORAGE ADAPTER
// ============================================

const Storage = {
  isOwner() { return !!accessPassword },

  // --- Habits ---
  async getHabits() {
    if (this.isOwner()) {
      return api('/habits')
    }
    const list = guestGetHabits()
    const xp = calcXpProgress(guestGetXp())
    const todayStr = today()
    const habits = list.map(h => {
      const dates = guestGetHabitDates(h.id)
      const noteToday = guestGetNote(h.id, todayStr)
      const timerRunning = guestGetTimerRunning(h.id)
      const timerTotal = guestGetTimerTotal(h.id)
      return {
        ...h,
        streak: calculateStreak(dates, todayStr),
        checkedToday: dates.includes(todayStr),
        dates: dates.sort().reverse().slice(0, 60),
        timerRunning,
        timerTotal,
        noteToday
      }
    })
    return { habits, xp }
  },

  async addHabit(name, emoji, color) {
    if (this.isOwner()) {
      return api('/habits', {
        method: 'POST',
        body: JSON.stringify({ name, emoji, color })
      })
    }
    const id = randomId()
    const now = new Date().toISOString()
    const habit = {
      id, name: name.trim(), emoji: emoji || '✅',
      color: color || '#FF3366', archived: false, created_at: now
    }
    const list = guestGetHabits()
    list.unshift(habit)
    guestSaveHabits(list)
    return {
      id, name: name.trim(), emoji: emoji || '✅',
      color: color || '#FF3366', archived: false, created_at: now,
      streak: 0, checkedToday: false, dates: [],
      timerRunning: null, timerTotal: 0, noteToday: null
    }
  },

  async deleteHabit(id) {
    if (this.isOwner()) {
      return api(`/habits/${id}`, { method: 'DELETE' })
    }
    const list = guestGetHabits()
    const habit = list.find(h => h.id === id)
    if (!habit) return { success: true }

    // XP deduction
    const dates = guestGetHabitDates(id)
    let xpDeduction = 0
    let streakAccum = 0
    for (const d of dates.sort()) {
      streakAccum++
      xpDeduction += calcXpForCheckin(streakAccum)
    }
    const totalXp = guestGetXp()
    guestSaveXp(Math.max(0, totalXp - xpDeduction))

    // Remove habit data
    const newList = list.filter(h => h.id !== id)
    guestSaveHabits(newList)
    guestRemove('habit:' + id + ':dates')
    guestRemove('habit:' + id + ':timer:running')
    guestRemove('habit:' + id + ':timer:total')
    // Remove notes
    for (const d of dates) {
      guestRemove('habit:' + id + ':note:' + d)
    }
    return { success: true }
  },

  async checkin(id) {
    if (this.isOwner()) {
      return api(`/habits/${id}/checkin`, { method: 'POST' })
    }
    const dateStr = today()
    const dates = guestGetHabitDates(id)
    if (!dates.includes(dateStr)) dates.push(dateStr)
    guestSaveHabitDates(id, dates)

    const streak = calculateStreak(dates, dateStr)
    const xpGained = calcXpForCheckin(streak)
    const totalXp = guestGetXp()
    const newTotalXp = totalXp + xpGained
    guestSaveXp(newTotalXp)

    const noteToday = guestGetNote(id, dateStr)
    return {
      success: true, checkedToday: true, streak,
      xpGained, xp: calcXpProgress(newTotalXp),
      dates: dates.sort().reverse().slice(0, 60),
      noteToday
    }
  },

  async undoCheckin(id) {
    if (this.isOwner()) {
      return api(`/habits/${id}/checkin`, { method: 'DELETE' })
    }
    const dateStr = today()
    let dates = guestGetHabitDates(id)
    dates = dates.filter(d => d !== dateStr)
    guestSaveHabitDates(id, dates)

    const streak = calculateStreak(dates, dateStr)
    const xpLost = calcXpForCheckin(streak + 1)
    const totalXp = guestGetXp()
    const newTotalXp = Math.max(0, totalXp - xpLost)
    guestSaveXp(newTotalXp)

    return {
      success: true, checkedToday: false, streak,
      xpLost, xp: calcXpProgress(newTotalXp),
      dates: dates.sort().reverse().slice(0, 60)
    }
  },

  // --- Notes ---
  async saveNote(id, text) {
    if (this.isOwner()) {
      return api(`/habits/${id}/note`, {
        method: 'PUT',
        body: JSON.stringify({ text })
      })
    }
    const dateStr = today()
    guestSaveNote(id, dateStr, text)
    return { success: true, note: text?.trim() || null }
  },

  // --- Timer ---
  async startTimer(id) {
    if (this.isOwner()) {
      return api(`/habits/${id}/timer/start`, { method: 'POST' })
    }
    const now = Date.now()
    guestSaveTimerRunning(id, now)
    return { success: true, startTime: now }
  },

  async stopTimer(id) {
    if (this.isOwner()) {
      return api(`/habits/${id}/timer/stop`, { method: 'POST' })
    }
    const startTime = guestGetTimerRunning(id)
    if (!startTime) return { error: 'Timer not running' }
    const now = Date.now()
    const elapsed = Math.floor((now - startTime) / 1000)
    const total = guestGetTimerTotal(id)
    const newTotal = total + elapsed
    guestSaveTimerTotal(id, newTotal)
    guestSaveTimerRunning(id, null)
    return { success: true, elapsed, total: newTotal, startTime: null }
  },

  // --- Stats ---
  async getStats() {
    if (this.isOwner()) {
      return api('/stats')
    }
    // Build stats from localStorage
    const list = guestGetHabits()
    const totalXP = guestGetXp()
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    let bestStreak = 0
    let bestStreakName = ''
    let weekCheckins = 0
    let weekTotalDays = 0
    const weekAgo = new Date(now)
    weekAgo.setDate(weekAgo.getDate() - 6)
    const weekDates = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekAgo)
      d.setDate(d.getDate() + i)
      weekDates.push(d.toISOString().slice(0, 10))
    }
    const weekDailyCounts = weekDates.map(() => 0)

    const active = list.filter(h => !h.archived)
    const archived = list.filter(h => h.archived)

    for (const h of active) {
      const dates = guestGetHabitDates(h.id)
      const streak = calculateStreak(dates, todayStr)
      if (streak > bestStreak) {
        bestStreak = streak
        bestStreakName = h.name
      }
      for (const d of dates) {
        const idx = weekDates.indexOf(d)
        if (idx !== -1) weekDailyCounts[idx]++
      }
      weekCheckins += dates.filter(d => d >= weekDates[0] && d <= todayStr).length
      const created = new Date(h.created_at || now)
      const daysSince = Math.max(1, Math.round((now - created) / (1000 * 60 * 60 * 24)))
      weekTotalDays += Math.min(7, daysSince)
    }

    const completionRate = weekTotalDays > 0 ? Math.round((weekCheckins / weekTotalDays) * 100) : 0
    const weekXp = weekCheckins * 15

    return {
      totalHabits: list.length,
      activeHabits: active.length,
      archivedHabits: archived.length,
      totalXP,
      bestStreak,
      bestStreakName,
      weekCheckins,
      weekTotalDays,
      completionRate,
      weekXp,
      weekDailyCounts,
      weekDates
    }
  },

  // --- Digest ---
  async getDigest() {
    if (this.isOwner()) {
      return api('/digest')
    }
    const list = guestGetHabits()
    const totalXP = guestGetXp()
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    const active = list.filter(h => !h.archived).map(h => {
      const dates = guestGetHabitDates(h.id)
      const noteToday = guestGetNote(h.id, todayStr)
      return {
        ...h,
        streak: calculateStreak(dates, todayStr),
        checkedToday: dates.includes(todayStr),
        noteToday
      }
    })
    const checked = active.filter(h => h.checkedToday)
    const pending = active.filter(h => !h.checkedToday)

    let xpToday = 0
    for (const h of checked) {
      xpToday += calcXpForCheckin(h.streak)
    }

    let bestStreak = 0
    let bestStreakName = ''
    for (const h of active) {
      if (h.streak > bestStreak) {
        bestStreak = h.streak
        bestStreakName = h.name
      }
    }
    const totalStreaks = active.reduce((s, h) => s + h.streak, 0)

    const dateStr = now.toLocaleDateString('en', {
      weekday: 'long', month: 'long', day: 'numeric'
    })

    return {
      date: dateStr,
      totalHabits: active.length,
      checkedCount: checked.length,
      pendingCount: pending.length,
      totalXP,
      xpToday,
      bestStreak,
      bestStreakName,
      totalStreaks,
      checked: checked.map(h => ({
        id: h.id, name: h.name, emoji: h.emoji,
        streak: h.streak, color: h.color, note: h.noteToday
      })),
      pending: pending.map(h => ({
        id: h.id, name: h.name, emoji: h.emoji,
        streak: h.streak, color: h.color
      }))
    }
  },

  // --- Notifications ---
  async getNotifSettings() {
    if (this.isOwner()) {
      return api('/notifications/settings')
    }
    return guestGetNotifSettings()
  },

  async saveNotifSettings(enabled, time) {
    if (this.isOwner()) {
      return api('/notifications/settings', {
        method: 'PUT',
        body: JSON.stringify({ enabled, time })
      })
    }
    guestSaveNotifSettings(enabled, time)
  }
}

// ============================================
// CORE HELPERS
// ============================================

function today() {
  return new Date().toISOString().slice(0, 10)
}

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function calculateStreak(dates, todayDate) {
  if (!dates || dates.length === 0) return 0
  const dateSet = new Set(dates)
  let streak = 0
  let checkDate = new Date(todayDate + 'T00:00:00')
  if (!dateSet.has(todayDate)) checkDate.setDate(checkDate.getDate() - 1)
  while (true) {
    const ds = checkDate.toISOString().slice(0, 10)
    if (dateSet.has(ds)) { streak++; checkDate.setDate(checkDate.getDate() - 1) }
    else break
  }
  return streak
}

function calcXpForCheckin(streak) {
  return 10 + Math.min(streak, 30)
}

function calcLevel(totalXP) {
  return Math.floor(totalXP / 100) + 1
}

function calcXpForLevel(level) {
  return (level - 1) * 100
}

function calcXpProgress(totalXP) {
  const level = calcLevel(totalXP)
  const current = totalXP - calcXpForLevel(level)
  const needed = 100
  return { level, xp: totalXP, current, needed, progress: current / needed }
}

// ============================================
// API (owner only)
// ============================================

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (accessPassword) headers['x-access-password'] = accessPassword
  const res = await fetch(`${API}${path}`, {
    headers,
    ...options
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// ============================================
// TOAST
// ============================================

function showToast(message, type = 'success') {
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  toastContainer.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transition = 'opacity 0.3s'
    setTimeout(() => toast.remove(), 300)
  }, 2000)
}

// ============================================
// XP
// ============================================

function showXpFloat(xp, x, y) {
  const el = document.createElement('div')
  el.className = 'xp-float'
  el.textContent = `+${xp} XP`
  el.style.left = x + 'px'
  el.style.top = y + 'px'
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 1000)
}

function showLevelUp(level) {
  const overlay = document.createElement('div')
  overlay.className = 'level-up-overlay'
  const emojis = ['🎉', '🏆', '💎', '👑', '🚀', '⭐', '🌟', '🔥']
  overlay.innerHTML = `
    <div class="level-up-card">
      <div class="level-up-emoji">${emojis[Math.min(level - 1, emojis.length - 1)]}</div>
      <div class="level-up-title">LEVEL UP!</div>
      <div class="level-up-sub">You reached <strong>Level ${level}</strong></div>
      <button class="level-up-btn">LET'S GO!</button>
    </div>
  `
  overlay.querySelector('.level-up-btn').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
  document.body.appendChild(overlay)
}

function renderXp(xpData) {
  if (!xpData) return
  xpState = xpData
  xpLevelBadge.textContent = `LVL ${xpData.level}`
  xpBarFill.style.width = `${Math.round(xpData.progress * 100)}%`
  xpNumbers.textContent = `${xpData.current} / ${xpData.needed} XP`
}

// ============================================
// WEEK HELPERS
// ============================================

function getWeekDays() {
  const days = []
  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    days.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en', { weekday: 'short' }).slice(0, 2).toUpperCase(),
      isToday: i === 0
    })
  }
  return days
}

// ============================================
// TIMER HELPERS
// ============================================

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function getElapsedSeconds(startTime) { return Math.floor((Date.now() - startTime) / 1000) }

function startTimerInterval(id) {
  if (timerIntervals[id]) clearInterval(timerIntervals[id])
  timerIntervals[id] = setInterval(() => {
    const habit = habits.find(h => h.id === id)
    if (!habit || !habit.timerRunning) {
      clearInterval(timerIntervals[id])
      delete timerIntervals[id]
      return
    }
    const card = document.querySelector(`[data-id="${id}"]`)
    if (card) {
      const timerEl = card.querySelector('.habit-timer-display')
      if (timerEl) {
        const elapsed = getElapsedSeconds(habit.timerRunning)
        const total = (habit.timerTotal || 0) + elapsed
        timerEl.textContent = `⏱️ ${formatDuration(total)}`
      }
    }
  }, 1000)
}

function stopTimerInterval(id) {
  if (timerIntervals[id]) { clearInterval(timerIntervals[id]); delete timerIntervals[id] }
}

// ============================================
// RENDER
// ============================================

function getFilteredHabits() {
  return [...habits].sort((a, b) => {
    if (a.checkedToday !== b.checkedToday) return a.checkedToday ? 1 : -1
    return (b.streak || 0) - (a.streak || 0)
  })
}

function render(animatingId) {
  const sorted = getFilteredHabits()

  if (sorted.length === 0) {
    habitsList.innerHTML = ''
    emptyState.classList.remove('hidden')
    emptyText.textContent = Storage.isOwner()
      ? 'Add your first habit above and start your streak!'
      : 'Add your first habit — data saves to this device.'
    weekSection.style.display = 'none'
  } else {
    emptyState.classList.add('hidden')
    weekSection.style.display = 'block'
    habitsList.innerHTML = sorted.map(h => renderHabitCard(h)).join('')
    weekGrid.innerHTML = renderWeekGrid(sorted)
  }

  const total = sorted.reduce((sum, h) => sum + (h.streak || 0), 0)
  totalStreaks.textContent = `🔥 ${total}`
  habitsCount.textContent = `${sorted.length} habit${sorted.length !== 1 ? 's' : ''}`

  sorted.forEach(h => {
    const card = document.querySelector(`[data-id="${h.id}"]`)
    if (!card) return
    card.querySelector('.btn-check')?.addEventListener('click', () => toggleCheckin(h.id))
    card.querySelector('.btn-timer')?.addEventListener('click', () => toggleTimer(h.id))
    card.querySelector('.btn-note')?.addEventListener('click', () => openNoteModal(h.id))
    card.querySelector('.btn-delete')?.addEventListener('click', () => deleteHabit(h.id))
    card.querySelector('.habit-note-indicator')?.addEventListener('click', () => openNoteModal(h.id))
  })

  if (animatingId) {
    const card = document.querySelector(`[data-id="${animatingId}"]`)
    if (card) {
      card.classList.add('just-checked')
      setTimeout(() => card.classList.remove('just-checked'), 700)
    }
  }
}

function renderHabitCard(h) {
  const weekDays = getWeekDays()
  const checked = h.checkedToday
  const dayLabels = weekDays.map(d => {
    const done = h.dates && h.dates.includes(d.date)
    let cls = 'habit-day-label'
    if (done) cls += ' done'
    if (d.isToday) cls += ' today'
    return `<span class="${cls}">${d.isToday ? '★' : (done ? '✓' : '·')}</span>`
  }).join('')

  const streakEmoji = h.streak >= 30 ? '💎' : h.streak >= 7 ? '🔥' : h.streak >= 1 ? '🔥' : '·'

  let timerDisplay = ''
  let timerClass = 'btn-timer'
  let timerIcon = '⏱️'
  if (h.timerRunning) {
    timerClass += ' running'
    timerIcon = '⏹️'
    const elapsed = getElapsedSeconds(h.timerRunning)
    const total = (h.timerTotal || 0) + elapsed
    timerDisplay = `<span class="habit-timer-display running">⏱️ ${formatDuration(total)}</span>`
  } else if (h.timerTotal > 0) {
    timerDisplay = `<span class="habit-timer-display">⏱️ ${formatDuration(h.timerTotal)}</span>`
  }

  const noteClass = `btn-note${h.noteToday ? ' has-note' : ''}`

  return `
    <div class="habit-card ${checked ? 'checked' : ''}" data-id="${h.id}">
      <div class="habit-emoji">${h.emoji}</div>
      <div class="habit-info">
        <div class="habit-name-row">
          <span class="habit-name ${checked ? 'checked-name' : ''}">${escHtml(h.name)}</span>
        </div>
        <div class="habit-meta">
          <span class="habit-streak"><span class="streak-fire">${streakEmoji}</span> ${h.streak}d</span>
          ${timerDisplay}
          <span class="habit-note-indicator${h.noteToday ? ' has-note' : ''}">${h.noteToday ? '📝' : '📄'}</span>
          <span class="habit-day-labels">${dayLabels}</span>
        </div>
      </div>
      <div class="habit-actions">
        <button class="${timerClass}" title="${h.timerRunning ? 'Stop timer' : 'Start timer'}">${timerIcon}</button>
        <button class="${noteClass}" title="${h.noteToday ? 'Edit note' : 'Add note'}">📝</button>
        <button class="btn-check ${checked ? 'done' : ''}" title="${checked ? 'Undo check-in' : 'Check in'}">${checked ? '✓' : '⬜'}</button>
        <button class="btn-delete" title="Delete habit">✕</button>
      </div>
    </div>
  `
}

function renderWeekGrid(sorted) {
  const weekDays = getWeekDays()
  return sorted.map(h => {
    const days = weekDays.map(d => {
      const done = h.dates && h.dates.includes(d.date)
      let cls = 'week-day'
      if (done) cls += ' done'
      if (d.isToday) cls += ' today'
      if (!done && !d.isToday && new Date(d.date) > new Date()) cls += ' future'
      return `<div class="${cls}"><span class="day-label">${d.label}</span>${done ? '✓' : (d.isToday ? '★' : '·')}</div>`
    }).join('')
    return `<div class="week-row"><span class="week-row-emoji">${h.emoji}</span><span class="week-row-name">${escHtml(h.name)}</span><div class="week-days">${days}</div></div>`
  }).join('')
}

function escHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// ============================================
// ACTIONS
// ============================================

let pendingDelete = null

async function toggleCheckin(id) {
  const habit = habits.find(h => h.id === id)
  if (!habit) return
  const wasChecked = habit.checkedToday

  // Optimistic update
  habit.checkedToday = !wasChecked
  if (!wasChecked) {
    habit.dates = [...(habit.dates || []), new Date().toISOString().slice(0, 10)]
  } else {
    habit.dates = (habit.dates || []).filter(d => d !== new Date().toISOString().slice(0, 10))
  }
  habit.streak = calculateStreak(habit.dates, today())
  render(id)

  try {
    if (wasChecked) {
      const data = await Storage.undoCheckin(id)
      habit.streak = calcStreak(data.dates)
      habit.dates = data.dates || habit.dates
      if (data.xp) renderXp(data.xp)
      render()
      showToast('Check-in undone')
    } else {
      const data = await Storage.checkin(id)
      habit.streak = calcStreak(data.dates)
      habit.dates = data.dates || habit.dates
      habit.noteToday = data.noteToday || null

      const prevLevel = xpState.level
      if (data.xp) renderXp(data.xp)
      render()

      const card = document.querySelector(`[data-id="${id}"]`)
      if (card && data.xpGained) {
        const rect = card.getBoundingClientRect()
        showXpFloat(data.xpGained, rect.right - 60, rect.top - 10)
      }

      if (data.xp && data.xp.level > prevLevel) {
        setTimeout(() => showLevelUp(data.xp.level), 600)
        showToast(`🎉 LEVEL UP! You're now Level ${data.xp.level}!`, 'success')
      } else {
        showToast('✓ Nice! Keep it going!')
      }
    }
  } catch (err) {
    habit.checkedToday = wasChecked
    if (wasChecked) {
      habit.dates = [...(habit.dates || []), new Date().toISOString().slice(0, 10)]
    } else {
      habit.dates = (habit.dates || []).filter(d => d !== new Date().toISOString().slice(0, 10))
    }
    habit.streak = calculateStreak(habit.dates, today())
    render()
    showToast(err.message, 'error')
  }
}

// --- Timer ---
async function toggleTimer(id) {
  const habit = habits.find(h => h.id === id)
  if (!habit) return

  if (habit.timerRunning) {
    habit.timerRunning = null
    render()
    stopTimerInterval(id)
    try {
      const data = await Storage.stopTimer(id)
      habit.timerTotal = data.total
      render()
      showToast(`⏱️ Session: ${formatDuration(data.elapsed || 0)}`)
    } catch (err) { showToast(err.message, 'error') }
  } else {
    habit.timerRunning = Date.now()
    render()
    startTimerInterval(id)
    try {
      const data = await Storage.startTimer(id)
      habit.timerRunning = data.startTime
      stopTimerInterval(id)
      startTimerInterval(id)
      showToast('⏱️ Timer started!')
    } catch (err) {
      habit.timerRunning = null; render(); showToast(err.message, 'error')
    }
  }
}

// --- Notes ---
function openNoteModal(id) {
  noteTargetId = id
  const habit = habits.find(h => h.id === id)
  if (!habit) return
  noteModalTitle.textContent = `📝 ${habit.emoji} ${escHtml(habit.name)}`
  noteInput.value = habit.noteToday || ''
  noteModal.classList.remove('hidden')
  noteInput.focus()
}

function closeNoteModal() {
  noteModal.classList.add('hidden')
  noteTargetId = null
}

async function saveNote() {
  if (!noteTargetId) return
  const text = noteInput.value.trim()
  try {
    await Storage.saveNote(noteTargetId, text)
    const habit = habits.find(h => h.id === noteTargetId)
    if (habit) {
      habit.noteToday = text || null
      render()
    }
    closeNoteModal()
    showToast(text ? '📝 Note saved!' : 'Note deleted')
  } catch (err) { showToast(err.message, 'error') }
}

async function deleteNote() {
  if (!noteTargetId) return
  noteInput.value = ''
  await saveNote()
}

// --- Delete ---
function requestDelete(id) {
  const habit = habits.find(h => h.id === id)
  if (!habit) return
  if (pendingDelete === id) {
    pendingDelete = null
    performDelete(id)
  } else {
    pendingDelete = id
    const card = document.querySelector(`[data-id="${id}"]`)
    if (card) {
      card.style.borderColor = '#FF3366'
      card.style.boxShadow = '6px 6px 0 #FF3366'
      card.style.transform = 'translate(-2px, -2px)'
    }
    showToast(`Tap ✕ again to delete "${habit.name}"`, 'error')
    setTimeout(() => {
      pendingDelete = null
      const card = document.querySelector(`[data-id="${id}"]`)
      if (card) { card.style.borderColor = ''; card.style.boxShadow = ''; card.style.transform = '' }
    }, 3000)
  }
}

async function performDelete(id) {
  const habit = habits.find(h => h.id === id)
  if (!habit) return
  stopTimerInterval(id)
  const idx = habits.indexOf(habit)
  habits.splice(idx, 1); render()
  showToast(`Deleted "${habit.name}"`)
  try { await Storage.deleteHabit(id) }
  catch (err) { habits.splice(idx, 0, habit); render(); showToast(err.message, 'error') }
}

function deleteHabit(id) { requestDelete(id) }

// --- Digest ---
function openDigestModal() {
  digestModal.classList.remove('hidden')
  digestContent.innerHTML = '<div class="loading-state">LOADING...</div>'
  loadDigest()
}

function closeDigestModal() {
  digestModal.classList.add('hidden')
}

async function loadDigest() {
  try {
    const d = await Storage.getDigest()
    digestContent.innerHTML = renderDigest(d)
  } catch (err) {
    digestContent.innerHTML = `<div class="digest-empty">Failed to load digest</div>`
  }
}

function renderDigest(d) {
  const checkedItems = d.checked.map(h => `
    <div class="digest-item">
      <span class="digest-item-emoji">${h.emoji}</span>
      <span class="digest-item-name">${escHtml(h.name)}</span>
      <span class="digest-item-streak">🔥 ${h.streak}d</span>
      ${h.note ? `<span class="digest-item-note">📝 ${escHtml(h.note.substring(0, 50))}</span>` : ''}
    </div>
  `).join('')

  const pendingItems = d.pending.map(h => `
    <div class="digest-item pending">
      <span class="digest-item-emoji">${h.emoji}</span>
      <span class="digest-item-name">${escHtml(h.name)}</span>
      <span class="digest-item-streak">🔥 ${h.streak}d</span>
    </div>
  `).join('')

  const streakColor = d.totalStreaks >= 30 ? 'green' : d.totalStreaks >= 10 ? 'orange' : 'pink'

  return `
    <div class="digest-header">
      <span style="font-size:20px;font-weight:700">📋 Today</span>
      <span class="digest-date">${escHtml(d.date)}</span>
    </div>
    <div class="digest-stats-row">
      <div class="digest-stat">
        <div class="digest-stat-value green">${d.checkedCount}</div>
        <div class="digest-stat-label">Done</div>
      </div>
      <div class="digest-stat">
        <div class="digest-stat-value pink">${d.pendingCount}</div>
        <div class="digest-stat-label">Pending</div>
      </div>
      <div class="digest-stat">
        <div class="digest-stat-value purple">+${d.xpToday}</div>
        <div class="digest-stat-label">XP Today</div>
      </div>
      <div class="digest-stat">
        <div class="digest-stat-value ${streakColor}">${d.totalStreaks}</div>
        <div class="digest-stat-label">Streaks</div>
      </div>
    </div>

    <div class="digest-section-title">
      ✅ Completed
      <span class="count-badge" style="background:var(--green)">${d.checkedCount}</span>
    </div>
    ${d.checkedCount > 0 ? `<div class="digest-list">${checkedItems}</div>` : '<div class="digest-empty">Nothing checked in yet today</div>'}

    <div class="digest-section-title">
      ⏳ Pending
      <span class="count-badge" style="background:var(--red);color:var(--bg-raise)">${d.pendingCount}</span>
    </div>
    ${d.pendingCount > 0 ? `<div class="digest-list">${pendingItems}</div>` : '<div class="digest-empty" style="border-color:var(--green)">🎉 All done! Great work today!</div>'}

    ${d.bestStreak > 0 ? `
    <div style="margin-top:12px;padding:12px;background:var(--bg);border:var(--border-w) solid var(--border);border-radius:var(--radius);text-align:center">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted)">Best Streak</span>
      <div style="font-size:22px;font-weight:700;color:var(--orange);margin-top:2px">🔥 ${d.bestStreak}d</div>
      <div style="font-size:13px;font-weight:700;color:var(--muted)">${escHtml(d.bestStreakName)}</div>
    </div>
    ` : ''}
  `
}

// --- Stats ---
function openStatsModal() {
  statsModal.classList.remove('hidden')
  statsGrid.innerHTML = '<div class="loading-state" style="grid-column:span 2">LOADING...</div>'
  loadStats()
}

function closeStatsModal() {
  statsModal.classList.add('hidden')
}

async function loadStats() {
  try {
    const data = await Storage.getStats()
    statsGrid.innerHTML = renderStats(data)
  } catch (err) {
    statsGrid.innerHTML = `<div class="stat-card span-2" style="grid-column:span 2;text-align:center;padding:20px"><span class="stat-label">Error loading stats</span></div>`
  }
}

function renderStats(d) {
  return `
    <div class="stat-card">
      <span class="stat-label">Total Habits</span>
      <span class="stat-value purple">${d.totalHabits}</span>
      <span class="stat-sub">${d.totalHabits} total</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Total XP</span>
      <span class="stat-value green">${d.totalXP}</span>
      <span class="stat-sub">~${d.weekXp} XP this week</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Best Streak</span>
      <span class="stat-value orange">${d.bestStreak}d</span>
      <span class="stat-sub">${escHtml(d.bestStreakName || '—')}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Weekly Completion</span>
      <span class="stat-value ${d.completionRate >= 70 ? 'green' : d.completionRate >= 40 ? 'yellow' : 'pink'}">${d.completionRate}%</span>
      <span class="stat-sub">${d.weekCheckins} / ${d.weekTotalDays} check-ins</span>
    </div>
    <div class="stat-card span-2">
      <span class="stat-label">This Week</span>
      <div class="stat-bars">
        ${d.weekDates.map((date, i) => {
          const max = Math.max(...d.weekDailyCounts, 1)
          const height = Math.max(4, Math.round((d.weekDailyCounts[i] / max) * 100))
          return `<div class="stat-bar-wrap"><div class="stat-bar" style="height:${height}%"></div><span class="stat-bar-label">${d.weekDates[i].slice(5)}</span></div>`
        }).join('')}
      </div>
    </div>
    <div class="stat-card span-2">
      <span class="stat-label">Habits</span>
      <span class="stat-sub" style="margin-top:8px;display:block">Create habits and check in daily to build streaks!</span>
    </div>
  `
}

// --- Add Habit ---
async function addHabit() {
  const name = habitInput.value.trim()
  if (!name) { habitInput.focus(); showToast('Enter a habit name', 'error'); return }

  const emoji = document.querySelector('.emoji-option.selected')?.dataset.emoji || '✅'
  const colors = ['#FF3366', '#00FF88', '#00D4FF', '#FFD700', '#FF6B35', '#9933FF']
  const color = colors[Math.floor(Math.random() * colors.length)]

  const tempId = 'temp-' + Date.now()
  habits.push({
    id: tempId, name, emoji, color,
    streak: 0, checkedToday: false, dates: [],
    timerRunning: null, timerTotal: 0, noteToday: null,
    created_at: new Date().toISOString()
  })
  habitInput.value = ''; habitInput.focus()
  render()
  showToast(`Added "${name}"`)

  try {
    const data = await Storage.addHabit(name, emoji, color)
    const idx = habits.findIndex(h => h.id === tempId)
    if (idx !== -1) {
      habits[idx] = { ...data, dates: [], timerRunning: null, timerTotal: 0, noteToday: null }
      render()
    }
  } catch (err) {
    const idx = habits.findIndex(h => h.id === tempId)
    if (idx !== -1) { habits.splice(idx, 1); render() }
    showToast(err.message, 'error')
  }
}

// --- Emoji Picker ---
function initEmojiPicker() {
  const picker = document.getElementById('emojiPicker')
  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.emoji-option')
    if (!btn) return
    picker.querySelectorAll('.emoji-option').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
  })
}

// --- Keyboard ---
function initKeyboard() {
  habitInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addHabit() }
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.target.matches('input, textarea')) {
      e.preventDefault(); habitInput.focus()
    }
    if (e.key === 'Escape') {
      if (!digestModal.classList.contains('hidden')) closeDigestModal()
      if (!statsModal.classList.contains('hidden')) closeStatsModal()
      if (!noteModal.classList.contains('hidden')) closeNoteModal()
      if (!notifModal.classList.contains('hidden')) closeNotifModal()
      // Close owner login modal on Escape
      const loginOverlay = document.getElementById('ownerLoginOverlay')
      if (loginOverlay) loginOverlay.remove()
    }
  })
}

// --- Theme ---
let currentTheme = localStorage.getItem('habby-theme') || 'light'

const themeDefs = [
  { id: 'light', label: 'Light', emoji: '☀️' },
  { id: 'dark', label: 'Dark', emoji: '🌙' }
]

function applyTheme(themeId) {
  currentTheme = themeId
  document.documentElement.setAttribute('data-theme', themeId)
  localStorage.setItem('habby-theme', themeId)
}

function openThemeModal() {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-card" style="width:320px">
      <div class="modal-header">
        <span class="modal-title">🎨 Theme</span>
        <button class="modal-close" id="themeModalClose">✕</button>
      </div>
      <div class="theme-grid">
        ${themeDefs.map(t => `
          <button class="theme-opt ${currentTheme === t.id ? 'active' : ''}" data-theme-id="${t.id}">
            ${t.emoji}
            <span>${t.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  overlay.querySelectorAll('.theme-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeId)
      overlay.remove()
    })
  })

  overlay.querySelector('#themeModalClose').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
}

// ============================================
// NOTIFICATIONS
// ============================================

let notifEnabled = false
let notifReminderTime = '09:00'

async function loadNotifSettings() {
  try {
    const data = await Storage.getNotifSettings()
    notifEnabled = data.enabled
    notifReminderTime = data.time || '09:00'
    notifTime.value = notifReminderTime
    notifToggle.classList.toggle('on', notifEnabled)
    if (notifEnabled) startReminderCheck()
  } catch (e) { /* ignore */ }
}

async function saveNotifSettings() {
  try {
    await Storage.saveNotifSettings(notifEnabled, notifReminderTime)
    if (notifEnabled) startReminderCheck()
    else stopReminderCheck()
  } catch (e) { /* ignore */ }
}

function startReminderCheck() {
  stopReminderCheck()
  reminderInterval = setInterval(() => {
    if (!notifEnabled) return
    const now = new Date()
    const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    if (current === notifReminderTime) {
      const unchecked = habits.filter(h => !h.checkedToday)
      if (unchecked.length > 0) {
        showBrowserNotification('⏰ Habby Reminder', `${unchecked.length} habit${unchecked.length > 1 ? 's' : ''} to check in today!`)
      }
    }
  }, 30000)
}

function stopReminderCheck() {
  if (reminderInterval) { clearInterval(reminderInterval); reminderInterval = null }
}

function showBrowserNotification(title, body) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification(title, { body, icon: '/favicon.ico' })
    })
  }
}

function openNotifModal() {
  notifToggle.classList.toggle('on', notifEnabled)
  notifTime.value = notifReminderTime
  notifModal.classList.remove('hidden')
}

function closeNotifModal() {
  notifModal.classList.add('hidden')
}

function toggleNotif() {
  notifEnabled = !notifEnabled
  notifToggle.classList.toggle('on', notifEnabled)
  saveNotifSettings()
}

// ============================================
// SERVICE WORKER
// ============================================

async function registerSw() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js')
      console.log('📦 SW registered')
    } catch (e) {
      console.log('SW registration skipped:', e.message)
    }
  }
}

// ============================================
// LOAD HABITS
// ============================================

async function loadHabits() {
  habitsList.innerHTML = '<div class="loading-state">LOADING...</div>'

  try {
    const data = await Storage.getHabits()
    habits = (data.habits || []).map(h => ({
      ...h,
      streak: h.streak || calculateStreak(h.dates || [], today()),
      timerRunning: h.timerRunning || null,
      timerTotal: h.timerTotal || 0,
      noteToday: h.noteToday || null
    }))
    if (data.xp) renderXp(data.xp)
    Object.keys(timerIntervals).forEach(k => stopTimerInterval(k))
    habits.forEach(h => { if (h.timerRunning) startTimerInterval(h.id) })
  } catch (err) {
    showToast('Failed to load habits', 'error')
    habits = []
  }

  render()
}

// ============================================
// OWNER LOGIN (hidden shortcut)
// ============================================

let logoTapCount = 0
let logoTapTimer = null

function setupLogoShortcut() {
  const logo = document.querySelector('.header-logo')
  if (!logo) return

  logo.addEventListener('click', () => {
    logoTapCount++
    clearTimeout(logoTapTimer)
    logoTapTimer = setTimeout(() => { logoTapCount = 0 }, 1200)

    if (logoTapCount >= 3) {
      logoTapCount = 0
      clearTimeout(logoTapTimer)
      openOwnerLoginModal()
    }
  })
}

function openOwnerLoginModal() {
  // Don't open if already logged in
  if (Storage.isOwner()) return

  // Remove existing overlay if any
  const existing = document.getElementById('ownerLoginOverlay')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.id = 'ownerLoginOverlay'
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal-card" style="width:360px">
      <div class="modal-header">
        <span class="modal-title">🔐 Owner Access</span>
        <button class="modal-close" id="ownerLoginClose">✕</button>
      </div>
      <div class="terminal-line" style="justify-content:flex-start;padding:0;margin-bottom:12px">
        <span class="seg-user">habby</span>
        <span class="seg-at">@</span>
        <span class="seg-cmd">mcky</span>
        <span class="seg-dollar">$</span>
        <input type="password" id="ownerLoginInput" class="pw-input" placeholder="password" autocomplete="off" />
      </div>
      <button id="ownerLoginBtn" class="btn-modal primary" style="width:100%">UNLOCK</button>
      <div class="login-error hidden" id="ownerLoginError">// wrong password</div>
    </div>
  `
  document.body.appendChild(overlay)

  const ownerInput = document.getElementById('ownerLoginInput')
  const ownerBtn = document.getElementById('ownerLoginBtn')
  const ownerError = document.getElementById('ownerLoginError')

  ownerInput.focus()
  ownerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ownerBtn.click()
  })

  ownerBtn.addEventListener('click', async () => {
    const password = ownerInput.value.trim()
    if (!password) return
    ownerBtn.disabled = true
    ownerBtn.textContent = '...'
    ownerError.classList.add('hidden')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      if (!res.ok) {
        ownerError.classList.remove('hidden')
        ownerBtn.disabled = false
        ownerBtn.textContent = 'UNLOCK'
        return
      }
      // Login success — discard guest data, switch to owner mode
      clearGuestData()
      accessPassword = password
      localStorage.setItem('habby-password', password)
      overlay.remove()
      showToast('🔓 Owner mode — loading server data')
      loadHabits()
      loadNotifSettings()
    } catch (err) {
      ownerError.classList.remove('hidden')
      ownerBtn.disabled = false
      ownerBtn.textContent = 'UNLOCK'
    }
  })

  document.getElementById('ownerLoginClose').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
}

function clearGuestData() {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('habby:')) keys.push(k)
  }
  keys.forEach(k => localStorage.removeItem(k))
}

// ============================================
// LOGOUT
// ============================================

function doLogout() {
  accessPassword = ''
  localStorage.removeItem('habby-password')
  Object.keys(timerIntervals).forEach(k => stopTimerInterval(k))
  if (reminderInterval) { clearInterval(reminderInterval); reminderInterval = null }
  habits = []
  xpState = { level: 1, xp: 0, current: 0, needed: 100, progress: 0 }
  showToast('🔒 Back to local mode')
  loadHabits()
  loadNotifSettings()
}

// ============================================
// INIT
// ============================================

function initApp() {
  initEmojiPicker()
  initKeyboard()

  // Digest modal
  digestBtn.addEventListener('click', openDigestModal)
  digestModalClose.addEventListener('click', closeDigestModal)
  digestModal.addEventListener('click', (e) => { if (e.target === digestModal) closeDigestModal() })

  // Stats modal
  statsBtn.addEventListener('click', openStatsModal)
  statsModalClose.addEventListener('click', closeStatsModal)
  statsModal.addEventListener('click', (e) => { if (e.target === statsModal) closeStatsModal() })

  // Note modal
  noteSaveBtn.addEventListener('click', saveNote)
  noteDeleteBtn.addEventListener('click', deleteNote)
  noteModalClose.addEventListener('click', closeNoteModal)
  noteModal.addEventListener('click', (e) => { if (e.target === noteModal) closeNoteModal() })

  // Logout
  const logoutBtn = document.getElementById('logoutBtn')
  if (logoutBtn) logoutBtn.addEventListener('click', doLogout)

  // Theme picker
  const themeBtn = document.getElementById('themeBtn')
  if (themeBtn) themeBtn.addEventListener('click', openThemeModal)

  // Notification modal
  notifBtn.addEventListener('click', openNotifModal)
  notifModalClose.addEventListener('click', closeNotifModal)
  notifModal.addEventListener('click', (e) => { if (e.target === notifModal) closeNotifModal() })
  notifToggle.addEventListener('click', toggleNotif)
  notifTime.addEventListener('change', () => {
    notifReminderTime = notifTime.value
    saveNotifSettings()
  })
  notifTestBtn.addEventListener('click', () => {
    showBrowserNotification('🔔 Habby', 'This is a test notification!')
  })

  // Logo triple-tap for owner login
  setupLogoShortcut()

  registerSw()
  applyTheme(currentTheme)
  loadNotifSettings()
  loadHabits()
}

function init() {
  // Always go straight to the app — no login gate
  appEl.classList.remove('hidden')
  initApp()
}

document.addEventListener('DOMContentLoaded', init)
