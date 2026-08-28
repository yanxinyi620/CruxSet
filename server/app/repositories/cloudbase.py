import json
import os
from typing import Any

from tencentcloud.common.common_client import CommonClient
from tencentcloud.common.credential import Credential


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
        payload = {"EnvId": self._environment_id, "Commands": commands}
        return json.loads(self._client.call_json("RunCommands", payload))
