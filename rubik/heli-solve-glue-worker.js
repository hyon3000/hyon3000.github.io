// Worker of the group solver (heli-solve-glue.js): builds the chain of a puzzle once (cached by key) and answers {id, key, desc, base, st} with the turns [{mi, q}].
importScripts('heli-solve-glue-core.js', 'heli-solve-grp-core.js');
self.onmessage = function (ev) {
  const m = ev.data;
  try {
    if (m.cmd === 'grp') {          // the general group solver (heli-solve-grp-core.js): prepared once per key; a table that was cut short by the time limit gets more time when a state does not sift
      const t0 = Date.now(); let prep = (self.GPREP = self.GPREP || {})[m.key];
      if (!prep) { prep = self.HGRP.prepare(m.desc, m.opts || {}); if (!prep.error) self.GPREP[m.key] = prep; }
      if (prep.error) { self.postMessage({ id: m.id, ok: false, error: prep.error }); return; }
      const t1 = Date.now();
      let r = self.HGRP.solve(prep, Int16Array.from(m.st));
      for (let tr = 0; tr < 6 && typeof r === 'string' && r === 'sift'; tr++) { self.HGRP.more(prep, 30000); r = self.HGRP.solve(prep, Int16Array.from(m.st)); }
      if (typeof r === 'string') self.postMessage({ id: m.id, ok: false, error: r }); else self.postMessage({ id: m.id, ok: true, moves: r, ms: t1 - t0, solveMs: Date.now() - t1 });
      return;
    }
    const t0 = Date.now(), prep = self.HGLUE.prepare(m.key, m.desc, m.base, m.opts), t1 = Date.now();
    if (prep.error) { self.postMessage({ id: m.id, ok: false, error: prep.error }); return; }
    if (m.cmd === 'prep') { self.postMessage({ id: m.id, ok: true, ms: t1 - t0, avg: prep.comps.map((c) => c.avg) }); return; }
    const r = self.HGLUE.solvePrepared(prep, m.st);
    if (typeof r === 'string') self.postMessage({ id: m.id, ok: false, error: r }); else self.postMessage({ id: m.id, ok: true, moves: r, ms: t1 - t0, solveMs: Date.now() - t1 });
  } catch (e) { self.postMessage({ id: m.id, ok: false, error: String(e) }); }
};
