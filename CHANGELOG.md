# Changelog

## Unreleased — SPSC causal ticks (Module 1, first starship module)

- The SPSC ring is **module 1, the first starship module**, in ring form:
  the causal tick channel the LuciferAI bubbles' tick ordering (and the
  starship, when it drops in) depend on.
- Bounded SPSC ring for the causal tick path (`cli/arc_seedcatalog/spsc.py`):
  preallocated power-of-two ring, backpressure on full (never drop,
  never grow), FIFO causal order, no lock in the hot path. The tick
  flow ingest → normalize → hash → bundle is now bounded end to end.
- `build()` streams rows through the ring (producer thread + consumer);
  output is byte-identical to the unbounded pipeline (same catalog_hash).
  New `--ring-capacity` flag on `ingest` / `replay` (default 1024).
- New tests `tests/test_spsc.py` (7 tests: boundedness, backpressure,
  no pile-up past capacity, FIFO order, drain-on-close, identical hash
  with a ring of 8).
- New benchmark `benchmarks/benchmark_spsc.py` + report
  `benchmarks/BENCHMARK_SPSC_REPORT.json`: raw ring ~1.36M ticks/s
  (tracked) / ~1.81M (untracked); full pipeline ~12.4K entries/s.
  The full pipeline is bounded by per-entry HMAC + canonical JSON, not
  by the ring; millions of entries/sec needs a compiled hot path.

## v0.9.0 — Public Production Complete

Public-facing production package.

Added:

- polished README
- production readiness checklist
- public positioning docs
- GitHub issue templates
- release checklist
- repo topics
- stronger legal/security/contributing docs
- package validation report
- benchmark/adversarial/replay reports
- GitHub Pages release workflow
- no-raw-export doctrine clearly documented

## v0.8.0

Added adversarial tests, leak scanner, deterministic replay, signing-ready envelope, ARC-Core receiver upgrade, Arc-RAR proof-pack structure, OmniBinary arcbin export, and benchmark matrix.
