import shutil
import tempfile
from pathlib import Path

import pytest
import yaml

from helpers.generate_helper import GenerateHelper

MODEL_PROVIDERS = ["openai", "gemini", "claude", "azure"]


def _load_docs(path: Path):
    with open(path) as f:
        return [doc for doc in yaml.safe_load_all(f) if doc]


def _model_spec(path: Path) -> dict:
    model = next(doc for doc in _load_docs(path) if doc.get("kind") == "Model")
    return model["spec"]


def _query_spec(path: Path) -> dict:
    return _load_docs(path)[0]["spec"]


class TestArkGenerate:
    helper = None
    tmp_root = None
    projects = {}

    @classmethod
    def setup_class(cls):
        cls.helper = GenerateHelper()
        assert cls.helper.ark, "ark CLI not found on PATH; run 'npm install -g .' in tools/ark-cli"
        cls.tmp_root = tempfile.mkdtemp(
            prefix="ark-gen-", dir=str(Path(__file__).parent)
        )
        cls.projects = {}

    @classmethod
    def teardown_class(cls):
        if cls.tmp_root:
            shutil.rmtree(cls.tmp_root, ignore_errors=True)

    def _project(self, key: str, provider: str = "openai") -> Path:
        """Generate (once per key) an isolated project to operate in."""
        if key not in self.projects:
            ok, out, err = self.helper.generate_project(key, self.tmp_root, provider)
            assert ok, f"ark generate project ({key}) failed: {err or out}"
            self.projects[key] = Path(self.tmp_root) / key
        return self.projects[key]

    # -- ark generate project (only path that emits model manifests) ----------

    def test_generate_project_creates_resources(self):
        proj = self._project("base")
        assert (proj / "agents" / "sample-agent.yaml").exists()
        assert (proj / "queries" / "sample-agent-query.yaml").exists()
        assert (proj / "models" / "default.yaml").exists()

    @pytest.mark.parametrize("provider", MODEL_PROVIDERS)
    def test_generated_model_uses_provider_field(self, provider):
        proj = self._project(f"model-{provider}", provider)
        spec = _model_spec(proj / "models" / "default.yaml")
        assert "type" not in spec, "model still uses deprecated spec.type"
        assert spec.get("provider"), "model is missing spec.provider"

    def test_generated_azure_model_nests_apikey_under_auth(self):
        proj = self._project("model-azure", "azure")
        spec = _model_spec(proj / "models" / "default.yaml")
        azure = spec["config"]["azure"]
        assert "apiKey" not in azure, "azure apiKey should not sit directly under config.azure"
        assert azure["auth"]["apiKey"], "azure apiKey should be nested under config.azure.auth"

    @pytest.mark.parametrize("provider", MODEL_PROVIDERS)
    def test_generated_model_applies_to_cluster(self, provider):
        proj = self._project(f"model-{provider}", provider)
        ok, msg = self.helper.dry_run_apply(str(proj / "models" / "default.yaml"))
        assert ok, f"server-side apply of generated {provider} model failed: {msg}"

    # -- ark generate query ----------------------------------------------------

    def test_generate_query_uses_singular_target_and_applies(self):
        proj = self._project("query")
        rc, out = self.helper.generate_query("genq", str(proj))
        assert rc == 0, f"ark generate query failed: {out}"

        path = proj / "queries" / "genq-query.yaml"
        spec = _query_spec(path)
        assert "targets" not in spec, "query still uses deprecated spec.targets"
        assert spec["target"]["type"] == "agent"
        assert spec["target"]["name"]

        ok, msg = self.helper.dry_run_apply(str(path))
        assert ok, f"server-side apply of generated query failed: {msg}"

    # -- ark generate agent ----------------------------------------------------

    def test_generate_agent_creates_agent_and_query(self):
        proj = self._project("agent")
        rc, out = self.helper.generate_agent("gena", str(proj))
        assert rc == 0, f"ark generate agent failed: {out}"

        agent_path = proj / "agents" / "gena-agent.yaml"
        query_path = proj / "queries" / "gena-query.yaml"
        assert agent_path.exists()
        assert query_path.exists()

        spec = _query_spec(query_path)
        assert "targets" not in spec
        assert spec["target"]["type"] == "agent"

        ok, msg = self.helper.dry_run_apply(str(agent_path))
        assert ok, f"server-side apply of generated agent failed: {msg}"

    # -- ark generate team -----------------------------------------------------

    def test_generate_team_creates_team_and_query(self):
        proj = self._project("team")
        rc, out = self.helper.generate_team("gent", str(proj))
        assert rc == 0, f"ark generate team failed: {out}"

        team_path = proj / "teams" / "gent-team.yaml"
        query_path = proj / "queries" / "gent-query.yaml"
        assert team_path.exists()
        assert query_path.exists()

        team_spec = next(
            doc for doc in _load_docs(team_path) if doc.get("kind") == "Team"
        )["spec"]
        assert team_spec["members"], "team should have at least one member"

        spec = _query_spec(query_path)
        assert "targets" not in spec
        assert spec["target"]["type"] == "team"

        ok, msg = self.helper.dry_run_apply(str(team_path))
        assert ok, f"server-side apply of generated team failed: {msg}"
