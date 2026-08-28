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
