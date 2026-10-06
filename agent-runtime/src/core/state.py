from __future__ import annotations

from typing import Protocol, cast

from dishka import AsyncContainer
from litestar import Litestar


class AppState(Protocol):
    dishka_container: AsyncContainer


def get_app_state(app: Litestar) -> AppState:
    return cast(AppState, app.state)
