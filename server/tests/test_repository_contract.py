from app.repositories.memory import MemoryRepository


def test_memory_repository_returns_only_latest_layout_snapshot():
    repository = MemoryRepository()
    repository.insert_layout({"id": "layout_1", "wallId": "wall_1", "version": 1, "published": False})
    repository.insert_layout({"id": "layout_1", "wallId": "wall_1", "version": 2, "published": True})

    assert repository.list_layouts("wall_1") == [
        {"id": "layout_1", "wallId": "wall_1", "version": 2, "published": True}
    ]
