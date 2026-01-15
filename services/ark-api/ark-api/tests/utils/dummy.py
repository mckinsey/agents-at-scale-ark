from datetime import datetime
from types import SimpleNamespace


class DummyRevision:
    def __init__(self):
        self.status = "deployed"
        self.revision = 3
        self.updated = datetime(2024, 1, 1, 12, 0, 0)

    async def chart_metadata(self):
        return SimpleNamespace(
          name="chart", version="1.0.0", 
          app_version="2.0.0", 
          annotations={"team": "ark"}, 
          description="desc"
        )
  
class DummyRelease:
    def __init__(self):
        self.name = "rel"
        self.namespace = "ns"

    async def current_revision(self):
        return DummyRevision()