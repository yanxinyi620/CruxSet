"""Create or read a private persistent development key; never log its value."""
import fcntl
import os
import secrets
import sys

fd = os.open(sys.argv[1], os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
with os.fdopen(fd, "r+") as stream:
    fcntl.flock(stream, fcntl.LOCK_EX)
    os.fchmod(stream.fileno(), 0o600)
    value = stream.read().strip()
    if not value:
        value = secrets.token_urlsafe(48)
        stream.seek(0)
        stream.write(value + "\n")
        stream.truncate()
        stream.flush()
        os.fsync(stream.fileno())
    print(value)
