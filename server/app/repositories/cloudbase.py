import json
import os
from typing import Any

from tencentcloud.common.common_client import CommonClient
from tencentcloud.common.credential import Credential

from app.repositories.protocols import Document


class CloudBaseRepository:
    """Server-only CloudBase document database adapter.

    All commands are built by application services; request data never supplies a
    collection name or a CloudBase command directly.
    """

    def __init__(self) -> None:
        secret_id = os.environ["TENCENT_SECRET_ID"]
        secret_key = os.environ["TENCENT_SECRET_KEY"]
        self._environment_id = os.environ["CLOUDBASE_ENV_ID"]
        self._client = CommonClient(
            "tcb",
            "2018-06-08",
            Credential(secret_id, secret_key),
            os.environ.get("TENCENT_REGION", "ap-shanghai"),
        )

    def _run_commands(self, commands: list[dict[str, Any]]) -> dict[str, Any]:
        payload = {"EnvId": self._environment_id, "MgoCommands": commands}
        return json.loads(self._client.call_json("RunCommands", payload))

    @staticmethod
    def _command(table_name: str, command_type: str, command: dict[str, Any]) -> dict[str, str]:
        return {
            "TableName": table_name,
            "CommandType": command_type,
            "Command": json.dumps(command, ensure_ascii=False, separators=(",", ":")),
        }

    @staticmethod
    def _documents(response: dict[str, Any]) -> list[Document]:
        """Unwrap the nested JSON strings returned by CloudBase RunCommands."""
        documents: list[Document] = []
        for item in response.get("Response", {}).get("Data") or []:
            decoded: Any = json.loads(item)
            if not isinstance(decoded, list):
                decoded = [decoded]
            for value in decoded:
                if isinstance(value, str):
                    value = json.loads(value)
                if isinstance(value, dict):
                    documents.append(value)
        return documents

    def _query_one(self, table_name: str, filter_: dict[str, Any]) -> Document | None:
        response = self._run_commands([
            self._command(table_name, "QUERY", {"find": table_name, "filter": filter_, "limit": 1})
        ])
        documents = self._documents(response)
        return documents[0] if documents else None

    def _insert(self, table_name: str, document: Document) -> None:
        self._run_commands([
            self._command(table_name, "INSERT", {"insert": table_name, "documents": [document]})
        ])

    def insert_user(self, user: Document) -> None:
        self._insert("users", user)

    def find_user(self, user_id: str) -> Document | None:
        return self._query_one("users", {"id": {"$eq": user_id}})

    def insert_admin(self, admin: Document) -> None:
        self._insert("admins", admin)

    def find_admin_by_email(self, email: str) -> Document | None:
        return self._query_one("admins", {"emailNormalized": {"$eq": email}, "role": {"$eq": "admin"}})

    def find_admin_by_user_id(self, user_id: str) -> Document | None:
        return self._query_one("admins", {"userId": {"$eq": user_id}, "role": {"$eq": "admin"}})

    def update_admin_password(self, email: str, password_hash: str, updated_at: int) -> None:
        self._run_commands([
            self._command("admins", "UPDATE", {
                "update": "admins",
                "updates": [{
                    "q": {"emailNormalized": {"$eq": email}, "role": {"$eq": "admin"}},
                    "u": {"$set": {"passwordHash": password_hash, "updatedAt": updated_at}},
                    "multi": False,
                }],
            })
        ])
