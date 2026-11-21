"""Internal YARA engine. The parent owns transport and bounds each child process."""

import json
import os
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

MAX_RULE_BYTES = 512 * 1024
MAX_FILE_BYTES = 50 * 1024 * 1024


def engine(rules_path, file_path=None):
    import yara

    try:
        sources = json.loads(Path(rules_path).read_text(encoding="utf-8"))
        rules = yara.compile(sources=sources, includes=False)
    except (ValueError, TypeError, yara.SyntaxError):
        return 2
    if file_path:
        matches = rules.match(
            filepath=file_path, fast=True, timeout=10, console_callback=lambda _: None
        )
        print(
            json.dumps(
                {
                    "matches": sorted(
                        {f"{match.namespace}:{match.rule}" for match in matches}
                    )
                }
            )
        )
    return 0


class Scanner(BaseHTTPRequestHandler):
    def setup(self):
        self.request.settimeout(10)
        super().setup()

    def log_message(self, _format, *_args):
        pass

    def do_GET(self):
        if self.path != "/health":
            self.send_error(404)
            return
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path not in ("/validate", "/scan"):
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            limit = (
                MAX_RULE_BYTES
                if self.path == "/validate"
                else MAX_RULE_BYTES + MAX_FILE_BYTES + 4
            )
            if not 0 < length <= limit:
                self.send_error(413)
                return
            with tempfile.TemporaryDirectory() as work:
                rules_path = Path(work, "rules.yar")
                command = [sys.executable, "-B", __file__, "engine", str(rules_path)]
                if self.path == "/scan":
                    prefix = self.rfile.read(4)
                    size = int.from_bytes(prefix, "big")
                    if (
                        len(prefix) != 4
                        or not 0 < size <= MAX_RULE_BYTES
                        or not 0 <= length - 4 - size <= MAX_FILE_BYTES
                    ):
                        self.send_error(400)
                        return
                    rules = self.rfile.read(size)
                    file_path = Path(work, "attachment")
                    remaining = length - 4 - size
                    with file_path.open("wb") as stream:
                        while remaining:
                            chunk = self.rfile.read(min(remaining, 65536))
                            if not chunk:
                                raise EOFError
                            stream.write(chunk)
                            remaining -= len(chunk)
                    command.append(str(file_path))
                else:
                    size = length
                    rules = self.rfile.read(size)
                if len(rules) != size:
                    raise EOFError
                rules.decode("utf-8")
                rules_path.write_bytes(rules)
                result = subprocess.run(
                    command,
                    capture_output=True,
                    timeout=15,
                    check=False,
                    cwd=work,
                    env={"PATH": os.defpath},
                )
            if result.returncode == 2:
                self.send_error(422)
            elif result.returncode:
                self.send_error(503)
            else:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(result.stdout or b"{}")
        except (ValueError, EOFError):
            self.send_error(400)
        except (OSError, subprocess.TimeoutExpired):
            self.send_error(503)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "engine":
        sys.exit(engine(*sys.argv[2:]))
    HTTPServer(("0.0.0.0", 3342), Scanner).serve_forever()
