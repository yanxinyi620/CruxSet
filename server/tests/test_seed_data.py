def test_seed_data_creates_independent_flat_walls_and_four_routes(tmp_path):
    from app.repositories.sqlite import SQLiteRepository
    from app.seed import seed_demo_workspace

    repository = SQLiteRepository(tmp_path / "cruxset.db")
    seed_demo_workspace(repository)

    walls = repository.list_walls()
    assert len(walls) == 2
    assert sorted(wall["published"] for wall in walls) == [False, True]
    assert all(set(wall).issuperset({"imageFileId", "imageWidth", "imageHeight", "holds"}) for wall in walls)
    problems = repository.list_problems()
    assert len(problems) == 4
    assert all(set(problem).issuperset({"wallId", "holds"}) for problem in problems)
