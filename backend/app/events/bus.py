import asyncio
from collections.abc import AsyncIterator

from .types import UIEvent


class RunEventBus:
    """One-per-run buffered fan-out: producers (agent callbacks) push events,
    a single WS consumer drains them.

    `subscribe()` returns an async iterator that yields events as they arrive
    and ends when `close()` is called. Producers can push from any thread via
    `push_threadsafe()` since OpenHands runs callbacks on the agent thread.
    """

    def __init__(self, run_id: str, loop: asyncio.AbstractEventLoop) -> None:
        self.run_id = run_id
        self._loop = loop
        self._queue: asyncio.Queue[UIEvent | None] = asyncio.Queue()
        self._closed = False
        # Set True once `run_finish` is emitted; subsequent pushes are dropped
        # so late events from sub-agent threads that outlive their timeout
        # don't keep the trace tree growing after the run is "done".
        self._finalized = False
        # The asyncio.Task driving the orchestrator for this run; set by the
        # API handler after creation so the cancel endpoint can stop it.
        self.task: asyncio.Task | None = None

    def push(self, event: UIEvent) -> None:
        if self._closed:
            return
        # Drop late events after the run has finished — but always allow the
        # `run_finish` event itself through and use it to set the finalized flag.
        if self._finalized:
            return
        self._queue.put_nowait(event)
        if event.kind == "run_finish":
            self._finalized = True

    def push_threadsafe(self, event: UIEvent) -> None:
        if self._closed or self._finalized:
            return
        self._loop.call_soon_threadsafe(self._queue.put_nowait, event)

    async def subscribe(self) -> AsyncIterator[UIEvent]:
        while True:
            event = await self._queue.get()
            if event is None:
                return
            yield event

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self._loop.call_soon_threadsafe(self._queue.put_nowait, None)


class EventBusRegistry:
    """Maps run_id -> RunEventBus. Single process, in-memory."""

    def __init__(self) -> None:
        self._buses: dict[str, RunEventBus] = {}

    def create(self, run_id: str) -> RunEventBus:
        loop = asyncio.get_running_loop()
        bus = RunEventBus(run_id, loop)
        self._buses[run_id] = bus
        return bus

    def get(self, run_id: str) -> RunEventBus | None:
        return self._buses.get(run_id)

    def remove(self, run_id: str) -> None:
        bus = self._buses.pop(run_id, None)
        if bus is not None:
            bus.close()


registry = EventBusRegistry()
