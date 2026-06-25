import { atom, useAtom } from 'jotai'
import { HabitData, AppState, HabitSection, Habit } from '../lib/types'

// Application state atoms
export const appStateAtom = atom<AppState>({} as AppState)
export const loadingAtom = atom(false)
export const errorAtom = atom<string | null>(null)

// Day selector
export const currentDateAtom = atom(new Date().toISOString().split('T')[0])
export const viewModeAtom = atom<'day' | 'week' | 'month'>('day')
export const activeTabAtom = atom<'habits' | 'stats' | 'achievements'>('habits')

export { useAtom }