from unittest.mock import AsyncMock

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_session
from app.main import create_app


async def test_health_reports_database_up(client: AsyncClient):
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "up"}


async def test_health_reports_degraded_when_database_is_down():
    app: FastAPI = create_app()
    broken = AsyncMock()
    broken.execute.side_effect = ConnectionError("db unreachable")

    async def _override():
        yield broken

    app.dependency_overrides[get_session] = _override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "down"}


async def test_cors_allows_configured_origin(client: AsyncClient):
    response = await client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-credentials"] == "true"


async def test_cors_rejects_unknown_origin(client: AsyncClient):
    response = await client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in response.headers
