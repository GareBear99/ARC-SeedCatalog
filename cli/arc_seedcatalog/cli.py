#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
from pathlib import Path
from datetime import date

def canon(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))

def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def hmac_sha256(secret: str, msg: str) -> str:
    return hmac.new(secret.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).hexdigest()

DEFAULT_CATEGORY_MAP = {
    "fallback_category": "catalog/authorized/uncategorized",
    "mappings": {
        "movie": "media/movie/authorized",
        "show": "media/show/authorized",
        "public-domain": "media/public-domain/authorized",
        "internal": "asset/internal/authorized",
        "game": "game/homebrew/authorized",
    }
}

def rows(doc):
    if isinstance(doc, list):
        return doc
    if isinstance(doc, dict) and isinstance(doc.get("servers"), list):
        out = []
        for server in doc["servers"]:
            for item in server.get("items", []):
                merged = dict(item)
                merged["_server_type"] = server.get("server_type", "authorized_catalog")
                merged["_region"] = server.get("region", "unknown")
                merged["_legal_basis"] = server.get("legal_basis", "authorized_or_internal")
                merged["_server_id"] = server.get("server_id", "source")
                out.append(merged)
        return out
    if isinstance(doc, dict) and isinstance(doc.get("data"), list):
        return doc["data"]
    return []

def normalize_category(raw):
    s = str(raw or "").strip().lower().replace(" ", "-")
    return DEFAULT_CATEGORY_MAP["mappings"].get(s, f"catalog/authorized/{s}" if s else DEFAULT_CATEGORY_MAP["fallback_category"])

def ingest(path: Path, seed: str, epoch: str):
    doc = json.loads(path.read_text())
    receipts = []
    ruleset_hash = sha256_hex("arc.seedcatalog.ruleset.v5")
    for item in rows(doc):
        category = normalize_category(item.get("category") or item.get("genre") or item.get("type"))
        source_fp = {
            "server_type": item.get("_server_type", item.get("type", "authorized_catalog")),
            "region": item.get("_region", "unknown"),
            "legal_basis": item.get("_legal_basis", "authorized_or_internal"),
        }
        source_id = sha256_hex(canon(source_fp))
        volatile = f"{item.get('_server_id', item.get('server','source'))}|{item.get('path', item.get('url', item.get('id','')))}|{item.get('title', item.get('name',''))}|{epoch}"
        entry_id = hmac_sha256(seed, source_id + "|" + volatile)
        cat_vec = hmac_sha256(seed, category + "|" + ruleset_hash)
        core = {
            "schema": "arc.seedcatalog.entry_receipt.v5",
            "entry_id": "hmac-sha256:" + entry_id,
            "source_id": "sha256:" + source_id,
            "category_vector": "hmac-sha256:" + cat_vec,
            "category_path_hash": "sha256:" + sha256_hex(category),
            "ruleset_hash": "sha256:" + ruleset_hash,
            "epoch": epoch,
            "stored_raw_data": False,
            "stores_title": False,
            "stores_path": False,
            "stores_server_name": False,
            "stores_url": False,
            "stores_user_data": False,
        }
        core["receipt_hash"] = "sha256:" + sha256_hex(canon(core))
        receipts.append(core)
    bundle = {
        "schema": "arc.seedcatalog.cli_receipt_bundle.v5",
        "count": len(receipts),
        "receipts": receipts,
        "stores_raw_data": False,
    }
    bundle["bundle_hash"] = "sha256:" + sha256_hex(canon(bundle))
    return bundle

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    ing = sub.add_parser("ingest")
    ing.add_argument("json_file")
    ing.add_argument("--seed", default="arc-seedcatalog-local-cli-seed")
    ing.add_argument("--epoch", default=date.today().isoformat())
    ing.add_argument("--out", default="arc-seedcatalog-cli-receipts.json")
    args = ap.parse_args()
    if args.cmd == "ingest":
        bundle = ingest(Path(args.json_file), args.seed, args.epoch)
        Path(args.out).write_text(json.dumps(bundle, indent=2) + "\n")
        print(args.out)
        print(bundle["bundle_hash"])

if __name__ == "__main__":
    main()
