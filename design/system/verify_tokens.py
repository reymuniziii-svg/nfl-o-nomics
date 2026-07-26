#!/usr/bin/env python3
"""
tokens.css <-> tokens.json mirror check.

SPEC.md §4: "Design tokens arrive as --yy-* CSS custom properties plus a JSON
mirror of the same values ... A build step asserts the two are in sync."
This is that build step.

    python3 design/system/verify_tokens.py            # assert (exit 1 on drift)
    python3 design/system/verify_tokens.py --write    # regenerate tokens.json

The JSON is generated FROM the CSS, so identity is structural, not clerical.
Every declaration in tokens.css appears in tokens.json with a byte-identical
value string; every entry in tokens.json comes from a declaration in tokens.css.

Scopes map 1:1 onto the CSS blocks:
    base            :root
    light           [data-theme="light"]
    light-auto      @media (prefers-color-scheme: light) :root:not(...)
    desktop         @media (min-width: 1024px) :root
    reduced-motion  @media (prefers-reduced-motion: reduce) :root
    export          .yy-export
    export-light    [data-theme="light"] .yy-export
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSS = HERE / "tokens.css"
JSON_PATH = HERE / "tokens.json"

DECL = re.compile(r"(--yy-[a-z0-9-]+)\s*:\s*([^;]+);")

# At-rules are resolved first, then plain selectors. Order matters within each.
AT_RULE_SCOPES = [
    ("light-auto", "prefers-color-scheme: light"),
    ("desktop", "min-width: 1024px"),
    ("reduced-motion", "prefers-reduced-motion: reduce"),
]
SELECTOR_SCOPES = [
    ("export-light", '[data-theme="light"] .yy-export'),
    ("export", ".yy-export"),
    ("light", '[data-theme="light"]'),
    ("base", ":root"),
]


def strip_comments(text: str) -> str:
    return re.sub(r"/\*.*?\*/", "", text, flags=re.S)


def parse_css(text: str) -> dict[str, dict[str, str]]:
    """Walk the file, tracking which block each declaration sits in."""
    text = strip_comments(text)
    out: dict[str, dict[str, str]] = {}
    scope_stack: list[str] = []
    buf = ""
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "{":
            head = buf.strip()
            scope_stack.append(head)
            buf = ""
        elif ch == "}":
            if scope_stack:
                scope_stack.pop()
            buf = ""
        else:
            buf += ch
            if ch == ";" and scope_stack:
                m = DECL.search(buf)
                if m:
                    name, value = m.group(1), " ".join(m.group(2).split())
                    at_rules = [s for s in scope_stack if s.startswith("@")]
                    selector = scope_stack[-1]
                    scope = None
                    joined_at = " ".join(at_rules)
                    for label, sig in AT_RULE_SCOPES:
                        if sig in joined_at:
                            scope = label
                            break
                    if scope is None:
                        for label, sig in SELECTOR_SCOPES:
                            if selector.startswith(sig):
                                scope = label
                                break
                    if scope is None:
                        raise SystemExit(
                            f"unmapped scope for {name}: at={joined_at!r} sel={selector!r}"
                        )
                    out.setdefault(scope, {})[name] = value
                buf = ""
        i += 1
    return out


def build(scopes: dict[str, dict[str, str]]) -> dict:
    base = scopes.get("base", {})
    return {
        "$comment": (
            "Generated from design/system/tokens.css by design/system/verify_tokens.py. "
            "Do not hand-edit. Values are byte-identical to the CSS declarations."
        ),
        "name": "YIELD/YARD design tokens",
        "version": "0.2.0",
        "phase": "B",
        "contract": "extend-never-rename (SPEC.md §4)",
        "defaultTheme": "dark",
        "counts": {
            scope: len(vals) for scope, vals in sorted(scopes.items())
        },
        "uniqueTokenNames": len({n for vals in scopes.values() for n in vals}),
        "baseTokenCount": len(base),
        "scopes": {
            "base": ":root",
            "light": '[data-theme="light"]',
            "light-auto": '@media (prefers-color-scheme: light) :root:not([data-theme])',
            "desktop": "@media (min-width: 1024px) :root",
            "reduced-motion": "@media (prefers-reduced-motion: reduce) :root",
            "export": ".yy-export",
            "export-light": '[data-theme="light"] .yy-export',
        },
        "tokens": {scope: dict(sorted(vals.items())) for scope, vals in sorted(scopes.items())},
    }


def main() -> int:
    scopes = parse_css(CSS.read_text())
    doc = build(scopes)

    # invariant: light and light-auto must agree exactly
    a, b = scopes.get("light", {}), scopes.get("light-auto", {})
    if a != b:
        diff = set(a.items()) ^ set(b.items())
        print("FAIL: [data-theme=light] and the prefers-color-scheme block diverge")
        for k, v in sorted(diff):
            print(f"  {k}: {v}")
        return 1

    if "--write" in sys.argv:
        JSON_PATH.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {JSON_PATH} — {doc['uniqueTokenNames']} unique token names, "
              f"{sum(doc['counts'].values())} declarations across {len(doc['counts'])} scopes")
        return 0

    if not JSON_PATH.exists():
        print("FAIL: tokens.json missing. Run with --write.")
        return 1
    on_disk = json.loads(JSON_PATH.read_text())
    if on_disk.get("tokens") != doc["tokens"]:
        print("FAIL: tokens.json is not a mirror of tokens.css.")
        for scope in sorted(set(doc["tokens"]) | set(on_disk.get("tokens", {}))):
            want = doc["tokens"].get(scope, {})
            have = on_disk.get("tokens", {}).get(scope, {})
            for k in sorted(set(want) | set(have)):
                if want.get(k) != have.get(k):
                    print(f"  [{scope}] {k}: css={want.get(k)!r} json={have.get(k)!r}")
        return 1
    print(f"OK: tokens.css == tokens.json "
          f"({doc['uniqueTokenNames']} unique token names, "
          f"{sum(doc['counts'].values())} declarations)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
