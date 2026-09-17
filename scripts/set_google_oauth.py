#!/usr/bin/env python3
"""Store Google OAuth settings in the local, gitignored .env file."""
from getpass import getpass
from pathlib import Path
import re

project_dir = Path(__file__).resolve().parents[1]
env_path = project_dir / ".env"
if not env_path.exists():
    raise SystemExit(f"Missing {env_path}. Run this from the Mission Control checkout.")

client_id = input("Google OAuth client ID: ").strip()
client_secret = getpass("Google OAuth client secret (hidden): ").strip()
if not client_id or not client_secret:
    raise SystemExit("Both values are required; .env was left unchanged.")

contents = env_path.read_text()
for key, value in (("GOOGLE_CLIENT_ID", client_id), ("GOOGLE_CLIENT_SECRET", client_secret)):
    pattern = rf"(?m)^{key}=.*$"
    replacement = f'{key}="{value}"'
    if not re.search(pattern, contents):
        raise SystemExit(f"Missing {key} in {env_path}; .env was left unchanged.")
    contents = re.sub(pattern, replacement, contents, count=1)

env_path.write_text(contents)
env_path.chmod(0o600)
print("Google OAuth settings saved locally in .env.")
