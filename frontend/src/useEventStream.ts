import { useEffect, useRef } from 'react'
import { wsUrl } from './api'
import { useRunStore } from './store'
import type { UIEvent } from './types'

/**
 * Subscribes to the run's WebSocket. Auto-reconnects with exponential backoff
 * (up to ~8s) until a `run_finish` event arrives or the runId changes.
 */
export function useEventStream(runId: string | null) {
  const pushEvent = useRunStore((s) => s.pushEvent)
  const setConnected = useRunStore((s) => s.setConnected)
  const setStatus = useRunStore((s) => s.setStatus)
  const cancelledRef = useRef(false)
  const finishedRef = useRef(false)

  useEffect(() => {
    if (!runId) return
    cancelledRef.current = false
    finishedRef.current = false
    let attempt = 0
    let socket: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (cancelledRef.current || finishedRef.current) return
      const ws = new WebSocket(wsUrl(runId))
      socket = ws

      ws.onopen = () => {
        attempt = 0
        setConnected(true)
        setStatus('running')
      }
      ws.onmessage = (msg) => {
        try {
          const ev = JSON.parse(msg.data) as UIEvent
          if (ev.kind === 'run_finish') finishedRef.current = true
          pushEvent(ev)
        } catch (e) {
          console.error('bad event', e)
        }
      }
      ws.onerror = () => {
        setStatus('error', 'WebSocket error')
      }
      ws.onclose = () => {
        setConnected(false)
        if (cancelledRef.current || finishedRef.current) return
        attempt += 1
        const delay = Math.min(8000, 500 * 2 ** Math.min(attempt, 4))
        retryTimer = setTimeout(connect, delay)
      }
    }
    connect()

    return () => {
      cancelledRef.current = true
      if (retryTimer) clearTimeout(retryTimer)
      socket?.close()
    }
  }, [runId, pushEvent, setConnected, setStatus])
}
