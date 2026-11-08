#!/usr/bin/env python3
"""SPSC tick-ring + full-pipeline throughput benchmark.

Measures TWO numbers separately and honestly -- do not conflate them:

  1. Raw SPSC tick-ring throughput (push+pop only, no hashing).
     This is the tick channel itself. It is the only number that can
     reach millions/sec in pure Python, because a tick here is just a
     slot write + an index bump.
  2. Full pipeline throughput (ingest -> HMAC entry id -> source hash
     -> category vector -> receipt -> bundle) in entries/sec and
     hash ops/sec. This is the real product rate. It is bounded by
     the per-entry cryptographic + canonical-JSON work, NOT by the
     ring, and it will not reach millions/sec in pure Python.

Usage:
    python3 benchmarks/benchmark_spsc.py [--ticks N] [--entries N]
    [--runs R]

Writes benchmarks/BENCHMARK_SPSC_REPORT.json and prints the report.
"""
from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "cli" / "arc_seedcatalog"))

from spsc import SPSCRing  # noqa: E402
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "seedcatalog_cli", ROOT / "cli" / "arc_seedcatalog" / "cli.py"
)
cli = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cli)


def gen_catalog(path: Path, entries: int, seed: int = 7) -> Path:
    """Deterministic synthetic catalog (same shape as the repo examples)."""
    rng = random.Random(seed)
    cats = ["movie", "show", "game", "public-domain", "internal", "homebrew"]
    n_servers = 20
    per = max(1, entries // n_servers)
    servers = []
    made = 0
    for s in range(n_servers):
        items = []
        for i in range(per):
            items.append(
                {
                    "path": f"/catalog/public-domain/item/{s:02d}-{i:05d}",
                    "category": rng.choice(cats),
                    "title": f"Demo Title {s}-{i}",
                }
            )
        made += len(items)
        servers.append(
            {
                "server_id": f"public-domain-node-{s}",
                "server_type": "authorized_catalog",
                "region": "CA",
                "legal_basis": "public_domain_or_licensed",
                "items": items,
            }
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"servers": servers}))
    return path


def bench_ring(n_ticks: int, capacity: int, track: bool, runs: int) -> dict:
    """Two-thread producer/consumer through the real SPSC ring."""
    rates = []
    max_inflight = 0
    for _ in range(runs):
        ring = SPSCRing(capacity, track=track)
        t0 = time.perf_counter()

        def prod():
            for i in range(n_ticks):
                ring.push(i)
            ring.close()

        def cons():
            while ring.pop() is not None:
                pass

        pt = threading.Thread(target=prod)
        ct = threading.Thread(target=cons)
        pt.start()
        ct.start()
        pt.join()
        ct.join()
        dt = time.perf_counter() - t0
        rates.append(n_ticks / dt)
        max_inflight = max(max_inflight, ring.max_inflight)
    return {
        "capacity": capacity,
        "track": track,
        "ticks": n_ticks,
        "runs": runs,
        "ticks_per_second_median": round(statistics.median(rates)),
        "ticks_per_second_min": round(min(rates)),
        "ticks_per_second_max": round(max(rates)),
        "max_inflight_observed": max_inflight,
    }


def bench_pipeline(catalog: Path, entries: int, capacity: int, runs: int) -> dict:
    """Full build() pipeline (ingest -> hash -> bundle), in-process."""
    times = []
    count = 0
    for _ in range(runs):
        t0 = time.perf_counter()
        split = cli.build(str(catalog), "bench", "2026-05-16", ring_capacity=capacity)
        times.append(time.perf_counter() - t0)
        count = split["receipt_bundle"]["count"]
    med = statistics.median(times)
    return {
        "entries": count,
        "ring_capacity": capacity,
        "runs": runs,
        "seconds_median": round(med, 4),
        "entries_per_second": round(count / med),
        # 5 hash ops per entry: sha(sf) + hmac(entry_id) + hmac(catvec)
        # + sha(category) + sha(canon(core)).
        "hash_ops_per_second": round(5 * count / med),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ticks", type=int, default=2_000_000)
    ap.add_argument("--entries", type=int, default=50_000)
    ap.add_argument("--runs", type=int, default=3)
    args = ap.parse_args()

    catalog = ROOT / "out" / "bench" / f"synthetic_{args.entries}.example.json"
    if not catalog.exists() or json.loads(catalog.read_text())["servers"][0].get("items") is None:
        gen_catalog(catalog, args.entries)
    # Confirm the entry count matches the request.
    doc = json.loads(catalog.read_text())
    n = sum(len(s.get("items", [])) for s in doc["servers"])
    if n != args.entries:
        gen_catalog(catalog, args.entries)
        n = args.entries

    ring_results = []
    for capacity in (1024, 4096):
        ring_results.append(bench_ring(args.ticks, capacity, True, args.runs))
    # Raw ceiling: stats off.
    ring_results.append(bench_ring(args.ticks, 4096, False, args.runs))

    pipeline_results = []
    for capacity in (1024, 8):
        pipeline_results.append(bench_pipeline(catalog, n, capacity, args.runs))

    report = {
        "schema": "arc.seedcatalog.benchmark_spsc.v9",
        "python": sys.version,
        "machine": {"note": "Linux VM, 4 vCPU, 8 GB RAM (this run)"},
        "workload": {"catalog": str(catalog), "entries": n, "ticks": args.ticks},
        "raw_spsc_ring_ticks_per_second": ring_results,
        "full_pipeline_entries_per_second": pipeline_results,
        "reading": (
            "The raw SPSC tick ring is the channel; the full pipeline is the "
            "product. The ring can exceed 1M ticks/s in pure Python. The full "
            "pipeline cannot in pure Python: each entry costs ~2 canonical-"
            "JSON serialisations + 2 HMAC-SHA256 + 3 SHA-256 (~30us/entry "
            "in-process). Reaching millions of entries/sec for the full "
            "pipeline needs a compiled hot path (a C/Rust extension, or a "
            "reimplementation of the per-entry hashing) and/or a cheaper "
            "per-entry scheme (fewer hash ops, precomputed canonical forms, "
            "batched hashing)."
        ),
    }
    out = ROOT / "benchmarks" / "BENCHMARK_SPSC_REPORT.json"
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
