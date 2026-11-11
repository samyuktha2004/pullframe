type ProcessingOverlayProps = {
  phase: "loading" | "slicing"
  progress: number
}

export default function ProcessingOverlay({
  phase,
  progress,
}: ProcessingOverlayProps) {
  const slicing = phase === "slicing"
  return (
    <div className="processing-overlay" role="status" aria-live="polite">
      <div className="processing-card">
        <div className="processing-visual" aria-hidden="true">
          <div className="processing-disc" />
          <div className="processing-grate" />
        </div>
        <div className="processing-copy">
          <span>{slicing ? "02 / INTERLACING" : "01 / READING FILM"}</span>
          <h2>
            {slicing ? "Slicing time into columns." : "Unspooling your film."}
          </h2>
          <p>
            {slicing
              ? "Five moments are being sampled and woven into one still image. Everything stays on this device."
              : "We’re reading the duration and making a lightweight timeline. Larger films can take a moment."}
          </p>
          <div className="processing-progress">
            <i style={{ width: `${Math.max(8, progress * 100)}%` }} />
          </div>
          <small>
            {slicing ? `${Math.round(progress * 100)}%` : "PLEASE WAIT"}
          </small>
        </div>
      </div>
    </div>
  )
}
