import importlib.util
import ipaddress
import pathlib
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


installer = load("installer", ROOT / "install.py")
server = types.SimpleNamespace(PromptServer=types.SimpleNamespace(instance=types.SimpleNamespace(
    routes=types.SimpleNamespace(post=lambda path: lambda function: function))))
with patch.dict(sys.modules, {"server": server}):
    backend = load("codex_agent", ROOT / "__init__.py")


class PackageTests(unittest.TestCase):
    def test_install_and_upgrade(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            (root / "main.py").touch()
            (root / "custom_nodes").mkdir()
            target = installer.install(root)
            self.assertEqual((target / "web/codex-agent.js").read_bytes(), (ROOT / "web/codex-agent.js").read_bytes())
            with self.assertRaises(ValueError):
                installer.install(root)
            (target / "user-note.txt").write_text("preserve")
            installer.install(root, upgrade=True)
            self.assertEqual((target / "user-note.txt").read_text(), "preserve")

    def test_reject_wrong_install_folder(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                installer.install(temp)

    def test_origin_and_loopback(self):
        def request(remote, origin=None):
            return types.SimpleNamespace(remote=remote, host="127.0.0.1:8188", headers={"Origin": origin} if origin else {})
        self.assertTrue(backend.local_request(request("127.0.0.1", "http://127.0.0.1:8188")))
        self.assertTrue(backend.local_request(request("::1")))
        self.assertFalse(backend.local_request(request("192.0.2.1")))
        self.assertFalse(backend.local_request(request("127.0.0.1", "https://example.com")))
        self.assertFalse(backend.local_request(request(None)))

    def test_missing_configured_executable(self):
        with patch.dict("os.environ", {"CODEX_AGENT_BIN": str(ROOT / "does-not-exist")}):
            with self.assertRaises(RuntimeError):
                backend.codex_path()


if __name__ == "__main__":
    unittest.main()
