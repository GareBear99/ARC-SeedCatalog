#!/usr/bin/env python3
from __future__ import annotations
import json, subprocess, sys, time, statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "cli" / "arc_seedcatalog" / "cli.py"
CASES = [
    ("canonical", ROOT / "examples/catalogs/canonical_servers.example.json"),
    ("flat", ROOT / "examples/catalogs/flat_rows.example.json"),
    ("data_wrapped", ROOT / "examples/catalogs/data_wrapped.example.json"),
    ("synthetic_500", ROOT / "examples/catalogs/synthetic_500.example.json"),
]

def run(cmd):
    t0 = time.perf_counter()
    subprocess.run(cmd, cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    return time.perf_counter() - t0

def main():
    outdir = ROOT / "out" / "bench"
    outdir.mkdir(parents=True, exist_ok=True)
    results = []
    for name, path in CASES:
        times = []
        split = outdir / f"{name}.split.json"
        for _ in range(3):
            times.append(run([sys.executable, str(CLI), "ingest", str(path), "--seed", "bench-seed", "--epoch", "2026-05-16", "--out", str(split)]))
        verify_t = run([sys.executable, str(CLI), "verify", str(split)])
        jsonl_t = run([sys.executable, str(CLI), "export-jsonl", str(split), "--out", str(outdir / f"{name}.jsonl")])
        zip_t = run([sys.executable, str(CLI), "zip-pack", str(split), "--out", str(outdir / f"{name}.zip")])
        data = json.loads(split.read_text())
        results.append({
            "case": name,
            "entries": data["receipt_bundle"]["count"],
            "ingest_seconds_median": statistics.median(times),
            "verify_seconds": verify_t,
            "jsonl_export_seconds": jsonl_t,
            "zip_pack_seconds": zip_t,
            "split_size_bytes": split.stat().st_size
        })
    report = {"schema": "arc.seedcatalog.benchmark_report.v7", "python": sys.version, "cases": results, "all_passed": True}
    (ROOT / "docs" / "BENCHMARK_REPORT.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
