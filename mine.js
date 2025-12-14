
(function () {
  var Minefield;

  Minefield = (function () {
    function Minefield(window, game_status_changed_func, game_status_changed_func2) {
      this.window = window;
      this.question = true;
      this.game_status_changed_func = game_status_changed_func != null ? game_status_changed_func : null;
      this.game_status_changed_func2 = game_status_changed_func2 != null ? game_status_changed_func2 : null;
      this.game_status = -1;
      this.game_status2 = 0;
      this.table = null;
      this.on_click_func = null;
      this.on_rclick_func = null;

      // ★ 하얀지뢰(음수) 지원: 기본 0으로(하위호환)
      this.num_mines_white = 0;
      this.max_mines_white = 0;

      // ★ 흰/검 깃발 카운터(별도)
      this.num_flags_white = 0;
    }

    /* ---------- 분석/이론값 ---------- */
    Minefield.prototype.theoretical_max_zero_cells = function () {
      var C = this.columns, R = this.rows;
      var total = C * R;
      if (this.num_mines <= 0 && this.num_mines_white <= 0) return total;

      var black = Math.max(0, this.num_mines | 0);
      var white = Math.max(0, this.num_mines_white | 0);
      var M_black = Math.max(1, this.max_mines || 1);
      var M_white = Math.max(0, this.max_mines_white || 0);

      var M = Math.max(M_black, M_white || 1);
      var needed = Math.ceil((black + white) / (M || 1));

      function influenceArea(w, h) {
        var areaW = Math.min(C, w + 1);
        var areaH = Math.min(R, h + 1);
        return areaW * areaH;
      }

      var bestA = Infinity;
      var hMax = Math.min(R, needed);
      for (var h = 1; h <= hMax; h++) {
        var w = Math.ceil(needed / h);
        if (w > C) continue;
        var area = influenceArea(w, h);
        if (area < bestA) bestA = area;
      }

      var bestB = Infinity;
      if (C <= R) {
        var wB = Math.min(C, needed);
        var hB = Math.ceil(needed / wB);
        if (hB <= R) bestB = influenceArea(wB, hB);
      } else {
        var hB2 = Math.min(R, needed);
        var wB2 = Math.ceil(needed / hB2);
        if (wB2 <= C) bestB = influenceArea(wB2, hB2);
      }

      var best = Math.min(bestA, bestB);
      if (!isFinite(best)) {
        best = influenceArea(Math.min(C, needed), Math.ceil(needed / Math.min(C, needed)));
      }

      var zeroMax = total - best;
      return zeroMax < 0 ? 0 : zeroMax;
    };

    Minefield.prototype._rowsPerFrame = function () {
      var cols = this.columns || 1;
      var n = Math.floor(1000 / cols);
      if (n < 1) n = 1;
      return n;
    };

    // 1) 행 우선순위 구성
    Minefield.prototype._buildRowOrder = function (centerY, windowRows) {
      const H = this.rows;
      const inRange = [];
      const rest = [];
      const top = Math.max(0, centerY - windowRows);
      const bottom = Math.min(H - 1, centerY + windowRows);
      for (let y = 0; y < H; y++) {
        if (y >= top && y <= bottom) inRange.push(y);
        else rest.push(y);
      }
      return inRange.concat(rest);
    };

    // 2) 한 행 적용
    Minefield.prototype._applyRow = function (y, cellClassAtXY) {
      for (let x = 0; x < this.columns; x++) {
        const cls = cellClassAtXY(x, y);
        if (cls === null) {
          this.tds[x][y].removeAttribute("class");
        } else {
          if (this.tds[x][y].getAttribute("class") !== cls) {
            this.tds[x][y].setAttribute("class", cls);
          }
        }
      }
    };

    // 3) 점진 렌더
    Minefield.prototype._renderRowsIncrementally = function (rowOrder, cellClassAtXY, done) {
      let idx = 0;
      const step = () => {
        const budget = Math.min(rowOrder.length - idx, this._rowsPerFrame());
        for (let k = 0; k < budget; k++) {
          const y = rowOrder[idx++];
          this._applyRow(y, cellClassAtXY);
        }
        if (idx < rowOrder.length) {
          requestAnimationFrame(step);
        } else if (done) {
          done();
        }
      };
      requestAnimationFrame(step);
    };

    // ★ 인접 near 보정(부호 포함, 내부 파트 유지)
    Minefield.prototype._adjustNearAround = function (x, y, deltaSigned) {
      var adj = this.near_positions(x, y);
      for (var i = 0; i < adj.length; i++) {
        var nx = adj[i][0], ny = adj[i][1];
        this._near_black[nx][ny] += Math.max(0, deltaSigned); // deltaSigned>0 → 검은
        this._near_white[nx][ny] += Math.max(0, -deltaSigned); // deltaSigned<0 → 흰
      }
      this._rebuild_near_from_parts();
    };

    // ★ parts → near_mines 합성(0 vs 1000(상쇄0) 구분)
    Minefield.prototype._rebuild_near_from_parts = function () {
      this.near_mines = this.new_table();
      const hasWhite = (this.num_mines_white | 0) > 0;   // ← 가드 추가
      for (var x = 0; x < this.columns; x++) {
        for (var y = 0; y < this.rows; y++) {
          var b = this._near_black[x][y] | 0;
          var w = this._near_white[x][y] | 0;
          if (hasWhite && b === w && b > 0) {          // ← 흰지뢰 있을 때만 1000 사용
            this.near_mines[x][y] = 1000;
          } else {
            this.near_mines[x][y] = b - w;
          }
        }
      }
    };

    // 기존 함수 삭제/대체
    Minefield.prototype._adjustNearAroundColors = function (x, y, dBlack, dWhite) {
      var adj = this.near_positions(x, y);
      for (var i = 0; i < adj.length; i++) {
        var nx = adj[i][0], ny = adj[i][1];
        if (dBlack) this._near_black[nx][ny] += dBlack;
        if (dWhite) this._near_white[nx][ny] += dWhite;
      }
      this._rebuild_near_from_parts();
    };
    // (x,y)의 지뢰를 옮기고, 옵션에 따라 주변 8칸도 가능한 한 비우는 베스트-에포트
    Minefield.prototype._relocateFirstClick = function (x, y, clearNeighbors /*=false*/) {
      const W = this.columns, H = this.rows;
      const capB = Math.max(1, this.max_mines | 0);
      const capW = Math.max(0, this.max_mines_white | 0);

      // 3x3 금지영역(첫 클릭 주변)
      const forbid = {};
      forbid[x + "," + y] = true;
      if (clearNeighbors) {
        const adj = this.near_positions(x, y);
        for (let i = 0; i < adj.length; i++) forbid[adj[i][0] + "," + adj[i][1]] = true;
      }

      const inForbid = (cx, cy) => !!forbid[cx + "," + cy];

      // 대상칸이 주어진 색(signNeg) 지뢰를 추가 수용 가능한지(혼합 금지+CAP)
      function roomFor(self, cx, cy, signNeg) {
        const v = self.mines[cx][cy] | 0;
        if (signNeg) {                   // 흰 지뢰
          if (v > 0) return 0;          // 혼합 불가
          return Math.max(0, capW - Math.abs(v));
        } else {                         // 검은 지뢰
          if (v < 0) return 0;
          return Math.max(0, capB - Math.abs(v));
        }
      }

      // 한 번 스캔해서 후보지 목록을 만들어 두고 순차 소진(3x3 바깥)
      const targetsBySign = { black: [], white: [] };
      for (let ty = 0; ty < H; ty++) {
        for (let tx = 0; tx < W; tx++) {
          if (inForbid(tx, ty)) continue;
          // 두 색 모두 계산해 둠(필요할 때 room 재확인)
          targetsBySign.black.push([tx, ty]);
          targetsBySign.white.push([tx, ty]);
        }
      }

      const adjust = (cx, cy, dB, dW) => this._adjustNearAroundColors(cx, cy, dB, dW);

      // (sx,sy)에서 countSigned(부호 포함)를 바깥 후보로 분산 이동
      const moveOut = (sx, sy, countSigned) => {
        if (!countSigned) return 0;
        let left = Math.abs(countSigned);
        const isWhite = countSigned < 0;
        const bag = isWhite ? targetsBySign.white : targetsBySign.black;

        for (let i = 0; i < bag.length && left > 0; i++) {
          const tx = bag[i][0], ty = bag[i][1];
          const room = roomFor(this, tx, ty, isWhite);
          if (room <= 0) continue;

          const vSrc = this.mines[sx][sy] | 0;
          const take = Math.min(room, left);

          // src 감소, dst 증가 (증분 near 갱신)
          if (isWhite) {
            // 흰 이동
            this.mines[sx][sy] = vSrc + take;            // (vSrc는 음수→0에 가까워짐)
            this.mines[tx][ty] = (this.mines[tx][ty] | 0) - take;
            adjust(sx, sy, 0, -take);
            adjust(tx, ty, 0, +take);
          } else {
            // 검은 이동
            this.mines[sx][sy] = vSrc - take;            // (vSrc는 양수→0에 가까워짐)
            this.mines[tx][ty] = (this.mines[tx][ty] | 0) + take;
            adjust(sx, sy, -take, 0);
            adjust(tx, ty, +take, 0);
          }

          // remaining 보정: 0→지뢰 or 지뢰→0 변화만 반영
          if (vSrc !== 0 && this.mines[sx][sy] === 0) this.remaining += 1;
          if (this.mines[tx][ty] !== 0 && ((this.mines[tx][ty] - (isWhite ? -take : +take)) === 0)) {
            // 이전이 0이었다면 이제 지뢰가 생김
            this.remaining -= 1;
          }

          left -= take;
        }
        return (Math.abs(countSigned) - left); // 실제로 옮긴 개수
      };

      // 1) 클릭 칸은 반드시 비움(전량 이동 성공해야 true)
      const m0 = this.mines[x][y] | 0;
      if (m0 !== 0) {
        const moved = moveOut(x, y, m0);
        if (moved !== Math.abs(m0)) {
          // 클릭 칸 비우기 실패 → 되돌리진 않고 false만 반환(호출측에서 폴백)
          // 안전을 위해 마지막에 near 재합성
          this._rebuild_near_from_parts();
          return false;
        }
      }

      // 2) 주변 8칸은 "가능한 한" 비우기(요구사항: 시도만)
      if (clearNeighbors) {
        const adj = this.near_positions(x, y);
        for (let i = 0; i < adj.length; i++) {
          const nx = adj[i][0], ny = adj[i][1];
          const mv = this.mines[nx][ny] | 0;
          if (mv === 0) continue;
          // 전량 이동을 시도하되, 일부만 옮겨도 OK (best-effort)
          moveOut(nx, ny, mv);
        }
      }

      // 안전망: 합성(1000 처리 포함)
      this._rebuild_near_from_parts();
      return true;
    };


    // 현재 판에서 "주변 지뢰 합 0" & 자기칸 0
    Minefield.prototype.count_zero_no_neighbor = function () {
      var cnt = 0;
      for (var x = 0; x < this.columns; x++) {
        for (var y = 0; y < this.rows; y++) {
          if (this.mines[x][y] === 0 && this.near_mines[x][y] === 0) cnt++;
        }
      }
      return cnt;
    };

    // 흰/검 인접 체크
    Minefield.prototype.has_neighbor_mine = function (x, y, signNeg) {
      var adj = this.near_positions(x, y);

      var wantSign = signNeg ? -1 : +1; // 우리가 놓으려는 지뢰의 부호
      var hasSame = false;

      for (var i = 0; i < adj.length; i++) {
        var nx = adj[i][0], ny = adj[i][1];
        var v = this.mines[nx][ny] | 0;
        if (v === 0) continue;
        var s = (v > 0) ? +1 : -1;

        // 1) 다른 색 발견 → 즉시 false
        if (s !== wantSign) return false;

        // 2) 같은 색 기록
        hasSame = true;
      }

      // 2,3 규칙 통합: 같은 색 있으면 true, 아니면 false
      return hasSame;
    };

    /* ---------- 기본 테이블 유틸 ---------- */
    Minefield.prototype.new_table = function () {
      var x, y, _i, _ref, _results;
      _results = [];
      for (x = _i = 1, _ref = this.columns; 1 <= _ref ? _i <= _ref : _i >= _ref; x = 1 <= _ref ? ++_i : --_i) {
        _results.push((function () {
          var _j, _ref1, _results1;
          _results1 = [];
          for (y = _j = 1, _ref1 = this.rows; 1 <= _ref1 ? _j <= _ref1 : _j >= _ref1; y = 1 <= _ref1 ? ++_j : --_j) {
            _results1.push(0);
          }
          return _results1;
        }).call(this));
      }
      return _results;
    };

    /* ---------- 초기화 ---------- */
    // 흰지뢰 인자 추가(하위호환 OK)
    Minefield.prototype.init_board = function (columns, rows, num_mines, max_mines, num_mines_white, max_mines_white, nopick_level) {
      this._adj = null; this._adjW = this._adjH = -1;
      this.use_nopick = (nopick_level === 2);
      this.infinite_reloc = (nopick_level === 1);
      this.columns = columns;
      this.rows = rows;
      this.num_mines = num_mines | 0;
      this.max_mines = (max_mines != null ? max_mines : 1) | 0;
      this.num_mines_white = Math.max(0, (num_mines_white | 0) || 0);
      this.max_mines_white = Math.max(0, (max_mines_white | 0) || 0);

      this._ensureWorkBuffers();
      return this.reset_board();
    };

    Minefield.prototype._ensureWorkBuffers = function () {
      const size = this.columns * this.rows;
      if (!this._visit || this._visit.length !== size) {
        this._visit = new Uint32Array(size);
        this._visitGen = 1;
        this._queueX = new Int32Array(size);
        this._queueY = new Int32Array(size);
      }
    };

    // ★ [수정] Chording 프리뷰 표시 (안 열린 칸에서도 시각적 효과 발생)
    Minefield.prototype.preview_chord = function (x, y) {
      this.clear_chord_preview();

      // 대상: 주변 8칸 + 자기 자신 = 총 9칸
      // concat을 사용하여 중심 좌표 [x,y]를 포함시킵니다.
      var targets = this.near_positions(x, y).concat([[x, y]]);

      for (var i = 0; i < targets.length; i++) {
        var tx = targets[i][0], ty = targets[i][1];

        // "안 열린" 칸이면서 "깃발이 없는" 경우에만 눌린 모양(.pressed) 적용
        if (!this.is_opened(tx, ty)) {
          var cls = this.get_class(tx, ty);
          // 깃발(flag-*)이 아닌 경우에만 (null은 닫힌 빈칸, flag-0은 물음표)
          // 깃발이 꽂혀있다면 눌린 모습으로 변하지 않음
          if (cls === null) {
        this.tds[tx][ty].classList.add("pressed");
        this._chord_preview_cells.push([tx, ty, "pressed"]);
      }
      // ? 칸
      else if (cls === "flag-0") {
        this.tds[tx][ty].classList.add("flag0pressed");
        this._chord_preview_cells.push([tx, ty, "flag0pressed"]);
      }
        }
      }
    };

    // ★ [추가] Chording 프리뷰 해제
    Minefield.prototype.clear_chord_preview = function () {
      if (!this._chord_preview_cells) this._chord_preview_cells = [];
      while (this._chord_preview_cells.length > 0) {
        var pos = this._chord_preview_cells.pop();
        var td = this.tds[pos[0]][pos[1]];
        if (td) td.classList.remove("pressed");
        if (td) td.classList.remove("flag0pressed");
      }
    };

    // ★ [수정] Chording 실행 (로직은 그대로두되, 안 열린 칸 방어 코드 확인)
    Minefield.prototype.execute_chord = function (x, y) {
      this.clear_chord_preview(); // 프리뷰 해제 (눌린 모양 복구)
      if (this.game_status === 1) {
        // 맵 생성 (status가 0으로 변경됨)
        this.start(x, y);
        // 상태 변경 알림 (타이머 시작)
        this.on_game_status_changed();
        // 맵만 생성하고 타이머만 올린 뒤 실제 칸은 열지 않고 종료
        return;
      }

      // 1. 중심이 열린 칸이어야만 기능 동작 (안 열린 칸에서 떼면 여기서 리턴되어 아무 일도 없음)
      if (!this.is_opened(x, y)) return;

      // 2. 주변 깃발 개수 계산 (검은:+1, 흰:-1)
      var flagSum = 0;
      var anyFlag = false;
      var adj = this.near_positions(x, y);

      for (var i = 0; i < adj.length; i++) {
        var nx = adj[i][0], ny = adj[i][1];
        var f = this.flags[nx][ny] || 0;
        if (f !== 0) {
          anyFlag = true;
          flagSum += f;
        }
      }

      // 3. 중심 숫자(near_mines)와 비교
      var centerVal = this.near_mines[x][y];
      var target = (centerVal === 1000) ? 0 : centerVal;

      var match = (flagSum === target);
      if (centerVal === 1000 && !anyFlag) match = false;

      if (match) {
        // 주변 모두 열기
        for (var i = 0; i < adj.length; i++) {
          var nx = adj[i][0], ny = adj[i][1];
          if ((this.flags[nx][ny] || 0) !== 0) continue;
          if (!this.is_opened(nx, ny)) {
            if (this.expand(nx, ny) < 0) {
              this.gameover(nx, ny);
              break;
            }
          }
        }
        if (this.remaining === 0) this.gameclear();
      }
    };

    // ★ [교체] 이벤트 핸들러 로직 전면 재작성
// ★ [교체] 이벤트 핸들러 로직 전면 재작성
Minefield.prototype._attachDelegatedEvents = function () {
  if (!this.table) return;
  var tbl = this.table;
  var self = this;

  if (this._delegated) this._detachDelegatedEvents();

  function getXYFrom(td) {
    var x = td && td.dataset ? parseInt(td.dataset.x, 10) : NaN;
    var y = td && td.dataset ? parseInt(td.dataset.y, 10) : NaN;
    return [x, y];
  }

  // ===== [NEW] 버튼 상태를 "물리/가상"으로 분리 =====
  var leftDown = false;        // 물리 좌버튼
  var rightDown = false;       // 물리 우버튼
  var midDown = false;         // 물리 중버튼
  var shiftMidDown = false;    // ★ Shift+좌클릭(눌림 순간 shiftKey=true) 을 "가상 중버튼"으로 취급

  function midAnyDown() { return midDown || shiftMidDown; }
  function stateBits() {
    return (leftDown ? 1 : 0) | (rightDown ? 2 : 0) | (midAnyDown() ? 4 : 0);
  }
  var isChording = false;
// ★ [NEW] 이번 제스처에서 chording이 한번이라도 실행되었는지
  //    실행되면, 우클릭 제외(좌/중) 버튼이 모두 올라갈 때까지 좌클릭 일반클릭을 무시
  var chordConsumed = false;
  // ★ [추가됨] 우클릭 딜레이 처리를 위한 타이머 변수
  var rightClickTimer = null;

  // --- 터치 관련 상태 ---
  var touchTimer = null;
  var lastTapTime = 0;
  var lastTapPos = null;
  var touchStartPos = null;
  var isLongPress = false;

  // ★ 이동 취소용 상태
  var touchStartClient = null;
  var touchMovedTooFar = false;
  var MOVE_CANCEL_DIST = 10; // px 이상 움직이면 클릭/깃발 취소

  // --- 마우스 이벤트 핸들러 ---

  var onMouseDown = function (e) {
    if (e.button === 1) {
      e.preventDefault();
    }

    var td = e.target.closest('td');
    if (!td || !tbl.contains(td)) return;
    var pos = getXYFrom(td);
    var x = pos[0], y = pos[1];
    if (Number.isNaN(x)) return;

    // 버튼 상태 업데이트
    // ★ Shift+좌클릭을 "중클릭처럼" 처리하는 것은
    //   "좌 버튼 다운 순간에 shiftKey가 true" AND "다른 버튼이 이미 눌려있지 않을 때"만.
    //   (규칙 1,4 반영: 좌->shift는 무시, shift+우/중도 무시)
    if (e.button === 0) {
      // 우클릭 딜레이 취소(기존 로직 유지: 동시 클릭 의도)
      if (rightClickTimer !== null) {
        clearTimeout(rightClickTimer);
        rightClickTimer = null;
      }

      if (e.shiftKey && !leftDown && !rightDown && !midAnyDown()) {
        // 규칙 2,3: shift->좌클릭은 가상 중클릭
        shiftMidDown = true;
      } else {
        // 규칙 1: 좌클릭 먼저면 shift 무시
        leftDown = true;
      }
    }
    if (e.button === 2) {
    rightDown = true;

      // 좌/중(가상중 포함) 중 하나라도 이미 눌려있으면 깃발 동작 스킵(기존의 "좌 눌림이면 스킵" 확장)
      if (!(leftDown)) {
        // ★ [수정됨] 1. 우클릭 Press 처리 (20ms 딜레이 추가)
        rightClickTimer = setTimeout(function () {
          self.on_rclick(x, y);
          rightClickTimer = null;
        }, 20);
      }  
    }
    if (e.button === 1) midDown = true;


    // ★ [수정됨] 2. 좌클릭 Press 처리 (우클릭 딜레이 취소 로직)
    if (e.button === 0) {
      // 만약 대기 중인 우클릭 타이머가 있다면 취소! (동시 클릭 의도로 간주)
      if (rightClickTimer !== null) {
        clearTimeout(rightClickTimer);
        rightClickTimer = null;
        // 여기서 우클릭 깃발 꽂기는 취소되지만, 
        // mouseState에는 이미 Left(1)와 Right(2)가 모두 들어있으므로
        // 아래 로직에서 자연스럽게 Chording으로 넘어갑니다.
      }
    }

    // 3. Chording 조건 체크
    var bits = stateBits();
    if (((bits & 1) && (bits & 2)) || (bits & 4)) {
      isChording = true;
      self.preview_chord(x, y);
    }

    self.on_down(x, y, e.button === 2);
  };

  var onMouseUp = function (e) {
    if (e.button === 1) e.preventDefault();

    var td = e.target.closest('td');
    var pos = td ? getXYFrom(td) : [-1, -1];
    var x = pos[0], y = pos[1];
    // ★ 현재 up 이벤트 전에 어떤 버튼이 눌려있었는지 스냅샷
    var wasLeft = leftDown;
    var wasShiftMid = shiftMidDown;
    var wasMid = midDown;
    // 코딩 실행 조건: "좌+우 눌린 상태에서 하나라도 뗌" 또는 "중클릭 뗌"
    if (isChording) {
      if (x !== -1) self.execute_chord(x, y);
      self.clear_chord_preview();
      isChording = false;
      chordConsumed = true;
    }
    else {
      // 일반 클릭 처리 (좌클릭 release)
      if (x !== -1) {
        var isRealLeftRelease = (e.button === 0 && wasLeft && !wasShiftMid);
        if (isRealLeftRelease && !rightDown) {
          if (!chordConsumed) {
            self.on_click(x, y);
          }
        }
      }
    }

    // 상태 비트 해제
    if (e.button === 0) {
      // 좌 버튼 up가 왔을 때:
      // - shiftMidDown이 켜져 있었다면 "가상 중버튼"을 내리는 것으로 처리 (규칙 3)
      if (wasShiftMid) shiftMidDown = false;
      else leftDown = false;
    } else if (e.button === 1) {
      midDown = false;
    } else if (e.button === 2) {
      rightDown = false;
    }
if (chordConsumed && !leftDown && !midAnyDown()) {
      chordConsumed = false;
    }
    self.on_up(x, y);
  };

  var onMouseOut = function (e) {
    self.clear_chord_preview();
  };

  var onContextMenu = function (e) { e.preventDefault(); };

  // --- 터치 이벤트 핸들러 ---

  var onTouchStart = function (e) {
    if (e.touches.length > 1) return;
    var td = e.target.closest('td');
    if (!td) return;
    var pos = getXYFrom(td);
    var x = pos[0], y = pos[1];

    touchStartPos = [x, y];
    isLongPress = false;

    // ★ 처음 터치한 화면 좌표 저장 (드래그 감지용)
    var t = e.touches[0];
    touchStartClient = { x: t.clientX, y: t.clientY };
    touchMovedTooFar = false;

    self.on_down(x, y, false);

    touchTimer = setTimeout(function () {
      // ★ 이동이 이미 너무 멀어졌으면 롱프레스도 무시
      if (touchMovedTooFar) return;

      isLongPress = true;
      if (navigator.vibrate) navigator.vibrate(50);
     // self.on_rclick(x, y);
    }, 500);
  };

  // ★ 새로 추가: 이동 중 거리 체크 (드래그 시 클릭/깃발 취소)
  var onTouchMove = function (e) {
    if (!touchStartClient || e.touches.length !== 1) return;

    var t = e.touches[0];
    var dx = t.clientX - touchStartClient.x;
    var dy = t.clientY - touchStartClient.y;
    var dist2 = dx * dx + dy * dy;

    if (!touchMovedTooFar && dist2 > MOVE_CANCEL_DIST * MOVE_CANCEL_DIST) {
      // 임계값 넘어가면 이 제스처는 "스크롤/드래그"로 취급
      touchMovedTooFar = true;

      // 롱프레스 취소
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
      isLongPress = false;

      // 눌림 상태 해제
      self.on_up();
    }
  };

  var onTouchEnd = function (e) {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }

    // ★ 이동이 너무 많았으면 이 터치는 게임판에 아무 영향도 주지 않음
    if (touchMovedTooFar) {
      touchStartPos = null;
      touchStartClient = null;
      touchMovedTooFar = false;
      isLongPress = false;
      self.on_up();
      return;
    }

    self.on_up();

    var td = document.elementFromPoint(
      e.changedTouches[0].clientX,
      e.changedTouches[0].clientY
    );
    if (!td) return;
    td = td.closest('td');
    if (!td || !tbl.contains(td)) return;

    var pos = getXYFrom(td);
    var x = pos[0], y = pos[1];

    if (!touchStartPos || touchStartPos[0] !== x || touchStartPos[1] !== y) return;

    if (isLongPress) {
      self.on_rclick(x, y);
      e.preventDefault();
      return;
    }

    var currentTime = new Date().getTime();
    var tapLength = currentTime - lastTapTime;

    if (lastTapPos && lastTapPos[0] === x && lastTapPos[1] === y && tapLength < 300 && tapLength > 0) {
      if (self.is_opened(x, y)) {
        self.execute_chord(x, y);
      } else {
        self.on_click(x, y);
      }
      lastTapTime = 0;
    } else {
      if (!self.is_opened(x, y)) {
        self.on_click(x, y);
      }
      lastTapTime = currentTime;
      lastTapPos = [x, y];
    }

    e.preventDefault();
  };

  tbl.addEventListener('mousedown', onMouseDown);
  tbl.addEventListener('mouseup', onMouseUp);
  tbl.addEventListener('mouseout', onMouseOut);
  tbl.addEventListener('contextmenu', onContextMenu);

  tbl.addEventListener('touchstart', onTouchStart, { passive: false });
  tbl.addEventListener('touchmove', onTouchMove, { passive: false });
  tbl.addEventListener('touchend', onTouchEnd, { passive: false });

  this._delegated = {
    onMouseDown,
    onMouseUp,
    onMouseOut,
    onContextMenu,
    onTouchStart,
    onTouchMove,
    onTouchEnd
  };
};

Minefield.prototype._detachDelegatedEvents = function () {
  if (!this.table || !this._delegated) return;
  var d = this._delegated;
  this.table.removeEventListener('mousedown', d.onMouseDown);
  this.table.removeEventListener('mouseup', d.onMouseUp);
  this.table.removeEventListener('mouseout', d.onMouseOut);
  this.table.removeEventListener('contextmenu', d.onContextMenu);
  this.table.removeEventListener('touchstart', d.onTouchStart);
  this.table.removeEventListener('touchmove', d.onTouchMove);
  this.table.removeEventListener('touchend', d.onTouchEnd);
  this._delegated = null;
};

    // 점진적 테이블 생성
    Minefield.prototype._buildTableIncrementally = function (done) {
      const batchRows = 40;
      let y = 0;
      const tbl = this.table;
      const cols = this.columns;
      const rows = this.rows;

      const step = () => {
        const frag = document.createDocumentFragment();
        const yEnd = Math.min(rows, y + batchRows);

        for (; y < yEnd; y++) {
          const tr = document.createElement('tr');
          for (let x = 0; x < cols; x++) {
            const td = document.createElement('td');
            td.setAttribute('id', 'x' + x + 'y' + y);
            td.dataset.x = x;
            td.dataset.y = y;
            this.tds[x][y] = td;
            tr.appendChild(td);
          }
          frag.appendChild(tr);
        }

        tbl.appendChild(frag);

        if (y < rows) {
          requestAnimationFrame(step);
        } else {
          this.window.appendChild(tbl);
          if (typeof done === "function") done();
        }
      };

      requestAnimationFrame(step);
    };

    // reset_board
    Minefield.prototype.reset_board = function () {
      // ▼▼▼ [추가] 리셋 시 이전 자동 풀이 데이터와 매크로 상태를 강제 초기화 ▼▼▼
      this._nopick_trace = null;      // 이전 풀이 경로 삭제
      this._macro_running = false;    // 자동 풀기 매크로 중지
      if (this._macro_timer) { clearInterval(this._macro_timer); this._macro_timer = null; }
      // ▲▲▲▲▲▲
      this.opened_cells = 0;
      this.reloc_used = 0;
      this.opened_safe = 0;
      this.total_safe = 0;
      // 모드1에서도 보너스는 0으로 시작 (열린 칸 수로만 허용량 증가)
      this.bonus_reloc_count = 0;
      // 모드1 전용: 연속 구제 횟수 제한(최대 2)
      this._consecutive_reloc = 0;
      this.bonus_thresholds = this.compute_bonus_thresholds();

      this.num_flags = 0;
      this.num_flags_white = 0;
      this.flags = this.new_table();     // 부호 있는 깃발값(>0 검은, <0 흰)
      this.near_flags = this.new_table();     // 합(부호 포함)
      this.tds = this.new_table();

      // 내부 near parts
      this._near_black = this.new_table();
      this._near_white = this.new_table();

      this._ensureWorkBuffers();

      if (this.table) {
        this.window.removeChild(this.table);
        this.game_status = -1;
        this.table = null;
      }

      this.table = document.createElement('table');
      this.table.setAttribute("class", "minetable");

      this.num_flags = 0;
      this.num_flags_white = 0;
      this.flags = this.new_table();
      this.near_flags = this.new_table();
      this.tds = this.new_table();
      this._near_black = this.new_table();
      this._near_white = this.new_table();

      this._buildTableIncrementally(function () {
        // 후보 여러 판 생성 후 best 선택
        var bestZero = -1;
        var bestMines = null;
        var bestNearB = null, bestNearW = null;
        var bestNear = null;
        var bestRemaining = 0;

        var retryMap = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 12, 6: 18 };
        if (this.use_nopick === true) retryMap = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
        var retries = retryMap[Math.min(this.max_mines + this.max_mines_white, 6)] || 1;

        for (var attempt = 0; attempt < retries; attempt++) {

          this.init_mines(); // mines/near_mines/_near_black/_near_white/remaining 갱신
          var curZero = this.count_zero_no_neighbor();
          if (curZero > bestZero) {
            bestZero = curZero;
            bestMines = JSON.parse(JSON.stringify(this.mines));
            bestNearB = JSON.parse(JSON.stringify(this._near_black));
            bestNearW = JSON.parse(JSON.stringify(this._near_white));
            bestNear = JSON.parse(JSON.stringify(this.near_mines));
            bestRemaining = this.remaining;
          }
        }

        if (bestMines) {
          this.mines = bestMines;
          this._near_black = bestNearB;
          this._near_white = bestNearW;
          this.near_mines = bestNear;
          this.remaining = bestRemaining;
          this.game_status = 1;
        }

        this.on_game_status_changed();
        this._attachDelegatedEvents();
      }.bind(this));


    };

    /* ---------- 상태 체크 ---------- */
    Minefield.prototype.is_opened = function (x, y) {
      var c = this.get_class(x, y);
      if (c === null) return false;
      if (/^flag/.test(c)) return false;
      if (c === "empty") return true;
      if (c === "pressed") return true;
      if (/^near-/.test(c)) return true;
      return false;
    };

    Minefield.prototype.has_opened_neighbor = function (x, y) {
      var adj = this.near_positions(x, y);
      for (var i = 0; i < adj.length; i++) {
        var nx = adj[i][0], ny = adj[i][1];
        if (this.is_opened(nx, ny)) return true;
      }
      return false;
    };

    /* ---------- 조합/후보 선택(지뢰 재배치) ---------- */
    Minefield.prototype._combinations_pick = function (candidates, m) {
      var res = [];
      function dfs(start, path) {
        if (path.length === m) { res.push(path.slice()); return; }
        for (var i = start; i <= candidates.length - (m - path.length); i++) {
          path.push(candidates[i]);
          dfs(i + 1, path);
          path.pop();
        }
      }
      if (m <= candidates.length && m > 0) dfs(0, []);
      return res;
    };

    // 색상 구분 후보 추출
    // 후보 추출: 성능 튜닝(랜덤 샘플 → 실패 많으면 선형 스캔), 총 10칸 제한
    // - 소스 8방향은 예외/최우선 후보(조건 맞으면 모두 포함)
    // - 그 외는 "열린 칸 인접 아님" + 색 혼합 금지 + CAP 미만
    // - 총 반환 개수: 최대 10개(소스 우선)
    Minefield.prototype._pick_reloc_candidates = function (srcX, srcY, isWhite) {
      var cap = isWhite ? this.max_mines_white : this.max_mines;
      var LIMIT_TOTAL = 10;

      function canAccept(self, cx, cy) {
        var v = self.mines[cx][cy];
        if ((isWhite && v > 0) || (!isWhite && v < 0)) return false; // 색 혼합 금지
        return Math.abs(v) < cap; // CAP 미만
      }
      function isUnopenedOrFlag(self, cx, cy) {
        var cls = self.get_class(cx, cy);
        return (cls === null) || /^flag/.test(cls) || (cls === "flag-0");
      }

      // 소스 8방향(예외/최우선)
      var nearSrc = this.near_positions(srcX, srcY);
      var nearSrcSet = {};
      for (var i = 0; i < nearSrc.length; i++) {
        nearSrcSet[nearSrc[i][0] + "," + nearSrc[i][1]] = true;
      }

      // 1) 소스 8방향에서 조건 충족 전부 수집
      var priority0 = [];
      for (var i0 = 0; i0 < nearSrc.length; i0++) {
        var nx = nearSrc[i0][0], ny = nearSrc[i0][1];
        if (!isUnopenedOrFlag(this, nx, ny)) continue;
        if (!canAccept(this, nx, ny)) continue;
        priority0.push([nx, ny]);
      }

      // 총 한도에서 소스 후보만큼 먼저 차감
      var remainSlots = Math.max(0, LIMIT_TOTAL - priority0.length);
      if (remainSlots === 0) {
        // 10개 꽉 찼으면 소스 8방향만 반환(랜덤 약간 섞기)
        shuffle(priority0);
        return priority0;
      }

      // 2) 그 외 후보는…
      //    - 소스 8방향 제외
      //    - 소스 셀 자체 제외
      //    - 이미 열린 칸 인접(X)
      //    - 위 조건 + 수용 가능
      function isEligibleRest(self, cx, cy) {
        if (cx === srcX && cy === srcY) return false;
        if (nearSrcSet[cx + "," + cy]) return false;
        if (!isUnopenedOrFlag(self, cx, cy)) return false;
        if (!canAccept(self, cx, cy)) return false;
        // 열린 칸에 인접하면 제외
        if (self.has_opened_neighbor(cx, cy)) return false;
        return true;
      }

      // 전체 안 열린 칸 수를 대강 파악(10개보다 작으면 그 수만큼만 뽑게)
      var unopenedCount = 0;
      // (너무 큰 판에서 전수 세기 비용이 크면 생략 가능하지만,
      //  여기서는 O(WH) 1회가 허용 가능하다고 보고 간단히 셉니다.)
      for (var by = 0; by < this.rows; by++) {
        for (var bx = 0; bx < this.columns; bx++) {
          if (bx === srcX && by === srcY) continue;
          var cls0 = this.get_class(bx, by);
          if ((cls0 === null) || /^flag/.test(cls0) || (cls0 === "flag-0")) unopenedCount++;
        }
      }
      // 남은 슬롯 상한을 전체 안 열린 칸 수로도 한 번 더 클램프
      remainSlots = Math.min(remainSlots, Math.max(0, unopenedCount));

      // 랜덤 샘플링으로 시도
      var rest = [];
      var used = {}; // 중복 방지
      var tries = 0;
      var FAIL_LIMIT = Math.max(1000, remainSlots * 200); // 실패 많이 나면 선형 스캔 전환
      while (rest.length < remainSlots && tries < FAIL_LIMIT) {
        var rx = (Math.random() * this.columns) | 0;
        var ry = (Math.random() * this.rows) | 0;
        var key = rx + "," + ry;
        if (used[key]) { tries++; continue; }
        used[key] = 1;

        if (isEligibleRest(this, rx, ry)) {
          rest.push([rx, ry]);
        } else {
          tries++;
        }
      }

      // 랜덤으로 충분히 못 채웠다면, 선형 스캔으로 보충(앞에서부터 차곡차곡)
      if (rest.length < remainSlots) {
        for (var cy = 0; cy < this.rows && rest.length < remainSlots; cy++) {
          for (var cx = 0; cx < this.columns && rest.length < remainSlots; cx++) {
            var k2 = cx + "," + cy;
            if (used[k2]) continue; // 랜덤에서 이미 시도한 좌표면 패스
            if (isEligibleRest(this, cx, cy)) {
              rest.push([cx, cy]);
            }
          }
        }
        // 만약 조건에 맞는 칸이 부족하면, 그냥 있는 만큼만 사용(규칙대로)
      }

      shuffle(priority0);
      shuffle(rest);

      // 총 10칸(또는 그보다 적은 수)으로 합치기
      // 소스 8방향(우선) + 나머지
      var out = priority0.slice(0, LIMIT_TOTAL);
      var need = LIMIT_TOTAL - out.length;
      for (var i2 = 0; i2 < rest.length && need > 0; i2++, need--) {
        out.push(rest[i2]);
      }
      return out;

      // ---- 유틸: 셔플 ----
      function shuffle(a) {
        for (var i = a.length - 1; i > 0; i--) {
          var j = (Math.random() * (i + 1)) | 0;
          var t = a[i]; a[i] = a[j]; a[j] = t;
        }
      }
    };


    /* ---------- 구제 규칙 ---------- */
    Minefield.prototype.get_reloc_allowed = function () {
      // ★ 모드1(무한구제)일 때: 열린 칸 20개마다 1회 허용
      if (this.infinite_reloc === true) {
        var opened = this.opened_cells | 0;
        return Math.floor(opened / 20) * 1;
      }
      else{
        var mm = Math.max(1, (this.max_mines + this.max_mines_white) || 1);
        if (mm == 1) mm = 10000;
        else if (mm == 2) mm = 2000;
        else if (mm == 3) mm = 400;
        else if (mm == 4) mm = 300;
        else if (mm == 5) mm = 225;
        else if (mm == 6) mm = 167;
        else mm = 126;

        var base = Math.floor(this.opened_cells / mm);
        var bonus = this.bonus_reloc_count || 0;
        return base + bonus;
      }
    };

    Minefield.prototype.compute_bonus_thresholds = function () {
      var mm = Math.max(1, (this.max_mines + this.max_mines_white) || 1);
      if (mm <= 2) return [0.997];
      else if (mm <= 4) return [0.99, 0.997];
      else if (mm <= 6) return [0.95, 0.99, 0.999];
      else if (mm <= 8) return [0.93, 0.99, 0.993, 0.999];
      else if (mm <= 10) return [0.9, 0.93, 0.99, 0.993, 0.999];
      else return [0.7, 0.9, 0.93, 0.99, 0.993, 0.999];
    };

    /* ---------- 지뢰 재배치(구제) ---------- */
    Minefield.prototype.try_relocate_from = function (x, y) {
      var mSigned = this.mines[x][y];
      var m = Math.abs(mSigned);
      if (m <= 0) return false;

      var isWhite = (mSigned < 0);
      var cap = isWhite ? this.max_mines_white : this.max_mines;

      var cand = this._pick_reloc_candidates(x, y, isWhite);
      if (cand.length < m) return false;

      var affected = {};
      var self = this;

      function addNeighbors(px, py) {
        var adj = self.near_positions(px, py);
        for (var i = 0; i < adj.length; i++) {
          var nx = adj[i][0], ny = adj[i][1];
          if (self.is_opened(nx, ny)) affected[nx + "," + ny] = [nx, ny];
        }
      }
      addNeighbors(x, y);
      for (var c = 0; c < cand.length; c++) addNeighbors(cand[c][0], cand[c][1]);

      var combos = this._combinations_pick(cand, m);

      for (var ci = 0; ci < combos.length; ci++) {
        var picks = combos[ci];

        var okSlots = true;
        for (var p = 0; p < picks.length; p++) {
          var px = picks[p][0], py = picks[p][1];
          var next = this.mines[px][py] + (isWhite ? -1 : +1);
          if (Math.sign(this.mines[px][py]) !== 0 && Math.sign(next) !== Math.sign(this.mines[px][py])) { okSlots = false; break; }
          if (Math.abs(next) > cap) { okSlots = false; break; }
        }
        if (!okSlots) continue;

        var allSame = true;

        // --- (직전 코드 동일) ---
        var allSame = true;

        // 소스 이웃(합/절댓값에 공통으로 빠질 대상) 표시
        var decNeighbors = {};
        var adjXY = this.near_positions(x, y);
        for (var i2 = 0; i2 < adjXY.length; i2++) {
          decNeighbors[adjXY[i2][0] + "," + adjXY[i2][1]] = true;
        }

        // 타깃별 이웃에 “몇 개” 들어가는지 카운트
        var incCount = {};
        for (var q = 0; q < picks.length; q++) {
          var ax = picks[q][0], ay = picks[q][1];
          var adjA = this.near_positions(ax, ay);
          for (var r = 0; r < adjA.length; r++) {
            var key = adjA[r][0] + "," + adjA[r][1];
            incCount[key] = (incCount[key] || 0) + 1;
          }
        }

        // 유틸: 현재 절댓값 합(near_abs) 계산
        function currentAbsAt(self, cx, cy) {
          var adj = self.near_positions(cx, cy);
          var s = 0;
          for (var u = 0; u < adj.length; u++) {
            var vx = adj[u][0], vy = adj[u][1];
            s += Math.abs(self.mines[vx][vy]);
          }
          return s;
        }

        // 공개된(열린) 영향 칸들 확인
        for (var key in affected) {
          var pos = affected[key];
          var ox = pos[0], oy = pos[1];

          var origSent = this.near_mines[ox][oy];        // 1000 / 0 / ±n
          var origSum = (origSent === 1000 ? 0 : origSent);
          var curAbs = currentAbsAt(this, ox, oy);

          // 합 변화량
          var deltaSum = 0;
          if (decNeighbors[key]) deltaSum -= mSigned; // 소스 제거(부호 포함)
          var incC = incCount[key] || 0;              // 타깃 추가 개수
          deltaSum += isWhite ? -incC : incC;

          // 절댓값 합 변화량(색 불문 동일하게 증가/감소)
          var deltaAbs = 0;
          if (decNeighbors[key]) deltaAbs -= Math.abs(mSigned);
          deltaAbs += incC;

          var finalSum = origSum + deltaSum;
          var finalAbs = curAbs + deltaAbs;

          var ok = true;
          if (origSent === 1000) {
            // 상쇄0은 "보이는 값 0" + "실존 지뢰 존재"
            ok = (finalSum === 0 && finalAbs > 0);
          } else if (origSent === 0) {
            // 진짜0은 인접 지뢰가 아예 없어야 함
            ok = (finalSum === 0 && finalAbs === 0);
          } else {
            // 숫자칸은 숫자 보존(부호/값 동일)
            ok = (finalSum === origSum);
          }

          if (!ok) { allSame = false; break; }
        }
        // --- (이후 기존 코드 흐름 동일) ---

        if (!allSame) continue;

        var temp = JSON.parse(JSON.stringify(this.mines));
        var newly = {};

        temp[x][y] = 0;
        for (var s = 0; s < picks.length; s++) {
          var tx = picks[s][0], ty = picks[s][1];
          if (temp[tx][ty] === 0) newly[tx + "," + ty] = true;
          temp[tx][ty] += (isWhite ? -1 : +1);
        }

        // 커밋
        this.mines = temp;

        // parts 재계산
        this._near_black = this.new_table();
        this._near_white = this.new_table();
        for (var xx = 0; xx < this.columns; xx++) {
          for (var yy = 0; yy < this.rows; yy++) {
            var v = this.mines[xx][yy];
            if (v === 0) continue;
            var adj = this.near_positions(xx, yy);
            var addB = Math.max(0, v);
            var addW = Math.max(0, -v);
            for (var k = 0; k < adj.length; k++) {
              var nx = adj[k][0], ny = adj[k][1];
              this._near_black[nx][ny] += addB;
              this._near_white[nx][ny] += addW;
            }
          }
        }
        this._rebuild_near_from_parts();

        var deltaRemaining = 1 - Object.keys(newly).length;
        this.remaining += deltaRemaining;

        return true;
      }
      return false;
    };

    /* ---------- 지뢰 뿌리기 ---------- */
    // ★ 지뢰 배치: 1) 원본 랜덤(n2/클러스터) → 2) 선형 보충 → 3) 강제 통합/비우기
    // + 마지막에 "최소 1칸 비워두기" 보장
    Minefield.prototype.init_mines = function () {
      var x, y;

      // 공용 상태 초기화
      this.mines = this.new_table();
      this.remaining = this.rows * this.columns;
      this._near_black = this.new_table();
      this._near_white = this.new_table();

      const W = this.columns, H = this.rows;
      const capBlack = Math.max(1, this.max_mines | 0);
      const capWhite = Math.max(0, this.max_mines_white | 0);
      const totalBlack = Math.max(0, this.num_mines | 0);
      const totalWhite = Math.max(0, this.num_mines_white | 0);

      // ----- 유틸리티 -----
      const val = (xx, yy) => this.mines[xx][yy];
      const set = (xx, yy, v) => { this.mines[xx][yy] = v; };
      function canAdd(self, xx, yy, signNeg) {
        const v = self.mines[xx][yy];
        if (signNeg) {
          if (v > 0) return false;                 // 혼합 금지
          return Math.abs(v) < capWhite;
        } else {
          if (v < 0) return false;                 // 혼합 금지
          return Math.abs(v) < capBlack;
        }
      }
      function addOne(self, xx, yy, signNeg) {
        const v = self.mines[xx][yy];
        if (v === 0) self.remaining -= 1;          // 새로 지뢰 생기는 칸
        self.mines[xx][yy] = v + (signNeg ? -1 : +1);
      }
      const hasZeroCell = () => {
        for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (this.mines[xx][yy] === 0) return true;
        return false;
      };
      const oppSignNeg = (neg) => !neg;
      const signCap = (neg) => neg ? capWhite : capBlack;

      // 1단계에서 무한루프 방지용(“막히기 전까지”만 1단계 유지)
      const randStallLimit = Math.max(2000, Math.floor(W * H * 8));

      // ----- 3단계 포함한 증강 배치 루틴 -----
      const placeColorEnhanced = (TOTAL, CAP, signNeg) => {
        let created = 0;

        // ===== 1) 원본 랜덤 뿌리기 (요청: n2/클러스터링 로직 그대로) =====
        //  - 단, 혼합 금지/용량 체크는 색별 규칙으로 반영
        let n2 = W * H * 220 / 480;      // 전체칸수 * 220/480
        let stall = 0;
        while (created < TOTAL && stall < randStallLimit) {
          x = (Math.random() * W) | 0;
          y = (Math.random() * H) | 0;

          const cur = this.mines[x][y];
          // 색 혼합 금지
          if ((signNeg && cur > 0) || (!signNeg && cur < 0)) { stall++; continue; }
          // 용량 체크
          let curAbs = Math.abs(cur);
          if (curAbs >= CAP) { stall++; continue; }

          let n_max = Math.min(CAP - curAbs, TOTAL - created);
          let n;
          if ((TOTAL - created) > n2) { n = n_max; n2 -= 0.5; }   // 비율만큼은 최대치로 채우기
          else { n = Math.floor(Math.random() * n_max) + 1; }

          // 클러스터링 확률(주변에 지뢰 없으면 건너뜀)
          if (n >= 2) {
            var p = (n === 2 ? 0.2 :
              n === 3 ? 0.5 :
                n === 4 ? 0.5 :
                  n === 5 ? 0.5 :
                    n === 6 ? 0.5 : 0);
            if (Math.random() < p) {
              if (!this.has_neighbor_mine(x, y, signNeg)) {
                stall++; continue;
              }
            }
          }

          if (this.mines[x][y] === 0) this.remaining -= 1;
          this.mines[x][y] += (signNeg ? -n : +n);
          created += n;
          stall = 0; // 성공했으니 stall 리셋
        }
        if (created >= TOTAL) return created;

        // ===== 2) 선형 스윕으로 보충 =====
        for (let yy = 0; yy < H && created < TOTAL; yy++) {
          for (let xx = 0; xx < W && created < TOTAL; xx++) {
            while (created < TOTAL && canAdd(this, xx, yy, signNeg)) {
              addOne(this, xx, yy, signNeg);
              created++;
            }
          }
        }
        if (created >= TOTAL) return created;

        // ===== 3) 강제 통합/비우기(상대색 재배치로 빈칸 만든 뒤 내 색 채워 넣기) =====
        let safety = W * H * 4; // 무한루프 방지
        while (created < TOTAL && safety-- > 0) {
          // 3-a) 비울 상대색 칸(작은 수량부터) 찾기
          let freedX = -1, freedY = -1, freedHad = 0;
          find_source:
          for (let want = 1; want <= signCap(oppSignNeg(signNeg)); want++) {
            for (let yy = 0; yy < H; yy++) {
              for (let xx = 0; xx < W; xx++) {
                const v = val(xx, yy);
                if (signNeg ? v <= 0 : v >= 0) continue; // 상대색만
                if (Math.abs(v) !== want) continue;

                // 이 칸의 상대색 지뢰를 다른 곳(CAP 범위 내)으로 전부 옮길 수 있는지 확인
                let remain = Math.abs(v);
                for (let y2 = 0; y2 < H && remain > 0; y2++) {
                  for (let x2 = 0; x2 < W && remain > 0; x2++) {
                    if (x2 === xx && y2 === yy) continue;
                    const vv = val(x2, y2);
                    const cap = signCap(oppSignNeg(signNeg));
                    if (signNeg ? vv < 0 : vv > 0) {
                      const room = cap - Math.abs(vv);
                      if (room > 0) remain -= Math.min(room, remain);
                    } else if (vv === 0) {
                      // 빈칸도 상대색으로 채워 수용 가능
                      remain -= Math.min(cap, remain);
                    }
                  }
                }
                if (remain <= 0) { freedX = xx; freedY = yy; freedHad = Math.abs(v); break find_source; }
              }
            }
          }
          if (freedX === -1) break; // 더는 불가

          // 3-b) 실제로 상대색을 분산해 freed 칸 비우기
          {
            const oppNeg = oppSignNeg(signNeg);
            let remain = freedHad;

            // 기존 상대색 칸부터 CAP까지 채우기
            for (let yy = 0; yy < H && remain > 0; yy++) {
              for (let xx = 0; xx < W && remain > 0; xx++) {
                if (xx === freedX && yy === freedY) continue;
                const vv = val(xx, yy);
                if (oppNeg ? vv < 0 : vv > 0) {
                  const cap = signCap(oppNeg);
                  const room = cap - Math.abs(vv);
                  if (room > 0) {
                    const mv = Math.min(room, remain);
                    set(xx, yy, vv + (oppNeg ? -mv : +mv));
                    remain -= mv;
                  }
                }
              }
            }
            // 부족하면 빈칸을 상대색으로 신규 채우기
            for (let yy = 0; yy < H && remain > 0; yy++) {
              for (let xx = 0; xx < W && remain > 0; xx++) {
                if (xx === freedX && yy === freedY) continue;
                const vv = val(xx, yy);
                if (vv !== 0) continue;
                const cap = signCap(oppNeg);
                const mv = Math.min(cap, remain);
                set(xx, yy, (oppNeg ? -mv : +mv));
                this.remaining -= 1; // 새로 지뢰 생김
                remain -= mv;
              }
            }

            // 원본 칸 비우기
            if (val(freedX, freedY) !== 0) {
              set(freedX, freedY, 0);
              this.remaining += 1;
            }
          }

          // 3-c) 비워진 칸에 내 색으로 채우기
          while (created < TOTAL && canAdd(this, freedX, freedY, signNeg)) {
            addOne(this, freedX, freedY, signNeg);
            created++;
          }
        }

        return created;
      };

      // 배치 순서: 검은 → 흰 (검은 우선)
      placeColorEnhanced(totalBlack, capBlack, /*signNeg=*/false);
      if (totalWhite > 0 && capWhite > 0) {
        placeColorEnhanced(totalWhite, capWhite, /*signNeg=*/true);
      }

      // ===== ★ 최종 보정: "최소 1칸은 비워 두기" 보장 =====
      if (!hasZeroCell()) {
        const tryFreeOneCellBySign = (signNeg) => {
          const cells = [];
          for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
            const v = val(xx, yy);
            if (v === 0) continue;
            if (signNeg ? (v < 0) : (v > 0)) cells.push([xx, yy, Math.abs(v)]);
          }
          cells.sort((a, b) => a[2] - b[2]); // 적은 수부터

          for (let idx = 0; idx < cells.length; idx++) {
            const [sx, sy, need] = cells[idx];
            const cap = signCap(signNeg);
            let remain = need;

            // 수용 가능성 체크
            for (let yy = 0; yy < H && remain > 0; yy++) {
              for (let xx = 0; xx < W && remain > 0; xx++) {
                if (xx === sx && yy === sy) continue;
                const vv = val(xx, yy);
                if (signNeg) {
                  if (vv > 0) continue;
                  const room = cap - Math.abs(vv);
                  if (room > 0) remain -= Math.min(room, remain);
                } else {
                  if (vv < 0) continue;
                  const room = cap - Math.abs(vv);
                  if (room > 0) remain -= Math.min(room, remain);
                }
              }
            }
            if (remain > 0) continue;

            // 실제 분산
            let left = need;
            for (let yy = 0; yy < H && left > 0; yy++) {
              for (let xx = 0; xx < W && left > 0; xx++) {
                if (xx === sx && yy === sy) continue;
                const vv = val(xx, yy);
                const room = cap - Math.abs(vv);
                if (room > 0 && (signNeg ? vv <= 0 : vv >= 0)) {
                  const mv = Math.min(room, left);
                  set(xx, yy, vv + (signNeg ? -mv : +mv));
                  if (vv === 0 && mv > 0) this.remaining -= 1;
                  left -= mv;
                }
              }
            }
            // 원본 비우기
            if (val(sx, sy) !== 0) {
              set(sx, sy, 0);
              this.remaining += 1;
            }
            return true;
          }
          return false;
        };

        if (!tryFreeOneCellBySign(false)) { // 검은
          if (!tryFreeOneCellBySign(true)) { // 흰
            // (매우 드묾) 상대색을 재배치해 빈칸을 만든다 — 생략 안전가드
            for (let sign of [true, false]) {
              let done = false;
              const cap = signCap(sign);
              outer:
              for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
                const v = val(xx, yy);
                if (v === 0) { done = true; break outer; }
                if (sign ? v < 0 : v > 0) {
                  let remain = Math.abs(v);
                  for (let y2 = 0; y2 < H && remain > 0; y2++)
                    for (let x2 = 0; x2 < W && remain > 0; x2++) {
                      if (x2 === xx && y2 === yy) continue;
                      const vv = val(x2, y2);
                      if (sign ? (vv > 0) : (vv < 0)) continue;
                      const room = cap - Math.abs(vv);
                      if (room > 0) remain -= Math.min(room, remain);
                    }
                  if (remain === 0) {
                    let left = Math.abs(v);
                    for (let y2 = 0; y2 < H && left > 0; y2++)
                      for (let x2 = 0; x2 < W && left > 0; x2++) {
                        if (x2 === xx && y2 === yy) continue;
                        const vv = val(x2, y2);
                        if (sign ? (vv > 0) : (vv < 0)) continue;
                        const room = cap - Math.abs(vv);
                        if (room > 0) {
                          const mv = Math.min(room, left);
                          set(x2, y2, vv + (sign ? -mv : +mv));
                          if (vv === 0 && mv > 0) this.remaining -= 1;
                          left -= mv;
                        }
                      }
                    set(xx, yy, 0);
                    this.remaining += 1;
                    done = true;
                    break outer;
                  }
                }
              }
              if (done) break;
            }
          }
        }
      }

      // --- parts(근방 수) 재계산 ---
      this._near_black = this.new_table();
      this._near_white = this.new_table();
      for (var xx = 0; xx < this.columns; xx++) {
        for (var yy = 0; yy < this.rows; yy++) {
          var v = this.mines[xx][yy];
          if (v === 0) continue;
          var adj = this.near_positions(xx, yy);
          var addB = Math.max(0, v);
          var addW = Math.max(0, -v);
          for (var k = 0; k < adj.length; k++) {
            var nx = adj[k][0], ny = adj[k][1];
            this._near_black[nx][ny] += addB;
            this._near_white[nx][ny] += addW;
          }
        }
      }
      this._rebuild_near_from_parts();

      // total_safe
      this.total_safe = 0;
      for (var i = 0; i < this.columns; i++) {
        for (var j = 0; j < this.rows; j++) {
          if (this.mines[i][j] === 0) this.total_safe++;
        }
      }

      this.game_status = 1;
      return this.game_status;
    };
    // ★ 붙여넣기용: "no-pick(찍기 없음) 보드" 생성기 (빠른판)
    // 조건:
    //  - 무작위 보드는 기존 this.init_mines()를 그대로 사용해 생성
    //  - 첫 클릭 (firstX, firstY) 및 주변 8칸은 반드시 지뢰 0(=진짜 0, 상쇄0 금지)
    //  - 보드가 '추론만으로' 풀리는지 빠른 검증(경량 규칙 + 존재성 DFS)
    //  - fallback(폴백) 금지: solvable한 보드를 찾을 때까지 '무한히' 시도
    //  - solvable 보드가 나오면, 추론 근거 트리를 console에 로그로 출력
    //  - 음수지뢰 존재하면 일부규칙(delta) 사용불가(1인 칸이 2검은지뢰+1하얀지뢰 가능)
    // ★ 붙여넣기용: "no-pick(찍기 없음) 보드" 생성기 (빠른판)
    /* =========================
     * [NEW] 서명 있는 정수 도메인 전파 (GAC via bitset DP)
     *  - vars: [ [x,y], ... ]
     *  - cons: [ { vars:[idx...], target:int, isAbs:bool }, ... ]
     *  - capB, capW: 각 색 최대치
     * 반환: { progressed, decided: [{x,y,type:"open"|"fix", val:0|k}] }
     * ========================= */
    Minefield.prototype._enforceGACSigned = function (vars, cons, capB, capW) {
      if (!vars.length || !cons.length) return { progressed: false, decided: [] };

      const n = vars.length;
      const OFF = capW;                  // 음수 오프셋
      const MINV = -capW, MAXV = capB;   // 값 범위
      const RANGE = MAXV - MINV + 1;     // 도메인 길이

      // 도메인: 각 변수의 값 가능여부를 불리언 배열로
      const dom = Array.from({ length: n }, () => new Uint8Array(RANGE).fill(1));

      // 초기 도메인(이미 확정된 게 있으면 반영)
      // - 이 블록은 안전: 없으면 그대로 둡니다.
      // - 필요 시 외부 fixedKnown/fixedVal를 참고하려면 훅 연결
      //   (여기서는 solve 루프가 setFixed로 반영하므로, dom은 full로 시작)
      let changed = false;

      // 비트셋 DP 유틸
      function dpAchievableSum(varIds, excludeIdx) {
        // 결과: { any: Uint8Array, allZero: Uint8Array }
        // any[s+SHIFT] = 나머지 합 s 가능(어떤 값이든)
        // allZero[...] = 나머지 변수 전부 0만 써서 합 s 가능 (즉 s==0인 원소만 true일 수 있음)
        const SHIFT = OFF * (varIds.length - (excludeIdx >= 0 ? 1 : 0));
        const width = (capB * (varIds.length - (excludeIdx >= 0 ? 1 : 0))) + (capW * (varIds.length - (excludeIdx >= 0 ? 1 : 0))) + 1;
        const any = new Uint8Array(width);
        const zro = new Uint8Array(width);
        any[OFF * (varIds.length - (excludeIdx >= 0 ? 1 : 0))] = 1; // 합 0
        zro[OFF * (varIds.length - (excludeIdx >= 0 ? 1 : 0))] = 1; // 모두 0일 때 합 0

        function convolveAdd(dst, src, valMask) {
          // 값 마스크를 한 번에 밀어넣기 (작은 도메인 범위이므로 단순 이중루프가 충분히 빠름)
          const W = dst.length;
          const tmp = new Uint8Array(W);
          for (let v = MINV; v <= MAXV; v++) {
            if (!valMask[v - MINV]) continue;
            const sh = v;
            for (let i = 0; i < W; i++) {
              const j = i + sh;
              if (j >= 0 && j < W && src[i]) tmp[j] = 1;
            }
          }
          for (let i = 0; i < W; i++) dst[i] = tmp[i];
        }

        let idxPos = 0;
        for (let k = 0; k < varIds.length; k++) {
          if (k === excludeIdx) continue;
          const id = varIds[k];
          // any
          const any2 = new Uint8Array(any.length);
          convolveAdd(any2, any, dom[id]);
          any.set(any2);

          // allZero(=모두 0만 허용) 업데이트: 해당 변수가 0을 허용할 때만 유지
          const allowsZero = !!dom[id][-MINV]; // v==0 → index -MINV
          if (!allowsZero) {
            zro.fill(0);
          } else {
            // 0 더하기는 그대로 유지(합 이동 없음)
            // zro 그대로
          }
          idxPos++;
        }
        return { any, allZero: zro };
      }

      // 제약마다 prefix/suffix로 others 합을 빠르게 계산
      function pruneByConstraint(c) {
        const ids = c.vars, m = ids.length;
        if (!m) return false;
        let localChanged = false;

        // prefix/suffix DP: any/allZero 둘 다 유지
        const prefAny = new Array(m + 1), prefZ = new Array(m + 1);
        const sufAny = new Array(m + 1), sufZ = new Array(m + 1);

        // 시작(공집합): 합0만 가능
        const baseLen = capB * m + capW * m + 1;
        const baseShift = capW * m;
        prefAny[0] = new Uint8Array(baseLen); prefAny[0][baseShift] = 1;
        prefZ[0] = new Uint8Array(baseLen); prefZ[0][baseShift] = 1;

        for (let i = 0; i < m; i++) {
          const dstA = new Uint8Array(baseLen), dstZ = new Uint8Array(baseLen);
          const mask = dom[ids[i]];

          // any
          for (let v = MINV; v <= MAXV; v++) {
            if (!mask[v - MINV]) continue;
            const sh = v;
            for (let s = 0; s < baseLen; s++) {
              const t = s + sh; if (t >= 0 && t < baseLen && prefAny[i][s]) dstA[t] = 1;
            }
          }
          // allZero (값 0만 허용)
          const allowsZero = !!mask[-MINV];
          if (allowsZero) {
            for (let s = 0; s < baseLen; s++) if (prefZ[i][s]) dstZ[s] = 1;
          } // else → 전부 0은 불가(전부 0 경로 소멸)

          prefAny[i + 1] = dstA; prefZ[i + 1] = dstZ;
        }

        sufAny[m] = new Uint8Array(baseLen); sufAny[m][baseShift] = 1;
        sufZ[m] = new Uint8Array(baseLen); sufZ[m][baseShift] = 1;
        for (let i = m - 1; i >= 0; i--) {
          const dstA = new Uint8Array(baseLen), dstZ = new Uint8Array(baseLen);
          const mask = dom[ids[i]];
          for (let v = MINV; v <= MAXV; v++) {
            if (!mask[v - MINV]) continue;
            const sh = v;
            for (let s = 0; s < baseLen; s++) {
              const t = s + sh; if (t >= 0 && t < baseLen && sufAny[i + 1][s]) dstA[t] = 1;
            }
          }
          const allowsZero = !!mask[-MINV];
          if (allowsZero) {
            for (let s = 0; s < baseLen; s++) if (sufZ[i + 1][s]) dstZ[s] = 1;
          }
          sufAny[i] = dstA; sufZ[i] = dstZ;
        }

        // 각 변수별로 “나머지 합의 가능집합”을 얻고, 값별로 생존성 체크
        const T = c.target | 0;
        for (let i = 0; i < m; i++) {
          const id = ids[i];
          const cur = dom[id];
          if (!cur) continue;

          // others = prefix(i) * suffix(i+1)
          const W = baseLen;
          const othersAny = new Uint8Array(W);
          const othersZ = new Uint8Array(W);
          // 합성: 간단히 둘 다 & 로 교차(동일 길이, 같은 기준)
          for (let s = 0; s < W; s++) {
            if (prefAny[i][s] && sufAny[i + 1][s]) othersAny[s] = 1;
            if (prefZ[i][s] && sufZ[i + 1][s]) othersZ[s] = 1;
          }

          // 값별 생존성 확인
          for (let v = MINV; v <= MAXV; v++) {
            const idx = v - MINV;
            if (!cur[idx]) continue; // 이미 배제됨
            const need = T - v;
            const pos = need + baseShift;
            let ok = false;

            if (pos >= 0 && pos < W) {
              if (!c.isAbs) {
                // abs 제약 없음 → othersAny 에 있으면 됨
                ok = !!othersAny[pos];
              } else {
                // abs>0 → (v!=0 && othersAny) || (v==0 && othersAny && !othersZ)
                if (v !== 0) {
                  ok = !!othersAny[pos];
                } else {
                  ok = !!(othersAny[pos] && !othersZ[pos]);
                }
              }
            }

            if (!ok) { cur[idx] = 0; localChanged = true; }
          }

          // 도메인이 전부 날아가면 이 제약에서 fail → 상위 루프에서 처리
          let anyLeft = false; for (let t = 0; t < RANGE; t++) if (cur[t]) { anyLeft = true; break; }
          if (!anyLeft) return { fail: true };
        }

        return localChanged;
      }

      // 고정점까지 반복
      for (let iter = 0; iter < 12; iter++) {
        let any = false;
        for (let ci = 0; ci < cons.length; ci++) {
          const r = pruneByConstraint(cons[ci]);
          if (r && r.fail) return { progressed: false, decided: [], fail: true };
          if (r) any = any || r;
        }
        if (!any) break;
        changed = changed || any;
      }

      // 결론 적용
      const decided = [];
      for (let id = 0; id < n; id++) {
        let cnt = 0, last = -9999;
        for (let i = 0; i < RANGE; i++) if (dom[id][i]) { cnt++; last = i; }
        if (cnt === 0) return { progressed: false, decided: [], fail: true };
        if (cnt === 1) {
          const v = (last + MINV) | 0;
          const [x, y] = vars[id];
          if (v === 0) {
            decided.push({ x, y, type: "open", val: 0 });
          } else {
            decided.push({ x, y, type: "fix", val: v });
          }
        }
      }

      return { progressed: changed || decided.length > 0, decided };
    };

    Minefield.prototype._refresh_parts_from_mines = function () {
      this._near_black = this.new_table();
      this._near_white = this.new_table();
      const W = this.columns, H = this.rows;

      for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) {
          const v = this.mines[x][y];
          if (v === 0) continue;
          const addB = v > 0 ? v : 0;
          const addW = v < 0 ? -v : 0;
          const adj = this.near_positions(x, y);
          for (let k = 0; k < adj.length; k++) {
            const nx = adj[k][0], ny = adj[k][1];
            this._near_black[nx][ny] += addB;
            this._near_white[nx][ny] += addW;
          }
        }
      }
      this._rebuild_near_from_parts();
    };
    Minefield.prototype.init_mines_nopick = function (firstX, firstY) {
      const hasWhites = ((this.num_mines_white | 0) > 0);  // 흰지뢰 존재 여부
      const W = this.columns | 0, H = this.rows | 0;
      const capB = Math.max(1, this.max_mines | 0);        // 칸당 검은 지뢰 최대
      const capW = Math.max(0, this.max_mines_white | 0);  // 칸당 흰 지뢰 최대
      const classicMode = (!hasWhites) && (capB === 1);  // 클래식 모드(칸당 0/1, 흰지뢰 없음)
const totalBlack = Math.max(0, this.num_mines | 0);
  const totalWhite = Math.max(0, this.num_mines_white | 0);
  // --- 3x3 보호칸 개수(가장자리면 9보다 작음) ---
  let protect = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = firstX + dx, y = firstY + dy;
    if (x >= 0 && y >= 0 && x < W && y < H) protect++;
  }
  const outside = (W * H - protect)*0.65; //65%의 여유 칸수
  const needB = needCells(totalBlack, capB);
  const needW = needCells(totalWhite, capW);
  const infeasible =
    (needB + needW > outside) ||                 // 검/흰이 서로 같은 칸을 못 쓰므로 합이 outside를 넘으면 불가
    (totalBlack > outside * capB) ||             // 검은 용량 한계
    (totalWhite > outside * capW);               // 흰 용량 한계(흰이 있으면)

  if (infeasible) {
    console.warn("[nopick] impossible config for 3x3-safe first click. fallback.");

    // ✅ 폴백 1: 찍기없음 모드 규칙(3x3 보장)을 포기하고 일반 보드로 진행
    // (원하면 여기서 '첫칸만 안전' 같은 완화 규칙으로 바꿀 수도 있음)
    this.use_nopick = false;
    this.init_mines();
    this._rebuild_near_from_parts();
    // start/expand가 어차피 첫 클릭 구제를 처리하므로 여기서 return
    return 1;
  }
  // --- 색 혼합 금지 + cap 고려한 "필요 최소 점유 칸수" ---
  function needCells(total, cap) {
    if (total <= 0) return 0;
    if (cap <= 0) return Infinity;
    return Math.ceil(total / cap);
  }
      // ===== 유틸 =====
      const idx = (x, y) => y * W + x;
      const inBounds = (x, y) => (x >= 0 && y >= 0 && x < W && y < H);

      const rebuildParts = () => {
        this._near_black = this.new_table();
        this._near_white = this.new_table();
        for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
          const v = this.mines[x][y] | 0;
          if (!v) continue;
          const addB = v > 0 ? v : 0;
          const addW = v < 0 ? -v : 0;
          const adj = this.near_positions(x, y);
          for (let i = 0; i < adj.length; i++) {
            const nx = adj[i][0], ny = adj[i][1];
            this._near_black[nx][ny] += addB;
            this._near_white[nx][ny] += addW;
          }
        }
        this._rebuild_near_from_parts();
      };

      // 첫 3x3이 전부 0(지뢰 없음)인지
      const first3x3AllZero = (X, Y) => {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = X + dx, y = Y + dy;
          if (!inBounds(x, y)) continue;
          if ((this.mines[x][y] | 0) !== 0) return false;
        }
        return true;
      };

      // ===== 추론 로거(결정 근거 트리) =====
      const Trace = [];
      function pushTrace(kind, payload) { Trace.push({ kind, ...payload }); }
      function dumpTraceToConsole() {
        const BATCH_SIZE = 30; // 30줄씩 묶어 출력
        const total = Trace.length;
        if (total === 0) return;

        console.groupCollapsed(`[Minesweeper] 추론 근거 트리 (${total} entries)`);

        let buffer = [];
        const flush = () => {
          if (buffer.length > 0) {
            console.log(buffer.join(" | ")); // 한 줄로 묶어 출력
            buffer.length = 0;
          }
        };

        for (let i = 0; i < total; i++) {
          const t = Trace[i];
          let msg = "";
          switch (t.kind) {
            case "open":
              msg = `OPEN(${t.x},${t.y})-${t.reason}`; break;
            case "flood":
              msg = `FLOOD(${t.x},${t.y})`; break;
            case "ruleA":
              msg = `RuleA→${t.cells.map(c => `(${c[0]},${c[1]})`).join(",")}`; break;
            case "ruleB":
              msg = `RuleB→${t.cells.map(c => `(${c[0]},${c[1]})`).join(",")}`; break;
            case "subset":
              msg = `SubsetΔ${t.delta} open:${t.open?.length || 0} force:${t.force?.length || 0}`; break;
            case "exist":
              msg = `Exist→(${t.x},${t.y})`; break;
            case "markMine":
              msg = `FLAG(${t.x},${t.y})-${t.reason}`; break;
            case "done":
              msg = `DONE opens=${t.opens}`; break;
            default:
              msg = JSON.stringify(t);
          }
          buffer.push(msg);
          if (buffer.length >= BATCH_SIZE) flush();
        }
        flush(); // 남은 것 출력
        console.groupEnd();
      }


      // ===== 경량 솔버(노게스) =====
      function solveNoGuessFast(firstX, firstY, deadlineMs) {

        function timeUp() { return Date.now() > deadlineMs; }
        // 컴포 캐시(요약 결과 저장)
        const compCache = new Map();
        let stallRounds = 0;
        const STALL_LIMIT = 2;

        const UNDECIDED_RATIO_HARD = 0.85;
        const UNDECIDED_RATIO_SOFT = 0.70;
        const MAX_FRONTIER_VARS_HARD = 220;

        // 동적 시간 상한
        const DYNAMIC_TIME_BUDGET_MS = Math.min(1500, 450 + this.columns * this.rows * 1.5);
        const hardDeadline = Date.now() + DYNAMIC_TIME_BUDGET_MS;

        this._rebuild_near_from_parts(); // near 갱신
        if ((this.near_mines[firstX][firstY] | 0) !== 0) return { ok: false, opened: null }; // 첫칸 실패

        const W = this.columns, H = this.rows;
        // 열린(안전) 상태
        const opened = new Uint8Array(W * H);
        let openedCount = 0, totalSafe = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((this.mines[x][y] | 0) === 0) totalSafe++;


        // === 확정 값(해당 칸에 지뢰가 정확히 k개) 추적 ===
        const fixedKnown = new Uint8Array(W * H);   // 0/1
        const fixedVal = new Int16Array(W * H);   // k (일반화: 음수일 수도)
        function getFixed(x, y) {
          const k = idx(x, y);
          return fixedKnown[k] ? fixedVal[k] : null;
        }
        function setFixed(x, y, val, reason) {
          const k = idx(x, y);
          if (opened[k]) return false;
          if (fixedKnown[k] && fixedVal[k] === (val | 0)) return false;
          fixedKnown[k] = 1;
          fixedVal[k] = val | 0;
          pushTrace("markMine", { x, y, reason: `${reason} count=${val | 0}` }); // nopick_debug_macro가 읽음
          return true;
        }

        function markMine(x, y, reason) {
          const k = idx(x, y);
          if (confirmedMine[k]) return false; // 이미 확정
          confirmedMine[k] = 1;
          pushTrace("markMine", { x, y, reason });
          return true;
        }
        function idx(x, y) { return y * W + x; }
        function openCell(x, y, reason) {
          const k = idx(x, y);
          if (opened[k]) return;
          opened[k] = 1; openedCount++;
          pushTrace("open", { x, y, reason }); // 필요 시 주석 해제
        }

        function floodFrom(x0, y0) {
          const stack = [[x0, y0]];
          while (stack.length) {
            const [x, y] = stack.pop();
            const adj = this.near_positions(x, y);
            for (let i = 0; i < adj.length; i++) {
              const ax = adj[i][0], ay = adj[i][1];
              const ak = idx(ax, ay);
              if (opened[ak]) continue;
              openCell(ax, ay, "flood-neighbor");
              if ((this.near_mines[ax][ay] | 0) === 0) stack.push([ax, ay]);
            }
          }
        }

        openCell(firstX, firstY, "seed");
        floodFrom.call(this, firstX, firstY);

        function done() { return openedCount === totalSafe; }

        // 경계 수집(확정 지뢰를 target에서 차감)

        const collectFrontier = () => {
          const nums = [];
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (!opened[idx(x, y)]) continue;
            const v = this.near_mines[x][y] | 0;
            if (v !== 0) nums.push([x, y, v]);
          }
          const varIdx = new Map();
          const vars = [];
          function addVar(x, y) {
            const key = x + "," + y;
            if (!varIdx.has(key)) { varIdx.set(key, vars.length); vars.push([x, y]); }
          }
          const cons = [];
          for (let i = 0; i < nums.length; i++) {
            const [x, y, v0] = nums[i];
            const adj = this.near_positions(x, y);
            const vs = [];
            let target = (v0 === 1000 ? 0 : (v0 | 0));     // 합 제약
            for (let j = 0; j < adj.length; j++) {
              const ax = adj[j][0], ay = adj[j][1];
              if (opened[idx(ax, ay)]) continue;
              const fx = getFixed(ax, ay);
              if (fx != null) { target -= fx; continue; } // 확정값은 타깃에서 차감
              addVar(ax, ay);
              vs.push(varIdx.get(ax + "," + ay));
            }
            cons.push({ vars: vs, target, isAbs: (v0 === 1000) });
          }
          return { vars, cons };
        };

        function applyRuleAB_Tiered(vars, cons) {
          let progressed = false, flagged = false, openedAny = false;

          for (let ci = 0; ci < cons.length; ci++) {
            const { vars: vs, target, isAbs } = cons[ci];
            const U = vs.length, N = target | 0;

            // --- 클래식 / 흰지뢰 없음: 종전 로직 유지 ---
            if (!hasWhites) {
              if (N === 0 && U > 0 && !isAbs) {
                // 전부 안전
                const openedNow = [];
                for (const id of vs) {
                  const [x, y] = vars[id];
                  if (!opened[idx(x, y)]) { openCell(x, y, "RuleA N==0"); openedNow.push([x, y]); }
                }
                if (openedNow.length) { pushTrace("ruleA", { cells: openedNow }); openedAny = true; progressed = true; }
              } else if (classicMode && U > 0 && N === U) {
                // 전부 1 확정
                const cells = [];
                for (const id of vs) {
                  const [x, y] = vars[id];
                  if (setFixed(x, y, 1, "RuleB N==U")) { cells.push([x, y]); flagged = true; }
                }
                if (cells.length) pushTrace("ruleB", { cells });
              } else if (!classicMode && U > 0 && N === U * capB) {
                // capB 확정
                for (const id of vs) {
                  const [x, y] = vars[id];
                  if (setFixed(x, y, capB, "RuleB cap")) flagged = true;
                }
              }
              // 유일 미지(공통)
              if (U === 1) {
                const [x, y] = vars[vs[0]];
                if (N === 0 && !isAbs) {
                  if (!opened[idx(x, y)]) { openCell(x, y, "RuleB U==1,N==0"); openedAny = true; progressed = true; }
                } else if (N > 0 && N <= capB) {
                  if (setFixed(x, y, N, "RuleB U==1 exact")) flagged = true;
                }
              }
              continue;
            }

            // --- 일반(흰지뢰 있음) ---
            // N==0 전부 오픈 금지 (합 0이라도 +/− 상쇄 가능)
            // 유일 미지면 정확 수치 = N (부호 포함) → 고정 or 오픈(정확 0)
            if (U === 1) {
              const [x, y] = vars[vs[0]];
              if (N === 0 && !isAbs) {
                if (!opened[idx(x, y)]) { openCell(x, y, "RuleB U==1,N==0"); openedAny = true; progressed = true; }
              } else {
                if (setFixed(x, y, N, "RuleB U==1 exact")) flagged = true; // N이 음수면 흰 확정
              }
            }
          }

          if (flagged || openedAny) {
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              if (opened[idx(x, y)] && (this.near_mines[x][y] | 0) === 0) {
                const adj = this.near_positions(x, y);
                for (let i = 0; i < adj.length; i++) {
                  const ax = adj[i][0], ay = adj[i][1];
                  if (!opened[idx(ax, ay)]) { floodFrom.call(this, x, y); break; }
                }
              }
            }
            return true;
          }
          return false;
        }

        function applySmallSubset_Tiered(vars, cons) {
          const small = cons.map(c => ({ s: new Set(c.vars), t: c.target | 0, a: c.isAbs }))
            .filter(o => o.s.size > 0 && o.s.size <= 5);
          if (small.length < 2) return false;

          let progressed = false, flagged = false, openedAny = false;
          const cap = capB;

          for (let i = 0; i < small.length; i++) {
            const A = small[i];
            for (let j = 0; j < small.length; j++) {
              if (i === j) continue;
              const B = small[j];

              let subset = true; A.s.forEach(v => { if (!B.s.has(v)) subset = false; });
              if (!subset) continue;

              const S = []; B.s.forEach(v => { if (!A.s.has(v)) S.push(v); });
              if (!S.length) continue;

              const delta = (B.t - A.t);

              if (!hasWhites) {
                if (delta === 0) {
                  const openedNow = [];
                  for (const id of S) {
                    const [x, y] = vars[id];
                    if (!opened[idx(x, y)]) { openCell(x, y, "subset Δ=0"); openedNow.push([x, y]); }
                  }
                  if (openedNow.length) { pushTrace("subset", { delta: 0, open: openedNow }); openedAny = true; progressed = true; }
                } else if (delta === S.length * cap) {
                  const forced = [];
                  for (const id of S) {
                    const [x, y] = vars[id];
                    if (setFixed(x, y, cap, "subset Δ=|S|*cap")) { forced.push([x, y]); flagged = true; }
                  }
                  if (forced.length) pushTrace("subset", { delta, force: forced });
                } else if (S.length === 1 && delta > 0 && delta <= cap) {
                  const [x, y] = vars[S[0]];
                  if (setFixed(x, y, delta, "subset single exact")) { flagged = true; }
                }
                continue;
              }

              // 일반(whites): Δ=0 오픈 금지. |S|==1일 때만 정확 수치 고정.
              if (S.length === 1) {
                const [x, y] = vars[S[0]];
                if (setFixed(x, y, delta, "subset single exact")) { flagged = true; }
              }
            }
          }

          if (flagged || openedAny) {
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              if (opened[idx(x, y)] && (this.near_mines[x][y] | 0) === 0) {
                const adj = this.near_positions(x, y);
                for (let i = 0; i < adj.length; i++) {
                  const ax = adj[i][0], ay = adj[i][1];
                  if (!opened[idx(ax, ay)]) { floodFrom.call(this, x, y); break; }
                }
              }
            }
            return true;
          }
          return false;
        }

        function applyBoundsNoWhite(vars, cons) {
          if (!vars.length || !cons.length) return false;
          const n = vars.length, cap = capB;
          const vmin = new Int16Array(n);         // 0으로 자동 초기화
          const vmax = new Int16Array(n); for (let i = 0; i < n; i++) vmax[i] = cap;

          // 반복 축소
          let changed = false;
          for (let iter = 0; iter < 12; iter++) {
            let any = false;
            for (let ci = 0; ci < cons.length; ci++) {
              const { vars: vs, target, isAbs } = cons[ci];
              if (isAbs) continue; // 흰지뢰 없음이라 거의 없지만, 있으면 건너뜀
              const N = target | 0;
              let sumMin = 0, sumMax = 0;
              for (const id of vs) { sumMin += vmin[id]; sumMax += vmax[id]; }
              // 각 변수 갱신
              for (const id of vs) {
                const othersMin = sumMin - vmin[id];
                const othersMax = sumMax - vmax[id];
                const newMin = Math.max(vmin[id], N - othersMax);
                const newMax = Math.min(vmax[id], N - othersMin);
                if (newMin > vmin[id]) { vmin[id] = newMin; any = true; }
                if (newMax < vmax[id]) { vmax[id] = newMax; any = true; }
              }
            }
            if (!any) break; changed = true;
          }

          // 적용: 확정/오픈
          let progressed = false;
          for (let id = 0; id < n; id++) {
            if (vmin[id] === vmax[id]) {
              const [x, y] = vars[id];
              if (vmin[id] === 0) {
                if (!opened[idx(x, y)]) { openCell(x, y, "bounds min==max==0"); progressed = true; }
              } else {
                if (setFixed(x, y, vmin[id], "bounds exact")) progressed = true;
              }
            }
          }

          // 보너스: 제약 단위 mass-chord
          for (let ci = 0; ci < cons.length; ci++) {
            const { vars: vs, target, isAbs } = cons[ci];
            if (isAbs) continue;
            const N = target | 0;
            let remain = 0, cnt = 0;
            for (const id of vs) { remain += Math.max(0, vmin[id]); }
            // 남은 미지들만 따로 보려면 아래처럼 한번 더 훑어도 OK
            const U = vs.length;
            const minSum = vs.reduce((s, id) => s + vmin[id], 0);
            const maxSum = vs.reduce((s, id) => s + vmax[id], 0);
            // --- 보너스: 제약 단위 chord (수정판) ---
            for (let ci = 0; ci < cons.length; ci++) {
              const { vars: vs, target, isAbs } = cons[ci];
              if (isAbs) continue; // 흰지뢰 없음 경로이므로 거의 false지만, safety

              const N = target | 0;
              const minSum = vs.reduce((s, id) => s + vmin[id], 0);
              const maxSum = vs.reduce((s, id) => s + vmax[id], 0);

              if (N === minSum) {
                // 모든 변수는 "자신의 최소값"으로 확정
                for (const id of vs) {
                  const [x, y] = vars[id];
                  if (vmin[id] === 0) {
                    if (!opened[idx(x, y)]) { openCell(x, y, "bounds chord N==minSum"); progressed = true; }
                  } else {
                    // vmin>0 → 지뢰 수치 vmin 확정
                    if (setFixed(x, y, vmin[id], "bounds chord N==minSum (fix to min)")) progressed = true;
                  }
                }
              } else if (N === maxSum) {
                // 모든 변수는 "자신의 최대값"으로 확정
                for (const id of vs) {
                  const [x, y] = vars[id];
                  if (vmax[id] === 0) {
                    if (!opened[idx(x, y)]) { openCell(x, y, "bounds chord N==maxSum (0)"); progressed = true; }
                  } else {
                    if (setFixed(x, y, vmax[id], "bounds chord N==maxSum (fix to max)")) progressed = true;
                  }
                }
              }
            }

          }

          if (progressed) {
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              if (opened[idx(x, y)] && (this.near_mines[x][y] | 0) === 0) {
                const adj = this.near_positions(x, y);
                for (let i = 0; i < adj.length; i++) {
                  const ax = adj[i][0], ay = adj[i][1];
                  if (!opened[idx(ax, ay)]) { floodFrom.call(this, x, y); break; }
                }
              }
            }
          }
          return progressed;
        }
        function applyBoundsGeneral(vars, cons) {
          if (!vars.length || !cons.length) return false;
          const n = vars.length;
          const vmin = new Int16Array(n), vmax = new Int16Array(n);
          for (let i = 0; i < n; i++) {
            vmin[i] = - (this.max_mines_white | 0);
            vmax[i] = (this.max_mines | 0);
          }

          let changed = false;
          for (let iter = 0; iter < 8; iter++) {
            let any = false;
            for (let ci = 0; ci < cons.length; ci++) {
              const { vars: vs, target } = cons[ci];
              const N = target | 0;
              let sumMin = 0, sumMax = 0;
              for (const id of vs) { sumMin += vmin[id]; sumMax += vmax[id]; }
              for (const id of vs) {
                const othersMin = sumMin - vmin[id];
                const othersMax = sumMax - vmax[id];
                const newMin = Math.max(vmin[id], N - othersMax);
                const newMax = Math.min(vmax[id], N - othersMin);
                if (newMin > vmin[id]) { vmin[id] = newMin; any = true; }
                if (newMax < vmax[id]) { vmax[id] = newMax; any = true; }
              }
            }
            if (!any) break; changed = true;
          }

          let progressed = false;
          for (let id = 0; id < n; id++) {
            const [x, y] = vars[id];
            if (vmin[id] === 0 && vmax[id] === 0) {
              // 반드시 0 → 안전
              if (!opened[idx(x, y)]) { openCell(x, y, "bounds (general) ==0"); progressed = true; }
            } else if (vmin[id] === vmax[id]) {
              // 정확 수치(부호 포함) 확정
              if (setFixed(x, y, vmin[id], "bounds (general) exact")) progressed = true;
            }
          }

          if (progressed) {
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
              if (opened[idx(x, y)] && (this.near_mines[x][y] | 0) === 0) {
                const adj = this.near_positions(x, y);
                for (let i = 0; i < adj.length; i++) {
                  const ax = adj[i][0], ay = adj[i][1];
                  if (!opened[idx(ax, ay)]) { floodFrom.call(this, x, y); break; }
                }
              }
            }
          }
          return progressed;
        }




        // 연결요소로 쪼개기(변수-제약 이분그래프)
        const splitComponents = (vars, cons) => {
          const nV = vars.length, nC = cons.length;
          const adj = Array.from({ length: nV + nC }, () => []);
          for (let ci = 0; ci < nC; ci++) {
            const vs = cons[ci].vars;
            for (let k = 0; k < vs.length; k++) {
              const v = vs[k];
              adj[v].push(nV + ci);
              adj[nV + ci].push(v);
            }
          }
          const comp = new Int32Array(nV + nC).fill(-1);
          const comps = [];
          let id = 0;
          for (let s = 0; s < comp.length; s++) {
            if (comp[s] !== -1) continue;
            const q = [s]; comp[s] = id; const nodes = [s];
            while (q.length) {
              const u = q.pop();
              const au = adj[u];
              for (let i = 0; i < au.length; i++) {
                const w = au[i];
                if (comp[w] !== -1) continue;
                comp[w] = id; q.push(w); nodes.push(w);
              }
            }
            const vIdx = [], cIdx = [];
            for (const u of nodes) {
              if (u < nV) vIdx.push(u);
              else cIdx.push(u - nV);
            }
            comps.push({ vIdx, cIdx });
            id++;
          }
          return comps;
        };

        // 컴포넌트 키
        function _fastHashInt(h, x) { // 32-bit mix
          h ^= x + 0x9e3779b9 + ((h << 6) >>> 0) + (h >>> 2);
          return h >>> 0;
        }
        function makeComponentKey(vars, cons) {
          // 좌표/제약을 정규화된 순서로 가볍게 해시만 생성
          let h = 2166136261 >>> 0;
          // 변수 좌표
          for (let k = 0; k < vars.length; k++) {
            const v = vars[k]; // [x,y]
            h = _fastHashInt(h, (v[0] | 0)); h = _fastHashInt(h, (v[1] | 0));
          }
          // 제약: (길이, target, isAbs, 정렬된 vars 목록) 순
          for (let i = 0; i < cons.length; i++) {
            const c = cons[i];
            h = _fastHashInt(h, c.vars.length | 0);
            h = _fastHashInt(h, (c.target | 0));
            h = _fastHashInt(h, (c.isAbs ? 1 : 0));
            for (let j = 0; j < c.vars.length; j++) h = _fastHashInt(h, (c.vars[j] | 0));
          }
          return "H" + h.toString(36);
        }

        // 조기 불능 체크
        function quickInfeasible(subVars, subCons) {
          for (const c of subCons) {
            const U = c.vars.length;
            const minS = -capW * U, maxS = capB * U;
            if (c.target < minS || c.target > maxS) return true;
            if (c.isAbs && c.target === 0 && U === 0) return true;
          }
          const fixed = new Map();
          for (const c of subCons) {
            if (c.vars.length === 1) {
              const v = c.vars[0];
              const t = c.target | 0;
              if (t < -capW || t > capB) return true;
              const prev = fixed.get(v);
              if (prev != null && prev !== t) return true;
              fixed.set(v, t);
              if (c.isAbs && t === 0) return true;
            }
          }
          return false;
        }

        // 존재성 요약(컴포의 모든 변수에 대해 -1/0/+1)
        function summarizeComponentBounds(subVars, subCons, capB, capW) {
          // 도메인 생성: [-capW .. 0 .. +capB]
          const domains = new Array(subVars.length);
          for (let i = 0; i < subVars.length; i++) {
            const d = [];
            for (let w = capW; w >= 1; w--) d.push(-w);
            d.push(0);
            for (let b = 1; b <= capB; b++) d.push(b);
            domains[i] = d;
          }

          // 가지치기: 부분할당 feasible 체크(합/최소/최대)
          function feasible(partial) {
            for (let ci = 0; ci < subCons.length; ci++) {
              const { vars: vs, target, isAbs } = subCons[ci];
              let sum = 0, unk = 0, minAbs = 0, maxAbs = 0, absKnown = 0;
              for (let k = 0; k < vs.length; k++) {
                const id = vs[k], v = partial[id];
                if (v == null) { unk++; minAbs += 0; maxAbs += Math.max(capB, capW); }
                else { sum += v; absKnown += Math.abs(v); }
              }
              const minPossible = sum - capW * unk;
              const maxPossible = sum + capB * unk;
              if (target < minPossible || target > maxPossible) return false;
              if (isAbs && absKnown === 0 && unk === 0) return false;
            }
            return true;
          }

          // 전체 만족 검사
          function allSatisfied(partial) {
            for (let ci = 0; ci < subCons.length; ci++) {
              const { vars: vs, target, isAbs } = subCons[ci];
              let s = 0, a = 0;
              for (let k = 0; k < vs.length; k++) {
                const id = vs[k], v = partial[id];
                if (v == null) return false;
                s += v; a += Math.abs(v);
              }
              if (s !== target) return false;
              if (isAbs && !(a > 0)) return false;
            }
            return true;
          }

          // 탐색 순서: 제약 연결도 많은 변수부터
          const deg = new Array(subVars.length).fill(0);
          for (const c of subCons) for (const v of c.vars) deg[v]++;
          const ORDER = [...Array(subVars.length).keys()].sort((a, b) => deg[b] - deg[a]);

          const partial = new Array(subVars.length).fill(null);

          // 변수 v의 가능한 최소/최대 값을 구함 (branch-and-bound)
          function computeMinMaxForVar(varId, CAP1 = 60000, CAP2 = 200000) {
            let node = 0, timedOut = false;
            let found = false, minV = +Infinity, maxV = -Infinity;

            function dfs(p) {
              if (timedOut) return;
              if (++node > CAP1) { timedOut = true; return; } // 1차 제한

              if (p === ORDER.length) {
                if (allSatisfied(partial)) {
                  found = true;
                  const val = partial[varId];
                  if (val < minV) minV = val;
                  if (val > maxV) maxV = val;
                }
                return;
              }
              const vid = ORDER[p];
              const dom = domains[vid];

              // 값 순서를 '현재 v를 더 넓게 샘플링'하도록 약간 섞을 수도 있음
              for (let i = 0; i < dom.length; i++) {
                partial[vid] = dom[i];
                if (feasible(partial)) dfs(p + 1);
                if (timedOut) { partial[vid] = null; return; }
                partial[vid] = null;
              }
            }
            dfs(0);
            if (timedOut) {
              return { ok: false };
            }
            if (!found) return { ok: false };
            return { ok: true, min: minV, max: maxV };
          }

          const minVals = new Int32Array(subVars.length);
          const maxVals = new Int32Array(subVars.length);
          const alwaysZero = new Int8Array(subVars.length);

          for (let v = 0; v < subVars.length; v++) {
            const r = computeMinMaxForVar(v);
            if (!r.ok) {
              // 부분 탐색 → 신뢰 금지: 범위를 느슨하게
              minVals[v] = -capW;
              maxVals[v] = capB;
              alwaysZero[v] = 0;
            } else {
              // 완전탐색 성공 시의 결과만 신뢰
              minVals[v] = r.min | 0;
              maxVals[v] = r.max | 0;
              alwaysZero[v] = (r.min === 0 && r.max === 0) ? 1 : 0;
            }
          }
          return { minVals, maxVals, alwaysZero };
        }

        // 메인 루프
        let guard = W * H * 8;
        while (!done() && !timeUp() && guard-- > 0) {
          // === [ADD] 동적 시간 초과시 즉시 포기
          if (Date.now() > hardDeadline) return { ok: false, opened: opened };

          // === [ADD] 라운드 전 opened/fixed 스냅샷
          const openedBefore = openedCount;
          let fixedBefore = 0;
          for (let i = 0; i < fixedKnown.length; i++) fixedBefore += fixedKnown[i];

          const frontierRes = collectFrontier.call(this);
          const { vars, cons } = frontierRes;
          if (!vars.length || !cons.length) return { ok: false, opened: opened };

          // (1) 빠른 결정식: RuleA/B (티어별)
          if (applyRuleAB_Tiered.call(this, vars, cons)) continue;

          // (2) Subset (티어별)
          if (applySmallSubset_Tiered.call(this, vars, cons)) continue;

          // (3) 흰지뢰 없음이면 강한 상·하한 전파, 아니면 보수 전파
          if (!hasWhites) {
            if (applyBoundsNoWhite.call(this, vars, cons)) continue;
          } else {
            if (applyBoundsGeneral.call(this, vars, cons)) continue;
          }
          // ★★★ [삽입] 서명 정수 GAC 비트셋 전파 (흰지뢰 포함에서 효과 큼)
          {
            let progressedGAC = false;

            // 연결요소 단위로 돌려야 빠름 (변수/제약 분리)
            const comps = splitComponents(vars, cons);
            for (let i = 0; i < comps.length; i++) {
              const { vIdx, cIdx } = comps[i];
              if (!vIdx.length) continue;

              const subVars = vIdx.map(id => vars[id]);
              const idMap = new Map(vIdx.map((old, i) => [old, i]));
              const subCons = cIdx.map(ci => {
                const c = cons[ci];
                const vsNew = c.vars.map(v => idMap.get(v)).filter(v => v != null);
                return { vars: vsNew, target: c.target, isAbs: c.isAbs };
              });

              // 너무 큰 컴포는 패스(기존 경량 규칙/범위전파/요약으로 처리)
              const COMP_CAP = 48; // 충분히 큼. 필요시 32~48로 줄일 수도 있음
              if (subVars.length > COMP_CAP) continue;

              const r = this._enforceGACSigned(subVars, subCons, capB, capW);
              if (r && r.fail) return false; // 모순 → 이 보드 실패

              if (r && r.progressed) {
                progressedGAC = true;

                // 결과 반영
                let changedLocal = false;
                for (const d of r.decided) {
                  if (d.type === "open") {
                    if (!opened[idx(d.x, d.y)]) { openCell(d.x, d.y, "GAC domain=={0}"); changedLocal = true; }
                  } else {
                    if (setFixed(d.x, d.y, d.val, "GAC singleton")) changedLocal = true;
                  }
                }

                // 방금 열린 0칸들 flood
                if (changedLocal) {
                  for (const d of r.decided) {
                    if (d.type === "open" && (this.near_mines[d.x][d.y] | 0) === 0) {
                      floodFrom.call(this, d.x, d.y);
                    }
                  }
                }
              }
            }

            if (progressedGAC) continue; // 다음 루프
          }

          // (4) 남으면 기존 컴포넌트 존재성 요약(요건 그대로 유지)


          // 연결요소 단위 존재성 탐색
          const comps = splitComponents(vars, cons);
          let progressed = false;

          for (let i = 0; i < comps.length && !progressed; i++) {
            const { vIdx, cIdx } = comps[i];
            if (!vIdx.length) continue;

            const subVars = vIdx.map(id => vars[id]);
            const idMap = new Map(vIdx.map((old, i) => [old, i]));
            const subCons = cIdx.map(ci => {
              const c = cons[ci];
              const vsNew = c.vars.map(v => idMap.get(v)).filter(v => v != null);
              return { vars: vsNew, target: c.target, isAbs: c.isAbs };
            });

            const capSize = classicMode ? 40 : 20;
            if (subVars.length > capSize) continue;

            const cacheKey = makeComponentKey(subVars, subCons);

            // 캐시 사용
            const cached = compCache.get(cacheKey);
            if (cached && cached.kind === "varSummary") {
              let progressedLocal = false;
              for (let k = 0; k < cached.verdict.length; k++) {
                const [x, y] = subVars[k];
                const v = cached.verdict[k];
                if (v === -1) {
                  if (!opened[idx(x, y)]) { openCell(x, y, "cache(always 0)"); progressedLocal = true; }
                } else if (classicMode && v === +1) {
                  if (markMine(x, y, "cache(always 1)")) progressedLocal = true;
                }
              }
              if (progressedLocal) { progressed = true; continue; }
            }

            if (quickInfeasible(subVars, subCons)) continue;

            // --- 컴포넌트 요약(범위) 계산 ---
            const bounds = summarizeComponentBounds(subVars, subCons, capB, capW);
            // 캐시 저장(선택)
            compCache.set(cacheKey, { kind: "varBounds", bounds });

            // 적용: (1) 항상 0 → open, (2) min==max!=0 → 정확한 수치로 깃발
            let progressedLocal = false;

            for (let k = 0; k < subVars.length; k++) {
              const [x, y] = subVars[k];
              const minV = bounds.minVals[k] | 0;
              const maxV = bounds.maxVals[k] | 0;

              if (minV === 0 && maxV === 0) {
                if (!opened[idx(x, y)]) { openCell(x, y, "exist(range=={0})"); progressedLocal = true; }
              } else if (minV === maxV) {
                // 정확 도출: +d(검은 d) 또는 -d(하얀 d)
                const want = minV;  // 부호 포함
                // 내부 ‘확정 깃발’ 기록 + 트레이스
                pushTrace("markMine", { x, y, reason: `exist(range=={${want}})` });
                // 실제 깃발 수치는 매크로가 우클릭 반복으로 맞추게 함(당장 늘려도 OK면 markMine 즉시 적용 가능)
                progressedLocal = true;
              }
            }

            if (progressedLocal) {
              // 방금 연 0칸 flood
              for (let k = 0; k < subVars.length; k++) {
                if (bounds.minVals[k] === 0 && bounds.maxVals[k] === 0) {
                  const [x, y] = subVars[k];
                  if ((this.near_mines[x][y] | 0) === 0) floodFrom.call(this, x, y);
                }
              }
              progressed = true;
            }
          }

          // === [REPLACE] 빠른-포기 휴리스틱: 무진전/대형 프런티어/미결정 비율 기반
          const openedAfter = openedCount;
          let fixedAfter = 0;
          for (let i = 0; i < fixedKnown.length; i++) fixedAfter += fixedKnown[i];

          const openedDelta = openedAfter - openedBefore;
          const fixedDelta = fixedAfter - fixedBefore;
          const madeProgress = (openedDelta > 0) || (fixedDelta > 0);

          // 프런티어/미결정 비율 계산(최신 상태 재수집)
          const frontierNow = collectFrontier.call(this);
          const U = frontierNow.vars.length | 0;

          let undecided = 0;
          for (let id = 0; id < U; id++) {
            const [vx, vy] = frontierNow.vars[id];
            const fx = getFixed(vx, vy);
            if (fx == null) undecided++;
          }
          const undecidedRatio = (U > 0 ? (undecided / U) : 0);

          // 컴포넌트 수/평균 변수 수
          const compsNow = splitComponents(frontierNow.vars, frontierNow.cons);
          let sumVar = 0;
          for (let i = 0; i < compsNow.length; i++) sumVar += compsNow[i].vIdx.length;
          const avgVar = (compsNow.length > 0 ? sumVar / compsNow.length : 0);

          if (!madeProgress) {
            stallRounds++;

            // (1) 프런티어가 큰데 무진전 → 바로 포기
            if (U >= MAX_FRONTIER_VARS_HARD) return false;

            // (2) 연속 무진전 + 미결정 비율 높음 → 포기
            if (stallRounds >= STALL_LIMIT) {
              if (undecidedRatio >= UNDECIDED_RATIO_HARD) return false;

              // (3) 컴포가 많고 평균 크기도 큰데(난해) 미결정 비율 높음 → 완화 임계로 포기
              if (compsNow.length >= 6 && avgVar >= 8 && undecidedRatio >= UNDECIDED_RATIO_SOFT) {
                return false;
              }
            }

            // 계속 시도(루프 지속)
          } else {
            // 진전했으면 정지 카운터 리셋
            stallRounds = 0;
          }

        }
        if (timeUp()) return false;
        if (done()) {
          return true;
        }
        return false;
      }

      // ====== 메인: 무한히 시도하여 solvable 보드가 나올 때까지 ======
      for (let attempt = 1; ; attempt++) {
        // 무작위 보드 생성
        this.init_mines();

        // 첫 3x3 비우기 + 첫칸 진짜0 보장
        if (!first3x3AllZero(firstX, firstY)) continue;
        rebuildParts();
        if ((this.near_mines[firstX][firstY] | 0) !== 0) continue;

        // 추론 로그 초기화
        Trace.length = 0;
        const deadline = Date.now() + 2000; // 2초
        // 빠른 결정 솔버
        if (solveNoGuessFast.call(this, firstX, firstY, deadline)) {
          // 상태 보정
          this.remaining = W * H;
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((this.mines[x][y] | 0) !== 0) this.remaining--;
          this.total_safe = this.remaining;
          this.game_status = 1;

          // ★ Trace 에 없는 '지뢰 없는 칸'을 모두 open 으로 강제로 추가
          (function fillAllSafeCellsToTrace(self) {
            // 1) 이미 Trace 에 기록된 open 위치들
            const openedByTrace = self.new_table();  // 숫자 0/1 로만 사용
            for (let i = 0; i < Trace.length; i++) {
              const t = Trace[i];
              if (!t || t.kind !== "open") continue;
              const x = t.x | 0, y = t.y | 0;
              if (x >= 0 && x < W && y >= 0 && y < H) {
                openedByTrace[x][y] = 1;
              }
            }

            // 2) mines 상에서 지뢰가 없고(==0), 아직 한번도 open 으로 나온 적 없는 칸들
            //    → Trace 맨 뒤에 open 으로 추가한다.
            for (let y = 0; y < H; y++) {
              for (let x = 0; x < W; x++) {
                if ((self.mines[x][y] | 0) === 0 && !openedByTrace[x][y]) {
                  pushTrace("open", { x, y, reason: "post-fill" });
                }
              }
            }

            // 3) 최종 완료 로그를 Trace 제일 끝에 한 번만 찍어 둔다.
            let openCount = 0;
            for (let i = 0; i < Trace.length; i++) {
              if (Trace[i] && Trace[i].kind === "open") openCount++;
            }
            pushTrace("done", { opens: openCount });
          })(this);

          // 추론 근거 트리 출력 (이 시점에서 Trace 는 이미 'post-fill' + 'done'까지 포함)
          try { dumpTraceToConsole(); } catch (e) { }

          // ★ 추론 로그를 인스턴스에 보관해 매크로가 그대로 재생할 수 있게 한다
          this._nopick_trace = Trace.slice();
          return 1; // 성공
        }

        //alert("regenerating");
        // 실패 시 다음 보드 계속 시도(무한)
      }
    };



    Minefield.prototype.generate_near_mines = function (mines) {
      var near_sum = this.new_table();
      var near_abs = this.new_table();

      for (var x = 0; x < this.columns; x++) {
        for (var y = 0; y < this.rows; y++) {
          var v = mines[x][y];
          if (v === 0) continue;
          var adj = this.near_positions(x, y);
          for (var k = 0; k < adj.length; k++) {
            var nx = adj[k][0], ny = adj[k][1];
            near_sum[nx][ny] += v;
            near_abs[nx][ny] += Math.abs(v);
          }
        }
      }

      var near_mines = this.new_table();
      const hasWhite = (this.num_mines_white | 0) > 0;   // ← 가드 추가
      for (var i = 0; i < this.columns; i++) {
        for (var j = 0; j < this.rows; j++) {
          if (hasWhite && near_sum[i][j] === 0 && near_abs[i][j] > 0) { // ← 가드
            near_mines[i][j] = 1000;
          } else {
            near_mines[i][j] = near_sum[i][j];
          }
        }
      }
      return near_mines;
    };

    Minefield.prototype.shift_table = function (table, dx, dy) {
      var new_table, new_x, new_y, nx, ny, _i, _j, _ref, _ref1;
      new_table = this.new_table();
      for (ny = _i = 0, _ref = this.rows - 1; 0 <= _ref ? _i <= _ref : _i >= _ref; ny = 0 <= _ref ? ++_i : --_i) {
        for (nx = _j = 0, _ref1 = this.columns - 1; 0 <= _ref1 ? _j <= _ref1 : _j >= _ref1; nx = 0 <= _ref1 ? ++_j : --_j) {
          new_x = (nx + dx + 2 * this.columns) % this.columns;
          new_y = (ny + dy + 2 * this.rows) % this.rows;
          new_table[new_x][new_y] = table[nx][ny];
        }
      }
      return new_table;
    };

    /* ---------- DOM 헬퍼 ---------- */
    Minefield.prototype.get_class = function (x, y) {
      var td_class = this.tds[x][y].getAttribute("class");
      if (td_class === null || td_class === "") { return null; }
      return td_class;
    };

    Minefield.prototype.set_class = function (x, y, val) {
      if (val === null) {
        return this.tds[x][y].removeAttribute("class");
      } else {
        return this.tds[x][y].setAttribute("class", val);
      }
    };
    // === [PATCH 1] 인접 좌표 캐시 ===
    Minefield.prototype._ensureAdjCache = function () {
      if (this._adj && this._adjW === this.columns && this._adjH === this.rows) return;
      this._adjW = this.columns | 0; this._adjH = this.rows | 0;
      this._adj = Array.from({ length: this._adjW }, () => Array(this._adjH));
      for (let x = 0; x < this._adjW; x++) for (let y = 0; y < this._adjH; y++) {
        const a = [];
        for (let nx = x - 1; nx <= x + 1; nx++) for (let ny = y - 1; ny <= y + 1; ny++) {
          if (nx === x && ny === y) continue;
          if (nx >= 0 && ny >= 0 && nx < this._adjW && ny < this._adjH) a.push([nx, ny]);
        }
        this._adj[x][y] = a; // 한 번만 생성해 재사용
      }
    };

    // 기존 near_positions를 캐시로 대체
    Minefield.prototype.near_positions = function (x, y) {
      this._ensureAdjCache();
      return this._adj[x][y];
    };
    /* mine.js 파일 내용 중 해당 함수들을 찾아 교체하거나 수정하세요 */

    // 1. on_up 수정: 생성 중(_is_generating)일 때는 상태 변경(얼굴 리셋)을 막음
    Minefield.prototype.on_up = function (x, y) {
      // ★ [수정] 생성 중이라면 상태를 리셋하지 않고 유지
      if (this._is_generating) return;

      this.game_status2 = 0;
      this.on_game_status_changed2();
      return 0;
    };

    // 2. on_click 수정: 비동기 처리 로직 개선
    Minefield.prototype.on_click = function (x, y) {
      var old_game_status = this.game_status;
      if (this.game_status < 0) return;

      // 깃발 처리 등 기존 로직 유지...
      var td_class = this.get_class(x, y);
      var is_flagged = (td_class !== null && td_class !== "flag-0" && /^flag-/.test(td_class));
      var is_qmark = (td_class === "flag-0");
      if (is_flagged) {
        this.cycle_flag_leftclick(x, y);
        if (this.on_rclick_func) this.on_rclick_func(x, y);
        if (this.game_status != 1) return;
      }

      // ★ [수정] 무거운 연산(첫 클릭) 비동기 처리 로직
      if (this.game_status === 1 && (this.use_nopick || (this.max_mines_white | 0) + (this.max_mines | 0) > 500)) {
        var overlay = document.getElementById('loading-overlay');
        var clickedTd = this.tds[x][y];
        var faceIcon = document.querySelector(".mine-reset-button .mine-reset-button-inner");

        // 1. 생성 상태 플래그 설정 (on_up 방어용)
        this._is_generating = true;

        // 2. 시각적 피드백
        if (overlay) {
          overlay.style.display = 'block';
          // ★ [수정] delayed-show 클래스를 '추가'해야 CSS delay(1s)가 적용됨.
          // 1초 미만으로 끝나면 opacity:0 인 상태에서 display:none이 되므로 안 보임.
          overlay.classList.add('delayed-show');
          overlay.style.opacity = ''; // CSS 애니메이션에 맡김
        }

        // 클릭한 셀 눌린 모양 유지
        if (clickedTd && !is_flagged) {
          if (is_qmark) {
            // ★ ? 는 flag0pressed 로
            clickedTd.classList.add("flag0pressed");
          } else {
            clickedTd.classList.add("pressed");
          }
        }

        // 얼굴: 눌린 표정(-48px) 강제 적용
        if (faceIcon) {
          faceIcon.style.setProperty("background-position", "-48px 0", "important");
        }

        var self = this;

        // 3. UI 렌더링 확보 후 연산 시작
        setTimeout(function () {
          try {
            // 혹시 모르니 한 번 더 강제
            if (faceIcon) faceIcon.style.setProperty("background-position", "-48px 0", "important");

            self.start(x, y); // 무거운 연산 (브라우저 프리징 구간)
            if (!is_flagged) {
              if (self.expand(x, y) < 0) self.gameover(x, y);
              if (self.remaining === 0) self.gameclear();


            }
            if (self.on_click_func) self.on_click_func(x, y);
            if (old_game_status !== self.game_status) self.on_game_status_changed();
          } catch (e) {
            console.error(e);
            alert("오류: " + e);
          } finally {
            // 4. 연산 종료 후 복구
            self._is_generating = false; // 플래그 해제

            if (overlay) {
              overlay.style.display = 'none';
              overlay.classList.remove('delayed-show'); // 다음을 위해 초기화
            }

            // 얼굴 표정 복구 (게임이 끝나지 않았다면 기본 얼굴로)
            if (faceIcon && self.game_status >= 0) {
              // setTimeout을 써서 on_up 처리 이후에 확실히 덮어씌우도록 함
              faceIcon.style.removeProperty("background-position");
              // self.on_up()을 수동 호출하여 상태 동기화
              self.game_status2 = 0;
              self.on_game_status_changed2();
            }
          }
        }, 50);

        return; // 비동기 분기 종료
      }

      // --- 기존 동기 처리 (가벼운 클릭) ---
      if (this.game_status === 1) this.start(x, y);
      if (this.expand(x, y) < 0) this.gameover(x, y);
      if (this.remaining === 0)
        this.gameclear();
      if (this.on_click_func) this.on_click_func(x, y);
      if (old_game_status !== this.game_status) return this.on_game_status_changed();
    };
    Minefield.prototype.on_rclick = function (x, y) {
      var old_game_status = this.game_status;
      if (this.game_status < 0) return;
      //if (this.game_status === 1) this.game_status = 0;
      this.flag(x, y);
      if (this.on_rclick_func) this.on_rclick_func(x, y);
      if (old_game_status !== this.game_status) return this.on_game_status_changed();
    };

    // 좌클릭일 때: 깃발 상태에서 검은→…→검은Max→(흰 있으면)흰1→…→흰Max→검은1
    Minefield.prototype.cycle_flag_leftclick = function (x, y) {
      var cur = this.flags[x][y] || 0;
      if (cur === 0) return;

      var wMax = this.max_mines_white | 0;
      var bMax = this.max_mines | 0;

      var next, deltaSigned = 0;

      if (cur > 0) { // 검은 깃발 증가
        next = cur + 1;
        if (next > bMax) {
          if (wMax > 0) { next = -1; } else { next = 1; }
        }
        deltaSigned = next - cur;
      } else { // 흰 깃발 증가
        var abs = -cur;
        var absNext = abs + 1;
        if (absNext > wMax) {
          next = 1; // 검은1로
        } else {
          next = -absNext;
        }
        deltaSigned = next - cur;
      }

      // 카운터 갱신
      if (cur > 0) this.num_flags -= cur; else if (cur < 0) this.num_flags_white -= (-cur);
      if (next > 0) this.num_flags += next; else if (next < 0) this.num_flags_white += (-next);

      // near_flags(부호합)
      var adj = this.near_positions(x, y);
      for (var i = 0; i < adj.length; i++) {
        var nx = adj[i][0], ny = adj[i][1];
        this.near_flags[nx][ny] += deltaSigned;
      }

      this.flags[x][y] = next;
      if (next > 0) this.set_class(x, y, "flag-" + next);
      else this.set_class(x, y, "flag-m" + (-next));
    };

    Minefield.prototype.on_game_status_changed = function () {
      if (this.game_status_changed_func) return this.game_status_changed_func(this.game_status);
    };
    Minefield.prototype.on_game_status_changed2 = function () {
      if (this.game_status_changed_func2) return this.game_status_changed_func2(this.game_status2);
    };

    Minefield.prototype.start = function (x, y) {
      this.game_status = 0;
      if (this.use_nopick === true) { this.init_mines_nopick(x, y); this.game_status = 0; }
      // ★ 무한구제 모드(nopick_level===1): 첫 클릭에서 3×3 비우기 "시도"
      if (this.infinite_reloc === true) {
        // 클릭칸+주변 8칸을 가능한 한 비우도록 재배치 시도
        if (this._relocateFirstClick(x, y, /*clearNeighbors=*/true)) return;
        // (클릭 칸을 못 비웠다면 아래의 기존 폴백을 진행)
      } else {
        // 기본: 클릭 칸만 비우는 기존 동작
        if (this.mines[x][y] === 0) return;
        if (this._relocateFirstClick(x, y, /*clearNeighbors=*/false)) return;
      }



      // 실패 시 기존 시프트 폴백(시프트 후 parts/near 전부 재구성)
      var nx, ny, _i, _ref, _results;
      _results = [];
      for (nx = _i = 0, _ref = this.columns - 1; 0 <= _ref ? _i <= _ref : _i >= _ref; nx = 0 <= _ref ? ++_i : --_i) {
        _results.push((function () {
          var _j, _ref1, _results1;
          _results1 = [];
          for (ny = _j = 0, _ref1 = this.rows - 1; 0 <= _ref1 ? _j <= _ref1 : _j >= _ref1; ny = 0 <= _ref1 ? ++_j : --_j) {
            if (this.mines[nx][ny] === 0) {
              this.mines = this.shift_table(this.mines, x - nx, y - ny);

              // ★ 시프트 후 parts와 near를 전부 재구성
              this._near_black = this.new_table();
              this._near_white = this.new_table();
              for (var xx = 0; xx < this.columns; xx++) {
                for (var yy = 0; yy < this.rows; yy++) {
                  var v = this.mines[xx][yy];
                  if (v === 0) continue;
                  var adj = this.near_positions(xx, yy);
                  var addB = Math.max(0, v);
                  var addW = Math.max(0, -v);
                  for (var k = 0; k < adj.length; k++) {
                    var nx2 = adj[k][0], ny2 = adj[k][1];
                    this._near_black[nx2][ny2] += addB;
                    this._near_white[nx2][ny2] += addW;
                  }
                }
              }
              this._rebuild_near_from_parts();

              _results1.push(true);
            } else {
              _results1.push(void 0);
            }
          }
          return _results1;
        }).call(this));
      }
      return _results;
    };

    // 우클릭 사이클
    //  흰=0: null→flag-1..bMax→flag-0(?)→null
    //  흰>0: null→flag-1..bMax→flag-m1..mW→flag-0(?)→null
    Minefield.prototype.flag = function (x, y) {
      var td_class = this.get_class(x, y);
      if (td_class !== null && !/^flag/.exec(td_class)) return;

      var wMax = this.max_mines_white | 0;
      var bMax = this.max_mines | 0;
      var cur = this.flags[x][y] || 0;

      function applyClass(self, xx, yy, val) {
        if (val === 0) self.set_class(xx, yy, "flag-0"); // ?
        else if (val > 0) self.set_class(xx, yy, "flag-" + val);
        else self.set_class(xx, yy, "flag-m" + (-val));
      }

      var next, deltaSigned = 0;
      if (td_class === null) { // null → black1
        next = 1;
        deltaSigned = +1;
        this.num_flags += 1;
      } else if (td_class === "flag-0") { // ? → null
        this.set_class(x, y, null);
        this.flags[x][y] = 0;
        return;
      } else {
        // 현재 깃발에서 다음 단계
        if (cur > 0) {
          if (cur < bMax) { next = cur + 1; }
          else { // cur==bMax
            if (wMax > 0) { next = -1; }
            else if (this.question === true) { next = 0; } // 흰 없으면 ? 로
            else {
              this.set_class(x, y, null);
              this.flags[x][y] = 0;
              return;
            }
          }
        } else if (cur < 0) {
          var abs = -cur;
          if (abs < wMax) next = -(abs + 1);
          else if (this.question === true) { next = 0; } // 흰 없으면 ? 로
          else {
            this.set_class(x, y, null);
            this.flags[x][y] = 0;
            return;
          } // ? 로
        } else {
          next = 1;
        }

        // 카운터 갱신/near_flags 델타
        if (cur > 0) this.num_flags -= cur;
        if (cur < 0) this.num_flags_white -= (-cur);

        if (next > 0) this.num_flags += next;
        if (next < 0) this.num_flags_white += (-next);

        deltaSigned = next - cur;
      }

      // near_flags 반영( ? 는 합산 제외 → deltaSigned=0)
      var adj = this.near_positions(x, y);
      for (var i = 0; i < adj.length; i++) {
        var nx = adj[i][0], ny = adj[i][1];
        this.near_flags[nx][ny] += deltaSigned;
      }

      this.flags[x][y] = next;
      applyClass(this, x, y, next);
    };

    // 지뢰는 (양수/음수) 모두 게임오버 트리거
    Minefield.prototype.press = function (x, y) {
      if (this.mines[x][y] !== 0) {
        return -1;
      } else if (this.get_class(x, y) !== null && this.get_class(x, y) !== "flag-0" && this.get_class(x, y) !== "pressed"&& this.get_class(x, y) !== "flag0pressed") {
        return 1;
      }

      this.remaining -= 1;

      this.opened_cells = (this.opened_cells || 0) + 1;
      this.opened_safe = (this.opened_safe || 0) + 1;

      var ratio = this.opened_safe / this.total_safe;
      if (!this.bonus_thresholds) this.bonus_thresholds = this.compute_bonus_thresholds();
      while ((this.bonus_reloc_count || 0) < this.bonus_thresholds.length &&
        ratio >= this.bonus_thresholds[this.bonus_reloc_count]) {
        this.bonus_reloc_count += 1;
      }

      // 숫자 표시: 1000 → 숫자0, 0 → 빈칸, 양수 → near-#, 음수 → near-m#
      var v = this.near_mines[x][y];
      if (v === 0) {
        this.set_class(x, y, "empty");
      } else if (v === 1000) {
        this.set_class(x, y, "near-0");
      } else if (v > 0) {
        this.set_class(x, y, "near-" + v);
      } else {
        this.set_class(x, y, "near-m" + (-v));
      }
      return 0;
    };

    /* ---------- 고속 확장(BFS) ---------- */
    Minefield.prototype.expand = function (start_x, start_y) {
      if (!this._visit || this._visit.length !== this.columns * this.rows) {
        this._ensureWorkBuffers();
      }

      var td_class = this.get_class(start_x, start_y);
      if (td_class !== null && (td_class !== "flag-0" &&td_class !== "flag-0 flag0pressed" && td_class !== "flag0pressed flag-0" && /^flag/.exec(td_class))) {
        return 1;
      }
      //td_class가 flag-0이나 flag0pressed 중 하나 이상을포함하면 setclass를 모두삭제
      if (td_class === "flag-0" || td_class === "flag-0 flag0pressed" || td_class === "flag0pressed flag-0") {
        this.set_class(start_x, start_y, null);
      }

      // 첫 클릭 보호(검/흰 모두)
      if (this.opened_cells === 0 && this.mines[start_x][start_y] !== 0) {
        if (!this._relocateFirstClick(start_x, start_y)) {
          this.start(start_x, start_y);
        }
      }

      var pr = this.press(start_x, start_y);
      if (pr < 0) {
        var allowed = this.get_reloc_allowed();
      // 모드1이면 연속 구제 1회 제한 추가
      var canConsecutive = (this.infinite_reloc === true) ? ((this._consecutive_reloc | 0) < 1) : true;
      if ((this.reloc_used || 0) < allowed && canConsecutive) {
          if (this.try_relocate_from(start_x, start_y)) {
            this.reloc_used = (this.reloc_used || 0) + 1;
            if (this.infinite_reloc === true) {
              this._consecutive_reloc = (this._consecutive_reloc | 0) + 1; // 최대 1까지 누적
            }
            pr = this.press(start_x, start_y);
            if (pr < 0) return -1;
          } else {
            return -1;
          }
        } else {
          return -1;
        }
      }
      else {
        // 시작 칸이 애초에 안전(구제 안함) → 연속 구제 카운터 리셋
        if (this.infinite_reloc === true) this._consecutive_reloc = 0;
      }
      // ★ 시작 칸이 "진짜 0"일 때만 확장 허용 (상쇄0=1000은 확장 금지)
      var v0 = this.near_mines[start_x][start_y];
      if (v0 !== 0) {
        return 0; // 숫자칸(양/음수/상쇄0)은 확장하지 않음
      }

      const W = this.columns, H = this.rows;
      const visit = this._visit;
      const qx = this._queueX;
      const qy = this._queueY;

      const gen = (this._visitGen = (this._visitGen | 0) + 1) || (this._visitGen = 1);

      function idx(x, y) { return y * W + x; }
      function markVisited(x, y) { visit[idx(x, y)] = gen; }
      function isVisited(x, y) { return visit[idx(x, y)] === gen; }

      let head = 0, tail = 0;
      qx[tail] = start_x; qy[tail] = start_y; tail++;
      markVisited(start_x, start_y);

      // 시작칸 자동 오픈 규칙 (XP 유사): 0일 때만 인접한 칸들 검사 시작
      var neighbors = this.near_positions(start_x, start_y);
      for (var i = 0; i < neighbors.length; i++) {
        var nx = neighbors[i][0], ny = neighbors[i][1];
        var c = this.get_class(nx, ny);

        if (c === null || c === "flag-0" || c === "pressed"|| c === "flag0pressed") {
          if (this.press(nx, ny) < 0) return -1;
          if (!isVisited(nx, ny)) {
            qx[tail] = nx; qy[tail] = ny; tail++;
            markVisited(nx, ny);
          }
        }
      }

      // BFS 확장: "진짜 0"만 계속 퍼짐 (상쇄0은 퍼지지 않음)
      while (head < tail) {
        var x = qx[head], y = qy[head]; head++;

        var v = this.near_mines[x][y];
        if (v === 0) { // 오직 0만 확장
          var adj = this.near_positions(x, y);
          for (var j = 0; j < adj.length; j++) {
            var ax = adj[j][0], ay = adj[j][1];
            var cls = this.get_class(ax, ay);
            if (cls === null || cls === "flag-0" || cls === "pressed" || cls === "flag0pressed") {
              if (this.press(ax, ay) < 0) return -1;

              if (!isVisited(ax, ay)) {
                qx[tail] = ax; qy[tail] = ay; tail++;
                markVisited(ax, ay);
              }
            }
          }
        }
      }
      return 0;
    };

    /* ---------- 게임 종료 ---------- */
    Minefield.prototype.gameover = function (fail_x, fail_y) {
      var tmp = (document.getElementsByClassName("minetable")[0]).getElementsByTagName("td");
      for (var i = 0; i < tmp.length; i++) {
        var td = tmp[i];
        td.onclick = td.onmouseup = td.onmousedown = td.oncontextmenu = null;
      }
      this.game_status = -1;
      if (typeof this.on_game_status_changed === "function") {
        this.on_game_status_changed();
      }
      const self = this;

      function cellClassAtXY(x, y) {
        const mine = self.mines[x][y];
        const flagSigned = self.flags[x][y];
        const cur = self.get_class(x, y);

        if (mine !== 0) {
          // 올바른 깃발이면 그대로 두는 기존 정책 유지
          if (cur !== "flag-0" && /^flag/.test(cur)) return cur;

          if (x === fail_x && y === fail_y) {
            if (mine > 0) return "mine-exploded" + mine;
            else return "mine-exploded-m" + (-mine);
          }
          if (mine > 0) return "mine-" + mine;
          else return "mine-m" + (-mine);
        } else {
          if (flagSigned !== 0) {
            if (flagSigned > 0) return "mine-wrong" + flagSigned;
            else return "mine-wrong-m" + (-flagSigned);
          }
          var v = self.near_mines[x][y];
          if (v === 0) return "empty";
          if (v === 1000) return "near-0";
          if (v > 0) return "near-" + v;
          return "near-m" + (-v);
        }
      }

      const order = this._buildRowOrder(fail_y, 50);
      this._renderRowsIncrementally(order, cellClassAtXY, function () { });
      return true;
    };

    Minefield.prototype.gameclear = function () {
      var tmp = (document.getElementsByClassName("minetable")[0]).getElementsByTagName("td");
      for (var i = 0; i < tmp.length; i++) {
        var td = tmp[i];
        td.onclick = td.onmouseup = td.onmousedown = td.oncontextmenu = null;
      }

      this.num_flags = 0;
      this.num_flags_white = 0;
      this.near_flags = this.new_table();

      for (var y = 0; y < this.rows; y++) {
        for (var x = 0; x < this.columns; x++) {
          var mine = this.mines[x][y];
          if (mine !== 0) {
            if (mine > 0) {
              this.flags[x][y] = mine;
              this.num_flags += mine;
              var adj = this.near_positions(x, y);
              for (var i2 = 0; i2 < adj.length; i2++) {
                var nx = adj[i2][0], ny = adj[i2][1];
                this.near_flags[nx][ny] += mine;
              }
            } else {
              var w = -mine;
              this.flags[x][y] = -w;
              this.num_flags_white += w;
              var adjw = this.near_positions(x, y);
              for (var j2 = 0; j2 < adjw.length; j2++) {
                var wx = adjw[j2][0], wy = adjw[j2][1];
                this.near_flags[wx][wy] -= w; // 부호 유의
              }
            }
          } else {
            this.flags[x][y] = 0;
          }
        }
      }

      const self = this;
      function cellClassAtXY(x, y) {
        const mine = self.mines[x][y];
        if (mine !== 0) {
          if (mine > 0) return "flag-" + mine;
          return "flag-m" + (-mine);
        }
        var v = self.near_mines[x][y];
        if (v === 0) return "empty";
        if (v === 1000) return "near-0";
        if (v > 0) return "near-" + v;
        return "near-m" + (-v);
      }

      const order = Array.from({ length: this.rows }, (_, y) => y);
      this._renderRowsIncrementally(order, cellClassAtXY, () => {
        const self = this;
        self.game_status = -2;
        // ★ 추가: 상태 변경 알림을 즉시 호출해 타이머를 멈춘다
        if (typeof self.on_game_status_changed === "function") {
          self.on_game_status_changed();
        }
      });

      return this.game_status;
    };

    /* ---------- 마우스 프레스 표시 ---------- */
    Minefield.prototype.on_down = function (x, y, isRightClick) {
      this.game_status2 = 1;
      if (!isRightClick) this.on_game_status_changed2();
      return 1;
    };


    /* ---------- 디버그 ---------- */
    Minefield.prototype.stringify = function () {
      return JSON.stringify(this.mines);
    };

    return Minefield;
  })();
/* =========================================================
 * solveonestep(input?)
 *  - 한 스텝(오픈 or 깃발)만 논리적으로 100% 확정 가능한지 검사
 *  - 확정 가능하면 "첫 번째" 동작(좌상단 우선)을 nopick-trace 타입으로 반환
 *  - 없으면 null
 *
 * input(선택):
 * {
 *   columns, rows,
 *   near_mines: 2D [x][y] (0, 1000, ±n),
 *   flags: 2D [x][y] (0, ±k)  // flag-0(?)는 0으로 두면 됨
 *   opened: 2D [x][y] boolean | 1D(Uint8Array 등) | (x,y)=>boolean
 *   max_mines, max_mines_white,
 *   num_mines_white
 * }
 * ========================================================= */
Minefield.prototype.solveonestep = function (input) {
  const self = this;

  const W = (input && input.columns != null ? input.columns : this.columns) | 0;
  const H = (input && input.rows != null ? input.rows : this.rows) | 0;

  const near = (input && input.near_mines) ? input.near_mines : this.near_mines;
  const flags = (input && input.flags) ? input.flags : this.flags;

  const capB = (input && input.max_mines != null ? input.max_mines : this.max_mines) | 0;
  const capW = (input && input.max_mines_white != null ? input.max_mines_white : this.max_mines_white) | 0;

  const numWhite = (input && input.num_mines_white != null ? input.num_mines_white : this.num_mines_white) | 0;
  const hasWhites = (numWhite > 0) && (capW > 0);
  const classicMode = (!hasWhites) && (Math.max(1, capB) === 1);

  const idx = (x, y) => (y * W + x) | 0;

  // --- opened 판정(입력 우선, 없으면 DOM 기반 this.is_opened 사용) ---
  let openedFn = null;
  if (input && input.opened != null) {
    if (typeof input.opened === "function") {
      openedFn = input.opened;
    } else {
      // 2D or 1D
      const op = input.opened;
      if (Array.isArray(op) && Array.isArray(op[0])) {
        openedFn = (x, y) => !!op[x][y];
      } else {
        // 1D typed array or flat array
        openedFn = (x, y) => !!op[idx(x, y)];
      }
    }
  } else {
    openedFn = (x, y) => self.is_opened(x, y);
  }

  // --- flag 값(부호 포함) ---
  function flagVal(x, y) {
    const v = (flags && flags[x]) ? (flags[x][y] | 0) : 0;
    return v | 0;
  }

  // --- 인접 좌표 ---
  function neigh(x, y) {
    // input이 별도 near_positions 제공하면 그걸 쓰고, 없으면 this.near_positions(캐시)
    if (input && typeof input.near_positions === "function") return input.near_positions(x, y);
    return self.near_positions(x, y);
  }

  // =========================================================
  // 1) 제약(열린 숫자칸)에서 frontier(vars/cons) 구성
  //    - "열린칸 또는 깃발 주변" 범위는 결국 '열린 숫자칸의 인접 미지'가 핵심
  // =========================================================
  const varIndex = new Map();      // "x,y" -> id
  const vars = [];                // id -> [x,y]
  const cons = [];                // { vars:[id...], target:int, isAbs:bool, isTrueZero:bool }
  // isTrueZero: near_mines==0 (진짜0) → 인접은 반드시 0이어야 함 (whites 있어도 안전)

  function addVar(x, y) {
    const key = x + "," + y;
    let id = varIndex.get(key);
    if (id == null) { id = vars.length; varIndex.set(key, id); vars.push([x, y]); }
    return id;
  }

  // (A) 먼저 "진짜 0(near_mines==0) 열린 칸"으로부터 즉시 안전 오픈 찾기
  //     - near_mines==0은 abs==0이므로 흰지뢰가 있어도 인접은 전부 0 확정
  //     - 단, 주변에 이미 nonzero flag가 꽂혀 있으면 모순 상태(사용자가 잘못 꽂은 것) → 여기선 안전 동작 없음
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!openedFn(x, y)) continue;
    const v0 = near[x][y] | 0;
    if (v0 !== 0) continue; // true-zero만
    const adj = neigh(x, y);

    // fixed(nonzero flag)가 하나라도 있으면 이 정보 자체가 깨진 상태라서 "완전 타당" 오픈을 제안하지 않음
    let bad = false;
    for (let i = 0; i < adj.length; i++) {
      const nx = adj[i][0], ny = adj[i][1];
      const f = flagVal(nx, ny);
      if (f !== 0) { bad = true; break; }
    }
    if (bad) continue;

    // 인접 미지(열리지 않았고, nonzero flag 아님) 중 첫 번째를 오픈 제안
    for (let i = 0; i < adj.length; i++) {
      const nx = adj[i][0], ny = adj[i][1];
      if (openedFn(nx, ny)) continue;
      if (flagVal(nx, ny) !== 0) continue;
      // "주변 열린칸/깃발 주변" 조건도 만족
      return { kind: "open", x: nx, y: ny, reason: "RuleA N==0 (true 0)" };
    }
  }

  // (B) 일반 숫자칸(±n 또는 1000) 제약 수집
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!openedFn(x, y)) continue;

    const raw = near[x][y] | 0;
    if (raw === 0) continue; // true-zero는 위에서 처리

    let target = (raw === 1000 ? 0 : raw) | 0;
    let isAbs = (raw === 1000);
    let absFixed = 0;

    const adj = neigh(x, y);
    const vs = [];
    for (let i = 0; i < adj.length; i++) {
      const nx = adj[i][0], ny = adj[i][1];
      if (openedFn(nx, ny)) continue;

      const f = flagVal(nx, ny);
      if (f !== 0) {
        target -= f;
        absFixed += Math.abs(f);
        continue;
      }
      vs.push(addVar(nx, ny));
    }

    // 1000(상쇄0)의 abs>0 조건은 "전체 이웃 중 하나라도 nonzero"인데
    // 이미 fixed(nonzero flag)가 있으면 남은 변수는 모두 0이어도 abs>0 만족이므로 isAbs를 끈다.
    if (isAbs && absFixed > 0) isAbs = false;

    // 변수 없고 isAbs도 아니면 제약 의미 없음
    if (vs.length > 0 || isAbs) cons.push({ vars: vs, target: target | 0, isAbs: !!isAbs });
  }

  if (vars.length === 0 || cons.length === 0) return null;

  // =========================================================
  // 2) "흰지뢰 없음"일 때 더 강한 로컬 규칙 (RuleA/B + subset + bounds)
  // =========================================================
  // 공통: 제약을 y,x 순서대로 스캔해서 "첫 번째" 결정만 반환(요구사항)
  function returnFirstOpenFromList(list, reason) {
    // list는 [varId...] 혹은 [[x,y]...]
    for (let k = 0; k < list.length; k++) {
      const item = list[k];
      const x = Array.isArray(item) ? item[0] : vars[item][0];
      const y = Array.isArray(item) ? item[1] : vars[item][1];
      // 주변 조건(열리지 않았고 nonzero flag 아님) 재확인
      if (openedFn(x, y)) continue;
      if (flagVal(x, y) !== 0) continue;
      return { kind: "open", x, y, reason };
    }
    return null;
  }
  function returnFirstFixFromList(list, val, reason) {
    for (let k = 0; k < list.length; k++) {
      const item = list[k];
      const x = Array.isArray(item) ? item[0] : vars[item][0];
      const y = Array.isArray(item) ? item[1] : vars[item][1];
      if (openedFn(x, y)) continue;
      if (flagVal(x, y) !== 0) continue;
      return { kind: "markMine", x, y, reason, val: val | 0 };
    }
    return null;
  }

  // ---- (2-1) RuleA/B: 한 제약만으로 확정되는 것 ----
  // - true-zero는 이미 처리됨
  // - no-whites에서만: target==0 → 모두 0
  // - classic: target==U → 모두 1
  // - capB>1: target==U*capB → 모두 capB
  // - U==1: var==target (부호 포함)
  {
    // y,x 순서로 가장 먼저 걸리는 제약의 가장 먼저 걸리는 var를 반환하기 위해:
    // cons를 만든 순서(스캔 순서) 그대로 돌고, vars도 id순서(좌상단에 가까움)로 처리
    for (let ci = 0; ci < cons.length; ci++) {
      const c = cons[ci];
      const vs = c.vars;
      const U = vs.length | 0;
      const N = c.target | 0;

      if (U <= 0) continue;

      // U==1: 부호 포함 정확
      if (U === 1) {
        const [x, y] = vars[vs[0]];
        // 1000(상쇄0)에서 U==1,target==0 이면서 abs>0이면 모순 → 확정 move 없음
        if (c.isAbs && N === 0) continue;

        if (N === 0 && !c.isAbs) {
          if (!openedFn(x, y) && flagVal(x, y) === 0) return { kind: "open", x, y, reason: "RuleB U==1,N==0" };
        } else {
          // N이 음수면 흰 확정, 양수면 검은 확정
          if (N !== 0 && !openedFn(x, y) && flagVal(x, y) === 0) {
            // cap 범위 밖이면 이 보드는 이미 모순 상태라서 제안 없음
            if (N < -capW || N > capB) continue;
            return { kind: "markMine", x, y, reason: "RuleB U==1 exact", val: N | 0 };
          }
        }
      }

      if (!hasWhites) {
        // target==0 → 전부 안전
        if (!c.isAbs && N === 0) {
          const r = returnFirstOpenFromList(vs, "RuleA N==0");
          if (r) return r;
        }

        // classic: target==U → 전부 1
        if (classicMode && !c.isAbs && N === U) {
          const r = returnFirstFixFromList(vs, 1, "RuleB N==U");
          if (r) return r;
        }

        // capB>1: target==U*capB → 전부 capB
        if (!classicMode && !c.isAbs && N === (U * capB)) {
          const r = returnFirstFixFromList(vs, capB, "RuleB cap");
          if (r) return r;
        }
      }
    }
  }

  // ---- (2-2) Subset(부분집합) ----
  // - no-whites일 때는 Δ=0 → 차집합 안전, Δ=|S|*capB → 차집합 capB
  // - whites가 있어도 |S|==1 이면 v==Δ는 항상 성립(부호 포함) → 정확 고정 가능
  {
    // 작은 제약만 사용(성능/의미)
    const small = [];
    for (let ci = 0; ci < cons.length; ci++) {
      const c = cons[ci];
      if (c.isAbs) continue;           // abs 제약은 subset에 섞지 않음(안전 우선)
      if (!c.vars || c.vars.length === 0) continue;
      if (c.vars.length > 8) continue; // 과도하면 스킵
      const s = new Set(c.vars);
      small.push({ s, t: c.target | 0 });
    }

    // set 포함 체크
    function isSubset(A, B) {
      for (const v of A) if (!B.has(v)) return false;
      return true;
    }

    // 반환을 "첫 번째 셀"로 맞추기 위해:
    // 파생 결과를 좌표 순으로 정렬 후 첫 번째를 택한다.
    function pickFirstCoord(coords) {
      coords.sort((p, q) => (p[1] - q[1]) || (p[0] - q[0]));
      return coords[0];
    }

    for (let i = 0; i < small.length; i++) {
      for (let j = 0; j < small.length; j++) {
        if (i === j) continue;
        const A = small[i], B = small[j];
        if (!isSubset(A.s, B.s)) continue;

        // S = B \ A
        const S = [];
        for (const v of B.s) if (!A.s.has(v)) S.push(v);
        if (S.length === 0) continue;

        const delta = (B.t - A.t) | 0;

        // |S|==1: var == delta (부호 포함) → 항상 안전한 결론
        if (S.length === 1) {
          const [x, y] = vars[S[0]];
          if (openedFn(x, y) || flagVal(x, y) !== 0) continue;
          if (delta === 0) return { kind: "open", x, y, reason: "subset single exact (0)" };
          // cap 밖이면 모순이거나 불신 → 여기선 제안 안 함
          if (delta < -capW || delta > capB) continue;
          return { kind: "markMine", x, y, reason: "subset single exact", val: delta | 0 };
        }

        // no-whites에서만 다원 subset 오픈/강제
        if (!hasWhites) {
          if (delta === 0) {
            const coords = S.map(id => vars[id]).filter(([x, y]) => !openedFn(x, y) && flagVal(x, y) === 0);
            if (coords.length) {
              const [x, y] = pickFirstCoord(coords);
              return { kind: "open", x, y, reason: "subset Δ=0" };
            }
          } else if (delta === (S.length * capB)) {
            const coords = S.map(id => vars[id]).filter(([x, y]) => !openedFn(x, y) && flagVal(x, y) === 0);
            if (coords.length) {
              const [x, y] = pickFirstCoord(coords);
              return { kind: "markMine", x, y, reason: "subset Δ=|S|*cap", val: capB | 0 };
            }
          }
        }
      }
    }
  }

  // ---- (2-3) Bounds 전파(약식 선형 하한/상한) ----
  // - no-whites: v in [0..capB]
  // - whites:    v in [-capW..capB]
  // 결과로 vmin==vmax이면 확정(0이면 open, 아니면 markMine)
  {
    const n = vars.length | 0;
    if (n > 0 && cons.length > 0) {
      const vmin = new Int16Array(n);
      const vmax = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        vmin[i] = hasWhites ? (-capW | 0) : 0;
        vmax[i] = capB | 0;
      }

      // 반복 축소(고정점까지)
      for (let iter = 0; iter < 10; iter++) {
        let any = false;
        for (let ci = 0; ci < cons.length; ci++) {
          const c = cons[ci];
          if (c.isAbs) continue; // abs 제약은 bounds로 다루기 애매하니 제외(안전 우선)
          const vs = c.vars;
          if (!vs || vs.length === 0) continue;
          const N = c.target | 0;

          let sumMin = 0, sumMax = 0;
          for (let k = 0; k < vs.length; k++) { sumMin += vmin[vs[k]]; sumMax += vmax[vs[k]]; }

          for (let k = 0; k < vs.length; k++) {
            const id = vs[k];
            const othersMin = sumMin - vmin[id];
            const othersMax = sumMax - vmax[id];
            const newMin = Math.max(vmin[id], N - othersMax);
            const newMax = Math.min(vmax[id], N - othersMin);
            if (newMin > vmin[id]) { vmin[id] = newMin; any = true; }
            if (newMax < vmax[id]) { vmax[id] = newMax; any = true; }
          }
        }
        if (!any) break;
      }

      // "첫 번째 셀" 반환: 좌표순으로 가장 먼저 확정되는 것을 반환
      let best = null;
      for (let id = 0; id < n; id++) {
        if (vmin[id] !== vmax[id]) continue;
        const [x, y] = vars[id];
        if (openedFn(x, y) || flagVal(x, y) !== 0) continue;

        const v = vmin[id] | 0;
        const cand = (v === 0)
          ? { kind: "open", x, y, reason: hasWhites ? "bounds (general) ==0" : "bounds min==max==0" }
          : { kind: "markMine", x, y, reason: hasWhites ? "bounds (general) exact" : "bounds exact", val: v | 0 };

        if (!best || (cand.y < best.y) || (cand.y === best.y && cand.x < best.x)) best = cand;
      }
      if (best) return best;
    }
  }

  // =========================================================
  // 3) 마지막: (가능하면) GAC(도메인 단일화)로 singleton 찾기
  //    - 기존 nopick solver의 _enforceGACSigned 재사용
  //    - 너무 크면 비용이 커지니 48 이하만 적용
  // =========================================================
  if (typeof this._enforceGACSigned === "function") {
    const COMP_CAP = 48;
    if (vars.length <= COMP_CAP) {
      const r = this._enforceGACSigned(vars, cons, capB, capW);
      if (r && !r.fail && r.decided && r.decided.length) {
        // decided 중 좌표순 첫 번째를 반환
        let best = null;
        for (let i = 0; i < r.decided.length; i++) {
          const d = r.decided[i];
          if (openedFn(d.x, d.y) || flagVal(d.x, d.y) !== 0) continue;
          const cand = (d.type === "open")
            ? { kind: "open", x: d.x, y: d.y, reason: "GAC domain=={0}" }
            : { kind: "markMine", x: d.x, y: d.y, reason: "GAC singleton", val: (d.val | 0) };
          if (!best || (cand.y < best.y) || (cand.y === best.y && cand.x < best.x)) best = cand;
        }
        if (best) return best;
      }
    }
  }

  // 여기까지 왔으면 "완전 타당"한 1스텝이 없음 = 찍기(guess) 필요
  return null;
};

  window.Minefield = Minefield;
}).call(this);