"""Static file server for the HeightTrack client portal.

Deliberately not `python3 -m http.server`: that module resolves --directory's
default from os.getcwd() at import time, which fails outright when the process
is launched with an unreadable working directory.

The root is derived from this file's own location rather than hardcoded, so
moving the project does not break it.
"""
import os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
PORT = 5173

os.chdir(ROOT)

httpd = ThreadingHTTPServer(("127.0.0.1", PORT), SimpleHTTPRequestHandler)
print(f"HeightTrack portal on http://127.0.0.1:{PORT} (serving {ROOT})", flush=True)
httpd.serve_forever()
