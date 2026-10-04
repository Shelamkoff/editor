#!/usr/bin/env python3
"""Validate five Vue skill entrypoints and Markdown-relative file links.

Requires Python 3.10+ and the packages in requirements.txt beside this script.
Frontmatter uses a strict portable profile. CommonMark links/images are parsed;
external URLs, fragments, raw HTML links and framework compatibility are not tested.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

try:
    import yaml
    from markdown_it import MarkdownIt
    from markdown_it.token import Token
except ImportError as error:
    requirements = Path(__file__).with_name("requirements.txt")
    raise SystemExit(f"Install checker dependencies: python3 -m pip install -r {requirements}") from error

SKILLS = (
    "vue3-app", "vue-best-practices", "vue-pinia-best-practices",
    "vue-router-best-practices", "create-adaptable-composable",
)
FIELDS = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}


class UniqueLoader(yaml.SafeLoader):
    """Reject duplicate YAML keys instead of silently keeping the last one."""


def unique_mapping(loader: UniqueLoader, node: yaml.MappingNode, deep: bool = False) -> dict:
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, str):
            raise ValueError("YAML mapping keys must be strings")
        if key in result:
            raise ValueError(f"duplicate YAML key: {key}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def validate_frontmatter(text: str, directory_name: str) -> list[str]:
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        return ["missing opening YAML frontmatter delimiter"]
    try:
        end = lines.index("---", 1)
    except ValueError:
        return ["missing closing YAML frontmatter delimiter"]
    try:
        data = yaml.load("\n".join(lines[1:end]), Loader=UniqueLoader)
    except (yaml.YAMLError, ValueError, RecursionError) as error:
        return [f"invalid frontmatter: {error}"]
    if not isinstance(data, dict):
        return ["frontmatter must be a mapping"]
    errors = []
    extra = set(data) - FIELDS
    if extra:
        errors.append("unsupported top-level fields: " + ", ".join(sorted(extra)))
    name = data.get("name")
    if (not isinstance(name, str) or not 1 <= len(name) <= 64
            or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name)):
        errors.append("name must be 1-64 lowercase letters/digits with single internal hyphens")
    elif name != directory_name:
        errors.append("name must match the parent directory")
    for field, limit in (("description", 1024), ("compatibility", 500)):
        if field == "compatibility" and field not in data:
            continue
        value = data.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            errors.append(f"{field} must be a non-empty string of at most {limit} characters")
    for field in ("license", "allowed-tools"):
        if field in data and (not isinstance(data[field], str) or not data[field].strip()):
            errors.append(f"{field} must be a non-empty string")
    if "metadata" in data:
        metadata = data["metadata"]
        if not isinstance(metadata, dict) or any(
            not isinstance(key, str) or not isinstance(value, str)
            for key, value in metadata.items()
        ):
            errors.append("metadata must map string keys to string values")
    if not "\n".join(lines[end + 1:]).strip():
        errors.append("Markdown body must not be empty")
    return errors


def relative_links(text: str) -> list[str]:
    """Extract CommonMark link/image paths; code, comments and YAML are not prose.

    Markdown parsing is delegated to markdown-it-py, including reference links,
    nested list indentation, escaped destinations and fence matching. Raw HTML,
    external URL availability and fragment existence remain outside this check.
    """
    lines = text.splitlines()
    if lines and lines[0] == "---":
        try:
            end = lines.index("---", 1)
        except ValueError:
            return []  # The entrypoint frontmatter validator reports this error.
        text = "\n".join(lines[end + 1:])

    def walk(tokens: list[Token]):
        for token in tokens:
            yield token
            if token.children:
                yield from walk(token.children)

    result = []
    for token in walk(MarkdownIt("commonmark").parse(text)):
        attribute = "href" if token.type == "link_open" else "src" if token.type == "image" else None
        if attribute is None:
            continue
        value = token.attrGet(attribute)
        if not value:
            continue
        parsed = urlsplit(value)
        if parsed.scheme or parsed.netloc or value.startswith(("/", "#")):
            continue
        if parsed.path:
            result.append(unquote(parsed.path))
    return result


def validate_links(path: Path) -> list[str]:
    return [f"missing relative target: {target}" for target in relative_links(path.read_text(encoding="utf-8"))
            if not (path.parent / target).exists()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("skills_root", type=Path)
    parser.add_argument("--frontmatter-only", action="store_true",
                        help="skip link checks (for explicitly partial/offline snapshots)")
    args = parser.parse_args()
    failures = []
    checked = 0
    for name in SKILLS:
        entry = args.skills_root / name / "SKILL.md"
        if not entry.is_file():
            failures.append(f"{entry}: missing skill entrypoint")
            continue
        try:
            failures.extend(f"{entry}: {message}"
                            for message in validate_frontmatter(entry.read_text(encoding="utf-8"), name))
            checked += 1
            if not args.frontmatter_only:
                for doc in sorted(entry.parent.rglob("*.md")):
                    failures.extend(f"{doc}: {message}" for message in validate_links(doc))
        except (OSError, UnicodeError, ValueError) as error:
            failures.append(f"{entry}: cannot validate: {error}")
    for failure in failures:
        print(failure, file=sys.stderr)
    scope = "frontmatter only" if args.frontmatter_only else "frontmatter and relative links"
    print(f"Checked {checked} Vue skill entrypoints ({scope}); {len(failures)} errors")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
