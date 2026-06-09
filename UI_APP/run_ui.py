"""
Starts the ARRPSAT GREEN Next.js dev server (npm run dev).
If you see ENOENT under .next/server/app/page, stop all node.exe,
then run: npm run dev:fresh
Run from UI_APP: python run_ui.py
"""

import os
import shutil
import subprocess
import sys


def resolve_npm() -> str | None:
    # Windows: npm is usually npm.cmd; bare "npm" fails with CreateProcess WinError 2
    for name in ("npm.cmd", "npm"):
        path = shutil.which(name)
        if path:
            return path
    return None


def main() -> int:
    root = os.path.dirname(os.path.abspath(__file__))
    npm = resolve_npm()
    if not npm:
        sys.stderr.write(
            "npm not found in PATH. Install Node.js and reopen the terminal.\n"
        )
        return 1
    proc = subprocess.run([npm, "run", "dev"], cwd=root)
    return int(proc.returncode)


if __name__ == "__main__":
    sys.exit(main())
