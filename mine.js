(function() {
  var Minefield;

  Minefield = (function() {
    function Minefield(window1, game_status_changed_func) {
      this.window = window1;
      this.game_status_changed_func = game_status_changed_func != null ? game_status_changed_func : null;
      this.game_status = -1;
      this.table = null;
      this.on_click_func = null;
      this.on_rclick_func = null;
    }

    Minefield.prototype.new_table = function() {
      var i, ref, results, x, y;
      results = [];
      for (x = i = 1, ref = this.columns; 1 <= ref ? i <= ref : i >= ref; x = 1 <= ref ? ++i : --i) {
        results.push((function() {
          var j, ref1, results1;
          results1 = [];
          for (y = j = 1, ref1 = this.rows; 1 <= ref1 ? j <= ref1 : j >= ref1; y = 1 <= ref1 ? ++j : --j) {
            results1.push(0);
          }
          return results1;
        }).call(this));
      }
      return results;
    };

    Minefield.prototype.init_board = function(columns, rows, num_mines, max_mines) {
      this.columns = columns;
      this.rows = rows;
      this.num_mines = num_mines;
      this.max_mines = max_mines != null ? max_mines : 1;
      return this.reset_board();
    };

    Minefield.prototype.reset_board = function() {
      var i, j, on_click_to, on_rclick_to, ref, ref1, td, tr, x, y;
      if (this.table) {
        this.window.removeChild(this.table);
        this.game_status = -1;
        this.table = null;
      }
      this.table = document.createElement('table');
      this.table.setAttribute("class", "minetable");
      this.num_flags = 0;
      this.flags = this.new_table();
      this.near_flags = this.new_table();
      this.tds = this.new_table();
      for (y = i = 0, ref = this.rows - 1; 0 <= ref ? i <= ref : i >= ref; y = 0 <= ref ? ++i : --i) {
        tr = document.createElement('tr');
        for (x = j = 0, ref1 = this.columns - 1; 0 <= ref1 ? j <= ref1 : j >= ref1; x = 0 <= ref1 ? ++j : --j) {
          td = document.createElement('td');
          td.setAttribute("id", "x" + x + "y" + y);
          on_click_to = function(x_, y_, self) {
            return function() {
              self.on_click(x_, y_);
              return false;
            };
          };
          td.onclick = on_click_to(x, y, this);
          on_rclick_to = function(x_, y_, self) {
            return function() {
              self.on_rclick(x_, y_);
              return false;
            };
          };
          td.oncontextmenu = on_rclick_to(x, y, this);
          this.tds[x][y] = td;
          tr.appendChild(td);
        }
        this.table.appendChild(tr);
      }
      this.window.appendChild(this.table);
      this.init_mines();
      return this.on_game_status_changed();
    };

    Minefield.prototype.init_mines = function() {
      var n, n_max, num_mine_created, x, y;
      this.mines = this.new_table();
      this.remaining = this.rows * this.columns;
      num_mine_created = 0;
      while (num_mine_created < this.num_mines) {
        x = Math.floor(Math.random() * this.columns);
        y = Math.floor(Math.random() * this.rows);
        if (this.mines[x][y] < this.max_mines) {
          n_max = this.max_mines - this.mines[x][y];
          n_max = Math.min(n_max, this.num_mines - num_mine_created);
          n = Math.floor(Math.random() * n_max) + 1;
          if (this.mines[x][y] === 0) {
            this.remaining -= 1;
          }
          this.mines[x][y] += n;
          num_mine_created += n;
        }
      }
      this.near_mines = this.generate_near_mines(this.mines);
      return this.game_status = 1;
    };

    Minefield.prototype.generate_near_mines = function(mines) {
      var i, j, k, len, near_mines, nx, ny, ref, ref1, ref2, ref3, x, y;
      near_mines = this.new_table();
      for (x = i = 0, ref = this.columns - 1; 0 <= ref ? i <= ref : i >= ref; x = 0 <= ref ? ++i : --i) {
        for (y = j = 0, ref1 = this.rows - 1; 0 <= ref1 ? j <= ref1 : j >= ref1; y = 0 <= ref1 ? ++j : --j) {
          ref2 = this.near_positions(x, y);
          for (k = 0, len = ref2.length; k < len; k++) {
            ref3 = ref2[k], nx = ref3[0], ny = ref3[1];
            near_mines[nx][ny] += mines[x][y];
          }
        }
      }
      return near_mines;
    };

    Minefield.prototype.shift_table = function(table, dx, dy) {
      var i, j, new_table, new_x, new_y, nx, ny, ref, ref1;
      new_table = this.new_table();
      for (ny = i = 0, ref = this.rows - 1; 0 <= ref ? i <= ref : i >= ref; ny = 0 <= ref ? ++i : --i) {
        for (nx = j = 0, ref1 = this.columns - 1; 0 <= ref1 ? j <= ref1 : j >= ref1; nx = 0 <= ref1 ? ++j : --j) {
          new_x = (nx + dx + 2 * this.columns) % this.columns;
          new_y = (ny + dy + 2 * this.rows) % this.rows;
          new_table[new_x][new_y] = table[nx][ny];
        }
      }
      return new_table;
    };

    Minefield.prototype.get_class = function(x, y) {
      var td_class;
      td_class = this.tds[x][y].getAttribute("class");
      if (td_class === null || td_class === "") {
        null;
      }
      return td_class;
    };

    Minefield.prototype.set_class = function(x, y, val) {
      if (val === null) {
        return this.tds[x][y].removeAttribute("class");
      } else {
        return this.tds[x][y].setAttribute("class", val);
      }
    };

    Minefield.prototype.near_positions = function(x, y) {
      var i, j, nx, ny, ref, ref1, ref2, ref3, ret;
      ret = [];
      for (nx = i = ref = x - 1, ref1 = x + 1; ref <= ref1 ? i <= ref1 : i >= ref1; nx = ref <= ref1 ? ++i : --i) {
        for (ny = j = ref2 = y - 1, ref3 = y + 1; ref2 <= ref3 ? j <= ref3 : j >= ref3; ny = ref2 <= ref3 ? ++j : --j) {
          if (nx === x && ny === y) {
            continue;
          }
          if (nx >= this.columns || nx < 0 || ny >= this.rows || ny < 0) {
            continue;
          }
          ret.push([nx, ny]);
        }
      }
      return ret;
    };

    Minefield.prototype.on_click = function(x, y) {
      var old_game_status;
      old_game_status = this.game_status;
      if (this.game_status < 0) {
        return;
      }
      if (this.game_status === 1) {
        this.start(x, y);
      }
      if (this.expand(x, y) < 0) {
        this.gameover(x, y);
      }
      if (this.remaining === 0) {
        this.gameclear();
      }
      if (this.on_click_func) {
        this.on_click_func(x, y);
      }
      if (old_game_status !== this.game_status) {
        return this.on_game_status_changed();
      }
    };

    Minefield.prototype.on_rclick = function(x, y) {
      var old_game_status;
      old_game_status = this.game_status;
      if (this.game_status < 0) {
        return;
      }
      if (this.game_status === 1) {
        this.game_status = 0;
      }
      this.flag(x, y);
      if (this.on_rclick_func) {
        this.on_rclick_func(x, y);
      }
      if (old_game_status !== this.game_status) {
        return this.on_game_status_changed();
      }
    };

    Minefield.prototype.on_game_status_changed = function() {
      if (this.game_status_changed_func) {
        return this.game_status_changed_func(this.game_status);
      }
    };

    Minefield.prototype.start = function(x, y) {
      var i, nx, ny, ref, results;
      this.game_status = 0;
      if (this.mines[x][y] === 0) {
        return;
      }
      results = [];
      for (nx = i = 0, ref = this.columns - 1; 0 <= ref ? i <= ref : i >= ref; nx = 0 <= ref ? ++i : --i) {
        results.push((function() {
          var j, ref1, results1;
          results1 = [];
          for (ny = j = 0, ref1 = this.rows - 1; 0 <= ref1 ? j <= ref1 : j >= ref1; ny = 0 <= ref1 ? ++j : --j) {
            if (this.mines[nx][ny] === 0) {
              this.mines = this.shift_table(this.mines, x - nx, y - ny);
              results1.push(this.near_mines = this.generate_near_mines(this.mines));
            } else {
              results1.push(void 0);
            }
          }
          return results1;
        }).call(this));
      }
      return results;
    };

    Minefield.prototype.flag = function(x, y) {
      var i, len, n, nx, ny, ref, ref1, td_class;
      td_class = this.get_class(x, y);
      if (td_class !== null && !/^flag/.exec(td_class)) {
        return;
      }
      n = 1;
      if (this.flags[x][y] === this.max_mines) {
        n = -this.flags[x][y];
      }
      this.num_flags += n;
      this.flags[x][y] += n;
      ref = this.near_positions(x, y);
      for (i = 0, len = ref.length; i < len; i++) {
        ref1 = ref[i], nx = ref1[0], ny = ref1[1];
        this.near_flags[nx][ny] += n;
      }
      if (n > 0) {
        return this.set_class(x, y, "flag-" + this.flags[x][y]);
      } else {
        return this.set_class(x, y, null);
      }
    };

    Minefield.prototype.press = function(x, y) {
      if (this.mines[x][y] > 0) {
        return -1;
      } else if (this.get_class(x, y) !== null) {
        return 1;
      }
      this.remaining -= 1;
      if (this.near_mines[x][y] === 0) {
        this.set_class(x, y, "empty");
      } else {
        this.set_class(x, y, "near-" + this.near_mines[x][y]);
      }
      return 0;
    };

    Minefield.prototype.expand = function(start_x, start_y) {
      var i, j, len, len1, list, nx, ny, ref, ref1, ref2, ref3, ref4, start_flags, start_mines, td_class, x, y;
      td_class = this.get_class(start_x, start_y);
      if (td_class !== null && /^flag/.exec(td_class)) {
        return 1;
      }
      if (this.press(start_x, start_y) < 0) {
        return -1;
      }
      list = [[start_x, start_y]];
      start_mines = this.near_mines[start_x][start_y];
      start_flags = this.near_flags[start_x][start_y];
      if (start_mines === start_flags) {
        ref = this.near_positions(start_x, start_y);
        for (i = 0, len = ref.length; i < len; i++) {
          ref1 = ref[i], nx = ref1[0], ny = ref1[1];
          td_class = this.get_class(nx, ny);
          if (td_class === null) {
            list.push([nx, ny]);
            if (this.press(nx, ny) < 0) {
              return -1;
            }
          }
        }
      }
      while (list.length > 0) {
        ref2 = list.pop(), x = ref2[0], y = ref2[1];
        if (this.near_mines[x][y] === 0) {
          ref3 = this.near_positions(x, y);
          for (j = 0, len1 = ref3.length; j < len1; j++) {
            ref4 = ref3[j], nx = ref4[0], ny = ref4[1];
            td_class = this.get_class(nx, ny);
            if (td_class === null) {
              list.push([nx, ny]);
              if (this.press(nx, ny) < 0) {
                return -1;
              }
            }
          }
        }
      }
      return 0;
    };

    Minefield.prototype.gameover = function(fail_x, fail_y) {
      var i, mine, ref, results, x, y;
      this.game_status = -1;
      results = [];
      for (y = i = 0, ref = this.rows - 1; 0 <= ref ? i <= ref : i >= ref; y = 0 <= ref ? ++i : --i) {
        results.push((function() {
          var j, ref1, results1;
          results1 = [];
          for (x = j = 0, ref1 = this.columns - 1; 0 <= ref1 ? j <= ref1 : j >= ref1; x = 0 <= ref1 ? ++j : --j) {
            mine = this.mines[x][y];
            if (mine > 0) {
              if (/^flag/.exec(this.get_class(x, y))) {
                continue;
              }
              this.set_class(x, y, "mine-" + mine);
              if (fail_x === x && fail_y === y) {
                results1.push(this.set_class(x, y, "mine-exploded"));
              } else {
                results1.push(void 0);
              }
            } else {
              if (this.flags[x][y] > 0) {
                results1.push(this.set_class(x, y, "mine-wrong"));
              } else if (this.near_mines[x][y] === 0) {
                results1.push(this.set_class(x, y, "empty"));
              } else {
                results1.push(this.set_class(x, y, "near-" + this.near_mines[x][y]));
              }
            }
          }
          return results1;
        }).call(this));
      }
      return results;
    };

    Minefield.prototype.gameclear = function() {
      return this.game_status = -2;
    };

    Minefield.prototype.stringify = function() {
      return JSON.stringify(this.mines);
    };

    return Minefield;

  })();

  window.Minefield = Minefield;

}).call(this);
