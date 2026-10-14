from fastapi import Request

from ark_sdk.secret_scope import SecretScope


def get_secret_scope(request: Request) -> SecretScope:
    return SecretScope()
