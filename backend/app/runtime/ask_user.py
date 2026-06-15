"""AskUserBroker — sync future registry that lets a tool running inside the
OpenHands agent thread block until the FastAPI handler resolves the answer.

We use ``concurrent.futures.Future`` (sync) rather than ``asyncio.Future`` because
the OpenHands agent runs on a worker thread and tool executors are sync.
"""

from __future__ import annotations

import threading
from concurrent.futures import Future, TimeoutError as FutureTimeoutError


class AskUserBroker:
    def __init__(self, default_timeout_sec: float = 600.0) -> None:
        self._futures: dict[str, Future[str]] = {}
        self._lock = threading.Lock()
        self.default_timeout_sec = default_timeout_sec

    def wait_for_answer(self, run_id: str, timeout: float | None = None) -> str:
        """Called by the ask_user tool executor; blocks until resolved or timed out."""
        timeout = timeout if timeout is not None else self.default_timeout_sec
        with self._lock:
            fut = self._futures.get(run_id)
            if fut is None:
                fut = Future()
                self._futures[run_id] = fut
        try:
            return fut.result(timeout=timeout)
        except FutureTimeoutError:
            raise TimeoutError(f"ask_user timed out after {timeout}s") from None
        finally:
            with self._lock:
                self._futures.pop(run_id, None)

    def resolve(self, run_id: str, answer: str) -> bool:
        """Called by the FastAPI /answer endpoint; returns True if a waiter was woken."""
        with self._lock:
            fut = self._futures.get(run_id)
            if fut is None:
                fut = Future()
                self._futures[run_id] = fut
        if fut.done():
            return False
        fut.set_result(answer)
        return True

    def cancel(self, run_id: str) -> None:
        with self._lock:
            fut = self._futures.pop(run_id, None)
        if fut is not None and not fut.done():
            fut.set_exception(RuntimeError("cancelled"))


broker = AskUserBroker()
