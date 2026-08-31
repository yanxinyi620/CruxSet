import json
from pathlib import Path
from typing import Any

import httpx

from .errors import SegmentationLabError


class CruxSetPublisher:
    def __init__(self, base_url: str, publish_key: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.publish_key = publish_key
        self.transport = transport

    async def publish(self, image: bytes, filename: str, metadata: dict[str, Any]) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(transport=self.transport, timeout=60) as client:
                response = await client.post(
                    f"{self.base_url}/api/v1/admin/segmentation-walls",
                    headers={"Authorization": f"Bearer {self.publish_key}"},
                    files={"image": (Path(filename).name, image, "image/png")},
                    data={"metadata": json.dumps(metadata, ensure_ascii=False)},
                )
        except httpx.HTTPError as error:
            raise SegmentationLabError("cruxset_unavailable", "CruxSet 本机服务不可连接，请确认服务已启动。", True) from error
        if response.status_code >= 400:
            try:
                payload = response.json()
                message = payload.get("error", {}).get("message", "CruxSet 发布失败")
            except ValueError:
                message = "CruxSet 发布失败"
            code = "cruxset_unavailable" if response.status_code >= 500 else "cruxset_publish_failed"
            raise SegmentationLabError(code, str(message), response.status_code >= 500)
        return response.json()
