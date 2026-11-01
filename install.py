"""Install the extension into a local ComfyUI folder."""
import argparse
from pathlib import Path
import shutil

FILES = ("__init__.py", "response.schema.json", "instructions.txt", "README.md", "LICENSE", "pyproject.toml")


def install(comfyui, upgrade=False):
    source = Path(__file__).resolve().parent
    root = Path(comfyui).expanduser().resolve()
    if not (root / "main.py").is_file() or not (root / "custom_nodes").is_dir():
        raise ValueError("Choose the ComfyUI folder containing main.py and custom_nodes.")
    target = root / "custom_nodes" / "comfyui-codex-agent"
    if target.resolve() == source:
        raise ValueError("Already installed here. Restart ComfyUI.")
    if target.exists() and not upgrade:
        raise ValueError("Already installed. Use --upgrade to replace packaged files.")
    if target.is_symlink() or target.resolve().parent != (root / "custom_nodes").resolve():
        raise ValueError("Refusing to install through a redirected folder.")
    target.mkdir(exist_ok=True)
    for name in FILES:
        destination = target / name
        if destination.is_symlink():
            raise ValueError("Refusing to replace a symbolic link.")
        shutil.copy2(source / name, destination)
    web = target / "web"
    if web.is_symlink():
        raise ValueError("Refusing to install through a redirected web folder.")
    web.mkdir(exist_ok=True)
    destination = web / "codex-agent.js"
    if destination.is_symlink():
        raise ValueError("Refusing to replace a redirected JavaScript file.")
    shutil.copy2(source / "web" / "codex-agent.js", destination)
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--comfyui", required=True, help="Folder containing main.py and custom_nodes")
    parser.add_argument("--upgrade", action="store_true", help="Replace existing packaged files")
    args = parser.parse_args()
    try:
        destination = install(args.comfyui, args.upgrade)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Installation failed: {error}\n")
    print(f"Installed to {destination}\nRestart ComfyUI and open Codex Agent in the sidebar.")
