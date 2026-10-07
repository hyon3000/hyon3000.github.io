// ABOUT pages of the Atari games (same look as the ABOUT pages of Polynomino / Polycube: dark overlay, cyan headings, tap = next page).
// The game sets window.__atariAbout = page number (0 = hidden); window.ATARI_MODE = '2d' | '3d'.
(function () {
  const KO = /^ko/i.test(navigator.language || 'ko'), M3 = window.ATARI_MODE === '3d';
  const css = '.ao{display:none;position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.93);pointer-events:none;z-index:10;font-family:"Noto Sans KR","Malgun Gothic",sans-serif;color:#ddd;box-sizing:border-box}'
    + '.ao.v{display:flex;flex-direction:column}.ai{padding:3% 5%;flex:1;display:flex;flex-direction:column;justify-content:flex-start;overflow:hidden}'
    + '.ai h2{color:#0ff;font-size:1.15em;margin:0.3em 0 0.2em;border-bottom:1px solid #0ff4;padding-bottom:0.1em}.ai h3{color:#ff0;font-size:0.95em;margin:0.5em 0 0.1em}'
    + '.ai p{margin:0.15em 0;font-size:0.88em;line-height:1.5}.ai ul{padding-left:1em;margin:0.2em 0;font-size:0.85em}.ai li{margin:0.15em 0}.ai .hint{color:#666;font-size:0.7em;text-align:center;margin-top:auto;padding-top:0.3em}'
    + '.ai .key{display:inline-block;background:#333;border:1px solid #666;border-radius:2px;padding:0 0.3em;font-family:monospace;font-size:0.85em;color:#0ff}'
    + '.sw{display:inline-block;width:1.1em;height:0.62em;vertical-align:middle;margin-right:0.35em;border:1px solid #fff9}.ib{display:inline-block;width:0.95em;height:0.95em;border-radius:50%;vertical-align:middle;margin-right:0.4em;border:1px solid #fffc}'
    + '.it{display:flex;align-items:center;margin:0.2em 0;font-size:0.74em;line-height:1.25}.it b{display:block}';
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const ball = function (c, ring) { return '<span class="ib" style="background:radial-gradient(circle at 35% 35%,#fff,' + c + ' 40%,' + c + ');' + (ring ? 'border-color:#fff' : '') + '"></span>'; };
  const sw = function (c, extra) { return '<span class="sw" style="background:' + c + ';' + (extra || '') + '"></span>'; };
  const P = KO ? [
    '<h2>I. 아타리 브레이크아웃' + (M3 ? ' 3D' : ' 2D') + '</h2><p>' + (M3 ? '세로 통로의 바닥에 있는 판(패들)으로 공을 위로 쳐 올려 천장 아래의 큐브를 깹니다.' : '판(패들)으로 공을 튕겨 위쪽의 블록을 모두 깹니다.') + ' 공은 하나뿐입니다. 공을 처음 쏠 때 점수가 0점에서 시작하고, 공이 떨어지면 그대로 게임 오버이며 점수가 확정됩니다.</p>'
      + '<h2>II. 조작법</h2>' + (M3
        ? '<ul><li>판 근처를 <b>누르고 밀면</b> 판이 움직입니다(마우스를 올려놓기만 해서는 움직이지 않습니다).</li><li>판이 아닌 곳을 누르고 밀면 <b>시점이 회전</b>합니다(오른쪽 버튼 드래그도 회전).</li><li>왼쪽 아래의 지도는 시점과 함께 도는 바닥 지도입니다. 지도를 누르면 판이 그 자리로 갑니다.</li><li>발사: <span class="key">Space</span>, 또는 판을 누르고 움직이지 않고 떼기(탭).</li><li><span class="key">Q</span><span class="key">E</span> 시점 회전, <span class="key">P</span> 일시정지.</li><li><span class="key">F3</span> 자동 플레이(도움말 &gt; 치트 &gt; 자동으로 풀기): 강화학습 AI가 대신 칩니다. 화면을 누르면 직접 조작으로 돌아옵니다.</li></ul>'
        : '<ul><li>마우스 버튼을 누른 채 <b>드래그</b>하면 판이 움직입니다(마우스를 올려놓기만 해서는 움직이지 않습니다). 터치는 대고 밀면 됩니다.</li><li>누르고 움직이지 않으면(탭) 공이 발사됩니다.</li><li><span class="key">&larr;</span><span class="key">&rarr;</span> / <span class="key">A</span><span class="key">D</span> 이동, <span class="key">Space</span> 발사, <span class="key">P</span> 일시정지.</li><li><span class="key">F3</span> 자동 플레이(도움말 &gt; 치트 &gt; 자동으로 풀기): 강화학습으로 훈련한 AI가 대신 칩니다. 화면을 누르면 직접 조작으로 돌아옵니다.</li></ul>')
      + '<p class="hint">터치하면 다음 &rarr;</p>',
    '<h2>III. ' + (M3 ? '큐브' : '블록') + '</h2><ul><li>' + sw('hsl(120,100%,50%)') + sw('hsl(0,100%,50%)') + sw('hsl(210,100%,50%)') + '채도 100%의 색 — 1번 치면 깨집니다.</li><li>' + sw('#000') + '검정 — 2번.</li><li>' + sw('#fff') + '흰색 — 3번.</li><li>' + sw('#808080') + '회색 — 5번.</li></ul><p>맞을 때마다 표면에 균열이 생깁니다.</p>'
      + '<h3>줄 / 점수</h3><ul><li>' + (M3 ? '층(5층)' : '줄(5줄)') + '이 항상 유지됩니다. 가장 아래 ' + (M3 ? '층' : '줄') + '을 다 깨면 모든 블록이 한 칸 내려오고 맨 위에 새 ' + (M3 ? '층' : '줄') + '이 생깁니다. 공이 그 자리에 있으면 비켜날 때까지 기다립니다.</li><li>' + (M3 ? '층' : '줄') + '을 3번 깰 때마다 레벨이 올라 공이 빨라집니다.</li></ul><h3>점수</h3><ul><li>' + (M3 ? '층' : '줄') + '을 다 지우면 +100점</li><li>블록을 한 번 칠 때마다 +2점</li><li>1초가 지날 때마다 −1점(점수는 음수가 될 수 있습니다)</li></ul><p class="hint">터치하면 다음 &rarr;</p>',
    '<h2>IV. 아이템</h2><p style="font-size:0.78em;color:#aaa">블록 속에 들어 있다가 블록이 깨지면 공 모양으로 아래로 떨어집니다. ' + (M3 ? '판으로 받으면' : '판으로 받으면') + ' 적용됩니다. 블록마다 확률입니다.</p>'
      + '<div class="it">' + ball('#2a6eff') + '<span><b style="color:#f90">짧아짐 (2%)</b>판 길이가 현재의 절반이 됩니다.</span></div>'
      + '<div class="it">' + ball('#ff9614') + '<span><b style="color:#0ff">길어짐 (1%)</b>판 길이가 현재의 두 배가 됩니다.</span></div>'
      + '<div class="it">' + ball('#eb1e1e') + '<span><b style="color:#f90">판 숨김 (1%)</b>3초 동안 판이 완전히 사라집니다.</span></div>'
      + '<div class="it">' + ball('#28cd46') + '<span><b style="color:#f90">공 숨김 (1%)</b>5초 동안 공이 보이지 않습니다(그냥 안 보일 뿐입니다).</span></div>'
      + '<div class="it">' + ball('#000', 1) + '<span><b style="color:#0ff">공 강화 (1%)</b>30초 동안 공이 검은색이 되어 모든 블록을 한 번에 깹니다.</span></div>'
      + '<div class="it">' + ball('#ff69be') + '<span><b style="color:#f90">시간 가속 (2%)</b>30초 동안 시간이 두 배 빠르게 흐릅니다(공과 아이템이 두 배 빠름).</span></div>'
      + '<div class="it">' + ball('#00d2c8') + '<span><b style="color:#0ff">시간 감속 (1%)</b>30초 동안 시간이 절반 속도로 흐릅니다.</span></div>'
      + '<div class="it">' + ball('#a046eb') + '<span><b style="color:#0ff">정상화 (2%)</b>시간 속도와 판 길이가 모두 원래대로 돌아옵니다.</span></div>'
      + '<div class="it">' + ball('#ffffff', 1) + '<span><b style="color:#f90">가짜 공 (1%)</b>10초 동안 똑같이 생긴 가짜 공 두 개가 튀어나와 아무 데나 돌아다닙니다(블록도 못 깹니다). 10초 안에 또 먹으면 4개, 6개…로 늘어납니다.</span></div>'
      + '<p style="font-size:0.78em;color:#aaa">공이 떨어지면 게임이 끝납니다.</p><p class="hint">터치하면 처음으로 &rarr;</p>'
  ] : [
    '<h2>I. Atari Breakout ' + (M3 ? '3D' : '2D') + '</h2><p>' + (M3 ? 'Bounce the ball up with the paddle on the floor of a vertical shaft and break the cubes under the ceiling.' : 'Bounce the ball with the paddle and break the bricks.') + ' There is only one ball: the score starts from 0 when you shoot it for the first time, and when it falls the game is over and the score is final.</p>'
      + '<h2>II. Controls</h2>' + (M3
        ? '<ul><li><b>Press and slide</b> near the paddle to move it (just hovering the mouse does nothing).</li><li>Press and slide anywhere else to <b>rotate the view</b> (right-button drag rotates too).</li><li>The map at the bottom left is the floor map that rotates with the view. Press it and the paddle goes there.</li><li>Launch: <span class="key">Space</span>, or press the paddle and release without moving (tap).</li><li><span class="key">Q</span><span class="key">E</span> rotate view, <span class="key">P</span> pause.</li><li><span class="key">F3</span> auto play (Help &gt; Cheat &gt; Solve Automatically): an AI trained with reinforcement learning plays for you. Touching the field takes over.</li></ul>'
        : '<ul><li><b>Hold the mouse button and drag</b> to move the paddle (hovering does nothing). On touch screens put a finger down and slide.</li><li>A tap without moving launches the ball.</li><li><span class="key">&larr;</span><span class="key">&rarr;</span> / <span class="key">A</span><span class="key">D</span> move, <span class="key">Space</span> launch, <span class="key">P</span> pause.</li><li><span class="key">F3</span> auto play (Help &gt; Cheat &gt; Solve Automatically): an AI trained with reinforcement learning plays for you. Touching the field takes over.</li></ul>')
      + '<p class="hint">Tap to continue &rarr;</p>',
    '<h2>III. ' + (M3 ? 'Cubes' : 'Bricks') + '</h2><ul><li>' + sw('hsl(120,100%,50%)') + sw('hsl(0,100%,50%)') + sw('hsl(210,100%,50%)') + 'Fully saturated colours: 1 hit.</li><li>' + sw('#000') + 'Black: 2 hits.</li><li>' + sw('#fff') + 'White: 3 hits.</li><li>' + sw('#808080') + 'Gray: 5 hits.</li></ul><p>Cracks appear on the surface with every hit.</p>'
      + '<h3>' + (M3 ? 'Layers' : 'Rows') + ' / Score</h3><ul><li>Five ' + (M3 ? 'layers' : 'rows') + ' are always kept. Clear the bottom ' + (M3 ? 'layer' : 'row') + ' and everything moves down one step while a new ' + (M3 ? 'layer' : 'row') + ' appears at the top (if the ball is in that spot it waits until the ball is clear).</li><li>Every 3 clears raise the level and the ball gets faster.</li></ul><h3>Score</h3><ul><li>Clearing a ' + (M3 ? 'layer' : 'row') + ' completely: +100</li><li>Every hit on a brick: +2</li><li>Every second that passes: -1 (the score can go negative)</li></ul><p class="hint">Tap to continue &rarr;</p>',
    '<h2>IV. Items</h2><p style="font-size:0.78em;color:#aaa">Hidden inside bricks: when the brick breaks the item falls as a ball. Catch it with the paddle to apply it. Chances are per brick.</p>'
      + '<div class="it">' + ball('#2a6eff') + '<span><b style="color:#f90">Short (2%)</b>The paddle length becomes half of the current one.</span></div>'
      + '<div class="it">' + ball('#ff9614') + '<span><b style="color:#0ff">Long (1%)</b>The paddle length becomes double.</span></div>'
      + '<div class="it">' + ball('#eb1e1e') + '<span><b style="color:#f90">Paddle hide (1%)</b>The paddle disappears completely for 3 seconds.</span></div>'
      + '<div class="it">' + ball('#28cd46') + '<span><b style="color:#f90">Ball hide (1%)</b>The ball is invisible for 5 seconds (it is just not drawn).</span></div>'
      + '<div class="it">' + ball('#000', 1) + '<span><b style="color:#0ff">Power ball (1%)</b>For 30 seconds the ball is black and breaks every brick in one hit.</span></div>'
      + '<div class="it">' + ball('#ff69be') + '<span><b style="color:#f90">Time x2 (2%)</b>For 30 seconds time flows twice as fast (ball and items).</span></div>'
      + '<div class="it">' + ball('#00d2c8') + '<span><b style="color:#0ff">Time x1/2 (1%)</b>For 30 seconds time flows at half speed.</span></div>'
      + '<div class="it">' + ball('#a046eb') + '<span><b style="color:#0ff">Normalize (2%)</b>Time speed and paddle length both go back to normal.</span></div>'
      + '<div class="it">' + ball('#ffffff', 1) + '<span><b style="color:#f90">Fake balls (1%)</b>For 10 seconds two identical decoy balls pop out and roam anywhere (they break nothing). Catch more within 10 s and they add up: 4, 6, ...</span></div>'
      + '<p style="font-size:0.78em;color:#aaa">The game ends when the ball falls.</p><p class="hint">Tap to return &rarr;</p>'
  ];
  const vp = document.getElementById('viewport'), els = [];
  P.forEach(function (h, i) { const d = document.createElement('div'); d.className = 'ao'; d.innerHTML = '<div class="ai">' + h + '</div>'; vp.appendChild(d); els.push(d); });
  window.ATARI_ABOUT_PAGES = P.length;
  function fit() { const fs = Math.max(9, Math.floor(vp.clientWidth * 0.04)); els.forEach(function (e) { e.firstChild.style.fontSize = fs + 'px'; }); }
  fit(); window.addEventListener('resize', fit);
  (function poll() { const a = window.__atariAbout || 0; els.forEach(function (e, i) { e.classList.toggle('v', a === i + 1); }); requestAnimationFrame(poll); })();
})();
