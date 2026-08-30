from copy import deepcopy

from app.repositories.protocols import Document


class MemoryRepository:
    def __init__(self) -> None:
        self._walls: dict[str, Document] = {}
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

    def insert_wall(self, wall: Document) -> None:
        self._walls[str(wall["id"])] = deepcopy(wall)

    def replace_wall(self, wall: Document) -> None:
        self._walls[str(wall["id"])] = deepcopy(wall)

    def find_wall(self, wall_id: str) -> Document | None:
        wall = self._walls.get(wall_id)
        return deepcopy(wall) if wall else None

    def list_walls(self) -> list[Document]:
        return [deepcopy(wall) for wall in self._walls.values()]

    def insert_problem(self, problem: Document) -> None:
        self._problems[str(problem["id"])] = deepcopy(problem)

    def find_problem(self, problem_id: str) -> Document | None:
        problem = self._problems.get(problem_id)
        return deepcopy(problem) if problem else None

    def list_problems(self) -> list[Document]:
        return [deepcopy(problem) for problem in self._problems.values()]

    def delete_problem(self, problem_id: str) -> None:
        self._problems.pop(problem_id, None)

    def delete_wall(self, wall_id: str) -> None:
        self._walls.pop(wall_id, None)

    def count_problems_for_wall(self, wall_id: str) -> int:
        return sum(problem.get("wallId") == wall_id for problem in self._problems.values())
