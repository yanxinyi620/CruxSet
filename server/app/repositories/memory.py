from copy import deepcopy

from app.repositories.protocols import Document


class MemoryRepository:
    def __init__(self) -> None:
        self._layouts: list[Document] = []

    def insert_layout(self, layout: Document) -> None:
        self._layouts.append(deepcopy(layout))

    def list_layouts(self, wall_id: str) -> list[Document]:
        latest: dict[str, Document] = {}
        for layout in self._layouts:
            if layout.get("wallId") != wall_id:
                continue
            layout_id = str(layout["id"])
            if layout_id not in latest or int(latest[layout_id].get("version", 0)) < int(layout.get("version", 0)):
                latest[layout_id] = layout
        return [deepcopy(layout) for layout in sorted(latest.values(), key=lambda item: int(item.get("updatedAt", 0)), reverse=True)]
