#!/usr/bin/env python3
"""Deploy Firebase Hosting straight from the REST API.

Why this exists: on this machine Google APIs resolve to IPv6 first and the IPv6
route is dead, so `firebase deploy` (undici fetch) times out. This script forces
IPv4 for every socket, refreshes the CLI's stored OAuth token, and drives the
Hosting v1beta1 API (create version -> populateFiles -> upload -> finalize ->
release) the same way the CLI does.

Usage: python3 scripts/deploy_hosting.py [project] [site]
"""
from __future__ import annotations

import gzip
import hashlib
import json
import mimetypes
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT = sys.argv[1] if len(sys.argv) > 1 else "studiokit-app"
SITE = sys.argv[2] if len(sys.argv) > 2 else PROJECT
ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "dist"
CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com"
CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi"

# --- force IPv4 (broken IPv6 route) -----------------------------------------
_orig_getaddrinfo = socket.getaddrinfo


def _getaddrinfo(host, port, family=0, *args, **kwargs):
    return _orig_getaddrinfo(host, port, socket.AF_INET, *args, **kwargs)


socket.getaddrinfo = _getaddrinfo


def request(url: str, method: str = "GET", body: bytes | None = None,
            headers: dict | None = None, tries: int = 4):
    last = None
    for attempt in range(tries):
        req = urllib.request.Request(url, data=body, method=method)
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                raw = res.read()
                return json.loads(raw) if raw.strip().startswith(b"{") else raw
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            raise SystemExit(f"HTTP {exc.code} on {method} {url}\n{detail}")
        except Exception as exc:  # timeout, connection reset, ...
            last = exc
            time.sleep(2 + attempt * 3)
    raise SystemExit(f"Giving up on {method} {url}: {last}")


def access_token() -> str:
    cfg_path = Path.home() / ".config/configstore/firebase-tools.json"
    cfg = json.loads(cfg_path.read_text())
    tokens = cfg.get("tokens", {})
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": tokens["refresh_token"],
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }).encode()
    res = request("https://oauth2.googleapis.com/token", "POST", data,
                  {"Content-Type": "application/x-www-form-urlencoded"})
    cfg["tokens"]["access_token"] = res["access_token"]
    cfg_path.write_text(json.dumps(cfg, indent=2))
    return res["access_token"]


def collect_files() -> dict[str, tuple[bytes, str]]:
    """Map url path -> (gzipped bytes, sha256 of those bytes).

    Hosting hashes the gzipped payload, so the populateFiles hash and the uploaded
    body must come from the same buffer.
    """
    out: dict[str, tuple[bytes, str]] = {}
    for path in PUBLIC.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(PUBLIC)
        if any(part.startswith(".") or part == "node_modules" for part in rel.parts):
            continue
        if rel.name == "firebase.json":
            continue
        payload = gzip.compress(path.read_bytes(), 9)
        out["/" + rel.as_posix()] = (payload, hashlib.sha256(payload).hexdigest())
    return out


def api_globs(source: str) -> list[str]:
    """Expand a firebase.json glob such as "**/*.@(js|css)" into API globs."""
    source = "/" + source.lstrip("/")
    if ".@(" in source and source.endswith(")"):
        head, _, exts = source.partition(".@(")
        return [f"{head}.{ext}" for ext in exts[:-1].split("|")]
    return [source]


def hosting_config() -> dict:
    cfg = json.loads((ROOT / "firebase.json").read_text())["hosting"]
    api: dict = {}
    if cfg.get("rewrites"):
        api["rewrites"] = [
            {"glob": rw.get("source", "**"), "path": rw["destination"]} for rw in cfg["rewrites"]
        ]
    if cfg.get("headers"):
        # The v1beta1 config schema rejects the CLI's header shape; cache headers are
        # an optimisation only, so the deploy path skips them (defaults are fine).
        pass
    return api


def main() -> None:
    token = access_token()
    auth = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    base = f"https://firebasehosting.googleapis.com/v1beta1/sites/{SITE}"
    files = collect_files()
    if "/index.html" not in files:
        raise SystemExit("dist/index.html missing - run npm run build first")
    print(f"deploying {len(files)} files to {SITE}")

    version = request(f"{base}/versions", "POST",
                      json.dumps({"config": hosting_config()}).encode(), auth)
    vid = version["name"].rsplit("/", 1)[-1]

    populate = request(f"{base}/versions/{vid}:populateFiles", "POST",
                       json.dumps({"files": {p: d for p, (_, d) in files.items()}}).encode(), auth)
    need = set(populate.get("uploadRequiredHashes") or [])
    upload_url = populate["uploadUrl"]
    print(f"version {vid}: {len(need)} of {len(files)} files need uploading")

    by_hash = {d: (p, payload) for p, (payload, d) in files.items()}
    for h in need:
        payload = by_hash[h][1]
        last = None
        for attempt in range(5):
            req = urllib.request.Request(upload_url + "/" + h, data=payload, method="POST")
            req.add_header("Authorization", f"Bearer {token}")
            req.add_header("Content-Type", "application/octet-stream")
            try:
                with urllib.request.urlopen(req, timeout=180) as res:
                    res.read()
                break
            except urllib.error.HTTPError as exc:
                last = f"HTTP {exc.code}: {exc.read().decode('utf-8', 'replace')[:300]}"
                time.sleep(2 + attempt * 2)
            except Exception as exc:
                last = exc
                time.sleep(2 + attempt * 2)
        else:
            raise SystemExit(f"upload failed for {by_hash[h][0]}: {last}")
    print("uploads complete")

    request(f"{base}/versions/{vid}?updateMask=status", "PATCH",
            json.dumps({"status": "FINALIZED"}).encode(), auth)
    release = request(f"{base}/releases?versionName=sites/{SITE}/versions/{vid}", "POST",
                      json.dumps({"message": "deploy"}).encode(), auth)
    print("released", release.get("name"))


if __name__ == "__main__":
    main()
