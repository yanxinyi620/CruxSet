from pathlib import Path


def test_model_dependencies_use_the_cpu_pytorch_index():
    config = Path(__file__).parents[1] / "pyproject.toml"

    assert 'torch = { index = "pytorch-cpu" }' in config.read_text()
