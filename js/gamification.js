// ============================================
// HABBY — gamification UI
// Streak badge, achievement toasts, XP chart, confetti
// ============================================

import { ACHIEVEMENTS, WEEK_GOAL } from '../lib/logic.js'

// --- Streak badge (header) ---
export function renderStreakBadge(streak) {
  const el = document.getElementById('streakBadge')
  if (!el) return
  const current = (streak && streak.current) || 0
  if (current > 0) {
    el.textContent = `🔥 ${current}`
    el.classList.remove('hidden')
  } else {
    el.classList.add('hidden')
  }
}

// --- Haptics (mobile only) ---
export function buzz(pattern = 10) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern) } catch { /* noop */ }
  }
}

// --- Achievement unlock toasts (queued, one at a time) ---
let unlockQueue = []
let unlockShowing = false

export function showAchievementUnlocks(ids) {
  if (!ids || !ids.length) return
  const defs = ACHIEVEMENTS.filter(a => ids.includes(a.id))
  unlockQueue.push(...defs)
  pumpUnlockQueue()
}

function pumpUnlockQueue() {
  if (unlockShowing || !unlockQueue.length) return
  const a = unlockQueue.shift()
  unlockShowing = true

  const toast = document.createElement('div')
  toast.className = 'toast achievement'
  toast.innerHTML =
    '<span class="ach-toast-emoji">' + a.emoji + '</span>' +
    '<span class="ach-toast-text"><b>' + a.name + '</b><small>' + a.desc + '</small></span>'
  document.getElementById('toastContainer').appendChild(toast)
  buzz(20)

  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transition = 'opacity 0.3s'
    setTimeout(() => {
      toast.remove()
      unlockShowing = false
      setTimeout(pumpUnlockQueue, 350)
    }, 300)
  }, 2600)
}

// --- Achievements grid (modal) ---
export function renderAchievementsGrid(list) {
  if (!list || !list.length) return '<div class="digest-empty">No achievements defined</div>'
  const unlockedCount = list.filter(a => a.unlocked).length
  const cards = list.map(a => (
    '<div class="achievement-card ' + (a.unlocked ? 'unlocked' : 'locked') + '" title="' + a.desc + '">' +
      '<span class="achievement-emoji">' + (a.unlocked ? a.emoji : '🔒') + '</span>' +
      '<div class="achievement-info">' +
        '<span class="achievement-name">' + a.name + '</span>' +
        '<span class="achievement-desc">' + a.desc + '</span>' +
      '</div>' +
    '</div>'
  )).join('')
  const pct = Math.round((unlockedCount / list.length) * 100)
  return (
    '<div class="ach-summary">' +
      '<span class="stat-value green">' + unlockedCount + '</span>' +
      '<span class="stat-sub"> / ' + list.length + ' unlocked</span>' +
      '<div class="ach-progress-track"><div class="ach-progress-fill" style="width:' + pct + '%"></div></div>' +
    '</div>' +
    '<div class="achievements-grid">' + cards + '</div>'
  )
}

// --- Weekly goal progress (stats modal) ---
export function renderWeekGoal(weekGoal) {
  const done = weekGoal ? weekGoal.done : 0
  const target = (weekGoal && weekGoal.target) || WEEK_GOAL
  const pct = Math.min(100, Math.round((done / target) * 100))
  const complete = done >= target
  return (
    '<div class="week-goal ' + (complete ? 'complete' : '') + '">' +
      '<div class="week-goal-head">' +
        '<span class="stat-label">Weekly Goal</span>' +
        '<span class="week-goal-nums">' + done + ' / ' + target + (complete ? ' ✓' : '') + '</span>' +
      '</div>' +
      '<div class="ach-progress-track tall"><div class="ach-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="stat-sub">' + (complete ? 'Goal smashed! 🎉' : (target - done) + ' more to hit the weekly goal') + '</span>' +
    '</div>'
  )
}

// --- XP history chart: green XP bars + count labels (stats modal) ---
export function renderXpChart(stats) {
  const counts = stats.weekDailyCounts || []
  const xp = stats.weekDailyXp || []
  const dates = stats.weekDates || []
  const maxXp = Math.max.apply(null, xp.concat([0]))
  const maxCount = Math.max.apply(null, counts.concat([1]))
  const bars = dates.map((date, i) => {
    const h = maxXp > 0 ? Math.max(5, Math.round((xp[i] / maxXp) * 100)) : 5
    return (
      '<div class="stat-bar-wrap">' +
        '<div class="stat-bar xp" style="height:' + h + '%" title="' + xp[i] + ' XP">' +
          (xp[i] > 0 ? '<span class="stat-bar-xp">' + xp[i] + '</span>' : '') +
        '</div>' +
        '<span class="stat-bar-label">' + date.slice(5) + '</span>' +
        '<span class="stat-bar-count">' + counts[i] + '</span>' +
      '</div>'
    )
  }).join('')
  return (
    '<span class="stat-label">This Week — XP (bars) & tasks (bottom)</span>' +
    '<div class="stat-bars xp-chart">' + bars + '</div>'
  )
}

// --- Level up overlay with confetti burst ---
export function showLevelUp(level) {
  const overlay = document.createElement('div')
  overlay.className = 'level-up-overlay'
  const emojis = ['🏆', '🏆', '💎', '👑', '🔥', '⭐', '🌟', '🚀']
  const emoji = emojis[Math.min(level - 1, emojis.length - 1)]

  let sparkles = ''
  for (let i = 0; i < 26; i++) {
    const angle = Math.random() * Math.PI * 2
    const dist = 60 + Math.random() * 90
    const tx = Math.round(Math.cos(angle) * dist)
    const ty = Math.round(Math.sin(angle) * dist)
    const color = ['#ffe066', '#06d6a0', '#ff6b6b', '#4361ee', '#9b5de5'][i % 5]
    sparkles += '<div class="confetti" style="--tx:' + tx + 'px;--ty:' + ty + 'px;--rot:' + (Math.random() * 360 - 180) + 'deg;background:' + color + '"></div>'
  }

  overlay.innerHTML =
    '<div class="level-up-card">' +
      '<div class="level-up-sparkles">' + sparkles + '</div>' +
      '<div class="level-up-emoji">' + emoji + '</div>' +
      '<div class="level-up-title">LEVEL UP!</div>' +
      '<div class="level-up-sub">You reached <strong>Level ' + level + '</strong></div>' +
    '</div>'

  document.body.appendChild(overlay)
  buzz([30, 40, 60])
  overlay.addEventListener('click', () => overlay.remove())
  setTimeout(() => { if (overlay.parentNode) overlay.remove() }, 1800)
}
