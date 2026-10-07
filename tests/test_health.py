import anyio
from httpx import ASGITransport, AsyncClient

from app.main import create_app


def test_health_endpoint_returns_ok() -> None:
    async def request_health() -> tuple[int, dict[str, str]]:
        async with AsyncClient(
            transport=ASGITransport(app=create_app()), base_url="http://test"
        ) as client:
            response = await client.get("/health")
            return response.status_code, response.json()

    status_code, body = anyio.run(request_health)

    assert status_code == 200
    assert body == {"status": "ok"}
