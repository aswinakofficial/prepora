"""
The GATE papers this connector imports — a hand-written map, because GATE's file naming changes
from year to year too irregularly to guess (docs/sources/gate.md §3). Every URL was checked live on
2026-10-02. The pilot is CS-1 and CS-2 for 2025 and 2026 (docs/specs/05-gate-pilot.md).
"""
from dataclasses import dataclass

BASE_URL = "https://gate2026.iitg.ac.in/doc/download"


@dataclass(frozen=True)
class PaperSpec:
    year: int
    paper: str  # the paper code without its sitting: "CS"
    sitting: str  # "CS-1"
    qp_url: str
    key_url: str


PAPERS: list[PaperSpec] = [
    PaperSpec(
        2026, "CS", "CS-1", f"{BASE_URL}/2026/QPs/CS1.pdf", f"{BASE_URL}/2026/Keys/CS1_Keys.pdf"
    ),
    PaperSpec(
        2026, "CS", "CS-2", f"{BASE_URL}/2026/QPs/CS2.pdf", f"{BASE_URL}/2026/Keys/CS2_Keys.pdf"
    ),
    PaperSpec(
        2025, "CS", "CS-1", f"{BASE_URL}/2025/CS12025.pdf", f"{BASE_URL}/2025_Key/CS1_Keys.pdf"
    ),
    PaperSpec(
        2025, "CS", "CS-2", f"{BASE_URL}/2025/CS22025.pdf", f"{BASE_URL}/2025_Key/CS2_Keys.pdf"
    ),
]


def find_papers(year: int | None = None, sitting: str | None = None) -> list[PaperSpec]:
    return [
        p
        for p in PAPERS
        if (year is None or p.year == year) and (sitting is None or p.sitting == sitting)
    ]
