import os
import pytest


@pytest.fixture(scope="session")
def kube_client():
    """Load kube config and return CoreV1Api and CustomObjectsApi clients."""
    try:
        from kubernetes import config, client
    except ImportError:
        pytest.skip("kubernetes module not available - run tests with virtual environment")
    
    # Try in-cluster, fall back to local kubeconfig
    try:
        config.load_incluster_config()
    except Exception:
        config.load_kube_config()

    return client.CoreV1Api(), client.CustomObjectsApi()


@pytest.fixture(scope="session")
def namespaces():
    return {
        "work": os.getenv("ARK_NAMESPACE", "default"),
        "controller": os.getenv("ARK_CONTROLLER_NAMESPACE", "ark-system"),
    }


@pytest.fixture(scope="session")
def ark_gvr():
    """Group/Version/Resources for ARK CRDs used in tests."""
    return {
        "group": "ark.mckinsey.com",
        "version": "v1alpha1",
        "agents": "agents",
        "models": "models",
    }



