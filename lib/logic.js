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
