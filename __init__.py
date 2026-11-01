import asyncio
import ipaddress
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit

from aiohttp import web
from server import PromptServer

WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}
ROOT = Path(__file__).parent
LOCK = asyncio.Lock()


def codex_path():
    configured = os.environ.get("CODEX_AGENT_BIN")
    if configured:
        if not Path(configured).is_file():
            raise RuntimeError("CODEX_AGENT_BIN must point to an existing Codex executable.")
        return configured
    found = shutil.which("codex")
    if found and (os.name != "nt" or Path(found).suffix.lower() == ".exe"):
        return found
    bins = Path(os.environ.get("LOCALAPPDATA", "")) / "OpenAI" / "Codex" / "bin"
    candidates = sorted(bins.glob("*/codex.exe"), key=lambda p: p.stat().st_mtime, reverse=True)
    if candidates:
        return str(candidates[0])
    if found:
        raise RuntimeError("Set CODEX_AGENT_BIN to native codex.exe, or install Codex Desktop. Windows batch launchers are not supported.")
    return None


def local_request(request):
    try:
        if not ipaddress.ip_address(request.remote).is_loopback:
            return False
    except (ValueError, TypeError):
        return False
    origin = request.headers.get("Origin")
    return not origin or urlsplit(origin).netloc == request.host


def run_codex(prompt):
    executable = codex_path()
    if not executable:
        raise RuntimeError("Codex CLI was not found. Install Codex and run codex login.")
    with tempfile.TemporaryDirectory(prefix="comfy-codex-") as temp:
        answer = Path(temp) / "answer.json"
        command = [executable, "exec", "--ignore-user-config", "--skip-git-repo-check",
                   "--ephemeral", "--sandbox", "read-only", "--color", "never",
                   "--output-schema", str(ROOT / "response.schema.json"),
                   "--output-last-message", str(answer), "-C", temp, "-"]
        result = subprocess.run(command, input=prompt, text=True, encoding="utf-8",
                                capture_output=True, timeout=240,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        if result.returncode or not answer.exists():
            raise RuntimeError("Codex could not complete the request. " + result.stderr[-1600:])
        response = json.loads(answer.read_text(encoding="utf-8"))
        operations = json.loads(response.pop("operations_json"))
        if not isinstance(operations, list) or len(operations) > 200:
            raise ValueError("Codex returned an invalid edit list.")
        response["operations"] = operations
        return response


@PromptServer.instance.routes.post("/codex-agent/chat")
async def chat(request):
    if not local_request(request):
        return web.json_response({"error": "Codex Agent accepts same-origin local requests only."}, status=403)
    if LOCK.locked():
        return web.json_response({"error": "Codex is busy. Wait for the current reply."}, status=409)
    try:
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError("The request must be a JSON object.")
        if not isinstance(data.get("message"), str) or not data["message"].strip():
            raise ValueError("Enter a message.")
        context = json.dumps(data, ensure_ascii=False)
        if len(context) > 700000:
            raise ValueError("Workflow context is too large. Use a smaller workflow.")
        instructions = (ROOT / "instructions.txt").read_text(encoding="utf-8")
        async with LOCK:
            response = await asyncio.to_thread(run_codex, instructions + "\nCONTEXT:\n" + context)
        return web.json_response(response)
    except subprocess.TimeoutExpired:
        return web.json_response({"error": "Codex timed out after four minutes. Try a smaller request."}, status=504)
    except (ValueError, RuntimeError, OSError) as error:
        return web.json_response({"error": str(error)}, status=400)
