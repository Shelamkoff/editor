"""Regression tests for portable skill metadata and ordinary relative links."""
import tempfile
import unittest
from pathlib import Path

from validate_bundle import relative_links, validate_frontmatter, validate_links


class FrontmatterTests(unittest.TestCase):
    def check(self, header, name="example"):
        return validate_frontmatter(f"---\n{header}\n---\n# Example\n", name)

    def test_minimal_valid(self):
        self.assertEqual([], self.check("name: example\ndescription: Useful instructions"))

    def test_folded_description_and_local_metadata(self):
        self.assertEqual([], self.check('name: example\ndescription: >-\n  Work on Vue\n  when needed\nmetadata:\n  version: "2.0.1-ecom.1"\n  upstream-version: "1.0.0"'))

    def test_reject_legacy_top_level_author_and_version(self):
        errors = self.check('name: example\ndescription: Guide\nauthor: upstream\nversion: 1.1.0')
        self.assertIn("unsupported top-level fields: author, version", errors)

    def test_metadata_values_must_be_strings(self):
        self.assertTrue(self.check('name: example\ndescription: Guide\nmetadata:\n  version: 2'))
        self.assertTrue(self.check('name: example\ndescription: Guide\nmetadata: []'))

    def test_duplicate_keys_rejected(self):
        self.assertTrue(self.check('name: example\ndescription: first\ndescription: second'))
        self.assertTrue(self.check('name: example\ndescription: Guide\nmetadata:\n  version: "1"\n  version: "2"'))

    def test_name_constraints(self):
        for name in ("Example", "-example", "example-", "ex--ample", "x" * 65, "ex_ample"):
            with self.subTest(name=name):
                self.assertTrue(self.check(f'name: {name}\ndescription: Guide', name))
        self.assertTrue(self.check('name: another\ndescription: Guide'))

    def test_missing_empty_or_wrong_description(self):
        for desc in ('', 'description: ""', 'description: 12', 'description: []'):
            self.assertTrue(self.check('name: example\n' + desc))
        self.assertTrue(self.check('name: example\ndescription: ' + 'x' * 1025))

    def test_compatibility_length(self):
        self.assertTrue(self.check('name: example\ndescription: Guide\ncompatibility: ' + 'x' * 501))

    def test_missing_delimiters_or_body(self):
        self.assertTrue(validate_frontmatter('name: example', 'example'))
        self.assertTrue(validate_frontmatter('---\nname: example', 'example'))
        self.assertTrue(validate_frontmatter('---\nname: example\ndescription: Guide\n---', 'example'))

    def test_invalid_yaml(self):
        self.assertTrue(self.check('name: example\ndescription: bad: value'))


class LinkTests(unittest.TestCase):
    def test_ordinary_relative_paths(self):
        self.assertEqual(['../other/SKILL.md', 'references/a b.md'], relative_links(
            '[other](../other/SKILL.md#section) [space](references/a%20b.md)'))

    def test_ignore_external_fragment_and_code(self):
        content = '[web](https://example.com) [anchor](#ok) [root](/docs)\n```md\n[bad](absent.md)\n```\n    [code](also-absent.md)\n[real](real.md)'
        self.assertEqual(['real.md'], relative_links(content))

    def test_fence_lengths_and_types(self):
        content = '````md\n[hidden](x.md)\n```\n[still hidden](y.md)\n````\n~~~\n[hidden](z.md)\n~~~\n[yes](yes.md)'
        self.assertEqual(['yes.md'], relative_links(content))

    def test_target_existence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'exists.md').write_text('# Present\n')
            doc = root / 'SKILL.md'
            doc.write_text('[valid](exists.md) [missing](missing.md)')
            self.assertEqual(['missing relative target: missing.md'], validate_links(doc))


if __name__ == '__main__':
    unittest.main()
