import express from 'express'
import cors from 'cors'
import { Redis } from 'ioredis'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 5) return null
    return Math.min(times * 100, 3000)
  }
})

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message)
})

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// --- Helpers ---
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

// --- XP & Levels ---
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


// --- Build habit object helper ---
async function buildHabit(id) {
  const data = await redis.hgetall(`habit:${id}`)
  if (!data || !data.name) return null

  const dates = await redis.smembers(`habit:${id}:dates`)
  const timerRunning = await redis.get(`habit:${id}:timer:running`)
  const timerTotal = parseInt(await redis.get(`habit:${id}:timer:total`) || '0', 10)
  const noteToday = await redis.get(`habit:${id}:note:${today()}`)

  return {
    id,
    name: data.name,
    emoji: data.emoji || '✅',
    color: data.color || '#FF3366',
    archived: data.archived === 'true',
    created_at: data.created_at,
    streak: calculateStreak(dates, today()),
    checkedToday: dates.includes(today()),
    dates: dates.sort().reverse().slice(0, 60),
    timerRunning: timerRunning ? parseInt(timerRunning, 10) : null,
    timerTotal: timerTotal,
    noteToday: noteToday || null
  }
}

async function buildXp() {
  const totalXP = parseInt(await redis.get('user:xp') || '0', 10)
  return calcXpProgress(totalXP)
}

// --- API Routes ---

// GET /api/habits
app.get('/api/habits', async (req, res) => {
  try {
    const ids = await redis.zrevrange('habits:all', 0, -1)
    if (!ids.length) return res.json({ habits: [], xp: await buildXp() })

    const results = await Promise.all(ids.map(id => buildHabit(id)))
    const habits = results.filter(Boolean)

    res.json({ habits, xp: await buildXp() })
  } catch (err) {
    console.error('GET /api/habits error:', err)
    res.status(500).json({ error: 'Failed to fetch habits' })
  }
})

// POST /api/habits
app.post('/api/habits', async (req, res) => {
  try {
    const { name, emoji, color } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Habit name is required' })
    }

    const id = randomId()
    const now = new Date().toISOString()

    await redis.pipeline()
      .hset(`habit:${id}`, {
        name: name.trim(), emoji: emoji || '✅',
        color: color || '#FF3366',
        archived: 'false', created_at: now
      })
      .zadd('habits:all', Date.now(), id)
      .exec()

    res.json({
      id, name: name.trim(), emoji: emoji || '✅',
      color: color || '#FF3366',
      archived: false,
      created_at: now, streak: 0, checkedToday: false, dates: [],
      timerRunning: null, timerTotal: 0, noteToday: null
    })
  } catch (err) {
    console.error('POST /api/habits error:', err)
    res.status(500).json({ error: 'Failed to create habit' })
  }
})

// DELETE /api/habits/:id
app.delete('/api/habits/:id', async (req, res) => {
  try {
    const { id } = req.params
    const dates = await redis.smembers(`habit:${id}:dates`)
    const totalXp = parseInt(await redis.get('user:xp') || '0', 10)
    let xpDeduction = 0
    let streakAccum = 0
    for (const d of dates.sort()) {
      streakAccum++
      xpDeduction += calcXpForCheckin(streakAccum)
    }
    await redis.set('user:xp', Math.max(0, totalXp - xpDeduction))

    // Clean up notes
    const pipe = redis.pipeline()
      .del(`habit:${id}`)
      .del(`habit:${id}:dates`)
      .del(`habit:${id}:timer:running`)
      .del(`habit:${id}:timer:total`)
      .zrem('habits:all', id)
    // Delete all notes for this habit
    for (const d of dates) {
      pipe.del(`habit:${id}:note:${d}`)
    }
    await pipe.exec()
    res.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/habits error:', err)
    res.status(500).json({ error: 'Failed to delete habit' })
  }
})

// PUT /api/habits/:id/archive
app.put('/api/habits/:id/archive', async (req, res) => {
  try {
    const { id } = req.params
    const { archived } = req.body
    await redis.hset(`habit:${id}`, 'archived', archived ? 'true' : 'false')
    res.json({ success: true, archived: !!archived })
  } catch (err) {
    console.error('PUT /api/habits/:id/archive error:', err)
    res.status(500).json({ error: 'Failed to update archive status' })
  }
})

// POST /api/habits/:id/checkin
app.post('/api/habits/:id/checkin', async (req, res) => {
  try {
    const { id } = req.params
    const date = today()
    await redis.sadd(`habit:${id}:dates`, date)

    const dates = await redis.smembers(`habit:${id}:dates`)
    const streak = calculateStreak(dates, date)
    const xpGained = calcXpForCheckin(streak)

    const totalXp = parseInt(await redis.get('user:xp') || '0', 10)
    await redis.set('user:xp', totalXp + xpGained)

    // Check for note
    const noteToday = await redis.get(`habit:${id}:note:${date}`)

    res.json({
      success: true, checkedToday: true, streak,
      xpGained, xp: calcXpProgress(totalXp + xpGained),
      dates: dates.sort().reverse().slice(0, 60),
      noteToday: noteToday || null
    })
  } catch (err) {
    console.error('POST /api/habits/:id/checkin error:', err)
    res.status(500).json({ error: 'Failed to check in' })
  }
})

// DELETE /api/habits/:id/checkin
app.delete('/api/habits/:id/checkin', async (req, res) => {
  try {
    const { id } = req.params
    const date = today()
    await redis.srem(`habit:${id}:dates`, date)

    const dates = await redis.smembers(`habit:${id}:dates`)
    const streak = calculateStreak(dates, date)

    const xpLost = calcXpForCheckin(streak + 1)
    const totalXp = parseInt(await redis.get('user:xp') || '0', 10)
    await redis.set('user:xp', Math.max(0, totalXp - xpLost))

    res.json({
      success: true, checkedToday: false, streak,
      xpLost, xp: calcXpProgress(Math.max(0, totalXp - xpLost)),
      dates: dates.sort().reverse().slice(0, 60)
    })
  } catch (err) {
    console.error('DELETE /api/habits/:id/checkin error:', err)
    res.status(500).json({ error: 'Failed to undo check-in' })
  }
})

// --- NOTES ---

// PUT /api/habits/:id/note - Save note for today
app.put('/api/habits/:id/note', async (req, res) => {
  try {
    const { id } = req.params
    const { text } = req.body
    const date = today()

    if (text && text.trim()) {
      await redis.set(`habit:${id}:note:${date}`, text.trim())
    } else {
      await redis.del(`habit:${id}:note:${date}`)
    }

    res.json({ success: true, note: text?.trim() || null })
  } catch (err) {
    console.error('PUT /api/habits/:id/note error:', err)
    res.status(500).json({ error: 'Failed to save note' })
  }
})

// GET /api/habits/:id/note/:date
app.get('/api/habits/:id/note/:date', async (req, res) => {
  try {
    const { id, date } = req.params
    const note = await redis.get(`habit:${id}:note:${date}`)
    res.json({ note: note || null })
  } catch (err) {
    console.error('GET /api/habits/:id/note/:date error:', err)
    res.status(500).json({ error: 'Failed to get note' })
  }
})

// --- TIMER ---

app.post('/api/habits/:id/timer/start', async (req, res) => {
  try {
    const { id } = req.params
    const now = Date.now()
    await redis.set(`habit:${id}:timer:running`, String(now))
    res.json({ success: true, startTime: now })
  } catch (err) {
    console.error('POST timer/start error:', err)
    res.status(500).json({ error: 'Failed to start timer' })
  }
})

app.post('/api/habits/:id/timer/stop', async (req, res) => {
  try {
    const { id } = req.params
    const startTime = await redis.get(`habit:${id}:timer:running`)
    if (!startTime) return res.status(400).json({ error: 'Timer not running' })

    const now = Date.now()
    const elapsed = Math.floor((now - parseInt(startTime, 10)) / 1000)
    const total = parseInt(await redis.get(`habit:${id}:timer:total`) || '0', 10)
    const newTotal = total + elapsed

    await redis.pipeline()
      .del(`habit:${id}:timer:running`)
      .set(`habit:${id}:timer:total`, String(newTotal))
      .exec()

    res.json({ success: true, elapsed, total: newTotal, startTime: null })
  } catch (err) {
    console.error('POST timer/stop error:', err)
    res.status(500).json({ error: 'Failed to stop timer' })
  }
})

app.get('/api/habits/:id/timer', async (req, res) => {
  try {
    const { id } = req.params
    const running = await redis.get(`habit:${id}:timer:running`)
    const total = parseInt(await redis.get(`habit:${id}:timer:total`) || '0', 10)
    res.json({ running: running ? parseInt(running, 10) : null, total })
  } catch (err) {
    console.error('GET timer error:', err)
    res.status(500).json({ error: 'Failed to get timer status' })
  }
})

// --- NOTIFICATIONS ---

// GET /api/notifications/settings
app.get('/api/notifications/settings', async (req, res) => {
  try {
    const enabled = await redis.get('notifications:enabled')
    const time = await redis.get('notifications:time')
    res.json({
      enabled: enabled === 'true',
      time: time || '09:00'
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to get settings' })
  }
})

// PUT /api/notifications/settings
app.put('/api/notifications/settings', async (req, res) => {
  try {
    const { enabled, time } = req.body
    const pipe = redis.pipeline()
    if (typeof enabled === 'boolean') pipe.set('notifications:enabled', String(enabled))
    if (time) pipe.set('notifications:time', time)
    await pipe.exec()
    res.json({ success: true, enabled, time })
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings' })
  }
})

// --- EXPORT / IMPORT ---

app.get('/api/export', async (req, res) => {
  try {
    const ids = await redis.zrevrange('habits:all', 0, -1)
    const totalXP = parseInt(await redis.get('user:xp') || '0', 10)
    const notifEnabled = await redis.get('notifications:enabled')
    const notifTime = await redis.get('notifications:time')

    const habits = []
    for (const id of ids) {
      const data = await redis.hgetall(`habit:${id}`)
      if (!data || !data.name) continue
      const dates = await redis.smembers(`habit:${id}:dates`)
      const timerTotal = parseInt(await redis.get(`habit:${id}:timer:total`) || '0', 10)
      // Export notes
      const notes = {}
      for (const d of dates) {
        const note = await redis.get(`habit:${id}:note:${d}`)
        if (note) notes[d] = note
      }
      habits.push({
        id, name: data.name, emoji: data.emoji, color: data.color,

        archived: data.archived === 'true',
        created_at: data.created_at, dates, timerTotal, notes
      })
    }

    res.json({
      exported_at: new Date().toISOString(),
      version: 3,
      xp: totalXP,
      notifications: { enabled: notifEnabled === 'true', time: notifTime || '09:00' },
      habits
    })
  } catch (err) {
    console.error('GET /api/export error:', err)
    res.status(500).json({ error: 'Failed to export data' })
  }
})

app.post('/api/import', async (req, res) => {
  try {
    const { habits: importHabits, xp: importXp, notifications } = req.body
    if (!importHabits || !Array.isArray(importHabits)) {
      return res.status(400).json({ error: 'Invalid import format' })
    }

    // Clear all existing data
    const oldIds = await redis.zrevrange('habits:all', 0, -1)
    const pipe = redis.pipeline()
    for (const id of oldIds) {
      const oldDates = await redis.smembers(`habit:${id}:dates`)
      pipe.del(`habit:${id}`)
      pipe.del(`habit:${id}:dates`)
      pipe.del(`habit:${id}:timer:running`)
      pipe.del(`habit:${id}:timer:total`)
      for (const d of oldDates) pipe.del(`habit:${id}:note:${d}`)
    }
    pipe.del('habits:all')
    await pipe.exec()

    // Import new data
    let count = 0
    const importPipe = redis.pipeline()
    for (const h of importHabits) {
      if (!h.name) continue
      const id = h.id || randomId()
      const dates = h.dates || []
      const timerTotal = h.timerTotal || 0

      importPipe.hset(`habit:${id}`, {
        name: String(h.name).trim(),
        emoji: h.emoji || '✅',
        color: h.color || '#FF3366',
        
        archived: h.archived ? 'true' : 'false',
        created_at: h.created_at || new Date().toISOString()
      })
      if (dates.length > 0) importPipe.sadd(`habit:${id}:dates`, ...dates)
      if (timerTotal > 0) importPipe.set(`habit:${id}:timer:total`, String(timerTotal))
      // Import notes
      if (h.notes) {
        for (const [d, note] of Object.entries(h.notes)) {
          importPipe.set(`habit:${id}:note:${d}`, note)
        }
      }
      importPipe.zadd('habits:all', Date.now() + count, id)
      count++
    }
    if (typeof importXp === 'number') importPipe.set('user:xp', String(importXp))
    if (notifications) {
      importPipe.set('notifications:enabled', String(!!notifications.enabled))
      importPipe.set('notifications:time', notifications.time || '09:00')
    }
    await importPipe.exec()

    res.json({ success: true, imported: count })
  } catch (err) {
    console.error('POST /api/import error:', err)
    res.status(500).json({ error: 'Failed to import data' })
  }
})

// --- Serve static frontend in production (local only - Vercel handles this in deployment) ---
const distDir = join(__dirname, 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      const index = join(distDir, 'index.html')
      if (existsSync(index)) res.sendFile(index)
      else res.status(404).send('Frontend not built. Run `yarn build` first.')
    } else next()
  })
}

// --- STATS ---

// GET /api/stats
app.get('/api/stats', async (req, res) => {
  try {
    const ids = await redis.zrevrange('habits:all', 0, -1)
    const totalXP = parseInt(await redis.get('user:xp') || '0', 10)

    const habits = []
    for (const id of ids) {
      const h = await buildHabit(id)
      if (h) habits.push(h)
    }

    const active = habits.filter(h => !h.archived)
    const archived = habits.filter(h => h.archived)

    // Calculate stats
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    // Best streak
    let bestStreak = 0
    let bestStreakName = ''

    // This week check-ins and XP
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

    // Per-day check-in count for this week
    const weekDailyCounts = weekDates.map(() => 0)

    for (const h of active) {
      if (h.streak > bestStreak) {
        bestStreak = h.streak
        bestStreakName = h.name
      }

      const habitDates = h.dates || []
      for (const d of habitDates) {
        const idx = weekDates.indexOf(d)
        if (idx !== -1) weekDailyCounts[idx]++
      }

      // Count this week's total check-ins
      weekCheckins += habitDates.filter(d => d >= weekDates[0] && d <= todayStr).length
    }

    // Total possible days (since each habit was created)
    for (const h of active) {
      const created = new Date(h.created_at || now)
      const daysSince = Math.max(1, Math.round((now - created) / (1000 * 60 * 60 * 24)))
      weekTotalDays += Math.min(7, daysSince)
    }

    const completionRate = weekTotalDays > 0 ? Math.round((weekCheckins / weekTotalDays) * 100) : 0

    // Weekly XP (estimated from check-ins this week)
    const weekXp = weekCheckins * 15

    res.json({
      totalHabits: habits.length,
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
    })
  } catch (err) {
    console.error('GET /api/stats error:', err)
    res.status(500).json({ error: 'Failed to get stats' })
  }
})

// --- DIGEST (today's summary) ---

// GET /api/digest
app.get('/api/digest', async (req, res) => {
  try {
    const ids = await redis.zrevrange('habits:all', 0, -1)
    const totalXP = parseInt(await redis.get('user:xp') || '0', 10)

    const habits = []
    for (const id of ids) {
      const h = await buildHabit(id)
      if (h) habits.push(h)
    }

    const active = habits.filter(h => !h.archived)
    const checked = active.filter(h => h.checkedToday)
    const pending = active.filter(h => !h.checkedToday)

    // XP earned today: sum of recent checkins (estimate via streak calc)
    let xpToday = 0
    for (const h of checked) {
      xpToday += calcXpForCheckin(h.streak)
    }

    // Best streak among active habits
    let bestStreak = 0
    let bestStreakName = ''
    for (const h of active) {
      if (h.streak > bestStreak) {
        bestStreak = h.streak
        bestStreakName = h.name
      }
    }

    // Total streaks (sum of all active streaks)
    const totalStreaks = active.reduce((s, h) => s + h.streak, 0)

    // Today's date formatted
    const now = new Date()
    const dateStr = now.toLocaleDateString('en', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })

    res.json({
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
        streak: h.streak, color: h.color,
        note: h.noteToday
      })),
      pending: pending.map(h => ({
        id: h.id, name: h.name, emoji: h.emoji,
        streak: h.streak, color: h.color,      }))
    })
  } catch (err) {
    console.error('GET /api/digest error:', err)
    res.status(500).json({ error: 'Failed to get digest' })
  }
})

export default app
