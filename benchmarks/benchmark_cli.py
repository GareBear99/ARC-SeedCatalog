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
    t0=time.perf_counter(); subprocess.run(cmd,cwd=ROOT,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True); return time.perf_counter()-t0
def main():
    outdir=ROOT/"out"/"bench"; outdir.mkdir(parents=True,exist_ok=True); results=[]
    for name,path in CASES:
        split=outdir/f"{name}.split.json"; times=[]
        for _ in range(3): times.append(run([sys.executable,str(CLI),"ingest",str(path),"--seed","bench","--epoch","2026-05-16","--out",str(split)]))
        verify_t=run([sys.executable,str(CLI),"verify",str(split)])
        audit_t=run([sys.executable,str(CLI),"audit-leaks",str(split)])
        bin_path=outdir/f"{name}.arcbin"
        export_bin_t=run([sys.executable,str(CLI),"export-binary",str(split),"--out",str(bin_path)])
        verify_bin_t=run([sys.executable,str(CLI),"verify-binary",str(bin_path)])
        data=json.loads(split.read_text())
        results.append({"case":name,"entries":data["receipt_bundle"]["count"],"ingest_seconds_median":statistics.median(times),"verify_seconds":verify_t,"audit_seconds":audit_t,"export_binary_seconds":export_bin_t,"verify_binary_seconds":verify_bin_t,"split_size_bytes":split.stat().st_size})
    report={"schema":"arc.seedcatalog.benchmark_report.v8","python":sys.version,"cases":results,"all_passed":True}
    (ROOT/"docs"/"BENCHMARK_REPORT.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report,indent=2))
if __name__=="__main__": main()
