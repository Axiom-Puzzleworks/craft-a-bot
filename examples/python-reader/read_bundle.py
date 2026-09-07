#!/usr/bin/env python3
"""Read a Craft A Bot trace bundle with nothing from the Craft A Bot repo.

The proof behind ``41-TARGET-DESIGN-V4.md`` §6.16 (WP73, ``62-THE-TAIL.md``
§4.4): every artefact that crosses a boundary has a generated JSON Schema in
``docs/schemas/``, and a reader in another language stands on that schema and
the file alone. This script

1. validates a ``craftabot-bundle`` file against the committed schema with
   ``jsonschema`` (Draft 2020-12);
2. recomputes every digest the bundle carries — each run's ``traceDigest``,
   the group's ``groupDigest`` when a group is present, and the
   ``bundleDigest`` over all of them — and compares;
3. prints one line per run and a verdict.

The digests are SHA-256 over ``JSON.stringify`` of the events as stored: key
order kept, no whitespace, non-ASCII unescaped. ``json.dumps`` with
``separators=(",", ":")`` and ``ensure_ascii=False`` writes the same bytes for
everything a trace contains — the one caveat is a float JavaScript prints in
exponent form (``1e21`` and beyond, or below ``1e-7``); none occurs in the
corpus, and a mismatch names the run.

Usage::

    python3 read_bundle.py <bundle.json> [--schema <craftabot-bundle.schema.json>]

Exit status 0 when the bundle is valid and every digest matches; 1 otherwise.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

try:
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover - the runner installs it
    sys.stderr.write("jsonschema is not installed: pip install -r requirements.txt\n")
    sys.exit(2)

HERE = Path(__file__).resolve().parent
DEFAULT_SCHEMA = HERE.parent.parent / "docs" / "schemas" / "craftabot-bundle.schema.json"


def stringify(value: Any) -> bytes:
    """The bytes ``JSON.stringify`` writes for ``value``."""
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def trace_digest(events: list[Any]) -> str:
    """``computeTraceDigest``: SHA-256 of the ordered event array."""
    return sha256_hex(stringify(events))


def bundle_digest(run_digests: list[str], group_digest: str | None, evaluation_ids: list[str]) -> str:
    """``computeBundleDigest``: SHA-256 over ``[...runDigests, groupDigest ?? null, ...evaluationIds]``."""
    return sha256_hex(stringify([*run_digests, group_digest, *evaluation_ids]))


def validate(bundle: Any, schema_path: Path) -> list[str]:
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)
    return [
        f"{'/'.join(str(part) for part in error.absolute_path) or '<root>'}: {error.message}"
        for error in sorted(validator.iter_errors(bundle), key=lambda e: list(e.absolute_path))
    ]


def verify(bundle: dict[str, Any]) -> list[str]:
    """Every level recomputed, as ``verifyBundleDigest`` does; the mismatches, if any."""
    problems: list[str] = []
    run_digests: list[str] = []
    for trace in bundle["runs"]:
        expected = trace_digest(trace["events"])
        run_digests.append(trace["traceDigest"])
        if expected != trace["traceDigest"]:
            problems.append(f"run {trace['run']['id']}: traceDigest {trace['traceDigest'][:12]}… ≠ recomputed {expected[:12]}…")
    group = bundle.get("group")
    group_digest = None
    if group is not None:
        group_digest = group["groupDigest"]
        expected = trace_digest(group["events"])
        if expected != group_digest:
            problems.append(f"group: groupDigest {group_digest[:12]}… ≠ recomputed {expected[:12]}…")
    expected = bundle_digest(run_digests, group_digest, [record["id"] for record in bundle.get("evaluations", [])])
    if expected != bundle["bundleDigest"]:
        problems.append(f"bundleDigest {bundle['bundleDigest'][:12]}… ≠ recomputed {expected[:12]}…")
    return problems


def describe(trace: dict[str, Any]) -> str:
    run = trace["run"]
    events = trace["events"]
    ticks = max((event.get("tick", 0) for event in events), default=0)
    finished = next((e for e in reversed(events) if e.get("type") == "run.finished"), None)
    outcome = (finished or {}).get("payload", {}).get("outcome", run.get("outcome", "?"))
    return f"  run {run['id']}  card {run.get('goalCardId', '?')}  outcome {outcome}  {len(events)} events over {ticks} ticks"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA)
    args = parser.parse_args(argv)

    bundle = json.loads(args.bundle.read_text(encoding="utf-8"))
    errors = validate(bundle, args.schema)
    if errors:
        print(f"✗ {args.bundle.name} does not validate against {args.schema.name}:")
        for error in errors[:10]:
            print(f"  {error}")
        return 1
    print(f"✓ {args.bundle.name} validates against {args.schema.name} (format {bundle['format']} v{bundle['formatVersion']})")
    for trace in bundle["runs"]:
        print(describe(trace))
    if bundle.get("group"):
        print(f"  group {bundle['group']['record'].get('id', '?')}  {len(bundle['group']['events'])} events")
    print(f"  {len(bundle.get('evaluations', []))} evaluation record(s)")

    problems = verify(bundle)
    if problems:
        print("✗ digests do not match:")
        for problem in problems:
            print(f"  {problem}")
        return 1
    print(f"✓ every digest recomputed and matched — bundleDigest {bundle['bundleDigest'][:12]}…")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
