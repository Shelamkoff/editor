"""Restore recorded verification commits from published blobs, without checkout.

Run from the repository root after fetching the published refactoring branch.
The optional argument selects a source map; by default use the adjacent map.
Only Git objects and one dedicated checkpoint ref are written. The worktree,
branch and real index are not changed.
"""

import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def git(*args, data=None, environment=None):
    return subprocess.check_output(
        ["git", *args], input=data, env=environment, stderr=subprocess.PIPE
    )


def restore(path):
    manifest = json.loads(path.read_text())
    if manifest["schemaVersion"] != 1:
        raise ValueError("Unsupported integration source map")
    records = manifest["records"]
    if not records:
        raise ValueError("The source map has no recorded commits")

    previous = manifest["base"]
    blobs = set()
    for record in records:
        raw = base64.b64decode(record["originalCommitBase64"], validate=True)
        digest = hashlib.sha1(b"commit " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
        if digest != record["source"]:
            raise ValueError("Original commit bytes do not match their recorded identity")
        headers = raw.split(b"\n\n", 1)[0].decode().splitlines()
        if headers[:2] != ["tree " + record["tree"], "parent " + previous]:
            raise ValueError("Original tree or parent header does not match the source map")
        if record["parent"] != previous:
            raise ValueError("The integration source chain is not linear")
        previous = record["source"]
        for change in record["changes"]:
            if change["blob"] is not None:
                blobs.add(change["blob"])

    if previous != manifest["frozenHead"] or records[-1]["tree"] != manifest["frozenTree"]:
        raise ValueError("The frozen source is not the final recorded commit")
    requested = "\n".join(sorted(blobs)) + "\n"
    for line in git("cat-file", "--batch-check", data=requested.encode()).decode().splitlines():
        fields = line.split()
        if len(fields) != 3 or fields[1] != "blob":
            raise ValueError("A recorded blob is unavailable; fetch the published branch: " + line)

    with tempfile.TemporaryDirectory(prefix="rector-source-index-") as directory:
        environment = {**os.environ, "GIT_INDEX_FILE": str(Path(directory) / "index")}
        git("read-tree", manifest["base"], environment=environment)
        for record in records:
            changes = bytearray()
            for change in record["changes"]:
                mode = change["mode"] if change["blob"] is not None else "0"
                blob = change["blob"] or "0" * 40
                changes.extend((mode + " " + blob + "\t" + change["path"]).encode())
                changes.append(0)
            if changes:
                git("update-index", "-z", "--index-info", data=bytes(changes), environment=environment)
            tree = git("write-tree", environment=environment).decode().strip()
            if tree != record["tree"]:
                raise ValueError("Reconstructed tree mismatch for " + record["source"])
            original = base64.b64decode(record["originalCommitBase64"], validate=True)
            restored = git("hash-object", "-t", "commit", "-w", "--stdin", data=original).decode().strip()
            if restored != record["source"]:
                raise ValueError("Restored commit identity mismatch")

    checkpoint = "refs/rector-checkpoints/integration-" + manifest["frozenHead"]
    git("update-ref", checkpoint, manifest["frozenHead"])
    print(json.dumps({"restoredCommits": len(records), "frozenHead": manifest["frozenHead"],
                      "frozenTree": manifest["frozenTree"], "checkpointRef": checkpoint,
                      "workingTreeAndIndexChanged": False}))


if __name__ == "__main__":
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("integration-source-map.json")
    restore(source)
