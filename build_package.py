"""Build a clean installation ZIP and SHA-256 checksum."""
import hashlib
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent
VERSION = "0.1.0-alpha.2"
FILES = ("__init__.py", "instructions.txt", "response.schema.json", "web/codex-agent.js",
         "README.md", "LICENSE", "CHANGELOG.md", "pyproject.toml", "install.py")


def build():
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    target = output / f"comfyui-codex-agent-{VERSION}.zip"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in FILES:
            info = zipfile.ZipInfo(f"comfyui-codex-agent/{name}", (2026, 11, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (ROOT / name).read_bytes())
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix(".zip.sha256").write_text(f"{digest}  {target.name}\n", encoding="utf-8")
    print(target)
    return target


if __name__ == "__main__":
    build()
