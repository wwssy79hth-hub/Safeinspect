import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveStorageUrl } from '@/lib/storageUrls'
import { useSyncQueue, isOfflineError } from '@/lib/syncQueue'
import { savePhoto } from '@/lib/photoOutbox'

export interface PhotoEntry {
  id: string            // temp UUID before upload, then asset_photo.id
  localUrl: string      // object URL for preview
  file: File | null     // null after upload
  caption: string
  storagePath: string | null  // set after upload
  publicUrl: string | null
  uploading: boolean
  /** Waiting in the offline outbox — will upload when back online */
  queued: boolean
  error: string | null
}

interface UsePhotoCaptureOptions {
  inspectionId: string
  assetId: string | null   // null until asset is saved
  userId: string
  maxPhotos?: number
}

export function usePhotoCapture({
  inspectionId,
  assetId,
  userId,
  maxPhotos = 10,
}: UsePhotoCaptureOptions) {
  const [photos, setPhotos] = useState<PhotoEntry[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Add photos from file picker or camera
  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).slice(0, maxPhotos - photos.length)
    const newEntries: PhotoEntry[] = arr.map((file) => ({
      id: crypto.randomUUID(),
      localUrl: URL.createObjectURL(file),
      file,
      caption: '',
      storagePath: null,
      publicUrl: null,
      uploading: false,
      queued: false,
      error: null,
    }))
    setPhotos((prev) => [...prev, ...newEntries])
    return newEntries
  }, [photos.length, maxPhotos])

  // Upload a single photo to Supabase Storage
  const uploadPhoto = useCallback(async (photoId: string, resolvedAssetId: string) => {
    const photo = photos.find((p) => p.id === photoId)
    if (!photo?.file) return

    setPhotos((prev) =>
      prev.map((p) => p.id === photoId ? { ...p, uploading: true, error: null } : p)
    )

    const ext = photo.file.name.split('.').pop() ?? 'jpg'
    const path = `${inspectionId}/${resolvedAssetId}/${photoId}.${ext}`
    const sortOrder = photos.indexOf(photo)

    // Queue instead of uploading when the device is offline, or
    // when the asset row itself is still waiting in the outbox
    // (the photo row references it, so it must land first).
    const queuePhoto = async () => {
      await savePhoto({
        id: photoId,
        inspectionId,
        assetId: resolvedAssetId,
        storagePath: path,
        contentType: photo.file!.type || 'image/jpeg',
        caption: photo.caption || null,
        sortOrder,
        uploadedBy: userId,
        blob: photo.file!,
        queuedAt: new Date().toISOString(),
      })
      useSyncQueue.getState().enqueue('upload_photo', `Photo for asset`, { photoId })
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? { ...p, uploading: false, queued: true, storagePath: path, file: null, error: null }
            : p
        )
      )
    }

    const mustQueue =
      (typeof navigator !== 'undefined' && !navigator.onLine) ||
      useSyncQueue.getState().hasQueuedAsset(resolvedAssetId)

    try {
      if (mustQueue) {
        await queuePhoto()
        return
      }

      const { error: uploadErr } = await supabase.storage
        .from('inspection-photos')
        .upload(path, photo.file, { upsert: true, contentType: photo.file.type })

      if (uploadErr) throw uploadErr

      // Buckets are private: persist the path, sign URLs at read time
      const { error: rowErr } = await supabase.from('asset_photos').insert({
        id: photoId,
        inspection_id: inspectionId,
        asset_id: resolvedAssetId,
        storage_path: path,
        caption: photo.caption || null,
        sort_order: sortOrder,
        uploaded_by: userId,
      })
      if (rowErr) throw rowErr

      const signedUrl = await resolveStorageUrl('inspection-photos', path)

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? { ...p, uploading: false, storagePath: path, publicUrl: signedUrl, file: null }
            : p
        )
      )
    } catch (err) {
      if (isOfflineError(err)) {
        try {
          await queuePhoto()
          return
        } catch { /* IndexedDB unavailable — fall through to error state */ }
      }
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setPhotos((prev) =>
        prev.map((p) => p.id === photoId ? { ...p, uploading: false, error: msg } : p)
      )
    }
  }, [photos, inspectionId, userId])

  // Upload all pending photos
  const uploadAll = useCallback(async (resolvedAssetId: string) => {
    const pending = photos.filter((p) => p.file && !p.uploading && !p.storagePath)
    await Promise.all(pending.map((p) => uploadPhoto(p.id, resolvedAssetId)))
  }, [photos, uploadPhoto])

  const removePhoto = useCallback((photoId: string) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === photoId)
      if (photo?.localUrl) URL.revokeObjectURL(photo.localUrl)
      return prev.filter((p) => p.id !== photoId)
    })
  }, [])

  const updateCaption = useCallback((photoId: string, caption: string) => {
    setPhotos((prev) =>
      prev.map((p) => p.id === photoId ? { ...p, caption } : p)
    )
  }, [])

  const openFilePicker = () => fileInputRef.current?.click()
  const openCamera = () => cameraInputRef.current?.click()

  const storagePaths = photos
    .filter((p) => p.storagePath)
    .map((p) => p.storagePath!)

  return {
    photos,
    fileInputRef,
    cameraInputRef,
    addFiles,
    uploadAll,
    uploadPhoto,
    removePhoto,
    updateCaption,
    openFilePicker,
    openCamera,
    storagePaths,
    hasUploading: photos.some((p) => p.uploading),
    canAddMore: photos.length < maxPhotos,
  }
}
