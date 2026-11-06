"""Orchestrator controls use temporary Git fixtures; no browser/product verdicts."""
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest


SUPERVISOR = Path(__file__).with_name('run-corpora.py')
SPEC = importlib.util.spec_from_file_location('rector_audit_corpora', SUPERVISOR)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
NODE = shutil.which('node')


class ReportProtocolTests(unittest.TestCase):
    def test_complete_report_can_follow_runner_diagnostics(self):
        report = {'candidatePass': True, 'results': [{'status': 'PASS'}]}
        self.assertEqual(MODULE.parse_report('Vite diagnostics\n' + json.dumps(report) + '\n'), report)

    def test_truncated_and_trailing_output_cannot_be_accepted(self):
        for text in ['{"candidatePass": true', '{"candidatePass": true}\nunfinished work']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                MODULE.parse_report(text)

    def test_a_later_success_cannot_hide_an_earlier_candidate_report(self):
        text = '{"candidatePass": false}\n{"candidatePass": true}\n'
        with self.assertRaisesRegex(ValueError, 'one|multiple|ambiguous'):
            MODULE.parse_report(text)


@unittest.skipUnless(NODE and os.name == 'posix', 'Hosted audit requires Node and POSIX process groups')
class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='rector-audit-supervisor-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / 'repo'
        self.root.mkdir()
        self.output = Path(self.temporary.name) / 'results'
        self.chrome = Path(sys.executable)
        self.playwright = Path(self.temporary.name) / 'fixture-playwright.mjs'
        self.playwright.write_text('// Preflight file only; the orchestrator fixture never imports a browser.\n')

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, stderr=subprocess.PIPE, text=True).strip()

    def fixture(self, *, wait=False):
        checkpoint = self.root / 'scripts/parity/checkpoints/2026-11-05/audit-completion'
        checkpoint.mkdir(parents=True)
        files = [f'case-{number:03d}.mjs' for number in range(100)]
        registry = json.dumps({'files': files}).encode()
        with tarfile.open(checkpoint / 'execution.tar.gz', 'w:gz') as archive:
            entry = tarfile.TarInfo('corpora/manifest.json')
            entry.size = len(registry)
            archive.addfile(entry, io.BytesIO(registry))
        # This checker is a fixture for supervisor decisions. The hosted audit
        # loads the repository's unchanged, independently reviewed checker.
        (checkpoint / 'review.py').write_text('''
CANDIDATE = ''
def corpus(name, report):
    assert report['candidatePass'] is True, 'candidate failed'
    assert report['head'] == CANDIDATE, 'wrong head'
    assert not report['filter'], 'inherited selector'
    return dict(observations=1, verdicts=0, completedBodies=0, moduleRecords=0)
def historical_differences(rows):
    return sum(row.get('status') == 'FAIL' for row in rows)
''')
        for number, name in enumerate(files):
            code = f'''
import {{ execFileSync }} from 'node:child_process'
const index = {number};
const head = execFileSync('git', ['rev-parse', 'HEAD'], {{ encoding: 'utf8' }}).trim();
const report = {{ head, candidatePass: index !== 0, filter: process.env.EDITOR_AUDIT_TEST_FILTER ?? '', results: [{{ source: 'candidate', status: 'PASS' }}] }};
if (index === 1) {{ report.sources = [{{ label: 'candidate' }}, {{ label: 'old' }}]; report.results.push({{ source: 'old', status: 'FAIL' }}); }}
console.log(JSON.stringify(report));
process.exitCode = index === 1 || index === 2 ? 1 : index === 3 ? 42 : 0;
'''
            if wait and number == 0:
                code = 'console.log("OWNED_PID=" + process.pid); setInterval(() => {}, 1000);\n'
            (self.root / 'scripts/parity' / name).write_text(code)
        self.git('init', '--quiet')
        self.git('add', '.')
        self.git('-c', 'user.name=Audit Fixture', '-c', 'user.email=audit-fixture@example.invalid', 'commit', '--quiet', '-m', 'orchestrator fixture')
        self.head = self.git('rev-parse', 'HEAD')

    def command(self, *extra):
        return [sys.executable, '-B', str(SUPERVISOR), '--repo', str(self.root), '--out', str(self.output),
                '--head', self.head, '--node', NODE, '--chrome', str(self.chrome),
                '--playwright', str(self.playwright), '--timeout', '30', *extra]

    def manifest(self):
        return json.loads((self.output / 'manifest.json').read_text())

    def test_all_100_execute_after_failures_and_raw_exits_keep_their_meaning(self):
        self.fixture()
        environment = {**os.environ, 'EDITOR_AUDIT_TEST_FILTER': 'must-be-removed'}
        result = subprocess.run(self.command(), env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        manifest = self.manifest()
        self.assertEqual(manifest['status'], 'complete')
        self.assertFalse(manifest['passed'])
        self.assertEqual(len(manifest['results']), 100)
        self.assertTrue(manifest['sourceUnchanged'])
        self.assertIn('EDITOR_AUDIT_TEST_FILTER', manifest['removedInheritedSelectors'])
        results = manifest['results']
        self.assertFalse(results[0]['passed'], 'raw exit zero cannot override a failed candidate')
        self.assertEqual(results[0]['code'], 0)
        self.assertTrue(results[1]['passed'], 'attributable historical differences remain distinct')
        self.assertEqual(results[1]['code'], 1)
        self.assertEqual(results[1]['historicalDifferenceCount'], 1)
        self.assertFalse(results[2]['passed'], 'unattributable exit one must fail')
        self.assertFalse(results[3]['passed'], 'unexpected termination must fail')
        self.assertEqual(results[3]['code'], 42)
        self.assertTrue(all(row['passed'] for row in results[4:]))

    def test_dirty_source_is_rejected_before_any_corpus_runs(self):
        self.fixture()
        source = self.root / 'scripts/parity/case-000.mjs'
        source.write_text(source.read_text() + '\n// dirty source\n')
        result = subprocess.run(self.command('--preflight-only'), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        manifest = self.manifest()
        self.assertEqual(manifest['status'], 'preflight-failed')
        self.assertEqual(manifest['results'], [])
        self.assertTrue(any('clean tracked tree' in error for error in manifest['preflightErrors']))

    def test_sigterm_closes_owned_corpus_and_records_interruption(self):
        self.fixture(wait=True)
        process = subprocess.Popen(self.command(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        owned_pid = None
        try:
            log = self.output / 'case-000.mjs.stdout.log'
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                if log.exists() and log.read_text().startswith('OWNED_PID='):
                    owned_pid = int(log.read_text().strip().split('=')[1])
                    break
                if process.poll() is not None:
                    self.fail('Supervisor exited before starting its owned fixture')
                time.sleep(0.02)
            self.assertIsNotNone(owned_pid, 'owned fixture must start before interruption')
            process.send_signal(signal.SIGTERM)
            stdout, stderr = process.communicate(timeout=15)
            self.assertNotEqual(process.returncode, 0, stdout + stderr)
            manifest = self.manifest()
            self.assertEqual(manifest['status'], 'interrupted')
            self.assertIn('SIGTERM', manifest['error'])
            with self.assertRaises(ProcessLookupError):
                os.kill(owned_pid, 0)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate(timeout=5)
            if owned_pid is not None:
                try:
                    os.killpg(owned_pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass


if __name__ == '__main__':
    unittest.main()
