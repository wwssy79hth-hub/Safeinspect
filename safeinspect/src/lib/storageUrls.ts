// ============================================================
// SafeInspect — Storage URL resolution
//
// Every bucket is private, so objects are viewed through
// short-lived signed URLs created at read time (never persisted
// — a leaked row must not leak the photograph). The database
// stores the storage *path*; legacy rows that stored a full
// public URL (which never resolved against a private bucket)
// are detected and re-signed from the path inside them.
// ============================================================

import { supabase } from '@/lib/supabase'

/** Default signed-URL lifetime: long enough for a working session. */
export const SIGNED_URL_TTL = 60 * 60 // seconds

const FULL_URL = /^https?:\/\//i

/**
 * Extract the object path from a legacy stored URL, e.g.
 * https://xyz.supabase.co/storage/v1/object/public/<bucket>/<path>
 */
function pathFromStoredUrl(url: string, bucket: string): string | null {
  for (const kind of ['public', 'sign', 'authenticated']) {
    const marker = `/storage/v1/object/${kind}/${bucket}/`
    const i = url.indexOf(marker)
    if (i !== -1) {
      const rest = url.slice(i + marker.length)
      return decodeURIComponent(rest.split('?')[0])
    }
  }
  return null
}

/** Normalise a stored value (path or legacy URL) to an object path. */
export function toStoragePath(bucket: string, stored: string): string | null {
  if (!FULL_URL.test(stored)) return stored
  return pathFromStoredUrl(stored, bucket)
}

/**
 * Resolve a stored path (or legacy URL) to a viewable signed URL.
 * Returns null when the value is empty or signing fails; returns
 * the input unchanged for external URLs that aren't ours.
 */
export async function resolveStorageUrl(
  bucket: string,
  stored: string | null | undefined,
  expiresIn: number = SIGNED_URL_TTL
): Promise<string | null> {
  if (!stored) return null

  const path = toStoragePath(bucket, stored)
  if (!path) return FULL_URL.test(stored) ? stored : null

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)

  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

/**
 * Batch-resolve stored paths/URLs for one bucket. Returns a map
 * keyed by the original stored value.
 */
export async function resolveStorageUrls(
  bucket: string,
  stored: string[],
  expiresIn: number = SIGNED_URL_TTL
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const paths: { stored: string; path: string }[] = []

  for (const s of stored) {
    if (!s) continue
    const path = toStoragePath(bucket, s)
    if (path) paths.push({ stored: s, path })
    else if (FULL_URL.test(s)) out.set(s, s) // external URL — pass through
  }
  if (paths.length === 0) return out

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths.map((p) => p.path), expiresIn)

  if (error || !data) return out
  data.forEach((entry, i) => {
    if (entry.signedUrl) out.set(paths[i].stored, entry.signedUrl)
  })
  return out
}
