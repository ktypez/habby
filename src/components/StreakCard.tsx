<?xml version="1.0" encoding="utf-8"?>
<component>
  <name>StreakCard</name>
  <description>Displays current streak with fire icon and XP counter</description>
  <category>Gamification</category>
  
  <template>
    <div class="streak-card">
      <div class="streak-header">
        <div class="streak-icon">🔥</div>
        <span class="streak-label">Current Streak</span>
      </div>
      
      <div class="streak-value">
        <span class="streak-days" x-text="streak || 0"></span>
        <span class="streak-text">day</span>
        <span class="streak-plural" x-show="streak !== 1">s</span>
      </div>
      
      <div class="streak-bar">
        <div class="streak-fill" :style="{ width: `${Math.min((streak || 0) * 10, 100)}%` }"></div>
      </div>
    </div>
  </template>
  
  <styles>
    .streak-card {
      background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg) 100%);
      border-radius: var(--radius);
      padding: 24px;
      border: 1px solid var(--border);
      position: relative;
      overflow: hidden;
    }
    
    .streak-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--streak-green), var(--streak-amber));
    }
    
    .streak-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    
    .streak-icon {
      font-size: 24px;
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    
    .streak-label {
      color: var(--text-muted);
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .streak-value {
      display: flex;
      align-items: baseline;
      gap: 4px;
      margin-bottom: 20px;
    }
    
    .streak-days {
      font-size: 48px;
      font-weight: 800;
      color: var(--streak-green);
      line-height: 1;
    }
    
    .streak-text {
      color: var(--text-muted);
      font-size: 18px;
    }
    
    .streak-plural {
      color: var(--text-muted);
    }
    
    .streak-bar {
      height: 6px;
      background: var(--bg-surface);
      border-radius: 3px;
      overflow: hidden;
    }
    
    .streak-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--streak-green), var(--streak-amber));
      transition: width 0.5s ease;
      box-shadow: 0 0 10px rgba(245, 158, 11, 0.5);
    }
  </styles>
  
  <script>
    export function StreakCard() {
      return {
        streak: 0
      }
    }
  </script>
</component>
