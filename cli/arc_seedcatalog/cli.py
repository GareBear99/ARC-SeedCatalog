#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, hmac, json, zipfile
from pathlib import Path
from datetime import date
def canon(obj): return json.dumps(obj, sort_keys=True, separators=(",", ":"))
def sha(s): return hashlib.sha256(s.encode()).hexdigest()
def hm(seed,msg): return hmac.new(seed.encode(), msg.encode(), hashlib.sha256).hexdigest()
def rows(doc):
    if isinstance(doc,list): return doc
    out=[]
    if isinstance(doc,dict) and isinstance(doc.get("servers"),list):
        for srv in doc["servers"]:
            for it in srv.get("items",[]):
                x=dict(it); x["_server_type"]=srv.get("server_type","authorized_catalog"); x["_region"]=srv.get("region","unknown"); x["_legal_basis"]=srv.get("legal_basis","authorized_or_internal"); x["_server_id"]=srv.get("server_id","source"); out.append(x)
    elif isinstance(doc,dict) and isinstance(doc.get("data"),list): out=doc["data"]
    elif isinstance(doc,dict) and isinstance(doc.get("items"),list): out=doc["items"]
    return out
def cat(raw):
    m={"movie":"media/movie/authorized","show":"media/show/authorized","public-domain":"media/public-domain/authorized","internal":"asset/internal/authorized","game":"game/homebrew/authorized"}
    s=str(raw or "").lower().replace(" ","-")
    return m.get(s, f"catalog/authorized/{s}" if s else "catalog/authorized/uncategorized")
def build(path,seed,epoch):
    doc=json.loads(Path(path).read_text()); receipts=[]; rh=sha("arc.seedcatalog.ruleset.v7"); cmh=sha("category-map-v7"); ah=sha("adapter-v7")
    for it in rows(doc):
        c=cat(it.get("category")); sf={"server_type":it.get("_server_type",it.get("type","authorized_catalog")),"region":it.get("_region","unknown"),"legal_basis":it.get("_legal_basis","authorized_or_internal")}
        sid=sha(canon(sf)); vol=f"{it.get('_server_id',it.get('server','source'))}|{it.get('path',it.get('url',it.get('id','')))}|{it.get('title',it.get('name',''))}|{epoch}"
        core={"schema":"arc.seedcatalog.entry_receipt.v7","entry_id":"hmac-sha256:"+hm(seed,sid+"|"+vol),"source_id":"sha256:"+sid,"category_vector":"hmac-sha256:"+hm(seed,c+"|"+rh+"|"+cmh),"category_path_hash":"sha256:"+sha(c),"ruleset_hash":"sha256:"+rh,"category_map_hash":"sha256:"+cmh,"adapter_profile_hash":"sha256:"+ah,"epoch":epoch,"stored_raw_data":False,"stores_title":False,"stores_path":False,"stores_server_name":False,"stores_url":False,"stores_user_data":False}
        core["receipt_hash"]="sha256:"+sha(canon(core)); receipts.append(core)
    rb={"schema":"arc.seedcatalog.receipt_bundle.v7","count":len(receipts),"receipts":receipts,"stores_raw_data":False}; rb["bundle_hash"]="sha256:"+sha(canon(rb))
    records=[{"schema":"arc.core.seedcatalog_registration.v7","source":"arc-seedcatalog","object_type":"seedcatalog_entry_receipt","receipt_hash":r["receipt_hash"],"entry_id":r["entry_id"],"source_id":r["source_id"],"category_vector":r["category_vector"],"category_path_hash":r["category_path_hash"],"ruleset_hash":r["ruleset_hash"],"category_map_hash":r["category_map_hash"],"adapter_profile_hash":r["adapter_profile_hash"],"stores_raw_data":False} for r in receipts]
    ac={"schema":"arc.core.seedcatalog_handoff_bundle.v7","records":records,"entry_count":len(records),"stores_raw_data":False}; ac["bundle_hash"]="sha256:"+sha(canon(ac))
    split={"schema":"arc.seedcatalog.split_bundle.v7","receipt_bundle":rb,"arc_core_handoff_bundle":ac,"signature_envelope":{"status":"unsigned","signing_algorithm":"ed25519-planned","stores_raw_data":False},"stores_raw_data":False}; split["catalog_hash"]="sha256:"+sha(canon(split)); return split
def verify(path):
    data=json.loads(Path(path).read_text()); ok=data.get("stores_raw_data") is False and data.get("receipt_bundle",{}).get("stores_raw_data") is False and data.get("arc_core_handoff_bundle",{}).get("stores_raw_data") is False
    print(json.dumps({"ok":ok,"entries":data.get("receipt_bundle",{}).get("count"),"catalog_hash":data.get("catalog_hash")},indent=2)); return 0 if ok else 1
def export_jsonl(path,out):
    data=json.loads(Path(path).read_text()); Path(out).parent.mkdir(parents=True,exist_ok=True); Path(out).write_text("\\n".join(json.dumps(r) for r in data["arc_core_handoff_bundle"]["records"])+"\\n"); print(out)
def proof_pack(path,out):
    data=json.loads(Path(path).read_text()); pack={"schema":"arc.seedcatalog.proof_pack.v7","split_bundle":data,"stores_raw_data":False}; Path(out).parent.mkdir(parents=True,exist_ok=True); Path(out).write_text(json.dumps(pack,indent=2)+"\\n"); print(out)
def zip_pack(path,out):
    data=json.loads(Path(path).read_text()); Path(out).parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
        z.writestr("split_bundle.json",json.dumps(data,indent=2)); z.writestr("arc_core_records.jsonl","\\n".join(json.dumps(r) for r in data["arc_core_handoff_bundle"]["records"])+"\\n"); z.writestr("README.txt","ARC-SeedCatalog proof pack. No raw input JSON included.\\n")
    print(out)
def main():
    ap=argparse.ArgumentParser(prog="arc-seedcatalog"); sub=ap.add_subparsers(dest="cmd",required=True)
    ing=sub.add_parser("ingest"); ing.add_argument("json_file"); ing.add_argument("--seed",default="arc-seedcatalog-local-cli-seed"); ing.add_argument("--epoch",default=date.today().isoformat()); ing.add_argument("--out",default="out/split.json")
    ver=sub.add_parser("verify"); ver.add_argument("split_file")
    ex=sub.add_parser("export-jsonl"); ex.add_argument("split_file"); ex.add_argument("--out",default="out/records.jsonl")
    pp=sub.add_parser("proof-pack"); pp.add_argument("split_file"); pp.add_argument("--out",default="out/proof-pack.json")
    zp=sub.add_parser("zip-pack"); zp.add_argument("split_file"); zp.add_argument("--out",default="out/proof-pack.zip")
    a=ap.parse_args()
    if a.cmd=="ingest": Path(a.out).parent.mkdir(parents=True,exist_ok=True); Path(a.out).write_text(json.dumps(build(a.json_file,a.seed,a.epoch),indent=2)+"\\n"); print(a.out)
    elif a.cmd=="verify": raise SystemExit(verify(a.split_file))
    elif a.cmd=="export-jsonl": export_jsonl(a.split_file,a.out)
    elif a.cmd=="proof-pack": proof_pack(a.split_file,a.out)
    elif a.cmd=="zip-pack": zip_pack(a.split_file,a.out)
if __name__=="__main__": main()
