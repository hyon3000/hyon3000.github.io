import sys, time, pathlib, http.server, threading, functools, base64
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8851), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 1000)
try:
    d.get("http://127.0.0.1:8851/polynomino/game.html?battle=1"); time.sleep(5)
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(7)
    d.execute_script('''var F = PolyBattle.oppFrame.contentWindow; F.__log = []; var raw = F.requestAnimationFrame; F.requestAnimationFrame = function (cb) { return raw.call(F, function (t) { cb(t); var cv = F.document.getElementsByTagName('canvas')[0], r = F.PolyBattle.api.slotRect(cv.width, cv.height), x = cv.getContext('2d'), dd = x.getImageData(r[0], r[1], r[2], r[3]).data, mx = 0; for (var q = 0; q < dd.length; q += 4) mx = Math.max(mx, dd[q], dd[q+1], dd[q+2]); var o = F.document.createElement('canvas'); o.width = 250; o.height = 18; var y = o.getContext('2d'); y.drawImage(cv, r[0], r[1], r[2], r[3], 0, 0, 250, 18); var e = y.getImageData(0,0,250,18).data, m2 = 0; for (var q = 0; q < e.length; q += 4) m2 = Math.max(m2, e[q], e[q+1], e[q+2]); F.__log.push([mx, m2, cv.width, r[2]]); }); };
      var Q = F.PolyBattle; Q.aiUseSlots = function () {}; Q.slots = [117, 9, 21];'''); time.sleep(3)
    print(d.execute_script("return JSON.stringify(PolyBattle.oppFrame.contentWindow.__log.slice(0, 12))"))
    print(d.execute_script("var F = PolyBattle.oppFrame.contentWindow, cv = F.document.getElementsByTagName('canvas')[0]; return JSON.stringify({w: cv.width, h: cv.height, r: F.PolyBattle.api.slotRect(cv.width, cv.height), slots: F.PolyBattle.slots})"))
    print(d.execute_script("return JSON.stringify(PolyBattle.oppFrame.contentWindow.__snaps)"))
    print(d.execute_script("var F = PolyBattle.oppFrame.contentWindow; return JSON.stringify({raf: F.requestAnimationFrame.toString().slice(0,120), hasMsg: !!PolyBattle.opp.slotImg})"))
    print(d.execute_script('''var F = PolyBattle.oppFrame.contentWindow, cv = F.document.getElementsByTagName('canvas')[0], r = F.PolyBattle.api.slotRect(cv.width, cv.height); var o = F.document.createElement('canvas'); o.width = 250; o.height = 18; var x = o.getContext('2d'); x.drawImage(cv, r[0], r[1], r[2], r[3], 0, 0, 250, 18); var d = x.getImageData(0, 0, 250, 18).data, mx = 0; for (var i = 0; i < d.length; i += 4) mx = Math.max(mx, d[i], d[i+1], d[i+2]); var d0 = F.document.getElementsByTagName('canvas').length; return JSON.stringify({maxpix: mx, ncanv: d0})'''))
    url = d.execute_script("return PolyBattle.opp.slotImg")
    open('/tmp/bt/slotimg.png','wb').write(base64.b64decode(url.split(',')[1]))
    print(len(url))
finally:
    d.quit()
