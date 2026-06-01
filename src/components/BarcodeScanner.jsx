import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/browser'
import { X, Keyboard, RefreshCw } from 'lucide-react'

export default function BarcodeScanner({ onScan, onClose, title = 'Scan Barcode' }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const animRef = useRef(null)
  const readerRef = useRef(null)
  const lastScanRef = useRef('')
  const [manualMode, setManualMode] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  const stopCamera = () => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  const startCamera = async () => {
    setError('')
    setReady(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      })
      streamRef.current = stream

      const video = videoRef.current
      video.srcObject = stream
      video.setAttribute('playsinline', true)
      await video.play()
      setReady(true)

      readerRef.current = new BrowserMultiFormatReader()
      scanLoop()
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Camera access denied. Go to Settings → Safari → Camera and set it to Allow.')
      } else {
        setError(`Could not start camera: ${err.message}`)
      }
    }
  }

  const scanLoop = () => {
    const video = videoRef.current
    const reader = readerRef.current
    if (!video || !reader || !streamRef.current) return

    // Draw video frame to canvas and decode
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')

    const tick = async () => {
      if (!streamRef.current) return
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        try {
          const result = reader.decodeFromCanvas(canvas)
          const text = result.getText()
          if (text && text !== lastScanRef.current) {
            lastScanRef.current = text
            if (navigator.vibrate) navigator.vibrate([100])
            stopCamera()
            onScan(text)
            return
          }
        } catch (e) {
          // NotFoundException is normal — no barcode in frame yet
        }
      }
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
  }

  const handleManual = () => {
    if (manualInput.trim()) {
      stopCamera()
      onScan(manualInput.trim())
    }
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 bg-black">
        <div>
          <h2 className="text-white text-lg font-bold">{title}</h2>
          <p className="text-gray-400 text-xs">Point camera at barcode</p>
        </div>
        <button onClick={() => { stopCamera(); onClose() }} className="text-gray-400 p-2">
          <X size={24} />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Overlay with cutout */}
        {ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {/* Dark overlay top */}
            <div className="w-full flex-1 bg-black/50" />

            {/* Middle row */}
            <div className="flex w-full">
              <div className="flex-1 bg-black/50" />
              {/* Scan window */}
              <div className="w-64 h-48 relative">
                {/* Corner guides */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-jct-red rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-jct-red rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-jct-red rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-jct-red rounded-br-lg" />
                {/* Scan line */}
                <div className="absolute left-2 right-2 h-0.5 bg-jct-red animate-bounce top-1/2" />
              </div>
              <div className="flex-1 bg-black/50" />
            </div>

            {/* Dark overlay bottom */}
            <div className="w-full flex-1 bg-black/50" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center bg-black/80">
            <p className="text-white text-sm">{error}</p>
            <button onClick={startCamera}
              className="flex items-center gap-2 bg-jct-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold">
              <RefreshCw size={16} /> Try Again
            </button>
          </div>
        )}

        {/* Loading */}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <p className="text-gray-400 text-sm">Starting camera...</p>
          </div>
        )}
      </div>

      {/* Manual input */}
      <div className="px-4 py-5 bg-black flex flex-col gap-3">
        {manualMode ? (
          <div className="flex gap-2">
            <input
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManual()}
              placeholder="Type barcode manually..."
              autoFocus
              className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 text-sm border border-gray-600"
            />
            <button onClick={handleManual}
              className="bg-jct-red text-white px-4 py-3 rounded-xl text-sm font-semibold">
              OK
            </button>
          </div>
        ) : (
          <button onClick={() => setManualMode(true)}
            className="flex items-center justify-center gap-2 text-gray-400 text-sm py-1">
            <Keyboard size={16} /> Enter manually instead
          </button>
        )}
        <p className="text-gray-700 text-xs text-center">
          Supports QR, Code 128, Code 39, EAN-13, UPC-A
        </p>
      </div>
    </div>
  )
}