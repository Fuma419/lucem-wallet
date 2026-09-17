#!/usr/bin/env python3
"""Fail if Gradle unit tests produced no JUnit reports or zero tests."""
from typing import Optional

import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def summarize(result_dir: Path) -> Optional[dict]:
    files = sorted(result_dir.glob("TEST-*.xml"))
    if not files:
        return None
    tests = failures = errors = skipped = 0
    for path in files:
        root = ET.parse(path).getroot()
        tests += int(root.attrib.get("tests") or 0)
        failures += int(root.attrib.get("failures") or 0)
        errors += int(root.attrib.get("errors") or 0)
        skipped += int(root.attrib.get("skipped") or 0)
    return {
        "files": len(files),
        "tests": tests,
        "failures": failures,
        "errors": errors,
        "skipped": skipped,
    }


def main(argv):
    result_dir = Path(
        argv[1]
        if len(argv) > 1
        else "app/build/test-results/testDebugUnitTest"
    )
    summary = summarize(result_dir)
    if summary is None:
        print(f"error: no JUnit XML in {result_dir}", file=sys.stderr)
        return 1
    print(
        "Mobile Android unit tests: "
        f"{summary['tests']} tests, {summary['failures']} failures, "
        f"{summary['errors']} errors ({summary['files']} reports)"
    )
    if summary["tests"] < 1:
        print("error: gradle unit tests ran 0 tests", file=sys.stderr)
        return 1
    if summary["failures"] or summary["errors"]:
        print("error: gradle unit tests reported failures or errors", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
