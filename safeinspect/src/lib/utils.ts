import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Report number generator ──────────────────────────────────

/**
 * Generates a report number in the format AB-YYYY-XXXX
 * where XXXX is a zero-padded sequence number.
 * In production this should come from a DB sequence.
 */
export function generateReportNumber(sequence?: number): string {
  const year = new Date().getFullYear()
  const seq  = sequence ?? Math.floor(Math.random() * 9000) + 1000
  return `AB-${year}-${String(seq).padStart(4, '0')}`
}
