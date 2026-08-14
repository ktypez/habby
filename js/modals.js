// ============================================
// TASKFLOW — Modals
// ============================================

import { Storage } from './storage.js'
import { renderAchievementsGrid, renderWeekGoal, renderXpChart } from './gamification.js'

// ---------- Digest ----------
export function openDigestModal() {
  const modal = document.getElementById('digestModal')
  const content = document.getElementById('digestContent')
  modal.classList.remove('hidden')
  content.innerHTML = '<div class="skel skel-line"></div><div class="skel skel-line short"></div><div class="skel skel-line tiny"></div>'
  loadDigest()
}

export function closeDigestModal() {
  document.getElementById('digestModal').classList.add('hidden')
}

async function loadDigest() {
  const content = document.getElementById('digestContent')
  try {
    const d = await Storage.getDigest()
    content.innerHTML = renderDigest(d)
  } catch {
    content.innerHTML = '<div class="digest-empty">Failed to load digest</div>'
  }
}

function renderDigest(d) {
  const item = t => (
    `<div class="digest-item">` +
      `<span class="digest-item-name">${escHtml(t.name)}</span>` +
      `<span class="prio-badge ${t.priority || 'medium'}">${(t.priority || 'medium').toUpperCase()}</span>` +
    `</div>`
  )
  const dueItems = d.dueToday.map(item).join('')
  const overdueItems = d.overdue.map(t =>
    `<div class="digest-item">` +
      `<span class="digest-item-name">${escHtml(t.name)}</span>` +
      `<span class="digest-item-note">Due ${escHtml(t.dueDate)}</span>` +
    `</div>`
  ).join('')
  const doneItems = d.completedToday.map(item).join('')

  return (
    `<div class="digest-header"><span style="font-size:15px;font-weight:800;letter-spacing:1px">TODAY</span><span class="digest-date">${escHtml(d.date)}</span></div>` +
    `<div class="digest-stats-row">` +
      `<div class="digest-stat"><div class="digest-stat-value green">${d.completedTodayCount}</div><div class="digest-stat-label">Done</div></div>` +
      `<div class="digest-stat"><div class="digest-stat-value blue">${d.openCount}</div><div class="digest-stat-label">Open</div></div>` +
      `<div class="digest-stat"><div class="digest-stat-value yellow">+${d.xpToday}</div><div class="digest-stat-label">XP Today</div></div>` +
      `<div class="digest-stat"><div class="digest-stat-value red">${d.overdueCount}</div><div class="digest-stat-label">Overdue</div></div>` +
    `</div>` +
    `<div class="digest-section-title">DUE TODAY <span class="count-badge">${d.dueTodayCount}</span></div>` +
    (d.dueTodayCount > 0 ? `<div class="digest-list">${dueItems}</div>` : `<div class="digest-empty">Nothing due today — you're free!</div>`) +
    `<div class="digest-section-title">OVERDUE <span class="count-badge" style="background:var(--danger)">${d.overdueCount}</span></div>` +
    (d.overdueCount > 0 ? `<div class="digest-list">${overdueItems}</div>` : `<div class="digest-empty">No overdue tasks</div>`) +
    `<div class="digest-section-title">COMPLETED TODAY <span class="count-badge" style="background:var(--success)">${d.completedTodayCount}</span></div>` +
    (d.completedTodayCount > 0 ? `<div class="digest-list">${doneItems}</div>` : `<div class="digest-empty">Nothing completed yet today</div>`)
  )
}

// ---------- Stats ----------
export function openStatsModal() {
  const modal = document.getElementById('statsModal')
  const grid = document.getElementById('statsGrid')
  modal.classList.remove('hidden')
  grid.innerHTML = '<div class="skel-stats"><div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div><div class="skel skel-stat"></div></div>'
  loadStats()
}

export function closeStatsModal() {
  document.getElementById('statsModal').classList.add('hidden')
}

async function loadStats() {
  const grid = document.getElementById('statsGrid')
  try {
    const data = await Storage.getStats()
    grid.innerHTML = renderStats(data)
  } catch {
    grid.innerHTML = '<div class="stat-card span-2 stat-error">Failed to load stats</div>'
  }
}

function renderStats(d) {
  const streak = d.streak || { current: 0, longest: 0 }
  return (
    `<div class="stat-card"><span class="stat-label">Total Tasks</span><span class="stat-value">${d.totalTodos}</span><span class="stat-sub">${d.activeTodos} open</span></div>` +
    `<div class="stat-card"><span class="stat-label">Total XP</span><span class="stat-value blue">${d.totalXP}</span><span class="stat-sub">+${d.weekXP} this week</span></div>` +
    `<div class="stat-card"><span class="stat-label">Completed</span><span class="stat-value green">${d.completedTodos}</span><span class="stat-sub">${d.completionRate}% rate</span></div>` +
    `<div class="stat-card"><span class="stat-label">Overdue</span><span class="stat-value ${d.overdueCount > 0 ? 'red' : 'green'}">${d.overdueCount}</span><span class="stat-sub">${d.dueTodayCount} due today</span></div>` +
    `<div class="stat-card span-2"><span class="stat-label">Streak</span>` +
      `<div style="display:flex;gap:20px;margin-top:4px"><div><span class="stat-value yellow">${streak.current}</span><span class="stat-sub">current</span></div><div><span class="stat-value">${streak.longest}</span><span class="stat-sub">longest</span></div></div>` +
    `</div>` +
    `<div class="stat-card span-2">${renderXpChart(d)}</div>` +
    `<div class="stat-card span-2">${renderWeekGoal(d.weekGoal)}</div>` +
    `<div class="stat-card span-2 data-actions">` +
      `<span class="stat-label">Data</span>` +
      `<div class="data-btn-row">` +
        `<button class="btn-modal primary" id="exportBtn">EXPORT</button>` +
        `<button class="btn-modal" id="importBtn">IMPORT</button>` +
        `<button class="btn-modal" id="clearDoneBtn">CLEAR DONE</button>` +
      `</div>` +
    `</div>`
  )
}

// ---------- Theme ----------
export function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId)
  localStorage.setItem('taskflow-theme', themeId)
}

export function openThemeModal({ currentTheme, onPick }) {
  const themeDefs = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' }
  ]
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML =
    `<div class="modal-card" style="width:300px">` +
      `<div class="modal-header"><span class="modal-title">Theme</span><button class="modal-close" id="themeModalClose"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg></button></div>` +
      `<div class="theme-grid">${themeDefs.map(t =>
        `<button class="theme-opt ${currentTheme === t.id ? 'active' : ''}" data-theme-id="${t.id}">${t.label}</button>`
      ).join('')}</div>` +
    `</div>`
  document.body.appendChild(overlay)
  trapFocus(overlay)

  overlay.querySelectorAll('.theme-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.themeId
      applyTheme(id)
      if (onPick) onPick(id)
      overlay.remove()
    })
  })
  overlay.querySelector('#themeModalClose').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.remove() })
}

// ---------- Achievements ----------
export function openAchievementsModal() {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML =
    `<div class="modal-card modal-card-wide">` +
      `<div class="modal-header"><span class="modal-title">Achievements</span><button class="modal-close" id="achModalClose"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg></button></div>` +
      `<div id="achContent"><div class="skel skel-line"></div><div class="skel skel-line short"></div></div>` +
    `</div>`
  document.body.appendChild(overlay)
  trapFocus(overlay)

  const content = overlay.querySelector('#achContent')
  Storage.getAchievements()
    .then(res => {
      const list = res.achievements || []
      content.innerHTML = renderAchievementsGrid(list)
    })
    .catch(() => { content.innerHTML = '<div class="digest-empty">Failed to load achievements</div>' })

  overlay.querySelector('#achModalClose').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.remove() })
}

// ---------- helpers ----------
function escHtml(str) {
  const div = document.createElement('div')
  div.textContent = String(str ?? '')
  return div.innerHTML
}

// ---------- Edit task ----------
export function openEditModal(todo, onSaved) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML =
    `<div class="modal-card" style="width:420px">` +
      `<div class="modal-header"><span class="modal-title">Edit Task</span><button class="modal-close" id="editModalClose"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg></button></div>` +
      `<div class="edit-form">` +
        `<input type="text" id="editNameInput" class="todo-input" maxlength="120" value="${escHtml(todo.name)}" autocomplete="off" />` +
        `<div class="add-todo-options">` +
          `<label class="option-field"><span class="option-label">PRIORITY</span>` +
            `<select id="editPriority" class="priority-select">` +
              `<option value="low"${todo.priority === 'low' ? ' selected' : ''}>Low</option>` +
              `<option value="medium"${todo.priority === 'medium' ? ' selected' : ''}>Medium</option>` +
              `<option value="high"${todo.priority === 'high' ? ' selected' : ''}>High</option>` +
            `</select></label>` +
          `<label class="option-field"><span class="option-label">DUE DATE</span>` +
            `<input type="date" id="editDue" class="date-input" value="${todo.dueDate || ''}" /></label>` +
          `<label class="option-field"><span class="option-label">REPEAT</span>` +
            `<select id="editRepeat" class="priority-select">` +
              `<option value="none"${todo.repeat === 'none' ? ' selected' : ''}>None</option>` +
              `<option value="daily"${todo.repeat === 'daily' ? ' selected' : ''}>Daily</option>` +
              `<option value="weekly"${todo.repeat === 'weekly' ? ' selected' : ''}>Weekly</option>` +
              `<option value="monthly"${todo.repeat === 'monthly' ? ' selected' : ''}>Monthly</option>` +
            `</select></label>` +
        `</div>` +
        `<label class="option-field"><span class="option-label">NOTES</span>` +
          `<textarea id="editNotes" class="notes-input" maxlength="500" rows="3" placeholder="Optional notes...">${escHtml(todo.notes || '')}</textarea></label>` +
        `<div class="modal-actions">` +
          `<button class="btn-modal btn-danger" id="editDeleteBtn">DELETE</button>` +
          `<button class="btn-modal primary" id="editSaveBtn">SAVE</button>` +
        `</div>` +
      `</div>` +
    `</div>`
  document.body.appendChild(overlay)
  trapFocus(overlay)

  const nameInput = overlay.querySelector('#editNameInput')
  nameInput.focus()
  nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length)
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') save() })

  overlay.querySelector('#editSaveBtn').addEventListener('click', save)
  overlay.querySelector('#editModalClose').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.remove() })

  async function save() {
    const name = nameInput.value.trim()
    if (!name) { nameInput.focus(); return }
    const fields = {
      name,
      priority: overlay.querySelector('#editPriority').value,
      dueDate: overlay.querySelector('#editDue').value || null,
      repeat: overlay.querySelector('#editRepeat').value,
      notes: overlay.querySelector('#editNotes').value
    }
    const btn = overlay.querySelector('#editSaveBtn')
    btn.disabled = true
    btn.textContent = '…'
    try {
      const updated = await Storage.editTodo(todo.id, fields)
      overlay.remove()
      if (onSaved) onSaved(updated)
    } catch (err) {
      btn.disabled = false
      btn.textContent = 'SAVE'
      showModalError(overlay, err.message)
    }
  }

  overlay.querySelector('#editDeleteBtn').addEventListener('click', () => {
    if (!confirm(`Delete "${todo.name}"?`)) return
    overlay.remove()
    if (onSaved) onSaved({ deleted: true, id: todo.id })
  })
}

// ---------- Export / Import ----------
export async function triggerExport() {
  try {
    const data = await Storage.exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'taskflow-backup-' + new Date().toISOString().slice(0, 10) + '.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (err) {
    alert('Export failed: ' + err.message)
  }
}

export function openImportModal({ onDone }) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML =
    `<div class="modal-card" style="width:380px">` +
      `<div class="modal-header"><span class="modal-title">Import Backup</span><button class="modal-close" id="importClose"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg></button></div>` +
      `<div class="edit-form">` +
        `<label class="option-field"><span class="option-label">Mode</span>` +
          `<select id="importMode" class="priority-select">` +
            `<option value="merge">Merge — keep existing, add missing</option>` +
            `<option value="replace">Replace — wipe & restore backup</option>` +
          `</select></label>` +
        `<p style="font-size:11px;color:var(--danger);font-weight:700;margin:4px 0">Replace deletes all current data.</p>` +
        `<input type="file" id="importFile" accept="application/json,.json" class="todo-input" style="padding:8px" />` +
        `<div class="modal-actions"><button class="btn-modal primary" id="importGoBtn" disabled>IMPORT</button></div>` +
      `</div>` +
    `</div>`
  document.body.appendChild(overlay)
  trapFocus(overlay)

  const fileInput = overlay.querySelector('#importFile')
  const goBtn = overlay.querySelector('#importGoBtn')
  const modeSel = overlay.querySelector('#importMode')

  fileInput.addEventListener('change', () => {
    goBtn.disabled = !fileInput.files.length
    if (fileInput.files[0]) goBtn.textContent = 'IMPORT "' + fileInput.files[0].name + '"'
  })

  goBtn.addEventListener('click', async () => {
    if (!fileInput.files.length) return
    const mode = modeSel.value
    if (mode === 'replace' && !confirm('This wipes everything and restores the backup. Continue?')) return
    goBtn.disabled = true
    goBtn.textContent = '…'
    try {
      const text = await fileInput.files[0].text()
      const data = JSON.parse(text)
      const res = await Storage.importData(data, mode)
      overlay.remove()
      if (onDone) onDone(res, mode)
    } catch (err) {
      goBtn.disabled = false
      goBtn.textContent = 'IMPORT'
      showModalError(overlay, 'Import failed: ' + err.message)
    }
  })

  overlay.querySelector('#importClose').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.remove() })
}

function showModalError(overlay, msg) {
  let el = overlay.querySelector('.modal-error')
  if (!el) {
    el = document.createElement('div')
    el.className = 'modal-error'
    overlay.querySelector('.edit-form, .modal-card')?.appendChild(el)
  }
  el.textContent = msg
}

// ---------- Focus trap helper ----------
function trapFocus(overlay) {
  const focusable = overlay.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  overlay.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  })
  requestAnimationFrame(() => { first?.focus() })
}


