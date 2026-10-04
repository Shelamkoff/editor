"""Regressions for Markdown parsing, not network or framework verification."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from validate_bundle import SKILLS, relative_links, validate_links


class MarkdownLinkTests(unittest.TestCase):
    def test_inline_code_is_not_a_link(self):
        self.assertEqual(['present.md'], relative_links(
            '`[example](not-a-link.md)` and [real](present.md)'))

    def test_nested_list_links_are_checked(self):
        self.assertEqual(['missing.md'], relative_links(
            '- Parent\n    - [Nested](missing.md)\n'))

    def test_fence_with_trailing_text_does_not_close(self):
        self.assertEqual(['real.md'], relative_links(
            '```md\n```not-a-close\n[hidden](absent.md)\n```\n[real](real.md)'))

    def test_comments_do_not_contain_rendered_links(self):
        self.assertEqual(['real.md'], relative_links(
            '<!-- [ignored](missing.md) -->\n\n[real](real.md)'))

    def test_reference_links_and_images(self):
        self.assertEqual(['reference.md', 'image.png'], relative_links(
            '[guide][source]\n\n![diagram](image.png)\n\n[source]: reference.md "Guide"'))

    def test_balanced_parentheses_and_space_destination(self):
        self.assertEqual(['notes/a(b).md', 'notes/a b.md'], relative_links(
            '[one](notes/a(b).md) [two](<notes/a b.md>)'))

    def test_yaml_is_not_markdown_body(self):
        self.assertEqual(['real.md'], relative_links(
            '---\ndescription: "[example](missing.md)"\n---\n[real](real.md)'))

    def test_utf8_filename_and_broken_link(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'правила.md').write_text('# Правила\n', encoding='utf-8')
            path = root / 'SKILL.md'
            path.write_text('[да](правила.md) [нет](отсутствует.md)', encoding='utf-8')
            self.assertEqual(['missing relative target: отсутствует.md'], validate_links(path))

    def test_cli_reports_nested_broken_reference_and_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in SKILLS:
                skill = root / name
                skill.mkdir()
                (skill / 'SKILL.md').write_text(
                    f'---\nname: {name}\ndescription: Test fixture\n---\n# Test\n',
                    encoding='utf-8',
                )
            refs = root / 'vue3-app' / 'references'
            refs.mkdir()
            doc = refs / 'sample.md'
            doc.write_text('- Parent\n    - [Missing](missing.md)\n', encoding='utf-8')
            command = [sys.executable, str(Path(__file__).with_name('validate_bundle.py')), str(root)]
            failed = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(1, failed.returncode)
            self.assertIn('missing relative target: missing.md', failed.stderr)
            (refs / 'missing.md').write_text('# Present\n', encoding='utf-8')
            passed = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(0, passed.returncode, passed.stderr)


if __name__ == '__main__':
    unittest.main()
