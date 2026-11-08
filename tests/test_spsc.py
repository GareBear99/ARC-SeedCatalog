"""Tests for the bounded SPSC causal-tick ring (cli/arc_seedcatalog/spsc.py)
and for the tick path wired through build().

Run:  python3 -m unittest discover -s tests -v
(standard library only; no pytest needed.)

These tests prove the SPSC property Gary ordered: ticks cannot pile up.
The ring is bounded -- a producer can never get more than ``capacity``
ticks ahead of its consumer -- because a full ring applies backpressure
(blocks the producer) instead of dropping ticks or growing.
"""

import sys
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "cli" / "arc_seedcatalog"))

from spsc import SPSCRing  # noqa: E402
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "seedcatalog_cli",
    Path(__file__).resolve().parents[1] / "cli" / "arc_seedcatalog" / "cli.py",
)
cli = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cli)


class TestSPSCRingBounded(unittest.TestCase):
    def test_capacity_must_be_power_of_two(self):
        with self.assertRaises(ValueError):
            SPSCRing(3)
        with self.assertRaises(ValueError):
            SPSCRing(0)
        SPSCRing(1)
        SPSCRing(1024)

    def test_ring_never_exceeds_capacity_and_full_push_blocks(self):
        """Fill the ring, then prove the next push BLOCKS (backpressure)
        instead of accumulating a tick past the bound."""
        ring = SPSCRing(4)
        for i in range(4):
            ring.push(i)
        self.assertEqual(len(ring), 4)
        self.assertEqual(ring.max_inflight, 4)

        done = threading.Event()

        def extra_push():
            ring.push(99)  # must block until a slot frees
            done.set()

        t = threading.Thread(target=extra_push, daemon=True)
        t.start()
        time.sleep(0.25)
        # The producer is still blocked and the ring did NOT grow.
        self.assertFalse(done.is_set(), "push past capacity must block, not pile up")
        self.assertEqual(len(ring), 4)
        self.assertEqual(ring.max_inflight, 4)
        # Free one slot: the blocked producer completes, and only then.
        self.assertEqual(ring.pop(), 0)
        self.assertTrue(done.wait(timeout=2.0), "blocked push must unblock once a slot frees")
        self.assertEqual(len(ring), 4)
        t.join(timeout=2.0)

    def test_producer_cannot_pile_up_beyond_bound(self):
        """A fast producer racing a slow consumer never gets more than
        ``capacity`` ticks ahead, however many ticks it tries to send."""
        capacity = 8
        ring = SPSCRing(capacity)
        total = 5000
        observed_max = 0
        stop = threading.Event()

        def producer():
            for i in range(total):
                ring.push(i)
            ring.close()

        def consumer():
            nonlocal observed_max
            while True:
                item = ring.pop()
                if item is None:
                    return
                # Slow consumer: the producer would pile up without a bound.
                time.sleep(0.0002)
                n = len(ring)
                if n > observed_max:
                    observed_max = n

        pt = threading.Thread(target=producer, daemon=True)
        ct = threading.Thread(target=consumer, daemon=True)
        pt.start()
        ct.start()
        pt.join(timeout=30)
        ct.join(timeout=30)
        self.assertFalse(pt.is_alive())
        self.assertFalse(ct.is_alive())
        self.assertEqual(ring.pushed, total)
        self.assertEqual(ring.popped, total)
        self.assertLessEqual(ring.max_inflight, capacity)
        self.assertLessEqual(observed_max, capacity)

    def test_fifo_causal_order_preserved(self):
        """Ticks come out in the order they went in (causal ordering),
        even when the producer has to block on a full ring."""
        ring = SPSCRing(16)
        sent = list(range(1000))

        def producer():
            for v in sent:
                ring.push(v)
            ring.close()

        t = threading.Thread(target=producer, daemon=True)
        t.start()
        got = []
        while True:
            item = ring.pop()
            if item is None:
                break
            got.append(item)
        t.join(timeout=10)
        self.assertFalse(t.is_alive())
        self.assertEqual(got, sent)

    def test_close_drains_then_returns_none(self):
        ring = SPSCRing(4)
        ring.push("a")
        ring.push("b")
        ring.close()
        self.assertEqual(ring.pop(), "a")
        self.assertEqual(ring.pop(), "b")
        self.assertIsNone(ring.pop())
        self.assertIsNone(ring.pop())


class TestBuildTickPath(unittest.TestCase):
    def test_build_identical_hash_with_tiny_ring(self):
        """End to end through the SPSC tick path with a ring of 8: the
        catalog_hash must be identical to the unbounded baseline, which
        proves no tick was dropped, duplicated, or reordered."""
        root = Path(__file__).resolve().parents[1]
        path = root / "examples" / "catalogs" / "synthetic_500.example.json"
        baseline = cli.build(str(path), "smoke", "2026-05-16")
        tiny = cli.build(str(path), "smoke", "2026-05-16", ring_capacity=8)
        self.assertEqual(tiny["catalog_hash"], baseline["catalog_hash"])
        self.assertEqual(
            tiny["receipt_bundle"]["count"], baseline["receipt_bundle"]["count"]
        )
        self.assertEqual(tiny, baseline)

    def test_iter_rows_streams_without_materialising(self):
        """iter_rows is a generator: it yields rows one at a time and
        does not build the whole list up front."""
        import types

        doc = json_doc = {
            "servers": [
                {
                    "server_id": "s",
                    "server_type": "authorized_catalog",
                    "region": "CA",
                    "legal_basis": "public_domain_or_licensed",
                    "items": [{"path": "/x", "category": "movie", "title": "T"}],
                }
            ]
        }
        gen = cli.iter_rows(doc)
        self.assertIsInstance(gen, types.GeneratorType)
        row = next(gen)
        self.assertEqual(row["_server_id"], "s")
        self.assertEqual(row["_server_type"], "authorized_catalog")
        with self.assertRaises(StopIteration):
            next(gen)


if __name__ == "__main__":
    unittest.main()
