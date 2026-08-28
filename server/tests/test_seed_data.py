def test_seed_data_creates_one_wall_two_layouts_and_four_published_routes(tmp_path):
    from app.repositories.sqlite import SQLiteRepository
    from app.seed import seed_demo_workspace

    repository = SQLiteRepository(tmp_path / "cruxset.db")
    seed_demo_workspace(repository)

    walls = repository.list_walls()
    assert len(walls) == 1
    layouts = repository.list_layouts(walls[0]["id"])
    assert [layout["published"] for layout in layouts] == [True, False]
    assert len(repository.list_problems()) == 4
