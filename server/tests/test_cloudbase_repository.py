import json

from app.repositories.cloudbase import CloudBaseRepository


class FakeClient:
    def __init__(self):
        self.action = None
        self.payload = None

    def call_json(self, action, payload):
        self.action = action
        self.payload = payload
        return json.dumps({"Response": {"Data": ['["{\\"id\\":\\"usr_1\\"}"]']}})


def test_cloudbase_query_uses_official_mgo_commands_shape():
    repository = object.__new__(CloudBaseRepository)
    repository._environment_id = "cloud1-test"
    repository._client = FakeClient()

    assert repository.find_user("usr_1") == {"id": "usr_1"}
    assert repository._client.action == "RunCommands"
    assert repository._client.payload == {
        "EnvId": "cloud1-test",
        "MgoCommands": [{
            "TableName": "users",
            "CommandType": "QUERY",
            "Command": '{"find":"users","filter":{"id":{"$eq":"usr_1"}},"limit":1}',
        }],
    }


class PaginatedFakeClient:
    def __init__(self, documents):
        self.documents = documents
        self.commands = []

    def call_json(self, action, payload):
        command = json.loads(payload["MgoCommands"][0]["Command"])
        self.commands.append(command)
        documents = self.documents[command["find"]]
        filter_ = command.get("filter", {})
        if "wallId" in filter_:
            wall_id = filter_["wallId"]["$eq"]
            documents = [item for item in documents if item.get("wallId") == wall_id]
        skip = command.get("skip", 0)
        limit = command.get("limit", 1000)
        page = documents[skip:skip + limit]
        encoded = [json.dumps(item, separators=(",", ":")) for item in page]
        return json.dumps({"Response": {"Data": [json.dumps(encoded)]}})


def test_cloudbase_lists_and_counts_across_all_query_pages():
    repository = object.__new__(CloudBaseRepository)
    repository._environment_id = "cloud1-test"
    walls = [{"id": f"wall_{index}"} for index in range(1001)]
    problems = [
        {"id": f"problem_{index}", "wallId": "wall_target" if index < 1001 else "wall_other"}
        for index in range(1002)
    ]
    repository._client = PaginatedFakeClient({"walls": walls, "problems": problems})

    assert repository.list_walls() == walls
    assert repository.list_problems() == problems
    assert repository.count_problems_for_wall("wall_target") == 1001
    assert [command["skip"] for command in repository._client.commands] == list(range(0, 1100, 100)) * 3
