import json
import sqlite3
import threading
from pathlib import Path

from app.repositories.protocols import Document


class SQLiteRepository:
    """Local JSON-document repository backed by SQLite for the Web workspace."""

    def __init__(self, database: str | Path) -> None:
        self._database = str(database)
        self._lock = threading.Lock()
        # FastAPI runs sync auth dependencies in a thread pool, so the shared
        # connection must be usable across threads; the lock serialises access.
        self._connection = sqlite3.connect(self._database, check_same_thread=False)
        with self._lock:
            self._connection.execute(
                "CREATE TABLE IF NOT EXISTS documents (collection_name TEXT NOT NULL, document_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (collection_name, document_id))"
            )
            self._connection.commit()

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def _put(self, collection: str, document: Document) -> None:
        document_id = document.get("id") or document.get("userId") or document.get("emailNormalized")
        if not document_id:
            raise ValueError("Document requires id, userId, or emailNormalized")
        with self._lock:
            self._connection.execute(
                "INSERT OR REPLACE INTO documents (collection_name, document_id, body) VALUES (?, ?, ?)",
                (collection, str(document_id), json.dumps(document, ensure_ascii=False, separators=(",", ":"))),
            )
            self._connection.commit()

    def _get(self, collection: str, document_id: str) -> Document | None:
        with self._lock:
            row = self._connection.execute(
                "SELECT body FROM documents WHERE collection_name = ? AND document_id = ?", (collection, document_id)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def _list(self, collection: str) -> list[Document]:
        with self._lock:
            rows = self._connection.execute("SELECT body FROM documents WHERE collection_name = ?", (collection,)).fetchall()
        return [json.loads(row[0]) for row in rows]

    def insert_wall(self, wall: Document) -> None: self._put("walls", wall)
    def replace_problem(self, problem: Document) -> None: self._put("problems", problem)
    def replace_wall(self, wall: Document) -> None: self._put("walls", wall)
    def insert_user(self, user: Document) -> None: self._put("users", user)
    def find_user(self, user_id: str) -> Document | None: return self._get("users", user_id)
    def insert_admin(self, admin: Document) -> None: self._put("admins", admin)
    def find_admin_by_email(self, email: str) -> Document | None:
        return next((item for item in self._list("admins") if item.get("emailNormalized") == email), None)
    def find_admin_by_user_id(self, user_id: str) -> Document | None:
        return next((item for item in self._list("admins") if item.get("userId") == user_id), None)
    def update_admin_password(self, email: str, password_hash: str, updated_at: int) -> None:
        admin = self.find_admin_by_email(email)
        if not admin:
            raise ValueError("Administrator not found")
        self._put("admins", {**admin, "passwordHash": password_hash, "updatedAt": updated_at})
    def find_wall(self, wall_id: str) -> Document | None: return self._get("walls", wall_id)
    def list_walls(self) -> list[Document]: return self._list("walls")
    def insert_problem(self, problem: Document) -> None: self._put("problems", problem)
    def find_problem(self, problem_id: str) -> Document | None: return self._get("problems", problem_id)
    def list_problems(self) -> list[Document]: return self._list("problems")
    def delete_problem(self, problem_id: str) -> None:
        with self._lock:
            self._connection.execute("DELETE FROM documents WHERE collection_name = 'problems' AND document_id = ?", (problem_id,))
            self._connection.commit()
    def delete_wall(self, wall_id: str) -> None:
        with self._lock:
            self._connection.execute("DELETE FROM documents WHERE collection_name = 'walls' AND document_id = ?", (wall_id,))
            self._connection.commit()
    def count_problems_for_wall(self, wall_id: str) -> int:
        return sum(problem.get("wallId") == wall_id for problem in self.list_problems())
