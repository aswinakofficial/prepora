"""
Per-source duplicate-detection settings: the only place the shared layer is told anything about a
particular source.

A source declares its settings in the `dedupe:` section of its connectors/<source>/source.yaml,
and — for what can't be declared — an optional connectors/<source>/dedupe.py:

    # source.yaml
    dedupe:
      identity: content            # how a question is identified across scrapes (see below)
      near_duplicate_threshold: 0.9

    # dedupe.py
    COMPARISON_CLEANERS = (strip_question_counter,)   # str -> str, applied before scoring

A question is matched to its source by its source_url (the source whose base_url host it's on).
Anything without a match — or without a source_url — uses DEFAULT_PROFILE.

identity: "position" (exam papers: question 7 of the 2025 paper is a fixed thing) or "content"
(pools that serve questions in random order, like MS Learn practice assessments). See
stages/stable_id.py.

comparison cleaners strip text a source adds around the real question — counters, fixed
instructions — so it doesn't skew similarity. They only ever affect scoring: stored text and
content hashes always use plain normalize_question_text(), so a profile change can't orphan
existing questions.
"""
import importlib.util
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from ..contracts import NormalizedQuestion
from ..core.registry import CONNECTORS_DIR, load_source_yaml_files
from .normalize import normalize_question_text

Identity = Literal["position", "content"]


@dataclass(frozen=True)
class DedupeProfile:
    name: str = "default"
    identity: Identity = "position"
    # At or above this wording similarity (after cleaners), a question is held as a possible
    # duplicate for a person to decide — never merged automatically.
    near_duplicate_threshold: float = 0.9
    comparison_cleaners: tuple[Callable[[str], str], ...] = ()

    def comparison_text(self, text: str) -> str:
        for clean in self.comparison_cleaners:
            text = clean(text)
        return normalize_question_text(text)


DEFAULT_PROFILE = DedupeProfile()


def _load_hook(source_dir: Path):
    hook = source_dir / "dedupe.py"
    if not hook.exists():
        return None
    spec = importlib.util.spec_from_file_location(
        f"prepora_pipeline.connectors.{source_dir.name.replace('-', '_')}.dedupe_profile", hook
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_profile(definition: dict, source_dir: Path | None = None) -> DedupeProfile:
    """A profile from one source.yaml definition (and its dedupe.py, if any)."""
    settings = definition.get("dedupe") or {}
    unknown = set(settings) - {"identity", "near_duplicate_threshold"}
    if unknown:
        raise ValueError(f"{definition['name']}: unknown dedupe settings {sorted(unknown)}")
    identity = settings.get("identity", DEFAULT_PROFILE.identity)
    if identity not in ("position", "content"):
        raise ValueError(f"{definition['name']}: dedupe.identity must be position or content")
    threshold = float(
        settings.get("near_duplicate_threshold", DEFAULT_PROFILE.near_duplicate_threshold)
    )
    if not 0.5 <= threshold <= 1:
        raise ValueError(f"{definition['name']}: near_duplicate_threshold must be 0.5–1")
    hook = _load_hook(source_dir) if source_dir else None
    return DedupeProfile(
        name=definition["name"],
        identity=identity,
        near_duplicate_threshold=threshold,
        comparison_cleaners=tuple(getattr(hook, "COMPARISON_CLEANERS", ())),
    )


@lru_cache(maxsize=1)
def _profiles_by_host() -> dict[str, DedupeProfile]:
    by_host = {}
    for definition in load_source_yaml_files(CONNECTORS_DIR):
        host = urlparse(definition["base_url"]).hostname
        if host:
            source_dir = CONNECTORS_DIR / definition["name"]
            by_host[host.lower()] = build_profile(definition, source_dir)
    return by_host


def profile_for_url(url: str | None) -> DedupeProfile:
    host = (urlparse(url).hostname or "").lower() if url else ""
    if not host:
        return DEFAULT_PROFILE
    profiles = _profiles_by_host()
    # The source's own host or a subdomain of it (www.examtopics.com for examtopics.com).
    for source_host, profile in profiles.items():
        bare = source_host.removeprefix("www.")
        if host == source_host or host == bare or host.endswith(f".{bare}"):
            return profile
    return DEFAULT_PROFILE


def profile_for(question: NormalizedQuestion) -> DedupeProfile:
    return profile_for_url(question.source_url)


def effective_identity(question: NormalizedQuestion) -> Identity:
    """The question's own identity when its producer set one, otherwise its source's."""
    return question.identity or profile_for(question).identity
