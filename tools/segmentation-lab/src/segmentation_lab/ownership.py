"""Immutable experiment ownership, independent of mutable inference records."""
import json
import os
import re
from pathlib import Path
from uuid import uuid4

IDENTIFIER = re.compile(r"^[A-Za-z0-9_-]{1,200}$")


def owner_of(directory: Path) -> str | None:
    path = directory / 'owner.json'
    if not path.exists():
        return None
    value = json.loads(path.read_text(encoding='utf-8'))
    owner = value.get('ownerId')
    if not isinstance(owner, str) or not IDENTIFIER.fullmatch(owner):
        raise ValueError('Invalid experiment ownership record')
    return owner


def assign_owner(directory: Path, owner: str) -> bool:
    """Atomically create a sidecar without replacing another assignment."""
    if not IDENTIFIER.fullmatch(owner):
        raise ValueError('Invalid owner identifier')
    temporary = directory / f'.owner-{uuid4()}.tmp'
    try:
        with temporary.open('x', encoding='utf-8') as output:
            json.dump({'ownerId': owner}, output, sort_keys=True)
            output.flush()
            os.fsync(output.fileno())
        try:
            os.link(temporary, directory / 'owner.json')
        except FileExistsError:
            return False
        return True
    finally:
        temporary.unlink(missing_ok=True)


def migrate_legacy_owners(root: Path, owner: str) -> list[str]:
    assigned = []
    for path in sorted(root.glob('*/experiment.json')):
        directory = path.parent
        if directory.is_symlink() or not IDENTIFIER.fullmatch(directory.name):
            continue
        if owner_of(directory) is None and assign_owner(directory, owner):
            assigned.append(directory.name)
    return assigned
