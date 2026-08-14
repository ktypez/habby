import express from 'express'
import cors from 'cors'
import { Redis } from 'ioredis'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  PRIORITIES,
  REPEAT_OPTIONS,
  ACHIEVEMENTS,
  calcXpForTask,
  calcLevel,
  calcXpProgress,
  nextDueDate,
  todayStr,
  WEEK_GOAL,
  checkNewAchievements
} from './lib/logic.js'

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
function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

async function buildTodo(id) {
  const data = await redis.hgetall(`todo:${id}`)
  if (!data || !data.name) return null
  return {
    id,
    name: data.name,
    priority: data.priority || 'medium',
    dueDate: data.dueDate || null,
    completed: data.completed === 'true',
    completedAt: data.completedAt || null,
    xpEarned: parseInt(data.xpEarned || '0', 10),
    repeat: data.repeat || 'none',
    notes: data.notes || '',
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

async function getCompletedCount() {
  return parseInt(await redis.get('user:completed') || '0', 10)
}

async function setCompletedCount(n) {
  await redis.set('user:completed', Math.max(0, n))
}

// --- Streak ---
const STREAK_SCAN_DAYS = 400

async function completionCountsByDay() {
  const pipe = redis.pipeline()
  const keys = []
  const now = new Date()
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  for (let i = 0; i < STREAK_SCAN_DAYS; i++) {
    const key = 'completed:' + new Date(todayUtc - i * 86400000).toISOString().slice(0, 10)
    keys.push(key)
    pipe.scard(key)
  }
  const results = await pipe.exec()
  return keys.map((k, i) => {
    const r = results[i] && results[i][1]
    return { date: k.slice('completed:'.length), count: r instanceof Error ? 0 : r || 0 }
  })
}

async function computeCurrentStreak() {
  const days = await completionCountsByDay()
  const todayCount = days[0].count
  const yesterdayCount = days[1] ? days[1].count : 0
  let i = todayCount > 0 ? 0 : (yesterdayCount > 0 ? 1 : -1)
  if (i === -1) return 0
  let current = 0
  for (; i < days.length; i++) {
    if (days[i].count > 0) current++
    else break
  }
  return current
}

async function getStreak() {
  const current = await computeCurrentStreak()
  const longest = parseInt(await redis.get('streak:longest') || '0', 10)
  return { current, longest }
}

async function updateStreakLongest() {
  const current = await computeCurrentStreak()
  const longest = parseInt(await redis.get('streak:longest') || '0', 10)
  if (current > longest) await redis.set('streak:longest', String(current))
  return { current, longest: Math.max(longest, current) }
}

// --- Achievements ---
async function getUnlockedIds() {
  return redis.smembers('achievements:unlocked')
}

async function persistUnlocks(ids) {
  if (!ids.length) return
  await redis.sadd('achievements:unlocked', ...ids)
}

// --- Weekly goal ---
async function getWeekDone() {
  const days = await completionCountsByDay()
  return days.slice(0, 7).reduce((sum, d) => sum + d.count, 0)
}

// --- Perfect day check ---
async function isPerfectDay(justCompletedId) {
  const ids = await redis.zrevrange('todos:all', 0, -1)
  const today = todayStr()
  for (const id of ids) {
    if (id === justCompletedId) continue
    const t = await buildTodo(id)
    if (t && !t.completed && t.dueDate && t.dueDate <= today) return false
  }
  return true
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
    const { name, priority, dueDate, notes, repeat } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Task name is required' })
    }
    if (priority && !PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority' })
    }
    if (repeat && !REPEAT_OPTIONS.includes(repeat)) {
      return res.status(400).json({ error: 'Invalid repeat' })
    }
    const due = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null

    const id = randomId()
    const now = new Date().toISOString()

    await redis.pipeline()
      .hset(`todo:${id}`, {
        name: name.trim().slice(0, 120),
        priority: priority || 'medium',
        dueDate: due || '',
        completed: 'false',
        completedAt: '',
        xpEarned: '0',
        repeat: repeat || 'none',
        notes: (notes || '').slice(0, 500),
        created_at: now
      })
      .zadd('todos:all', Date.now(), id)
      .exec()

    res.json({
      id, name: name.trim().slice(0, 120),
      priority: priority || 'medium', dueDate: due,
      completed: false, completedAt: null, xpEarned: 0,
      repeat: repeat || 'none', notes: (notes || '').slice(0, 500),
      created_at: now
    })
  } catch (err) {
    console.error('POST /api/todos error:', err)
    res.status(500).json({ error: 'Failed to create todo' })
  }
})

// PATCH /api/todos/:id
app.patch('/api/todos/:id', async (req, res) => {
  try {
    const { id } = req.params
    const todo = await buildTodo(id)
    if (!todo) return res.status(404).json({ error: 'Todo not found' })

    const { name, priority, dueDate, notes, repeat } = req.body
    const fields = {}

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Task name cannot be empty' })
      fields.name = name.trim().slice(0, 120)
    }
    if (priority !== undefined) {
      if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority' })
      fields.priority = priority
    }
    if (dueDate !== undefined) {
      if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return res.status(400).json({ error: 'Invalid due date' })
      }
      fields.dueDate = dueDate || ''
    }
    if (notes !== undefined) fields.notes = String(notes).slice(0, 500)
    if (repeat !== undefined) {
      if (!REPEAT_OPTIONS.includes(repeat)) return res.status(400).json({ error: 'Invalid repeat' })
      fields.repeat = repeat
    }

    if (Object.keys(fields).length) {
      await redis.hset(`todo:${id}`, fields)
    }

    res.json({ success: true, todo: await buildTodo(id) })
  } catch (err) {
    console.error('PATCH /api/todos error:', err)
    res.status(500).json({ error: 'Failed to update todo' })
  }
})

// DELETE /api/todos/:id
app.delete('/api/todos/:id', async (req, res) => {
  try {
    const { id } = req.params
    const todo = await buildTodo(id)
    if (!todo) return res.status(404).json({ error: 'Todo not found' })

    if (todo.completed && todo.xpEarned > 0) {
      await setTotalXp((await getTotalXp()) - todo.xpEarned)
      await setCompletedCount((await getCompletedCount()) - 1)
      await redis.srem(`completed:${todo.completedAt}`, id)
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

// POST /api/todos/clear-done
app.post('/api/todos/clear-done', async (req, res) => {
  try {
    const ids = await redis.zrevrange('todos:all', 0, -1)
    let removed = 0
    for (const id of ids) {
      const t = await buildTodo(id)
      if (!t || !t.completed) continue
      await redis.pipeline()
        .del(`todo:${id}`)
        .zrem('todos:all', id)
        .srem(`completed:${t.completedAt}`, id)
        .exec()
      removed++
    }
    res.json({ success: true, removed })
  } catch (err) {
    console.error('POST /api/todos/clear-done error:', err)
    res.status(500).json({ error: 'Failed to clear completed tasks' })
  }
})

// POST /api/todos/:id/complete
app.post('/api/todos/:id/complete', async (req, res) => {
  try {
    const { id } = req.params
    const todo = await buildTodo(id)
    if (!todo) return res.status(404).json({ error: 'Todo not found' })
    if (todo.completed) return res.status(400).json({ error: 'Task already completed' })

    const date = todayStr()
    const xpGained = calcXpForTask(todo.priority)
    const totalXp = (await getTotalXp()) + xpGained
    const totalCompleted = (await getCompletedCount()) + 1

    await redis.pipeline()
      .hset(`todo:${id}`, { completed: 'true', completedAt: date, xpEarned: String(xpGained) })
      .set('user:xp', String(totalXp))
      .set('user:completed', String(totalCompleted))
      .sadd(`completed:${date}`, id)
      .exec()

    const streak = await updateStreakLongest()
    const weekDone = await getWeekDone()
    const perfectDay = todo.dueDate && todo.dueDate <= date && (await isPerfectDay(id))
    const unlocked = checkNewAchievements(
      { totalCompleted, level: calcLevel(totalXp), streak: streak.current, weekDone, perfectDay },
      await getUnlockedIds()
    )
    if (unlocked.length) await persistUnlocks(unlocked)

    let nextTodo = null
    if (todo.repeat && todo.repeat !== 'none') {
      const nextDue = nextDueDate(todo.dueDate || date, todo.repeat)
      if (nextDue) {
        const nid = randomId()
        const now = new Date().toISOString()
        await redis.pipeline()
          .hset(`todo:${nid}`, {
            name: todo.name, priority: todo.priority,
            dueDate: nextDue, completed: 'false', completedAt: '', xpEarned: '0',
            repeat: todo.repeat, notes: todo.notes || '', created_at: now
          })
          .zadd('todos:all', Date.now(), nid)
          .exec()
        nextTodo = await buildTodo(nid)
      }
    }

    res.json({
      success: true,
      xpGained,
      xp: calcXpProgress(totalXp),
      todo: { ...todo, completed: true, completedAt: date, xpEarned: xpGained },
      nextTodo,
      unlocked,
      streak
    })
  } catch (err) {
    console.error('POST /api/todos/:id/complete error:', err)
    res.status(500).json({ error: 'Failed to complete todo' })
  }
})

// DELETE /api/todos/:id/complete — undo
app.delete('/api/todos/:id/complete', async (req, res) => {
  try {
    const { id } = req.params
    const todo = await buildTodo(id)
    if (!todo) return res.status(404).json({ error: 'Todo not found' })
    if (!todo.completed) return res.status(400).json({ error: 'Task is not completed' })

    const totalXp = (await getTotalXp()) - todo.xpEarned
    const totalCompleted = Math.max(0, (await getCompletedCount()) - 1)

    await redis.pipeline()
      .hset(`todo:${id}`, { completed: 'false', completedAt: '', xpEarned: '0' })
      .set('user:xp', String(Math.max(0, totalXp)))
      .set('user:completed', String(totalCompleted))
      .srem(`completed:${todo.completedAt}`, id)
      .exec()

    const streak = await getStreak()

    res.json({
      success: true,
      xpLost: todo.xpEarned,
      xp: calcXpProgress(Math.max(0, totalXp)),
      todo: { ...todo, completed: false, completedAt: null, xpEarned: 0 },
      streak
    })
  } catch (err) {
    console.error('DELETE /api/todos/:id/complete error:', err)
    res.status(500).json({ error: 'Failed to undo todo' })
  }
})

// GET /api/streak
app.get('/api/streak', async (req, res) => {
  try {
    res.json(await getStreak())
  } catch (err) {
    console.error('GET /api/streak error:', err)
    res.status(500).json({ error: 'Failed to get streak' })
  }
})

// GET /api/achievements
app.get('/api/achievements', async (req, res) => {
  try {
    const unlocked = new Set(await getUnlockedIds())
    res.json({
      achievements: ACHIEVEMENTS.map(a => ({ ...a, unlocked: unlocked.has(a.id) }))
    })
  } catch (err) {
    console.error('GET /api/achievements error:', err)
    res.status(500).json({ error: 'Failed to get achievements' })
  }
})

// GET /api/export
app.get('/api/export', async (req, res) => {
  try {
    const ids = await redis.zrevrange('todos:all', 0, -1)
    const todos = (await Promise.all(ids.map(id => buildTodo(id)))).filter(Boolean)
    res.json({
      version: 2,
      exportedAt: new Date().toISOString(),
      todos,
      xp: await getTotalXp(),
      totalCompleted: await getCompletedCount(),
      achievements: await getUnlockedIds()
    })
  } catch (err) {
    console.error('GET /api/export error:', err)
    res.status(500).json({ error: 'Failed to export' })
  }
})

// POST /api/import
app.post('/api/import', async (req, res) => {
  try {
    const { mode = 'merge', data } = req.body
    if (!data || !Array.isArray(data.todos)) {
      return res.status(400).json({ error: 'Invalid import data' })
    }
    if (!['merge', 'replace'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode (merge|replace)' })
    }

    let clean = data.todos
      .filter(t => t && typeof t.name === 'string' && t.name.trim())
      .map(t => ({
        id: String(t.id || randomId()),
        name: t.name.trim().slice(0, 120),
        priority: PRIORITIES.includes(t.priority) ? t.priority : 'medium',
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate || '') ? t.dueDate : '',
        completed: !!t.completed,
        completedAt: /^\d{4}-\d{2}-\d{2}$/.test(t.completedAt || '') ? t.completedAt : '',
        xpEarned: parseInt(t.xpEarned || '0', 10),
        repeat: REPEAT_OPTIONS.includes(t.repeat) ? t.repeat : 'none',
        notes: String(t.notes || '').slice(0, 500),
        created_at: t.created_at || new Date().toISOString()
      }))

    if (mode === 'replace') {
      const existing = await redis.zrevrange('todos:all', 0, -1)
      if (existing.length) {
        const pipe = redis.pipeline()
        for (const id of existing) pipe.del(`todo:${id}`)
        pipe.del('todos:all')
        await pipe.exec()
      }
      const doneKeys = await redis.keys('completed:*')
      if (doneKeys.length) await redis.del(doneKeys)
      await redis.del('streak:longest')
      const importedXp = parseInt(data.xp || '0', 10)
      const importedCompleted = parseInt(data.totalCompleted || '0', 10)
      await redis.set('user:xp', String(importedXp))
      await redis.set('user:completed', String(importedCompleted))
      if (Array.isArray(data.achievements)) {
        await redis.del('achievements:unlocked')
        if (data.achievements.length) await redis.sadd('achievements:unlocked', ...data.achievements.map(String))
      }
    } else {
      const existing = new Set(await redis.zrevrange('todos:all', 0, -1))
      const fresh = clean.filter(t => !existing.has(t.id))
      clean = fresh
    }

    let added = 0
    for (const t of clean) {
      await redis.pipeline()
        .hset(`todo:${t.id}`, {
          name: t.name, priority: t.priority,
          dueDate: t.dueDate, completed: String(t.completed), completedAt: t.completedAt,
          xpEarned: String(t.xpEarned), repeat: t.repeat, notes: t.notes, created_at: t.created_at
        })
        .zadd('todos:all', t.created_at ? new Date(t.created_at).getTime() : Date.now(), t.id)
        .exec()
      if (t.completed && t.completedAt) {
        await redis.sadd(`completed:${t.completedAt}`, t.id)
      }
      added++
    }

    const importedStreak = await computeCurrentStreak()
    const storedLongest = parseInt(await redis.get('streak:longest') || '0', 10)
    if (importedStreak > storedLongest) await redis.set('streak:longest', String(importedStreak))

    res.json({ success: true, added, xp: await buildXp() })
  } catch (err) {
    console.error('POST /api/import error:', err)
    res.status(500).json({ error: 'Failed to import' })
  }
})

// --- STATS ---
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
    const today = todayStr()
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const weekDates = []
    for (let i = 6; i >= 0; i--) {
      weekDates.push(new Date(todayUtc - i * 86400000).toISOString().slice(0, 10))
    }

    const active = todos.filter(t => !t.completed)
    const completed = todos.filter(t => t.completed)
    const overdue = active.filter(t => t.dueDate && t.dueDate < today)
    const dueToday = active.filter(t => t.dueDate === today)

    const weekDailyCounts = weekDates.map(() => 0)
    const weekDailyXp = weekDates.map(() => 0)
    let weekXP = 0
    for (const t of completed) {
      if (t.completedAt && t.completedAt >= weekDates[0]) {
        const day = (t.completedAt || '').slice(0, 10)
        const idx = weekDates.indexOf(day)
        if (idx !== -1) {
          weekDailyCounts[idx]++
          weekDailyXp[idx] += t.xpEarned || 0
        }
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
      totalCompleted: await getCompletedCount(),
      weekXP,
      weekDailyCounts,
      weekDailyXp,
      weekDates,
      weekGoal: { target: WEEK_GOAL, done: await getWeekDone() },
      streak: await getStreak()
    })
  } catch (err) {
    console.error('GET /api/stats error:', err)
    res.status(500).json({ error: 'Failed to get stats' })
  }
})

// --- DIGEST ---
app.get('/api/digest', async (req, res) => {
  try {
    const ids = await redis.zrevrange('todos:all', 0, -1)
    const totalXP = await getTotalXp()

    const todos = []
    for (const id of ids) {
      const t = await buildTodo(id)
      if (t) todos.push(t)
    }

    const today = todayStr()
    const active = todos.filter(t => !t.completed)
    const dueToday = active.filter(t => t.dueDate === today)
    const overdue = active.filter(t => t.dueDate && t.dueDate < today)
    const completedToday = todos.filter(t => t.completed && t.completedAt === today)

    let xpToday = 0
    for (const t of completedToday) xpToday += t.xpEarned || 0

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
      dueToday: dueToday.map(t => ({ id: t.id, name: t.name, priority: t.priority })),
      overdue: overdue.map(t => ({ id: t.id, name: t.name, priority: t.priority, dueDate: t.dueDate })),
      completedToday: completedToday.map(t => ({ id: t.id, name: t.name, priority: t.priority }))
    })
  } catch (err) {
    console.error('GET /api/digest error:', err)
    res.status(500).json({ error: 'Failed to get digest' })
  }
})

// --- Serve static frontend ---
const distDir = join(__dirname, 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      const index = join(distDir, 'index.html')
      if (existsSync(index)) res.sendFile(index)
      else res.status(404).send('Frontend not built. Run `npm run build` first.')
    } else next()
  })
}

export default app
