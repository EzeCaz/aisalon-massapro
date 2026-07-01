#!/usr/bin/env python3
"""Decrypt the tokens vault.

Default paths assume the standard layout under /home/z/my-project/download/:
  tokens.md.enc  -> base64 ciphertext
  TokenKey       -> Fernet key

Usage:
  python3 decrypt_tokens.py
  python3 decrypt_tokens.py --key /path/to/TokenKey --in /path/to/tokens.md.enc
  python3 decrypt_tokens.py --out plain.md        # write plaintext to file
"""
import argparse, sys
from pathlib import Path
from cryptography.fernet import Fernet

BASE = Path(__file__).resolve().parent

ap = argparse.ArgumentParser()
ap.add_argument("--key", default=str(BASE / "TokenKey"))
ap.add_argument("--in",  dest="infile", default=str(BASE / "tokens.md.enc"))
ap.add_argument("--out", default=None, help="write plaintext to this file instead of stdout")
args = ap.parse_args()

key = Path(args.key).read_bytes()
ct  = Path(args.infile).read_text(encoding="utf-8").strip()
pt  = Fernet(key).decrypt(ct.encode("ascii")).decode("utf-8")

if args.out:
    Path(args.out).write_text(pt, encoding="utf-8")
    print(f"Plaintext written to {args.out}", file=sys.stderr)
else:
    sys.stdout.write(pt)
