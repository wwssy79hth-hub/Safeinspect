import { useEffect, useRef, useCallback, useState } from 'react'

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

interface UseAutoSaveOptions<T> {
  /** The value to watch */
  value: T
  /** Async save function */
  onSave: (value: T) => Promise<void>
  /** Debounce delay in ms (default 1400) */
  delay?: number
  /** Whether autosave is enabled */
  enabled?: boolean
}

/**
 * Debounced autosave. Watches `value`, waits `delay` ms after the last
 * change, then calls `onSave`. Returns current save status.
 */
export function useAutoSave<T>({
  value,
  onSave,
  delay = 1400,
  enabled = true,
}: UseAutoSaveOptions<T>) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevRef    = useRef<T>(value)
  const onSaveRef  = useRef(onSave)
  const mountedRef = useRef(false)

  // Keep callback ref fresh
  useEffect(() => { onSaveRef.current = onSave }, [onSave])

  useEffect(() => {
    // Skip the very first render
    if (!mountedRef.current) { mountedRef.current = true; return }
    if (!enabled) return
    if (JSON.stringify(value) === JSON.stringify(prevRef.current)) return

    // Mark pending immediately so the UI shows "Unsaved"
    setStatus('pending')

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      prevRef.current = value
      setStatus('saving')
      try {
        await onSaveRef.current(value)
        setStatus('saved')
        // Reset to idle after 2s
        setTimeout(() => setStatus('idle'), 2000)
      } catch {
        setStatus('error')
      }
    }, delay)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, delay, enabled])

  const saveNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setStatus('saving')
    try {
      await onSaveRef.current(value)
      prevRef.current = value
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
    }
  }, [value])

  return { status, saveNow }
}
