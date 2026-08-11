// ============================================
// HABBY — migration to v2 (streaks & achievements)
// Backfills completed:{date} sets + user:completed + streak:longest
// from existing todos that carry completedAt / xpEarned.
//
// Idempotent — safe to run multiple times.
// Usage: node scripts/migrate-v2.mjs   (REDIS_URL env or default localhost)
// ============================================

import { Redis } from 'ioredis'
import { calcStreak, todayStr } from '../lib/logic.js'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 })

async function buildTodo(id) {
  const data = await redis.hgetall(`todo:${id}`)
  if (!data || !data.name) return null
  return {
    id,
    completed: data.completed === 'true',
    completedAt: data.completedAt || null,
    xpEarned: parseInt(data.xpEarned || '0', 10)
  }
}

async function main() {
  console.log('🔄 Starting v2 migration...')

  const ids = await redis.zrevrange('todos:all', 0, -1)
  console.log(`📋 Found ${ids.length} todos`)

  const dates = new Set()
  let xpTotal = 0
  let completedCount = 0

  const pipe = redis.pipeline()
  for (const id of ids) {
    const t = await buildTodo(id)
    if (!t) continue
    if (t.completed && t.completedAt) {
      pipe.sadd(`completed:${t.completedAt}`, id)
      dates.add(t.completedAt)
      xpTotal += t.xpEarned || 0
      completedCount++
    }
  }
  await pipe.exec()

  // Streak from backfilled dates
  const streak = calcStreak(dates, todayStr())
  await redis.set('streak:longest', String(Math.max(streak.longest, parseInt(await redis.get('streak:longest') || '0', 10))))

  // Only touch counters if they were never set (don't clobber newer data)
  const xpExists = await redis.exists('user:xp')
  const compExists = await redis.exists('user:completed')
  if (!xpExists) await redis.set('user:xp', String(xpTotal))
  if (!compExists) await redis.set('user:completed', String(completedCount))

  console.log(`✅ done: ${dates.size} completion dates backfilled, ${completedCount} completed todos, streak longest ${streak.longest}`)
  if (dates.size === 0) console.log('ℹ️ No completed todos found — nothing to backfill (fresh start).')
  process.exit(0)
}

main().catch(err => {
  console.error('❌ Migration failed:', err.message)
  process.exit(1)
})
