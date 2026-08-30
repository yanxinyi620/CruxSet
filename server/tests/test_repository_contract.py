from app.repositories.memory import MemoryRepository


def test_memory_repository_persists_flat_walls_and_problems():
    repository = MemoryRepository()
    wall = {"id": "wall_1", "imageFileId": "media_1", "holds": [{"id": "H001"}]}
    problem = {"id": "problem_1", "wallId": "wall_1"}
    repository.insert_wall(wall)
    repository.insert_problem(problem)
    assert repository.find_wall("wall_1") == wall
    assert repository.list_walls() == [wall]
    assert repository.find_problem("problem_1") == problem
    assert repository.list_problems() == [problem]
    assert repository.count_problems_for_wall("wall_1") == 1


def test_memory_repository_replaces_wall_by_id_and_delete_does_not_cascade():
    repository = MemoryRepository()
    repository.insert_wall({"id": "wall_1", "name": "old"})
    repository.insert_problem({"id": "problem_1", "wallId": "wall_1"})
    repository.replace_wall({"id": "wall_1", "name": "new", "holds": []})
    repository.delete_wall("wall_1")
    assert repository.find_wall("wall_1") is None
    assert repository.find_problem("problem_1") == {"id": "problem_1", "wallId": "wall_1"}


def test_memory_repository_exposes_no_layout_content_operations():
    repository = MemoryRepository()
    for method in ("insert_layout", "replace_layout", "find_layout", "list_layouts", "delete_layout", "delete_problems_for_layout"):
        assert not hasattr(repository, method)
