import { useState, useEffect, useCallback } from 'react'

export interface OnlineStatus {
  isOnline: boolean
  wasOffline: boolean   // true for a few seconds after reconnection
  lastOnlineAt: Date | null
  lastOfflineAt: Date | null
}

/**
 * Reactively tracks browser online/offline state.
 * `wasOffline` is true for 3 seconds after reconnecting so the UI
 * can show a "Back online – syncing…" message.
 */
export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [wasOffline, setWasOffline] = useState(false)
  const [lastOnlineAt, setLastOnlineAt] = useState<Date | null>(
    navigator.onLine ? new Date() : null
  )
  const [lastOfflineAt, setLastOfflineAt] = useState<Date | null>(null)

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>

    const handleOnline = () => {
      setIsOnline(true)
      setLastOnlineAt(new Date())
      setWasOffline(true)
      reconnectTimer = setTimeout(() => setWasOffline(false), 3500)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setLastOfflineAt(new Date())
      setWasOffline(false)
      clearTimeout(reconnectTimer)
    }

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearTimeout(reconnectTimer)
    }
  }, [])

  return { isOnline, wasOffline, lastOnlineAt, lastOfflineAt }
}
