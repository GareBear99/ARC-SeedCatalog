"""Bounded single-producer single-consumer (SPSC) ring for causal ticks.

The causal ticks of ARC-SeedCatalog are the per-entry events that flow
through the pipeline::

    ingest -> normalize -> HMAC entry id -> source hash ->
    category vector -> receipt -> bundle -> handoff JSONL ->
    proof pack -> .arcbin

The LuciferAI bubbles in Lucid are ordered by these causal ticks, so the
tick channel must be *bounded*: a producer that can run arbitrarily far
ahead of its consumer lets unprocessed ticks pile up without limit.
This module is the bound.

Design (FreeEQ8 lock-free SPSC triple-buffer discipline, adapted to a
ring):
  * Preallocated ring. ``capacity`` slots are allocated once at
    construction (power of two, default 1024). No allocation happens
    per tick in the hot path -- a slot is just a reference cell that
    is reused.
  * Single producer, single consumer. Only the producer writes ``tail``
    and only the consumer writes ``head``. The counters are monotonic
    (they never wrap); only the slot index wraps, via ``idx & mask``.
    A slot is free exactly when ``tail - head < capacity``, so the
    producer can never overwrite a live tick.
  * Full policy: BACKPRESSURE. When the ring is full the producer
    BLOCKS (spins briefly, then yields) until the consumer frees a
    slot. Ticks are never dropped and the buffer never grows.
    A producer therefore cannot get more than ``capacity`` ticks
    ahead of its consumer -- ticks cannot pile up.
  * Empty policy: the consumer blocks until a tick arrives. ``close()``
    (called by the producer when it is done) lets the consumer drain
    the remaining ticks and then return ``None``.
  * FIFO. Ticks come out in the order they went in, which is what
    keeps the causal tick ordering intact.
  * No lock in the hot path. ``push``/``pop`` use no ``threading.Lock``
    and no ``queue.Queue``. The only synchronisation is the
    monotonically-advanced indices plus the GIL.

Honesty note (read this before assuming "lock-free" means what it
means in C/Rust): this is pure Python on CPython. CPython's GIL makes
a plain int attribute read/write atomic, and that is what this ring
relies on for index visibility. It is *not* truly lock-free at the C
level -- the GIL itself is a lock, and a thread can be descheduled
mid-operation. What this module guarantees, and what matters for the
tick channel, is the SPSC *structure and discipline*: a fixed bound,
one writer per index, no mutex around the ring, no per-tick
allocation, and a producer that cannot outrun its consumer. The bound
(``len(ring) <= capacity`` at every instant) holds regardless of the
GIL, because the producer physically cannot write a slot until the
consumer has freed it.
"""

from __future__ import annotations

import time

__all__ = ["SPSCRing"]

# Busy-spin iterations before yielding the GIL while waiting for a slot
# (full ring) or a tick (empty ring). Short on purpose: the other end is
# usually only microseconds away.
_SPIN = 100


def _wait() -> None:
    """Brief spin, then yield the GIL so the other end can run.

    Used only on the wait paths (ring full / ring empty), never on the
    fast push/pop path. No lock is taken here.
    """
    for _ in range(_SPIN):
        pass
    time.sleep(0)


class SPSCRing:
    """A bounded single-producer single-consumer ring buffer.

    ``capacity`` must be a power of two >= 1. The ring holds at most
    ``capacity`` ticks at any instant; ``len(ring)`` never exceeds it.

    ``track`` (default True) keeps the ``max_inflight`` / ``pushed`` /
    ``popped`` counters. Turn it off for the raw tick-rate ceiling --
    the counters cost ~25% of the hot path -- and on when you want to
    prove boundedness in a real pipeline (``build()`` leaves it on).
    """

    __slots__ = ("_capacity", "_mask", "_slots", "_head", "_tail",
                 "_closed", "_track", "max_inflight", "pushed", "popped")

    def __init__(self, capacity: int = 1024, track: bool = True) -> None:
        if capacity < 1 or (capacity & (capacity - 1)) != 0:
            raise ValueError("capacity must be a power of two >= 1")
        self._capacity = capacity
        self._mask = capacity - 1
        self._slots = [None] * capacity
        self._head = 0  # consumer index; only the consumer writes it
        self._tail = 0  # producer index; only the producer writes it
        self._closed = False  # set by the producer when it is done
        self._track = track
        # Observability (single cheap comparison in push; not a lock).
        self.max_inflight = 0
        self.pushed = 0
        self.popped = 0

    @property
    def capacity(self) -> int:
        return self._capacity

    def __len__(self) -> int:
        """Ticks currently in flight (0 .. capacity)."""
        return self._tail - self._head

    def push(self, item) -> None:
        """Enqueue one tick. Producer only.

        Blocks (backpressure) while the ring is full. Never drops the
        tick and never grows the ring.
        """
        # Slots/mask never change after construction, so bind them once.
        slots = self._slots
        mask = self._mask
        capacity = self._capacity
        # Full when tail - head == capacity. Wait for the consumer to
        # free a slot. The slot at tail & mask is free exactly when
        # this condition clears, so we can never overwrite a live tick.
        while self._tail - self._head >= capacity:
            _wait()
        slots[self._tail & mask] = item
        # Publish AFTER the slot write, so the consumer never reads a
        # slot the producer has not finished writing.
        self._tail += 1
        if self._track:
            self.pushed += 1
            inflight = self._tail - self._head
            if inflight > self.max_inflight:
                self.max_inflight = inflight

    def pop(self):
        """Dequeue one tick. Consumer only.

        Blocks while the ring is empty. Returns ``None`` only when the
        producer has called :meth:`close` AND the ring has been fully
        drained. The closed check is paired with a re-check that the
        ring is still empty, so a tick pushed just before ``close()``
        is never skipped.
        """
        slots = self._slots
        mask = self._mask
        while True:
            if self._head != self._tail:
                item = slots[self._head & mask]
                slots[self._head & mask] = None
                self._head += 1
                if self._track:
                    self.popped += 1
                return item
            if self._closed and self._head == self._tail:
                return None
            _wait()

    def close(self) -> None:
        """Signal end-of-stream. Producer only; call once, when done.

        The consumer drains whatever is left and then ``pop()``
        returns ``None``.
        """
        self._closed = True
