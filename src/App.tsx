/**
 * Main application component
 * Initializes app state and renders views
 */
import { useState, useEffect } from 'react'

export default function App() {
  const [view, setView] = useState('habits')
  const [streak, setStreak] = useState(0)
  const [xp, setXP] = useState(0)
  const [level, setLevel] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: Load initial data from API
    setTimeout(() => {
      setStreak(12)
      setXP(2016)
      setLevel(3)
      setLoading(false)
    }, 1000)
  }, [])

  if (loading) {
    return <div class="loading-screen">Loading your habits...</div>
  }

  return (
    <div class="app-container">
      <Header streak={streak} xp={xp} level={level} />
      
      <main class="main-content">
        {view === 'habits' && <HabitsView />}
        {view === 'stats' && <StatsView />}
        {view === 'achievements' && <AchievementsView />}
      </main>
      
      <BottomNav activeView={view} onViewChange={setView} />
    </div>
  )
}

function Header({ streak, xp, level }) {
  return (
    <header class="app-header">
      <div class="header-content">
          <div class="header-brand">
            <div class="header-icon">🎯</div>
            <h1 class="header-title">Habby</h1>
        </div>
        
        <div class="header-stats">
          <div class="stat-badge streak">
            <span>🔥</span>
            <span>{streak} days</span>
          </div>
          
          <div class="stat-badge xp">
            <span>💎</span>
            <span>{xp} XP</span>
          </div>
        </div>
      </div>
    </header>
  )
}

function BottomNav({ activeView, onViewChange }) {
  const navItems = [
    { id: 'habits', icon: '📝', label: 'Habits' },
    { id: 'stats', icon: '📊', label: 'Stats' },
    { id: 'achievements', icon: '🏆', label: 'Awards' },
  ]

  return (
    <nav class="bottom-nav">
      {navItems.map(item => (
        <button
          key={item.id}
          class={`nav-item ${activeView === item.id ? 'active' : ''}`}
          onClick={() => onViewChange(item.id)}
        >
          <span class="nav-icon">{item.icon}</span>
          <span class="nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}