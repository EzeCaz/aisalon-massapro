#!/usr/bin/env python3
"""
Double-fork daemon that starts the Next.js dev server detached from any
shell session, so it survives across bash tool calls.

The daemon writes its PID to /home/z/my-project/.dev-server.pid so it can
be killed later with `kill $(cat .dev-server.pid)`.

It explicitly loads DATABASE_URL and NEXTAUTH_SECRET from .env so a stale
shell environment doesn't cause the server to use the wrong DB.
"""

import os
import sys
import time
import subprocess
from pathlib import Path

PROJECT_ROOT = Path("/home/z/my-project")
ENV_FILE = PROJECT_ROOT / ".env"
PID_FILE = PROJECT_ROOT / ".dev-server.pid"
LOG_FILE = PROJECT_ROOT / ".dev-server.log"


def load_env(path: Path) -> dict:
    env = os.environ.copy()
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = v.strip()
        # Strip surrounding single or double quotes (e.g. KEY="value" -> value).
        # Without this, the literal quote characters end up in process.env and
        # Prisma's URL validator rejects values like `"postgresql://..."`.
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
            v = v[1:-1]
        env[k.strip()] = v
    return env


def main():
    # Start the chat-service sidecar FIRST (port 3004) so the WS is
    # available by the time the Next.js dev server starts fielding
    # requests. This is a no-op if it's already running.
    chat_service_script = PROJECT_ROOT / "scripts" / "start-chat-service-daemon.py"
    if chat_service_script.exists():
        try:
            subprocess.run(
                ["python3", str(chat_service_script)],
                check=False,
                timeout=5,
                capture_output=True,
            )
        except Exception:
            # Don't let chat-service failure block Next.js startup.
            pass

    # If a PID file exists and the process is alive, do nothing.
    if PID_FILE.exists():
        try:
            old_pid = int(PID_FILE.read_text().strip())
            os.kill(old_pid, 0)
            print(f"Dev server already running (pid {old_pid})")
            return
        except (ProcessLookupError, ValueError):
            pass

    # First fork
    if os.fork() != 0:
        # Parent — wait briefly for the daemon to write its PID
        time.sleep(0.5)
        if PID_FILE.exists():
            print(f"Daemon PID: {PID_FILE.read_text().strip()}")
        else:
            print("Daemon started (no PID file)")
        return

    # Decouple from parent
    os.setsid()
    os.umask(0)

    # Second fork
    if os.fork() != 0:
        os._exit(0)

    # Write PID
    PID_FILE.write_text(str(os.getpid()))

    env = load_env(ENV_FILE)

    # Redirect stdout/stderr to log file
    log_fd = os.open(str(LOG_FILE), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    os.dup2(log_fd, 1)
    os.dup2(log_fd, 2)

    # Exec next dev
    os.execvpe(
        "npx",
        ["npx", "next", "dev", "-p", "3000"],
        env,
    )


if __name__ == "__main__":
    main()
