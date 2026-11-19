import asyncio
import logging
import os
import re
import shutil
import tempfile
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncGenerator, Optional
from urllib.parse import urlsplit

import yaml

logger = logging.getLogger(__name__)

CHART_UNAVAILABLE = "chart-unavailable"
RENDER_FAILED = "render-failed"

HELM_BINARY = "helm"
MAX_CONCURRENT_RUNS = 2
MAX_OUTPUT_BYTES = 8 * 1024 * 1024
MAX_STDERR_BYTES = 64 * 1024
MAX_MESSAGE_CHARS = 4096
MAX_CHART_BYTES = 10 * 1024 * 1024
MAX_OBJECTS = 300
READ_CHUNK_BYTES = 64 * 1024

DIGEST_LINE = re.compile(r"^Digest: (sha256:[0-9a-f]{64})\s*$", re.MULTILINE)
PULLED_LINE = re.compile(r"^Pulled: \S+:([^:@\s]+)\s*$", re.MULTILINE)
CONTROL_CHARS = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]|[\x00-\x08\x0b-\x1f\x7f]")
DOCUMENT_SEPARATOR = re.compile(r"^---", re.MULTILINE)

_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT_RUNS)


class HelmError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class _OutputTooLarge(Exception):
    pass


@dataclass(frozen=True)
class PulledChart:
    path: Path
    digest: str
    version: str


class _NoAliasLoader(yaml.SafeLoader):
    def compose_node(self, parent, index):
        if self.check_event(yaml.AliasEvent):
            raise yaml.YAMLError("YAML aliases are not supported in rendered charts")
        return super().compose_node(parent, index)


@asynccontextmanager
async def workspace() -> AsyncGenerator[Path, None]:
    path = Path(tempfile.mkdtemp(prefix="marketplace-install-"))
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


def _environment(workdir: Path) -> dict[str, str]:
    home = workdir / "home"
    return {
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": str(home),
        "KUBECONFIG": os.devnull,
        "HELM_CACHE_HOME": str(home / "cache"),
        "HELM_CONFIG_HOME": str(home / "config"),
        "HELM_DATA_HOME": str(home / "data"),
        "HELM_REGISTRY_CONFIG": str(home / "registry.json"),
        "HELM_REPOSITORY_CONFIG": str(home / "repositories.yaml"),
        "HELM_REPOSITORY_CACHE": str(home / "repository"),
    }


def _clean(text: str) -> str:
    text = CONTROL_CHARS.sub("", text).strip()
    errors = [line for line in text.splitlines() if line.startswith("Error:")]
    if errors:
        text = errors[-1]
    return text[-MAX_MESSAGE_CHARS:]


async def _read_capped(stream: Optional[asyncio.StreamReader], limit: int, fail: bool) -> bytes:
    data = bytearray()
    if stream is None:
        return b""
    while chunk := await stream.read(READ_CHUNK_BYTES):
        if len(data) + len(chunk) > limit:
            if fail:
                raise _OutputTooLarge()
            data.extend(chunk[: limit - len(data)])
            continue
        data.extend(chunk)
    return bytes(data)


async def _stop(process: asyncio.subprocess.Process) -> None:
    if process.returncode is None:
        try:
            process.kill()
        except ProcessLookupError:
            pass
    await asyncio.shield(process.wait())


async def _run(args: list[str], workdir: Path) -> tuple[int, str, str]:
    async with _SEMAPHORE:
        process = await asyncio.create_subprocess_exec(
            HELM_BINARY,
            *args,
            cwd=str(workdir),
            env=_environment(workdir),
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.gather(
                _read_capped(process.stdout, MAX_OUTPUT_BYTES, fail=True),
                _read_capped(process.stderr, MAX_STDERR_BYTES, fail=False),
            )
            returncode = await process.wait()
        except BaseException:
            await _stop(process)
            raise
    return returncode, stdout.decode("utf-8", errors="replace"), stderr.decode("utf-8", errors="replace")


async def pull(chart_ref: str, plain_http: bool, workdir: Path) -> PulledChart:
    destination = workdir / "chart"
    destination.mkdir()
    args = ["pull", chart_ref, "--destination", str(destination)]
    if plain_http:
        args.append("--plain-http")
    registry = urlsplit(chart_ref).netloc
    try:
        returncode, _, stderr = await _run(args, workdir)
    except _OutputTooLarge:
        raise HelmError(CHART_UNAVAILABLE, f"Pulling the chart from {registry} produced too much output") from None
    if returncode != 0:
        raise HelmError(CHART_UNAVAILABLE, f"Could not pull the chart from {registry}: {_clean(stderr)}")
    digest = DIGEST_LINE.search(stderr)
    version = PULLED_LINE.search(stderr)
    archives = list(destination.iterdir())
    if digest is None or version is None or len(archives) != 1:
        raise HelmError(CHART_UNAVAILABLE, f"Helm did not report the chart digest and version from {registry}")
    if archives[0].stat().st_size > MAX_CHART_BYTES:
        raise HelmError(CHART_UNAVAILABLE, f"The chart from {registry} is larger than {MAX_CHART_BYTES} bytes")
    return PulledChart(path=archives[0], digest=digest.group(1), version=version.group(1))


def _parse(manifest: str) -> list[dict]:
    too_many = HelmError(RENDER_FAILED, f"The chart renders more than {MAX_OBJECTS} objects")
    if len(DOCUMENT_SEPARATOR.findall(manifest)) > MAX_OBJECTS + 1:
        raise too_many
    try:
        documents = [doc for doc in yaml.load_all(manifest, Loader=_NoAliasLoader) if doc is not None]
    except yaml.YAMLError as e:
        raise HelmError(RENDER_FAILED, f"The rendered chart is not valid YAML: {_clean(str(e))}") from None
    except RecursionError:
        raise HelmError(RENDER_FAILED, "The rendered chart is nested too deeply") from None
    if len(documents) > MAX_OBJECTS:
        raise too_many
    for doc in documents:
        if not isinstance(doc, dict) or not isinstance(doc.get("kind"), str) or not isinstance(doc.get("apiVersion"), str):
            raise HelmError(RENDER_FAILED, "The rendered chart contains a document that is not a Kubernetes object")
    return documents


async def template(chart: Path, release: str, namespace: str, workdir: Path) -> list[dict]:
    args = ["template", release, str(chart), "--namespace", namespace, "--include-crds"]
    try:
        returncode, stdout, stderr = await _run(args, workdir)
    except _OutputTooLarge:
        raise HelmError(RENDER_FAILED, f"The rendered chart is larger than {MAX_OUTPUT_BYTES} bytes") from None
    if returncode != 0:
        raise HelmError(RENDER_FAILED, f"Could not render the chart: {_clean(stderr)}")
    return await asyncio.to_thread(_parse, stdout)

