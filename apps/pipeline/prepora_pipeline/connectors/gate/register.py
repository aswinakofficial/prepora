"""Registers GATE in the catalog — publishing never invents an organization or an exam (see
stages/publish.py), so the importer does it, idempotently."""


def ensure_gate_registered(cur) -> None:
    cur.execute(
        "INSERT INTO organizations (name, slug, jurisdiction, official_url) "
        "VALUES (%s, %s, %s, %s) ON CONFLICT (slug) DO NOTHING",
        ("GATE (IISc and the IITs)", "ncb-gate", "IN", "https://gate2026.iitg.ac.in"),
    )
    cur.execute(
        "INSERT INTO exam_types (slug, label) VALUES (%s, %s) ON CONFLICT (slug) DO NOTHING",
        ("competitive", "Competitive"),
    )
    cur.execute(
        "INSERT INTO exams (name, slug, organization_id, exam_type_id, official_url, status) "
        "SELECT %s, %s, o.id, t.id, %s, 'published' FROM organizations o, exam_types t "
        "WHERE o.slug = 'ncb-gate' AND t.slug = 'competitive' ON CONFLICT (slug) DO NOTHING",
        ("GATE", "gate", "https://gate2026.iitg.ac.in"),
    )
