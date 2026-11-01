import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const definitions = {};
let history = [];
let pending = null;
let undo = null;
let busy = false;

function compactInputs(inputs) {
    return Object.fromEntries(Object.entries(inputs || {}).map(([name, spec]) => {
        const type = spec[0];
        const options = spec[1] || {};
        return [name, [Array.isArray(type) ? type.slice(0, 40) : type,
            Object.fromEntries(["default", "min", "max", "step", "forceInput", "multiline"].filter(key => key in options).map(key => [key, options[key]]))]];
    }));
}

function selectDefinitions(message, workflow) {
    const selected = {};
    const existing = new Set((workflow.nodes || []).map(node => node.type));
    const basic = new Set(["CheckpointLoaderSimple", "CLIPTextEncode", "EmptyLatentImage", "KSampler", "VAEDecode", "SaveImage", "LoadImage", "ControlNetLoader", "ControlNetApplyAdvanced", "ControlNetApply", "Canny", "ImageScale"]);
    const words = message.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
    const ranked = Object.keys(definitions).map(name => {
        const search = `${name} ${definitions[name].category}`.toLowerCase();
        return { name, score: words.reduce((score, word) => score + (search.includes(word) ? 1 : 0), 0) };
    }).filter(item => item.score).sort((a, b) => b.score - a.score).slice(0, 24).map(item => item.name);
    let size = 0;
    for (const name of new Set([...existing, ...basic, ...ranked])) {
        const def = definitions[name];
        if (!def) continue;
        const compact = { category: def.category, input: { required: compactInputs(def.input?.required), optional: compactInputs(def.input?.optional) }, output: def.output, output_name: def.output_name };
        const length = JSON.stringify(compact).length;
        if (size + length > 120000 && !existing.has(name)) continue;
        selected[name] = compact;
        size += length;
    }
    return selected;
}

function widgetInfo(node) {
    return Object.fromEntries((node.widgets || []).filter(w => w.type !== "button").map(w => [w.name, {
        value: w.value,
        ...(Array.isArray(w.options?.values) ? { choices: w.options.values.slice(0, 40) } : {})
    }]));
}

function findNode(id, added) {
    const node = added.get(String(id)) || app.graph.getNodeById(Number(id));
    if (!node) throw new Error(`Node ${id} does not exist.`);
    return node;
}

function setWidgets(node, values) {
    for (const [name, value] of Object.entries(values || {})) {
        const widget = node.widgets?.find(w => w.name === name && w.type !== "button");
        if (!widget) throw new Error(`Widget ${name} is missing on ${node.type}.`);
        const choices = widget.options?.values;
        if (Array.isArray(choices) && !choices.includes(value)) throw new Error(`Unavailable option for ${name}: ${value}`);
        widget.value = value;
        widget.callback?.(value, app.canvas, node, app.canvas.graph_mouse, {});
    }
}

async function applyEdits(proposal) {
    const snapshot = structuredClone(app.graph.serialize());
    if (JSON.stringify(snapshot) !== proposal.base) throw new Error("The canvas changed since this reply. Send your request again with the current workflow.");
    const added = new Map();
    try {
        for (const op of proposal.operations) {
            if (op.op === "add") {
                if (!definitions[op.type] || added.has(String(op.id))) throw new Error(`Invalid new node: ${op.type}`);
                const node = globalThis.LiteGraph.createNode(op.type);
                if (!node) throw new Error(`Cannot create ${op.type}.`);
                if (Array.isArray(op.pos) && op.pos.length === 2 && op.pos.every(Number.isFinite)) node.pos = op.pos;
                app.graph.add(node);
                added.set(String(op.id), node);
                setWidgets(node, op.widgets);
            } else if (op.op === "set") {
                setWidgets(findNode(op.id, added), op.widgets);
            } else if (op.op === "connect") {
                const from = findNode(op.from, added), to = findNode(op.to, added);
                if (!Number.isInteger(op.output) || !Number.isInteger(op.input) || !from.outputs?.[op.output] || !to.inputs?.[op.input]) throw new Error("Invalid connection slots.");
                if (!from.connect(op.output, to, op.input)) throw new Error("The node connection was rejected.");
            } else if (op.op === "remove") {
                app.graph.remove(findNode(op.id, added));
            } else throw new Error(`Unsupported edit: ${op.op}`);
        }
        undo = snapshot;
        app.graph.setDirtyCanvas(true, true);
    } catch (error) {
        await app.loadGraphData(snapshot);
        throw error;
    }
}

app.registerExtension({
    name: "Codex.WorkflowAgent",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        definitions[nodeData.name] = { category: nodeData.category, input: nodeData.input, output: nodeData.output, output_name: nodeData.output_name };
    },
    async setup() {
        const panel = document.createElement("div");
        panel.style.cssText = "display:flex;flex-direction:column;gap:12px;padding:14px;height:100%;box-sizing:border-box;overflow:auto;color:var(--fg-color);background:var(--comfy-menu-bg);font:14px sans-serif";
        const title = document.createElement("strong");
        title.textContent = "Codex Agent";
        const note = document.createElement("div");
        note.textContent = "Build and edit your workflow with Codex. Send shares this workflow and available node definitions with your signed-in Codex account.";
        note.style.cssText = "font-size:12px;opacity:.75;line-height:1.5";
        const messages = document.createElement("div");
        messages.style.cssText = "flex:1;min-height:120px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5";
        const input = document.createElement("textarea");
        input.placeholder = "Create a text-to-image workflow using my installed models…";
        input.rows = 4;
        input.style.cssText = "width:100%;box-sizing:border-box;resize:vertical;background:var(--comfy-input-bg);color:var(--input-text);padding:10px;border:1px solid #777;border-radius:6px";
        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
        function button(label, action) {
            const b = document.createElement("button");
            b.textContent = label;
            b.style.cssText = "padding:8px 12px;cursor:pointer;border:1px solid #777;border-radius:6px;background:var(--comfy-input-bg);color:var(--fg-color)";
            b.onclick = action;
            actions.append(b);
            return b;
        }
        function append(role, text) {
            const entry = document.createElement("div");
            entry.style.cssText = "margin-bottom:16px";
            entry.textContent = `${role}\n${text}`;
            messages.append(entry);
            entry.scrollIntoView({ block: "nearest" });
        }
        const send = button("Send", async () => {
            if (busy || !input.value.trim()) return;
            busy = true;
            send.disabled = true;
            apply.disabled = true;
            pending = null;
            const message = input.value.trim();
            input.value = "";
            append("You", message);
            send.textContent = "Thinking…";
            try {
                const workflow = structuredClone(app.graph.serialize());
                const widgets = Object.fromEntries(app.graph._nodes.map(n => [n.id, widgetInfo(n)]));
                const response = await api.fetchApi("/codex-agent/chat", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message, workflow, widgets, definitions: selectDefinitions(message, workflow), history: history.slice(-10) })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
                append("Codex", data.message);
                history.push({ role: "user", content: message }, { role: "assistant", content: data.message });
                if (data.operations.length) {
                    pending = { operations: data.operations, base: JSON.stringify(workflow) };
                    append("Proposed edits", data.operations.map(op => JSON.stringify(op)).join("\n"));
                    apply.disabled = false;
                }
            } catch (error) { append("Error", error.message); }
            finally { busy = false; send.disabled = false; send.textContent = "Send"; }
        });
        const apply = button("Apply edits", async () => {
            if (!pending || busy) return;
            apply.disabled = true;
            try {
                await applyEdits(pending);
                pending = null;
                restore.disabled = false;
                append("Canvas", "Edits applied. Review the workflow, then run it normally.");
            } catch (error) { append("Error", error.message); }
        });
        apply.disabled = true;
        const restore = button("Undo edits", async () => {
            if (!undo || busy) return;
            await app.loadGraphData(structuredClone(undo));
            undo = null;
            pending = null;
            restore.disabled = true;
            apply.disabled = true;
            append("Canvas", "Previous workflow restored.");
        });
        restore.disabled = true;
        button("Clear chat", () => {
            if (busy) return;
            history = [];
            pending = null;
            apply.disabled = true;
            messages.replaceChildren();
        });
        input.addEventListener("keydown", e => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send.click(); }
        });
        panel.append(title, note, messages, input, actions);
        app.extensionManager.registerSidebarTab({
            id: "codex-workflow-agent", icon: "pi pi-sparkles", title: "Codex Agent",
            tooltip: "Codex workflow assistant", type: "custom",
            render: container => { container.append(panel); }
        });
    }
});
