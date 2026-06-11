import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface PhotoEntry {
  id: string            // temp UUID before upload, then asset_photo.id
  localUrl: string      // object URL for preview
  file: File | null     // null after upload
  caption: string
  storagePath: string | null  // set after upload
  publicUrl: string | null
  uploading: boolean
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

    try {
      const ext = photo.file.name.split('.').pop() ?? 'jpg'
      const path = `inspection-photos/${inspectionId}/${resolvedAssetId}/${photoId}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('inspection-photos')
        .upload(path, photo.file, { upsert: true, contentType: photo.file.type })

      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage
        .from('inspection-photos')
        .getPublicUrl(path)

      // Write to asset_photos table
      await supabase.from('asset_photos').insert({
        inspection_id: inspectionId,
        asset_id: resolvedAssetId,
        storage_path: path,
        public_url: urlData.publicUrl,
        caption: photo.caption || null,
        sort_order: photos.indexOf(photo),
        uploaded_by: userId,
      })

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId
            ? { ...p, uploading: false, storagePath: path, publicUrl: urlData.publicUrl, file: null }
            : p
        )
      )
    } catch (err) {
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
