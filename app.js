import express from 'express'
import cors from 'cors'
import { Redis } from 'ioredis'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'

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

function sha256(str) {
  return createHash('sha256').update(str).digest('hex')
}

const DEFAULT_PASSWORD = 'mewmew'

// Ensure default password is set in Redis
async function initPassword() {
  const exists = await redis.exists('app:password')
  if (!exists) {
    await redis.set('app:password', sha256(DEFAULT_PASSWORD))
    console.log('🔐 Default password set in Redis')
  }
}
initPassword()

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// --- Auth middleware ---
app.use('/api', async (req, res, next) => {
  // Skip auth check for the auth endpoint itself
  if (req.path === '/auth') return next()

  const sentPassword = req.headers['x-access-password']
  if (!sentPassword) {
    return res.status(401).json({ error: 'Access password required' })
  }

  try {
    const storedHash = await redis.get('app:password')
    const sentHash = sha256(sentPassword)
    if (sentHash !== storedHash) {
      return res.status(401).json({ error: 'Invalid password' })
    }
    next()
  } catch (err) {
    return res.status(500).json({ error: 'Auth check failed' })
  }
})

// --- Auth endpoint ---
app.post('/api/auth', async (req, res) => {
  try {
    const { password } = req.body
    if (!password) return res.status(400).json({ error: 'Password required' })

    const storedHash = await redis.get('app:password')
    const sentHash = sha256(password)
    if (sentHash !== storedHash) {
      return res.status(401).json({ error: 'Invalid password' })
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Auth failed' })
  }
})

// --- Helpers ---
function today() {
  return new Date().toISOString().slice(0, 10)
}

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function calcXpForTask(priority) {
  return { high: 25, medium: 15, low: 10 }[priority] || 10
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

// --- Build todo object helper ---
async function buildTodo(id) {
  const data = await redis.hgetall(`todo:${id}`)
  if (!data || !data.name) return null
  return {
    id,
    name: data.name,
    emoji: data.emoji || '✅',
    priority: data.priority || 'medium',
    dueDate: data.dueDate || null,
    completed: data.completed === 'true',
    completedAt: data.completedAt || null,
    xpEarned: parseInt(data.xpEarned || '0', 10),
    created_at: data.created_at
  }
}

async function buildXp() {
  const totalXP = parseInt(await redis.get('user:xp') || '0', 10)
  return calcXpProgress(totalXP)
}

async function getTotalXp() {
  return parseInt(await redis.get('user:xp') || '0', 10)
}

async function setTotalXp(total) {
  await redis.set('user:xp', Math.max(0, total))
}

// --- API Routes ---

// GET /api/todos
app.get('/api/todos', async (req, res) => {
  try {
    const ids = await redis.zrevrange('todos:all', 0, -1)
    if (!ids.length) return res.json({ todos: [], xp: await buildXp() })

    const results = await Promise.all(ids.map(id => buildTodo(id)))
    const todos = results.filter(Boolean)

    res.json({ todos, xp: await buildXp() })
  } catch (err) {
    console.error('GET /api/todos error:', err)
    res.status(500).json({ error: 'Failed to fetch todos' })
  }
})

// POST /api/todos
app.post('/api/todos', async (req, res) => {
  try {
    const { name, emoji, priority, dueDate } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Task name is required' })
    }
    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority' })
    }
    const due = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null

    const id = randomId()
    const now = new Date().toISOString()

    await redis.pipeline()
      .hset(`todo:${id}`, {
        name: name.trim(),
        emoji: emoji || '✅',
        priority: priority || 'medium',
        dueDate: due || '',
        completed: 'false',
        completedAt: '',
        xpEarned: '0',
        created_at: now
      })
      .zadd('todos:all', Date.now(), id)
      .exec()

    res.json({
      id, name: name.trim(), emoji: emoji || '✅',
      priority: priority || 'medium', dueDate: due,
      completed: false, completedAt: null, xpEarned: 0, created_at: now
    })
  } catch (err) {
    console.error('POST /api/todos error:', err)
    res.status(500).json({ error: 'Failed to create todo' })
  }
})

// DELETE /api/todos/:id
app.delete('/api/todos/:id', async (req, res) => {
  try {
    const { id } = req.params
    const todo = await buildTodo(id)
    if (!todo) return res.status(404).json({ error: 'Todo not found' })

    // Refund XP if the task was completed
    if (todo.completed && todo.xpEarned > 0) {
      await setTotalXp((await getTotalXp()) - todo.xpEarned)
    }

    await redis.pipeline()
      .del(`todo:${id}`)
      .zrem('todos:all', id)
      .exec()

    res.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/todos error:', err)
    res.status(500).json({ error: 'Failed to delete todo' })
  }
})

// POST /api/todos/:id/complete
app.post('/api/todos/:id/complete', async (req, res) => {
  try {
    const { id } = req.params
    const todo = await buildTodo(id)
    if (!todo) return res.status(404).json({ error: 'Todo not found' })
    if (todo.completed) return res.status(400).json({ error: 'Task already completed' })

    const date = today()
    const xpGained = calcXpForTask(todo.priority)
    const totalXp = (await getTotalXp()) + xpGained

    await redis.pipeline()
      .hset(`todo:${id}`, {
        completed: 'true',
        completedAt: date,
        xpEarned: String(xpGained)
      })
      .set('user:xp', String(totalXp))
      .exec()

    res.json({
      success: true,
      xpGained,
      xp: calcXpProgress(totalXp),
      todo: { ...todo, completed: true, completedAt: date, xpEarned: xpGained }
    })
  } catch (err) {
    console.error('POST /api/todos/:id/complete error:', err)
    res.status(500).json({ error: 'Failed to complete todo' })
  }
})

// DELETE /api/todos/:id/complete — undo completion
app.delete('/api/todos/:id/complete', async (req, res) => {
  try {
    const { id } = req.params
    const todo = await buildTodo(id)
    if (!todo) return res.status(404).json({ error: 'Todo not found' })
    if (!todo.completed) return res.status(400).json({ error: 'Task is not completed' })

    const totalXp = (await getTotalXp()) - todo.xpEarned

    await redis.pipeline()
      .hset(`todo:${id}`, {
        completed: 'false',
        completedAt: '',
        xpEarned: '0'
      })
      .set('user:xp', String(Math.max(0, totalXp)))
      .exec()

    res.json({
      success: true,
      xpLost: todo.xpEarned,
      xp: calcXpProgress(Math.max(0, totalXp)),
      todo: { ...todo, completed: false, completedAt: null, xpEarned: 0 }
    })
  } catch (err) {
    console.error('DELETE /api/todos/:id/complete error:', err)
    res.status(500).json({ error: 'Failed to undo todo' })
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
    const ids = await redis.zrevrange('todos:all', 0, -1)
    const totalXP = await getTotalXp()

    const todos = []
    for (const id of ids) {
      const t = await buildTodo(id)
      if (t) todos.push(t)
    }

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

    const active = todos.filter(t => !t.completed)
    const completed = todos.filter(t => t.completed)
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

    const completedCount = todos.length > 0 ? completed.length : 0
    const completionRate = todos.length > 0 ? Math.round((completed.length / todos.length) * 100) : 0

    res.json({
      totalTodos: todos.length,
      activeTodos: active.length,
      completedTodos: completedCount,
      overdueCount: overdue.length,
      dueTodayCount: dueToday.length,
      completionRate,
      totalXP,
      weekXP,
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
    const ids = await redis.zrevrange('todos:all', 0, -1)
    const totalXP = await getTotalXp()

    const todos = []
    for (const id of ids) {
      const t = await buildTodo(id)
      if (t) todos.push(t)
    }

    const todayStr = today()
    const active = todos.filter(t => !t.completed)
    const dueToday = active.filter(t => t.dueDate === todayStr)
    const overdue = active.filter(t => t.dueDate && t.dueDate < todayStr)
    const completedToday = todos.filter(t => t.completed && t.completedAt === todayStr)

    let xpToday = 0
    for (const t of completedToday) {
      xpToday += t.xpEarned || 0
    }

    const now = new Date()
    const dateStr = now.toLocaleDateString('en', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })

    res.json({
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
    })
  } catch (err) {
    console.error('GET /api/digest error:', err)
    res.status(500).json({ error: 'Failed to get digest' })
  }
})

export default app
