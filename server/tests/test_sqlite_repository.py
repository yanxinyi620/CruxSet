def test_sqlite_repository_persists_wall_layout_and_problem(tmp_path):
    from app.repositories.sqlite import SQLiteRepository

    database = tmp_path / "cruxset.db"
    repository = SQLiteRepository(database)
    repository.insert_wall({"id": "wall_1", "name": "日坛", "createdAt": 1})
    repository.insert_layout({"id": "layout_1", "wallId": "wall_1", "version": 1, "published": False})
    repository.insert_problem({"id": "problem_1", "wallId": "wall_1", "layoutId": "layout_1", "number": "CS-000001"})
    repository.close()

    reopened = SQLiteRepository(database)
    assert reopened.find_wall("wall_1") == {"id": "wall_1", "name": "日坛", "createdAt": 1}
    assert reopened.find_layout("layout_1") == {"id": "layout_1", "wallId": "wall_1", "version": 1, "published": False}
    assert reopened.list_problems() == [{"id": "problem_1", "wallId": "wall_1", "layoutId": "layout_1", "number": "CS-000001"}]


def test_sqlite_repository_persists_administrator_identity(tmp_path):
    from app.repositories.sqlite import SQLiteRepository

    repository = SQLiteRepository(tmp_path / "cruxset.db")
    repository.insert_user({"id": "usr_admin"})
    repository.insert_admin({"id": "admin_1", "userId": "usr_admin", "emailNormalized": "admin@example.com"})

    assert repository.find_user("usr_admin") == {"id": "usr_admin"}
    assert repository.find_admin_by_email("admin@example.com") == {"id": "admin_1", "userId": "usr_admin", "emailNormalized": "admin@example.com"}
