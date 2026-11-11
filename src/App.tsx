import {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import NotFound from "./components/NotFound"
import ProcessingOverlay from "./components/ProcessingOverlay"
import SectionErrorBoundary from "./components/SectionErrorBoundary"
import {
  appendGifFrame,
  createExampleFrames,
  createGifHeader,
  DEFAULT_FRAME_COUNT,
  drawCover,
  drawScanimationMask,
  interlaceFrames,
  OUTPUT_FORMATS,
  seekVideo,
  SLIT_WIDTH,
  type ExampleKind,
  type OutputFormat,
} from "./lib/scanimation"

type Stage = "upload" | "crop" | "workbench"
type Mode = "auto" | "pull"
type PlaybackSpeed = "slow" | "normal" | "fast"
type ErrorAction = "reupload" | "video" | "gif" | "widget" | null

function ErrorNotice({
  message,
  action,
  onAction,
}: {
  message: string
  action: ErrorAction
  onAction: () => void
}) {
  const label =
    action === "reupload" ? "Choose another film" : action ? "Try again" : ""
  return (
    <div className="error-notice" role="alert">
      <p>{message}</p>
      {action && (
        <button type="button" onClick={onAction}>
          {label} <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  )
}

function ArrowIcon({ direction = "right" }: { direction?: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      className={direction === "left" ? "icon icon--left" : "icon"}
      viewBox="0 0 20 20"
    >
      <path d="M3 10h13M11 4l6 6-6 6" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 20 20">
      <path d="M10 2v11m0 0 4-4m-4 4L6 9M3 16.5h14" />
    </svg>
  )
}

function formatTime(value: number) {
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  const tenths = Math.floor((value % 1) * 10)
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`
}

function StudioApp() {
  const [stage, setStage] = useState<Stage>("upload")
  const [mode, setMode] = useState<Mode>("auto")
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>("normal")
  const [frameCount, setFrameCount] = useState(DEFAULT_FRAME_COUNT)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("portrait")
  const [cropPosition, setCropPosition] = useState({ x: 0.5, y: 0.5 })
  const [file, setFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState("")
  const [duration, setDuration] = useState(0)
  const [cropStart, setCropStart] = useState(0)
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isGifExporting, setIsGifExporting] = useState(false)
  const [error, setError] = useState("")
  const [errorAction, setErrorAction] = useState<ErrorAction>(null)
  const [toast, setToast] = useState("")
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [pullTravel, setPullTravel] = useState(72)
  const [explainerFrame, setExplainerFrame] = useState(0)
  const [explainerPlaying, setExplainerPlaying] = useState(true)
  const [overlayStep, setOverlayStep] = useState(0)
  const [pullOffset, setPullOffset] = useState(0)
  const [progress, setProgress] = useState(0)
  const outputSpec = OUTPUT_FORMATS[outputFormat]
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const outputRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const explainerCanvasRef = useRef<HTMLCanvasElement>(null)
  const framesRef = useRef<HTMLCanvasElement[]>([])
  const dragRef = useRef({ pointerX: 0, start: 0 })
  const pullRef = useRef({ pointerX: 0, start: 0 })
  const cropDragRef = useRef({ pointerX: 0, pointerY: 0, x: 0.5, y: 0.5 })
  const explainerSequenceRef = useRef(0)
  const toastTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (mode !== "auto" || stage !== "workbench") return
    if (prefersReducedMotion) {
      setOverlayStep(0)
      return
    }
    let step = 0
    let direction = 1
    const interval = { slow: 220, normal: 130, fast: 80 }[playbackSpeed]
    const timer = window.setInterval(() => {
      step += direction
      if (step >= frameCount - 1 || step <= 0) direction *= -1
      setOverlayStep(step)
    }, interval)
    return () => window.clearInterval(timer)
  }, [frameCount, mode, playbackSpeed, prefersReducedMotion, stage])

  useEffect(() => {
    if (stage !== "workbench") return
    const source = outputRef.current
    const preview = previewRef.current
    const ctx = preview?.getContext("2d")
    if (!source || !preview || !ctx) return
    const imageOffset =
      mode === "pull"
        ? (pullOffset / pullTravel) * (frameCount - 1) * SLIT_WIDTH
        : 0
    ctx.clearRect(0, 0, outputSpec.width, outputSpec.height)
    ctx.fillStyle = "#f7f4eb"
    ctx.fillRect(0, 0, outputSpec.width, outputSpec.height)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(source, -imageOffset, 0)
    drawScanimationMask(
      ctx,
      outputSpec.width,
      outputSpec.height,
      frameCount,
      mode === "auto" ? overlayStep : 0,
    )
  }, [
    frameCount,
    mode,
    outputSpec.height,
    outputSpec.width,
    overlayStep,
    pullOffset,
    pullTravel,
    stage,
  ])

  useEffect(() => {
    if (!explainerPlaying || prefersReducedMotion) return
    const sequence = [0, 1, 2, 3, 4, 4, 3, 2, 1, 0]
    const timer = window.setInterval(() => {
      explainerSequenceRef.current =
        (explainerSequenceRef.current + 1) % sequence.length
      setExplainerFrame(sequence[explainerSequenceRef.current])
    }, 620)
    return () => window.clearInterval(timer)
  }, [explainerPlaying, prefersReducedMotion])

  useEffect(() => {
    const display = explainerCanvasRef.current
    const displayContext = display?.getContext("2d")
    if (!display || !displayContext) return
    const width = 540
    const height = 130
    const frames = Array.from({ length: DEFAULT_FRAME_COUNT }, (_, frame) => {
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return canvas
      ctx.fillStyle = "#ebe4d6"
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = "#d8542c"
      ctx.beginPath()
      ctx.arc(width * (0.18 + frame * 0.16), height / 2, 38, 0, Math.PI * 2)
      ctx.fill()
      return canvas
    })
    const composite = document.createElement("canvas")
    interlaceFrames(frames, composite, width, height)
    displayContext.clearRect(0, 0, width, height)
    displayContext.drawImage(composite, 0, 0)
    drawScanimationMask(
      displayContext,
      width,
      height,
      DEFAULT_FRAME_COUNT,
      explainerFrame,
    )
  }, [explainerFrame])

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updateMotion = () => setPrefersReducedMotion(motionQuery.matches)
    const updateTravel = () => {
      const nextTravel = window.innerWidth <= 620 ? 32 : 72
      setPullTravel(nextTravel)
      setPullOffset((value) => Math.min(value, nextTravel))
    }
    updateMotion()
    updateTravel()
    motionQuery.addEventListener("change", updateMotion)
    window.addEventListener("resize", updateTravel)
    return () => {
      motionQuery.removeEventListener("change", updateMotion)
      window.removeEventListener("resize", updateTravel)
    }
  }, [])

  useEffect(() => {
    if (prefersReducedMotion) setExplainerPlaying(false)
  }, [prefersReducedMotion])

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    }
  }, [videoUrl])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  const reset = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    framesRef.current.forEach((frame) => {
      frame.width = 0
      frame.height = 0
    })
    framesRef.current = []
    const output = outputRef.current
    output?.getContext("2d")?.clearRect(0, 0, output.width, output.height)
    setVideoUrl("")
    setFile(null)
    setDuration(0)
    setCropStart(0)
    setFrameCount(DEFAULT_FRAME_COUNT)
    setOutputFormat("portrait")
    setCropPosition({ x: 0.5, y: 0.5 })
    setThumbnails([])
    setError("")
    setErrorAction(null)
    setPullOffset(0)
    setIsPreparing(false)
    setStage("upload")
  }

  const goBack = () => {
    setError("")
    setErrorAction(null)
    if (stage === "workbench" && videoUrl) {
      setStage("crop")
      return
    }
    reset()
  }

  const clearError = () => {
    setError("")
    setErrorAction(null)
  }

  const showError = (message: string, action: ErrorAction = null) => {
    setError(message)
    setErrorAction(action)
  }

  const notify = (message: string) => {
    setToast(message)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(""), 4200)
  }

  const createThumbnails = useCallback(
    async (url: string, videoDuration: number) => {
      const sampler = document.createElement("video")
      sampler.src = url
      sampler.muted = true
      sampler.playsInline = true
      await new Promise<void>((resolve, reject) => {
        sampler.onloadedmetadata = () => resolve()
        sampler.onerror = () => reject(new Error("Unable to read this video."))
      })
      const images: string[] = []
      const canvas = document.createElement("canvas")
      canvas.width = 180
      canvas.height = 108
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      for (let i = 0; i < 8; i += 1) {
        await seekVideo(sampler, (videoDuration * i) / 8)
        drawCover(
          ctx,
          sampler,
          sampler.videoWidth,
          sampler.videoHeight,
          canvas.width,
          canvas.height,
        )
        images.push(canvas.toDataURL("image/jpeg", 0.7))
      }
      setThumbnails(images)
      sampler.removeAttribute("src")
      sampler.load()
    },
    [],
  )

  const acceptFile = (selected: File) => {
    clearError()
    const extension = selected.name.split(".").pop()?.toLowerCase()
    if (
      !selected.type.startsWith("video/") &&
      !["mp4", "mov"].includes(extension ?? "")
    ) {
      showError(
        "That file type won’t work here. Choose an MP4 or MOV video.",
        "reupload",
      )
      return
    }
    if (selected.size === 0) {
      showError(
        "This file is empty. Choose a video with at least one second of motion.",
        "reupload",
      )
      return
    }
    if (selected.size > 500 * 1024 * 1024) {
      showError(
        "That film is a little too large for this browser. Choose one under 500 MB.",
        "reupload",
      )
      return
    }
    if (typeof document.createElement("canvas").getContext !== "function") {
      showError(
        "This browser can’t run the studio. Try opening it in Safari or Chrome.",
      )
      return
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    const url = URL.createObjectURL(selected)
    setIsPreparing(true)
    setFile(selected)
    setVideoUrl(url)
    setStage("crop")
  }

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (selected) acceptFile(selected)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const selected = event.dataTransfer.files[0]
    if (selected) acceptFile(selected)
  }

  const onMetadata = () => {
    const video = videoRef.current
    if (!video) return
    const nextDuration = video.duration
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
      setIsPreparing(false)
      showError(
        "We couldn’t open that film. Try another MP4 or MOV.",
        "reupload",
      )
      return
    }
    setDuration(nextDuration)
    const sourceRatio = video.videoWidth / video.videoHeight
    setOutputFormat(
      sourceRatio > 1.15
        ? "landscape"
        : sourceRatio < 0.87
          ? "portrait"
          : "square",
    )
    setCropPosition({ x: 0.5, y: 0.5 })
    setCropStart(Math.max(0, (nextDuration - 1) / 2))
    if (nextDuration < 1) {
      setIsPreparing(false)
      showError(
        "That film is too short. Choose one that is at least one second.",
        "reupload",
      )
      return
    }
    if (nextDuration > 600) {
      setDuration(0)
      setIsPreparing(false)
      showError(
        "That film is too long for reliable local processing. Choose one under 10 minutes.",
        "reupload",
      )
      return
    }
    createThumbnails(videoUrl, nextDuration)
      .catch(() =>
        showError(
          "We couldn’t prepare that film. Try another MP4 or MOV.",
          "reupload",
        ),
      )
      .finally(() => setIsPreparing(false))
  }

  const loadExample = (kind: ExampleKind) => {
    clearError()
    setProgress(0.25)
    setIsProcessing(true)
    window.setTimeout(() => {
      try {
        const output = outputRef.current
        if (!output) throw new Error("The preview canvas is unavailable.")
        const frames = createExampleFrames(
          kind,
          frameCount,
          outputSpec.width,
          outputSpec.height,
        )
        interlaceFrames(frames, output, outputSpec.width, outputSpec.height)
        framesRef.current = frames
        setProgress(1)
        setStage("workbench")
      } catch {
        showError("That example didn’t start. Please try it again.")
      } finally {
        setIsProcessing(false)
      }
    }, 120)
  }

  const updateCropFromDrag = (clientX: number) => {
    const timeline = document.getElementById("timeline-track")
    if (!timeline || duration <= 1) return
    const delta = clientX - dragRef.current.pointerX
    const secondsPerPixel = (duration - 1) / timeline.clientWidth
    setCropStart(
      Math.min(
        duration - 1,
        Math.max(0, dragRef.current.start - delta * secondsPerPixel),
      ),
    )
  }

  const onTimelinePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerX: event.clientX, start: cropStart }
  }

  const onCropPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    cropDragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: cropPosition.x,
      y: cropPosition.y,
    }
  }

  const onCropPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const width = event.currentTarget.clientWidth
    const height = event.currentTarget.clientHeight
    setCropPosition({
      x: Math.max(
        0,
        Math.min(
          1,
          cropDragRef.current.x -
            (event.clientX - cropDragRef.current.pointerX) / width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          1,
          cropDragRef.current.y -
            (event.clientY - cropDragRef.current.pointerY) / height,
        ),
      ),
    })
  }

  const processVideo = async () => {
    if (!videoUrl || duration < 1) return
    setIsProcessing(true)
    clearError()
    setProgress(0)
    try {
      const sampler = document.createElement("video")
      sampler.src = videoUrl
      sampler.muted = true
      sampler.playsInline = true
      await new Promise<void>((resolve, reject) => {
        sampler.onloadeddata = () => resolve()
        sampler.onerror = () =>
          reject(new Error("Your browser could not decode this video."))
      })

      const frames: HTMLCanvasElement[] = []
      for (let index = 0; index < frameCount; index += 1) {
        await seekVideo(sampler, cropStart + index / frameCount)
        const frame = document.createElement("canvas")
        frame.width = outputSpec.width
        frame.height = outputSpec.height
        const frameContext = frame.getContext("2d")
        if (!frameContext) throw new Error("Canvas rendering is unavailable.")
        drawCover(
          frameContext,
          sampler,
          sampler.videoWidth,
          sampler.videoHeight,
          outputSpec.width,
          outputSpec.height,
          cropPosition.x,
          cropPosition.y,
        )
        frames.push(frame)
        setProgress((index + 1) / (frameCount + 1))
      }

      const output = outputRef.current
      if (!output) throw new Error("The output canvas is unavailable.")
      interlaceFrames(frames, output, outputSpec.width, outputSpec.height)
      framesRef.current = frames
      setProgress(1)
      sampler.removeAttribute("src")
      sampler.load()
      setStage("workbench")
    } catch {
      showError(
        "We couldn’t finish that film. Your original is unchanged—try another file.",
        "reupload",
      )
    } finally {
      setIsProcessing(false)
    }
  }

  const onPullPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pullRef.current = { pointerX: event.clientX, start: pullOffset }
  }

  const onPullPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const next =
      pullRef.current.start + (event.clientX - pullRef.current.pointerX)
    setPullOffset(Math.max(0, Math.min(pullTravel, next)))
  }

  const exportWidget = () => {
    clearError()
    try {
      const canvas = outputRef.current
      if (!canvas) throw new Error("Missing canvas")
      const image = canvas.toDataURL("image/png")
      const html = `<!doctype html>
<!-- Made by theycallthisdesign — https://theycallthisdesign.com -->
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scanimation Pull Tab</title>
<style>
body{margin:0;display:grid;place-items:center;min-height:100vh;background:#f9f6f0;font-family:monospace}
.s{position:relative;width:min(82vw,${outputSpec.width}px);aspect-ratio:${outputSpec.width}/${outputSpec.height};overflow:hidden;border:1px solid #111;touch-action:none;container-type:inline-size}
.s img{width:100%;height:100%;object-fit:cover;transform:translateX(0);pointer-events:none}
.s:after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 ${(100 / outputSpec.width).toFixed(6)}cqw,#000 ${(100 / outputSpec.width).toFixed(6)}cqw ${((frameCount * 100) / outputSpec.width).toFixed(6)}cqw);pointer-events:none}
.t{position:absolute;right:0;top:50%;z-index:2;background:#f9f6f0;border:1px solid #111;padding:14px 5px;writing-mode:vertical-rl;transform:translateY(-50%);font-size:10px;letter-spacing:.2em}
</style>
<div class="s" id="s"><img id="i" src="${image}"><span class="t">PULL</span></div>
<script>
const s=document.querySelector('#s'),i=document.querySelector('#i'),t=document.querySelector('.t');let down=false,start=0,base=0;
s.onpointerdown=e=>{down=true;start=e.clientX;s.setPointerCapture(e.pointerId)}
s.onpointermove=e=>{if(down){const p=Math.max(0,Math.min(72,base+e.clientX-start));i.style.transform='translateX('+(p/72*${(((frameCount - 1) * 100) / outputSpec.width).toFixed(6)})+'cqw)';t.style.transform='translateY(-50%) translateX('+p+'px)'}}
s.onpointerup=e=>{down=false;base=Math.max(0,Math.min(72,base+e.clientX-start))}
</script>`
      const blob = new Blob([html], { type: "text/html" })
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = "pullframe-widget.html"
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
      notify("Your pull-tab widget is ready.")
    } catch {
      showError(
        "That download didn’t finish. Your project is safe—try again.",
        "widget",
      )
    }
  }

  const exportReel = async () => {
    const source = outputRef.current
    if (!source || isExporting) return
    setIsExporting(true)
    clearError()
    if (
      typeof MediaRecorder === "undefined" ||
      typeof HTMLCanvasElement.prototype.captureStream !== "function"
    ) {
      showError(
        "This browser can’t make a video here. You can still download the GIF.",
      )
      setIsExporting(false)
      return
    }
    try {
      const exportCanvas = document.createElement("canvas")
      exportCanvas.width = outputSpec.exportWidth
      exportCanvas.height = outputSpec.exportHeight
      const ctx = exportCanvas.getContext("2d")
      if (!ctx) throw new Error("Canvas recording is unavailable.")
      const mp4Type = "video/mp4;codecs=avc1"
      const webmType = "video/webm;codecs=vp9"
      const mimeType = MediaRecorder.isTypeSupported(mp4Type)
        ? mp4Type
        : MediaRecorder.isTypeSupported(webmType)
          ? webmType
          : "video/webm"
      const stream = exportCanvas.captureStream(30)
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 12_000_000,
      })
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      const finished = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve()
        recorder.onerror = () => reject(new Error("Recording failed"))
      })
      recorder.start()
      const frameDuration = 1000 / 30
      const totalFrames = 120
      const cycleFrames = { slow: 40, normal: 24, fast: 16 }[playbackSpeed]
      const halfCycle = cycleFrames / 2
      for (let frame = 0; frame < totalFrames; frame += 1) {
        const cycle = frame % cycleFrames
        const phase =
          cycle <= halfCycle
            ? cycle / halfCycle
            : (cycleFrames - cycle) / halfCycle
        const step = Math.round(phase * (frameCount - 1))
        ctx.drawImage(
          source,
          0,
          0,
          outputSpec.exportWidth,
          outputSpec.exportHeight,
        )
        drawScanimationMask(
          ctx,
          outputSpec.exportWidth,
          outputSpec.exportHeight,
          frameCount,
          step,
          outputSpec.exportWidth / outputSpec.width,
        )
        await new Promise((resolve) =>
          window.setTimeout(resolve, frameDuration),
        )
      }
      recorder.stop()
      await finished
      const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm"
      const blob = new Blob(chunks, { type: mimeType })
      if (!blob.size) throw new Error("Empty recording")
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `pullframe-reel.${extension}`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
      if (extension !== "mp4") {
        notify("Your reel is ready. This browser saved it as WebM.")
      } else {
        notify("Your MP4 reel is ready.")
      }
    } catch {
      showError(
        "That video download didn’t finish. Your project is safe—try again, or use GIF.",
        "video",
      )
    } finally {
      setIsExporting(false)
    }
  }

  const exportGif = async () => {
    const source = outputRef.current
    if (!source || isGifExporting) return
    setIsGifExporting(true)
    clearError()
    try {
      const gifCanvas = document.createElement("canvas")
      gifCanvas.width = outputSpec.width
      gifCanvas.height = outputSpec.height
      const ctx = gifCanvas.getContext("2d", { willReadFrequently: true })
      if (!ctx) throw new Error("GIF rendering is unavailable.")
      const bytes = createGifHeader(outputSpec.width, outputSpec.height)
      const steps = [
        ...Array.from({ length: frameCount }, (_, index) => index),
        ...Array.from(
          { length: Math.max(0, frameCount - 2) },
          (_, index) => frameCount - 2 - index,
        ),
      ]
      const gifDuration = { slow: 144, normal: 96, fast: 64 }[playbackSpeed]
      const gifDelay = Math.max(4, Math.round(gifDuration / steps.length))

      for (const step of steps) {
        ctx.drawImage(source, 0, 0)
        drawScanimationMask(
          ctx,
          outputSpec.width,
          outputSpec.height,
          frameCount,
          step,
        )
        appendGifFrame(
          bytes,
          ctx.getImageData(0, 0, outputSpec.width, outputSpec.height).data,
          outputSpec.width,
          outputSpec.height,
          gifDelay,
        )
        await new Promise((resolve) => window.setTimeout(resolve, 0))
      }
      bytes.push(0x3b)
      const blob = new Blob([new Uint8Array(bytes)], { type: "image/gif" })
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = "pullframe-loop.gif"
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
      notify("Your GIF loop is ready.")
    } catch {
      showError(
        "That GIF didn’t finish. Your project is safe—try again.",
        "gif",
      )
    } finally {
      setIsGifExporting(false)
    }
  }

  const recoverFromError = () => {
    const action = errorAction
    clearError()
    if (action === "reupload") {
      if (stage === "upload") inputRef.current?.click()
      else {
        reset()
        window.setTimeout(() => inputRef.current?.click(), 0)
      }
    }
    if (action === "video") void exportReel()
    if (action === "gif") void exportGif()
    if (action === "widget") exportWidget()
  }

  const stripOffset = duration > 1 ? (cropStart / (duration - 1)) * 42 : 0
  const nativeMp4 =
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")
  const videoExtension = nativeMp4 ? "mp4" : "webm"
  const activeFrame =
    mode === "auto"
      ? overlayStep + 1
      : Math.round((pullOffset / pullTravel) * (frameCount - 1)) + 1

  return (
    <main className="app-shell">
      {(isPreparing || isProcessing) && (
        <ProcessingOverlay
          phase={isProcessing ? "slicing" : "loading"}
          progress={isProcessing ? progress : 0.16}
        />
      )}
      {toast && (
        <div className="success-toast" role="status">
          <span>Done</span>
          <p>{toast}</p>
          <button
            type="button"
            onClick={() => setToast("")}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      <header className="site-header">
        <div className="header-start">
          <button
            className="wordmark"
            type="button"
            onClick={reset}
            aria-label="Return to upload"
          >
            PULLFRAME
          </button>
          {stage !== "upload" && (
            <button className="header-back" type="button" onClick={goBack}>
              <span aria-hidden="true">←</span> Back
            </button>
          )}
        </div>
        <div className="header-note">Scanimation studio / Browser edition</div>
        <div className="header-actions">
          <button
            className={`new-project ${
              stage === "upload" ? "new-project--quiet" : ""
            }`}
            type="button"
            onClick={reset}
            disabled={stage === "upload"}
          >
            New film <span>+</span>
          </button>
          <a
            className="github-btn"
            href="https://github.com/samyuktha2004/pullframe"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Star on GitHub"
          >
            <svg className="github-btn__icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            <span>Star on GitHub</span>
            <svg className="github-btn__star" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 11.817l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
            </svg>
          </a>
        
        </div>
      </header>

      <SectionErrorBoundary>
        {stage === "upload" && (
          <>
            <section className="upload-section">
              <div className="edition-mark">PF–01</div>
              <div
                className={`dropzone ${isDragging ? "dropzone--active" : ""}`}
                onDragEnter={() => setIsDragging(true)}
                onDragLeave={() => setIsDragging(false)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".mp4,.mov,video/mp4,video/quicktime"
                  onChange={onFileChange}
                  hidden
                />
                <div className="dropzone-index">01 / SOURCE</div>
                <div className="dropzone-center">
                  <p className="eyebrow">A moving-image experiment</p>
                  <h1>
                    Make motion
                    <br />
                    you can <em>pull.</em>
                  </h1>
                  <p className="drop-copy">
                    Upload Video. Isolate a Moment.
                    <br />
                    Generate your Illusion.
                  </p>
                  <div className="upload-actions">
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => inputRef.current?.click()}
                    >
                      Choose a film <ArrowIcon />
                    </button>
                    <button
                      className="secondary-button study-button"
                      type="button"
                      onClick={() =>
                        document
                          .getElementById("motion-studies")
                          ?.scrollIntoView({ behavior: "smooth" })
                      }
                    >
                      Try a motion study <span aria-hidden="true">↓</span>
                    </button>
                  </div>
                  <span className="file-note">
                    MP4 or MOV · Processed privately in your browser
                  </span>
                </div>
                <div className="corner corner--tl" />
                <div className="corner corner--tr" />
                <div className="corner corner--bl" />
                <div className="corner corner--br" />
              </div>
              {error && (
                <ErrorNotice
                  message={error}
                  action={errorAction}
                  onAction={recoverFromError}
                />
              )}
            </section>

            <section className="examples-section" id="motion-studies">
              <div className="examples-heading">
                <div>
                  <p className="eyebrow">No film yet?</p>
                  <h2>Try a motion study.</h2>
                </div>
                <p>
                  Three original loops drawn live with Canvas. No downloads,
                  licenses, or stock footage—just the basics of motion.
                </p>
              </div>
              <div className="example-grid">
                {(["orbit", "bounce", "wave"] as ExampleKind[]).map(
                  (kind, index) => (
                    <button
                      className={`example-card example-card--${kind}`}
                      type="button"
                      onClick={() => loadExample(kind)}
                      key={kind}
                    >
                      <span>0{index + 1}</span>
                      <div className="example-motion" aria-hidden="true">
                        {kind === "wave" ? (
                          <svg className="wave-preview" viewBox="0 0 400 220">
                            {[20, 56, 92, 128, 164, 200].map((y) => (
                              <path
                                d={`M-30 ${y} C20 ${y - 24} 70 ${y - 24} 120 ${y} S220 ${y + 24} 270 ${y} S370 ${y - 24} 430 ${y}`}
                                key={y}
                              />
                            ))}
                          </svg>
                        ) : (
                          <i />
                        )}
                      </div>
                      <strong>
                        {kind === "orbit"
                          ? "The Orbit"
                          : kind === "bounce"
                            ? "The Bounce"
                            : "Signal Wave"}
                      </strong>
                      <small>GENERATE EXAMPLE →</small>
                    </button>
                  ),
                )}
              </div>
            </section>

            <section className="intro-section">
              <div>
                <p className="eyebrow">A short introduction</p>
                <h2>
                  What is
                  <br />
                  scanimation?
                </h2>
              </div>
              <div className="intro-copy">
                <p>
                  Scanimation is an analog optical illusion. Five moments are
                  sliced into hair-thin columns, then revealed one by one
                  through a moving striped mask.
                </p>
                <p>
                  The result feels half cinema, half printed matter: movement
                  hiding in a still image, waiting for a pull.
                </p>
                <div className="source-frames">
                  <div className="source-frames-head">
                    <span>SOURCE FRAMES</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (!explainerPlaying) {
                          explainerSequenceRef.current = explainerFrame
                        }
                        setExplainerPlaying((playing) => !playing)
                      }}
                      aria-label={
                        explainerPlaying
                          ? "Pause frame demonstration"
                          : "Play frame demonstration"
                      }
                    >
                      <i aria-hidden="true">{explainerPlaying ? "Ⅱ" : "▶"}</i>
                      {explainerPlaying ? "Pause" : "Play"}
                    </button>
                  </div>
                  <div className="source-frame-list">
                    {Array.from({ length: DEFAULT_FRAME_COUNT }, (_, frame) => (
                      <button
                        className={explainerFrame === frame ? "active" : ""}
                        type="button"
                        aria-pressed={explainerFrame === frame}
                        onClick={() => {
                          setExplainerFrame(frame)
                          explainerSequenceRef.current = frame
                          setExplainerPlaying(false)
                        }}
                        key={frame}
                      >
                        <i
                          aria-hidden="true"
                          style={{ left: `calc(${18 + frame * 16}% - 6px)` }}
                        />
                        <span>0{frame + 1}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mini-demo" aria-hidden="true">
                  <canvas ref={explainerCanvasRef} width={540} height={130} />
                </div>
              </div>
            </section>
          </>
        )}

        {stage === "crop" && (
          <section className="crop-section">
            <div className="step-heading">
              <span>ISOLATE</span>
              <h1>
                Find one
                <br />
                <em>perfect</em> second.
              </h1>
              <p>
                Drag the film beneath the fixed crop window. Choose how many
                precise moments to weave together.
              </p>
            </div>

            <div className="crop-workspace">
              <div className="video-frame">
                <div
                  className="video-crop-window"
                  style={{
                    aspectRatio: `${outputSpec.width} / ${outputSpec.height}`,
                  }}
                >
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    muted
                    playsInline
                    style={{
                      objectPosition: `${cropPosition.x * 100}% ${cropPosition.y * 100}%`,
                    }}
                    onLoadedMetadata={onMetadata}
                    onError={() => {
                      setIsPreparing(false)
                      showError(
                        "We couldn’t open that film. Try another MP4 or MOV.",
                        "reupload",
                      )
                    }}
                  />
                  <div
                    className="crop-pan-surface"
                    onPointerDown={onCropPointerDown}
                    onPointerMove={onCropPointerMove}
                  >
                    <span>Drag to reframe</span>
                  </div>
                </div>
                <span className="video-file">{file?.name}</span>
                <span className="video-ratio">{outputSpec.ratio} OUTPUT</span>
                <div className="crop-position-actions">
                  <button
                    type="button"
                    onClick={() => setCropPosition({ x: 0.5, y: 0.5 })}
                  >
                    Center crop
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const video = videoRef.current
                      if (!video) return
                      if (video.paused) void video.play()
                      else video.pause()
                    }}
                  >
                    Play / pause
                  </button>
                </div>
              </div>

              <div className="timeline-panel">
                <div className="timeline-meta">
                  <span>PRECISION TIMELINE</span>
                  <strong>
                    {formatTime(cropStart)} — {formatTime(cropStart + 1)}
                  </strong>
                  <span>1.0 SEC LOCKED</span>
                </div>
                <div className="format-control">
                  <div>
                    <span>OUTPUT FORMAT</span>
                    <small>Suggested from your film. Choose any format.</small>
                  </div>
                  <div
                    className="format-options"
                    role="group"
                    aria-label="Output format"
                  >
                    {(Object.keys(OUTPUT_FORMATS) as OutputFormat[]).map(
                      (format) => {
                        const option = OUTPUT_FORMATS[format]
                        return (
                          <button
                            className={outputFormat === format ? "active" : ""}
                            type="button"
                            aria-pressed={outputFormat === format}
                            onClick={() => {
                              setOutputFormat(format)
                              setCropPosition({ x: 0.5, y: 0.5 })
                            }}
                            key={format}
                          >
                            <strong>{option.ratio}</strong>
                            <span>{option.label}</span>
                          </button>
                        )
                      },
                    )}
                  </div>
                </div>
                <div className="detail-control">
                  <div>
                    <span>MOTION DETAIL</span>
                    <small>
                      More frames feel smoother but reveal less image.
                    </small>
                  </div>
                  <div
                    className="detail-options"
                    role="group"
                    aria-label="Frame count"
                  >
                    {([
                      [3, "Bold"],
                      [5, "Balanced"],
                      [7, "Smooth"],
                    ] as const).map(([count, label]) => (
                      <button
                        className={frameCount === count ? "active" : ""}
                        type="button"
                        aria-pressed={frameCount === count}
                        onClick={() => {
                          setFrameCount(count)
                          setOverlayStep(0)
                          setPullOffset(0)
                        }}
                        key={count}
                      >
                        <strong>{count}</strong>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  id="timeline-track"
                  className="timeline-track"
                  onPointerDown={onTimelinePointerDown}
                  onPointerMove={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      updateCropFromDrag(event.clientX)
                  }}
                >
                  <div
                    className="filmstrip"
                    style={{
                      transform: `translateX(calc(-21% - ${stripOffset}%))`,
                    }}
                  >
                    {[...thumbnails, ...thumbnails].map((image, index) => (
                      <img
                        src={image}
                        alt=""
                        key={`${image.slice(-12)}-${index}`}
                      />
                    ))}
                  </div>
                  <div className="crop-window">
                    <span>IN</span>
                    <i />
                    <span>OUT</span>
                  </div>
                  <div className="timeline-line" />
                </div>
                <div className="timeline-ruler">
                  <span>00:00</span>
                  <span>DRAG TO SCRUB</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>

            <div className="crop-actions">
              <button className="text-button" type="button" onClick={reset}>
                <ArrowIcon direction="left" /> Replace film
              </button>
              <button
                className="primary-button primary-button--large"
                type="button"
                disabled={duration < 1 || isProcessing}
                onClick={processVideo}
              >
                {isProcessing
                  ? `Slicing ${Math.round(progress * 100)}%`
                  : "Lock & Slice"}{" "}
                <ArrowIcon />
              </button>
            </div>
            {error && (
              <ErrorNotice
                message={error}
                action={errorAction}
                onAction={recoverFromError}
              />
            )}
          </section>
        )}

        <canvas
          ref={outputRef}
          className={
            stage === "workbench"
              ? "output-source"
              : "output-source output-source--hidden"
          }
        />

        {stage === "workbench" && (
          <section className="workbench-section">
            <div className="workbench-head">
              <div>
                <p className="eyebrow">Your scanimation</p>
                <h1>
                  Motion,
                  <br />
                  <em>made tactile.</em>
                </h1>
              </div>
              <p>
                {frameCount} frames, one second, hundreds of slivers. Switch how
                the illusion moves, then take it with you.
              </p>
            </div>

            <div className="workbench-grid">
              <aside className="mode-panel">
                <p className="panel-label">Playback mode</p>
                <div
                  className="mode-toggle"
                  role="group"
                  aria-label="Playback mode"
                >
                  <button
                    className={mode === "auto" ? "active" : ""}
                    type="button"
                    onClick={() => setMode("auto")}
                  >
                    <span>01</span> Auto-loop video
                  </button>
                  <button
                    className={mode === "pull" ? "active" : ""}
                    type="button"
                    onClick={() => setMode("pull")}
                  >
                    <span>02</span> Interactive pull tab
                  </button>
                </div>
                <div className="mode-description">
                  <span>
                    {mode === "auto" ? "MOVING MASK" : "MOVING PRINT"}
                  </span>
                  <p>
                    {mode === "auto"
                      ? "The striped barrier glides over your still composite, revealing each moment in sequence."
                      : "The barrier stays put. Drag the paper tab to move the print beneath it by hand."}
                  </p>
                </div>
                {mode === "auto" && (
                  <div className="speed-control">
                    <span>LOOP SPEED</span>
                    <div role="group" aria-label="Loop speed">
                      {([
                        ["slow", "0.6×"],
                        ["normal", "1×"],
                        ["fast", "1.6×"],
                      ] as [PlaybackSpeed, string][]).map(([speed, label]) => (
                        <button
                          className={playbackSpeed === speed ? "active" : ""}
                          type="button"
                          onClick={() => setPlaybackSpeed(speed)}
                          key={speed}
                          aria-pressed={playbackSpeed === speed}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="frame-key">
                  <span>
                    ACTIVE FRAME · {activeFrame} OF {frameCount}
                  </span>
                  <div>
                    {Array.from(
                      { length: frameCount },
                      (_, index) => index + 1,
                    ).map((number) => (
                      <i
                        className={activeFrame === number ? "active" : ""}
                        key={number}
                      >
                        {number}
                      </i>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="preview-column">
                <div className="preview-meta">
                  <span>LIVE PREVIEW</span>
                  <span>
                    {outputSpec.width} × {outputSpec.height} ·{" "}
                    {outputSpec.ratio}
                  </span>
                </div>
                <div className="preview-wrap">
                  <div className="registration-mark registration-mark--tl">
                    +
                  </div>
                  <div className="registration-mark registration-mark--tr">
                    +
                  </div>
                  <div className="registration-mark registration-mark--bl">
                    +
                  </div>
                  <div className="registration-mark registration-mark--br">
                    +
                  </div>
                  <div
                    className="preview-window"
                    style={{
                      aspectRatio: `${outputSpec.width} / ${outputSpec.height}`,
                    }}
                  >
                    <canvas
                      className="preview-canvas"
                      width={outputSpec.width}
                      height={outputSpec.height}
                      ref={previewRef}
                    />
                  </div>
                  {mode === "pull" && (
                    <div
                      className={`pull-tab ${
                        pullOffset >= pullTravel ? "pull-tab--limit" : ""
                      }`}
                      role="slider"
                      aria-label="Pull scanimation"
                      aria-valuemin={0}
                      aria-valuemax={pullTravel}
                      aria-valuenow={Math.round(pullOffset)}
                      tabIndex={0}
                      style={
                        {
                          transform: `translateY(-50%) translateX(${pullOffset}px)`,
                          "--pull-distance": `${pullOffset}px`,
                        } as CSSProperties
                      }
                      onPointerDown={onPullPointerDown}
                      onPointerMove={onPullPointerMove}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowLeft")
                          setPullOffset((value) => Math.max(0, value - 4))
                        if (event.key === "ArrowRight")
                          setPullOffset((value) =>
                            Math.min(pullTravel, value + 4),
                          )
                      }}
                    >
                      <span>PULL</span>
                      <ArrowIcon />
                    </div>
                  )}
                </div>
                {mode === "pull" && (
                  <p className="pull-instruction">
                    Drag the paper tab. Release anywhere to hold a frame.
                  </p>
                )}
              </div>

              <aside className="export-panel">
                <p className="panel-label">Export format</p>
                <div className="export-number">
                  {mode === "auto" ? "04" : "01"}
                </div>
                <p className="export-title">
                  {mode === "auto" ? "Second loop" : "Single-file widget"}
                </p>
                <p className="export-copy">
                  {mode === "auto"
                    ? `A social-ready ${outputSpec.exportWidth} × ${outputSpec.exportHeight} ${videoExtension.toUpperCase()} loop, plus a lightweight GIF option.`
                    : "A portable HTML interaction with the image and pull behavior built in."}
                </p>
                <div className="export-actions">
                  <button
                    className="primary-button export-button"
                    type="button"
                    onClick={mode === "auto" ? exportReel : exportWidget}
                    disabled={isExporting || isGifExporting}
                  >
                    {isExporting
                      ? "Rendering…"
                      : mode === "auto"
                        ? `Download Reel (.${videoExtension})`
                        : "Export Web Widget"}
                    <DownloadIcon />
                  </button>
                  {mode === "auto" && (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={exportGif}
                      disabled={isGifExporting || isExporting}
                    >
                      {isGifExporting
                        ? "Encoding GIF…"
                        : "Download Loop (.gif)"}
                      <DownloadIcon />
                    </button>
                  )}
                </div>
                <span className="privacy-note">
                  No uploads. No cloud. Always private.
                </span>
              </aside>
            </div>
            {error && (
              <ErrorNotice
                message={error}
                action={errorAction}
                onAction={recoverFromError}
              />
            )}
          </section>
        )}
      </SectionErrorBoundary>

      <footer className="site-footer">
        <div>
          <span>AN EXPERIMENT BY</span>
          <a
            href="https://theycallthisdesign.com"
            target="_blank"
            rel="noreferrer"
          >
            theycallthisdesign.com
          </a>
        </div>
        <p>
          Made for motion people, print people,
          <br />
          and the curious in-between.
        </p>
        <span>© {new Date().getFullYear()} / LOCAL PROCESSING</span>
      </footer>
    </main>
  )
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/"
  return path === "/" || path === "/index.html" ? (
    <SectionErrorBoundary>
      <StudioApp />
    </SectionErrorBoundary>
  ) : (
    <NotFound />
  )
}
