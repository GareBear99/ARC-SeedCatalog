from fastapi import APIRouter, HTTPException
router = APIRouter(prefix="/seedcatalog", tags=["seedcatalog"])
@router.post("/register-bundle")
def register_bundle(bundle: dict):
    if bundle.get("stores_raw_data") is not False:
        raise HTTPException(status_code=400, detail="Raw-data bundles are not allowed")
    records = bundle.get("arc_core_handoff_bundle", {}).get("records", [])
    return {"ok": True, "accepted_records": len(records), "stores_raw_data": False}
