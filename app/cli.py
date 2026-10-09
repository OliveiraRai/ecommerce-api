"""Interactive administrative account provisioning commands."""

import getpass
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Admin


def create_admin() -> int:
    username = input("Admin username: ").strip()
    if not username or len(username) > 120:
        print("Username must contain 1 to 120 characters.", file=sys.stderr)
        return 1
    password = getpass.getpass("Admin password: ")
    confirmation = getpass.getpass("Confirm password: ")
    if len(password) < 12:
        print("Password must contain at least 12 characters.", file=sys.stderr)
        return 1
    if password != confirmation:
        print("Passwords do not match.", file=sys.stderr)
        return 1
    try:
        with SessionLocal() as database:
            if database.scalar(select(Admin.id)) is not None:
                print("An administrator already exists; no changes were made.", file=sys.stderr)
                return 1
            database.add(Admin(id=1, username=username, password_hash=hash_password(password)))
            database.commit()
    except Exception:
        print("Could not create administrator; verify the database state.", file=sys.stderr)
        return 1
    print("Administrator created.")
    return 0


if __name__ == "__main__":
    raise SystemExit(create_admin())
