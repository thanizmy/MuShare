from httpx import AsyncClient

from app.core.config import get_settings
from app.core.ratelimit import AttemptLimiter, LoginLimits

PASSWORD = "correct-horse-9"


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


# ------------------------------------------------------------------ unit tests


def test_limiter_allows_until_the_cap_then_blocks():
    clock = Clock()
    limiter = AttemptLimiter(3, 60, clock)
    for _ in range(3):
        assert limiter.retry_after("k") == 0
        limiter.record("k")
    assert limiter.retry_after("k") == 60


def test_retry_after_counts_down_and_clears_when_the_window_passes():
    clock = Clock()
    limiter = AttemptLimiter(2, 60, clock)
    limiter.record("k")
    clock.now += 10
    limiter.record("k")

    assert limiter.retry_after("k") == 50  # until the oldest attempt ages out
    clock.now += 49
    assert limiter.retry_after("k") == 1
    clock.now += 1
    assert limiter.retry_after("k") == 0  # first attempt expired, one slot is free


def test_keys_are_independent_and_reset_works():
    limiter = AttemptLimiter(1, 60, Clock())
    limiter.record("a")
    assert limiter.retry_after("a") > 0
    assert limiter.retry_after("b") == 0
    limiter.reset("a")
    assert limiter.retry_after("a") == 0


def test_login_limits_track_account_and_ip_separately():
    clock = Clock()
    limits = LoginLimits(AttemptLimiter(2, 60, clock), AttemptLimiter(5, 60, clock))
    for _ in range(2):
        limits.record_failure("1.1.1.1", "A@Example.com")
    assert limits.retry_after("1.1.1.1", "a@example.com") > 0  # email is case-insensitive
    assert limits.retry_after("1.1.1.1", "someone@else.com") == 0
    assert limits.retry_after("2.2.2.2", "a@example.com") == 0  # different client

    for i in range(3):  # spraying many accounts from one IP trips the IP cap
        limits.record_failure("9.9.9.9", f"user{i}@example.com")
    for i in range(2):
        limits.record_failure("9.9.9.9", f"more{i}@example.com")
    assert limits.retry_after("9.9.9.9", "brand-new@example.com") > 0

    limits.record_success("1.1.1.1", "a@example.com")
    assert limits.retry_after("1.1.1.1", "a@example.com") == 0


# ----------------------------------------------------------------- route tests


async def register(client: AsyncClient, name="victim") -> str:
    email = f"{name}@example.com"
    response = await client.post(
        "/api/auth/register", json={"email": email, "username": name, "password": PASSWORD}
    )
    assert response.status_code == 201
    return email


async def bad_login(client: AsyncClient, email: str):
    return await client.post("/api/auth/login", json={"email": email, "password": "wrong-pass-1"})


async def test_login_locks_out_after_repeated_failures(client: AsyncClient):
    email = await register(client)
    limit = get_settings().login_rate_limit_attempts

    for _ in range(limit):
        assert (await bad_login(client, email)).status_code == 401

    blocked = await bad_login(client, email)
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0
    assert "too many" in blocked.json()["detail"].lower()


async def test_lockout_also_blocks_the_correct_password(client: AsyncClient):
    email = await register(client)
    for _ in range(get_settings().login_rate_limit_attempts):
        await bad_login(client, email)

    right = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert right.status_code == 429


async def test_other_accounts_are_unaffected_by_a_lockout(client: AsyncClient):
    victim, other = await register(client, "victim"), await register(client, "bystander")
    for _ in range(get_settings().login_rate_limit_attempts):
        await bad_login(client, victim)

    fine = await client.post("/api/auth/login", json={"email": other, "password": PASSWORD})
    assert fine.status_code == 200


async def test_success_clears_the_failure_count(client: AsyncClient):
    email = await register(client)
    limit = get_settings().login_rate_limit_attempts
    for _ in range(limit - 1):
        await bad_login(client, email)

    ok = await client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert ok.status_code == 200

    # A fresh budget: another limit-1 failures are still tolerated.
    for _ in range(limit - 1):
        assert (await bad_login(client, email)).status_code == 401


async def test_unknown_emails_are_limited_too(client: AsyncClient):
    for _ in range(get_settings().login_rate_limit_attempts):
        assert (await bad_login(client, "ghost@example.com")).status_code == 401
    assert (await bad_login(client, "ghost@example.com")).status_code == 429
