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


def test_sqlite_repository_can_create_an_administrator_without_an_id_field(tmp_path):
    from app.auth.passwords import create_admin_account
    from app.repositories.sqlite import SQLiteRepository

    repository = SQLiteRepository(tmp_path / "cruxset.db")
    account = create_admin_account(repository, "admin@example.com", "correct horse")

    assert repository.find_admin_by_user_id(account["userId"])["emailNormalized"] == "admin@example.com"
