/** 83 -> "1:23", 3725 -> "1:02:05". Non-finite or negative input renders as "0:00". */
export function formatTime(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`
}

/** 2700 -> "45 min", 5400 -> "1 hr 30 min". Used for album/playlist totals. */
export function formatTotalDuration(totalSeconds: number): string {
  const minutes = Math.max(0, Math.round(totalSeconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** 1536 -> "1.5 KB", 5242880 -> "5 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  const rounded = value >= 10 || exponent === 0 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${units[exponent]}`
}
