def test_sqlite_repository_persists_flat_wall_and_problem(tmp_path):
    from app.repositories.sqlite import SQLiteRepository
    database = tmp_path / "cruxset.db"
    wall = {"id": "wall_1", "name": "日坛", "imageFileId": "media_1", "holds": [{"id": "H001"}]}
    problem = {"id": "problem_1", "wallId": "wall_1", "number": "CS-000001"}
    repository = SQLiteRepository(database)
    repository.insert_wall(wall)
    repository.insert_problem(problem)
    repository.close()
    reopened = SQLiteRepository(database)
    assert reopened.find_wall("wall_1") == wall
    assert reopened.list_problems() == [problem]
    assert reopened.count_problems_for_wall("wall_1") == 1
    reopened.close()


def test_sqlite_repository_replaces_wall_and_delete_does_not_cascade(tmp_path):
    from app.repositories.sqlite import SQLiteRepository
    repository = SQLiteRepository(tmp_path / "cruxset.db")
    repository.insert_wall({"id": "wall_1", "name": "old"})
    repository.insert_problem({"id": "problem_1", "wallId": "wall_1"})
    repository.replace_wall({"id": "wall_1", "name": "new"})
    assert repository.find_wall("wall_1") == {"id": "wall_1", "name": "new"}
    repository.delete_wall("wall_1")
    assert repository.find_wall("wall_1") is None
    assert repository.find_problem("problem_1") == {"id": "problem_1", "wallId": "wall_1"}
    repository.close()


def test_sqlite_repository_persists_administrator_identity(tmp_path):
    from app.repositories.sqlite import SQLiteRepository
    repository = SQLiteRepository(tmp_path / "cruxset.db")
    repository.insert_user({"id": "usr_admin"})
    repository.insert_admin({"id": "admin_1", "userId": "usr_admin", "emailNormalized": "admin@example.com"})
    assert repository.find_user("usr_admin") == {"id": "usr_admin"}
    assert repository.find_admin_by_email("admin@example.com") == {"id": "admin_1", "userId": "usr_admin", "emailNormalized": "admin@example.com"}
    repository.close()


def test_sqlite_repository_can_create_an_administrator_without_an_id_field(tmp_path):
    from app.auth.passwords import create_admin_account
    from app.repositories.sqlite import SQLiteRepository
    repository = SQLiteRepository(tmp_path / "cruxset.db")
    account = create_admin_account(repository, "admin@example.com", "correct horse")
    assert repository.find_admin_by_user_id(account["userId"])["emailNormalized"] == "admin@example.com"
    repository.close()
