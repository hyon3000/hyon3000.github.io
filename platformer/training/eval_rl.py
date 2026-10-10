#!/usr/bin/env python3.12
# Held-out evaluation: RL policy (deterministic, policy only) vs the look-ahead planner, one life, per level kind.
# usage: eval_rl.py MODEL.js [--per_kind 12] [--seed0 9000] [--who policy|planner|both]
import sys, os, json, threading, functools, http.server, socketserver, argparse
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument('model'); ap.add_argument('--per_kind', type=int, default=12); ap.add_argument('--seed0', type=int, default=9000); ap.add_argument('--who', default='both', help='policy | shield | planner | both (= policy+shield+planner) '); ap.add_argument('--lo', type=int, default=6); ap.add_argument('--hi', type=int, default=24)
args = ap.parse_args()
KINDS = ['plain', 'hills', 'flood', 'ghost', 'sky', 'cave', 'maze', 'castle']
m = json.loads(open(args.model).read().split('=', 1)[1].strip().rstrip(';'))
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=os.path.dirname(ROOT)); h.log_message = lambda *a, **k: None
socketserver.TCPServer.allow_reuse_address = True
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), h); threading.Thread(target=srv.serve_forever, daemon=True).start()
def run(kind, who, out):
    o = Options(); o.add_argument('-headless'); d = webdriver.Firefox(options=o); d.set_script_timeout(3000); d.command_executor._client_config.timeout = 3000
    try:
        d.get('http://127.0.0.1:%d/platformer/training/train.html' % srv.server_port)
        if who in ('policy', 'shield'): d.execute_script('RL.setWeights(arguments[0],arguments[1],arguments[2])', m['w'], m['h1'], m['h2'])
        specs = d.execute_script('return RL.pick(arguments[0],arguments[1],arguments[2],arguments[3],arguments[4])', kind, args.seed0, args.per_kind * 3, args.lo, args.hi)[:args.per_kind]
        for s in specs: s['kind'] = kind
        out[(kind, who)] = d.execute_script('return RL.eval(arguments[0],arguments[1])', specs, who)
    finally: d.quit()
out = {}; ts = []
for k in KINDS:
    for who in (['policy', 'shield', 'planner'] if args.who == 'both' else [args.who]):
        t = threading.Thread(target=run, args=(k, who, out)); t.start(); ts.append(t)
for t in ts: t.join()
print('%-8s %-9s %s' % ('kind', 'who', 'cleared/total   (death causes / stalled)'))
tot = {}
for k in KINDS:
    for who in (['policy', 'shield', 'planner'] if args.who == 'both' else [args.who]):
        r = out.get((k, who), []); w = sum(1 for x in r if x['won']); dead = sum(1 for x in r if x['dead']); tot.setdefault(who, [0, 0]); tot[who][0] += w; tot[who][1] += len(r)
        print('%-8s %-9s %d/%d   dead %d stalled %d' % (k, who, w, len(r), dead, len(r) - w - dead))
for who, (w, n) in tot.items(): print('TOTAL %-8s %d/%d = %.1f%%' % (who, w, n, 100.0 * w / max(1, n)))
json.dump({'%s|%s' % k: v for k, v in out.items()}, open(os.path.splitext(args.model)[0] + '.eval.json', 'w'))
