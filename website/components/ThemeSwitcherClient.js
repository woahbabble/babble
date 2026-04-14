'use client'

import { useEffect, useState } from 'react'

const THEMES = [
  { id: 'paper', label: 'Paper' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'clay', label: 'Clay' },
  { id: 'fjord', label: 'Fjord' },
  { id: 'violet', label: 'Violet' }
]

const LEGACY_THEME_ALIASES = {
  light: 'paper',
  dark: 'midnight',
  tokyo: 'dusk',
  material: 'clay',
  nord: 'fjord',
  panda: 'violet'
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
}

export default function ThemeSwitcherClient() {
  const [theme, setTheme] = useState('paper')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const readTheme = () => {
      const saved = window.localStorage.getItem('babbleTheme')
      const normalized = LEGACY_THEME_ALIASES[saved] || saved
      const next = THEMES.some((t) => t.id === normalized) ? normalized : 'paper'
      setTheme(next)
      applyTheme(next)
    }

    readTheme()
    window.addEventListener('storage', readTheme)
    window.addEventListener('babble-theme-changed', readTheme)
    return () => {
      window.removeEventListener('storage', readTheme)
      window.removeEventListener('babble-theme-changed', readTheme)
    }
  }, [])

  function onChange(nextTheme) {
    setTheme(nextTheme)
    applyTheme(nextTheme)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('babbleTheme', nextTheme)
      window.dispatchEvent(new Event('babble-theme-changed'))
    }
  }

  return (
    <label className="theme-switcher">
      Theme
      <select value={theme} onChange={(e) => onChange(e.target.value)}>
        {THEMES.map((themeOption) => (
          <option key={themeOption.id} value={themeOption.id}>
            {themeOption.label}
          </option>
        ))}
      </select>
    </label>
  )
}
