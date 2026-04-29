import { useRef, useState } from "react"
import useUserAxios from "@/hooks/useUserAxios"
import { toast } from "sonner"

interface UseImageUploadOptions {
  onSuccess?: (url: string) => void
}

export function useImageUpload({ onSuccess }: UseImageUploadOptions = {}) {
  const axios = useUserAxios()
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected?.type.startsWith("image/")) {
      setFile(selected)
      setPreviewUrl(URL.createObjectURL(selected))
    } else {
      setFile(null)
      setPreviewUrl(null)
    }
  }

  const upload = async (): Promise<string | null> => {
    if (!file) return null
    const form = new FormData()
    form.append("file", file)
    try {
      setUploading(true)
      const resp = await axios.post("/uploads/image", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      const url: string = resp.data.url
      onSuccess?.(url)
      reset()
      return url
    } catch {
      toast.error("Upload failed")
      return null
    } finally {
      setUploading(false)
    }
  }

  const reset = () => {
    setFile(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return { file, previewUrl, uploading, fileInputRef, handleFileChange, upload, reset }
}