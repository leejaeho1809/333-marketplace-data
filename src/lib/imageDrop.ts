/** Drag-and-drop image intake shared by brand cards, the detail modal (hero +
 * best-seller thumbnails), and the add/edit form's dropzone: pulls an image
 * out of whatever got dropped (a real file, a dragged <img> from another tab,
 * or a plain image URL) and hands back a usable src — a resized data: URL for
 * files, or the URL as-is otherwise. */

export function resizeImageDataUrl(
  dataUrl: string,
  maxDim: number,
  quality: number,
  callback: (result: string) => void,
) {
  const img = new Image()
  img.onload = () => {
    const w = img.width
    const h = img.height
    const scale = Math.min(1, maxDim / Math.max(w, h))
    const cw = Math.round(w * scale)
    const ch = Math.round(h * scale)
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    try {
      ctx?.drawImage(img, 0, 0, cw, ch)
      callback(canvas.toDataURL('image/jpeg', quality))
    } catch {
      callback(dataUrl)
    }
  }
  img.onerror = () => callback(dataUrl)
  img.src = dataUrl
}

export function extractImageFromDrop(e: React.DragEvent, callback: (result: string | null) => void) {
  const file = e.dataTransfer.files?.[0]
  if (file && file.type && file.type.indexOf('image/') === 0) {
    const reader = new FileReader()
    reader.onload = (ev) => {
      resizeImageDataUrl(ev.target?.result as string, 900, 0.8, callback)
    }
    reader.readAsDataURL(file)
    return
  }

  const uri =
    e.dataTransfer.getData('text/uri-list') ||
    e.dataTransfer.getData('URL') ||
    e.dataTransfer.getData('text/plain')
  if (uri && /^https?:\/\//i.test(uri.trim())) {
    callback(uri.trim())
    return
  }

  const html = e.dataTransfer.getData('text/html')
  if (html) {
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
    if (m?.[1]) {
      callback(m[1])
      return
    }
  }

  callback(null)
}
