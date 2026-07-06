#!/usr/bin/env python3
"""
Double-fork daemon that starts the chat-service WebSocket sidecar
(port 3004) detached from any shell session, so it survives across
bash tool calls.

The daemon writes its PID to /home/z/my-project/.chat-service.pid so
it can be killed later with `kill $(cat .chat-service.pid)`.

Uses bun (faster cold start than node) and bun --hot for hot reload
during development.
"""

import os
import sys
import time
import subprocess
from pathlib import Path

PROJECT_ROOT = Path("/home/z/my-project")
SERVICE_DIR = PROJECT_ROOT / "mini-services" / "chat-service"
PID_FILE = PROJECT_ROOT / ".chat-service.pid"
LOG_FILE = PROJECT_ROOT / ".chat-service.log"


def main():
    # If a PID file exists and the process is alive, do nothing.
    if PID_FILE.exists():
        try:
            old_pid = int(PID_FILE.read_text().strip())
            os.kill(old_pid, 0)
            print(f"chat-service already running (pid {old_pid})")
            return
        except (ProcessLookupError, ValueError):
            pass

    # First fork
    if os.fork() != 0:
        # Parent — wait briefly for the daemon to write its PID
        time.sleep(0.8)
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

    # Redirect stdout/stderr to log file
    log_fd = os.open(str(LOG_FILE), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    os.dup2(log_fd, 1)
    os.dup2(log_fd, 2)

    # Exec `bun --hot index.ts` from the service directory
    os.chdir(str(SERVICE_DIR))
    os.execvpe(
        "bun",
        ["bun", "--hot", "index.ts"],
        os.environ.copy(),
    )


if __name__ == "__main__":
    main()
