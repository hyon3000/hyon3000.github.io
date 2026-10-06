import sys, time
exec(open('battle_flow.py').read().split("try:\n")[0].replace("page, tag, sy = sys.argv[1], sys.argv[2], float(sys.argv[3])","page, tag, sy = 'polynomino/game.html?battle=1','d',0.56").replace("pathlib.Path(__file__)","pathlib.Path('/home/a/Desktop/stuff/polycube/ndrl/x.py')"))
d.get("http://127.0.0.1:8778/"+page); time.sleep(6)
print(d.execute_script("return JSON.stringify({ready: window.__poly.state.ready, ss: window.__poly.state.startscreen, cw: window.__poly.state.canvasW, ch: window.__poly.state.canvasH})"))
print(d.execute_script("try { PolyBattle.begin(function(){}); return document.getElementById('bt-pair').style.display } catch(e) { return 'ERR '+e.stack }"))
d.quit()
