"""Meta neuro-symbolic agent tests (offline; the Meta Model API client is faked)."""

import pytest
from fastapi.testclient import TestClient

import app.meta_agent as meta_agent
from app.main import app

client = TestClient(app)


class _FakeMessage:
    def __init__(self, content: str):
        self.content = content


class _FakeChoice:
    def __init__(self, content: str):
        self.message = _FakeMessage(content)


class _FakeCompletion:
    def __init__(self, content: str):
        self.choices = [_FakeChoice(content)]


class _FakeCompletions:
    def __init__(self, recorder: dict, content: str):
        self._recorder = recorder
        self._content = content

    def create(self, *, model: str, messages: list):
        self._recorder["model"] = model
        self._recorder["messages"] = messages
        return _FakeCompletion(self._content)


class _FakeChat:
    def __init__(self, recorder: dict, content: str):
        self.completions = _FakeCompletions(recorder, content)


class FakeMetaClient:
    """Minimal stand-in for the OpenAI-compatible Meta Model API client."""

    def __init__(self, recorder: dict, content: str = "AGENT DIRECTIVE: hold and monitor."):
        self.chat = _FakeChat(recorder, content)


@pytest.fixture
def clean_meta_env(monkeypatch):
    """Hermetic model selection regardless of developer machine env vars."""
    for var in ("META_SPARK_MODEL", "META_WONDER_MODEL", "META_BASE_URL"):
        monkeypatch.delenv(var, raising=False)
    return monkeypatch


def test_agent_fast_mode_uses_spark_and_grounds_prompt(clean_meta_env):
    """Fast mode targets Muse Spark and grounds the prompt in V&V proof state."""
    recorder: dict = {}
    result = meta_agent.run_neuro_symbolic_agent(
        "CDM TEST-001: AEGIS-1 vs DEB-2024-981A, TCA 40s, miss 200m",
        {},
        mode="fast",
        client=FakeMetaClient(recorder, content="SPARK DIRECTIVE: execute ranked maneuver."),
    )

    assert recorder["model"] == "muse-spark-1.3"
    roles = [m["role"] for m in recorder["messages"]]
    assert roles[0] == "system"
    assert "NEVER hallucinate physics" in recorder["messages"][0]["content"]

    user_prompt = recorder["messages"][1]["content"]
    assert "CDM TEST-001" in user_prompt
    assert "HJI Certified: True" in user_prompt
    assert "CBF Forward Invariant: True" in user_prompt
    assert "EPG Reasoning State:" in user_prompt

    # Deterministic oracle ran first and is returned alongside the directive.
    assert result["model"] == "muse-spark-1.3"
    assert result["mode"] == "fast"
    assert result["agent_directive"] == "SPARK DIRECTIVE: execute ranked maneuver."
    assert result["vv_proof"]["verdict"]["status"] == "EXECUTE"
    assert result["vv_proof"]["hj"]["maneuver_certified"] is True
    assert result["epg"]["reasoning_state"]["verdict"] == "ACCEPTED"


def test_agent_deep_mode_uses_wonder(clean_meta_env):
    """Deep mode targets Muse Wonder for constellation-scale planning."""
    recorder: dict = {}
    result = meta_agent.run_neuro_symbolic_agent(
        "CDM STORM: 3 cascading conjunctions across AEGIS-1/2/3",
        {"tca_s": 60.0},
        mode="deep",
        client=FakeMetaClient(recorder, content="WONDER DIRECTIVE: phased plan."),
    )

    assert recorder["model"] == "muse-wonder-1.0"
    assert result["model"] == "muse-wonder-1.0"
    assert result["mode"] == "deep"
    assert result["agent_directive"] == "WONDER DIRECTIVE: phased plan."
    assert "vv_proof" in result
    assert "epg" in result


def test_agent_invalid_mode_raises(clean_meta_env):
    """Unknown modes fail fast before any oracle or model call."""
    recorder: dict = {}
    with pytest.raises(ValueError, match="unknown mode"):
        meta_agent.run_neuro_symbolic_agent(
            "CDM TEST-001", {}, mode="turbo", client=FakeMetaClient(recorder)
        )
    assert recorder == {}


def test_agent_missing_key_raises_not_configured(monkeypatch):
    """Live mode without META_API_KEY reports not-configured instead of failing obscurely."""
    monkeypatch.delenv("META_API_KEY", raising=False)
    with pytest.raises(meta_agent.MetaAgentNotConfigured):
        meta_agent.run_neuro_symbolic_agent("CDM TEST-001", {}, mode="fast", client=None)


def test_agent_endpoint_returns_grounded_directive(monkeypatch):
    """POST /api/agent/run returns the model directive with V&V proof attached."""
    canned = {
        "model": "muse-spark-1.3",
        "mode": "fast",
        "agent_directive": "CANNED DIRECTIVE",
        "vv_proof": {"verdict": {"status": "EXECUTE"}},
        "epg": {"reasoning_state": {"verdict": "ACCEPTED"}},
    }

    def fake_run(cdm_summary, telemetry_params, mode="fast", client=None):
        assert mode == "fast"
        assert "CDM" in cdm_summary
        return canned

    monkeypatch.setattr("app.main.run_neuro_symbolic_agent", fake_run)
    resp = client.post(
        "/api/agent/run",
        json={"cdm_summary": "CDM TEST-001", "telemetry_params": {}, "mode": "fast"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent_directive"] == "CANNED DIRECTIVE"
    assert data["vv_proof"]["verdict"]["status"] == "EXECUTE"


def test_agent_endpoint_invalid_mode_returns_400(monkeypatch):
    """Endpoint maps unknown modes to 400."""

    def fake_run(cdm_summary, telemetry_params, mode="fast", client=None):
        raise ValueError("unknown mode 'turbo'")

    monkeypatch.setattr("app.main.run_neuro_symbolic_agent", fake_run)
    resp = client.post(
        "/api/agent/run", json={"cdm_summary": "CDM TEST-001", "mode": "turbo"}
    )
    assert resp.status_code == 400


def test_agent_endpoint_not_configured_returns_503(monkeypatch):
    """Endpoint maps missing key/package to 503 (honest degraded state)."""

    def fake_run(cdm_summary, telemetry_params, mode="fast", client=None):
        raise meta_agent.MetaAgentNotConfigured("META_API_KEY is not set")

    monkeypatch.setattr("app.main.run_neuro_symbolic_agent", fake_run)
    resp = client.post(
        "/api/agent/run", json={"cdm_summary": "CDM TEST-001", "mode": "fast"}
    )
    assert resp.status_code == 503


def test_flight_director_offline_fallback(monkeypatch):
    """Without a key, the flight director returns an honest offline directive."""
    monkeypatch.delenv("META_API_KEY", raising=False)
    result = meta_agent.run_flight_director("CDM TEST-001: fallback check", {}, mode="fast")
    assert result["source"] == "offline-fallback"
    assert "OFFLINE DIRECTIVE" in result["agent_directive"]
    assert result["vv_proof"]["verdict"]["status"] == "EXECUTE"
    assert result["epg"]["reasoning_state"]["verdict"] == "ACCEPTED"


def test_flight_director_invalid_mode_still_raises(monkeypatch):
    """Unknown modes raise before any fallback is attempted."""
    monkeypatch.delenv("META_API_KEY", raising=False)
    with pytest.raises(ValueError, match="unknown mode"):
        meta_agent.run_flight_director("CDM TEST-001", {}, mode="turbo")


def test_vision_segment_deterministic_offline():
    """The SAM stub is deterministic: identical prompts -> identical segments."""
    first = meta_agent.run_vision_segment(["spacecraft body", "debris fragment"])
    second = meta_agent.run_vision_segment(["spacecraft body", "debris fragment"])
    assert first == second
    assert first["provider"] == "sam31-offline-simulated"
    assert [s["prompt"] for s in first["segments"]] == ["spacecraft body", "debris fragment"]
    assert all(len(s["bbox_norm"]) == 4 for s in first["segments"])


def test_meta_flight_director_endpoint(monkeypatch):
    """POST /api/meta/flight-director returns directive + proof payload."""
    canned = {
        "model": "muse-wonder-1.0",
        "mode": "deep",
        "source": "muse-wonder-1.0",
        "agent_directive": "META DIRECTIVE",
        "vv_proof": {"verdict": {"status": "EXECUTE"}},
        "epg": {"reasoning_state": {"verdict": "ACCEPTED"}},
    }

    def fake_director(cdm_summary, telemetry_params, mode="deep"):
        assert mode == "deep"
        return canned

    monkeypatch.setattr("app.main.run_flight_director", fake_director)
    resp = client.post(
        "/api/meta/flight-director",
        json={"cdm_summary": "CDM TEST-001", "telemetry_params": {}, "mode": "deep"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["agent_directive"] == "META DIRECTIVE"
    assert data["source"] == "muse-wonder-1.0"


def test_meta_vision_segment_endpoint():
    """POST /api/meta/vision-segment serves the offline provider."""
    resp = client.post(
        "/api/meta/vision-segment",
        json={"prompts": ["solar array"], "frame_ref": "frame-001"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] == "sam31-offline-simulated"
    assert data["segments"][0]["prompt"] == "solar array"
    assert data["frame_ref"] == "frame-001"
