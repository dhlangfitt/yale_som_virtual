import { useEffect, useRef, useState } from 'react'
import { chat } from './api.js'

const GREETING = {
  zaman:
    "Yo! Welcome to 409. Ask me anything — AI, the course, what else is worth taking this term. I got you.",
}

export default function Chat({ professor, name, course, onClose }) {
  const [turns, setTurns] = useState(() => [{ role: 'prof', text: GREETING[professor] ?? 'Yes?' }])
  const [history, setHistory] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const scroller = useRef()
  const input = useRef()
  const abort = useRef()

  useEffect(() => {
    input.current?.focus()
    return () => abort.current?.abort()
  }, [])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [turns, busy])

  // Esc closes the chat rather than falling through to the pointer-lock pause.
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onClose])

  async function send(e) {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setError(null)
    setTurns((t) => [...t, { role: 'me', text }])
    setBusy(true)
    abort.current = new AbortController()
    try {
      const reply = await chat(professor, text, history, abort.current.signal)
      setHistory(reply.history)
      setTurns((t) => [...t, { role: 'prof', text: reply.reply }])
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      setBusy(false)
      input.current?.focus()
    }
  }

  return (
    <div className="chat">
      <header>
        <div>
          <b>Prof. {name}</b>
          {course && <span className="course">{course}</span>}
        </div>
        <button onClick={onClose} aria-label="Close chat">
          ✕
        </button>
      </header>

      <div className="log" ref={scroller}>
        {turns.map((t, i) => (
          <div key={i} className={`turn ${t.role}`}>
            {t.text}
          </div>
        ))}
        {busy && (
          <div className="turn prof typing">
            <span />
            <span />
            <span />
          </div>
        )}
        {error && (
          <div className="turn err">
            {error}
            <div className="hint">
              Is the backend running? <code>cd backend &amp;&amp; .venv/bin/uvicorn main:app --port 8000</code>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={send}>
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Ask Prof. ${name.split(' ').slice(-1)[0]}…`}
          maxLength={4000}
        />
        <button type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
