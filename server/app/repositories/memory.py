from copy import deepcopy

from app.repositories.protocols import Document


class MemoryRepository:
    def __init__(self) -> None:
        self._walls: dict[str, Document] = {}
        self._layouts: list[Document] = []
        self._problems: dict[str, Document] = {}
        self._users: dict[str, Document] = {}
        self._admins: dict[str, Document] = {}

    def insert_user(self, user: Document) -> None:
        self._users[str(user["id"])] = deepcopy(user)

    def insert_admin(self, admin: Document) -> None:
        self._admins[str(admin["emailNormalized"])] = deepcopy(admin)

    def find_admin_by_email(self, email: str) -> Document | None:
        admin = self._admins.get(email)
        return deepcopy(admin) if admin else None

    def find_admin_by_user_id(self, user_id: str) -> Document | None:
        for admin in self._admins.values():
            if admin.get("userId") == user_id:
                return deepcopy(admin)
        return None

    def update_admin_password(self, email: str, password_hash: str, updated_at: int) -> None:
        if email not in self._admins:
            raise ValueError("Administrator not found")
        self._admins[email]["passwordHash"] = password_hash
        self._admins[email]["updatedAt"] = updated_at

    def find_user(self, user_id: str) -> Document | None:
        user = self._users.get(user_id)
        return deepcopy(user) if user else None

    def insert_layout(self, layout: Document) -> None:
        self._layouts.append(deepcopy(layout))

    def insert_wall(self, wall: Document) -> None:
        self._walls[str(wall["id"])] = deepcopy(wall)

    def find_wall(self, wall_id: str) -> Document | None:
        wall = self._walls.get(wall_id)
        return deepcopy(wall) if wall else None

    def list_walls(self) -> list[Document]:
        return [deepcopy(wall) for wall in self._walls.values()]

    def find_layout(self, layout_id: str) -> Document | None:
        snapshots = [layout for layout in self._layouts if layout.get("id") == layout_id]
        if not snapshots:
            return None
        return deepcopy(max(snapshots, key=lambda item: int(item.get("version", 0))))

    def replace_layout(self, layout: Document) -> None:
        self._layouts.append(deepcopy(layout))

    def insert_problem(self, problem: Document) -> None:
        self._problems[str(problem["id"])] = deepcopy(problem)

    def list_problems(self) -> list[Document]:
        return [deepcopy(problem) for problem in self._problems.values()]

    def list_layouts(self, wall_id: str) -> list[Document]:
        latest: dict[str, Document] = {}
        for layout in self._layouts:
            if layout.get("wallId") != wall_id:
                continue
            layout_id = str(layout["id"])
            if layout_id not in latest or int(latest[layout_id].get("version", 0)) < int(layout.get("version", 0)):
                latest[layout_id] = layout
        return [deepcopy(layout) for layout in sorted(latest.values(), key=lambda item: int(item.get("updatedAt", 0)), reverse=True)]
