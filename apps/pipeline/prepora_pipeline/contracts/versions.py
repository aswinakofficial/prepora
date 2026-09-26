"""
Version stamps for the pipeline contracts — see docs/roadmap/engineering-roadmap.md item 11.

Every contract record carries three independent version numbers because they change for different
reasons and at different rates:

- CONTRACT_VERSION: the shape of these Pydantic models themselves. Bump this when a field is added,
  removed, or its meaning changes — this is what lets old and new records be told apart when the
  contract itself evolves.
- PIPELINE_VERSION: the version of the pipeline run (stage wiring, ordering, config) that produced
  the record, independent of any single connector's parser.

PARSER_VERSION is deliberately not a single constant here: it belongs to whichever connector's
parser produced an ExtractedQuestion, and different connectors evolve independently. Each connector
is expected to define and pass its own parser_version string (e.g. "ms-learn-v3") when constructing
an ExtractedQuestion; there is no repo-wide "the" parser version.
"""

CONTRACT_VERSION = "4"  # 2: .question_set_title; 3: .media; 4: .identity
PIPELINE_VERSION = "1"
