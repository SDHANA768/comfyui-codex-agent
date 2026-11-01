# Codex Agent for ComfyUI

A chat sidebar that uses your local Codex CLI to propose changes to ComfyUI workflows. Created by [SDHANA768](https://github.com/SDHANA768). Independent community extension; not affiliated with OpenAI or Comfy Org.

**v0.1.0-alpha.1 — early preview.** The Codex connection and edit logic have been tested. Full interactive verification in ComfyUI and testing on macOS/Linux are still pending. Save important workflows before trying it.

## Features

- Reads the current canvas and installed node definitions.
- Proposes new nodes, widget values, connections, and removals.
- Shows edits before you click **Apply edits**.
- Offers **Undo edits** to restore the canvas before the last application.
- Rejects proposals if the canvas changed since the request; rolls back failed edits.

It does not install nodes, download models, edit subgraphs, or queue image generation. Review the resulting canvas and run the workflow normally.

## Requirements

- Local ComfyUI with the sidebar extension API.
- Python 3.10+ (ComfyUI's bundled Python is fine).
- Codex CLI installed and signed in with your own account.

Follow the [official Codex setup instructions](https://developers.openai.com/codex/quickstart). Run `codex login status` to check authentication. Access and usage limits follow your Codex account; this extension does not include model access.

On Windows, Codex Desktop's bundled `codex.exe` is discovered automatically. Native `codex.exe` on PATH also works. Windows `.cmd` launchers are not supported in this preview. Set `CODEX_AGENT_BIN` to the full path of a native Codex executable if necessary, before launching ComfyUI. On macOS/Linux, put `codex` on the PATH visible to ComfyUI, or set `CODEX_AGENT_BIN`.

## Install with Git

Open a terminal in ComfyUI's `custom_nodes` folder:

```sh
git clone https://github.com/SDHANA768/comfyui-codex-agent.git
```

Restart ComfyUI. Open **Codex Agent** in the sidebar. No additional Python packages are required in a standard ComfyUI environment.

## Install from ZIP

Download the [v0.1.0-alpha.1 installation ZIP](https://github.com/SDHANA768/comfyui-codex-agent/raw/refs/heads/main/packages/comfyui-codex-agent-0.1.0-alpha.1.zip) ([SHA-256 checksum](https://github.com/SDHANA768/comfyui-codex-agent/blob/main/packages/comfyui-codex-agent-0.1.0-alpha.1.zip.sha256)).

Download GitHub's **Code → Download ZIP**, or an installation ZIP from a release. Extract it and move the extension folder to `ComfyUI/custom_nodes/comfyui-codex-agent`. The final layout must be:

```text
ComfyUI/custom_nodes/comfyui-codex-agent/
  __init__.py
  instructions.txt
  response.schema.json
  web/codex-agent.js
```

Alternatively, run the included installer from the extracted folder:

```sh
python install.py --comfyui "/path/to/ComfyUI"
```

Choose the folder containing `main.py` and `custom_nodes`. On Windows, use the ComfyUI Python executable if `python` is unavailable. Add `--upgrade` to replace an existing extension's packaged files. The installer does not install Codex or change ComfyUI core files. Restart ComfyUI afterward.

## Use

1. Open **Codex Agent** in the sidebar.
2. Ask for a change, such as “Set the sampler to 25 steps” or “Build a text-to-image workflow using my installed models.”
3. Click **Send** or press Ctrl/Cmd+Enter.
4. Review the reply and edit list, then click **Apply edits**.
5. Inspect the canvas and run it normally. Use **Undo edits** if needed.

## Data and access

Clicking Send shares your message, workflow, node definitions, widget values/model filenames, and recent chat with Codex. It does not upload image files. Chat history stays in browser memory until cleared or reloaded. Codex's own data handling follows your account configuration.

Credentials remain managed by the Codex CLI. Do not paste tokens or API keys into the panel. The endpoint accepts loopback clients with matching browser origins. Use local ComfyUI without a reverse proxy for this preview. These checks are not a substitute for securing your computer.

Codex runs with a read-only sandbox and a temporary working directory. The prompt instructs it to return proposals without using tools. The extension does not grant filesystem write access or expose a terminal.

## Troubleshooting and updates

- **No panel:** restart the backend and reload the frontend. Check the startup log for failed imports.
- **Codex not found:** configure `CODEX_AGENT_BIN` or install Codex Desktop on Windows, then restart ComfyUI.
- **Authentication error:** run `codex login` as the same OS user that runs ComfyUI.
- **Large request:** use a smaller workflow. Context is capped at 700,000 characters.
- **Canvas changed:** resend your request with the current workflow.
- **Timeout:** requests stop after four minutes; try a smaller change.

Update a Git installation with `git pull` inside the extension folder, then restart. To uninstall, remove only `custom_nodes/comfyui-codex-agent` and restart.

## Development

Run `node tests/test_edits.cjs` and `python -m unittest discover -s tests`. Python tests need `aiohttp`, already included with ComfyUI. Tests do not call Codex or need a login. Build an installation ZIP with `python build_package.py`.

See [CHANGELOG.md](CHANGELOG.md). Licensed under [MIT](LICENSE).
