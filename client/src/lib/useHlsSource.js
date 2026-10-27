import { useEffect } from 'react'
import Hls from 'hls.js'

/**
 * Attach an HLS URL to a <video> element. Safari + iOS have native HLS
 * support (`canPlayType('application/vnd.apple.mpegurl')`), so we set src
 * directly there. Everywhere else, hls.js polyfills the MediaSource
 * extension.
 *
 * Non-HLS URLs (Supabase-stored legacy videos, direct .mp4, etc.) pass
 * through untouched — the caller can just render <video src={url} />
 * without wrapping in this hook and it still works.
 *
 * Returns nothing — the effect wires up + tears down the hls.js instance.
 */
/**
 * Cloudflare Stream serves a still from the same asset path as the manifest.
 * Returns null for anything that isn't a Stream HLS URL, so legacy Supabase
 * .mp4s just get no poster rather than a broken image.
 *
 * Worth having for two reasons, both seen on an iPhone against a clip that
 * played perfectly on desktop. A <video> with no poster paints BLACK until
 * it has decoded a frame, so a feed of unplayed videos is a column of black
 * rectangles. And with no poster and no loaded metadata the element has no
 * intrinsic dimensions at all — `w-full` gives it a width and the height
 * collapses to the UA default, so the box is the wrong shape too.
 */
export function streamThumbnailUrl(url) {
  if (typeof url !== 'string') return null
  if (!url.includes('cloudflarestream.com')) return null
  const m = url.match(/^(https:\/\/[^/]+\/[^/]+)\//)
  return m ? `${m[1]}/thumbnails/thumbnail.jpg` : null
}

export function useHlsSource(videoRef, url) {
  useEffect(() => {
    const video = videoRef.current
    if (!video || !url) return

    const isHls = typeof url === 'string' && url.includes('.m3u8')

    if (!isHls) {
      // Legacy path — just set src normally. Handled by React elsewhere too,
      // but explicit here avoids "hook that only runs sometimes" surprises.
      if (video.src !== url) video.src = url
      return
    }

    // Native HLS (Safari, iOS) — set src and let the browser handle it.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      if (video.src !== url) video.src = url
      return
    }

    // Everywhere else — hls.js
    if (!Hls.isSupported()) {
      // MSE not available at all (extremely rare). Fall back to src which
      // will fail visibly rather than silently.
      video.src = url
      return
    }
    const hls = new Hls({
      // Keep the buffer small — the feed loads many videos on scroll, and
      // aggressive buffering across all of them adds up fast on mobile.
      maxBufferLength: 30,
      maxBufferSize: 30 * 1024 * 1024,
    })
    hls.loadSource(url)
    hls.attachMedia(video)

    return () => {
      try { hls.destroy() } catch {}
    }
  }, [videoRef, url])
}
