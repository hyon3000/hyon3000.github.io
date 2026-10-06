import sys, time, pathlib, http.server, threading, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
root = pathlib.Path(__file__).parent.parent
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root)); h.log_message = lambda *a, **k: None
s = http.server.ThreadingHTTPServer(("127.0.0.1", 8967), h); threading.Thread(target=s.serve_forever, daemon=True).start()
o = Options(); o.add_argument("-headless"); d = webdriver.Firefox(options=o); d.set_window_size(900, 914)
try:
    d.get("http://127.0.0.1:8967/" + sys.argv[1]); time.sleep(5)
    d.execute_script("PolyBattle.begin(function(){ window.__poly.state.startscreen = 0; }); document.getElementById('bt-ai').click();"); time.sleep(6)
    print(d.execute_script("""var S=window.__poly.state, P=PolyBattle, out=[]; try{PolyBattle.oppFrame.contentWindow.PolyND.stop()}catch(e){} window.PolyND.stop(); for(var x=0;x<7;x++)for(var y=0;y<7;y++)for(var z=0;z<26;z++)S.blk[x][y][z]=0; S.blk[0][0][0]=5; S.blk[0][0][1]=5; P.api.applyStored(125); P.api.applyStored(116); return JSON.stringify([S.blk[0][0][0],S.blk[0][0][1],S.blk[0][0][2],S.blk[0][0][3]]);
      try{PolyBattle.oppFrame.contentWindow.PolyND.stop()}catch(e){} 
      var bot=function(){var b=S.blk, c=0; for(var x=0;x<7;x++)for(var y=0;y<7;y++){var v=b[x][y][0]; if(v&&v<256)c++;} return c};
      for(var i=0;i<40;i++){ var a=bot(); var tot=function(){return JSON.stringify(S.blk).split(',').filter(function(v){return +v>0&&+v<256}).length}; var t0=tot();
        P.api.applyStored(125); out.push([bot(), tot()-t0]); }
      return JSON.stringify(out)"""))
finally: d.quit()
