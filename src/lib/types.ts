/* Types for habit tracking app */
export type Habit = {
  id: string
  name: string
  icon: string
  comment: string
  section_id: string
  section_icon: string
  section_title: string
  section_color: string
  section_comment: string
  flame: number
  time: string
  frac: string
  name_color: string
  sort_order: number
  checked: boolean
}

export type HabitSection = {
  id: string
  icon: string
  title: string
  titleColor: string
  comment: string
  habits: Habit[]
}

export type HabitData = {
  sections: HabitSection[]
  week: WeekDay[]
  meta: {
    streak: number
    doneToday: number
    totalToday: number
  }
}

export type WeekDay = {
  date: string
  label: string
  num: number
  pct: number
  state: 'past' | 'today' | 'future'
  full: boolean
}

export type StatsData = {
  daysTracked: number
  avgCompletion: number
  greenDays: number
  currentStreak: number
  bestStreak: number
  completion30d: number
  completionAll: number
  period: string
  dowData: {
    label: string
    pct: number
  }[]
}

/* Application state types */
export type AppState = {
  currentDate: string
  viewMode: 'day' | 'week' | 'month'
  activeTab: 'habits' | 'stats' | 'achievements'
  currentStreak: number
  totalXP: number
  level: number
  sections: HabitSection[]
  weekData: WeekDay[]
  monthViewData: any
  weekViewData: any
  statsData: StatsData
  loading: boolean
}