from segmentation_lab.domain import BBox, RawCandidate, candidate_from_json, candidate_to_json


def test_raw_candidate_round_trips_without_embedding_mask_bytes():
    candidate = RawCandidate(
        id="sam2-0001",
        source="sam2",
        mask_path="masks/sam2-0001.png",
        bbox=BBox(10, 20, 40, 60),
        area=842,
        model_score=0.91,
        post_score=0.87,
        polygon=((10.0, 20.0), (40.0, 20.0), (30.0, 60.0)),
        status="pending",
        metadata={"stability": 0.94},
    )

    payload = candidate_to_json(candidate)

    assert "maskBytes" not in payload
    assert candidate_from_json(payload) == candidate
