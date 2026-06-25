import { Flame } from 'lucide-react'

export function LevelProgress({ currentLevel, currentXP, totalXPForLevel, totalXPForNextLevel }) {
  const progress = totalXPForNextLevel > 0 ? (currentXP / totalXPForNextLevel) * 100 : 0
  const nextLevel = currentLevel + 1

  return (
    <div class="level-card card">
      <div class="level-header">
        <div class="level-info">
          <h3 class="level-title">Level {currentLevel}</h3>
          <p class="level-subtitle">Progress to Level {nextLevel}</p>
        </div>
        
        <div class="level-stats">
          <div class="level-xp">
            <span class="level-xp-current">{currentXP}</span>
            <span class="level-xp-separator">/</span>
            <span class="level-xp-total">{totalXPForNextLevel}</span>
          </div>
        </div>
      </div>
      
      <div class="level-progress-container">
        <div class="progress-bar">
          <div 
            class="progress-fill" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div class="level-xp-needed">
          {totalXPForNextLevel - currentXP} XP to Level {nextLevel}
        </div>
      </div>
    </div>
  )
}