#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, hmac, json, zipfile, struct
from pathlib import Path
from datetime import date
DENY={"title","name","url","href","path","server","server_id","host","hostname","stream","stream_url","watch_url","poster","image","description","overview","token","cookie","authorization","email","user"}
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
    elif isinstance(doc,dict):
        for k,v in doc.items():
            if isinstance(v,list):
                for it in v:
                    if isinstance(it,dict):
                        x=dict(it); x["_server_id"]=k; x["_server_type"]="object_map"; out.append(x)
    return out
def cat(raw):
    m={"movie":"media/movie/authorized","film":"media/movie/authorized","show":"media/show/authorized","tv":"media/show/authorized","public-domain":"media/public-domain/authorized","public":"media/public-domain/authorized","internal":"asset/internal/authorized","asset":"asset/internal/authorized","game":"game/homebrew/authorized","homebrew":"game/homebrew/authorized"}
    s=str(raw or "").lower().replace(" ","-")
    return m.get(s, f"catalog/authorized/{s}" if s else "catalog/authorized/uncategorized")
def build(path,seed,epoch):
    doc=json.loads(Path(path).read_text()); receipts=[]; rh=sha("arc.seedcatalog.ruleset.v9"); cmh=sha("category-map-v9"); ah=sha("adapter-v9")
    for it in rows(doc):
        c=cat(it.get("category") or it.get("genre") or it.get("type")); sf={"server_type":it.get("_server_type",it.get("type","authorized_catalog")),"region":it.get("_region","unknown"),"legal_basis":it.get("_legal_basis","authorized_or_internal")}
        sid=sha(canon(sf)); vol=f"{it.get('_server_id',it.get('server','source'))}|{it.get('path',it.get('url',it.get('href',it.get('id',''))))}|{it.get('title',it.get('name',''))}|{epoch}"
        core={"schema":"arc.seedcatalog.entry_receipt.v9","entry_id":"hmac-sha256:"+hm(seed,sid+"|"+vol),"source_id":"sha256:"+sid,"category_vector":"hmac-sha256:"+hm(seed,c+"|"+rh+"|"+cmh),"category_path_hash":"sha256:"+sha(c),"ruleset_hash":"sha256:"+rh,"category_map_hash":"sha256:"+cmh,"adapter_profile_hash":"sha256:"+ah,"epoch":epoch,"stored_raw_data":False,"stores_title":False,"stores_path":False,"stores_server_name":False,"stores_url":False,"stores_user_data":False}
        core["receipt_hash"]="sha256:"+sha(canon(core)); receipts.append(core)
    receipts.sort(key=lambda r:r["receipt_hash"])
    rb={"schema":"arc.seedcatalog.receipt_bundle.v9","count":len(receipts),"receipts":receipts,"stores_raw_data":False}; rb["bundle_hash"]="sha256:"+sha(canon(rb))
    records=[{"schema":"arc.core.seedcatalog_registration.v9","source":"arc-seedcatalog","object_type":"seedcatalog_entry_receipt","receipt_hash":r["receipt_hash"],"entry_id":r["entry_id"],"source_id":r["source_id"],"category_vector":r["category_vector"],"category_path_hash":r["category_path_hash"],"ruleset_hash":r["ruleset_hash"],"category_map_hash":r["category_map_hash"],"adapter_profile_hash":r["adapter_profile_hash"],"stores_raw_data":False} for r in receipts]
    ac={"schema":"arc.core.seedcatalog_handoff_bundle.v9","records":records,"entry_count":len(records),"stores_raw_data":False}; ac["bundle_hash"]="sha256:"+sha(canon(ac))
    pol={"schema":"arc.seedcatalog.policy_bundle.v9","raw_field_denylist":sorted(DENY),"lawful_use_only":True,"stores_raw_data":False}; pol["bundle_hash"]="sha256:"+sha(canon(pol))
    sig={"schema":"arc.seedcatalog.signature_envelope.v9","status":"unsigned","signing_algorithm":"ed25519-planned","production_note":"v0.9 is signing-ready; v1.0 should include real Ed25519 signing.","signable_hashes":{"receipt_bundle":rb["bundle_hash"],"arc_core_handoff_bundle":ac["bundle_hash"],"policy_bundle":pol["bundle_hash"]},"stores_raw_data":False}; sig["bundle_hash"]="sha256:"+sha(canon(sig))
    split={"schema":"arc.seedcatalog.split_bundle.v9","receipt_bundle":rb,"policy_bundle":pol,"arc_core_handoff_bundle":ac,"signature_envelope":sig,"stores_raw_data":False}; split["catalog_hash"]="sha256:"+sha(canon(split)); return split
def verify_file(path):
    data=json.loads(Path(path).read_text()); ok=data.get("stores_raw_data") is False and data.get("receipt_bundle",{}).get("stores_raw_data") is False and data.get("arc_core_handoff_bundle",{}).get("stores_raw_data") is False
    print(json.dumps({"ok":ok,"entries":data.get("receipt_bundle",{}).get("count"),"catalog_hash":data.get("catalog_hash")},indent=2)); return 0 if ok else 1
def audit_obj(obj):
    leaks=[]
    def walk(x,p=""):
        if isinstance(x,dict):
            for k,v in x.items():
                if str(k).lower() in DENY: leaks.append({"path":p+"/"+str(k),"type":"denied_key"})
                walk(v,p+"/"+str(k))
        elif isinstance(x,list):
            for i,v in enumerate(x): walk(v,p+f"/{i}")
    walk(obj); return {"ok":not leaks,"raw_field_leaks":len(leaks),"leaks":leaks[:50]}
def export_jsonl(path,out):
    data=json.loads(Path(path).read_text()); Path(out).parent.mkdir(parents=True,exist_ok=True); Path(out).write_text("\n".join(json.dumps(r) for r in data["arc_core_handoff_bundle"]["records"])+"\n"); print(out)
def proof_pack(path,out):
    data=json.loads(Path(path).read_text()); pack={"schema":"arc.seedcatalog.proof_pack.v9","split_bundle":data,"stores_raw_data":False}; Path(out).parent.mkdir(parents=True,exist_ok=True); Path(out).write_text(json.dumps(pack,indent=2)+"\n"); print(out)
def zip_pack(path,out):
    data=json.loads(Path(path).read_text()); Path(out).parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json",json.dumps(data.get("policy_bundle",{}),indent=2)); z.writestr("split_bundle.json",json.dumps(data,indent=2)); z.writestr("arc_core_records.jsonl","\n".join(json.dumps(r) for r in data["arc_core_handoff_bundle"]["records"])+"\n"); z.writestr("README.txt","ARC-SeedCatalog proof pack. No raw input JSON included.\n")
    print(out)
def export_binary(path,out):
    data=json.loads(Path(path).read_text()); payload=canon(data).encode(); blob=b"ARCSCAT\0"+struct.pack(">I",9)+struct.pack(">Q",len(payload))+hashlib.sha256(payload).digest()+payload; Path(out).parent.mkdir(parents=True,exist_ok=True); Path(out).write_bytes(blob); print(out)
def verify_binary(path):
    b=Path(path).read_bytes(); ok=b[:8]==b"ARCSCAT\0"; ver=struct.unpack(">I",b[8:12])[0]; ln=struct.unpack(">Q",b[12:20])[0]; dg=b[20:52]; payload=b[52:]; ok=ok and ver==9 and ln==len(payload) and hashlib.sha256(payload).digest()==dg; print(json.dumps({"ok":ok,"version":ver,"payload_length":len(payload),"payload_sha256":dg.hex()},indent=2)); return 0 if ok else 1
def main():
    ap=argparse.ArgumentParser(prog="arc-seedcatalog"); sub=ap.add_subparsers(dest="cmd",required=True)
    ing=sub.add_parser("ingest"); ing.add_argument("json_file"); ing.add_argument("--seed",default="arc-seedcatalog-local-cli-seed"); ing.add_argument("--epoch",default=date.today().isoformat()); ing.add_argument("--out",default="out/split.json")
    ver=sub.add_parser("verify"); ver.add_argument("split_file")
    aud=sub.add_parser("audit-leaks"); aud.add_argument("split_file")
    rep=sub.add_parser("replay"); rep.add_argument("json_file"); rep.add_argument("--seed",required=True); rep.add_argument("--epoch",required=True); rep.add_argument("--expect-hash",required=True)
    ex=sub.add_parser("export-jsonl"); ex.add_argument("split_file"); ex.add_argument("--out",default="out/records.jsonl")
    pp=sub.add_parser("proof-pack"); pp.add_argument("split_file"); pp.add_argument("--out",default="out/proof-pack.json")
    zp=sub.add_parser("zip-pack"); zp.add_argument("split_file"); zp.add_argument("--out",default="out/proof-pack.zip")
    eb=sub.add_parser("export-binary"); eb.add_argument("split_file"); eb.add_argument("--out",default="out/split.arcbin")
    vb=sub.add_parser("verify-binary"); vb.add_argument("arcbin_file")
    a=ap.parse_args()
    if a.cmd=="ingest": Path(a.out).parent.mkdir(parents=True,exist_ok=True); Path(a.out).write_text(json.dumps(build(a.json_file,a.seed,a.epoch),indent=2)+"\n"); print(a.out)
    elif a.cmd=="verify": raise SystemExit(verify_file(a.split_file))
    elif a.cmd=="audit-leaks":
        res=audit_obj(json.loads(Path(a.split_file).read_text())); print(json.dumps(res,indent=2)); raise SystemExit(0 if res["ok"] else 1)
    elif a.cmd=="replay":
        actual=build(a.json_file,a.seed,a.epoch)["catalog_hash"]; res={"ok":actual==a.expect_hash,"actual_hash":actual,"expected_hash":a.expect_hash}; print(json.dumps(res,indent=2)); raise SystemExit(0 if res["ok"] else 1)
    elif a.cmd=="export-jsonl": export_jsonl(a.split_file,a.out)
    elif a.cmd=="proof-pack": proof_pack(a.split_file,a.out)
    elif a.cmd=="zip-pack": zip_pack(a.split_file,a.out)
    elif a.cmd=="export-binary": export_binary(a.split_file,a.out)
    elif a.cmd=="verify-binary": raise SystemExit(verify_binary(a.arcbin_file))
if __name__=="__main__": main()
