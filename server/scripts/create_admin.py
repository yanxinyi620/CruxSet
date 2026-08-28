#!/usr/bin/env python3
"""Create the first Web administrator, or explicitly reset one password."""

import argparse
import getpass
import os
import sys

from app.auth.passwords import create_admin_account, reset_admin_password
from app.repositories.cloudbase import CloudBaseRepository


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a CruxSet Web administrator")
    parser.add_argument("email")
    parser.add_argument("--reset-password", action="store_true")
    args = parser.parse_args()

    password = os.environ.get("ADMIN_BOOTSTRAP_PASSWORD")
    if not password:
        password = getpass.getpass("Administrator password: ")
    if not password:
        print("A password is required.", file=sys.stderr)
        return 2

    repository = CloudBaseRepository()
    try:
        if args.reset_password:
            if not sys.stdin.isatty() or input("Reset this administrator password? [y/N] ").strip().lower() != "y":
                print("Cancelled.")
                return 1
            account = reset_admin_password(repository, args.email, password)
            print(f"Password reset for {account['email']} ({account['userId']}).")
        else:
            account = create_admin_account(repository, args.email, password)
            print(f"Administrator created for {account['email']} ({account['userId']}).")
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
