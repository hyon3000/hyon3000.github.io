# Credits

**Doodle / 두들** is an original game. The idea of "draw shapes, they become physical objects, guide a ball to the star" is inspired by
Crayon Physics (and other Box2D puzzle games such as Cut the Rope, World of Goo, Bad Piggies, Poly Bridge). No art, level or code of those games is used;
all levels are generated procedurally (`core.js`) and all graphics are drawn at run time on a canvas.

## Third-party code

* **planck.js** v1.4.2 - a JavaScript rewrite of the Box2D physics engine.
  Copyright (c) 2025 Erin Catto, Ali Shakiba. MIT licence (full text in `vendor/planck/LICENSE.txt`, also embedded in the header of `vendor/planck/planck.min.js`).
  Source: npm package `planck` (https://github.com/piqnt/planck.js). Only the plain browser bundle `dist/planck.min.js` is vendored.
  (The bundle also embeds a small helper under the BSD-0 style Microsoft `tslib` licence; its notice stays in the file header.)
* jQuery / jQuery UI (MIT) and the Windows 98 frame styles (`win98.css`, `jquery.mswin*.js`, `images/`) are the same copies the other games of this site use.
