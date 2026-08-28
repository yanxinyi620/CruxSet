#!/usr/bin/env python3
"""Create the administrator account for the local Web workspace."""

import argparse
import getpass
import os
from pathlib import Path

from app.auth.passwords import create_admin_account, reset_admin_password
from app.repositories.sqlite import SQLiteRepository


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a local CruxSet Web administrator")
    parser.add_argument("email")
    parser.add_argument("--reset-password", action="store_true")
    args = parser.parse_args()
    password = os.environ.get("ADMIN_BOOTSTRAP_PASSWORD") or getpass.getpass("Administrator password: ")
    if not password:
        parser.error("a password is required")
    database = os.environ.get("CRUXSET_DATABASE_URL", str(Path(__file__).resolve().parents[1] / "data" / "cruxset.db"))
    repository = SQLiteRepository(database)
    try:
        account = reset_admin_password(repository, args.email, password) if args.reset_password else create_admin_account(repository, args.email, password)
    except ValueError as error:
        parser.error(str(error))
    print(f"Local administrator ready: {account['email']} ({account['userId']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
