// ============================================
// TASKFLOW — Main orchestrator
// ============================================

import { calcXpForTask, calcXpProgress, parseDueDate } from '../lib/logic.js'
import { Storage, pendingCount, flushOutbox, setOnChange, OfflineError } from './storage.js'
import { renderStreakBadge, showAchievementUnlocks, buzz, showLevelUp } from './gamification.js'
import {
  openDigestModal, closeDigestModal,
  openStatsModal, closeStatsModal,
  openThemeModal, openAchievementsModal, openEditModal,
  triggerExport, openImportModal,
  applyTheme
} from './modals.js'

let todos = []
let xpState = { level: 1, xp: 0, current: 0, needed: 100, progress: 0 }
let streakState = { current: 0, longest: 0 }
let currentFilter = 'all'
let currentSort = 'priority'
let searchQuery = ''
let pendingDelete = null
let reminderInterval = null
const expandedNotes = new Set()

// DOM refs
const $ = sel => document.querySelector(sel)
const todosList = $('#todosList')
const emptyState = $('#emptyState')
const emptyTitle = $('#emptyTitle')
const emptyText = $('#emptyText')
const emptyCta = $('#emptyCta')
const listTitle = $('#listTitle')
const todosCount = $('#todosCount')
const countToday = $('#countToday')
const countDone = $('#countDone')
const todoInput = $('#todoInput')
const addBtn = $('#addTodoBtn')
const prioritySelect = $('#prioritySelect')
const dueDateInput = $('#dueDateInput')
const repeatSelect = $('#repeatSelect')
const searchInput = $('#searchInput')
const sortSelect = $('#sortSelect')
const toastContainer = $('#toastContainer')

// XP DOM
const xpLevelBadge = $('#xpLevelBadge')
const xpBarFill = $('#xpBarFill')
const xpNumbers = $('#xpNumbers')

// ============================================
// TOAST
// ============================================

function showToast(message, type = 'success', ms = 2000) {
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  toastContainer.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transition = 'opacity 0.3s'
    setTimeout(() => toast.remove(), 300)
  }, ms)
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

function renderXp(xp) {
  xpState = xp
  xpLevelBadge.textContent = `LVL ${xp.level}`
  xpBarFill.style.width = `${Math.round(xp.progress * 100)}%`
  xpNumbers.textContent = `${xp.current} / ${xp.needed} XP`
}

// ============================================
// FILTERS / SORT / SEARCH
// ============================================

const FILTERS = ['all', 'today', 'upcoming', 'done']
const FILTER_TITLES = { all: 'ALL TASKS', today: 'TODAY', upcoming: 'UPCOMING', done: 'DONE' }

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

  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    list = list.filter(t => t.name.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q))
  }

  const prio = { high: 0, medium: 1, low: 2 }
  if (currentSort === 'due') {
    list.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      const ad = a.dueDate || '9999'
      const bd = b.dueDate || '9999'
      if (ad !== bd) return ad < bd ? -1 : 1
      return (b.created_at || '') < (a.created_at || '') ? -1 : 1
    })
  } else if (currentSort === 'newest') {
    list.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      return (b.created_at || '') < (a.created_at || '') ? -1 : 1
    })
  } else {
    list.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      if (a.completed) return (b.completedAt || '') < (a.completedAt || '') ? 1 : -1
      if (a.priority !== b.priority) return (prio[a.priority] ?? 2) - (prio[b.priority] ?? 2)
      const ad = a.dueDate || '9999'
      const bd = b.dueDate || '9999'
      if (ad !== bd) return ad < bd ? -1 : 1
      return (b.created_at || '') < (a.created_at || '') ? -1 : 1
    })
  }
  return list
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
  countToday.textContent = todayCount
  countDone.textContent = doneCount

  if (filtered.length === 0) {
    todosList.innerHTML = ''
    emptyState.classList.remove('hidden')
    if (searchQuery) {
      emptyTitle.textContent = 'No matches'
      emptyText.textContent = `Nothing matches "${searchQuery}".`
    } else {
      const empties = {
        all: { t: 'All clear', d: 'Add a task above to get started.' },
        today: { t: 'Nothing due today', d: 'Sit back or add a task with a due date.' },
        upcoming: { t: 'No upcoming tasks', d: 'Tasks without a due date land here.' },
        done: { t: 'Nothing completed yet', d: 'Complete a task to see it here.' }
      }
      emptyTitle.textContent = empties[currentFilter].t
      emptyText.textContent = empties[currentFilter].d
    }
  } else {
    emptyState.classList.add('hidden')
    todosList.innerHTML = filtered.map(t => renderTodoCard(t)).join('')
  }

  if (animatingId) {
    const card = document.querySelector(`[data-id="${animatingId}"]`)
    if (card) {
      card.classList.add('just-checked')
      setTimeout(() => card.classList.remove('just-checked'), 700)
    }
  }

  updateOfflineBadge()
  cacheStateForSw()
}

function dueLabel(t) {
  const now = today()
  const d = t.dueDate
  if (!d) return ''
  if (t.completed) return `<span class="due-chip done">${escHtml(d.slice(5))}</span>`
  if (d < now) {
    const days = Math.round((new Date(now) - new Date(d)) / 86400000)
    return `<span class="due-chip overdue">${days === 0 ? 'OVERDUE' : `${days}d OVERDUE`}</span>`
  }
  if (d === now) return `<span class="due-chip today">TODAY</span>`
  const days = Math.round((new Date(d) - new Date(now)) / 86400000)
  return `<span class="due-chip">${days === 1 ? 'TOMORROW' : `IN ${days}d`} · ${escHtml(d.slice(5))}</span>`
}

function renderTodoCard(t) {
  const checked = t.completed
  const prio = t.priority || 'medium'
  const prioLabel = { high: 'HIGH', medium: 'MED', low: 'LOW' }
  const repeatChip = t.repeat && t.repeat !== 'none'
    ? `<span class="repeat-chip">${t.repeat.toUpperCase()}</span>`
    : ''
  const notesBtn = t.notes
    ? `<button class="btn-notes ${expandedNotes.has(t.id) ? 'open' : ''}" title="Notes">N</button>`
    : ''
  const notesBlock = t.notes && expandedNotes.has(t.id)
    ? `<div class="todo-notes">${escHtml(t.notes)}</div>`
    : ''
  return `
    <div class="todo-card ${checked ? 'checked' : ''} prio-${prio}" data-id="${t.id}">
      <button class="todo-check ${checked ? 'checked' : ''}" title="${checked ? 'Mark not done' : 'Complete task'}"></button>
      <div class="todo-info">
        <div class="todo-name-row">
          <span class="todo-name ${checked ? 'checked-name' : ''}">${escHtml(t.name)}</span>
        </div>
        <div class="todo-meta">
          <span class="prio-badge ${prio}">${prioLabel[prio]}</span>
          ${dueLabel(t)}
          ${repeatChip}
          ${notesBtn}
          ${checked ? `<span class="xp-chip">+${t.xpEarned || 0} XP</span>` : ''}
        </div>
        ${notesBlock}
      </div>
      <div class="todo-actions">
        <button class="btn-edit" title="Edit task">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5l1 1L4 10H3v-1l6.5-6.5z"/></svg>
        </button>
        <button class="btn-delete" title="Delete task">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="11" y2="11"/><line x1="11" y1="2" x2="2" y2="11"/><path d="M4 3.5V2h5v1.5"/></svg>
        </button>
      </div>
    </div>
  `
}

function escHtml(str) {
  const div = document.createElement('div')
  div.textContent = String(str ?? '')
  return div.innerHTML
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// ============================================
// OFFLINE BADGE
// ============================================

function updateOfflineBadge() {
  const el = $('#offlineBadge')
  if (!el) return
  const n = pendingCount()
  if (n > 0) {
    el.textContent = `${n} queued`
    el.classList.remove('hidden')
  } else {
    el.classList.add('hidden')
  }
}

// ============================================
// ACTIONS
// ============================================

async function toggleComplete(id) {
  const t = todos.find(t => t.id === id)
  if (!t) return
  const willComplete = !t.completed

  if (willComplete) {
    buzz()
    const rect = document.querySelector(`[data-id="${id}"] .todo-check`)
    if (rect) {
      const r = rect.getBoundingClientRect()
      showXpFloat(calcXpForTask(t.priority), r.left + 20, r.top)
    }
    t.completed = true
    t.completedAt = new Date().toISOString()
    render(id)
  }

  try {
    const res = await Storage.toggleComplete(id)
    if (willComplete) {
      xpState = res.xp
      renderXp(res.xp)
      if (res.streak) streakState = res.streak
      renderStreakBadge(streakState)
      if (res.unlocked && res.unlocked.length) showAchievementUnlocks(res.unlocked)
      if (res.todo) mergeTodo(res.todo)
      if (res.nextTodo) {
        if (!todos.some(x => x.id === res.nextTodo.id)) todos.push(res.nextTodo)
        showToast(`Next: ${res.nextTodo.name}`, 'success', 2500)
      }
      const wasMax = xpState.level
      render()
      if (xpState.level > wasMax) {
        showLevelUp(xpState.level)
        showToast(`Level ${xpState.level}!`, 'success', 3000)
      }
    } else {
      if (res.xp) renderXp(res.xp)
      if (res.streak) streakState = res.streak
      renderStreakBadge(streakState)
      if (res.todo) mergeTodo(res.todo)
      render()
    }
  } catch (err) {
    if (err instanceof OfflineError) {
      showToast('Offline — queued. Will sync when back.', 'warn', 2500)
      updateOfflineBadge()
    } else {
      showToast('Could not save — try again.', 'error', 2500)
      loadTodos()
    }
  }
}

function mergeTodo(updated) {
  const i = todos.findIndex(x => x.id === updated.id)
  if (i >= 0) todos[i] = updated
  else todos.push(updated)
}

function requestDelete(id) {
  pendingDelete = id
  const t = todos.find(x => x.id === id)
  $('#confirmDeleteName').textContent = t ? t.name : 'this task'
  $('#confirmDeleteModal').classList.remove('hidden')
}

async function performDelete(id) {
  pendingDelete = null
  $('#confirmDeleteModal').classList.add('hidden')
  todos = todos.filter(x => x.id !== id)
  render()
  try {
    await Storage.deleteTodo(id)
  } catch (err) {
    if (err instanceof OfflineError) {
      showToast('Offline — delete queued.', 'warn', 2500)
    } else {
      showToast('Delete failed — try again.', 'error', 2500)
    }
  }
}

async function addTodo(name, priority, dueDate, repeat, notes) {
  const task = { name, priority, dueDate, repeat, notes }
  try {
    const res = await Storage.addTodo(task)
    todos.push(res.todo)
    const wasMax = xpState.level
    renderXp(res.xp)
    render()
    if (res.xp && res.xp.level > wasMax) {
      showLevelUp(res.xp.level)
      showToast(`Level ${res.xp.level}!`, 'success', 3000)
    }
    return res
  } catch (err) {
    if (err instanceof OfflineError) {
      showToast('Offline — saved locally, will sync.', 'warn', 2500)
      todos.push({ ...task, id: 'local-' + Date.now(), completed: false, created_at: new Date().toISOString() })
      render()
    } else {
      showToast('Could not add task.', 'error', 2500)
      throw err
    }
  }
}

function handleEditResult(updated) {
  if (updated && updated.deleted) {
    performDelete(updated.id)
    return
  }
  if (updated) {
    mergeTodo(updated)
    render()
    showToast('Task updated.')
  }
}

// ============================================
// EVENTS
// ============================================

function wireEvents() {
  // Add task
  addBtn.addEventListener('click', () => {
    const raw = todoInput.value.trim()
    if (!raw) return
    const parsed = parseDueDate(raw)
    const name = parsed.name
    const due = parsed.date || dueDateInput.value || null
    addTodo(name, prioritySelect.value, due, repeatSelect.value, '')
      .then(res => {
        if (parsed.date) showToast(`Due ${parsed.label}`, 'success', 2000)
      })
      .catch(() => {})
    todoInput.value = ''
    dueDateInput.value = ''
    prioritySelect.value = 'medium'
    repeatSelect.value = 'none'
    todoInput.focus()
  })
  todoInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) addBtn.click()
  })

  // List delegation
  todosList.addEventListener('click', e => {
    const card = e.target.closest('.todo-card')
    if (!card) return
    const id = card.dataset.id
    if (e.target.closest('.todo-check')) toggleComplete(id)
    else if (e.target.closest('.btn-delete')) requestDelete(id)
    else if (e.target.closest('.btn-edit')) {
      const t = todos.find(x => x.id === id)
      if (t) openEditModal(t, handleEditResult)
    } else if (e.target.closest('.btn-notes')) {
      if (expandedNotes.has(id)) expandedNotes.delete(id)
      else expandedNotes.add(id)
      render()
    }
  })

  // Filters
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => setFilter(tab.dataset.filter))
  })

  // Empty state CTA
  emptyCta.addEventListener('click', () => {
    todoInput.focus()
    todoInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })

  // Search + sort
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim()
    render()
  })
  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value
    render()
  })

  // Stats modal
  $('#statsGrid').addEventListener('click', async e => {
    if (e.target.id === 'exportBtn') {
      triggerExport()
    } else if (e.target.id === 'importBtn') {
      openImportModal({ onDone: async (res, mode) => {
        showToast(`Import ${mode} done — ${res.added} tasks.`, 'success', 3000)
        await loadTodos()
      }})
    } else if (e.target.id === 'clearDoneBtn') {
      $('#statsModal').classList.add('hidden')
      const doneN = todos.filter(t => t.completed).length
      if (doneN === 0) {
        showToast('Nothing to clear.', 'warn', 2000)
        return
      }
      try {
        const res = await Storage.clearDone()
        showToast(`Cleared ${res.removed ?? doneN} completed task${(res.removed ?? doneN) !== 1 ? 's' : ''}.`)
        await loadTodos()
      } catch (err) {
        if (err instanceof OfflineError) showToast('Offline — clear queued.', 'warn', 2500)
        else showToast('Clear failed — try again.', 'error', 2500)
      }
    }
  })

  // Delete confirm
  $('#confirmDeleteClose').addEventListener('click', () => {
    pendingDelete = null
    $('#confirmDeleteModal').classList.add('hidden')
  })
  $('#confirmCancel').addEventListener('click', () => {
    pendingDelete = null
    $('#confirmDeleteModal').classList.add('hidden')
  })
  $('#confirmDelete').addEventListener('click', () => {
    if (pendingDelete) performDelete(pendingDelete)
  })
  $('#confirmDeleteModal').addEventListener('click', e => {
    if (e.target.id === 'confirmDeleteModal') {
      pendingDelete = null
      $('#confirmDeleteModal').classList.add('hidden')
    }
  })

  // Modal closes
  $('#digestModalClose').addEventListener('click', closeDigestModal)
  $('#digestModal').addEventListener('click', e => {
    if (e.target.id === 'digestModal') closeDigestModal()
  })
  $('#statsModalClose').addEventListener('click', closeStatsModal)
  $('#statsModal').addEventListener('click', e => {
    if (e.target.id === 'statsModal') closeStatsModal()
  })

  // Top bar actions
  $('#statsBtn').addEventListener('click', openStatsModal)
  $('#digestBtn').addEventListener('click', openDigestModal)
  $('#themeBtn').addEventListener('click', () => openThemeModal(applyTheme))
  $('#achievementsBtn')?.addEventListener('click', openAchievementsModal)

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeDigestModal()
      closeStatsModal()
      const del = $('#confirmDeleteModal')
      if (del && !del.classList.contains('hidden')) {
        pendingDelete = null
        del.classList.add('hidden')
      }
    }
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault()
      todoInput.focus()
    }
  })
}

// ============================================
// SERVICE WORKER
// ============================================

function registerSw() {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

function cacheStateForSw() {
  if (!('caches' in window)) return
  try {
    caches.open('taskflow-state').then(c => c.put(
      new Request('/taskflow-state'),
      new Response(JSON.stringify({
        open: todos.filter(t => !t.completed).length,
        level: xpState.level,
        updated: Date.now()
      }), { headers: { 'Content-Type': 'application/json' } })
    )).catch(() => {})
  } catch (e) {}
}

// ============================================
// LOAD / INIT
// ============================================

async function loadTodos() {
  try {
    const res = await Storage.getTodos()
    todos = res.todos
    renderXp(res.xp)
    if (res.streak) {
      streakState = res.streak
      renderStreakBadge(streakState)
    }
    render()
  } catch (err) {
    showToast('Could not load — is the server up?', 'error', 3000)
  }
}

function wireOffline() {
  window.addEventListener('online', async () => {
    showToast('Back online — syncing…')
    try {
      const res = await flushOutbox()
      if (res.synced) showToast(`Synced ${res.synced} queued action${res.synced !== 1 ? 's' : ''}.`)
      if (res.resync) await loadTodos()
    } catch (e) {
      showToast('Sync failed — will retry.', 'warn', 2500)
    }
    updateOfflineBadge()
  })
  window.addEventListener('offline', () => {
    updateOfflineBadge()
  })
}

function init() {
  applyTheme(localStorage.getItem('taskflow-theme') || 'light')
  wireEvents()
  wireOffline()
  registerSw()

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadTodos()
  })

  setOnChange(() => {
    loadTodos()
    updateOfflineBadge()
  })

  loadTodos()
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init)
}
