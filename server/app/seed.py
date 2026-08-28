from app.repositories.protocols import Document


def seed_demo_workspace(repository) -> None:
    """Create deterministic local content only for an empty Web workspace."""
    if repository.list_walls():
        return
    holds = [
        {"id": f"H{index:03d}", "x": .12 + ((index - 1) % 6) * .15, "y": .12 + ((index - 1) // 6) * .2,
         "radius": .018, "kind": "volume" if index == 18 else "hold"}
        for index in range(1, 25)
    ]
    wall: Document = {"id": "wall_demo", "name": "日坛 Spraywall", "description": "CruxSet 本地测试墙面",
                      "activeLayoutId": "", "angleOptions": [20, 25, 30, 35, 40, 45], "ownerId": "usr_local_demo",
                      "visibility": "public", "createdAt": 0, "updatedAt": 0}
    published: Document = {"id": "layout_demo", "wallId": wall["id"], "name": "2026-08 已发布 Layout",
                           "imageFileId": "/assets/mock/ritan-spraywall-0822.jpg", "imageWidth": 4096, "imageHeight": 3072,
                           "geometryType": "circle", "version": 1, "published": True, "holds": holds, "createdAt": 0, "updatedAt": 0}
    draft: Document = {"id": "layout_demo_draft", "wallId": wall["id"], "name": "2026-09 标注草稿",
                       "imageFileId": "/assets/mock/ritan-spraywall-0822.jpg", "imageWidth": 4096, "imageHeight": 3072,
                       "geometryType": "circle", "version": 1, "published": False, "holds": [], "createdAt": 1, "updatedAt": 1}
    repository.insert_wall(wall)
    repository.insert_layout(published)
    repository.insert_layout(draft)
    for number, name, angle in [(121, "左侧动态", 35), (122, "中间平衡", 35), (123, "右侧压身", 35), (124, "高步转换", 25)]:
        repository.insert_problem({"id": f"problem_CS-{number:06d}", "number": f"CS-{number:06d}", "wallId": wall["id"],
                                   "layoutId": published["id"], "layoutVersion": 1, "name": name, "angle": angle, "grade": "V4",
                                   "footRule": "feet_follow", "holds": {"start": ["H001"], "foot": [], "hand": ["H007", "H013"], "assist": [], "finish": ["H024"]},
                                   "createdBy": "usr_local_demo", "createdAt": 0, "updatedAt": 0})
