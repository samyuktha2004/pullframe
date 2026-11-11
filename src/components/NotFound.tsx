export default function NotFound() {
  return (
    <main className="not-found">
      <div className="vanish-mark" aria-hidden="true">
        <span>4</span>
        <div className="vanish-zero" />
        <span>4</span>
        <div className="vanish-grate" />
      </div>
      <p className="eyebrow">Page slipped between the frames</p>
      <h1>
        Now you see it.
        <br />
        <em>Now you don’t.</em>
      </h1>
      <p className="not-found-copy">
        This page has vanished from the sequence. Pull back to the studio and
        begin again.
      </p>
      <a className="primary-button" href="/">
        Return to the studio <span aria-hidden="true">→</span>
      </a>
    </main>
  )
}
