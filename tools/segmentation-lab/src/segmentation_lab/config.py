from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    device: str = "cpu"
    lab_internal_key: str = ""
    cruxset_base_url: str = "http://127.0.0.1:8000"
    cruxset_web_url: str = "http://127.0.0.1:5173"
    cruxset_publish_key: str = ""
    edge_segmentation_publish_key: str = ""
    edge_segmentation_url: str = "https://api.cruxset.xinyilab.top"
    cloudbase_function_url: str = ""
    cloudbase_storage_url: str = ""
    cloudbase_signing_key: str = ""
    cloudbase_owner_openid: str = ""

    @property
    def web_publish_configured(self) -> bool:
        return bool(self.cruxset_base_url and self.cruxset_publish_key)

    @property
    def cloudbase_publish_configured(self) -> bool:
        return all((self.cloudbase_function_url, self.cloudbase_storage_url, self.cloudbase_signing_key, self.cloudbase_owner_openid))
    @property
    def edge_publish_configured(self) -> bool:
        return bool(self.edge_segmentation_publish_key and self.edge_segmentation_url)

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            data_dir=Path(os.environ.get("SEG_LAB_DATA_DIR", "./data")),
            lab_internal_key=os.environ.get("CRUXSET_LAB_INTERNAL_KEY", ""),
            cruxset_base_url=os.environ.get("CRUXSET_BASE_URL", "http://127.0.0.1:8000").rstrip("/"),
            cruxset_web_url=os.environ.get("CRUXSET_WEB_URL", "http://127.0.0.1:5173").rstrip("/"),
            cruxset_publish_key=os.environ.get("CRUXSET_SEGMENTATION_PUBLISH_KEY", ""),
            edge_segmentation_publish_key=os.environ.get("CRUXSET_EDGE_SEGMENTATION_PUBLISH_KEY", ""),
            edge_segmentation_url=os.environ.get("CRUXSET_EDGE_SEGMENTATION_URL", "https://api.cruxset.xinyilab.top").rstrip("/"),
            cloudbase_function_url=os.environ.get("CRUXSET_CLOUDBASE_FUNCTION_URL", os.environ.get("CRUXSET_CLOUDBASE_PUBLISH_URL", "")).rstrip("/"),
            cloudbase_storage_url=os.environ.get("CRUXSET_CLOUDBASE_STORAGE_URL", "").rstrip("/"),
            cloudbase_signing_key=os.environ.get("CRUXSET_CLOUDBASE_SIGNING_KEY", os.environ.get("CRUXSET_CLOUDBASE_SEGMENTATION_SIGNING_KEY", "")),
            cloudbase_owner_openid=os.environ.get("CRUXSET_CLOUDBASE_OWNER_OPENID", os.environ.get("CRUXSET_SEGMENTATION_PUBLISH_OWNER_OPENID", "")),
        )
