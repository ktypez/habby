#!/usr/bin/env node
/**
 * Migration script: Clean up orphaned archived habits from Redis.
 *
 * The archive feature was removed from the frontend, but existing archived habits
 * may still exist in Redis with `archived: 'true'`. These habits are invisible
 * (no UI to access them) but still take up space and appear in stats as "archived".
 *
 * This script finds and permanently deletes them.
 *
 * Usage:
 *   node scripts/cleanup-archived.mjs              # dry run (default)
 *   node scripts/cleanup-archived.mjs --apply      # actually delete
 *   REDIS_URL=redis://... node scripts/cleanup-archived.mjs --apply
 */

import { Redis } from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const isApply = process.argv.includes('--apply')

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 5) return null
    return Math.min(times * 100, 3000)
  }
})

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message)
  process.exit(1)
})

/**
 * Delete all Redis keys associated with a habit ID.
 */
async function deleteHabitKeys(id) {
  const dates = await redis.smembers(`habit:${id}:dates`)

  const pipe = redis.pipeline()
    .del(`habit:${id}`)                 // habit hash
    .del(`habit:${id}:dates`)           // check-in dates set
    .del(`habit:${id}:timer:running`)   // running timer (start timestamp)
    .del(`habit:${id}:timer:total`)     // accumulated timer seconds
    .zrem('habits:all', id)             // remove from master list

  // Delete daily notes for this habit
  for (const d of dates) {
    pipe.del(`habit:${id}:note:${d}`)
  }

  await pipe.exec()
}

/**
 * Scan Redis for all sub-keys related to a habit ID.
 * Used for orphaned habits where the hash key exists but the ID isn't in habits:all.
 */
async function deleteOrphanedSubKeys(id) {
  // Collect all keys matching habit:{id}:* patterns
  const keysToDelete = []
  let cursor = '0'
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `habit:${id}:*`, 'COUNT', 100)
    cursor = nextCursor
    keysToDelete.push(...keys)
  } while (cursor !== '0')

  // Also delete the hash key itself and remove from habits:all
  const pipe = redis.pipeline()
  pipe.del(`habit:${id}`) // the hash key itself
  for (const key of keysToDelete) {
    pipe.del(key)
  }
  pipe.zrem('habits:all', id)
  await pipe.exec()

  return 1 + keysToDelete.length // hash key + sub-keys
}

async function main() {
  console.log(`🔗 Connected to Redis${isApply ? '' : ' (DRY RUN — pass --apply to execute)'}\n`)

  // Get all habit IDs from the master sorted set
  const ids = await redis.zrevrange('habits:all', 0, -1)
  console.log(`Found ${ids.length} total habit(s) in habits:all\n`)

  // --- Phase 1: Delete archived habits ---
  let archivedCount = 0
  let deletedCount = 0
  const deletedHabits = []

  for (const id of ids) {
    const data = await redis.hgetall(`habit:${id}`)
    if (!data || !data.name) {
      console.log(`  ⚠️  Orphaned ID "${id}" — in sorted set but no habit hash data`)
      if (isApply) {
        await redis.zrem('habits:all', id)
        deletedCount++
      }
      continue
    }

    if (data.archived === 'true') {
      archivedCount++
      const habitInfo = `${data.emoji || '✅'} "${data.name}" (id: ${id}, created: ${data.created_at || 'unknown'})`
      console.log(`  🗑️  ${habitInfo}`)

      if (isApply) {
        await deleteHabitKeys(id)
        deletedHabits.push({ id, name: data.name, emoji: data.emoji })
        deletedCount++
      }
    }
  }

  console.log('')
  if (archivedCount === 0) {
    console.log('✅ No archived habits found — nothing to clean up.')
  } else if (isApply) {
    console.log(`✅ Deleted ${deletedCount} archived habit(s) permanently.`)
    for (const h of deletedHabits) {
      console.log(`   • ${h.emoji || '✅'} ${h.name}`)
    }
  } else {
    console.log(`📋 Found ${archivedCount} archived habit(s) ready for cleanup.`)
    console.log(`   Run with --apply to permanently delete them.`)
  }

  // --- Phase 2: Find orphaned habit hash keys not in habits:all ---
  console.log('')
  const scanKeys = []
  let cursor = '0'
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'habit:*', 'COUNT', 100)
    cursor = nextCursor
    scanKeys.push(...keys)
  } while (cursor !== '0')

  // Filter to just habit hash keys (habit:{id} — no colon in the ID part)
  const habitHashKeys = scanKeys.filter(k => /^habit:[a-z0-9]+$/.test(k))
  const orphanedIds = []
  for (const key of habitHashKeys) {
    const id = key.split(':')[1]
    if (!ids.includes(id)) {
      orphanedIds.push(id)
    }
  }

  if (orphanedIds.length > 0) {
    let totalSubKeys = 0
    console.log(`⚠️  Found ${orphanedIds.length} orphaned habit hash key(s) (not in habits:all):`)
    for (const id of orphanedIds) {
      console.log(`   • habit:${id} — will be deleted with all sub-keys`)
      if (isApply) {
        totalSubKeys += await deleteOrphanedSubKeys(id)
      }
    }
    if (isApply) {
      console.log(`   ✅ Removed ${totalSubKeys} total key(s) for ${orphanedIds.length} orphaned habit(s).`)
    } else {
      console.log(`   Run with --apply to delete these along with all sub-keys.`)
    }
  } else {
    console.log('✅ No orphaned habit hash keys found.')
  }

  await redis.quit()
}

main().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})
