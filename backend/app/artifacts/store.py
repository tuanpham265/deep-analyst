from dataclasses import dataclass, field


@dataclass
class Artifact:
    name: str
    mime: str
    content: str  # text artifacts only for the demo (markdown reports)


@dataclass
class ArtifactStore:
    """Per-run, in-memory artifact registry."""

    _by_run: dict[str, dict[str, Artifact]] = field(default_factory=dict)

    def put(self, run_id: str, artifact: Artifact) -> None:
        self._by_run.setdefault(run_id, {})[artifact.name] = artifact

    def get(self, run_id: str, name: str) -> Artifact | None:
        return self._by_run.get(run_id, {}).get(name)

    def list(self, run_id: str) -> list[Artifact]:
        return list(self._by_run.get(run_id, {}).values())

    def drop(self, run_id: str) -> None:
        self._by_run.pop(run_id, None)


artifacts = ArtifactStore()
