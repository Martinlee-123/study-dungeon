#!/usr/bin/env python3
"""
学习副本 · 云同步服务
- 零依赖：只用标准库
- 一个 JSON 文件 + 一个口令
- GET  /state  拿全量
- PUT  /state  覆盖写（带 rev，防止两台设备互相盖掉）
"""
import hmac
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DATA_DIR = os.environ.get("DATA_DIR", "/data")
STATE_PATH = os.path.join(DATA_DIR, "state.json")
TOKEN_PATH = os.path.join(DATA_DIR, "token")
SNAP_DIR = os.path.join(DATA_DIR, "snapshots")
SNAP_KEEP = 10
PORT = int(os.environ.get("PORT", "8130"))
MAX_BODY = 2 * 1024 * 1024  # 2MB，足够放几年的记录

_lock = threading.Lock()


def read_token():
    try:
        with open(TOKEN_PATH, "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return ""


def read_state():
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as f:
            obj = json.load(f)
        if isinstance(obj, dict) and "rev" in obj:
            return obj
    except Exception:
        pass
    return {"rev": 0, "updatedAt": 0, "data": None}


def write_state(obj):
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, STATE_PATH)
    snapshot(obj)


def snapshot(obj):
    """每写一版留一份快照，只留最近 SNAP_KEEP 份。误覆盖时能回滚。"""
    try:
        os.makedirs(SNAP_DIR, exist_ok=True)
        path = os.path.join(SNAP_DIR, "state-%06d.json" % int(obj.get("rev") or 0))
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, path)

        files = sorted(f for f in os.listdir(SNAP_DIR)
                       if f.startswith("state-") and f.endswith(".json"))
        for old in files[:-SNAP_KEEP]:
            try:
                os.remove(os.path.join(SNAP_DIR, old))
            except OSError:
                pass
    except Exception as e:
        # 快照失败不能影响正常写入
        sys.stderr.write("[study-sync] snapshot failed: %s\n" % e)


TOKEN = read_token()


class Handler(BaseHTTPRequestHandler):
    server_version = "study-sync/1"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    # ── helpers ──
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Study-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _auth(self):
        if not TOKEN:
            self._json(503, {"error": "token not configured"})
            return False
        got = self.headers.get("X-Study-Token", "")
        if not got or not hmac.compare_digest(got, TOKEN):
            self._json(401, {"error": "bad token"})
            return False
        return True

    # ── routes ──
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Study-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path in ("", "/ping"):
            self._json(200, {"ok": True, "rev": read_state().get("rev", 0)})
            return
        if path == "/state":
            if not self._auth():
                return
            with _lock:
                self._json(200, read_state())
            return
        self._json(404, {"error": "not found"})

    def do_PUT(self):
        path = self.path.split("?")[0].rstrip("/")
        if path != "/state":
            self._json(404, {"error": "not found"})
            return
        if not self._auth():
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._json(413, {"error": "bad size"})
            return

        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._json(400, {"error": "bad json"})
            return

        data = body.get("data")
        base_rev = int(body.get("rev") or 0)
        force = bool(body.get("force"))
        if not isinstance(data, dict):
            self._json(400, {"error": "bad data"})
            return

        with _lock:
            cur = read_state()
            cur_rev = int(cur.get("rev") or 0)
            if not force and base_rev != cur_rev:
                # 别的设备先写过，把最新状态退回去让客户端先拉（或者带 force 覆盖）
                self._json(409, cur)
                return
            new = {
                "rev": cur_rev + 1,
                "updatedAt": int(time.time() * 1000),
                "data": data,
            }
            write_state(new)
        self._json(200, {"rev": new["rev"], "updatedAt": new["updatedAt"]})


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not TOKEN:
        sys.stderr.write("[study-sync] 警告：没有 token 文件，所有请求都会 503\n")
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    sys.stderr.write("[study-sync] listening on :%d, data=%s\n" % (PORT, STATE_PATH))
    srv.serve_forever()


if __name__ == "__main__":
    main()
