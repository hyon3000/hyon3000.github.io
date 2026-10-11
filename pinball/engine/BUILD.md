# engine/ - SpaceCadetPinball web build

`SpaceCadetPinball.js` (one self-contained file: wasm and game data are embedded, so it also works from file://) are built from https://github.com/alula/SpaceCadetPinball (MIT, Emscripten port of
https://github.com/k4zmu2a/SpaceCadetPinball) with `webmenu.patch` applied:

* the game's own ImGui menu bar is hidden (`g_hideMenu`), the page (pinball.js) provides the menus
* exported functions `pbweb_cmd(id)` / `pbweb_get(id)` run menu entries and read option state (see `winmain.cpp`)

Build (emsdk >= 3.x with Python >= 3.10 first in PATH):

    git clone https://github.com/alula/SpaceCadetPinball scp && cd scp && git apply webmenu.patch
    # put the game's data files (PINBALL.DAT, sounds, ...) into game_resources/
    # (the patch also drops the removed DEMANGLE_SUPPORT flag, embeds game_resources and builds a single .js)
    emcmake cmake -S . -B out -DCMAKE_BUILD_TYPE=Release && cmake --build out -j
    cp bin/SpaceCadetPinball.js <this folder>
