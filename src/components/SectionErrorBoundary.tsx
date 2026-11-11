import { Component, type ErrorInfo, type ReactNode } from "react"

type Props = {
  children: ReactNode
}

type State = {
  failed: boolean
}

export default class SectionErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("PULLFRAME section failed", error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <section className="section-fallback" role="alert">
        <span>Something slipped out of frame</span>
        <h1>This part didn’t load.</h1>
        <p>
          Your files were never uploaded. Return to the studio and try again.
        </p>
        <a className="primary-button" href="/">
          Return to the studio <span aria-hidden="true">→</span>
        </a>
      </section>
    )
  }
}
