// ============================================
// HABBY — Todos & XP
// Public localStorage mode + Owner Redis mode
// ============================================

import { calcXpForTask, calcLevel, calcXpForLevel, calcXpProgress } from '../lib/logic.js'

const API = '/api'
let todos = []
let xpState = { level: 1, xp: 0, current: 0, needed: 100, progress: 0 }
let currentFilter = 'all'
let pendingDelete = null
let reminderInterval = null
let accessPassword = localStorage.getItem('habby-password') || ''

// DOM refs
const $ = sel => document.querySelector(sel)

const appEl = $('#app')

const todosList = $('#todosList')
const emptyState = $('#emptyState')
const emptyTitle = $('#emptyTitle')
const emptyText = $('#emptyText')
const emptyCta = $('#emptyCta')
const listTitle = $('#listTitle')
const todosCount = $('#todosCount')
const openBadge = $('#openBadge')
const countToday = $('#countToday')
const countDone = $('#countDone')
const todoInput = $('#todoInput')
const addBtn = $('#addTodoBtn')
const prioritySelect = $('#prioritySelect')
const dueDateInput = $('#dueDateInput')
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

function guestGetTodos() {
  return guestGet('todos') || []
}

function guestSaveTodos(list) {
  guestSet('todos', list)
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

  // --- Todos ---
  async getTodos() {
    if (this.isOwner()) {
      return api('/todos')
    }
    const list = guestGetTodos()
    const xp = guestGetXp()
    return { todos: list, xp: calcXpProgress(xp) }
  },

  async addTodo(name, emoji, priority, dueDate) {
    if (this.isOwner()) {
      return api('/todos', {
        method: 'POST',
        body: JSON.stringify({ name, emoji, priority, dueDate })
      })
    }
    const todo = {
      id: randomId(), name, emoji, priority, dueDate,
      completed: false, completedAt: null, xpEarned: 0,
      created_at: new Date().toISOString()
    }
    const list = guestGetTodos()
    list.push(todo)
    guestSaveTodos(list)
    return todo
  },

  async toggleComplete(id) {
    if (this.isOwner()) {
      const todo = todos.find(t => t.id === id)
      const method = todo && todo.completed ? 'DELETE' : 'POST'
      return api(`/todos/${id}/complete`, { method })
    }
    const list = guestGetTodos()
    const todo = list.find(t => t.id === id)
    if (!todo) return null

    if (todo.completed) {
      const xpLost = todo.xpEarned || 0
      todo.completed = false
      todo.completedAt = null
      todo.xpEarned = 0
      const xp = Math.max(0, guestGetXp() - xpLost)
      guestSaveXp(xp)
      guestSaveTodos(list)
      return { xpGained: 0, xpLost, xp: calcXpProgress(xp), todo: { ...todo } }
    } else {
      const xpGained = calcXpForTask(todo.priority)
      todo.completed = true
      todo.completedAt = today()
      todo.xpEarned = xpGained
      const xp = guestGetXp() + xpGained
      guestSaveXp(xp)
      guestSaveTodos(list)
      return { xpGained, xpLost: 0, xp: calcXpProgress(xp), todo: { ...todo } }
    }
  },

  async deleteTodo(id) {
    if (this.isOwner()) {
      return api(`/todos/${id}`, { method: 'DELETE' })
    }
    const list = guestGetTodos()
    const todo = list.find(t => t.id === id)
    if (!todo) return
    const idx = list.indexOf(todo)
    list.splice(idx, 1)
    guestSaveTodos(list)
    if (todo.completed && todo.xpEarned) {
      const xp = Math.max(0, guestGetXp() - todo.xpEarned)
      guestSaveXp(xp)
      renderXp(calcXpProgress(xp))
    }
  },

  // --- Stats ---
  async getStats() {
    if (this.isOwner()) {
      return api('/stats')
    }
    const list = guestGetTodos()
    const totalXP = guestGetXp()
    const now = new Date()
    const todayStr = today()
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
    const overdue = active.filter(t => t.dueDate && t.dueDate < todayStr)
    const dueToday = active.filter(t => t.dueDate === todayStr)

    const weekDailyCounts = weekDates.map(() => 0)
    let weekXP = 0
    for (const t of completed) {
      if (t.completedAt && t.completedAt >= weekDates[0]) {
        const idx = weekDates.indexOf(t.completedAt)
        if (idx !== -1) weekDailyCounts[idx]++
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
      weekXP,
      weekDailyCounts,
      weekDates
    }
  },

  // --- Digest ---
  async getDigest() {
    if (this.isOwner()) {
      return api('/digest')
    }
    const list = guestGetTodos()
    const totalXP = guestGetXp()
    const now = new Date()
    const todayStr = today()

    const active = list.filter(t => !t.completed)
    const dueToday = active.filter(t => t.dueDate === todayStr)
    const overdue = active.filter(t => t.dueDate && t.dueDate < todayStr)
    const completedToday = list.filter(t => t.completed && t.completedAt === todayStr)

    let xpToday = 0
    for (const t of completedToday) {
      xpToday += t.xpEarned || 0
    }

    const dateStr = now.toLocaleDateString('en', {
      weekday: 'long', month: 'long', day: 'numeric'
    })

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
  const emojis = ['🏆', '🏆', '💎', '👑', '🔥', '⭐', '🌟', '🚀']
  overlay.innerHTML = `
    <div class="level-up-card">
      <div class="level-up-sparkles"></div>
      <div class="level-up-emoji">${emojis[Math.min(level - 1, emojis.length - 1)]}</div>
      <div class="level-up-title">LEVEL UP!</div>
      <div class="level-up-sub">You reached <strong>Level ${level}</strong></div>
    </div>
  `
  document.body.appendChild(overlay)
  overlay.addEventListener('click', () => overlay.remove())
  setTimeout(() => {
    if (overlay.parentNode) overlay.remove()
  }, 1600)
}

function renderXp(xp) {
  xpState = xp
  xpLevelBadge.textContent = `LVL ${xp.level}`
  xpBarFill.style.width = `${Math.round(xp.progress * 100)}%`
  xpNumbers.textContent = `${xp.current} / ${xp.needed} XP`
}

// ============================================
// FILTERS
// ============================================

const FILTERS = ['all', 'today', 'upcoming', 'done']
const FILTER_TITLES = { all: 'ALL TASKS', today: 'TODAY', upcoming: 'UPCOMING', done: 'DONE' }

function todoIsToday(t) {
  return t.dueDate && t.dueDate <= today()
}

function getFilteredTodos() {
  const now = today()
  let list = [...todos]
  if (currentFilter === 'today') {
    list = list.filter(t => !t.completed && t.dueDate && t.dueDate <= now)
  } else if (currentFilter === 'upcoming') {
    list = list.filter(t => !t.completed && (!t.dueDate || t.dueDate > now))
  } else if (currentFilter === 'done') {
    list = list.filter(t => t.completed)
  }
  const prio = { high: 0, medium: 1, low: 2 }
  return list.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    if (a.completed) return (b.completedAt || '') < (a.completedAt || '') ? 1 : -1
    if (a.priority !== b.priority) return (prio[a.priority] ?? 2) - (prio[b.priority] ?? 2)
    const ad = a.dueDate || '9999'
    const bd = b.dueDate || '9999'
    if (ad !== bd) return ad < bd ? -1 : 1
    return (b.created_at || '') < (a.created_at || '') ? -1 : 1
  })
}

function setFilter(filter) {
  currentFilter = filter
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === filter)
  })
  render()
}

// ============================================
// RENDER
// ============================================

function render(animatingId) {
  const filtered = getFilteredTodos()
  const activeCount = todos.filter(t => !t.completed).length
  const doneCount = todos.filter(t => t.completed).length
  const todayCount = todos.filter(t => !t.completed && t.dueDate && t.dueDate <= today()).length

  listTitle.textContent = FILTER_TITLES[currentFilter]
  todosCount.textContent = `${filtered.length} task${filtered.length !== 1 ? 's' : ''}`
  openBadge.textContent = `📌 ${activeCount}`
  countToday.textContent = todayCount
  countDone.textContent = doneCount

  if (filtered.length === 0) {
    todosList.innerHTML = ''
    emptyState.classList.remove('hidden')
    const empties = {
      all: { t: 'All clear!', d: Storage.isOwner() ? 'Add your first task above and start earning XP.' : 'Add your first task — data saves to this device.' },
      today: { t: 'Nothing due today', d: 'Sit back or add a task with a due date.' },
      upcoming: { t: 'No upcoming tasks', d: 'Tasks without a due date land here.' },
      done: { t: 'Nothing done yet', d: 'Complete a task to see it here and bank the XP.' }
    }
    emptyTitle.textContent = empties[currentFilter].t
    emptyText.textContent = empties[currentFilter].d
  } else {
    emptyState.classList.add('hidden')
    todosList.innerHTML = filtered.map(t => renderTodoCard(t)).join('')
  }

  filtered.forEach(t => {
    const card = document.querySelector(`[data-id="${t.id}"]`)
    if (!card) return
    card.querySelector('.btn-check')?.addEventListener('click', () => toggleComplete(t.id))
    card.querySelector('.btn-delete')?.addEventListener('click', () => requestDelete(t.id))
  })

  if (animatingId) {
    const card = document.querySelector(`[data-id="${animatingId}"]`)
    if (card) {
      card.classList.add('just-checked')
      setTimeout(() => card.classList.remove('just-checked'), 700)
    }
  }
}

function dueLabel(t) {
  const now = today()
  const d = t.dueDate
  if (!d) return ''
  if (t.completed) return `<span class="due-chip done">${escHtml(d.slice(5))}</span>`
  if (d < now) {
    const days = Math.round((new Date(now) - new Date(d)) / 86400000)
    return `<span class="due-chip overdue">⚠ ${days === 0 ? 'OVERDUE' : `${days}d OVERDUE`}</span>`
  }
  if (d === now) return `<span class="due-chip today">TODAY</span>`
  const days = Math.round((new Date(d) - new Date(now)) / 86400000)
  return `<span class="due-chip">${days === 1 ? 'TOMORROW' : `IN ${days}d`} · ${escHtml(d.slice(5))}</span>`
}

function renderTodoCard(t) {
  const checked = t.completed
  const prio = t.priority || 'medium'
  const prioLabel = { high: 'HIGH', medium: 'MED', low: 'LOW' }
  return `
    <div class="todo-card ${checked ? 'checked' : ''} prio-${prio}" data-id="${t.id}">
      <button class="btn-check ${checked ? 'done' : ''}" title="${checked ? 'Mark not done' : 'Complete task'}">${checked ? '✓' : ''}</button>
      <div class="todo-info">
        <div class="todo-name-row">
          <span class="todo-emoji">${escHtml(t.emoji || '✅')}</span>
          <span class="todo-name ${checked ? 'checked-name' : ''}">${escHtml(t.name)}</span>
        </div>
        <div class="todo-meta">
          <span class="prio-badge ${prio}">${prioLabel[prio]}</span>
          ${dueLabel(t)}
          ${checked ? `<span class="xp-chip">+${t.xpEarned || 0} XP</span>` : ''}
        </div>
      </div>
      <div class="todo-actions">
        <button class="btn-delete" title="Delete task">✕</button>
      </div>
    </div>
  `
}

function escHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// ============================================
// ACTIONS
// ============================================

async function toggleComplete(id) {
  const todo = todos.find(t => t.id === id)
  if (!todo) return
  const wasCompleted = todo.completed
  const prevXp = xpState.xp
  const prevLevel = xpState.level

  // Optimistic update
  if (!wasCompleted) {
    todo.completed = true
    todo.completedAt = today()
    todo.xpEarned = calcXpForTask(todo.priority)
    xpState = calcXpProgress(xpState.xp + todo.xpEarned)
  } else {
    const xpLost = todo.xpEarned || 0
    todo.completed = false
    todo.completedAt = null
    todo.xpEarned = 0
    xpState = calcXpProgress(Math.max(0, xpState.xp - xpLost))
  }
  renderXp(xpState)
  render(id)

  try {
    const data = await Storage.toggleComplete(id)
    const idx = todos.findIndex(t => t.id === id)
    if (idx !== -1 && data && data.todo) todos[idx] = { ...todos[idx], ...data.todo }
    if (data && data.xp) renderXp(data.xp)
    render()

    const card = document.querySelector(`[data-id="${id}"]`)
    if (!wasCompleted && data && data.xpGained && card) {
      const rect = card.getBoundingClientRect()
      showXpFloat(data.xpGained, rect.right - 60, rect.top - 10)
    }

    if (!wasCompleted && data && data.xp && data.xp.level > prevLevel) {
      setTimeout(() => showLevelUp(data.xp.level), 600)
      showToast(`🎉 LEVEL UP! You're now Level ${data.xp.level}!`, 'success')
    } else if (wasCompleted) {
      showToast('Task marked not done')
    } else {
      showToast('✓ Nice! Keep it going!')
    }
  } catch (err) {
    // Rollback
    todo.completed = wasCompleted
    todo.completedAt = wasCompleted ? today() : null
    todo.xpEarned = wasCompleted ? calcXpForTask(todo.priority) : 0
    xpState = calcXpProgress(prevXp)
    renderXp(xpState)
    render()
    showToast(err.message, 'error')
  }
}

// --- Delete ---
function requestDelete(id) {
  const todo = todos.find(t => t.id === id)
  if (!todo) return
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
    showToast(`Tap ✕ again to delete "${todo.name}"`, 'error')
    setTimeout(() => {
      pendingDelete = null
      const card = document.querySelector(`[data-id="${id}"]`)
      if (card) { card.style.borderColor = ''; card.style.boxShadow = ''; card.style.transform = '' }
    }, 3000)
  }
}

async function performDelete(id) {
  const todo = todos.find(t => t.id === id)
  if (!todo) return
  const idx = todos.indexOf(todo)
  todos.splice(idx, 1)
  render()
  showToast(`Deleted "${todo.name}"`)
  try { await Storage.deleteTodo(id) }
  catch (err) { todos.splice(idx, 0, todo); render(); showToast(err.message, 'error') }
}

// --- Digest ---
function openDigestModal() {
  digestModal.classList.remove('hidden')
  digestContent.innerHTML = '<div class="skel skel-line"></div><div class="skel skel-line short"></div><div class="skel skel-line tiny"></div>'
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
  const prioEmoji = { high: '🔴', medium: '🟡', low: '🟢' }

  const dueItems = d.dueToday.map(t => `
    <div class="digest-item">
      <span class="digest-item-emoji">${t.emoji}</span>
      <span class="digest-item-name">${escHtml(t.name)}</span>
      <span class="prio-badge ${t.priority}">${(t.priority || 'medium').toUpperCase()}</span>
    </div>
  `).join('')

  const overdueItems = d.overdue.map(t => `
    <div class="digest-item">
      <span class="digest-item-emoji">${t.emoji}</span>
      <span class="digest-item-name">${escHtml(t.name)}</span>
      <span class="digest-item-note">⚠ ${escHtml(t.dueDate)}</span>
    </div>
  `).join('')

  const doneItems = d.completedToday.map(t => `
    <div class="digest-item">
      <span class="digest-item-emoji">${t.emoji}</span>
      <span class="digest-item-name">${escHtml(t.name)}</span>
      <span class="digest-item-note">✓</span>
    </div>
  `).join('')

  return `
    <div class="digest-header">
      <span style="font-size:20px;font-weight:700">📋 Today</span>
      <span class="digest-date">${escHtml(d.date)}</span>
    </div>
    <div class="digest-stats-row">
      <div class="digest-stat">
        <div class="digest-stat-value green">${d.completedTodayCount}</div>
        <div class="digest-stat-label">Done</div>
      </div>
      <div class="digest-stat">
        <div class="digest-stat-value pink">${d.openCount}</div>
        <div class="digest-stat-label">Open</div>
      </div>
      <div class="digest-stat">
        <div class="digest-stat-value yellow">+${d.xpToday}</div>
        <div class="digest-stat-label">XP Today</div>
      </div>
      <div class="digest-stat">
        <div class="digest-stat-value red">${d.overdueCount}</div>
        <div class="digest-stat-label">Overdue</div>
      </div>
    </div>

    <div class="digest-section-title">
      🔴 Due Today
      <span class="count-badge" style="background:var(--red);color:var(--bg-raise)">${d.dueTodayCount}</span>
    </div>
    ${d.dueTodayCount > 0 ? `<div class="digest-list">${dueItems}</div>` : '<div class="digest-empty">Nothing due today 🎉</div>'}

    <div class="digest-section-title">
      ⚠️ Overdue
      <span class="count-badge" style="background:var(--red);color:var(--bg-raise)">${d.overdueCount}</span>
    </div>
    ${d.overdueCount > 0 ? `<div class="digest-list">${overdueItems}</div>` : '<div class="digest-empty">No overdue tasks</div>'}

    <div class="digest-section-title">
      ✅ Completed Today
      <span class="count-badge" style="background:var(--green)">${d.completedTodayCount}</span>
    </div>
    ${d.completedTodayCount > 0 ? `<div class="digest-list">${doneItems}</div>` : '<div class="digest-empty">Nothing completed yet today</div>'}
  `
}

// --- Stats ---
function openStatsModal() {
  statsModal.classList.remove('hidden')
  statsGrid.innerHTML = '<div class="skel-stats"><div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div></div>'
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
    statsGrid.innerHTML = `<div class="stat-card span-2 stat-error"><span class="stat-label">Error loading stats</span></div>`
  }
}

function renderStats(d) {
  return `
    <div class="stat-card">
      <span class="stat-label">Total Tasks</span>
      <span class="stat-value">${d.totalTodos}</span>
      <span class="stat-sub">${d.activeTodos} open</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Total XP</span>
      <span class="stat-value green">${d.totalXP}</span>
      <span class="stat-sub">+${d.weekXP} XP this week</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Completed</span>
      <span class="stat-value green">${d.completedTodos}</span>
      <span class="stat-sub">${d.completionRate}% done</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Overdue</span>
      <span class="stat-value ${d.overdueCount > 0 ? 'red' : 'green'}">${d.overdueCount}</span>
      <span class="stat-sub">${d.dueTodayCount} due today</span>
    </div>
    <div class="stat-card span-2">
      <span class="stat-label">This Week</span>
      <div class="stat-bars">
        ${d.weekDates.map((date, i) => {
          const max = Math.max(...d.weekDailyCounts, 1)
          const height = Math.max(4, Math.round((d.weekDailyCounts[i] / max) * 100))
          return `<div class="stat-bar-wrap"><div class="stat-bar" style="height:${height}%"></div><span class="stat-bar-label">${date.slice(5)}</span></div>`
        }).join('')}
      </div>
    </div>
    <div class="stat-card span-2">
      <span class="stat-label">XP</span>
      <span class="stat-sub" style="margin-top:8px;display:block">Complete tasks to earn XP — HIGH +25, MED +15, LOW +10. 100 XP per level!</span>
    </div>
  `
}

// --- Add Task ---
async function addTodo() {
  const name = todoInput.value.trim()
  if (!name) { todoInput.focus(); showToast('Enter a task name', 'error'); return }

  const emoji = document.querySelector('.emoji-option.selected')?.dataset.emoji || '✅'
  const priority = prioritySelect.value || 'medium'
  const dueDate = dueDateInput.value || null

  const tempId = 'temp-' + Date.now()
  todos.push({
    id: tempId, name, emoji, priority, dueDate,
    completed: false, completedAt: null, xpEarned: 0,
    created_at: new Date().toISOString()
  })
  todoInput.value = ''
  todoInput.focus()
  render()
  showToast(`Added "${name}"`)

  try {
    const data = await Storage.addTodo(name, emoji, priority, dueDate)
    const idx = todos.findIndex(t => t.id === tempId)
    if (idx !== -1) {
      todos[idx] = { ...todos[idx], ...data }
      render()
    }
  } catch (err) {
    const idx = todos.findIndex(t => t.id === tempId)
    if (idx !== -1) { todos.splice(idx, 1); render() }
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
  todoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTodo() }
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.target.matches('input, textarea, select')) {
      e.preventDefault(); todoInput.focus()
    }
    if (e.key === 'Escape') {
      if (!digestModal.classList.contains('hidden')) closeDigestModal()
      if (!statsModal.classList.contains('hidden')) closeStatsModal()
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
      const open = todos.filter(t => !t.completed)
      if (open.length > 0) {
        showBrowserNotification('⏰ Habby Reminder', `You have ${open.length} open task${open.length > 1 ? 's' : ''}!`)
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
// LOAD TODOS
// ============================================

async function loadTodos() {
  todosList.innerHTML = Array(3).fill(
    '<div class="skel-card"><span class="skel skel-dot"></span><span class="skel skel-grow"><span class="skel skel-line short"></span><span class="skel skel-line tiny"></span></span></div>'
  ).join('')

  try {
    const data = await Storage.getTodos()
    todos = (data.todos || []).map(t => ({
      id: t.id,
      name: t.name,
      emoji: t.emoji || '✅',
      priority: t.priority || 'medium',
      dueDate: t.dueDate || null,
      completed: !!t.completed,
      completedAt: t.completedAt || null,
      xpEarned: t.xpEarned || 0,
      created_at: t.created_at || new Date().toISOString()
    }))
    if (data.xp) renderXp(data.xp)
  } catch (err) {
    showToast('Failed to load tasks', 'error')
    todos = []
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
      loadTodos()
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
  if (reminderInterval) { clearInterval(reminderInterval); reminderInterval = null }
  todos = []
  xpState = { level: 1, xp: 0, current: 0, needed: 100, progress: 0 }
  showToast('🔒 Back to local mode')
  loadTodos()
  loadNotifSettings()
}

// ============================================
// INIT
// ============================================

function initApp() {
  initEmojiPicker()
  initKeyboard()

  // Add todo button
  addBtn.addEventListener('click', addTodo)

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => setFilter(tab.dataset.filter))
  })

  // Empty state CTA — jump to the task input
  emptyCta.addEventListener('click', () => todoInput.focus())

  // Digest modal
  digestBtn.addEventListener('click', openDigestModal)
  digestModalClose.addEventListener('click', closeDigestModal)
  digestModal.addEventListener('click', (e) => { if (e.target === digestModal) closeDigestModal() })

  // Stats modal
  statsBtn.addEventListener('click', openStatsModal)
  statsModalClose.addEventListener('click', closeStatsModal)
  statsModal.addEventListener('click', (e) => { if (e.target === statsModal) closeStatsModal() })

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
  loadTodos()
}

function init() {
  // Always go straight to the app — no login gate
  appEl.classList.remove('hidden')
  initApp()
}

document.addEventListener('DOMContentLoaded', init)
