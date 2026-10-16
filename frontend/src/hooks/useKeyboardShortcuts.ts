import { useEffect } from 'react'

import { currentTrackOf, playerStore } from '../store/playerStore'

const SEEK_SECONDS = 5

function isTextEntry(el: HTMLElement) {
  if (el.isContentEditable) return true
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  return el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range'
}

/** Elements that already do something with Space/Enter and the arrow keys. */
function isNativelyInteractive(el: HTMLElement) {
  return ['BUTTON', 'A', 'SUMMARY'].includes(el.tagName) || el.getAttribute('role') === 'button'
}

/**
 * Global player shortcuts: Space play/pause, Left/Right seek 5s, Up/Down volume, M mute.
 * Keys are left alone while typing, with modifiers held, or when nothing is loaded.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target instanceof HTMLElement ? event.target : document.body
      if (isTextEntry(target)) return

      const state = playerStore.getState()
      if (!currentTrackOf(state)) return

      // A focused slider owns the arrow keys; a focused button owns Space.
      const onSlider = target.tagName === 'INPUT' // type=range, since other inputs returned above

      switch (event.key) {
        case ' ':
          if (isNativelyInteractive(target)) return
          state.togglePlay()
          break
        case 'ArrowRight':
          if (onSlider) return
          state.seekBy(SEEK_SECONDS)
          break
        case 'ArrowLeft':
          if (onSlider) return
          state.seekBy(-SEEK_SECONDS)
          break
        case 'ArrowUp':
          if (onSlider) return
          state.changeVolumeBy(1)
          break
        case 'ArrowDown':
          if (onSlider) return
          state.changeVolumeBy(-1)
          break
        case 'm':
        case 'M':
          state.toggleMute()
          break
        default:
          return
      }
      event.preventDefault()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
