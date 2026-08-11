// ============================================
// HABBY — modals (digest, stats, theme, achievements, edit, owner, import)
// Pure DOM builders — main.js wires the events
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
  const prioEmoji = { high: '🔴', medium: '🟡', low: '🟢' }
  const item = t => (
    '<div class="digest-item">' +
      '<span class="digest-item-emoji">' + (t.emoji || '✅') + '</span>' +
      '<span class="digest-item-name">' + escHtml(t.name) + '</span>' +
      '<span class="prio-badge ' + (t.priority || 'medium') + '">' + (t.priority || 'medium').toUpperCase() + '</span>' +
    '</div>'
  )
  const dueItems = d.dueToday.map(item).join('')
  const overdueItems = d.overdue.map(t =>
    '<div class="digest-item">' +
      '<span class="digest-item-emoji">' + (t.emoji || '✅') + '</span>' +
      '<span class="digest-item-name">' + escHtml(t.name) + '</span>' +
      '<span class="digest-item-note">⚠ ' + escHtml(t.dueDate) + '</span>' +
    '</div>'
  ).join('')
  const doneItems = d.completedToday.map(t => item(t)).join('')

  return (
    '<div class="digest-header"><span style="font-size:20px;font-weight:700">📋 Today</span><span class="digest-date">' + escHtml(d.date) + '</span></div>' +
    '<div class="digest-stats-row">' +
      '<div class="digest-stat"><div class="digest-stat-value green">' + d.completedTodayCount + '</div><div class="digest-stat-label">Done</div></div>' +
      '<div class="digest-stat"><div class="digest-stat-value pink">' + d.openCount + '</div><div class="digest-stat-label">Open</div></div>' +
      '<div class="digest-stat"><div class="digest-stat-value yellow">+' + d.xpToday + '</div><div class="digest-stat-label">XP Today</div></div>' +
      '<div class="digest-stat"><div class="digest-stat-value red">' + d.overdueCount + '</div><div class="digest-stat-label">Overdue</div></div>' +
    '</div>' +
    '<div class="digest-section-title">🔴 Due Today <span class="count-badge" style="background:var(--red);color:var(--bg-raise)">' + d.dueTodayCount + '</span></div>' +
    (d.dueTodayCount > 0 ? '<div class="digest-list">' + dueItems + '</div>' : '<div class="digest-empty">Nothing due today 🎉</div>') +
    '<div class="digest-section-title">⚠️ Overdue <span class="count-badge" style="background:var(--red);color:var(--bg-raise)">' + d.overdueCount + '</span></div>' +
    (d.overdueCount > 0 ? '<div class="digest-list">' + overdueItems + '</div>' : '<div class="digest-empty">No overdue tasks</div>') +
    '<div class="digest-section-title">✅ Completed Today <span class="count-badge" style="background:var(--green)">' + d.completedTodayCount + '</span></div>' +
    (d.completedTodayCount > 0 ? '<div class="digest-list">' + doneItems + '</div>' : '<div class="digest-empty">Nothing completed yet today</div>')
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
    grid.innerHTML = '<div class="stat-card span-2 stat-error"><span class="stat-label">Error loading stats</span></div>'
  }
}

function renderStats(d) {
  const streak = d.streak || { current: 0, longest: 0 }
  return (
    '<div class="stat-card"><span class="stat-label">Total Tasks</span><span class="stat-value">' + d.totalTodos + '</span><span class="stat-sub">' + d.activeTodos + ' open</span></div>' +
    '<div class="stat-card"><span class="stat-label">Total XP</span><span class="stat-value green">' + d.totalXP + '</span><span class="stat-sub">+' + d.weekXP + ' XP this week</span></div>' +
    '<div class="stat-card"><span class="stat-label">Completed</span><span class="stat-value green">' + d.completedTodos + '</span><span class="stat-sub">' + d.completionRate + '% · ' + (d.totalCompleted ?? d.completedTodos) + ' lifetime</span></div>' +
    '<div class="stat-card"><span class="stat-label">Overdue</span><span class="stat-value ' + (d.overdueCount > 0 ? 'red' : 'green') + '">' + d.overdueCount + '</span><span class="stat-sub">' + d.dueTodayCount + ' due today</span></div>' +
    '<div class="stat-card span-2"><span class="stat-label">Streak</span>' +
      '<div class="streak-stats"><div class="streak-stat"><span class="stat-value yellow">🔥 ' + streak.current + '</span><span class="stat-sub">current</span></div>' +
      '<div class="streak-stat"><span class="stat-value">🏆 ' + streak.longest + '</span><span class="stat-sub">longest</span></div></div>' +
    '</div>' +
    '<div class="stat-card span-2">' + renderXpChart(d) + '</div>' +
    '<div class="stat-card span-2">' + renderWeekGoal(d.weekGoal) + '</div>' +
    '<div class="stat-card span-2 data-actions">' +
      '<span class="stat-label">Data</span>' +
      '<div class="data-btn-row">' +
        '<button class="btn-modal primary" id="exportBtn">⬇ EXPORT</button>' +
        '<button class="btn-modal" id="importBtn">⬆ IMPORT</button>' +
        '<button class="btn-modal secondary" id="clearDoneBtn">🧹 CLEAR DONE</button>' +
      '</div>' +
    '</div>'
  )
}

// ---------- Theme ----------
export function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId)
  localStorage.setItem('habby-theme', themeId)
}

export function openThemeModal({ currentTheme, onPick }) {
  const themeDefs = [
    { id: 'light', label: 'Light', emoji: '☀️' },
    { id: 'dark', label: 'Dark', emoji: '🌙' }
  ]
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML =
    '<div class="modal-card" style="width:320px">' +
      '<div class="modal-header"><span class="modal-title">🎨 Theme</span><button class="modal-close" id="themeModalClose">✕</button></div>' +
      '<div class="theme-grid">' + themeDefs.map(t =>
        '<button class="theme-opt ' + (currentTheme === t.id ? 'active' : '') + '" data-theme-id="' + t.id + '">' + t.emoji + '<span>' + t.label + '</span></button>'
      ).join('') + '</div>' +
    '</div>'
  document.body.appendChild(overlay)

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
}

// ---------- Achievements ----------
export function openAchievementsModal() {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML =
    '<div class="modal-card modal-card-wide">' +
      '<div class="modal-header"><span class="modal-title">🏅 ACHIEVEMENTS</span><button class="modal-close" id="achModalClose">✕</button></div>' +
      '<div id="achContent"><div class="skel skel-line"></div><div class="skel skel-line short"></div></div>' +
    '</div>'
  document.body.appendChild(overlay)

  const content = overlay.querySelector('#achContent')
  Storage.getAchievements()
    .then(res => {
      const list = res.achievements || []
      content.innerHTML = renderAchievementsGrid(list)
    })
    .catch(() => { content.innerHTML = '<div class="digest-empty">Failed to load achievements</div>' })

  overlay.querySelector('#achModalClose').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
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
    '<div class="modal-card" style="width:440px">' +
      '<div class="modal-header"><span class="modal-title">✏️ EDIT TASK</span><button class="modal-close" id="editModalClose">✕</button></div>' +
      '<div class="edit-form">' +
        '<div class="emoji-picker" id="editEmojiPicker">' + EMOJIS.map(e =>
          '<button class="emoji-option ' + (e === todo.emoji ? 'selected' : '') + '" data-emoji="' + e + '">' + e + '</button>'
        ).join('') + '</div>' +
        '<input type="text" id="editNameInput" class="todo-input" maxlength="120" value="' + escHtml(todo.name) + '" autocomplete="off" />' +
        '<div class="add-todo-options">' +
          '<label class="option-field"><span class="option-label">PRIORITY</span>' +
            '<select id="editPriority" class="priority-select">' +
              '<option value="low"' + (todo.priority === 'low' ? ' selected' : '') + '>🟢 LOW</option>' +
              '<option value="medium"' + (todo.priority === 'medium' ? ' selected' : '') + '>🟡 MED</option>' +
              '<option value="high"' + (todo.priority === 'high' ? ' selected' : '') + '>🔴 HIGH</option>' +
            '</select></label>' +
          '<label class="option-field"><span class="option-label">DUE DATE</span>' +
            '<input type="date" id="editDue" class="date-input" value="' + (todo.dueDate || '') + '" /></label>' +
          '<label class="option-field"><span class="option-label">REPEAT</span>' +
            '<select id="editRepeat" class="priority-select">' +
              '<option value="none"' + (todo.repeat === 'none' ? ' selected' : '') + '>NO REPEAT</option>' +
              '<option value="daily"' + (todo.repeat === 'daily' ? ' selected' : '') + '>DAILY</option>' +
              '<option value="weekly"' + (todo.repeat === 'weekly' ? ' selected' : '') + '>WEEKLY</option>' +
              '<option value="monthly"' + (todo.repeat === 'monthly' ? ' selected' : '') + '>MONTHLY</option>' +
            '</select></label>' +
        '</div>' +
        '<label class="option-field"><span class="option-label">NOTES</span>' +
          '<textarea id="editNotes" class="notes-input" maxlength="500" rows="3" placeholder="Anything worth remembering…">' + escHtml(todo.notes || '') + '</textarea></label>' +
        '<div class="modal-actions">' +
          '<button class="btn-modal secondary" id="editDeleteBtn">DELETE</button>' +
          '<button class="btn-modal primary" id="editSaveBtn">SAVE</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  document.body.appendChild(overlay)

  const picker = overlay.querySelector('#editEmojiPicker')
  picker.addEventListener('click', e => {
    const btn = e.target.closest('.emoji-option')
    if (!btn) return
    picker.querySelectorAll('.emoji-option').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
  })

  const nameInput = overlay.querySelector('#editNameInput')
  nameInput.focus()
  nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length)
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') save() })

  overlay.querySelector('#editSaveBtn').addEventListener('click', save)
  overlay.querySelector('#editModalClose').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })

  async function save() {
    const name = nameInput.value.trim()
    if (!name) { nameInput.focus(); return }
    const fields = {
      name,
      emoji: picker.querySelector('.emoji-option.selected')?.dataset.emoji || '✅',
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
    if (!confirm('Delete "' + todo.name + '"?')) return
    overlay.remove()
    if (onSaved) onSaved({ deleted: true, id: todo.id })
  })
}

// ---------- Owner login (triple-tap 🎯) ----------
export function openOwnerLoginModal({ onSuccess }) {
  const existing = document.getElementById('ownerLoginOverlay')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.id = 'ownerLoginOverlay'
  overlay.className = 'modal-overlay'
  overlay.innerHTML =
    '<div class="modal-card" style="width:360px">' +
      '<div class="modal-header"><span class="modal-title">🔐 Owner Access</span><button class="modal-close" id="ownerLoginClose">✕</button></div>' +
      '<div class="terminal-line" style="justify-content:flex-start;padding:0;margin-bottom:12px">' +
        '<span class="seg-user">habby</span><span class="seg-at">@</span><span class="seg-cmd">mcky</span><span class="seg-dollar">$</span>' +
        '<input type="password" id="ownerLoginInput" class="pw-input" placeholder="password" autocomplete="off" />' +
      '</div>' +
      '<button id="ownerLoginBtn" class="btn-modal primary" style="width:100%">UNLOCK</button>' +
      '<div class="login-error hidden" id="ownerLoginError">// wrong password</div>' +
    '</div>'
  document.body.appendChild(overlay)

  const ownerInput = overlay.querySelector('#ownerLoginInput')
  const ownerBtn = overlay.querySelector('#ownerLoginBtn')
  const ownerError = overlay.querySelector('#ownerLoginError')

  ownerInput.focus()
  ownerInput.addEventListener('keydown', e => { if (e.key === 'Enter') ownerBtn.click() })

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
      overlay.remove()
      if (onSuccess) onSuccess(password)
    } catch {
      ownerError.classList.remove('hidden')
      ownerBtn.disabled = false
      ownerBtn.textContent = 'UNLOCK'
    }
  })

  overlay.querySelector('#ownerLoginClose').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
}

// ---------- Export / Import ----------
export async function triggerExport() {
  try {
    const data = await Storage.exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'habby-backup-' + new Date().toISOString().slice(0, 10) + '.json'
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
    '<div class="modal-card" style="width:380px">' +
      '<div class="modal-header"><span class="modal-title">⬆ IMPORT BACKUP</span><button class="modal-close" id="importClose">✕</button></div>' +
      '<div class="import-form">' +
        '<label class="option-field"><span class="option-label">MODE</span>' +
          '<select id="importMode" class="priority-select">' +
            '<option value="merge">MERGE — keep existing, add missing</option>' +
            '<option value="replace">REPLACE — wipe & restore backup</option>' +
          '</select></label>' +
        '<p class="import-warn">⚠ Replace deletes all current tasks, XP, and achievements.</p>' +
        '<input type="file" id="importFile" accept="application/json,.json" class="import-file" />' +
        '<div class="modal-actions"><button class="btn-modal primary" id="importGoBtn" disabled>IMPORT</button></div>' +
      '</div>' +
    '</div>'
  document.body.appendChild(overlay)

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
}

function showModalError(overlay, msg) {
  let el = overlay.querySelector('.modal-error')
  if (!el) {
    el = document.createElement('div')
    el.className = 'modal-error'
    overlay.querySelector('.edit-form, .import-form, .modal-card')?.appendChild(el)
  }
  el.textContent = msg
}

const EMOJIS = ['✅', '🔥', '📚', '💪', '💧', '🧠', '✍️', '📧', '📅', '🛒', '🧹', '💻', '🏃', '🥗', '🚿', '🌙']
