export const OUTPUT_WIDTH = 540
export const OUTPUT_HEIGHT = 960
export const DEFAULT_FRAME_COUNT = 5
export const SLIT_WIDTH = 1

export type ExampleKind = "orbit" | "bounce" | "wave"
export type OutputFormat = "portrait" | "landscape" | "square"

export const OUTPUT_FORMATS = {
  portrait: {
    label: "Portrait",
    ratio: "9:16",
    width: 540,
    height: 960,
    exportWidth: 1080,
    exportHeight: 1920,
  },
  landscape: {
    label: "Landscape",
    ratio: "16:9",
    width: 960,
    height: 540,
    exportWidth: 1920,
    exportHeight: 1080,
  },
  square: {
    label: "Square",
    ratio: "1:1",
    width: 540,
    height: 540,
    exportWidth: 1080,
    exportHeight: 1080,
  },
} as const

export function seekVideo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error("The browser took too long to seek through this video."))
    }, 12_000)
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener("seeked", done)
      video.removeEventListener("error", failed)
    }
    const done = () => {
      cleanup()
      resolve()
    }
    const failed = () => {
      cleanup()
      reject(new Error("This video could not be decoded by your browser."))
    }
    video.addEventListener("seeked", done, { once: true })
    video.addEventListener("error", failed, { once: true })
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.01))
  })
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  focalX = 0.5,
  focalY = 0.5,
) {
  const sourceRatio = sourceWidth / sourceHeight
  const targetRatio = width / height
  let sx = 0
  let sy = 0
  let sw = sourceWidth
  let sh = sourceHeight

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio
    sx = (sourceWidth - sw) * focalX
  } else {
    sh = sourceWidth / targetRatio
    sy = (sourceHeight - sh) * focalY
  }
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height)
}

export function interlaceFrames(
  frames: HTMLCanvasElement[],
  output: HTMLCanvasElement,
  width = OUTPUT_WIDTH,
  height = OUTPUT_HEIGHT,
) {
  output.width = width
  output.height = height
  const ctx = output.getContext("2d")
  if (!ctx) throw new Error("Canvas rendering is unavailable.")
  ctx.clearRect(0, 0, width, height)
  const stripePeriod = frames.length * SLIT_WIDTH

  // Native-width strips are copied by drawImage; no per-pixel buffers are used.
  for (let x = 0; x < width; x += stripePeriod) {
    for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
      const targetX = x + frameIndex * SLIT_WIDTH
      if (targetX < width) {
        ctx.drawImage(
          frames[frameIndex],
          targetX,
          0,
          SLIT_WIDTH,
          height,
          targetX,
          0,
          SLIT_WIDTH,
          height,
        )
      }
    }
  }
}

export function drawScanimationMask(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frameCount: number,
  phase: number,
  pixelScale = 1,
) {
  const slitWidth = SLIT_WIDTH * pixelScale
  const stripePeriod = frameCount * slitWidth
  ctx.fillStyle = "#000"
  for (
    let x = -stripePeriod + phase * slitWidth;
    x < width + stripePeriod;
    x += stripePeriod
  ) {
    ctx.fillRect(x + slitWidth, 0, stripePeriod - slitWidth, height)
  }
}

export function createExampleFrames(
  kind: ExampleKind,
  frameCount = DEFAULT_FRAME_COUNT,
  width = OUTPUT_WIDTH,
  height = OUTPUT_HEIGHT,
) {
  return Array.from({ length: frameCount }, (_, index) => {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas rendering is unavailable.")
    ctx.fillStyle = "#f7f4eb"
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = "#111111"
    ctx.lineWidth = 2
    const shortEdge = Math.min(width, height)

    if (kind === "orbit") {
      const angle = (index / frameCount) * Math.PI * 2 - Math.PI / 2
      ctx.fillStyle = "#d8542c"
      ctx.beginPath()
      ctx.arc(
        width / 2 + Math.cos(angle) * shortEdge * 0.29,
        height / 2 + Math.sin(angle) * shortEdge * 0.29,
        shortEdge * 0.115,
        0,
        Math.PI * 2,
      )
      ctx.fill()
    } else if (kind === "bounce") {
      const progress = Math.sin((index / Math.max(1, frameCount - 1)) * Math.PI)
      ctx.fillStyle = "#111111"
      ctx.fillRect(width * 0.13, height * 0.8, width * 0.74, 2)
      ctx.fillStyle = "#d8542c"
      ctx.beginPath()
      ctx.arc(
        width / 2,
        height * 0.72 - progress * height * 0.45,
        shortEdge * 0.145,
        0,
        Math.PI * 2,
      )
      ctx.fill()
      ctx.save()
      ctx.translate(width / 2, height * 0.815)
      ctx.scale(1 - progress * 0.7, 1)
      ctx.fillStyle = "rgba(17,17,17,.2)"
      ctx.beginPath()
      ctx.ellipse(0, 0, shortEdge * 0.22, shortEdge * 0.035, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    } else {
      ctx.lineWidth = Math.max(8, shortEdge * 0.033)
      ctx.lineCap = "round"
      for (let line = 0; line < 6; line += 1) {
        ctx.beginPath()
        ctx.strokeStyle = "#d8542c"
        for (let x = -20; x <= width + 20; x += 8) {
          const y =
            height * (0.18 + line * 0.13) +
            Math.sin(x / (width / 10) + index * 0.85 + line * 0.4) *
              height *
              0.05
          if (x === -20) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
    }
    return canvas
  })
}

function pushUint16(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >> 8) & 0xff)
}

function lzwEncode(indices: Uint8Array) {
  const clearCode = 256
  const endCode = 257
  let codeSize = 9
  let nextCode = 258
  let dictionary = new Map<number, number>()
  const output: number[] = []
  let bitBuffer = 0
  let bitCount = 0

  const writeCode = (code: number) => {
    bitBuffer |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) {
      output.push(bitBuffer & 0xff)
      bitBuffer >>= 8
      bitCount -= 8
    }
  }
  const reset = () => {
    dictionary = new Map()
    codeSize = 9
    nextCode = 258
  }

  writeCode(clearCode)
  let prefix = indices[0]
  for (let index = 1; index < indices.length; index += 1) {
    const value = indices[index]
    const key = (prefix << 8) | value
    const knownCode = dictionary.get(key)
    if (knownCode !== undefined) {
      prefix = knownCode
      continue
    }
    writeCode(prefix)
    if (nextCode < 4096) {
      dictionary.set(key, nextCode)
      nextCode += 1
      if (nextCode === 1 << codeSize && codeSize < 12) codeSize += 1
    } else {
      writeCode(clearCode)
      reset()
    }
    prefix = value
  }
  writeCode(prefix)
  writeCode(endCode)
  if (bitCount > 0) output.push(bitBuffer & 0xff)
  return output
}

export function appendGifFrame(
  bytes: number[],
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  delay = 12,
) {
  const indices = new Uint8Array(width * height)
  for (
    let source = 0, target = 0;
    source < pixels.length;
    source += 4, target += 1
  ) {
    indices[target] =
      (pixels[source] & 0xe0) |
      ((pixels[source + 1] & 0xe0) >> 3) |
      (pixels[source + 2] >> 6)
  }
  bytes.push(0x21, 0xf9, 0x04, 0x00)
  pushUint16(bytes, delay)
  bytes.push(0x00, 0x00, 0x2c, 0, 0, 0, 0)
  pushUint16(bytes, width)
  pushUint16(bytes, height)
  bytes.push(0x00, 0x08)
  const compressed = lzwEncode(indices)
  for (let offset = 0; offset < compressed.length; offset += 255) {
    const block = compressed.slice(offset, offset + 255)
    bytes.push(block.length, ...block)
  }
  bytes.push(0x00)
}

export function createGifHeader(width: number, height: number) {
  const bytes = Array.from(new TextEncoder().encode("GIF89a"))
  pushUint16(bytes, width)
  pushUint16(bytes, height)
  bytes.push(0xf7, 0x00, 0x00)
  for (let index = 0; index < 256; index += 1) {
    bytes.push(
      Math.round(((index >> 5) & 7) * (255 / 7)),
      Math.round(((index >> 2) & 7) * (255 / 7)),
      (index & 3) * 85,
    )
  }
  bytes.push(
    0x21,
    0xff,
    0x0b,
    ...new TextEncoder().encode("NETSCAPE2.0"),
    0x03,
    0x01,
    0,
    0,
    0,
  )
  return bytes
}
