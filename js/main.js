document.querySelectorAll('.chart-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    tab.parentElement.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
  })
})

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1'
      entry.target.style.transform = 'translateY(0)'
    }
  })
}, { threshold: 0.1 })

document.querySelectorAll('.g-card, .feature-card, .built-card').forEach(card => {
  card.style.opacity = '0'
  card.style.transform = 'translateY(20px)'
  card.style.transition = 'opacity 0.5s ease, transform 0.5s ease, border-color 0.3s, box-shadow 0.3s'
  observer.observe(card)
})

const nav = document.querySelector('.nav')
let lastScroll = 0
window.addEventListener('scroll', () => {
  const current = window.scrollY
  if (current > 100) {
    nav.style.borderBottomColor = 'rgba(39,39,42,0.8)'
  } else {
    nav.style.borderBottomColor = 'var(--border)'
  }
  lastScroll = current
}, { passive: true })

const promoTimer = document.querySelector('.promo-timer strong')
if (promoTimer) {
  let total = 47 * 3600 + 59 * 60 + 59
  function updateTimer() {
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    promoTimer.textContent = `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
    if (total > 0) total--
  }
  setInterval(updateTimer, 1000)
}
