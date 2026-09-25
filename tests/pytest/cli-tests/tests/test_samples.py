import pytest
from helpers.namespace_helper import NamespaceHelper
from helpers.samples_helper import SamplesHelper, sample_files, skip_reason


def _sample_params():
    """One case per sample YAML on disk, so a sample added later is covered
    without touching this file."""
    params = []
    for rel_path in sample_files():
        reason = skip_reason(rel_path)
        marks = [pytest.mark.skip(reason=reason)] if reason else []
        params.append(pytest.param(rel_path, id=rel_path, marks=marks))
    return params


class TestSamples:
    """Applies every samples/ YAML against the cluster's CRDs and admission
    webhooks, so a sample that no longer matches the API cannot be merged."""

    helper = None

    @classmethod
    def setup_class(cls):
        cls.helper = SamplesHelper(NamespaceHelper())

    @pytest.mark.parametrize("rel_path", _sample_params())
    def test_sample_is_accepted_by_the_api(self, rel_path):
        valid, message = self.helper.validate(rel_path)
        assert valid, f"samples/{rel_path} rejected: {message}"

