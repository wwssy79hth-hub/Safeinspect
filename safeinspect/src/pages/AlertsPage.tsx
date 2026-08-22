// ============================================================
// SafeInspect — Alerts
//
// The recertification engine's surface (extraction item 6): due
// and overdue assets, expiring certificates — raised by the
// daily sweep, acknowledged per person. The table is the record;
// this page just reads it.
// ============================================================

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Bell, CalendarClock, AlertTriangle, ShieldAlert,
  CheckCircle2, Check,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { useAlerts, acknowledgeAlert, type MyAlert } from '@/lib/alerts'
import type { AlertKind } from '@/types/database'

const KIND_CONFIG: Record<AlertKind, {
  icon: typeof Bell
  label: string
  tone: 'warn' | 'danger'
}> = {
  recert_due:           { icon: CalendarClock, label: 'Recertification due',    tone: 'warn' },
  recert_overdue:       { icon: AlertTriangle, label: 'Recertification overdue', tone: 'danger' },
  certificate_expiring: { icon: ShieldAlert,   label: 'Certificate expiring',    tone: 'warn' },
}

function AlertCard({ alert, onAcknowledged }: { alert: MyAlert; onAcknowledged: () => void }) {
  const [busy, setBusy] = useState(false)
  const cfg = KIND_CONFIG[alert.kind]
  const Icon = cfg.icon
  const danger = cfg.tone === 'danger'
  const acked = !!alert.acknowledged_at

  const handleAck = async () => {
    setBusy(true)
    try {
      await acknowledgeAlert(alert.id)
      onAcknowledged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn(
      'rounded-2xl border p-4 transition-opacity',
      acked ? 'border-surface-border bg-surface-raised opacity-60'
        : danger ? 'border-status-noncompliant/40 bg-status-noncompliant-bg/5'
        : 'border-status-recommendation/40 bg-status-recommendation/5'
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
          danger ? 'bg-status-noncompliant-bg' : 'bg-status-recommendation/20'
        )}>
          <Icon size={16} className={danger ? 'text-status-noncompliant' : 'text-status-recommendation'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-[10px] font-semibold uppercase tracking-widest',
            danger ? 'text-status-noncompliant' : 'text-status-recommendation'
          )}>
            {cfg.label}
          </p>
          <p className="text-white text-sm font-semibold mt-0.5">{alert.title}</p>
          {alert.detail && <p className="text-slate-500 text-xs mt-1">{alert.detail}</p>}
          <p className="text-slate-600 text-[11px] mt-1.5">
            Due {format(parseISO(alert.due_on), 'd MMM yyyy')}
            {acked && ` · acknowledged ${format(parseISO(alert.acknowledged_at!), 'd MMM HH:mm')}`}
          </p>
        </div>
        {!acked && (
          <button
            onClick={handleAck}
            disabled={busy}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-surface-overlay text-slate-300 text-xs font-semibold hover:text-white transition-colors shrink-0 disabled:opacity-50"
          >
            <Check size={13} /> Acknowledge
          </button>
        )}
      </div>
    </div>
  )
}

export default function AlertsPage() {
  const navigate = useNavigate()
  const { alerts, unacknowledged, refresh } = useAlerts()

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-10 bg-surface-raised border-b border-surface-border">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="font-display font-bold text-white text-base uppercase tracking-wide">
              Alerts
            </h1>
            <p className="text-slate-500 text-xs">
              {alerts.length === 0
                ? 'Nothing due'
                : `${unacknowledged} unacknowledged · ${alerts.length} open`}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-2.5">
        {alerts.length === 0 ? (
          <div className="rounded-2xl border border-surface-border bg-surface-raised p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-status-compliant-bg mx-auto mb-3 flex items-center justify-center">
              <CheckCircle2 size={22} className="text-status-compliant" />
            </div>
            <p className="text-white font-semibold text-sm">No open alerts</p>
            <p className="text-slate-500 text-xs mt-1">
              Nothing is due or overdue. The daily sweep raises an alert here
              when an asset or certificate approaches its recertification date.
            </p>
          </div>
        ) : (
          alerts.map((a) => <AlertCard key={a.id} alert={a} onAcknowledged={refresh} />)
        )}
      </div>
    </div>
  )
}
