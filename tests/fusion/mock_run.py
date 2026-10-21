"""Runs build_joinery.py against a stand-in for Fusion's adsk module.

This can't check Fusion's geometry, but it catches Python mistakes and
spec fields the script doesn't understand, on every model and profile.
Run: python3 tests/fusion/mock_run.py
"""
import importlib.util
import os
import sys
import tempfile
import types
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(ROOT, "reference", "coffee-table", "joinery", "build_joinery", "build_joinery.py")


class Fake(mock.MagicMock):
    count = 1  # every collection holds one item (one profile per sketch, one body per feature)

calls = {"bodies": 0, "booleans": 0, "sketches": 0}
adsk = types.ModuleType("adsk")
core, fusion = Fake(name="core"), Fake(name="fusion")
adsk.core, adsk.fusion = core, fusion
adsk.doEvents = lambda: None
sys.modules.update({"adsk": adsk, "adsk.core": core, "adsk.fusion": fusion})

app = Fake(name="app")
core.Application.get.return_value = app
messages = []
app.userInterface.messageBox.side_effect = lambda *a: messages.append(a[0])
design = Fake(name="design")
fusion.Design.cast.return_value = design
tbm = Fake(name="tbm")
fusion.TemporaryBRepManager.get.return_value = tbm
tbm.booleanOperation.side_effect = lambda *a: calls.__setitem__("booleans", calls["booleans"] + 1) or True

spec = importlib.util.spec_from_file_location("build_joinery", SCRIPT)
bj = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bj)
bj.OUT_DIR = tempfile.mkdtemp()
bj.run(None)

log = open(os.path.join(bj.OUT_DIR, "log.txt")).read()
print(messages[-1])
if "failed" in log or "Traceback" in log or "stopped" in messages[-1]:
    print(log)
    sys.exit(1)
print("booleans:", calls["booleans"])
