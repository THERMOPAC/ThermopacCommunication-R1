const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('client/index.html', 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('STARTUP_WAITING_FOR_APP'));

function browser() {
  const elements = {
    root: { childElementCount: 0 },
    'startup-status': { hidden: true },
    'startup-details': { textContent: '' },
    'startup-explanation': { textContent: '' },
  };
  const handlers = {};
  let timer, observe;
  const logs = [];
  const window = {
    location: { href: 'https://example.test/dashboard?private=hidden', pathname: '/dashboard' },
    addEventListener: (name, handler) => { handlers[name] = handler; },
  };
  vm.runInNewContext(script, {
    window, URL,
    document: { getElementById: id => elements[id] },
    setTimeout: fn => { timer = fn; return 1; },
    clearTimeout: () => { timer = undefined; },
    console: { error: (...args) => logs.push(args) },
    MutationObserver: class { constructor(fn) { observe = fn; } observe() {} },
  });
  return { elements, handlers, logs, tick: () => timer?.(), mutate: () => observe() };
}

test('stalled bootstrap shows diagnostics without exposing URL query or navigating', () => {
  const b = browser();
  assert.equal(b.elements['startup-status'].hidden, true);
  b.tick();
  assert.equal(b.elements['startup-status'].hidden, false);
  assert.match(b.elements['startup-details'].textContent, /STARTUP_WAITING_FOR_APP/);
  assert.doesNotMatch(b.elements['startup-details'].textContent, /private=hidden/);
});
test('successful mounting hides diagnostics and cancels fallback', () => {
  const b = browser();
  b.tick();
  b.elements.root.childElementCount = 1;
  b.mutate();
  b.tick();
  assert.equal(b.elements['startup-status'].hidden, true);
});
test('module failure identifies source and line without source query', () => {
  const b = browser();
  b.handlers.error({message:'Unexpected token',filename:'https://example.test/src/page.tsx?token=hidden',lineno:3,colno:4});
  assert.match(b.elements['startup-details'].textContent, /Source: \/src\/page.tsx\nLine: 3, column: 4/);
  assert.doesNotMatch(b.elements['startup-details'].textContent, /token=hidden/);
});
test('script network errors and rejected imports are visible', () => {
  const b = browser();
  b.handlers.error({target:{tagName:'SCRIPT',src:'/src/main.tsx?v=123'}});
  assert.match(b.elements['startup-details'].textContent, /STARTUP_SCRIPT_LOAD_FAILED/);
  b.handlers.unhandledrejection({reason: new Error('Import failed')});
  assert.match(b.elements['startup-details'].textContent, /STARTUP_PROMISE_REJECTED\nImport failed/);
});
test('nonfatal errors do not cover an already rendered app', () => {
  const b = browser();
  b.elements.root.childElementCount = 1;
  b.mutate();
  b.handlers.unhandledrejection({reason: new Error('Background request failed')});
  assert.equal(b.elements['startup-status'].hidden, true);
});