from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    device: str = "cpu"
    cruxset_base_url: str = "http://127.0.0.1:8000"
    cruxset_web_url: str = "http://127.0.0.1:5173"
    cruxset_publish_key: str = ""

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            data_dir=Path(os.environ.get("SEG_LAB_DATA_DIR", "./data")),
            cruxset_base_url=os.environ.get("CRUXSET_BASE_URL", "http://127.0.0.1:8000").rstrip("/"),
            cruxset_web_url=os.environ.get("CRUXSET_WEB_URL", "http://127.0.0.1:5173").rstrip("/"),
            cruxset_publish_key=os.environ.get("CRUXSET_SEGMENTATION_PUBLISH_KEY", ""),
        )
