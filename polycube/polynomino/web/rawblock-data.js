// All one-sided polyominoes from monomino to hexomino + septomino+
// Counts: mono(1) domino(1) tromino(2) tetromino(7) pentomino(18) hexomino(60) + septomino(3)
(function() {
var blocks = [];
function B(pattern, colorVal) {
  var rows = pattern.trim().split('\n').map(function(r){return r.trim();});
  var cells = [];
  for (var r=0;r<rows.length;r++)
    for (var c=0;c<rows[r].length;c++)
      if (rows[r][c]==='#') cells.push([r,c]);
  var sr = 0, sc = 0;
  for (var i = 0; i < cells.length; i++) { sr += cells[i][0]; sc += cells[i][1]; }
  sr = Math.round(sr / cells.length); sc = Math.round(sc / cells.length);
  for (var i = 0; i < cells.length; i++) { cells[i] = [cells[i][0] - sr, cells[i][1] - sc]; }
  return { cells: cells, val: colorVal, w: rows[0].length, h: rows.length };
}

// Monomino (1): 1 shape
blocks.push(B('#', 65)); // 0
// Domino (2): 1 shape
blocks.push(B('##', 66)); // 1
// Tromino (3): 2 shapes
blocks.push(B('###', 67)); // 2: I
blocks.push(B('##\n.#', 68)); // 3: L
// Tetromino (4): 7 one-sided shapes
blocks.push(B('##\n##', 69)); // 4
blocks.push(B('##.\n.##', 70)); // 5
blocks.push(B('##\n#.\n#.', 71)); // 6
blocks.push(B('##\n.#\n.#', 72)); // 7
blocks.push(B('#.\n##\n.#', 73)); // 8
blocks.push(B('.#\n##\n.#', 74)); // 9
blocks.push(B('#\n#\n#\n#', 75)); // 10
// Pentomino (5): 18 one-sided shapes
blocks.push(B('##\n##\n#.', 76)); // 11
blocks.push(B('##\n##\n.#', 77)); // 12
blocks.push(B('##\n.#\n##', 78)); // 13
blocks.push(B('###\n.#.\n.#.', 79)); // 14
blocks.push(B('###\n..#\n..#', 80)); // 15
blocks.push(B('##.\n.##\n.#.', 81)); // 16
blocks.push(B('##.\n.##\n..#', 82)); // 17
blocks.push(B('##.\n.#.\n.##', 83)); // 18
blocks.push(B('.##\n##.\n.#.', 84)); // 19
blocks.push(B('.##\n.#.\n##.', 85)); // 20
blocks.push(B('.#.\n###\n.#.', 86)); // 21
blocks.push(B('##\n#.\n#.\n#.', 87)); // 22
blocks.push(B('##\n.#\n.#\n.#', 88)); // 23
blocks.push(B('#.\n##\n#.\n#.', 89)); // 24
blocks.push(B('#.\n##\n.#\n.#', 90)); // 25
blocks.push(B('.#\n##\n#.\n#.', 3)); // 26
blocks.push(B('.#\n##\n.#\n.#', 92)); // 27
blocks.push(B('#\n#\n#\n#\n#', 93)); // 28
// Hexomino (6): 60 one-sided shapes
blocks.push(B('##\n##\n##', 94)); // 29
blocks.push(B('###\n##.\n.#.', 95)); // 30
blocks.push(B('###\n#.#\n..#', 96)); // 31
blocks.push(B('###\n.##\n.#.', 97)); // 32
blocks.push(B('###\n.##\n..#', 98)); // 33
blocks.push(B('###\n.#.\n##.', 99)); // 34
blocks.push(B('###\n.#.\n.##', 100)); // 35
blocks.push(B('###\n..#\n.##', 101)); // 36
blocks.push(B('##.\n###\n.#.', 33)); // 37
blocks.push(B('##.\n##.\n.##', 34)); // 38
blocks.push(B('##.\n.##\n##.', 35)); // 39
blocks.push(B('.##\n.##\n##.', 48)); // 40
blocks.push(B('###.\n..##\n..#.', 106)); // 41
blocks.push(B('###.\n..#.\n..##', 107)); // 42
blocks.push(B('##..\n.##.\n..##', 108)); // 43
blocks.push(B('##\n##\n#.\n#.', 109)); // 44
blocks.push(B('##\n##\n.#\n.#', 110)); // 45
blocks.push(B('##\n#.\n##\n#.', 111)); // 46
blocks.push(B('##\n.#\n##\n#.', 112)); // 47
blocks.push(B('##\n.#\n##\n.#', 113)); // 48
blocks.push(B('##\n.#\n.#\n##', 114)); // 49
blocks.push(B('#.\n##\n##\n.#', 115)); // 50
blocks.push(B('#.\n##\n.#\n##', 36)); // 51
blocks.push(B('.#\n##\n##\n#.', 37)); // 52
blocks.push(B('.#\n##\n##\n.#', 38)); // 53
blocks.push(B('###\n#..\n#..\n#..', 39)); // 54
blocks.push(B('###\n.#.\n.#.\n.#.', 40)); // 55
blocks.push(B('###\n..#\n..#\n..#', 41)); // 56
blocks.push(B('##.\n.##\n.#.\n.#.', 42)); // 57
blocks.push(B('##.\n.##\n..#\n..#', 43)); // 58
blocks.push(B('##.\n.#.\n.##\n.#.', 44)); // 59
blocks.push(B('##.\n.#.\n.#.\n.##', 45)); // 60
blocks.push(B('#..\n###\n#..\n#..', 46)); // 61
blocks.push(B('#..\n###\n.#.\n.#.', 47)); // 62
blocks.push(B('#..\n###\n..#\n..#', 128)); // 63
blocks.push(B('#..\n##.\n.##\n.#.', 129)); // 64
blocks.push(B('#..\n##.\n.##\n..#', 130)); // 65
blocks.push(B('#..\n##.\n.#.\n.##', 131)); // 66
blocks.push(B('.##\n##.\n#..\n#..', 132)); // 67
blocks.push(B('.##\n##.\n.#.\n.#.', 133)); // 68
blocks.push(B('.##\n.#.\n##.\n.#.', 134)); // 69
blocks.push(B('.##\n.#.\n.#.\n##.', 135)); // 70
blocks.push(B('.#.\n###\n.#.\n.#.', 136)); // 71
blocks.push(B('.#.\n###\n..#\n..#', 137)); // 72
blocks.push(B('.#.\n##.\n.##\n.#.', 138)); // 73
blocks.push(B('.#.\n.##\n##.\n.#.', 139)); // 74
blocks.push(B('..#\n###\n.#.\n.#.', 140)); // 75
blocks.push(B('..#\n###\n..#\n..#', 141)); // 76
blocks.push(B('..#\n.##\n##.\n.#.', 142)); // 77
blocks.push(B('..#\n.##\n.#.\n##.', 143)); // 78
blocks.push(B('##\n#.\n#.\n#.\n#.', 144)); // 79
blocks.push(B('##\n.#\n.#\n.#\n.#', 145)); // 80
blocks.push(B('#.\n##\n#.\n#.\n#.', 146)); // 81
blocks.push(B('#.\n##\n.#\n.#\n.#', 147)); // 82
blocks.push(B('#.\n#.\n##\n.#\n.#', 148)); // 83
blocks.push(B('.#\n##\n#.\n#.\n#.', 149)); // 84
blocks.push(B('.#\n##\n.#\n.#\n.#', 150)); // 85
blocks.push(B('.#\n.#\n##\n#.\n#.', 151)); // 86
blocks.push(B('.#\n.#\n##\n.#\n.#', 152)); // 87
blocks.push(B('#\n#\n#\n#\n#\n#', 153)); // 88
// Septomino+ (7+): 3 shapes
blocks.push(B('#######', 154)); // 89: I-7
blocks.push(B('###\n###\n###', 155)); // 90: 3x3
blocks.push(B('###\n#.#\n###', 156)); // 91: hollow 3x3
blocks.push(B('..#..\n..##.\n..#..\n#####', 239)); // 92: cross-T (Shang, gray)
// blocks.push(B('#######\n#...#..\n#.#####\n#.#...#\n#.#####\n#.#...#\n#.#####\n#...#..\n#.#.#.#', 100)); // 93: maze 7x9 (copper) — disabled

window.RAWBLOCK_DATA_2D = blocks;
})();
