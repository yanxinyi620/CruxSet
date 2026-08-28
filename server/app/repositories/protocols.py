from typing import Any, Protocol


Document = dict[str, Any]


class CruxRepository(Protocol):
    def list_layouts(self, wall_id: str) -> list[Document]: ...

    def insert_layout(self, layout: Document) -> None: ...
