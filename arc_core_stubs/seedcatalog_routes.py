"""ARC-Core FastAPI route stubs for ARC-SeedCatalog.

Drop-in reference only. Wire into ARC-Core's real app/router structure.
"""

from __future__ import annotations

from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/seedcatalog", tags=["seedcatalog"])

class SeedCatalogBundle(BaseModel):
    schema: str
    stores_raw_data: bool
    arc_core_handoff_bundle: Dict[str, Any]

@router.post("/register-bundle")
def register_seedcatalog_bundle(bundle: SeedCatalogBundle):
    if bundle.stores_raw_data is not False:
        raise HTTPException(status_code=400, detail="Raw-data bundles are not allowed")
    handoff = bundle.arc_core_handoff_bundle
    records: List[Dict[str, Any]] = handoff.get("records", [])
    # Persist only safe fields:
    # receipt_hash, entry_id, source_id, category_vector, category_path_hash,
    # ruleset_hash, category_map_hash, adapter_profile_hash, policy status.
    return {
        "ok": True,
        "accepted_records": len(records),
        "stores_raw_data": False,
        "bundle_hash": handoff.get("bundle_hash"),
    }
