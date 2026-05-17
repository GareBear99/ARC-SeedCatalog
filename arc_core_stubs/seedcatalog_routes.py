"""FastAPI route stub for ARC-Core."""
from fastapi import APIRouter
router=APIRouter(prefix="/seedcatalog",tags=["seedcatalog"])
@router.post("/register-bundle")
def register_bundle(bundle: dict):
    assert bundle.get("stores_raw_data") is False
    return {"ok": True, "accepted_records": len(bundle.get("arc_core_handoff_bundle",{}).get("records", []))}
