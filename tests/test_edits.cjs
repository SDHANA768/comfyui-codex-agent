const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../web/codex-agent.js'), 'utf8').replace(/^import .*;$/gm, '');
let nodes = [], next = 1;
const graph = {
    serialize: () => ({ nodes: nodes.map(n => ({ id: n.id, type: n.type, value: n.widgets[0].value })) }),
    getNodeById: id => nodes.find(n => n.id === id),
    add: n => { n.id = next++; nodes.push(n); },
    remove: n => { nodes = nodes.filter(v => v !== n); }, setDirtyCanvas() {}
};
const context = vm.createContext({ console, structuredClone, app: {
    graph, canvas: {}, registerExtension() {},
    loadGraphData: async data => { nodes = data.nodes.map(n => makeNode(n.type, n.id, n.value)); }
}, api: {}, LiteGraph: { createNode: type => makeNode(type) } });
function makeNode(type, id, value = 20) {
    return { type, id, widgets: [{ name: 'steps', value }], inputs: [{}], outputs: [{}], connect: () => ({ id: 1 }) };
}
vm.runInContext(source + '\nglobalThis.testApi={applyEdits,definitions,selectDefinitions};', context);
(async () => {
    const { applyEdits, definitions } = context.testApi;
    definitions.KSampler = {};
    const propose = operations => ({ base: JSON.stringify(graph.serialize()), operations });
    await applyEdits(propose([{ op: 'add', id: 'a', type: 'KSampler', widgets: { steps: 30 } }]));
    assert.equal(nodes[0].widgets[0].value, 30);
    await applyEdits(propose([{ op: 'set', id: nodes[0].id, widgets: { steps: 40 } }]));
    assert.equal(nodes[0].widgets[0].value, 40);
    await assert.rejects(applyEdits(propose([{ op: 'set', id: nodes[0].id, widgets: { steps: 50 } }, { op: 'bad' }])));
    assert.equal(nodes[0].widgets[0].value, 40, 'Failed edit must roll back');
    const stale = propose([]);
    nodes[0].widgets[0].value = 41;
    await assert.rejects(applyEdits(stale), /canvas changed/);
    for (let i = 0; i < 1500; i++) definitions[`UnrelatedNode${i}`] = { category: 'other', input: { required: { model: [Array.from({ length: 500 }, (_, n) => `model-${n}`), { tooltip: 'x'.repeat(2000) }] } } };
    definitions.ControlNetLoader = { input: { required: { control_net_name: [Array.from({ length: 500 }, (_, i) => `control-${i}`), {}] } } };
    const selected = context.testApi.selectDefinitions('create a simple workflow with controlnet', graph.serialize());
    assert.ok(selected.ControlNetLoader, 'ControlNet loader must be included');
    assert.ok(selected.KSampler, 'Current and base nodes must be included');
    assert.ok(JSON.stringify(selected).length < 120000, 'Large catalogs must produce bounded context');
    assert.equal(selected.ControlNetLoader.input.required.control_net_name[0].length, 40);
    assert.ok(!selected.UnrelatedNode0, 'Unrelated definitions must be omitted');
    console.log('Passed: add, set, rollback, stale canvas rejection.');
    console.log('Passed: 1,500-node catalog filtering and bounded ControlNet context.');
})().catch(error => { console.error(error); process.exitCode = 1; });

