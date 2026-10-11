'use client'
import { useSyncExternalStore, useCallback } from 'react'
import { VOICE_COLORS, VOICE_COLORS_LIGHT } from '@/lib/constants'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'choeur-theme'
const EVENT = 'choeur-theme-change'
export const THEME_COLORS: Record<Theme, string> = { dark: '#080812', light: '#F6F3EC' }

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* navigation privée : on garde le choix pour la session */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}

export function useTheme() {
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => 'dark')
  const toggle = useCallback(() => applyTheme(readTheme() === 'light' ? 'dark' : 'light'), [])
  return {
    theme,
    toggle,
    voiceColors: theme === 'light' ? VOICE_COLORS_LIGHT : VOICE_COLORS,
  }
}

/** Couleur du thème courant pour le canvas (qui ne comprend pas var(--x)) : « rgba(r,g,b,a) ». */
export function themeColor(name: string, alpha = 1): string {
  if (typeof document === 'undefined') return `rgba(0,0,0,${alpha})`
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
  const [r, g, b] = raw.split(/\s+/).map(Number)
  return `rgba(${r || 0},${g || 0},${b || 0},${alpha})`
}

/** Script exécuté avant l'affichage : évite le flash du thème sombre pour qui a choisi le clair. */
export const THEME_INIT_SCRIPT =
  `try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}`
