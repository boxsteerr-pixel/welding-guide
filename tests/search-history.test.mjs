import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('    var searchHistoryKey');
const end = html.indexOf('\n    }', html.indexOf('    function rememberSearch', start)) + 6;
const script = html.slice(start, end);
function load(saved, blocked = false) {
  const store = new Map([['welding-guide-101:search-history', saved]]);
  const chips = {children: [], set textContent(value) {this.children = [];}, appendChild(el) {this.children.push(el);}};
  const line = {style: {}};
  const context = vm.createContext({localStorage: {
    getItem: key => {if (blocked) throw Error('blocked'); return store.get(key);},
    setItem: (key,value) => {if (blocked) throw Error('blocked'); store.set(key,value);}
  }, document: {getElementById: id => id === 'quickChips' ? chips : line, createElement: () => ({dataset: {}})}});
  vm.runInContext(script, context);
  context.renderSearchHistory();
  return {context, chips, line, store};
}
const fresh = load(null);
assert.equal(fresh.line.hidden, true);
assert.equal(fresh.chips.children.length, 0);
fresh.context.rememberSearch('冷却水');
assert.equal(fresh.line.hidden, false);
assert.equal(fresh.chips.children[0].textContent, '冷却水');
fresh.context.rememberSearch('报警');
fresh.context.rememberSearch('冷却水');
assert.deepEqual(fresh.chips.children.map(x => x.textContent), ['冷却水', '报警']);
const resumed = load(fresh.store.get('welding-guide-101:search-history'));
assert.deepEqual(resumed.chips.children.map(x => x.textContent), ['冷却水', '报警']);
for (let i=0; i<12; i++) fresh.context.rememberSearch('搜索'+i);
assert.equal(fresh.chips.children.length, 8);
const unsafe = load('["<img src=x onerror=alert(1)>",null,"  ","报警","报警"]');
assert.equal(unsafe.chips.children[0].textContent, '<img src=x onerror=alert(1)>');
assert.equal(unsafe.chips.children.length, 2);
assert.equal(load('{invalid').line.hidden, true);
const denied = load(null, true);
denied.context.rememberSearch('保护气');
assert.equal(denied.chips.children[0].textContent, '保护气');
assert.match(html, /if \(!q\).*return;.*\n\s+rememberSearch\(q\);/);
assert.ok(!html.includes('var quickKeywords = ["填丝"'));
console.log('Search history: PASS (empty, persistence, deduplication, limit, safe text, corrupt/blocked storage)');
