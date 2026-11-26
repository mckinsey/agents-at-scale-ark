import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Optional, Union

import aiohttp
from kubernetes_asyncio import client
from kubernetes_asyncio.client.rest import ApiException

from .constants import LOCK_NAME
from .state import job_finished

LOCK_STALE_ENV = "MARKETPLACE_INSTALL_LOCK_STALE_SECONDS"
DEFAULT_LOCK_STALE_SECONDS = 30


@dataclass(frozen=True)
class Lease:
    holder: str
    resource_version: str
    created: Optional[datetime]


@dataclass(frozen=True)
class Acquired:
    resource_version: str


@dataclass(frozen=True)
class Resumed:
    job: dict


@dataclass(frozen=True)
class Held:
    holder: str


Outcome = Union[Acquired, Resumed, Held]
JobOf = Callable[[str], Awaitable[Optional[dict]]]


def stale_seconds() -> int:
    try:
        value = int(os.getenv(LOCK_STALE_ENV, ""))
    except ValueError:
        return DEFAULT_LOCK_STALE_SECONDS
    return value if value > 0 else DEFAULT_LOCK_STALE_SECONDS


class Leases:
    def __init__(self, api, namespace: str):
        self.coordination = client.CoordinationV1Api(api)
        self.namespace = namespace

    async def create(self, holder: str) -> Optional[str]:
        body = client.V1Lease(
            metadata=client.V1ObjectMeta(name=LOCK_NAME),
            spec=client.V1LeaseSpec(holder_identity=holder),
        )
        try:
            created = await self.coordination.create_namespaced_lease(self.namespace, body)
        except ApiException as e:
            if e.status == 409:
                return None
            raise
        return created.metadata.resource_version

    async def read(self) -> Optional[Lease]:
        try:
            found = await self.coordination.read_namespaced_lease(LOCK_NAME, self.namespace)
        except ApiException as e:
            if e.status == 404:
                return None
            raise
        holder = found.spec.holder_identity if found.spec else None
        return Lease(
            holder=holder or "",
            resource_version=found.metadata.resource_version,
            created=found.metadata.creation_timestamp,
        )

    async def delete(self, resource_version: str) -> bool:
        options = client.V1DeleteOptions(preconditions=client.V1Preconditions(resource_version=resource_version))
        try:
            await self.coordination.delete_namespaced_lease(LOCK_NAME, self.namespace, body=options)
        except ApiException as e:
            if e.status in (404, 409):
                return False
            raise
        return True


def _stale(lease: Lease, now: datetime) -> bool:
    if lease.created is None:
        return False
    return now - lease.created > timedelta(seconds=stale_seconds())


async def acquire(leases: Leases, release: str, job_of: JobOf, now: Optional[datetime] = None) -> Outcome:
    created = await leases.create(release)
    if created is not None:
        return Acquired(created)
    lease = await leases.read()
    if lease is None:
        created = await leases.create(release)
        return Acquired(created) if created is not None else Held("")
    job = await job_of(lease.holder) if lease.holder else None
    active = job is not None and not job_finished(job)
    if lease.holder == release:
        if active and job is not None:
            return Resumed(job)
    elif active or (job is None and not _stale(lease, now or datetime.now(timezone.utc))):
        return Held(lease.holder)
    if not await leases.delete(lease.resource_version):
        return Held(lease.holder)
    created = await leases.create(release)
    return Acquired(created) if created is not None else Held(lease.holder)


async def release_if_ours(leases: Leases, resource_version: str) -> None:
    try:
        await leases.delete(resource_version)
    except (ApiException, aiohttp.ClientError):
        return
