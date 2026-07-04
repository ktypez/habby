// --- Streak ---
export function calculateStreak(dates, todayDate) {
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

// --- XP & Levels ---
export function calcXpForCheckin(streak) {
  return 10 + Math.min(streak, 30)
}

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
