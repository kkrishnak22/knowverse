// Python runtime for the Learn kit: loads Pyodide (CPython compiled to WebAssembly) on first use
// and runs student code under a tracer that records every step — which line ran, which names
// exist, which objects they point to, and what has been printed. Every visual in the kit
// (memory scene, code panel, console) is driven by the steps this file returns.

export const PYODIDE_VERSION = '314.0.8';
export const PYODIDE_URL = `https://cdn.jsdelivr.net/npm/pyodide@${PYODIDE_VERSION}/`;

const TRACER = String.raw`
import sys, io, json, builtins, types

MAX_STEPS = 600

class _StepLimit(Exception):
    pass

def _kind(o):
    if o is None: return 'none'
    if isinstance(o, bool): return 'bool'
    if isinstance(o, int): return 'int'
    if isinstance(o, float): return 'float'
    if isinstance(o, str): return 'str'
    if isinstance(o, list): return 'list'
    if isinstance(o, tuple): return 'tuple'
    if isinstance(o, dict): return 'dict'
    if isinstance(o, set): return 'set'
    if isinstance(o, (types.FunctionType, types.BuiltinFunctionType)): return 'function'
    return 'object'

def _short(o, kind):
    try:
        if kind == 'function': return getattr(o, '__name__', 'function') + '()'
        if kind == 'object': return type(o).__name__
        r = repr(o)
    except Exception:
        r = '?'
    return r if len(r) <= 40 else r[:37] + '...'

def _snapshot(o, heap, depth=0):
    i = str(id(o))
    if i in heap: return i
    k = _kind(o)
    entry = {'kind': k, 'repr': _short(o, k), 'type': type(o).__name__}
    heap[i] = entry
    if depth < 3:
        if k in ('list', 'tuple', 'set'):
            entry['items'] = [_snapshot(x, heap, depth + 1) for x in list(o)[:12]]
        elif k == 'dict':
            entry['items'] = [[_snapshot(a, heap, depth + 1), _snapshot(b, heap, depth + 1)] for a, b in list(o.items())[:12]]
    return i

def _visible(name, value):
    if name.startswith('__'): return False
    if isinstance(value, types.ModuleType): return False
    return True

def run(code, inputs_json):
    inputs = list(json.loads(inputs_json))
    out = io.StringIO()
    steps = []
    error = None

    def fake_input(prompt=''):
        out.write(str(prompt))
        value = inputs.pop(0) if inputs else ''
        out.write(value + '\n')
        return value

    def frames_of(frame):
        chain = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == '<lesson>':
                chain.append(f)
            f = f.f_back
        chain.reverse()
        return chain

    def record(frame, event, line):
        heap = {}
        frames = []
        for f in frames_of(frame):
            is_module = f.f_code.co_name == '<module>'
            scope = f.f_globals if is_module else f.f_locals
            names = [[n, _snapshot(v, heap)] for n, v in list(scope.items()) if _visible(n, v)]
            frames.append({'name': 'global' if is_module else f.f_code.co_name, 'vars': names})
        steps.append({'line': line, 'event': event, 'frames': frames, 'heap': heap, 'out': out.getvalue()})
        if len(steps) >= MAX_STEPS:
            raise _StepLimit()

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != '<lesson>':
            return None
        # A module-level 'return' is the same picture as the final 'end' step, so skip it.
        if event == 'line' or (event == 'return' and frame.f_code.co_name != '<module>'):
            record(frame, event, frame.f_lineno)
        return tracer

    env = {'__name__': '__main__', '__builtins__': builtins}
    old_out, old_input = sys.stdout, builtins.input
    sys.stdout = out
    builtins.input = fake_input
    last_frame = [None]
    try:
        compiled = compile(code, '<lesson>', 'exec')
        sys.settrace(tracer)
        try:
            exec(compiled, env)
        finally:
            sys.settrace(None)
    except _StepLimit:
        error = {'type': 'StepLimit', 'message': 'Stopped after %d steps — is there a loop that never ends?' % MAX_STEPS, 'line': steps[-1]['line'] if steps else None}
    except SyntaxError as e:
        error = {'type': 'SyntaxError', 'message': e.msg, 'line': e.lineno}
    except Exception as e:
        tb = e.__traceback__
        line = None
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == '<lesson>':
                line = tb.tb_lineno
            tb = tb.tb_next
        error = {'type': type(e).__name__, 'message': str(e), 'line': line}
    finally:
        sys.stdout = old_out
        builtins.input = old_input

    # Final state: every module-level name after the program finished.
    if error is None or error['type'] not in ('SyntaxError',):
        heap = {}
        names = [[n, _snapshot(v, heap)] for n, v in list(env.items()) if _visible(n, v)]
        steps.append({'line': None, 'event': 'end', 'frames': [{'name': 'global', 'vars': names}], 'heap': heap, 'out': out.getvalue()})
    return json.dumps({'steps': steps, 'error': error})
`;

let ready = null;

/** Load Pyodide once. `onStatus` receives short progress messages for the UI. */
export function loadPython(onStatus = () => {}) {
  ready ??= (async () => {
    onStatus('Downloading Python…');
    const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`);
    const py = await loadPyodide({ indexURL: PYODIDE_URL });
    onStatus('Starting Python…');
    py.runPython(TRACER);
    return py;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

export const pythonLoaded = () => ready != null;

/**
 * Run code under the tracer.
 * Returns { steps: [{ line, event, frames: [{ name, vars: [[name, objId]] }], heap: { objId: { kind, repr, type, items? } }, out }], error }
 */
export async function trace(code, { inputs = [], onStatus } = {}) {
  const py = await loadPython(onStatus);
  const run = py.globals.get('run');
  try {
    return JSON.parse(run(code, JSON.stringify(inputs)));
  } finally {
    run.destroy?.();
  }
}

// Exposed for tests (Node loads Pyodide from node_modules and calls this directly).
export const TRACER_SOURCE = TRACER;
