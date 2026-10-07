// Rule-based auto player for the T-Rex runner (Help > Cheat > Solve Automatically).
// It only uses the inputs a player has: jump (hold), duck / speed drop.  It decides once per game frame, right before the game updates.
//   cactus / low bird : jump when the obstacle front is closer than  K * speed - (obstacle width + dino width) / 2
//                       (the jump then peaks while the obstacle passes underneath); once it has been passed, press duck to drop faster
//   middle-height bird: duck until it has passed;   high bird: nothing (the dino runs underneath)
(function () {
  var P = { K: 20.5, pad: 0, dropGap: 6, duckDist: 130 };
  var Bot = { on: false, P: P, target: null, held: { jump: false, duck: false } };
  window.DinoBot = Bot;

  function key(code, type) { return { keyCode: code, type: type, target: document.body, preventDefault: function () {}, button: 0 }; }
  function press(r, code) { r.onKeyDown(key(code, 'keydown')); }
  function release(r, code) { r.onKeyUp(key(code, 'keyup')); }
  function setHeld(r, name, code, v) { if (Bot.held[name] === v) return; Bot.held[name] = v; if (v) press(r, code); else release(r, code); }

  function nextObstacle(r) {
    var t = r.tRex, obs = r.horizon.obstacles;
    for (var i = 0; i < obs.length; i++) if (obs[i].xPos + obs[i].width > t.xPos + 4) return obs[i];
    return null;
  }

  Bot.decide = function (r) {
    var t = r.tRex, o = nextObstacle(r), speed = r.currentSpeed;
    var dist = o ? o.xPos - (t.xPos + t.config.WIDTH) : 1e9;
    var type = o ? o.typeConfig.type : '', birdY = o ? o.yPos : 0;
    var bird = type === 'PTERODACTYL';
    var wantJump = false, wantDuck = false;
    if (o) {
      var trig = P.K * speed - (o.width + t.config.WIDTH) / 2 + P.pad;
      if (bird && birdY <= 60) { /* high bird: run underneath */ }
      else if (bird && birdY <= 80) { if (dist < P.duckDist + speed * 4) wantDuck = true; }
      else if (dist <= trig) wantJump = true;
    }
    if (t.jumping) {
      // fall faster (speed drop = the duck key in the air) as soon as the obstacle we jumped over is behind us, so that we are back on the ground in time for the next one
      var tg = Bot.target, behind = tg && tg.xPos + tg.width < t.xPos + 2;
      if (behind || (o && bird && birdY <= 80 && dist < P.duckDist)) { setHeld(r, 'jump', 38, false); setHeld(r, 'duck', 40, true); return; }
      setHeld(r, 'jump', 38, true); setHeld(r, 'duck', 40, false); return;
    }
    if (wantDuck) {                                                    // (a duck key that was pressed in the air for the speed drop does not duck the landed dino: press it again)
      if (!t.ducking) { if (Bot.held.duck) { Bot.held.duck = false; release(r, 40); } Bot.held.duck = true; press(r, 40); }
    } else setHeld(r, 'duck', 40, false);
    if (wantJump && !wantDuck) { Bot.target = o; setHeld(r, 'jump', 38, false); setHeld(r, 'jump', 38, true); }
    else setHeld(r, 'jump', 38, false);
  };

  // (the game calls Bot.decide(runner) before every fixed 1/60 s logic step: see Runner.prototype.logicStep in index.js)

  // start / restart (these do not run through update)
  Bot.timer = 0;
  Bot.tick = function () {
    var r = window.Runner.instance_; if (!r || !Bot.on) return;
    if (r.crashed) {
      Bot.held.jump = Bot.held.duck = false;
      if (performance.now() - r.time > 800) r.restart();
    } else if (!r.playing) {
      Bot.held.jump = false; press(r, 32); Bot.held.jump = true;
    }
  };
  Bot.start = function () { Bot.on = true; Bot.held.jump = Bot.held.duck = false; if (!Bot.timer) Bot.timer = setInterval(Bot.tick, 50); };
  Bot.stop = function () {
    Bot.on = false; if (Bot.timer) { clearInterval(Bot.timer); Bot.timer = 0; }
    var r = window.Runner.instance_; if (r && r.tRex) { if (Bot.held.duck) release(r, 40); if (Bot.held.jump) release(r, 38); }
    Bot.held.jump = Bot.held.duck = false;
  };
})();
