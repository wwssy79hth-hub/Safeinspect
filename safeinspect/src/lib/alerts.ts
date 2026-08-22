// ============================================================
// SafeInspect — Alerts service
//
// Due-date alerts raised by the pg_cron sweep (migration 007).
// The table is the record; this module reads the caller's open
// alerts with their acknowledgement state and wraps the
// acknowledge RPC. Degrades to empty when the migration has not
// been applied.
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { AlertRow } from '@/types/database'

export interface MyAlert extends AlertRow {
  acknowledged_at: string | null
}

export async function fetchMyAlerts(): Promise<MyAlert[]> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return []

    const { data, error } = await supabase
      .from('alert_recipients')
      .select('acknowledged_at, alerts(*)')
      .eq('user_id', uid)
    if (error || !data) return []

    type Row = { acknowledged_at: string | null; alerts: AlertRow | null }
    return (data as Row[])
      .filter((r) => r.alerts && !r.alerts.resolved_at)
      .map((r) => ({ ...(r.alerts as AlertRow), acknowledged_at: r.acknowledged_at }))
      .sort((a, b) => {
        // Unacknowledged first, then most urgent due date
        const ackA = a.acknowledged_at ? 1 : 0
        const ackB = b.acknowledged_at ? 1 : 0
        if (ackA !== ackB) return ackA - ackB
        return a.due_on.localeCompare(b.due_on)
      })
  } catch {
    return []
  }
}

export async function acknowledgeAlert(alertId: string): Promise<void> {
  const { error } = await supabase.rpc('acknowledge_alert', { p_alert_id: alertId })
  if (error) throw new Error(error.message)
}

/** Open alerts for the signed-in user, with a refresh handle. */
export function useAlerts(): {
  alerts: MyAlert[]
  unacknowledged: number
  refresh: () => void
} {
  const [alerts, setAlerts] = useState<MyAlert[]>([])

  const refresh = useCallback(() => {
    fetchMyAlerts().then(setAlerts)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    alerts,
    unacknowledged: alerts.filter((a) => !a.acknowledged_at).length,
    refresh,
  }
}
