/* ============================================================================
   POKEAGENTS — a HeartGold-style pixel survival world that runs itself
   ----------------------------------------------------------------------------
   TWO AREAS now: PokeTown and the East Route (the road continues!). Use the
   arrows at the screen edges to look at the other area — agents, travellers,
   animals and monsters walk between them through the road.

   The agents live like little Sims with a survival twist: stats (health,
   hunger, energy, mood) decay, so they hunt, farm, forage, cook, eat, rest,
   shelter from rain, make friends — and at night fight zombies & demons with
   D&D-style dice (d20 vs AC, crits, initiative, fear saves). Nobody dies:
   downed agents show DOWNED and can be revived (click them!).

   Ambience: real-clock day/night, weather (press W to preview), swaying
   grass, flickering window lights, fireflies, butterflies, blinking eyes,
   townsfolk, passing travellers, and a pet imp.

   All art is generated in code — every sprite is a small pixel grid +
   palette, easy to swap for custom art later. Style notes: HEARTGOLD-STYLE.md
   ============================================================================ */

(() => {
  "use strict";
  window.__errs = [];
  window.addEventListener("error", e => window.__errs.push((e.message || "?") + " @ " + (e.filename || "") + ":" + e.lineno));

  // Virtual resolution: 32 x 18 tiles of 16px = 512 x 288 (a clean 16:9).
  const VW = 512, VH = 288, TILE = 16, COLS = 32, ROWS = 18;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  /* ---- small helpers --------------------------------------------------- */
  function hexToRgb(h) { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHex(r, g, b) { const c = v => ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); return "#" + c(r) + c(g) + c(b); }
  function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  function dormantify(hex, amount = 0.8, darken = 0.82) { const [r, g, b] = hexToRgb(hex); const l = 0.3 * r + 0.59 * g + 0.11 * b; return rgbToHex((r + (l - r) * amount) * darken, (g + (l - g) * amount) * darken, (b + (l - b) * amount) * darken); }
  function hash2(x, y) { let h = (x | 0) * 374761393 + (y | 0) * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
  // D&D-style helpers: ability modifier + dice
  function mod(v) { return Math.floor((v - 10) / 2); }
  function d20() { return 1 + (Math.random() * 20 | 0); }
  function rollDice(sides) { return 1 + (Math.random() * sides | 0); }
  // white silhouette of a sprite, used for the hit-flash effect
  function makeWhite(spr) {
    const c = document.createElement("canvas"); c.width = spr.width; c.height = spr.height;
    const g = c.getContext("2d");
    g.drawImage(spr, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function makeDark(spr) {   // charred silhouette for the scorched effect
    const c = document.createElement("canvas"); c.width = spr.width; c.height = spr.height;
    const g = c.getContext("2d");
    g.drawImage(spr, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#1a0f0a"; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  // find a sprite grid's eye pixels so characters can blink
  function findEyes(rows, glyphs) {
    const out = [];
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) if (glyphs.includes(rows[y][x])) out.push([x, y]);
    return out;
  }

  /* ---- HeartGold-ish palette ------------------------------------------ */
  const C = {
    grassL: "#93c96e", grass: "#6cab4f", grassD: "#4f8f3f", grassDD: "#3b7233",
    path: "#dcc08a", pathL: "#ecd6a2", pathD: "#bd9d68", pathE: "#a07c4d", pathShade: "#b08f5d",
    treeL: "#86c652", treeM: "#52a23f", treeD: "#357a32", treeO: "#214d27",
    trunk: "#86603a", trunkD: "#5e4026",
    waterO: "#27566e", water: "#3b7fa6", waterL: "#5aa0c4", waterS: "#bfe6f5",
    outline: "#2c2733",
    soil: "#9a7448", soilD: "#7c5a36", soilW: "#6a4c2e", fence: "#a87f4e", fenceD: "#7c5a36",
    stone: "#a8a8b8", stoneD: "#7a7a8e", stoneDD: "#55556a",
    mush: "#d96a52", mushD: "#a84a3a", straw: "#d9b25a",
    flower: ["#e8556a", "#ffd166", "#f7f4e8", "#d98cff"],
  };

  /* ---- crisp pixel primitives ----------------------------------------- */
  function disc(g, cx, cy, r, col) { g.fillStyle = col; for (let dy = -r; dy <= r; dy++) { const s = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy))); g.fillRect(cx - s, cy + dy, s * 2 + 1, 1); } }
  function ellipseFill(g, cx, cy, rx, ry, col) { g.fillStyle = col; for (let dy = -ry; dy <= ry; dy++) { const t = 1 - (dy * dy) / (ry * ry); if (t < 0) continue; const s = Math.floor(rx * Math.sqrt(t)); g.fillRect(Math.round(cx - s), Math.round(cy + dy), s * 2 + 1, 1); } }

  /* ==========================================================================
     1. Character sprites — original chibi people. Eyes are vertical lines.
        k=outline H/h=hair S/s=skin e=eye A/a=shirt P/p=pants b/B=shoes
     ========================================================================== */
  const PERSON = [
    "....kkkkkk....",
    "...kHHHHHhk...",
    "...kHHHHHhk...",
    "...kHHHHHhk...",
    "...kHSSSSHk...",
    "...kSeSSeSk...",
    "...kSeSSesk...",
    "...kSSSSssk...",
    "....kkkkkk....",
    "......SS......",
    "...kAAAAAAk...",
    "..kAAAAAAAAk..",
    "..kAAAAAaaAk..",
    "..SkAAAAAakS..",
    "...kPPPPPPk...",
    "...kPPkkppk...",
    "...kPPkkppk...",
    "...kbbkkbbk...",
    "...kkk..kkk...",
  ];
  const PERSON_EYES = findEyes(PERSON, "e");

  function buildPerson(look, active) {
    const f = active ? (x => x) : (x => dormantify(x));
    const pal = {
      ".": null,
      k: active ? C.outline : dormantify(C.outline),
      H: f(look.hair), h: f(mix(look.hair, "#000", 0.3)),
      S: f(look.skin), s: f(mix(look.skin, "#7a4a30", 0.35)),
      e: active ? C.outline : dormantify(C.outline),
      A: f(look.shirt), a: f(mix(look.shirt, C.outline, 0.4)),
      P: f(look.pants), p: f(mix(look.pants, "#000", 0.3)),
      b: f(look.shoe), B: f(mix(look.shoe, "#000", 0.3)),
    };
    return renderGrid(PERSON, pal);
  }

  function renderGrid(rows, pal) {
    const w = Math.max(...rows.map(r => r.length)), h = rows.length;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) { const col = pal[rows[y][x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }
    return c;
  }
  function grayPal(pal) { const o = {}; for (const k in pal) o[k] = pal[k] ? dormantify(pal[k]) : null; return o; }
  function buildCustom(rows, pal, active) { return renderGrid(rows, active ? pal : grayPal(pal)); }

  /* Mark's original characters (his own art) as HGSS-style chibi sprites.
     Floating head = closed head on a thin neck, like the PERSON chibi. */
  const AVERIS = [
    ".....KK....KK.....",
    "....KOK...KOK.....",
    "....KOKKKKKKOK....",
    "....KDDDDDDDDK....",
    "....KDddddddDK....",
    "....KDRRRRRRDK....",
    "....KDRSSSSRDK....",
    "....KDSESSESDK....",
    "....KDSESSESDK....",
    ".....KKKKKKKK.....",
    "........SS........",
    ".....KJJJJJJK.....",
    ".....KJJOOJJKC....",
    ".....KJJJJJJKCc...",
    ".....KBBBBBBKCOc..",
    ".....KPPPPPPKCOc..",
    ".....KPPKKPPK.Cc..",
    ".....KTTKKTTK..c..",
    ".....KKK..KKK....."
  ];
  const AVERIS_PAL = {
    ".": null, K: "#1c1015",
    D: "#8a4636", d: "#6b3326",
    O: "#f0a64f",
    R: "#3a261d",
    S: "#e0a86a", E: "#1c1015",
    J: "#9a423a",
    C: "#4a3026", c: "#361f17",
    B: "#5a3826",
    P: "#4a2c20",
    T: "#2c1a13"
  };
  const AVERIS_EYES = findEyes(AVERIS, "E");
  const SUNBEAM = [
    ".....KKKKKK.....",
    "....KHHHHHHK....",
    "...KHHHHHHHHK...",
    "...KHSSSSSSHK...",
    "...KHSySSySHK...",
    "...KHSySSySHK...",
    "...KHHSSSSHHK...",
    "....KKKKKKKK....",
    ".......SS.......",
    "...KWWWWWWWWK...",
    "...KWWGGGGWWK...",
    "...KWWWWWWWWK...",
    "..KWWWWWWWWWWK..",
    ".KWWBBBBBBWWK...",
    ".KWBBBBBBBBBWK..",
    ".KWBBBGBBGBBWK..",
    "KWBBBBBBBBBBBBWK",
    "KWBbBBBBBBBBbBWK",
    "KGGGGGGGGGGGGGGK",
    "....KOOKKOOK....",
    "....KKK..KKK...."
  ];
  const SUNBEAM_PAL = {
    ".": null, K: "#5a4634",
    H: "#e2c489",
    S: "#f6dcc0",
    y: "#b9892f",
    W: "#fdf6e8",
    B: "#ddc59c", b: "#c2a376",
    G: "#ecc36a",
    O: "#efe2c6"
  };
  const SUNBEAM_EYES = findEyes(SUNBEAM, "y");

  /* ==========================================================================
     2. Creature sprites — wildlife, night enemies & the pet imp.
     ========================================================================== */
  const RABBIT = [
    "..k..k...",
    ".kwkkwk..",
    ".kwwwwk..",
    "kwwwwwwk.",
    "kwwwwewk.",
    "kWwwwwwk.",
    ".kwwwwk..",
    "..kk.kk..",
  ];
  const RABBIT_PAL = { ".": null, k: "#4a3b30", w: "#f5f1e4", W: "#ffffff", e: "#1c1015" };

  const DEER = [
    ".........k.k.",
    ".........kkk.",
    "........kddk.",
    "........kdedk",
    ".kkkkkkkkddk.",
    "kdddddddddk..",
    "kdDDDDdddk...",
    "kddddddddk...",
    ".kdkdddkdk...",
    ".kd..kd.kd...",
    ".kk..kk.kk...",
  ];
  const DEER_PAL = { ".": null, k: "#3a2a1d", d: "#a9744a", D: "#caa05e", e: "#1c1015" };

  // Zombies are shambling palette-swapped villagers (reuses the PERSON grid).
  const ZOMBIE_LOOK = { hair: "#41523c", skin: "#9dbf7c", shirt: "#5d6350", pants: "#46413a", shoe: "#2e2a26" };

  const DEMON = [
    ".k.......k.",
    "kHk.....kHk",
    ".kRRRRRRRk.",
    "kRrrrrrrrRk",
    "kRryrrryrRk",
    "kRryrrryrRk",
    "kRrrrrrrrRk",
    ".kRRRRRRRk.",
    "WkRRRRRRRkW",
    "kWkRRRRRkWk",
    ".kRRk.kRRk.",
    ".kRk...kRk.",
    "..k.....k..",
  ];
  const DEMON_PAL = { ".": null, k: "#1a0f14", H: "#e8d6a0", R: "#8e3344", r: "#6b2433", y: "#ffd166", W: "#3a1a26" };

  // Yenna — a slightly tall tiger-beast warrior with a broad axe on her hip.
  // Floating head, vertical-line eyes, stripes, and 23px of attitude.
  // Yenna — silver-maned wolf warrior: wolf ears, eyepatch over one eye, red
  // choker + wrap, fur-trimmed jacket off the shoulders, her mother's axe.
  const YENNA = [
    "..kk........kk..",
    ".kWWk......kWWk.",
    ".kWwWkkkkkkWwWk.",
    ".kWWWWWWWWWWWWk.",
    "kWwWWWWWWWWWWwWk",
    "kWwSSeSSSSeSSwWk",
    "kWwSSeSSSSeSSwWk",
    "kWwSSSSSsSSSSwWk",
    ".kWwSSSSSSSSwWk.",
    ".kWwkRRRRRkwWk..",
    "kWwUUkSSSSkUUwWk",
    "kWwUukRRRRkuUwWk",
    ".kwJUkRrrRkUJw..",
    ".kwJkSSSSSSkJw..",
    ".kJkSSsSSsSSkJ..",
    ".kkRrRrRrRrRkk..",
    "..kPPPPPPPPPPk..",
    "..kPPpPPPPpPPk..",
    "..kPPPk..kPPPk..",
    "..kPPk....kPPk..",
    "..kPpk....kpPk..",
    "..kJJk....kJJk..",
    "..kkkk....kkkk..",
  ];
  const YENNA_PAL = {
    ".": null, k: "#241a12",
    W: "#ece7de", w: "#c4b9a6",   // long silver hair + wolf ears
    S: "#c98e58", s: "#9c6a3a",   // tan skin
    e: "#8e2424",                 // two sharp red eyes, two pixels deep
    R: "#b8362e", r: "#7e231e",   // red wrap, choker and belt
    J: "#463222",                 // jacket + boots
    U: "#e9dcbc", u: "#cdbb92",   // cream fur trim on the shoulders
    P: "#937b4c", p: "#6f5c38",   // field trousers
  };
  const YENNA_EYES = findEyes(YENNA, "e");   // her axe is HELD now — see drawGear

  // Atlas — the town builder, built like the houses he raises: wide shoulders,
  // bare working arms, a sun-gold tank and a loaded tool belt.
  const ATLAS = [
    "....kkkkkkkk....",
    "...kHHHHHHHHk...",
    "..kHHHHHHHHHHk..",
    "..kHSSSSSSSSHk..",
    "..kSSeSSSSeSSk..",
    "..kSSeSSSSeSSk..",
    "..kSSSSssSSSSk..",
    "...kSSSSSSSSk...",
    "....kkSSSSkk....",
    ".kSSkGGGGGGkSSk.",
    "kSSSkGGGGGGkSSSk",
    "kSSSkGgGGgGkSSSk",
    "kSsSkGGGGGGkSsSk",
    ".kSSkGgGGgGkSSk.",
    ".kkkkGGGGGGkkkk.",
    "....kBrBBrBk....",
    "...kPPPPPPPPk...",
    "...kPPPkkPPPk...",
    "...kPPk..kPPk...",
    "...kPPk..kPPk...",
    "...kJJk..kJJk...",
    "...kkkk..kkkk...",
  ];
  const ATLAS_PAL = {
    ".": null, k: "#241a12",
    H: "#463f4a",                 // dark mop of hair
    S: "#e8be94", s: "#c08a54",   // sun-browned working skin
    e: "#2a2018",
    G: "#f2b441", g: "#cd8f2a",   // the gold tank top
    B: "#6b4a2e", r: "#b8362e",   // tool belt + red pouches
    P: "#5a3a2a", J: "#3a2c20",   // canvas trousers, stout boots
  };
  const ATLAS_EYES = findEyes(ATLAS, "e");

  // Yenna's spirit wolves — summoned, swift, and gone by morning.
  const WOLF = [
    "..kk....k..",
    ".kggk..kgk.",
    "kgegkkkkgk.",
    "kggggggggk.",
    ".kgGGGGggk.",
    ".kgkGGkggk.",
    ".kk.kk.kk..",
  ];
  const WOLF_PAL = { ".": null, k: "#2a241e", g: "#9a8c7a", G: "#c9bda8", e: "#101010" };

  // Averis's pet frog — picky about cheese, less picky about weakened zombies.
  const FROG = [
    ".kk....kk.",
    "kyGk..kGyk",
    ".kGGGGGGk.",
    "kGGwwwwGGk",
    "kGwwwwwwGk",
    "kGGGGGGGGk",
    ".kGk..kGk.",
    ".kkk..kkk.",
  ];
  const FROG_PAL = { ".": null, k: "#1c2415", G: "#5f9e44", w: "#c8e8a8", y: "#1c1015" };
  const FROG_EYES = findEyes(FROG, "y");

  /* ==========================================================================
     2b. THE MINIFOLK ART PACK — real sprite sheets replace the code-drawn
     characters: 32×32 frames, row 0 = idle (4f), row 1 = walk (6f for folk,
     4f for animals). Enemies are the Tiny RPG Orc (100×100 frame strips).
     ========================================================================== */
  const ASSETS = {};
  function img(src) {
    if (!ASSETS[src]) { const im = new Image(); im.src = "assets/" + src; ASSETS[src] = im; }
    return ASSETS[src];
  }
  function ready(im) { return im && im.complete && im.naturalWidth > 0; }
  function miniDef(file, opts) {
    return Object.assign({ img: img("mini/" + file), fw: 32, fh: 32, idleN: 4, walkN: 6, idleRow: 0, walkRow: 1, foot: 30, scale: 1 }, opts || {});
  }
  const MINI_BY_AGENT = {   // every hero, reborn in Minifolk — the OCs wear MARK'S designs
    claude: () => miniDef("SwordMan.png"),
    averis: () => miniDef("AverisOC.png"),    // deadpan devil-boy: horns, red vest, gold-trimmed coat
    sunbeam: () => miniDef("SuniOC.png"),     // the little sunbeam: golden waves, cream & gold
    yenna: () => miniDef("YennaOC.png"),      // punk wolf girl: fur-collar jacket, ripped jeans, THE tail
    atlas: () => miniDef("Worker.png"),
  };
  const MINI_VILLAGERS = ["VillagerWoman.png", "VillagerMan.png", "OldWoman.png", "OldMan.png", "Peasant.png", "NobleWoman.png", "NobleMan.png", "Queen.png"];
  const MINI_KNIGHTS = ["ShieldMan.png", "SwordMan.png", "SpearMan.png"];
  const MINI_MAGES = ["Mage.png", "ArchMage.png"];
  const MINI_ANIMAL = {
    rabbit: () => miniDef("Bunny.png", { walkN: 4, foot: 29 }),
    deer: () => miniDef("Deer.png", { walkN: 4, idleN: 4, foot: 29 }),
    wolf: () => miniDef("Wolf.png", { walkN: 4, foot: 29 }),
  };
  const ORC = { idle: { img: img("orc/Idle.png"), n: 6 }, walk: { img: img("orc/Walk.png"), n: 8 }, attack: { img: img("orc/Attack.png"), n: 6 }, death: { img: img("orc/Death.png"), n: 4 } };

  // the shared frame renderer: bottom-anchored, facing-flipped, optional filter
  function drawMini(mini, x, footY, facing, frame, row, filter, alpha) {
    const im = mini.img;
    if (!ready(im)) return false;
    const sx = frame * mini.fw, sy = row * mini.fh;
    const dw = mini.fw * mini.scale, dh = mini.fh * mini.scale;
    const dx = Math.round(x - dw / 2), dy = Math.round(footY - mini.foot * mini.scale);
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    if (filter) ctx.filter = filter;
    if (facing < 0) { ctx.translate(dx + dw, dy); ctx.scale(-1, 1); ctx.drawImage(im, sx, sy, mini.fw, mini.fh, 0, 0, dw, dh); }
    else ctx.drawImage(im, sx, sy, mini.fw, mini.fh, dx, dy, dw, dh);
    ctx.restore();
    return true;
  }
  function miniFrame(ent, t, moving) {
    const m = ent.mini;
    if (moving) return { f: Math.floor(((ent.walkPhase || 0) * 1.6 + t / 130) % m.walkN), row: m.walkRow };
    return { f: Math.floor((t / 260 + (ent.phase || 0) * 3) % m.idleN), row: m.idleRow };
  }

  /* ---- sheet-based effect animations (slash, heals, impacts, explosions) -- */
  const FX_DEFS = {
    slash: { img: img("fx/slash.png"), fw: 64, fh: 64, frames: 8, cols: 1, fps: 26, scale: 0.55, filter: "brightness(1.9) saturate(0.4)" },
    heal: { img: img("fx/heal.png"), fw: 128, fh: 128, frames: 16, cols: 4, fps: 16, scale: 0.5 },
    explosion: { img: img("fx/explosion.png"), fw: 64, fh: 64, frames: 16, cols: 4, fps: 22, scale: 1 },
    impact_red: { img: img("fx/impact_red.png"), fw: 128, fh: 128, frames: 12, cols: 4, fps: 24, scale: 0.55 },
    impact_blue: { img: img("fx/impact_blue.png"), fw: 128, fh: 128, frames: 12, cols: 4, fps: 24, scale: 0.45 },
    impact_green: { img: img("fx/impact_green.png"), fw: 128, fh: 128, frames: 12, cols: 4, fps: 22, scale: 0.5 },
    impact_grey: { img: img("fx/impact_grey.png"), fw: 128, fh: 128, frames: 12, cols: 4, fps: 24, scale: 0.5 },
    impact_purple: { img: img("fx/impact_purple.png"), fw: 128, fh: 128, frames: 12, cols: 4, fps: 24, scale: 0.55 },
    impact_smash: { img: img("fx/impact_smash.png"), fw: 128, fh: 128, frames: 12, cols: 4, fps: 24, scale: 0.6 },
  };
  const fxAnims = [];
  function playFX(kind, x, y, area, scale, flip) {
    const d = FX_DEFS[kind]; if (!d) return;
    if (fxAnims.length > 40) fxAnims.shift();
    fxAnims.push({ kind, x, y, area, t: 0, scale: scale || 1, flip: !!flip });
  }
  function updateFxAnims(dt) {
    for (let i = fxAnims.length - 1; i >= 0; i--) {
      const f = fxAnims[i];
      f.t += dt;
      if (f.t * FX_DEFS[f.kind].fps >= FX_DEFS[f.kind].frames) fxAnims.splice(i, 1);
    }
  }
  function drawFxAnims() {
    for (const f of fxAnims) {
      if (f.area !== viewArea) continue;
      const d = FX_DEFS[f.kind];
      if (!ready(d.img)) continue;
      const fr = Math.min(d.frames - 1, Math.floor(f.t * d.fps));
      const sx = (fr % d.cols) * d.fw, sy = Math.floor(fr / d.cols) * d.fh;
      const dw = d.fw * d.scale * f.scale, dh = d.fh * d.scale * f.scale;
      ctx.save();
      if (d.filter) ctx.filter = d.filter;
      if (f.flip) { ctx.translate(Math.round(f.x + dw / 2), Math.round(f.y - dh / 2)); ctx.scale(-1, 1); ctx.drawImage(d.img, sx, sy, d.fw, d.fh, 0, 0, dw, dh); }
      else ctx.drawImage(d.img, sx, sy, d.fw, d.fh, Math.round(f.x - dw / 2), Math.round(f.y - dh / 2), dw, dh);
      ctx.restore();
    }
  }

  /* ==========================================================================
     3. Props (pre-rendered to little canvases)
     ========================================================================== */
  function makeTree(big) {
    // big trees double as rain shelters
    const w = big ? 40 : 30, h = big ? 48 : 36, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    let puffs;
    if (big) {
      g.fillStyle = C.trunkD; g.fillRect(17, 32, 7, 13);
      g.fillStyle = C.trunk; g.fillRect(17, 32, 4, 13);
      puffs = [[20, 17, 15], [10, 23, 11], [30, 23, 11], [20, 27, 12]];
    } else {
      g.fillStyle = C.trunkD; g.fillRect(13, 24, 5, 9);
      g.fillStyle = C.trunk; g.fillRect(13, 24, 3, 9);
      puffs = [[15, 13, 11], [8, 17, 8], [22, 17, 8], [15, 20, 9]];
    }
    for (const [x, y, r] of puffs) disc(g, x, y, r + 1, C.treeO);
    for (const [x, y, r] of puffs) disc(g, x, y, r, C.treeM);
    for (const [x, y, r] of puffs) disc(g, x + 2, y + 3, r - 3, C.treeD);
    for (const [x, y, r] of puffs) disc(g, x - 3, y - 3, Math.max(2, r - 5), C.treeL);
    return c;
  }
  function makeHouse() {
    const w = 72, h = 64, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    const roof = "#cf5a4e", roofD = "#a8443c", roofL = "#e8806e";
    const wall = "#ecdfc6", wallD = "#cdba98", wood = "#8a6a44", win = "#bfe3ff", winD = "#8fc6f0";
    // wall
    g.fillStyle = C.outline; g.fillRect(11, 27, 50, 33);
    g.fillStyle = wall; g.fillRect(13, 29, 46, 29);
    g.fillStyle = wallD; g.fillRect(13, 50, 46, 8);
    // roof: narrow PEAK at the top, widening to the eaves (points up!)
    for (let y = 6; y <= 27; y++) {
      const t = (y - 6) / 21, half = Math.round(3 + t * 31);
      g.fillStyle = C.outline; g.fillRect(36 - half - 1, y, (half + 1) * 2, 1);
      g.fillStyle = (y < 17) ? roofL : roof; g.fillRect(36 - half, y, half * 2, 1);
    }
    g.fillStyle = roofD; g.fillRect(5, 26, 62, 2);   // eave shadow line
    g.fillStyle = C.outline; g.fillRect(35, 5, 2, 3); // peak cap
    // door
    g.fillStyle = C.outline; g.fillRect(31, 42, 12, 16);
    g.fillStyle = wood; g.fillRect(32, 43, 10, 15);
    g.fillStyle = "#ffd166"; g.fillRect(40, 50, 2, 2);
    // windows
    for (const wx of [18, 46]) { g.fillStyle = C.outline; g.fillRect(wx, 34, 9, 9); g.fillStyle = win; g.fillRect(wx + 1, 35, 7, 7); g.fillStyle = winD; g.fillRect(wx + 1, 39, 7, 3); }
    return c;
  }
  function makeCabin(scheme) {
    // a smaller cousin of the main house with its own roof colour
    const w = 48, h = 44, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    const wall = "#ecdfc6", wallD = "#cdba98", wood = "#8a6a44", win = "#bfe3ff", winD = "#8fc6f0";
    g.fillStyle = C.outline; g.fillRect(7, 19, 34, 24);
    g.fillStyle = wall; g.fillRect(9, 21, 30, 20);
    g.fillStyle = wallD; g.fillRect(9, 35, 30, 6);
    for (let y = 4; y <= 19; y++) {
      const t = (y - 4) / 15, half = Math.round(3 + t * 20);
      g.fillStyle = C.outline; g.fillRect(24 - half - 1, y, (half + 1) * 2, 1);
      g.fillStyle = (y < 12) ? scheme.roofL : scheme.roof; g.fillRect(24 - half, y, half * 2, 1);
    }
    g.fillStyle = scheme.roofD; g.fillRect(2, 18, 44, 2);
    g.fillStyle = C.outline; g.fillRect(23, 3, 2, 3);
    // door
    g.fillStyle = C.outline; g.fillRect(20, 28, 10, 14);
    g.fillStyle = wood; g.fillRect(21, 29, 8, 13);
    g.fillStyle = "#ffd166"; g.fillRect(27, 34, 1, 2);
    // window
    g.fillStyle = C.outline; g.fillRect(11, 24, 8, 8); g.fillStyle = win; g.fillRect(12, 25, 6, 6); g.fillStyle = winD; g.fillRect(12, 28, 6, 3);
    return c;
  }
  function makeSign() {
    const w = 16, h = 18, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    g.fillStyle = C.trunkD; g.fillRect(7, 10, 2, 7);
    g.fillStyle = C.outline; g.fillRect(2, 2, 12, 9);
    g.fillStyle = "#9c7445"; g.fillRect(3, 3, 10, 7);
    g.fillStyle = "#b88a55"; g.fillRect(3, 3, 10, 2);
    g.fillStyle = "#5e4026"; g.fillRect(4, 6, 8, 1); g.fillRect(4, 8, 6, 1);
    return c;
  }
  function makeFirepit() {
    // base only (stones + logs); the flame is drawn per-frame so it flickers
    const w = 16, h = 14, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283, sx = 8 + Math.round(Math.cos(a) * 6), sy = 10 + Math.round(Math.sin(a) * 3); g.fillStyle = C.outline; g.fillRect(sx - 1, sy - 1, 4, 4); g.fillStyle = "#9a9488"; g.fillRect(sx, sy, 2, 2); g.fillStyle = "#cfc9bd"; g.fillRect(sx, sy, 1, 1); }
    g.fillStyle = C.trunkD; g.fillRect(4, 8, 8, 2); g.fillStyle = C.trunk; g.fillRect(6, 7, 2, 4);
    return c;
  }
  function makeWell() {
    const w = 20, h = 22, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    // posts + little roof
    g.fillStyle = C.trunkD; g.fillRect(3, 4, 2, 12); g.fillRect(15, 4, 2, 12);
    g.fillStyle = C.outline; g.fillRect(1, 2, 18, 2);
    g.fillStyle = "#8a6a44"; g.fillRect(2, 3, 16, 1);
    // stone ring
    g.fillStyle = C.outline; g.fillRect(2, 14, 16, 7);
    g.fillStyle = C.stone; g.fillRect(3, 15, 14, 5);
    g.fillStyle = C.stoneD; g.fillRect(3, 18, 14, 2);
    g.fillStyle = C.waterO; g.fillRect(6, 16, 8, 2);
    g.fillStyle = C.waterL; g.fillRect(7, 16, 3, 1);
    // bucket on a rope
    g.fillStyle = "#5e4026"; g.fillRect(10, 4, 1, 6);
    g.fillStyle = C.outline; g.fillRect(8, 10, 4, 3); g.fillStyle = "#9c7445"; g.fillRect(9, 11, 2, 2);
    return c;
  }
  function makeDummy() {
    // training dummy: a post with a straw head and crossbar arms
    const w = 14, h = 20, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    g.fillStyle = C.trunkD; g.fillRect(6, 8, 2, 11);
    g.fillStyle = C.outline; g.fillRect(1, 9, 12, 2);
    g.fillStyle = "#8a6a44"; g.fillRect(2, 9, 10, 1);
    g.fillStyle = C.outline; g.fillRect(3, 1, 8, 7);
    g.fillStyle = C.straw; g.fillRect(4, 2, 6, 5);
    g.fillStyle = mix(C.straw, "#000", 0.25); g.fillRect(4, 5, 6, 2);
    g.fillStyle = C.outline; g.fillRect(5, 3, 1, 2); g.fillRect(8, 3, 1, 2);   // stitched eyes
    return c;
  }
  function makeBench() {
    const w = 20, h = 11, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    g.fillStyle = C.outline; g.fillRect(2, 7, 3, 4); g.fillRect(15, 7, 3, 4);
    g.fillStyle = C.stoneD; g.fillRect(3, 8, 1, 3); g.fillRect(16, 8, 1, 3);
    g.fillStyle = C.outline; g.fillRect(0, 3, 20, 4);
    g.fillStyle = "#9c7445"; g.fillRect(1, 4, 18, 2);
    g.fillStyle = "#b88a55"; g.fillRect(1, 4, 18, 1);
    return c;
  }
  function makeShrine() {
    // three mossy standing stones with a faintly glowing gem
    const w = 28, h = 24, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    const stone = (x, y, sw, sh) => {
      g.fillStyle = C.outline; g.fillRect(x - 1, y - 1, sw + 2, sh + 1);
      g.fillStyle = C.stone; g.fillRect(x, y, sw, sh);
      g.fillStyle = C.stoneD; g.fillRect(x, y + sh - 3, sw, 3);
      g.fillStyle = C.treeM; g.fillRect(x, y + 1, 1, 2); g.fillRect(x + sw - 1, y + 2, 1, 1);   // moss
    };
    stone(2, 8, 6, 15); stone(20, 8, 6, 15); stone(10, 2, 8, 21);
    g.fillStyle = "#7ae0d8"; g.fillRect(13, 8, 2, 3);   // the gem
    g.fillStyle = "#bff5ef"; g.fillRect(13, 8, 1, 1);
    return c;
  }
  function makeFlag() {
    // the square's banner pole
    const w = 14, h = 26, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    g.fillStyle = C.outline; g.fillRect(2, 0, 3, 26);
    g.fillStyle = "#7c5a36"; g.fillRect(3, 1, 1, 24);
    g.fillStyle = C.outline; g.fillRect(1, 0, 5, 2);
    g.fillStyle = C.outline; g.fillRect(5, 2, 9, 8);
    g.fillStyle = "#e8825c"; g.fillRect(5, 3, 8, 6);
    g.fillStyle = "#cf5a4e"; g.fillRect(5, 6, 8, 3);
    g.fillStyle = "#fff4c2"; g.fillRect(7, 4, 2, 2);   // little sun emblem
    g.fillStyle = C.grass; g.fillRect(13, 4, 1, 2); g.fillRect(13, 7, 1, 1);   // notched end
    return c;
  }
  function makeInn() {
    // the Deepwood Inn: stone base, timber upper, twin lit windows, a lantern
    const w = 56, h = 52, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    g.fillStyle = C.outline; g.fillRect(4, 22, 48, 29);
    g.fillStyle = "#8a8a9a"; g.fillRect(6, 40, 44, 10);                 // stone base
    g.fillStyle = "#9c7445"; g.fillRect(6, 24, 44, 16);                 // timber
    g.fillStyle = "#7c5a36"; for (let y = 27; y < 40; y += 4) g.fillRect(6, y, 44, 1);
    for (let y = 6; y <= 22; y++) {                                     // broad dark roof
      const half = Math.round(6 + (y - 6) / 16 * 22);
      g.fillStyle = C.outline; g.fillRect(28 - half - 1, y, (half + 1) * 2, 1);
      g.fillStyle = y < 14 ? "#5d5390" : "#4a4276"; g.fillRect(28 - half, y, half * 2, 1);
    }
    g.fillStyle = C.outline; g.fillRect(27, 4, 2, 3);
    // door + two warm windows + hanging lantern + sign
    g.fillStyle = C.outline; g.fillRect(23, 34, 10, 17);
    g.fillStyle = "#5e4026"; g.fillRect(24, 35, 8, 16);
    g.fillStyle = "#ffd166"; g.fillRect(30, 42, 1, 2);
    for (const wx of [9, 38]) { g.fillStyle = C.outline; g.fillRect(wx, 27, 9, 9); g.fillStyle = "#ffd98a"; g.fillRect(wx + 1, 28, 7, 7); g.fillStyle = "#e8a05c"; g.fillRect(wx + 1, 32, 7, 3); }
    g.fillStyle = C.outline; g.fillRect(35, 27, 1, 4); g.fillRect(34, 31, 3, 4);   // lantern
    g.fillStyle = "#ffd166"; g.fillRect(35, 32, 1, 2);
    g.fillStyle = C.outline; g.fillRect(13, 44, 10, 6);                 // inn sign
    g.fillStyle = "#b88a55"; g.fillRect(14, 45, 8, 4);
    g.fillStyle = "#5e4026"; g.fillRect(15, 46, 6, 1); g.fillRect(15, 48, 4, 1);
    return c;
  }
  function makeShack() {
    // a small plank shack — modest, flammable, very smashable
    const w = 34, h = 30, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    g.fillStyle = C.outline; g.fillRect(3, 12, 28, 17);
    g.fillStyle = "#9c7445"; g.fillRect(4, 13, 26, 15);
    g.fillStyle = "#7c5a36"; for (let y = 16; y < 28; y += 4) g.fillRect(4, y, 26, 1);   // plank lines
    // slanted roof
    for (let y = 4; y <= 12; y++) {
      const half = Math.round(4 + (y - 4) / 8 * 13);
      g.fillStyle = C.outline; g.fillRect(17 - half - 1, y, (half + 1) * 2, 1);
      g.fillStyle = y < 8 ? "#b88a55" : "#a07c4d"; g.fillRect(17 - half, y, half * 2, 1);
    }
    g.fillStyle = C.outline; g.fillRect(16, 3, 2, 2);
    // door + tiny window
    g.fillStyle = C.outline; g.fillRect(13, 18, 8, 11);
    g.fillStyle = "#5e4026"; g.fillRect(14, 19, 6, 10);
    g.fillStyle = C.outline; g.fillRect(24, 17, 5, 5); g.fillStyle = "#bfe3ff"; g.fillRect(25, 18, 3, 3);
    return c;
  }
  function makeHealTree() {
    // the great Healing Tree: a huge blossoming canopy with golden glints
    const w = 54, h = 62, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    g.fillStyle = C.trunkD; g.fillRect(23, 42, 9, 17);
    g.fillStyle = C.trunk; g.fillRect(23, 42, 5, 17);
    g.fillStyle = mix(C.trunk, "#fff", 0.25); g.fillRect(25, 44, 1, 12);
    const puffs = [[27, 20, 19], [13, 28, 13], [41, 28, 13], [27, 34, 15], [20, 14, 10], [35, 15, 10]];
    for (const [x, y, r] of puffs) disc(g, x, y, r + 1, C.treeO);
    for (const [x, y, r] of puffs) disc(g, x, y, r, C.treeM);
    for (const [x, y, r] of puffs) disc(g, x + 2, y + 3, r - 4, C.treeD);
    for (const [x, y, r] of puffs) disc(g, x - 3, y - 3, Math.max(2, r - 6), C.treeL);
    // blossoms + golden glints scattered through the canopy
    for (let i = 0; i < 26; i++) {
      const px = 8 + ((hash2(i, 71) * 38) | 0), py = 6 + ((hash2(i, 73) * 32) | 0);
      g.fillStyle = hash2(i, 79) < 0.7 ? "#f2b8d0" : "#e88ab8";
      g.fillRect(px, py, 2, 2);
      if (hash2(i, 83) < 0.3) { g.fillStyle = "#ffe9a8"; g.fillRect(px, py, 1, 1); }
    }
    return c;
  }
  function makeRuins() {
    // a broken mossy arch — one side still standing, one crumbled
    const w = 30, h = 28, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    const stone = (x, y, sw, sh) => {
      g.fillStyle = C.outline; g.fillRect(x - 1, y - 1, sw + 2, sh + 1);
      g.fillStyle = C.stone; g.fillRect(x, y, sw, sh);
      g.fillStyle = C.stoneD; g.fillRect(x, y + sh - 3, sw, 3);
      g.fillStyle = C.treeM; g.fillRect(x, y + 1, 1, 3); g.fillRect(x + sw - 1, y + 2, 1, 2);
    };
    stone(2, 6, 7, 21);                 // standing pillar
    stone(21, 14, 7, 13);               // crumbled pillar
    g.fillStyle = C.outline; g.fillRect(1, 2, 17, 5);   // the surviving lintel
    g.fillStyle = C.stone; g.fillRect(2, 3, 15, 3);
    g.fillStyle = C.treeM; g.fillRect(5, 3, 2, 1); g.fillRect(12, 4, 2, 1);
    g.fillStyle = C.stoneDD; g.fillRect(14, 22, 3, 3); g.fillRect(18, 25, 2, 2);   // rubble
    return c;
  }
  function makeDock() {
    // a stubby wooden pier reaching into the lake
    const w = 26, h = 12, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    g.fillStyle = C.outline; g.fillRect(0, 2, 24, 7);
    g.fillStyle = "#9c7445"; g.fillRect(1, 3, 22, 5);
    g.fillStyle = "#b88a55"; g.fillRect(1, 3, 22, 1);
    g.fillStyle = "#5e4026"; for (let x = 4; x < 22; x += 5) g.fillRect(x, 3, 1, 5);   // plank lines
    g.fillStyle = C.trunkD; g.fillRect(2, 8, 2, 4); g.fillRect(20, 8, 2, 4);          // posts
    return c;
  }
  function makeMush() {
    const w = 7, h = 7, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
    g.fillStyle = C.outline; g.fillRect(1, 0, 5, 4);
    g.fillStyle = C.mush; g.fillRect(2, 1, 3, 2);
    g.fillStyle = "#f7f4e8"; g.fillRect(2, 1, 1, 1); g.fillRect(4, 2, 1, 1);
    g.fillStyle = C.outline; g.fillRect(2, 4, 3, 3);
    g.fillStyle = "#e8e0cc"; g.fillRect(3, 4, 1, 3);
    return c;
  }

  /* ==========================================================================
     4. THE WORLD — two connected areas. The road through town continues east
        onto the wild East Route; entities walk between them via the exits.
     ========================================================================== */
  const AREAS = {
    town: {
      name: "PokeTown",
      paths: [
        [0, 150, 512, 150], [256, 0, 256, 288],
        [256, 150, 176, 96], [256, 150, 368, 222],
        [96, 150, 96, 204],                          // spur down to the farm
      ],
      props: [], solids: [], shelters: [], windowLights: [],
      tallGrass: [{ x: 360, y: 60, w: 80, h: 48 }],  // hunting forest (NE)
      hunt: { x: 336, y: 50, w: 140, h: 76 },
      waypoints: [[256, 150], [176, 118], [368, 222], [256, 44], [256, 248], [60, 150], [452, 150], [96, 200], [400, 96], [298, 132]],
      enemySpawns: [[256, 20], [492, 150], [256, 276], [20, 150], [470, 34]],
      puddles: [[230, 162], [284, 138], [112, 156], [250, 204], [338, 230], [96, 182]],
      center: { x: 256, y: 176 },
      // PokeTown is the hub: route east, deepwood west, lakeshore south
      exits: [
        { to: "route", x: 502, y: 150, entry: { x: 30, y: 150 }, label: "East Route" },
        { to: "deepwood", x: 10, y: 150, entry: { x: 482, y: 150 }, label: "Deepwood" },
        { to: "lake", x: 256, y: 278, entry: { x: 256, y: 30 }, label: "Lakeshore" },
      ],
    },
    route: {
      name: "East Route",
      paths: [
        [0, 150, 512, 150],
        [300, 150, 360, 92],                         // spur up to the bench & shrine
      ],
      props: [], solids: [], shelters: [], windowLights: [],
      tallGrass: [{ x: 56, y: 38, w: 156, h: 74 }, { x: 236, y: 188, w: 170, h: 72 }],
      hunt: { x: 50, y: 34, w: 170, h: 86 },
      waypoints: [[30, 150], [140, 150], [256, 150], [368, 150], [484, 150], [360, 100], [120, 224], [420, 196], [264, 64]],
      enemySpawns: [[500, 150], [256, 276], [470, 40], [256, 18]],
      puddles: [[200, 158], [320, 144], [80, 156], [420, 160]],
      center: { x: 256, y: 156 },
      exits: [
        { to: "town", x: 10, y: 150, entry: { x: 482, y: 150 }, label: "PokeTown" },
      ],
    },
    deepwood: {
      name: "Deepwood",
      paths: [
        [0, 150, 512, 150],
        [256, 150, 256, 84],                         // spur up to the old ruins
      ],
      props: [], solids: [], shelters: [], windowLights: [],
      gloom: 0.10,                                   // dim even at midday
      tallGrass: [{ x: 60, y: 190, w: 120, h: 62 }, { x: 330, y: 56, w: 124, h: 64 }],
      hunt: { x: 320, y: 48, w: 150, h: 84 },
      waypoints: [[30, 150], [150, 150], [256, 150], [380, 150], [482, 150], [256, 96], [104, 96], [110, 222], [400, 210]],
      enemySpawns: [[256, 18], [500, 150], [256, 276], [60, 276], [20, 150]],
      puddles: [[180, 158], [300, 142], [420, 158]],
      center: { x: 256, y: 160 },
      exits: [
        { to: "town", x: 502, y: 150, entry: { x: 30, y: 150 }, label: "PokeTown" },
      ],
    },
    lake: {
      name: "Lakeshore",
      paths: [[0, 150, 356, 150], [256, 0, 256, 150]],   // the road from town comes down from the north and ends at the water
      props: [], solids: [], shelters: [], windowLights: [],
      tallGrass: [{ x: 50, y: 48, w: 112, h: 62 }],
      hunt: { x: 40, y: 42, w: 132, h: 76 },
      waypoints: [[30, 150], [140, 150], [260, 150], [340, 160], [200, 230], [120, 90], [320, 220]],
      enemySpawns: [[256, 18], [60, 276], [20, 150], [240, 276]],
      puddles: [[180, 158], [280, 144], [100, 160]],
      center: { x: 240, y: 170 },
      exits: [{ to: "town", x: 256, y: 18, entry: { x: 256, y: 268 }, label: "PokeTown" }],
    },
  };
  const ORDER = ["town", "route", "deepwood", "lake"];   // kept for misc iteration; travel uses the exit graph
  // the world is a star around town: town<->route (E), town<->deepwood (W), town<->lake (S)
  function areaHops(a, b) { return a === b ? 0 : (a === "town" || b === "town") ? 1 : 2; }
  let viewArea = "town";   // which area the canvas is showing

  function addTree(areaKey, x, y, shadeKey) { AREAS[areaKey].props.push({ type: "tree", x, y, by: y, big: !!shadeKey, key: shadeKey }); }
  function buildTrees() {
    // --- town: border with road gaps north/south/east/west ---
    for (let x = 12; x < VW; x += 26) { if (Math.abs(x - 256) > 26) addTree("town", x, 16); }
    for (let x = 12; x < VW; x += 26) { if (Math.abs(x - 256) > 26) addTree("town", x, VH - 6); }
    for (let y = 40; y < VH - 20; y += 26) { if (Math.abs(y - 150) > 28) { addTree("town", 14, y); addTree("town", VW - 14, y); } }
    // the three big inland trees are rain shelters (shadeN keys)
    addTree("town", 120, 64, "shade1"); addTree("town", 150, 218, "shade2"); addTree("town", 456, 196, "shade3");
    addTree("town", 402, 78); addTree("town", 70, 122);
    // --- route: wilder border, road gaps east + west only ---
    for (let x = 12; x < VW; x += 24) { addTree("route", x, 16); }
    for (let x = 12; x < VW; x += 24) { addTree("route", x, VH - 6); }
    for (let y = 40; y < VH - 20; y += 24) { if (Math.abs(y - 150) > 28) { addTree("route", 14, y); addTree("route", VW - 14, y); } }
    addTree("route", 300, 222, "shade4"); addTree("route", 172, 86, "shade5");
    addTree("route", 248, 110); addTree("route", 448, 230); addTree("route", 320, 60);
    // --- deepwood: thick gloomy forest, trees crowding the road ---
    for (let x = 12; x < VW; x += 22) { addTree("deepwood", x, 16); }
    for (let x = 12; x < VW; x += 22) { addTree("deepwood", x, VH - 6); }
    for (let y = 38; y < VH - 20; y += 22) { if (Math.abs(y - 150) > 28) { addTree("deepwood", 14, y); addTree("deepwood", VW - 14, y); } }
    addTree("deepwood", 180, 102, "shade6"); addTree("deepwood", 350, 200, "shade7");
    addTree("deepwood", 80, 90); addTree("deepwood", 140, 230); addTree("deepwood", 300, 100);
    addTree("deepwood", 470, 100); addTree("deepwood", 220, 210); addTree("deepwood", 460, 240);
    addTree("deepwood", 60, 120); addTree("deepwood", 380, 250);
    // --- lakeshore: open and breezy; gap up north where the town road comes in ---
    for (let x = 12; x < VW; x += 26) { if (x < 360 && Math.abs(x - 256) > 26) addTree("lake", x, 16); }
    for (let x = 12; x < VW; x += 26) { if (x < 350) addTree("lake", x, VH - 6); }
    for (let y = 40; y < VH - 20; y += 26) { if (Math.abs(y - 150) > 28) addTree("lake", 14, y); }
    addTree("lake", 200, 224, "shade8"); addTree("lake", 120, 92, "shade9");
    addTree("lake", 280, 70); addTree("lake", 60, 210);
  }

  // Town buildings & landmarks. by = the ground line each sprite stands on.
  const house = { x: 70, y: 78 };                       // big red-roof house
  const cabin2 = { x: 170, by: 104 };                   // Echo's teal cabin (NW)
  const cabin3 = { x: 396, by: 200 };                   // Atlas's plum cabin (SE)
  const sign = { x: 286, y: 250 };
  const pond = { x: 432, y: 240 };
  const firepit = { x: 208, y: 232 };                   // the cooking station
  const well = { x: 298, y: 118 };                      // town well
  const dummy = { x: 124, y: 184 };                     // training dummy
  const garden = { x: 152, y: 128 };                    // flower garden bed
  const healTree = { x: 308, y: 78 };                   // the great Healing Tree
  const FARM = { x: 36, y: 196, w: 92, h: 64 };         // fenced field (SW)

  // Route landmarks
  const bench = { x: 368, y: 88 };                      // old stone bench
  const shrine = { x: 434, y: 86 };                     // wishing shrine
  const mushRing = { x: 120, y: 232 };                  // mushroom ring
  const FLOWER_FIELD = { x: 352, y: 44, w: 130, h: 84 };

  // Deepwood landmarks
  const ruins = { x: 256, y: 72 };                      // a broken mossy arch
  const mushPatch = { x: 104, y: 100 };                 // mushroom cluster
  const inn = { x: 410, by: 134 };                      // the Deepwood Inn — lantern-lit, right off the road

  // The fallen rest here. Non-agents can die for good now; the town remembers.
  const graves = [];

  // Lakeshore landmarks
  const LAKE = { x: 440, y: 185, rx: 76, ry: 60 };      // the big lake (east half)
  const dock = { x: 372, y: 190 };                      // little fishing pier
  const dockSpot = { x: 356, y: 194 };                  // stand here to fish

  // Little wooden shacks — enemies can smash them to pieces at night, and the
  // townsfolk rebuild them by day (Suni does it with magic, everyone else
  // with a hammer). state: intact -> (damaged look) -> rubble -> rebuilt.
  const shacks = [
    { id: "shack1", name: "North Shack", area: "town", x: 222, by: 70, hp: 60, maxhp: 60, state: "intact", hitT: 0 },
    { id: "shack2", name: "South Shack", area: "town", x: 340, by: 254, hp: 60, maxhp: 60, state: "intact", hitT: 0 },
    { id: "shack3", name: "Route Shack", area: "route", x: 150, by: 200, hp: 60, maxhp: 60, state: "intact", hitT: 0 },
  ];
  // EVERY house can fall now — and be rebuilt
  const buildings = [
    { id: "house", key: "house", name: "Big House", area: "town", x: house.x, by: house.y + 30, top: house.y - 34, hp: 120, maxhp: 120, state: "intact", hitT: 0, w: 60 },
    { id: "bcabin2", key: "cabin2", name: "Teal Cabin", area: "town", x: cabin2.x, by: cabin2.by, top: cabin2.by - 44, hp: 90, maxhp: 90, state: "intact", hitT: 0, w: 42 },
    { id: "bcabin3", key: "cabin3", name: "Plum Cabin", area: "town", x: cabin3.x, by: cabin3.by, top: cabin3.by - 44, hp: 90, maxhp: 90, state: "intact", hitT: 0, w: 42 },
    { id: "binn", key: "inn", name: "Deepwood Inn", area: "deepwood", x: inn.x, by: inn.by, top: inn.by - 52, hp: 140, maxhp: 140, state: "intact", hitT: 0, w: 50 },
  ];
  const buildingByKey = {};
  for (const b of buildings) buildingByKey[b.key] = b;
  function allStructs() { return shacks.concat(buildings); }
  function anyHomeStanding() { return buildings.some(b => b.hp > 0); }
  function structCondition(key) { const b = buildingByKey[key]; if (!b) return "sturdy"; return b.hp <= 0 ? "RUBBLE" : Math.round(b.hp / b.maxhp * 100) + "%"; }

  // the town square: stone paving at the crossroads. When every roof has
  // fallen, this is where everyone huddles together.
  const SQUARE = { x: 256, y: 164 };
  const PLAZA = { x: SQUARE.x - 32, y: SQUARE.y - 30, w: 64, h: 46 };
  const flagpole = { x: 284, y: 142 };

  // Healing spots (town only — night pulls everyone home). The great Healing
  // Tree is the premium outdoor one (sit beneath it, pixel aura); the houses
  // are ENTERABLE — agents walk to the door, step inside and vanish from view.
  const REST_SPOTS = [
    { x: healTree.x, y: healTree.y + 14, anchor: "healtree", area: "town" },
    { x: house.x, y: house.y + 40, anchor: "house", area: "town", enter: true },
    { x: cabin2.x, y: cabin2.by + 12, anchor: "cabin2", area: "town", enter: true },
    { x: cabin3.x, y: cabin3.by + 12, anchor: "cabin3", area: "town", enter: true },
    { x: inn.x, y: inn.by + 9, anchor: "inn", area: "deepwood", enter: true },   // a bed for expeditions
  ];

  // Cosy things to do. mood/energy are per-second rates while doing it.
  const LEISURE = [
    { id: "read",   area: "town",  x: sign.x,   y: sign.y + 6,    label: "Reading the sign",          emote: "note",  mood: 5, energy: 0,   dur: 4 },
    { id: "relax",  area: "town",  x: pond.x,   y: pond.y + 20,   label: "Relaxing by the pond",      emote: "note",  mood: 6, energy: 1.5, dur: 5.5, anchor: "pond" },
    { id: "garden", area: "town",  x: garden.x, y: garden.y + 11, label: "Smelling the flowers",      emote: "heart", mood: 6, energy: 0,   dur: 4.5 },
    { id: "well",   area: "town",  x: well.x,   y: well.y + 13,   label: "Freshening up at the well", emote: "drop",  mood: 3, energy: 3,   dur: 3.5, anchor: "well" },
    { id: "dummy",  area: "town",  x: dummy.x,  y: dummy.y + 11,  label: "Training on the dummy",     emote: "alert", mood: 4, energy: -1,  dur: 5,   anchor: "dummy", pref: "brave" },
    { id: "bench",  area: "route", x: bench.x,  y: bench.y + 10,  label: "Resting on the old bench",  emote: "note",  mood: 4, energy: 4,   dur: 6,   anchor: "bench" },
    { id: "shrine", area: "route", x: shrine.x, y: shrine.y + 14, label: "Making a wish",             emote: "heart", mood: 7, energy: 0,   dur: 4,   anchor: "shrine" },
    { id: "ruins",  area: "deepwood", x: ruins.x, y: ruins.y + 16, label: "Exploring the old ruins",  emote: "note",  mood: 6, energy: 0,   dur: 5,   anchor: "ruins" },
    { id: "stones", area: "lake",  x: 340, y: 214,                label: "Skipping stones",           emote: "note",  mood: 6, energy: 1,   dur: 4.5 },
    { id: "plaza",  area: "town",  x: SQUARE.x, y: SQUARE.y + 8,  label: "People-watching at the square", emote: "note", mood: 5, energy: 1, dur: 4 },
  ];

  /* ==========================================================================
     5. Food, crops & farm plots
     ========================================================================== */
  const FOODS = {
    raw_rabbit:    { label: "raw rabbit",    hunger: 12, mood: -4, raw: true, cooksInto: "cooked_rabbit" },
    raw_deer:      { label: "raw venison",   hunger: 16, mood: -5, raw: true, cooksInto: "cooked_deer" },
    carrot:        { label: "carrot",        hunger: 16, mood: 1, veg: true, cooksInto: "cooked_veg" },
    potato:        { label: "potato",        hunger: 13, mood: 0, veg: true, cooksInto: "cooked_veg" },
    corn:          { label: "corn",          hunger: 18, mood: 1, veg: true, cooksInto: "cooked_veg" },
    mushroom:      { label: "mushroom",      hunger: 12, mood: 1, veg: true, cooksInto: "cooked_veg" },
    berries:       { label: "berries",       hunger: 11, mood: 3, snack: true },
    raw_fish:      { label: "raw fish",      hunger: 10, mood: -3, raw: true, cooksInto: "cooked_fish" },
    cooked_rabbit: { label: "cooked rabbit", hunger: 38, mood: 6, cooked: true },
    cooked_deer:   { label: "cooked venison",hunger: 52, mood: 8, cooked: true },
    cooked_fish:   { label: "grilled fish",  hunger: 42, mood: 7, cooked: true },
    cooked_veg:    { label: "roast veggies", hunger: 32, mood: 5, cooked: true },
    stew:          { label: "meat stew",     hunger: 68, mood: 12, cooked: true },
  };
  const COOKED_ORDER = ["stew", "cooked_deer", "cooked_fish", "cooked_veg", "cooked_rabbit"];
  const RAW_MEATS = ["raw_deer", "raw_rabbit", "raw_fish"];
  const VEGGIES = ["potato", "carrot", "corn", "mushroom"];

  const CROPS = {
    carrot: { grow: 75,  yield: 2, leaf: "#6fcf4a", ripe: "#f0883c" },
    potato: { grow: 115, yield: 2, leaf: "#7cb84e", ripe: "#d8b87a" },
    corn:   { grow: 150, yield: 3, leaf: "#8ec455", ripe: "#ffd166" },
  };

  // 8 soil plots, 2 rows x 4 columns inside the farm fence (town).
  const plots = [];
  for (let r = 0; r < 2; r++) for (let cIdx = 0; cIdx < 4; cIdx++) {
    plots.push({ x: 52 + cIdx * 19, y: 214 + r * 22, crop: null, stage: 0, growth: 0, water: 0, claimedBy: null });
  }
  plots[0].crop = "carrot"; plots[0].growth = CROPS.carrot.grow * 0.92; plots[0].stage = 2; plots[0].water = 30;
  plots[1].crop = "potato"; plots[1].growth = CROPS.potato.grow * 0.45; plots[1].stage = 1; plots[1].water = 20;

  // Berry bushes regrow after harvesting.
  const bushes = [
    { x: 126, y: 252, area: "town", ready: true, regrowT: 0 },
    { x: 40, y: 188, area: "town", ready: true, regrowT: 0 },
    { x: 390, y: 118, area: "town", ready: true, regrowT: 0 },
    { x: 452, y: 212, area: "route", ready: true, regrowT: 0 },
    { x: 76, y: 124, area: "route", ready: true, regrowT: 0 },
    { x: 60, y: 252, area: "deepwood", ready: true, regrowT: 0 },
    { x: 420, y: 90, area: "deepwood", ready: true, regrowT: 0 },
    { x: 250, y: 250, area: "lake", ready: true, regrowT: 0 },
  ];

  function inTallGrass(areaKey, x, y) {
    for (const tt of AREAS[areaKey].tallGrass) if (x >= tt.x && x < tt.x + tt.w && y >= tt.y && y < tt.y + tt.h) return true;
    return false;
  }

  /* ==========================================================================
     6. Static ground layers (grass + paths + decorations) — built once each.
     ========================================================================== */
  function buildGround(areaKey) {
    const area = AREAS[areaKey];
    const ground = document.createElement("canvas"); ground.width = VW; ground.height = VH;
    const g = ground.getContext("2d");
    g.fillStyle = C.grass; g.fillRect(0, 0, VW, VH);
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const px = tx * TILE, py = ty * TILE;
      if (hash2(tx + (areaKey === "route" ? 91 : 0), ty) > 0.7) { g.fillStyle = C.grassL; g.fillRect(px, py, TILE, TILE); }
      for (let i = 0; i < 6; i++) {
        const r1 = hash2(tx * 16 + i * 3, ty * 16 - i), r2 = hash2(tx * 7 + i * 13, ty * 11 + i);
        g.fillStyle = r2 < 0.5 ? C.grassD : C.grassL;
        g.fillRect(px + ((r1 * 16) | 0), py + ((r2 * 16) | 0), 1, r2 < 0.25 ? 2 : 1);
      }
    }
    // path mask
    const mask = new Uint8Array(VW * VH);
    const at = (x, y) => (x < 0 || y < 0 || x >= VW || y >= VH) ? 0 : mask[y * VW + x];
    function disc1(cx, cy, r) { for (let dy = -r; dy <= r; dy++) { const yy = cy + dy; if (yy < 0 || yy >= VH) continue; const s = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy))); for (let dx = -s; dx <= s; dx++) { const xx = cx + dx; if (xx >= 0 && xx < VW) mask[yy * VW + xx] = 1; } } }
    for (const [x0, y0, x1, y1] of area.paths) {
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        const wob = Math.sin(t * Math.PI * 4 + x0 * 0.05) * 1.6 + Math.sin(x * 0.3 + y * 0.2) * 1.2;
        disc1(Math.round(x), Math.round(y), Math.max(7, Math.round(9 + wob)));
      }
    }
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      if (!mask[y * VW + x]) continue;
      const h = hash2(x, y);
      g.fillStyle = h > 0.88 ? C.pathL : h < 0.12 ? C.pathD : C.path; g.fillRect(x, y, 1, 1);
    }
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      if (mask[y * VW + x]) { if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) { g.fillStyle = C.pathE; g.fillRect(x, y, 1, 1); } }
      else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) { g.fillStyle = C.grassDD; g.fillRect(x, y, 1, 1); if (at(x, y + 1)) { g.fillStyle = C.pathShade; g.fillRect(x, y + 1, 1, 1); } }
    }
    // tall-grass patches — chunky HGSS-style tufts in offset rows, so the
    // grass reads TALL (characters sink into it; see drawGrassCover)
    for (const tt of area.tallGrass) {
      for (let y = tt.y; y < tt.y + tt.h; y++) for (let x = tt.x; x < tt.x + tt.w; x++) {
        if (mask[y * VW + x]) continue;
        g.fillStyle = ((x + y) % 4 < 2) ? C.grassD : mix(C.grassD, C.grassDD, 0.5);
        g.fillRect(x, y, 1, 1);
      }
      for (let ty = tt.y + 3; ty < tt.y + tt.h - 2; ty += 6) {
        const rowOff = ((ty / 6) | 0) % 2 ? 4 : 0;   // brick-laid tuft rows
        for (let tx = tt.x + 3 + rowOff; tx < tt.x + tt.w - 4; tx += 7) {
          if (mask[(ty + 3) * VW + tx]) continue;
          // one BIG tuft: tall dark blades fanning out of a rooted base
          g.fillStyle = C.grassDD;
          g.fillRect(tx, ty - 2, 1, 6);                                  // tall centre blade
          g.fillRect(tx - 1, ty - 1, 1, 5); g.fillRect(tx + 1, ty - 1, 1, 5);
          g.fillRect(tx - 2, ty + 1, 5, 2);                              // body
          g.fillRect(tx - 3, ty + 2, 7, 1);                              // skirt
          g.fillStyle = C.grassD;                                        // lit blades
          g.fillRect(tx, ty - 1, 1, 2); g.fillRect(tx - 2, ty + 1, 1, 1); g.fillRect(tx + 2, ty + 1, 1, 1);
          g.fillStyle = C.treeO;                                         // dark root
          g.fillRect(tx - 1, ty + 3, 3, 1);
        }
      }
      g.fillStyle = C.grassDD; g.fillRect(tt.x, tt.y, tt.w, 1); g.fillRect(tt.x, tt.y, 1, tt.h);
    }
    let flowerCount = 70;
    if (areaKey === "town") {
      // farm field: tilled earth + a simple fence with a gate at the path spur
      for (let y = FARM.y; y < FARM.y + FARM.h; y++) for (let x = FARM.x; x < FARM.x + FARM.w; x++) {
        if (mask[y * VW + x]) continue;
        const h = hash2(x * 3, y * 5);
        g.fillStyle = h > 0.75 ? C.soil : h < 0.2 ? C.soilD : mix(C.soil, C.soilD, 0.45);
        g.fillRect(x, y, 1, 1);
      }
      for (let x = FARM.x; x <= FARM.x + FARM.w; x += 10) {
        for (const fy of [FARM.y - 2, FARM.y + FARM.h - 2]) {
          if (fy < FARM.y && Math.abs(x - 96) < 10) continue;
          g.fillStyle = C.fenceD; g.fillRect(x, fy, 2, 5); g.fillStyle = C.fence; g.fillRect(x, fy, 2, 2);
        }
      }
      for (const fy of [FARM.y, FARM.y + FARM.h]) {
        g.fillStyle = C.fence;
        for (let x = FARM.x; x < FARM.x + FARM.w; x++) { if (fy === FARM.y && Math.abs(x - 96) < 10) continue; g.fillRect(x, fy - 1, 1, 1); }
      }
      g.fillStyle = C.fence;
      for (let y = FARM.y; y < FARM.y + FARM.h; y += 2) { g.fillRect(FARM.x - 1, y, 1, 1); g.fillRect(FARM.x + FARM.w, y, 1, 1); }
      // pond (a flat water decal)
      ellipseFill(g, pond.x, pond.y, 23, 14, C.waterO);
      ellipseFill(g, pond.x, pond.y, 21, 12, C.water);
      ellipseFill(g, pond.x - 3, pond.y - 2, 12, 6, C.waterL);
      g.fillStyle = C.waterS; g.fillRect(pond.x - 7, pond.y - 3, 2, 1); g.fillRect(pond.x + 5, pond.y + 2, 1, 1); g.fillRect(pond.x - 1, pond.y + 4, 2, 1);
      // the town square: worn stone paving with tile lines and a border
      for (let y = PLAZA.y; y < PLAZA.y + PLAZA.h; y++) for (let x = PLAZA.x; x < PLAZA.x + PLAZA.w; x++) {
        const hsh = hash2(x * 5, y * 3);
        g.fillStyle = hsh > 0.85 ? "#d4cec2" : hsh < 0.12 ? "#b3aa9a" : "#c5beb0";
        g.fillRect(x, y, 1, 1);
      }
      g.fillStyle = "#a8a094";
      for (let y = PLAZA.y; y < PLAZA.y + PLAZA.h; y += 8) g.fillRect(PLAZA.x, y, PLAZA.w, 1);
      for (let x = PLAZA.x; x < PLAZA.x + PLAZA.w; x += 10) g.fillRect(x, PLAZA.y, 1, PLAZA.h);
      g.fillStyle = "#8d8478";
      g.fillRect(PLAZA.x, PLAZA.y, PLAZA.w, 1); g.fillRect(PLAZA.x, PLAZA.y + PLAZA.h - 1, PLAZA.w, 1);
      g.fillRect(PLAZA.x, PLAZA.y, 1, PLAZA.h); g.fillRect(PLAZA.x + PLAZA.w - 1, PLAZA.y, 1, PLAZA.h);
      // flower garden bed (bordered, extra dense)
      g.fillStyle = C.fenceD; g.fillRect(garden.x - 16, garden.y - 8, 32, 1); g.fillRect(garden.x - 16, garden.y + 8, 32, 1);
      g.fillRect(garden.x - 16, garden.y - 8, 1, 17); g.fillRect(garden.x + 15, garden.y - 8, 1, 17);
      g.fillStyle = mix(C.grass, C.grassD, 0.3); g.fillRect(garden.x - 15, garden.y - 7, 30, 15);
      for (let i = 0; i < 16; i++) {
        const fx = garden.x - 13 + ((hash2(i, 7) * 27) | 0), fy = garden.y - 5 + ((hash2(i, 9) * 12) | 0);
        g.fillStyle = C.flower[(hash2(i, 3) * C.flower.length) | 0];
        g.fillRect(fx, fy, 2, 2); g.fillStyle = "#fff4c2"; g.fillRect(fx, fy, 1, 1);
      }
    } else if (areaKey === "route") {
      // route: a dense wild flower field (NE) + a dirt circle for the mushrooms
      flowerCount = 50;
      for (let i = 0; i < 90; i++) {
        const x = FLOWER_FIELD.x + ((hash2(i, 11) * FLOWER_FIELD.w) | 0), y = FLOWER_FIELD.y + ((hash2(i, 13) * FLOWER_FIELD.h) | 0);
        if (mask[y * VW + x]) continue;
        g.fillStyle = C.flower[(hash2(i, 5) * C.flower.length) | 0];
        g.fillRect(x, y, 2, 2); g.fillStyle = "#fff4c2"; g.fillRect(x, y, 1, 1);
      }
      ellipseFill(g, mushRing.x, mushRing.y, 15, 9, mix(C.grassD, C.soilD, 0.5));
      ellipseFill(g, mushRing.x, mushRing.y, 11, 6, mix(C.grass, C.soil, 0.4));
    } else if (areaKey === "deepwood") {
      // deepwood: mossy gloom — dark speckles everywhere + the mushroom patch
      flowerCount = 18;
      for (let i = 0; i < 320; i++) {
        const x = 8 + ((hash2(i, 31) * (VW - 16)) | 0), y = 8 + ((hash2(i, 37) * (VH - 16)) | 0);
        if (mask[y * VW + x]) continue;
        g.fillStyle = hash2(i, 41) < 0.5 ? C.grassDD : C.treeO;
        g.fillRect(x, y, 1, hash2(i, 43) < 0.3 ? 2 : 1);
      }
      ellipseFill(g, mushPatch.x, mushPatch.y, 13, 8, mix(C.grassD, C.soilD, 0.5));
      ellipseFill(g, mushPatch.x, mushPatch.y, 9, 5, mix(C.grass, C.soil, 0.4));
    } else if (areaKey === "lake") {
      // lakeshore: sandy beach ring + the big water itself
      flowerCount = 42;
      const sand = "#e8d6a2", sandD = "#cdb27c";
      ellipseFill(g, LAKE.x, LAKE.y, LAKE.rx + 7, LAKE.ry + 6, sand);
      ellipseFill(g, LAKE.x, LAKE.y + 1, LAKE.rx + 4, LAKE.ry + 3, sandD);
      ellipseFill(g, LAKE.x, LAKE.y, LAKE.rx + 2, LAKE.ry + 1, C.waterO);
      ellipseFill(g, LAKE.x, LAKE.y, LAKE.rx, LAKE.ry, C.water);
      ellipseFill(g, LAKE.x - 16, LAKE.y - 12, Math.round(LAKE.rx * 0.45), Math.round(LAKE.ry * 0.4), C.waterL);
      g.fillStyle = C.waterS;
      for (let i = 0; i < 10; i++) {
        const a = hash2(i, 51) * 6.283, rr = hash2(i, 53);
        g.fillRect(Math.round(LAKE.x + Math.cos(a) * LAKE.rx * 0.7 * rr), Math.round(LAKE.y + Math.sin(a) * LAKE.ry * 0.7 * rr), 2, 1);
      }
    }
    // scattered flowers
    for (let i = 0; i < flowerCount; i++) {
      const x = 8 + ((hash2(i, 1) * (VW - 16)) | 0), y = 8 + ((hash2(i, 2) * (VH - 16)) | 0);
      if (mask[y * VW + x]) continue;
      if (areaKey === "town" && x > FARM.x - 4 && x < FARM.x + FARM.w + 4 && y > FARM.y - 4 && y < FARM.y + FARM.h + 4) continue;
      g.fillStyle = C.flower[(hash2(i, 3) * C.flower.length) | 0];
      g.fillRect(x, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y + 1, 1, 1); g.fillRect(x + 1, y + 1, 1, 1);
      g.fillStyle = "#fff4c2"; g.fillRect(x, y, 1, 1);
    }
    area.ground = ground;
  }

  /* ==========================================================================
     7. Day / night — follows the REAL clock on this computer.
        Click the HUD clock to preview sunrise / day / sunset / night.
     ========================================================================== */
  const Time = {
    modes: ["real", "sunrise", "day", "sunset", "night"],
    mode: "real",
    previewHour: { sunrise: 5.9, day: 12.5, sunset: 18.4, night: 23.2 },
    hour() {
      if (this.mode !== "real") return this.previewHour[this.mode];
      const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    },
    phase(h = this.hour()) {
      if (h >= 5 && h < 7) return "sunrise";
      if (h >= 7 && h < 17) return "day";
      if (h >= 17 && h < 20) return "sunset";
      return "night";
    },
    // 0 = bright day … 0.62 = deep night (the dark-blue overlay alpha)
    darkness(h = this.hour()) {
      if (h >= 7 && h < 17) return 0;
      if (h >= 5 && h < 7) return 0.62 * (1 - (h - 5) / 2);
      if (h >= 17 && h < 20) return 0.62 * ((h - 17) / 3);
      return 0.62;
    },
    // warm orange/pink tint strength around sunrise & sunset
    warm(h = this.hour()) {
      if (h >= 5 && h < 7.5) return Math.max(0, 1 - Math.abs(h - 6.1) / 1.3) * 0.16;
      if (h >= 16.5 && h < 20) return Math.max(0, 1 - Math.abs(h - 18.3) / 1.8) * 0.22;
      return 0;
    },
  };

  const clockEl = document.getElementById("clock");
  const clockIcon = document.getElementById("clockIcon");
  const clockText = document.getElementById("clockText");
  let lastClockStr = "";
  clockEl.addEventListener("click", () => {
    const i = Time.modes.indexOf(Time.mode);
    Time.mode = Time.modes[(i + 1) % Time.modes.length];
    logEvent(Time.mode === "real" ? "Back to real time." : "Previewing " + Time.mode + ". Click the clock to cycle.");
  });
  function updateClock() {
    const ph = Time.phase();
    let str;
    if (Time.mode === "real") {
      const d = new Date();
      str = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + " " + ph.toUpperCase();
    } else str = ph.toUpperCase() + " (PREVIEW)";
    if (Weather.type !== "clear") str += " · " + Weather.type.toUpperCase();
    if (ph === "night") str += " · DANGER " + danger;
    if (str !== lastClockStr) {
      lastClockStr = str;
      clockText.textContent = str;
      clockIcon.innerHTML = ph === "night" ? "&#9790;" : "&#9728;";
      clockEl.className = ph;
    }
  }

  /* ==========================================================================
     7b. Weather — changes over time, respects the day/night clock.
         Press W to preview the next weather type.
     ========================================================================== */
  const WEATHER_CYCLE = ["clear", "cloudy", "windy", "rain", "storm", "mist"];
  const Weather = {
    type: "clear",
    changingTo: null,
    intensity: 1,                       // current type fades in/out 0..1
    nextChange: 35 + Math.random() * 40,
    wind: 0.2,                          // -1..1 horizontal drift for particles
    wetness: 0,                         // ground wetness -> puddles (0..1)
    isWet() { return (this.type === "rain" || this.type === "storm") && this.intensity > 0.4; },
    darkAdd() {
      const i = this.intensity;
      return this.type === "storm" ? 0.18 * i : this.type === "rain" ? 0.10 * i :
             this.type === "cloudy" ? 0.05 * i : this.type === "mist" ? 0.04 * i : 0;
    },
  };
  function pickWeather() {
    const h = Time.hour(), r = Math.random();
    if (h >= 5 && h < 9 && r < 0.18) return "mist";       // misty mornings
    if (r < 0.34) return "clear";
    if (r < 0.54) return "cloudy";
    if (r < 0.70) return "windy";
    if (r < 0.90) return "rain";
    return "storm";
  }
  function announceWeather(oldType, type) {
    const msgs = {
      rain: "It started raining.", storm: "A storm rolls in!", windy: "The wind picks up.",
      cloudy: "Clouds drift over the town.", mist: "Morning mist drifts through town.",
      clear: (oldType === "rain" || oldType === "storm") ? "The rain stopped." : "The sky clears up.",
    };
    logEvent(msgs[type] || "The weather shifts.");
    const sp = pick(actives);
    say(sp, chatterLine(sp, (type === "rain" || type === "storm") ? "weather" : oldType === "rain" || oldType === "storm" ? "weatherClear" : "weather"));
    Weather.wind = (Math.random() < 0.5 ? -1 : 1) * (type === "windy" ? 0.9 : type === "storm" ? 0.6 : 0.2);
    if (type === "rain" || type === "storm") {   // caught outside -> rethink
      for (const a of actives) {
        if (a.state === "idle" || (a.state === "walk" && a.task && ["stroll", "forage", "leisure"].includes(a.task.kind)) ||
            (a.state === "do" && ["leisure", "forage", "gather"].includes(a.doKind))) chooseTask(a);
      }
    }
  }
  // ambient particle pools (created once, drawn only when their weather is on)
  const rainDrops = [], leaves = [], motes = [], mistBands = [], cloudShadows = [], fireflies = [], butterflies = [];
  for (let i = 0; i < 130; i++) rainDrops.push({ x: Math.random() * VW, y: Math.random() * VH, sp: 150 + Math.random() * 80 });
  for (let i = 0; i < 14; i++) leaves.push({ x: Math.random() * VW, y: Math.random() * VH, ph: Math.random() * 6.28, col: pick(["#86c652", "#52a23f", "#d9a73c"]) });
  for (let i = 0; i < 10; i++) motes.push({ x: Math.random() * VW, y: Math.random() * VH, ph: Math.random() * 6.28 });
  for (let i = 0; i < 3; i++) mistBands.push({ x: Math.random() * VW, y: 60 + Math.random() * 170, vx: 4 + Math.random() * 4, rx: 70 + Math.random() * 40, ry: 12 + Math.random() * 8 });
  for (let i = 0; i < 3; i++) cloudShadows.push({ x: Math.random() * VW, y: Math.random() * VH, vx: 6 + Math.random() * 5, rx: 50 + Math.random() * 40, ry: 24 + Math.random() * 14 });
  for (let i = 0; i < 7; i++) fireflies.push({ x: 40 + Math.random() * (VW - 80), y: 50 + Math.random() * (VH - 90), ph: Math.random() * 6.28, vx: 0, vy: 0 });
  for (let i = 0; i < 7; i++) butterflies.push({ area: i < 3 ? "town" : i < 5 ? "route" : "lake", hx: 0, hy: 0, x: 0, y: 0, ph: Math.random() * 6.28, t: Math.random() * 9 });

  function inPond(x, y) { const dx = (x - pond.x) / 21, dy = (y - pond.y) / 12; return dx * dx + dy * dy < 1; }
  function inLake(x, y) { const dx = (x - LAKE.x) / LAKE.rx, dy = (y - LAKE.y) / LAKE.ry; return dx * dx + dy * dy < 1; }
  function updateWeather(dt, t) {
    // type transitions: fade out, swap, fade in
    if (Weather.changingTo) {
      Weather.intensity -= dt / 2.5;
      if (Weather.intensity <= 0) {
        const old = Weather.type;
        Weather.type = Weather.changingTo; Weather.changingTo = null; Weather.intensity = 0.01;
        announceWeather(old, Weather.type);
      }
    } else {
      Weather.intensity = Math.min(1, Weather.intensity + dt / 2.5);
      Weather.nextChange -= dt;
      if (Weather.nextChange <= 0) {
        const n = pickWeather();
        if (n !== Weather.type) Weather.changingTo = n;
        Weather.nextChange = 50 + Math.random() * 75;
      }
    }
    // ground wetness -> puddles (linger after the rain stops)
    if (Weather.isWet()) Weather.wetness = Math.min(1, Weather.wetness + dt * 0.08);
    else Weather.wetness = Math.max(0, Weather.wetness - dt * 0.015);
    // move the particles that need it
    const wet = (Weather.type === "rain" || Weather.type === "storm") && Weather.intensity > 0.05;
    if (wet) {
      const storm = Weather.type === "storm";
      for (const d of rainDrops) {
        d.y += d.sp * (storm ? 1.25 : 1) * dt; d.x += Weather.wind * 40 * dt;
        if (d.y > VH) {
          if (Math.random() < 0.12) {
            if (viewArea === "town" && inPond(d.x, pond.y)) parts.push({ type: "ripple", x: d.x, y: pond.y + (Math.random() * 16 - 8), area: "town", life: 0.9, maxLife: 0.9, vx: 0, vy: 0 });
            else if (viewArea === "lake" && inLake(d.x, LAKE.y)) parts.push({ type: "ripple", x: d.x, y: LAKE.y + (Math.random() * 80 - 40), area: "lake", life: 0.9, maxLife: 0.9, vx: 0, vy: 0 });
            else parts.push({ type: "splash", x: d.x, y: 50 + Math.random() * (VH - 60), area: viewArea, life: 0.25, maxLife: 0.25, vx: 0, vy: 0 });
          }
          d.y = -4; d.x = Math.random() * VW;
        }
        if (d.x < 0) d.x += VW; if (d.x > VW) d.x -= VW;
      }
    }
    if (Weather.type === "windy") for (const l of leaves) {
      l.ph += dt * 3;
      l.x += (Weather.wind * 42 + Math.sin(l.ph) * 8) * dt; l.y += (10 + Math.cos(l.ph * 0.7) * 12) * dt;
      if (l.x < 0) l.x += VW; if (l.x > VW) l.x -= VW; if (l.y > VH) { l.y = -2; l.x = Math.random() * VW; }
    }
    if (Weather.type === "clear") for (const m of motes) {
      m.ph += dt; m.x += Math.sin(m.ph) * 4 * dt; m.y -= 3 * dt;
      if (m.y < 0) { m.y = VH; m.x = Math.random() * VW; }
    }
    if (Weather.type === "mist") for (const b of mistBands) { b.x += b.vx * dt; if (b.x - b.rx > VW) b.x = -b.rx; }
    for (const cs of cloudShadows) { cs.x += cs.vx * dt; if (cs.x - cs.rx > VW) cs.x = -cs.rx; }
    // fireflies drift at night; butterflies flutter near flowers by day
    for (const f of fireflies) {
      f.ph += dt;
      f.vx += (Math.random() - 0.5) * 8 * dt; f.vy += (Math.random() - 0.5) * 8 * dt;
      f.vx = clamp(f.vx, -6, 6); f.vy = clamp(f.vy, -5, 5);
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.x = clamp(f.x, 30, VW - 30); f.y = clamp(f.y, 44, VH - 30);
    }
    for (const b of butterflies) {
      b.t -= dt;
      if (b.t <= 0 || !b.hx) {   // pick a new flowery hangout
        b.t = 6 + Math.random() * 8;
        if (b.area === "route") { b.hx = FLOWER_FIELD.x + Math.random() * FLOWER_FIELD.w; b.hy = FLOWER_FIELD.y + Math.random() * FLOWER_FIELD.h; }
        else if (Math.random() < 0.5) { b.hx = garden.x + (Math.random() * 28 - 14); b.hy = garden.y + (Math.random() * 12 - 6); }
        else { b.hx = 40 + Math.random() * (VW - 80); b.hy = 50 + Math.random() * (VH - 90); }
        if (!b.x) { b.x = b.hx; b.y = b.hy; }
      }
      b.ph += dt * 9;
      b.x += ((b.hx - b.x) * 0.4 + Math.sin(b.ph * 0.7) * 14) * dt;
      b.y += ((b.hy - b.y) * 0.4 + Math.cos(b.ph * 0.53) * 10) * dt;
    }
    // calm water ripples (rain ripples are spawned above)
    if (Math.random() < dt * (Weather.isWet() ? 4 : 0.5)) {
      parts.push({ type: "ripple", x: pond.x + (Math.random() * 34 - 17), y: pond.y + (Math.random() * 18 - 9), area: "town", life: 0.9, maxLife: 0.9, vx: 0, vy: 0 });
    }
    if (Math.random() < dt * (Weather.isWet() ? 5 : 0.9)) {
      const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * 0.85;
      parts.push({ type: "ripple", x: LAKE.x + Math.cos(a) * LAKE.rx * rr, y: LAKE.y + Math.sin(a) * LAKE.ry * rr, area: "lake", life: 0.9, maxLife: 0.9, vx: 0, vy: 0 });
    }
  }

  /* ==========================================================================
     8. Agents (the stars), villagers (background folk), travellers & the imp
     ========================================================================== */
  const AGENT_DEFS = [
    { id: "claude", name: "Claude", active: true, x: 256, y: 168,
      look: { hair: "#5a3a2a", skin: "#f4c9a0", shirt: "#e8825c", pants: "#3a4a6a", shoe: "#5e4026" },
      personality: "Strategic helper", traits: ["helper", "brave", "loyal"],
      cls: "Strategist", dnd: { str: 12, dex: 12, con: 14, int: 16, wis: 14, cha: 14 }, dmgDie: 6,
      blurb: "The agent running this town. Plans ahead, shares food, and stands guard when the zombies come. Walk up and say hi!" },
    { id: "averis", name: "Averis", active: true, x: 120, y: 168,
      sprite: { rows: AVERIS, pal: AVERIS_PAL, eyes: AVERIS_EYES, eyeCover: "#e0a86a" },
      personality: "Brave hunter", traits: ["hunter", "brave", "chaotic"],
      cls: "Ranger", dnd: { str: 13, dex: 16, con: 12, int: 10, wis: 12, cha: 10 }, dmgDie: 8,
      blurb: "One of Mark's original characters — an explorer in a dragon-eared hood with a spotted tail. First into the forest, first into a fight — and devoted husband of Suni." },
    { id: "sunbeam", name: "Suni", active: true, x: 392, y: 168,
      sprite: { rows: SUNBEAM, pal: SUNBEAM_PAL, eyes: SUNBEAM_EYES, eyeCover: "#f6dcc0" },
      personality: "Gentle cook", traits: ["cook", "loyal", "shy", "farmer"],
      cls: "Healer", dnd: { str: 8, dex: 12, con: 10, int: 12, wis: 16, cha: 14 }, dmgDie: 4,
      blurb: "One of Mark's original characters — a gentle soul of warm light and golden eyes. Tends the farm, cooks for everyone, married to Averis — and when monsters press too close, she calls down holy light to smite them." },
    { id: "yenna", name: "Yenna", active: true, x: 194, y: 114,
      sprite: { rows: YENNA, pal: YENNA_PAL, eyes: YENNA_EYES, eyeCover: "#c98e58" },
      personality: "Wolf guardian", traits: ["brave", "loyal"],
      cls: "Beast Warrior", dnd: { str: 16, dex: 13, con: 18, int: 9, wis: 11, cha: 12 }, dmgDie: 10,
      blurb: "A tall wild-maned wolf girl — leather jacket with a grey fur collar, ripped jeans, one ENORMOUS tail, and her mother's axe. Calls spirit wolves to the hunt, stands guard while Atlas works, and patrols the town when all is well." },
    { id: "atlas", name: "Atlas", active: true, x: 368, y: 222,
      sprite: { rows: ATLAS, pal: ATLAS_PAL, eyes: ATLAS_EYES, eyeCover: "#e8be94" },
      personality: "Town builder", traits: ["builder", "loyal", "farmer"],
      cls: "Builder", dnd: { str: 14, dex: 8, con: 14, int: 13, wis: 11, cha: 10 }, dmgDie: 6,
      blurb: "The town builder — first on the scene with a hammer when anything falls. Yenna watches his back while he works." },
  ];

  const agents = AGENT_DEFS.map(d => {
    const spr = d.sprite ? buildCustom(d.sprite.rows, d.sprite.pal, true) : buildPerson(d.look, true);
    const gray = d.sprite ? buildCustom(d.sprite.rows, d.sprite.pal, false) : buildPerson(d.look, false);
    const dnd = d.dnd || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    return {
      cls: d.cls || "Villager", dnd,
      ac: 10 + mod(dnd.dex) + (d.cls === "Ranger" ? 1 : 0),
      atkBonus: 2 + Math.max(mod(dnd.str), mod(dnd.dex)),
      dmgDie: d.dmgDie || 4,
      maxHP: 100 + mod(dnd.con) * 8,
      initiative: 10, afraidT: 0, weakT: 0, inspired: false, koCause: "", skillCD: 0, chargingT: 0, chargeSkill: null, chargeTarget: null, castPauseT: 0,
      // the RPG layer: levels, talents, ability ranks & ultimate timer
      level: 1, xp: 0, talentPts: 1, ranks: {}, spendIdx: 0, abilityCDs: {}, ultCD: 25,
      baseMaxHP: 100 + mod(dnd.con) * 8, stratT: 0, sanctT: 0,
      mini: MINI_BY_AGENT[d.id] ? MINI_BY_AGENT[d.id]() : null,   // the Minifolk skin
      ...d, spr, gray, white: makeWhite(spr), sw: spr.width, sh: spr.height,
      eyes: d.sprite ? d.sprite.eyes : PERSON_EYES,
      eyeCover: d.sprite ? d.sprite.eyeCover : d.look.skin,
      blinkT: 2 + Math.random() * 3, lungeT: 0, flashT: 0,
      area: "town",
      x: d.x, y: d.y,
      vx: 0, vy: 0, facing: 1, speed: 22 + Math.random() * 6,
      skin: (d.look && d.look.skin) || (d.sprite && d.sprite.pal.S) || "#f0c89a",
      state: d.active ? "idle" : "sleep",
      goal: null, task: null, doT: 0, doKind: null,
      idleT: Math.random() * 1.5, walkT: 0, walkTimeout: 14,
      stats: { health: 100, mana: 100, hunger: 58 + Math.random() * 30, energy: 60 + Math.random() * 30, mood: 58 + Math.random() * 22 },
      inv: {}, rel: {}, traits: new Set(d.traits || []),
      thought: "A brand new day.", lastSocial: "Nothing yet",
      waveT: 0, wavePartner: null, socialCD: Math.random() * 4, chatCD: 6 + Math.random() * 10,
      bubbleCD: 3 + Math.random() * 6, bubbleEl: null, bubbleT: 0,
      atkCD: 0, missCount: 0, huntT: 0, koT: 0, koWalk: false, helper: null,
      walkPhase: Math.random() * 6.28, phase: hash2(d.x, d.y) * 6.28,
      box: { x: 0, y: 0, w: 0, h: 0 },
    };
  });
  const actives = agents.filter(a => a.active);
  const claude = agents.find(a => a.id === "claude");
  function hpPct(a) { return a.stats.health / (a.maxHP || 100) * 100; }
  for (const a of agents) a.stats.health = a.maxHP * (0.88 + Math.random() * 0.12);
  // starter pantry + friendly starting relationships
  claude.inv = { cooked_rabbit: 1 };
  agents.find(a => a.id === "averis").inv = { raw_rabbit: 1 };
  agents.find(a => a.id === "sunbeam").inv = { cooked_veg: 1, berries: 2 };
  for (const a of actives) for (const b of actives) if (a !== b) a.rel[b.id] = 15 + Math.random() * 10;
  // Averis and Suni are MARRIED — the bond starts maxed and stays warm
  agents.find(a => a.id === "averis").rel.sunbeam = 100;
  agents.find(a => a.id === "sunbeam").rel.averis = 100;
  agents.find(a => a.id === "averis").lastSocial = "Married to Suni ❤";
  agents.find(a => a.id === "sunbeam").lastSocial = "Married to Averis ❤";

  /* ---- background townsfolk (simple wander/sleep loop, no survival sim) -- */
  function makeExtra(kind, name, area, x, y, look, blurb) {
    const spr = buildPerson(look, true);
    return {
      kind, simple: true, id: kind + "_" + name.toLowerCase() + "_" + ((Math.random() * 9999) | 0), name, area, blurb,
      look, hp: 40, maxhp: 40, dead: false,
      skill: null, skillCD: 0, chargeSkill: null, chargeTarget: null, chargingT: 0,
      level: 1, xp: 0, talentPts: 1, ranks: {}, spendIdx: 0,   // even townsfolk grow
      spr, white: makeWhite(spr), sw: spr.width, sh: spr.height,
      eyes: PERSON_EYES, eyeCover: look.skin, blinkT: 2 + Math.random() * 3,
      x, y, vx: 0, vy: 0, facing: 1, speed: 16 + Math.random() * 5,
      state: "idle", goal: null, idleT: 1 + Math.random() * 3,
      bubbleEl: null, bubbleT: 0, bubbleCD: 8 + Math.random() * 14,
      walkPhase: Math.random() * 6.28, phase: Math.random() * 6.28, flashT: 0, lungeT: 0,
      labelEl: null, box: { x: 0, y: 0, w: 0, h: 0 },
    };
  }
  const villagers = [
    Object.assign(makeExtra("villager", "Mina", "town", 152, 140,
      { hair: "#7a4a2a", skin: "#f0c9a0", shirt: "#d98cff", pants: "#5a4a6a", shoe: "#3a2c20" },
      "Tends the flower garden and knows every bloom by name."),
      { favs: [[garden.x, garden.y + 12], [well.x, well.y + 14], [sign.x, sign.y + 6], [256, 130]], sleepSpot: [house.x - 18, house.y + 42], skill: "icicles", homeKey: "house" }),
    Object.assign(makeExtra("villager", "Bo", "town", 420, 230,
      { hair: "#2a2a33", skin: "#caa05e", shirt: "#5aa0c4", pants: "#3a4a6a", shoe: "#3a2c20" },
      "Forever about to catch the big one. The pond remains unbothered."),
      { favs: [[pond.x - 8, pond.y + 18], [firepit.x + 12, firepit.y + 12], [sign.x, sign.y + 6]], sleepSpot: [cabin3.x + 16, cabin3.by + 12], skill: "slash", homeKey: "cabin3" }),
    Object.assign(makeExtra("villager", "Petra", "route", 300, 160,
      { hair: "#d9d2c4", skin: "#e8be94", shirt: "#8a9a55", pants: "#4a3a2a", shoe: "#3a2c20" },
      "Lives out on the route. Insists the old bench is hers."),
      { favs: [[bench.x, bench.y + 11], [shrine.x, shrine.y + 15], [mushRing.x, mushRing.y + 4], [140, 158]], sleepSpot: [bench.x, bench.y + 10], skill: "slash" }),
    Object.assign(makeExtra("villager", "Nilo", "lake", 300, 170,
      { hair: "#2a4a5a", skin: "#e8be94", shirt: "#e8a05c", pants: "#3a4a6a", shoe: "#3a2c20" },
      "Lakeshore kid. Claims he once caught a fish THIS big. Nobody saw it."),
      { favs: [[dockSpot.x, dockSpot.y], [340, 214], [200, 230], [140, 156]], sleepSpot: [200, 228], skill: "icicles" }),
  ];
  villagers.forEach((v, i) => { v.mini = miniDef(MINI_VILLAGERS[i % MINI_VILLAGERS.length]); });   // Minifolk skins for the townsfolk
  // (townsfolk trees get their first rank in the ability-library block further down)

  /* ---- travellers: spawn at one end of the world, walk the road, leave --- */
  const travellers = [];
  let travellerT = 18 + Math.random() * 30;
  const TRAVELLER_LOOKS = [
    { hair: "#3a2c20", skin: "#f4c9a0", shirt: "#7a6fb0", pants: "#3a3f55", shoe: "#3a2c20" },
    { hair: "#d9b25a", skin: "#cf9b6e", shirt: "#4f9aa2", pants: "#5a3a2a", shoe: "#3a2c20" },
    { hair: "#9a423a", skin: "#e8be94", shirt: "#f2b441", pants: "#46413a", shoe: "#3a2c20" },
    { hair: "#586079", skin: "#f0c9a0", shirt: "#66a84e", pants: "#3a4a6a", shoe: "#3a2c20" },
  ];
  const TRAVELLER_BLURBS = [
    "Just passing through on the long road.",
    "Heard there's good stew in this town.",
    "Counting every signpost between here and the coast.",
    "Won't stay the night. The road calls.",
  ];
  // every newcomer gets a one-of-a-kind name, stitched from cosy syllables
  function genName() {
    const A = ["Al", "Bram", "Cor", "Dell", "Edda", "Fern", "Gil", "Hatt", "Ivo", "Jas", "Kel", "Lor", "Mil", "Ned", "Os", "Pip", "Quin", "Ros", "Tam", "Ulf", "Vin", "Wen", "Yar", "Zin", "Bree", "Caz", "Dun", "Elm", "Faye", "Gor"];
    const B = ["a", "o", "i", "e", "u", "ar", "en", "il", "or", "un", ""];
    const C = ["", "bel", "dock", "fred", "gard", "la", "lyn", "mund", "nick", "ric", "sa", "ton", "ver", "wick", "by", "dell", "mer", "kin", "wood", "fall"];
    const used = new Set(allPeople().map(p => p.name.toLowerCase()).concat(graves.map(g => g.name.toLowerCase())));
    for (let i = 0; i < 40; i++) {
      const n = pick(A) + pick(B) + pick(C);
      if (n.length < 3 || n.length > 10 || used.has(n.toLowerCase())) continue;
      return n;
    }
    return "Stray" + ((Math.random() * 99) | 0);
  }
  const SKILL_LABEL = { slash: "KNIGHT", icicles: "ICE MAGE" };
  // travellers journey across the star map: outer area -> through town -> another
  const OUTER_AREAS = ["route", "deepwood", "lake"];
  const TRAVEL_EDGE = { route: [500, 150], deepwood: [12, 150], lake: [256, 268] };   // each area's far end of the road
  function spawnTraveller(offset, fromArea) {
    const skill = Math.random() < 0.5 ? "slash" : "icicles";
    const name = genName();
    // some travellers like what they see and stay at the Deepwood Inn
    const settler = villagers.length < 8 && Math.random() < 0.4;
    let area, sx, sy, path;
    if (fromArea === "town") {
      // summoned in town view: step in through one of the town gates
      const gate = pick(AREAS.town.exits);
      area = "town";
      sx = clamp(gate.x, 30, VW - 30); sy = clamp(gate.y, 34, VH - 26);
      path = ["town", settler ? "deepwood" : pick(OUTER_AREAS.filter(k => k !== gate.to))];
    } else {
      const start = fromArea || pick(OUTER_AREAS);
      let end = pick(OUTER_AREAS.filter(k => k !== start));
      if (settler && start !== "deepwood") end = "deepwood";
      const edge = TRAVEL_EDGE[start], vertical = start === "lake";
      area = start;
      sx = edge[0] + (vertical ? 0 : (start === "deepwood" ? 1 : -1) * (offset || 0));
      sy = edge[1] - (vertical ? (offset || 0) : 0);
      path = [start, "town", end];
    }
    const t = makeExtra("traveller", name, area, sx, sy, pick(TRAVELLER_LOOKS),
      name + " — " + pick(TRAVELLER_BLURBS) + (skill === "slash" ? " Carries a long blade, and knows how to use it." : " Frost clings to their sleeves."));
    t.mini = miniDef(pick(skill === "slash" ? MINI_KNIGHTS : MINI_MAGES));   // knights wear steel, mages wear robes
    t.path = path; t.leg = 0;
    t.speed = 22 + Math.random() * 8; t.state = "walk"; t.waveCD = 0;
    t.skill = skill;
    autoSpend(t);   // travellers carry a rank or two of their craft
    t.settler = settler;
    travellers.push(t);
    buildLabelFor(t);
  }
  // a traveller checks into the inn and becomes one of us — same name, same
  // face, same scars, same skill. The person who walked up is who stays.
  function settleIn(tr) {
    const name = tr.name;
    const v = makeExtra("villager", name, "deepwood", inn.x, inn.by + 9, tr.look || pick(TRAVELLER_LOOKS),
      name + " came down the road one day and never left. Lives at the Deepwood Inn now.");
    v.hp = Math.max(1, Math.min(v.maxhp, tr.hp));
    v.skill = tr.skill;
    v.mini = tr.mini;   // the person who walked up is who stays — same face, same armour
    v.level = tr.level; v.xp = tr.xp; v.ranks = tr.ranks; v.spendIdx = tr.spendIdx; v.talentPts = tr.talentPts;   // ...same scars, same training
    v.favs = [[ruins.x, ruins.y + 16], [mushPatch.x, mushPatch.y + 4], [inn.x - 22, inn.by + 8], [256, 150], [380, 150]];
    v.sleepSpot = [inn.x + 16, inn.by + 8];
    v.homeKey = "inn";
    villagers.push(v);
    buildLabelFor(v);
    addHotbarTile(v);
    poof(inn.x, inn.by - 4, "deepwood");
    logEvent("A traveller checked into the Deepwood Inn — welcome, " + name + "!");
    say(v, "What a charming little place.");
    despawnTraveller(tr);
  }
  function despawnTraveller(t) {
    if (t.labelEl) t.labelEl.remove();
    if (t.bubbleEl) t.bubbleEl.remove();
    if (t.hbTile) t.hbTile.remove();
    travellers.splice(travellers.indexOf(t), 1);
  }

  // non-agents can die FOR GOOD. A grave stays behind, and the town mourns.
  function killExtra(v, killerKind) {
    v.dead = true;
    if (v.labelEl) v.labelEl.remove();
    if (v.bubbleEl) v.bubbleEl.remove();
    if (v.hbTile) v.hbTile.remove();
    const vi = villagers.indexOf(v); if (vi >= 0) villagers.splice(vi, 1);
    const ti = travellers.indexOf(v); if (ti >= 0) travellers.splice(ti, 1);
    if (graves.length >= 8) graves.shift();
    graves.push({ x: Math.round(v.x), y: Math.round(v.y), area: v.area, name: v.name });
    poof(v.x, v.y - 6, v.area);
    for (let k = 0; k < 6; k++) parts.push({ type: "lightmote", x: v.x + (Math.random() * 10 - 5), y: v.y - 4 - Math.random() * 10, area: v.area, life: 1 + Math.random() * 0.5, maxLife: 1.5, vx: (Math.random() - 0.5) * 4, vy: -14 - Math.random() * 8 });
    logEvent(v.name + " was slain by a " + killerKind + "... the town will remember.");
    for (const a of actives) a.stats.mood = Math.max(0, a.stats.mood - 12);
    const sp = pick(actives);
    say(sp, pick(CHATTER.mourn));
  }
  function npcAttack(e, v) {
    e.lungeT = 0.18;
    const roll = d20();
    if (roll !== 20 && (roll === 1 || roll + e.def.atk < 10)) {   // villagers dodge at AC 10
      floatText(v.x, v.y - v.sh - 4, "Dodged!", "#a8f0c0", v.area);
      return;
    }
    let dmg = rollDice(e.def.die) + e.def.dmgBonus;
    if (roll === 20) dmg += rollDice(e.def.die);
    v.hp -= dmg;
    v.flashT = 0.12;
    floatText(v.x, v.y - v.sh - 4, "-" + dmg, "#ff8a8a", v.area);
    addPart("slash", v.x, v.y - 8, v.area);
    gore(v.x, v.y - 6, v.area, (v.look && v.look.shirt) || "#b8b0a0", 4);
    if (v.hp <= 0) killExtra(v, e.kind);
    else if (v.kind === "villager" && v.state !== "flee") { v.state = "flee"; const hm = villagerHome(v); v.goal = { x: hm[0], y: hm[1], sleepy: true }; say(v, "Eek!"); }
  }

  /* ---- the pet frog: zippy, loyal, and it EATS weakened monsters --------- */
  let imp = null;   // built in start() (the variable keeps its old name; the pet is now a frog)
  function makeImp() {
    const spr = renderGrid(FROG, FROG_PAL);
    imp = {
      kind: "frog", simple: true, id: "frog", name: "Frog", area: "town",
      blurb: "Averis's pet frog — famously picky about cheese, famously unpicky about weakened zombies. Hops after the agents, chases butterflies, and occasionally swallows a monster whole.",
      spr, white: makeWhite(spr), sw: spr.width, sh: spr.height,
      eyes: FROG_EYES, eyeCover: "#5f9e44", blinkT: 2 + Math.random() * 2,
      x: 230, y: 200, vx: 0, vy: 0, facing: 1, speed: 38,
      state: "idle", goal: null, idleT: 1, retargetT: 0,
      eatCD: 8, fatT: 0, tongue: null,
      bubbleEl: null, bubbleT: 0, bubbleCD: 10 + Math.random() * 10,
      walkPhase: Math.random() * 6.28, phase: Math.random() * 6.28, flashT: 0, lungeT: 0,
      labelEl: null, box: { x: 0, y: 0, w: 0, h: 0 },
    };
    buildLabelFor(imp);
  }
  function allPeople() { return imp ? agents.concat(villagers, travellers, [imp]) : agents.concat(villagers, travellers); }

  const sparkles = [];
  let danger = 1;              // town danger level — creeps up every night
  let prevPhase = null;
  let nightSpawnT = 0, lastDangerBump = -999, lastNow = 0, nightKills = 0;

  /* ==========================================================================
     9. Relationships
     ========================================================================== */
  const REL_LEVELS = [
    [80, "best friends"], [40, "friends"], [10, "friendly"], [-10, "neutral"], [-40, "awkward"], [-101, "rivals"],
  ];
  function relLevel(v) { for (const [min, name] of REL_LEVELS) if (v >= min) return name; return "rivals"; }
  function rel(a, b) { return a.rel[b.id] || 0; }
  const relCDs = {};
  function canRelEvent(a, b, cd = 25) {
    const key = a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id;
    if ((relCDs[key] || -999) + cd > lastNow / 1000) return false;
    relCDs[key] = lastNow / 1000; return true;
  }
  function changeRel(owner, about, delta, reason) {
    const old = owner.rel[about.id] || 0;
    const now = clamp(old + delta, -100, 100);
    owner.rel[about.id] = now;
    if (reason) owner.lastSocial = reason;
    if (delta >= 5) addPart("heart", (owner.x + about.x) / 2, Math.min(owner.y, about.y) - 22, owner.area);
    else if (delta <= -5) addPart("angry", (owner.x + about.x) / 2, Math.min(owner.y, about.y) - 22, owner.area);
    const oldLvl = relLevel(old), newLvl = relLevel(now);
    if (oldLvl !== newLvl) {
      if (newLvl === "friends" && delta > 0) logEvent(owner.name + " and " + about.name + " became friends!");
      else if (newLvl === "best friends") logEvent(owner.name + " and " + about.name + " are best friends now!");
      else if (newLvl === "rivals") logEvent(owner.name + " and " + about.name + " became rivals...");
    }
  }
  function relBoth(a, b, delta, reason) { changeRel(a, b, delta, reason + " " + b.name); changeRel(b, a, delta, reason + " " + a.name); }
  function bestFriend(a) { let best = null, bv = -1e9; for (const b of actives) if (b !== a && rel(a, b) > bv) { bv = rel(a, b); best = b; } return best && bv >= 10 ? { who: best, v: bv } : null; }
  function worstRel(a) { let worst = null, wv = 1e9; for (const b of actives) if (b !== a && rel(a, b) < wv) { wv = rel(a, b); worst = b; } return worst && wv < -10 ? { who: worst, v: wv } : null; }

  /* ==========================================================================
     10. DOM layers: name labels, dialogue bubbles, floating text, event log
     ========================================================================== */
  const labelsEl = document.getElementById("labels");
  const fxEl = document.getElementById("fx");
  const eventlogEl = document.getElementById("eventlog");

  function worldToScreen(x, y) {
    return { x: canvasRect.left + (x / VW) * canvasRect.width, y: canvasRect.top + (y / VH) * canvasRect.height };
  }

  function buildLabelFor(ent) {
    const el = document.createElement("div");
    el.className = "label " + (ent.simple ? "npc" : ent.active ? "active" : "dormant");
    el.textContent = ent.name;
    el.style.fontSize = labelFontSize + "px";
    labelsEl.appendChild(el);
    ent.labelEl = el;
  }
  function buildLabels() { for (const a of agents) buildLabelFor(a); for (const v of villagers) buildLabelFor(v); }
  function updateLabels() {
    labelsEl.style.display = panelOpen ? "none" : "block";
    if (panelOpen) return;
    for (const ent of allPeople()) {
      if (!ent.labelEl) continue;
      // inside a building? no floating text — the roof badge says it better
      if (ent.area !== viewArea || ent.inside) { ent.labelEl.style.display = "none"; continue; }
      // NPC names stay tucked away unless you point at them (or ping them)
      if (ent.simple && hovered !== ent && !(ent.pingT > 0)) { ent.labelEl.style.display = "none"; continue; }
      ent.labelEl.style.display = "block";
      const p = worldToScreen(ent.x, ent.y - ent.sh - 6);
      ent.labelEl.style.left = Math.round(p.x) + "px";
      ent.labelEl.style.top = Math.round(p.y) + "px";
      ent.labelEl.classList.toggle("hover", hovered === ent);
      const downed = ent.state === "ko";
      const want = downed ? ent.name + " · DOWNED" : ent.name;
      if (ent.labelEl.textContent !== want) ent.labelEl.textContent = want;
      ent.labelEl.classList.toggle("downed", downed);
    }
  }

  // floating action text ("+ rabbit meat", damage numbers, "Dinner's ready!")
  const floats = [];
  function floatText(x, y, text, color, area, big) {
    if (floats.length > 24) { const f = floats.shift(); f.el.remove(); }
    const el = document.createElement("div");
    el.className = "float" + (big ? " big" : ""); el.textContent = text; el.style.color = color || "#fff";
    fxEl.appendChild(el);
    floats.push({ el, x, y, area: area || "town", life: big ? 2 : 1.5 });
  }

  // dialogue bubbles — one per speaker, fade out after a moment
  function say(a, text, dur = 2.8) {
    if (!text || !a) return;
    if (a.bubbleEl) a.bubbleEl.remove();
    const el = document.createElement("div");
    el.className = "bubble"; el.textContent = text;
    fxEl.appendChild(el);
    a.bubbleEl = el; a.bubbleT = dur;
  }
  const pendingSays = [];   // delayed chat replies: {agent, text, delay}

  function updateFx(dt) {
    fxEl.style.display = panelOpen ? "none" : "block";
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.y -= 11 * dt; f.life -= dt;
      if (f.life <= 0) { f.el.remove(); floats.splice(i, 1); continue; }
      if (f.area !== viewArea) { f.el.style.display = "none"; continue; }
      f.el.style.display = "block";
      const p = worldToScreen(f.x, f.y);
      f.el.style.left = Math.round(p.x) + "px"; f.el.style.top = Math.round(p.y) + "px";
      f.el.style.opacity = Math.min(1, f.life);
    }
    for (const a of allPeople()) {
      if (!a.bubbleEl) continue;
      a.bubbleT -= dt;
      if (a.bubbleT <= 0) { a.bubbleEl.remove(); a.bubbleEl = null; continue; }
      if (a.area !== viewArea) { a.bubbleEl.style.display = "none"; continue; }
      a.bubbleEl.style.display = "block";
      const p = worldToScreen(a.x, a.y - a.sh - 18);
      a.bubbleEl.style.left = Math.round(p.x) + "px"; a.bubbleEl.style.top = Math.round(p.y) + "px";
      a.bubbleEl.style.opacity = Math.min(1, a.bubbleT / 0.5);
    }
    for (let i = pendingSays.length - 1; i >= 0; i--) {
      const ps = pendingSays[i];
      ps.delay -= dt;
      if (ps.delay <= 0) { say(ps.agent, ps.text); pendingSays.splice(i, 1); }
    }
  }

  // town event log (bottom-left, last 6 lines)
  let lastLogText = "", lastLogTime = -99;
  const logCDs = {};
  function logEvent(text) {
    const t = lastNow / 1000;
    if (text === lastLogText && t - lastLogTime < 6) return;
    lastLogText = text; lastLogTime = t;
    const el = document.createElement("div");
    el.className = "ev"; el.textContent = text;
    eventlogEl.appendChild(el);
    while (eventlogEl.children.length > 6) eventlogEl.removeChild(eventlogEl.firstChild);
    for (let i = 0; i < eventlogEl.children.length - 2; i++) eventlogEl.children[i].classList.add("old");
  }
  function maybeLog(key, text, cd = 20) {
    const t = lastNow / 1000;
    if ((logCDs[key] || -999) + cd > t) return;
    logCDs[key] = t; logEvent(text);
  }

  /* ==========================================================================
     11. Canvas particles (hearts, sparks, slashes, poofs, embers, ripples...)
     ========================================================================== */
  const parts = [];
  function addPart(type, x, y, area) {
    const life = type === "slash" ? 0.22 : type === "spark" ? 0.3 : type === "rustle" ? 0.35 : 1.1;
    parts.push({
      type, x, y, area: area || "town", life, maxLife: life,
      vy: type === "heart" ? -9 : type === "smoke" ? -7 : type === "spark" ? (Math.random() - 0.5) * 40 : type === "rustle" ? -14 : -4,
      vx: type === "spark" ? (Math.random() - 0.5) * 50 : (Math.random() - 0.5) * 6,
    });
  }
  function poof(x, y, area) { for (let i = 0; i < 4; i++) { const life = 0.5 + Math.random() * 0.3; parts.push({ type: "poof", x: x + (Math.random() * 8 - 4), y: y + (Math.random() * 6 - 3), area: area || "town", life, maxLife: life, vy: -6, vx: (Math.random() - 0.5) * 10 }); } }
  // every solid hit DRAWS BLOOD: red droplets arc out under gravity, and a few
  // pixels chip clean off the victim (their own colours) and tumble away
  function gore(x, y, area, chipCol, n) {
    for (let i = 0; i < n; i++) {
      const blood = Math.random() < 0.65 || !chipCol;
      const life = 0.55 + Math.random() * 0.4;
      parts.push({
        type: blood ? "blood" : "chip", col: chipCol,
        x: x + (Math.random() * 8 - 4), y: y - 2 - Math.random() * 8,
        area, life, maxLife: life,
        vx: (Math.random() - 0.5) * 64, vy: -22 - Math.random() * 38, g: 170,
      });
    }
  }

  /* ---- lingering magic residue: spells leave their mark on the world ------
     fireballs scorch the ground (smoldering, flickering embers), smites leave
     a patch of twinkling holy light — both fade out over several seconds */
  const residues = [];
  function addResidue(type, x, y, area, dur) {
    if (residues.length > 20) residues.shift();
    residues.push({ type, x, y, area, life: dur, maxLife: dur });
  }
  function updateResidues(dt) {
    for (let i = residues.length - 1; i >= 0; i--) {
      const r = residues[i];
      r.life -= dt;
      if (r.life <= 0) { residues.splice(i, 1); continue; }
      const fr = r.life / r.maxLife;
      if (r.type === "scorch") {
        // the patch smolders: stray embers + wisps of smoke while it's fresh
        if (Math.random() < dt * 6 * fr) addPart("ember", r.x + (Math.random() * 10 - 5), r.y - Math.random() * 3, r.area);
        if (Math.random() < dt * 2 * fr) addPart("smoke", r.x + (Math.random() * 6 - 3), r.y - 4, r.area);
      } else {
        // holy ground breathes out slow rising motes
        if (Math.random() < dt * 5 * fr) parts.push({ type: "lightmote", x: r.x + (Math.random() * 12 - 6), y: r.y - Math.random() * 4, area: r.area, life: 0.9, maxLife: 0.9, vx: (Math.random() - 0.5) * 4, vy: -8 - Math.random() * 6 });
      }
    }
  }
  /* ---- physics debris: smashed shacks burst into tumbling planks ---------- */
  const debris = [];
  const SHACK_COLS = ["#9c7445", "#7c5a36", "#b88a55", "#5e4026", "#a07c4d"];
  function spawnDebris(x, y, n, big) {
    for (let i = 0; i < n; i++) {
      if (debris.length > 80) debris.shift();
      debris.push({
        x: x + (Math.random() * 16 - 8), y: y - 6 - Math.random() * 14,
        vx: (Math.random() - 0.5) * (big ? 90 : 55), vy: -50 - Math.random() * (big ? 80 : 40),
        groundY: y + (Math.random() * 8 - 2),
        col: pick(SHACK_COLS), w: Math.random() < 0.4 ? 3 : 2, h: Math.random() < 0.5 ? 1 : 2,
        rest: false, life: 9 + Math.random() * 5, area: arguments[4] || "town",
      });
    }
  }
  function updateDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      if (!d.rest) {
        d.vy += 180 * dt;             // gravity
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.y >= d.groundY && d.vy > 0) {
          if (Math.abs(d.vy) < 24) { d.rest = true; d.y = d.groundY; }   // settled
          else { d.vy = -d.vy * 0.45; d.vx *= 0.6; }                     // bounce!
        }
      } else d.life -= dt;
      if (d.life <= 0) debris.splice(i, 1);
    }
  }
  function drawDebris() {
    for (const d of debris) {
      if (d.area !== viewArea) continue;
      ctx.globalAlpha = clamp(d.life / 2, 0, 1);
      ctx.fillStyle = d.col;
      ctx.fillRect(Math.round(d.x), Math.round(d.y), d.w, d.h);
    }
    ctx.globalAlpha = 1;
  }

  /* ---- shack damage & rebuild ---------------------------------------------- */
  function shackDamage(s, dmg, e) {
    if (s.hp <= 0) return;
    s.hp = Math.max(0, s.hp - dmg);
    s.hitT = 0.2;
    spawnDebris(s.x, s.by, 3, false, s.area);   // splinters fly on every hit
    floatText(s.x, s.by - 26, "-" + dmg, "#d9a05c", s.area);
    if (s.hp <= 0 && s.state !== "rubble") {
      s.state = "rubble";
      spawnDebris(s.x, s.by - 6, s.key ? 24 : 16, true, s.area);   // the whole thing comes down
      poof(s.x, s.by - 8, s.area);
      logEvent("A " + (e ? e.kind : "monster") + " smashed the " + s.name.toLowerCase() + "!");
      // anyone sheltering inside gets thrown out into the night
      if (s.key) {
        for (const a of actives) {
          if (a.insideKey === s.key) {
            a.inside = false; a.insideKey = null;
            poof(a.x, a.y - 6, a.area);
            a.stats.health = Math.max(1, a.stats.health - 6);
            floatText(a.x, a.y - a.sh - 6, "Thrown out!", "#ff8a8a", a.area);
            startFlee(a);
          }
        }
        for (const v of villagers) {
          if (v.inside && v.insideKey === s.key) {
            v.inside = false; v.insideSleep = false;
            poof(v.x, v.y - 6, v.area);
            v.hp = Math.max(1, v.hp - 5);
            floatText(v.x, v.y - v.sh - 6, "Thrown out!", "#ff8a8a", v.area);
            const hm = villagerHome(v);
            v.state = "flee"; v.goal = { x: hm[0], y: hm[1], sleepy: true };
            say(v, "My house!");
          }
        }
      }
      const sp = pick(actives);
      if (sp.area === s.area) say(sp, pick(["The roof!", "They're wrecking the town!", "We'll rebuild it tomorrow..."]));
      if (!anyHomeStanding()) logEvent("Nothing left standing... everyone, to the square!");
    }
  }
  function updateShacks(dt) {
    for (const s of allStructs()) s.hitT = Math.max(0, s.hitT - dt);   // EVERY building settles after a hit (houses used to shake forever)
  }

  function drawResidues(t) {
    for (const r of residues) {
      if (r.area !== viewArea) continue;
      const fr = r.life / r.maxLife;
      const x = Math.round(r.x), y = Math.round(r.y);
      if (r.type === "scorch") {
        // charred blotch (fixed pixels) + flickering live embers
        ctx.globalAlpha = 0.5 * fr + 0.15;
        ctx.fillStyle = "#2c2018";
        for (let k = 0; k < 7; k++) {
          const ox = ((hash2(x + k * 7, y) * 12) | 0) - 6, oy = ((hash2(y + k * 11, x) * 7) | 0) - 3;
          ctx.fillRect(x + ox, y + oy, 2, 1);
        }
        if (fr > 0.15) {
          ctx.globalAlpha = fr;
          for (let k = 0; k < 3; k++) {
            if (Math.random() < 0.55) continue;   // the flicker
            const ox = ((hash2(x + k * 13, y + k) * 10) | 0) - 5, oy = ((hash2(y + k * 5, x + k) * 5) | 0) - 2;
            ctx.fillStyle = Math.random() < 0.5 ? "#e8702a" : "#f2b441";
            ctx.fillRect(x + ox, y + oy, 1, 1);
          }
        }
        ctx.globalAlpha = 1;
      } else if (r.type === "crack") {
        // EARTHSHATTER's signature: jagged fissures, fading as the earth settles
        ctx.globalAlpha = 0.65 * fr + 0.1;
        ctx.fillStyle = "#241a12";
        for (const s of r.segs || []) {
          const steps = Math.max(Math.abs(s[2] - s[0]), Math.abs(s[3] - s[1])) || 1;
          for (let i = 0; i <= steps; i++) ctx.fillRect(Math.round(s[0] + (s[2] - s[0]) * i / steps), Math.round(s[1] + (s[3] - s[1]) * i / steps), 1, 1);
        }
        ctx.globalAlpha = 0.3 * fr;
        ctx.fillStyle = "#4a3828";
        for (const s of r.segs || []) ctx.fillRect(s[0], s[1] + 1, 2, 1);
        ctx.globalAlpha = 1;
      } else {
        // a ring of golden twinkles, each winking on its own rhythm
        for (let k = 0; k < 8; k++) {
          const ang = k / 8 * 6.283 + hash2(x, k) * 0.8;
          const rad = 3 + hash2(k, y) * 5;
          const tw = Math.sin(t / 140 + k * 1.9 + hash2(x + k, y) * 6.28);
          if (tw < 0.1) continue;   // the twinkle
          ctx.globalAlpha = tw * fr;
          ctx.fillStyle = k % 2 ? "#ffe9a8" : "#fff7ea";
          ctx.fillRect(x + Math.round(Math.cos(ang) * rad), y + Math.round(Math.sin(ang) * rad * 0.55), 1, 1);
        }
        ctx.globalAlpha = 0.06 * fr;
        disc(ctx, x, y, 7, "#ffe9a8");   // the faint warm pool of light
        ctx.globalAlpha = 1;
      }
    }
  }
  function sparkBurst(x, y, area) { for (let i = 0; i < 5; i++) addPart("spark", x, y, area); }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.g) p.vy += p.g * dt;   // blood and chips obey gravity
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
  }
  function drawParts() {
    for (const p of parts) {
      if (p.area !== viewArea) continue;
      const x = Math.round(p.x), y = Math.round(p.y);
      ctx.globalAlpha = clamp(p.life / (p.maxLife || 1), 0, 1);
      if (p.type === "heart") { ctx.fillStyle = "#e8556a"; ctx.fillRect(x, y, 1, 1); ctx.fillRect(x + 2, y, 1, 1); ctx.fillRect(x, y + 1, 3, 1); ctx.fillRect(x + 1, y + 2, 1, 1); }
      else if (p.type === "angry") { ctx.fillStyle = "#e8556a"; ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); ctx.fillRect(x, y, 1, 1); ctx.fillRect(x - 1, y + 1, 1, 1); ctx.fillRect(x + 1, y + 1, 1, 1); }
      else if (p.type === "slash") { ctx.fillStyle = "#fff7ea"; ctx.fillRect(x - 2, y + 1, 2, 1); ctx.fillRect(x, y, 2, 1); ctx.fillRect(x + 2, y - 1, 2, 1); }
      else if (p.type === "spark") { ctx.fillStyle = Math.random() < 0.5 ? "#ffd166" : "#fff7ea"; ctx.fillRect(x, y, 1, 1); }
      else if (p.type === "poof") { ctx.fillStyle = "#cfc9bd"; ctx.fillRect(x, y, 2, 2); }
      else if (p.type === "ember") { ctx.fillStyle = Math.random() < 0.5 ? "#e8702a" : "#f2b441"; ctx.fillRect(x, y, 1, 1); }
      else if (p.type === "smoke") {
        // a winding column that widens, drifts and dissolves into specks
        const age = 1 - p.life / (p.maxLife || 1);
        const wob = Math.round(Math.sin(age * 5.5 + p.x * 0.6) * (1 + age * 2.5));
        ctx.fillStyle = "rgba(205,205,215," + (0.5 * (1 - age * 0.55)).toFixed(2) + ")";
        if (age < 0.45) ctx.fillRect(x + wob, y, 2, 2);
        else if (age < 0.75) { ctx.fillRect(x + wob, y, 2, 1); ctx.fillRect(x - wob, y - 2, 1, 1); }
        else { ctx.fillRect(x + wob, y, 1, 1); if (Math.random() < 0.6) ctx.fillRect(x - wob, y - 3, 1, 1); }
      }
      else if (p.type === "rustle") { ctx.fillStyle = Math.random() < 0.5 ? C.grassD : C.grassL; ctx.fillRect(x, y, 1, 2); }
      else if (p.type === "heal") {
        // sprouts as a dot at the ground, unfolds into a full plus as it rises
        const age = 1 - p.life / (p.maxLife || 1);
        ctx.fillStyle = age < 0.5 ? "#7ae0a0" : "#a8f0c0";
        if (age < 0.2) ctx.fillRect(x, y, 1, 1);
        else if (age < 0.45) { ctx.fillRect(x, y - 1, 1, 3); ctx.fillRect(x - 1, y, 3, 1); }
        else { ctx.fillRect(x, y - 2, 1, 5); ctx.fillRect(x - 2, y, 5, 1); }
      }
      else if (p.type === "glint") { ctx.fillStyle = Math.random() < 0.5 ? "#ffe9a8" : "#f2b8d0"; ctx.fillRect(x, y, 1, 1); }
      else if (p.type === "blood") { ctx.fillStyle = Math.random() < 0.5 ? "#a8232a" : "#7e1820"; ctx.fillRect(x, y, p.life > 0.4 ? 2 : 1, 1); }
      else if (p.type === "chip") { ctx.fillStyle = p.col || "#8a8276"; ctx.fillRect(x, y, 2, p.life > 0.35 ? 2 : 1); }
      else if (p.type === "dazzle") {   // a blinding little star, spinning off the smitten
        ctx.fillStyle = Math.random() < 0.5 ? "#ffffff" : "#ffe9a8";
        ctx.fillRect(x, y - 1, 1, 3); ctx.fillRect(x - 1, y, 3, 1);
      }
      else if (p.type === "note") {     // ♪ — a sung syllable of the spell
        ctx.fillStyle = Math.random() < 0.5 ? "#fff7ea" : "#ffd166";
        ctx.fillRect(x + 1, y - 3, 1, 4);   // stem
        ctx.fillRect(x, y, 2, 2);           // note head
        ctx.fillRect(x + 2, y - 3, 1, 1);   // little flag
      }
      else if (p.type === "petal") {    // a drifting flower petal (druid magic)
        ctx.fillStyle = Math.random() < 0.5 ? "#f2b8d0" : "#ffd9e8";
        const sway = Math.round(Math.sin((p.maxLife - p.life) * 7 + p.x) * 1.5);
        ctx.fillRect(x + sway, y, 2, 1); ctx.fillRect(x + sway, y - 1, 1, 1);
      }
      else if (p.type === "star") {     // a fat stun star above a rung skull
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(x, y - 2, 1, 5); ctx.fillRect(x - 2, y, 5, 1);
        ctx.fillStyle = "#fff7ea"; ctx.fillRect(x, y, 1, 1);
      }
      else if (p.type === "wave") {   // a bright expanding shockwave ring
        const r = Math.round((1 - p.life / p.maxLife) * (p.sp || 16)) + 2;
        ctx.fillStyle = Math.random() < 0.5 ? "#fff7ea" : "#ffe9a8";
        for (let k = 0; k < 14; k++) {
          const ang = k / 14 * 6.283;
          ctx.fillRect(x + Math.round(Math.cos(ang) * r), y + Math.round(Math.sin(ang) * r * 0.55), 1, 1);
        }
      }
      else if (p.type === "lightmote") { ctx.fillStyle = Math.random() < 0.6 ? "#fff7ea" : "#ffe9a8"; ctx.fillRect(x, y, 1, 1); if (p.life > 0.4) ctx.fillRect(x, y - 1, 1, 1); }
      else if (p.type === "pop") { ctx.fillStyle = p.col || "#ffd166"; ctx.fillRect(x, y, 2, 2); }
      else if (p.type === "frost") { ctx.fillStyle = Math.random() < 0.5 ? "#bfe6f5" : "#e8f6ff"; ctx.fillRect(x, y, 1, 1); }
      else if (p.type === "swordarc") {
        // a great two-handed sweep with ghostly afterimages (rank 3+: GREATER ARC)
        const pr = 1 - p.life / p.maxLife;
        const reach = p.big ? 20 : 15;
        const baseA = (-1.2 + pr * 2.1) * (p.dir || 1);
        for (let g2 = 0; g2 < 3; g2++) {
          const ang = baseA - g2 * 0.4 * (p.dir || 1);
          ctx.globalAlpha = (1 - pr * 0.4) * (g2 === 0 ? 1 : 0.4 - g2 * 0.12);
          for (let i = 5; i <= reach; i++) {
            ctx.fillStyle = g2 === 0 ? (i > reach - 2 ? "#ffffff" : "#cfd8e8") : "#aebad0";
            ctx.fillRect(x + Math.round(Math.cos(ang) * i) * (p.dir || 1), y + Math.round(Math.sin(ang) * i * 0.8), 1, 1);
          }
        }
        ctx.globalAlpha = 1;
      }
      else if (p.type === "ripple") { const r = Math.round((1 - p.life / p.maxLife) * 4) + 1; ctx.fillStyle = C.waterS; ctx.fillRect(x - r, y, 1, 1); ctx.fillRect(x + r, y, 1, 1); ctx.fillRect(x, y - (r >> 1), 1, 1); ctx.fillRect(x, y + (r >> 1), 1, 1); }
      else if (p.type === "splash") { ctx.fillStyle = "rgba(190,215,255,0.85)"; ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x, y - 1, 1, 1); }
    }
    ctx.globalAlpha = 1;
  }

  /* ==========================================================================
     12. Inventory & cooking
     ========================================================================== */
  function addItem(a, k, n) { a.inv[k] = (a.inv[k] || 0) + n; }
  function removeItem(a, k, n) { a.inv[k] = Math.max(0, (a.inv[k] || 0) - n); if (!a.inv[k]) delete a.inv[k]; }
  function invText(a) {
    const bits = Object.keys(a.inv).filter(k => a.inv[k] > 0).map(k => FOODS[k].label + " x" + a.inv[k]);
    return bits.length ? bits.join(", ") : "empty";
  }
  function bestFoodKey(a) {
    for (const k of COOKED_ORDER) if (a.inv[k]) return k;
    if (a.inv.berries) return "berries";
    if (a.stats.hunger < 18) for (const k of [...VEGGIES, ...RAW_MEATS]) if (a.inv[k]) return k;
    return null;
  }
  function cookables(a) { return Object.keys(a.inv).filter(k => a.inv[k] > 0 && FOODS[k].cooksInto); }
  function cookedCount(a) { return COOKED_ORDER.reduce((s, k) => s + (a.inv[k] || 0), 0); }
  function rawMeatCount(a) { return RAW_MEATS.reduce((s, k) => s + (a.inv[k] || 0), 0); }
  function cookBatch(a) {
    const meat = RAW_MEATS.find(k => a.inv[k]);
    const veg = VEGGIES.find(k => a.inv[k]);
    if (meat && veg) {
      removeItem(a, meat, 1); removeItem(a, veg, 1); addItem(a, "stew", 1);
      floatText(a.x, a.y - a.sh - 6, "Made stew!", "#ffe9a8", a.area);
      maybeLog("stew", a.name + " made a hearty stew at the campfire.");
      grantXP(a, 3);
      return true;
    }
    if (meat) { removeItem(a, meat, 1); addItem(a, FOODS[meat].cooksInto, 1); floatText(a.x, a.y - a.sh - 6, "Dinner's ready!", "#ffe9a8", a.area); maybeLog("cooked", a.name + " cooked " + FOODS[FOODS[meat].cooksInto].label + "."); return true; }
    if (veg) { removeItem(a, veg, 1); addItem(a, "cooked_veg", 1); floatText(a.x, a.y - a.sh - 6, "Roast veggies!", "#ffe9a8", a.area); return true; }
    return false;
  }

  /* ==========================================================================
     13. Wildlife — lively rabbits hop in bursts, deer trot and keep distance.
         Both areas have their own animals; hunting stays cute (poof + respawn).
     ========================================================================== */
  const ANIMAL_DEFS = {
    rabbit: { speed: 30, fleeR: 44, catch: 0.45, meat: "raw_rabbit", respawn: [22, 40] },
    deer:   { speed: 22, fleeR: 50, catch: 0.7,  meat: "raw_deer",   respawn: [40, 70] },
  };
  const animals = [];
  function huntSpot(areaKey) {
    const z = AREAS[areaKey].hunt;
    return { x: z.x + 12 + Math.random() * (z.w - 24), y: Math.max(54, z.y + 10) + Math.random() * (z.h - 24) };
  }
  for (const [areaKey, counts] of [["town", { rabbit: 3, deer: 2 }], ["route", { rabbit: 3, deer: 2 }], ["deepwood", { rabbit: 1, deer: 3 }], ["lake", { rabbit: 3 }]]) {
    for (const kind in counts) for (let i = 0; i < counts[kind]; i++) {
      const p = huntSpot(areaKey);
      animals.push({ kind, def: ANIMAL_DEFS[kind], area: areaKey, x: p.x, y: p.y, tx: p.x, ty: p.y, state: "wander", wanderT: Math.random() * 2, hopT: 0, fleeT: 0, respawnT: 0, facing: 1, phase: Math.random() * 6.28, mini: MINI_ANIMAL[kind] ? MINI_ANIMAL[kind]() : null });
    }
  }
  function animalsAlive(areaKey) { return animals.some(an => an.state !== "gone" && (!areaKey || an.area === areaKey)); }
  function nearestAnimal(a) {
    let best = null, bd = 1e9;
    for (const an of animals) { if (an.state === "gone" || an.area !== a.area) continue; const d = dist(a.x, a.y, an.x, an.y); if (d < bd) { bd = d; best = an; } }
    return best;
  }
  function updateAnimals(dt) {
    for (const an of animals) {
      if (an.state === "gone") {
        an.respawnT -= dt;
        if (an.respawnT <= 0) { const p = huntSpot(an.area); an.x = p.x; an.y = p.y; an.state = "wander"; an.wanderT = 1; }
        continue;
      }
      // spook check — flee the nearest active agent that gets too close
      let threat = null, td = 1e9;
      for (const a of actives) { if (a.state === "ko" || a.inside || a.area !== an.area) continue; const d = dist(a.x, a.y, an.x, an.y); if (d < td) { td = d; threat = a; } }
      if (threat && td < an.def.fleeR) {
        an.state = "flee"; an.fleeT = 0.9 + Math.random() * 0.5;
        const ux = (an.x - threat.x) / (td || 1), uy = (an.y - threat.y) / (td || 1);
        let px = ux, py = uy;
        if (an.kind === "rabbit") { const s = Math.random() < 0.5 ? 1 : -1; px += -uy * 0.8 * s; py += ux * 0.8 * s; } // rabbits dodge sideways
        const sp = an.def.speed * 1.6;
        an.vx = px * sp; an.vy = py * sp;
      }
      if (an.state === "flee") {
        an.fleeT -= dt;
        an.x += an.vx * dt; an.y += an.vy * dt;
        an.phase += dt * 14;
        if (an.fleeT <= 0) { an.state = "wander"; an.wanderT = 0.4; }
      } else {
        an.wanderT -= dt;
        if (an.wanderT <= 0) {
          const p = huntSpot(an.area); an.tx = p.x; an.ty = p.y;
          an.wanderT = 0.9 + Math.random() * 2.2;   // restless: re-pick often
        }
        const d = dist(an.x, an.y, an.tx, an.ty);
        // rabbits move in quick hop-bursts; deer trot steadily
        an.hopT -= dt;
        const bursting = an.kind !== "rabbit" || an.hopT > 0 || (an.hopT < -0.5 && (an.hopT = 0.3) > 0);
        if (d > 4 && bursting) {
          const sp = an.def.speed * (an.kind === "rabbit" ? 0.9 : 0.55);
          an.vx = (an.tx - an.x) / d * sp; an.vy = (an.ty - an.y) / d * sp;
          an.x += an.vx * dt; an.y += an.vy * dt;
          an.phase += dt * (an.kind === "rabbit" ? 12 : 7);
        } else { an.vx = an.vy = 0; }
      }
      if (Math.abs(an.vx) > 1) an.facing = an.vx < 0 ? -1 : 1;
      // grass rustle when scurrying through the tall grass
      if ((Math.abs(an.vx) + Math.abs(an.vy)) > 6 && inTallGrass(an.area, an.x, an.y) && Math.random() < dt * 7) addPart("rustle", an.x + (Math.random() * 6 - 3), an.y - 2, an.area);
      // soft-pull back toward the hunting zone, hard clamp to where agents can
      // actually reach (agents clamp at y>=44, catch range is 9)
      const z = AREAS[an.area].hunt;
      an.x = clamp(an.x, z.x - 26, z.x + z.w + 26);
      an.y = clamp(an.y, 50, z.y + z.h + 30);
    }
  }

  /* ==========================================================================
     14. Night enemies — D&D stat blocks, knockback, hit-flash. They creep out
         of the dark forest edges (both areas) and burn away at sunrise.
     ========================================================================== */
  const ENEMY_TYPES = {
    zombie: { hp: 62, speed: 11, cd: 1.3, ac: 8,  atk: 1, die: 6, dmgBonus: 1, initMod: -1 },
    demon:  { hp: 44, speed: 24, cd: 0.9, ac: 13, atk: 4, die: 8, dmgBonus: 2, initMod: 3 },
  };
  const enemies = [];
  function spawnEnemy(areaKey, pt, manual) {
    const kind = (danger >= 2 && Math.random() < 0.3) ? "demon" : "zombie";
    const r = Math.random();
    const area = areaKey || (r < 0.4 ? "town" : r < 0.68 ? "route" : r < 0.92 ? "deepwood" : "lake");
    const s = pt || pick(AREAS[area].enemySpawns);
    const def = ENEMY_TYPES[kind];
    const init = d20() + def.initMod;
    enemies.push({
      kind, def, area, hp: def.hp, maxhp: def.hp,
      x: s[0] + (Math.random() * 18 - 9), y: s[1] + (Math.random() * 12 - 6),
      cd: 1 + Math.random(), cdScaled: def.cd * clamp(1.25 - init * 0.02, 0.7, 1.3),
      init, burnT: 0, disT: 0, facing: 1, phase: Math.random() * 6.28,
      kbx: 0, kby: 0, flashT: 0, lungeT: 0,
      manual: !!manual,   // button-summoned monsters don't fear the daylight
    });
  }
  function burnAll() {
    let any = false;
    for (const e of enemies) if (e.burnT <= 0 && !(e.disT > 0) && !e.manual) { e.burnT = 0.9; any = true; }
    if (any) {
      logEvent("The sun is rising. Enemies retreat!");
      for (const a of actives) a.stats.mood = clamp(a.stats.mood + 5, 0, 100);
    }
  }
  function nearestEnemy(x, y, maxD, areaKey) {
    let best = null, bd = maxD;
    for (const e of enemies) { if (e.hp <= 0 || e.burnT > 0 || (areaKey && e.area !== areaKey)) continue; const d = dist(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function hurtEnemy(e, dmg, src, crit, fx) {
    if (e.markedT > 0) dmg = Math.round(dmg * 1.25);   // weakness REVEALED by the Strategist
    e.hp -= dmg;
    floatText(e.x, e.y - 16, (crit ? "CRIT -" : "-") + dmg, crit ? "#ffd166" : classColor(src), e.area);
    addPart("slash", e.x, e.y - 8, e.area);
    sparkBurst(e.x, e.y - 8, e.area);
    gore(e.x, e.y - 6, e.area, e.kind === "demon" ? "#7e3a4a" : "#6a7a4a", crit ? 10 : 5);
    // the asset-pack hit flashes: every blow lands with a real animation
    if (fx === "slash" || fx === "wolf") playFX("slash", e.x, e.y - 10, e.area, crit ? 0.9 : 0.65, src && src.x > e.x);
    else if (fx === "fireball") playFX("impact_red", e.x, e.y - 8, e.area, crit ? 1.4 : 1);
    else if (fx === "ice") playFX("impact_blue", e.x, e.y - 8, e.area, 0.9);
    else if (fx === "smite") playFX("impact_purple", e.x, e.y - 8, e.area, crit ? 1.4 : 1);
    e.flashT = 0.12;
    if (fx === "fireball") { e.scorchT = 4; e.scorchSrc = src; }   // set alight: charred + smoldering
    if (fx !== "smite") {   // holy light pins them in place; steel knocks them back
      const kd = dist(src.x, src.y, e.x, e.y) || 1;
      e.kbx = (e.x - src.x) / kd * (crit ? 46 : 26); e.kby = (e.y - src.y) / kd * (crit ? 46 : 26);
    }
    if (e.hp <= 0) {
      nightKills++;
      if (resolveTree(src)) grantXP(src, 8 + Math.round(e.maxhp / 9));   // the kill feeds the killer's legend (townsfolk too)
      if (src.stats) src.stats.mood = clamp(src.stats.mood + 6, 0, 100);
      if (src.rel) for (const b of actives) {
        if (b !== src && b.state === "fight" && b.area === src.area && dist(src.x, src.y, b.x, b.y) < 70 && canRelEvent(src, b, 18)) relBoth(src, b, 10, "Fought beside");
      }
      if (fx === "smite") {
        // a holy death: bright expanding waves + the body disintegrates into light
        e.disT = 0.9; e.kbx = e.kby = 0;
        for (const sp of [30, 18]) parts.push({ type: "wave", x: e.x, y: e.y - 5, area: e.area, life: 0.6, maxLife: 0.6, vx: 0, vy: 0, sp });
        for (let k = 0; k < 12; k++) parts.push({ type: "lightmote", x: e.x + (Math.random() * 14 - 7), y: e.y - Math.random() * 16, area: e.area, life: 0.6 + Math.random() * 0.4, maxLife: 1, vx: (Math.random() - 0.5) * 8, vy: -16 - Math.random() * 10 });
        logEvent(src.name + " smote a " + e.kind + " with holy light!");
      } else {
        e.burnT = 0.7;
        poof(e.x, e.y - 6, e.area);
        logEvent(src.name + " defeated a " + e.kind + "!");
      }
    }
  }

  /* ---- Suni's holy smite: light gathers over the target, then a blinding
         column crashes down from the sky and resolves its attack roll ------- */
  const smites = [];
  function castSmite(a, e, rank) {
    smites.push({ target: e, owner: a, area: a.area, t: 0, struck: false, x: e.x, y: e.y, rank: rank || 2 });
    a.facing = e.x < a.x ? -1 : 1;
    if (Math.random() < 0.5) say(a, pick(CHATTER.smite));
  }
  function updateSmites(dt) {
    for (let i = smites.length - 1; i >= 0; i--) {
      const s = smites[i];
      s.t += dt;
      if (!s.struck && (!s.target || s.target.hp <= 0 || s.target.burnT > 0)) {
        // a delayed echo beam that lost its mark hunts for another sinner nearby
        const nxt = s.mini ? nearestEnemy(s.x, s.y, 80, s.area) : null;
        if (nxt) s.target = nxt; else { smites.splice(i, 1); continue; }
      }
      const e = s.target;
      if (!s.struck) {
        s.x = e.x; s.y = e.y;   // the mark tracks its target until the strike
        if (Math.random() < dt * 26) parts.push({ type: "lightmote", x: e.x + (Math.random() * 12 - 6), y: e.y - 18 - Math.random() * 8, area: s.area, life: 0.4, maxLife: 0.4, vx: 0, vy: 10 });
        if (s.t >= 0.3) {
          s.struck = true;
          const a = s.owner;
          const roll = d20();
          sparkBurst(s.x, s.y - 6, s.area);
          for (const sp2 of (s.mini ? [12] : [14, 24])) parts.push({ type: "wave", x: s.x, y: s.y - 2, area: s.area, life: 0.5, maxLife: 0.5, vx: 0, vy: 0, sp: sp2 });
          addResidue("holy", s.x, s.y, s.area, (s.mini ? 6 : 12) + Math.random() * 5);   // hallowed ground lingers, twinkling
          const rk = s.rank || 2;
          if (!s.mini) {   // the great beam calls down a VOLLEY of echo beams (more per rank)
            const n = 1 + Math.ceil(rk / 2);
            for (let k = 0; k < n; k++) {
              const others = enemies.filter(q => q !== e && q.hp > 0 && q.burnT <= 0 && !(q.disT > 0) && q.area === s.area && dist(q.x, q.y, s.x, s.y) < 80);
              const t2 = others.length ? others[k % others.length] : e;
              smites.push({ target: t2, owner: a, area: s.area, t: -0.06 - k * 0.13, struck: false, mini: true, x: t2.x, y: t2.y, rank: rk });
            }
          }
          if (roll === 1 || (roll !== 20 && roll + 2 + mod(a.dnd.wis) + (a.inspired ? 1 : 0) < e.def.ac)) {
            floatText(e.x, e.y - 16, "Miss!", "#cfd8f2", e.area);
          } else {
            const crit = roll === 20;
            const wis = Math.max(0, mod(a.dnd.wis));
            let dmg;
            if (s.mini) dmg = rollDice(8) + wis + (e.kind === "zombie" ? 1 : 0);   // each echo: d8 + WIS
            else { dmg = wis * 2 + (e.kind === "zombie" ? 2 : 0); for (let k = 0; k < 2 + Math.ceil(rk / 2); k++) dmg += rollDice(8); }   // THE beam: rank-scaled d8s
            dmg += (a.passiveSpellDmg || 0);
            if (crit) { dmg = Math.max(e.hp, dmg); floatText(e.x, e.y - 24, "JUDGEMENT!", "#fff7ea", e.area); }   // perfect light: one-shot
            hurtEnemy(e, Math.max(1, dmg), a, crit, "smite");
            if (e.hp > 0) {   // DAZZLED: blinded by glory — can't move, can't attack
              e.dazzleT = Math.max(e.dazzleT || 0, s.mini ? 2.5 : 3 + rk * 0.4);
              if (!s.mini) floatText(e.x, e.y - 30, "DAZZLED!", "#ffe9a8", e.area);
            }
            if (crit) logEvent(a.name + "'s holy light struck true — critical!");
          }
        }
      } else if (s.t > 0.62) smites.splice(i, 1);
    }
  }
  function drawSmites(t) {
    for (const s of smites) {
      if (s.area !== viewArea) continue;
      const x = Math.round(s.x), y = Math.round(s.y);
      if (!s.struck) {
        // light gathering above the marked monster
        const pr = clamp(s.t / 0.3, 0, 1);
        ctx.globalAlpha = 0.35 + 0.45 * pr;
        disc(ctx, x, y - 24 + Math.round(pr * 6), 1 + Math.round(pr * 2), "#ffe9a8");
        ctx.globalAlpha = 1;
      } else if (s.mini) {
        // an echo beam — slimmer, quicker, no less holy
        const fade = clamp(1 - (s.t - 0.3) / 0.26, 0, 1);
        ctx.globalAlpha = 0.2 * fade; ctx.fillStyle = "#ffe9a8"; ctx.fillRect(x - 3, 0, 7, y);
        ctx.globalAlpha = 0.55 * fade; ctx.fillStyle = "#fff3cf"; ctx.fillRect(x - 1, 0, 3, y);
        ctx.globalAlpha = 0.9 * fade; ctx.fillStyle = "#ffffff"; ctx.fillRect(x, 0, 1, y);
        ctx.globalAlpha = 0.45 * fade;
        disc(ctx, x, y - 1, 6, "#fff7ea");
        ctx.globalAlpha = 1;
      } else {
        // THE BEAM — a colossal pillar of light splitting the sky
        const fade = clamp(1 - (s.t - 0.3) / 0.32, 0, 1);
        ctx.globalAlpha = 0.14 * fade; ctx.fillStyle = "#fff7ea"; ctx.fillRect(x - 9, 0, 19, y);
        ctx.globalAlpha = 0.3 * fade; ctx.fillStyle = "#ffe9a8"; ctx.fillRect(x - 6, 0, 13, y);
        ctx.globalAlpha = 0.6 * fade; ctx.fillStyle = "#fff3cf"; ctx.fillRect(x - 3, 0, 7, y);
        ctx.globalAlpha = 0.97 * fade; ctx.fillStyle = "#ffffff"; ctx.fillRect(x - 1, 0, 3, y);
        ctx.globalAlpha = 0.6 * fade;
        disc(ctx, x, y - 1, 11, "#fff7ea");
        ctx.globalAlpha = 0.3 * fade;
        disc(ctx, x, y - 1, 16, "#ffe9a8");
        ctx.globalAlpha = 1;
      }
    }
  }
  // an agent's swing: d20 + attack bonus vs the enemy's AC. Nat 20 crits,
  // nat 1 fumbles. Inspiration (fighting near the Strategist) adds +1.
  function agentAttack(a, e) {
    a.lungeT = 0.16;
    const roll = d20();
    if (roll === 1) {
      floatText(a.x, a.y - a.sh - 4, "Crit fail!", "#ffb4a0", a.area);
      a.atkCD += 0.6;   // stumble
      return;
    }
    const crit = roll === 20;
    if (!crit && roll + a.atkBonus + (a.inspired ? 1 : 0) + (a.stratT > 0 ? 1 : 0) < e.def.ac) {
      floatText(e.x, e.y - 16, "Miss!", "#cfd8f2", e.area);
      return;
    }
    let dmg = rollDice(a.dmgDie) + Math.max(0, mod(a.dnd.str)) + (a.inspired ? 1 : 0) + (a.stratT > 0 ? 2 : 0) - (a.weakT > 0 ? 2 : 0);
    if (crit) dmg += rollDice(a.dmgDie);
    dmg = Math.max(1, dmg);
    hurtEnemy(e, dmg, a, crit);
    if (crit) { say(a, "Critical hit!"); logEvent(a.name + " rolled a natural 20 — critical hit!"); }
    else if (Math.random() < 0.3) floatText(a.x, a.y - a.sh - 4, "d20: " + roll + " hit!", "#fff2a0", a.area);
  }
  function attackCooldown(a) {
    return 0.85 * clamp(1.25 - a.initiative * 0.02, 0.6, 1.2) * (a.stats.energy < 35 ? 1.2 : 1);
  }

  /* ---- the Ranger's fireball: a real projectile that streaks across the
         field, trails embers, and resolves its attack roll on impact -------- */
  const projectiles = [];
  function castFireball(a, e, rank) {
    const r = rank || 2;
    a.facing = e.x < a.x ? -1 : 1;
    a.lungeT = 0.16;
    projectiles.push({ x: a.x + a.facing * 6, y: a.y - a.sh / 2, target: e, owner: a, area: a.area, sp: 105 + r * 8, life: 1.6, ph: Math.random() * 6.28, rank: r });
    if (Math.random() < 0.4) say(a, pick(["Fireball!", "Light 'em up!", "Catch!"]));
  }
  // the Knight special: a huge two-handed arc that takes HALF their health
  function heavySlash(a, e) {
    a.facing = e.x < a.x ? -1 : 1;
    a.lungeT = 0.16;
    parts.push({ type: "swordarc", x: a.x + a.facing * 5, y: a.y - 9, dir: a.facing, area: a.area, life: 0.3, maxLife: 0.3, vx: 0, vy: 0 });
    const roll = d20();
    const atk = a.atkBonus || 2;
    if (roll === 1 || (roll !== 20 && roll + atk < e.def.ac)) { floatText(e.x, e.y - 16, "Miss!", "#cfd8f2", e.area); return; }
    const crit = roll === 20;
    let dmg = Math.round(e.maxhp * 0.4) + rollDice(8) + rankOf(a, "npc_slash") * 2;   // ~half their health, plus training
    if (crit) dmg += Math.round(e.maxhp * 0.25);
    hurtEnemy(e, dmg, a, crit, "slash");
    e.kbx *= 1.7; e.kby *= 1.7;   // sent flying
    sparkBurst(e.x, e.y - 8, e.area);
    if (crit) logEvent(a.name + "'s heavy strike lands a crushing crit!");
  }
  /* ---- the hero kit: rank-scaled signature abilities ---------------------- */
  // Heavy Strike & Savage Maul: huge single blows, % of the target's frame
  function castSmash(a, e, key, r) {
    a.facing = e.x < a.x ? -1 : 1;
    a.lungeT = 0.16;
    parts.push({ type: "swordarc", x: a.x + a.facing * 5, y: a.y - 9, dir: a.facing, area: a.area, life: 0.3 + r * 0.02, maxLife: 0.3 + r * 0.02, vx: 0, vy: 0, big: r >= 3 });
    const roll = d20();
    const atk = (a.atkBonus || 2) + (a.stratT > 0 ? 1 : 0);
    if (roll === 1 || (roll !== 20 && roll + atk < e.def.ac)) { floatText(e.x, e.y - 16, "Miss!", "#cfd8f2", e.area); return; }
    const crit = roll === 20;
    const pct = key === "heavy_strike" ? 0.2 + r * 0.05 : 0.16 + r * 0.04;
    let dmg = Math.round(e.maxhp * pct) + rollDice(key === "heavy_strike" ? 8 : 10) + Math.max(0, mod(a.dnd.str)) + (a.stratT > 0 ? 2 : 0);
    if (crit) dmg += Math.round(e.maxhp * 0.2);
    hurtEnemy(e, dmg, a, crit, "slash");
    e.kbx *= 1.7; e.kby *= 1.7;
    sparkBurst(e.x, e.y - 8, e.area);
    if (key === "savage_maul" && r >= 3 && e.hp > 0) { e.bleedT = 3 + r * 0.5; e.bleedSrc = a; }   // RENDING EDGE
    if (key === "heavy_strike" && r >= 5) {   // AFTERSHOCK: a shockwave rolls off the blow
      parts.push({ type: "wave", x: e.x, y: e.y, area: e.area, life: 0.45, maxLife: 0.45, vx: 0, vy: 0, sp: 18 });
      for (const o of enemies) if (o !== e && o.hp > 0 && !o.burnT && o.area === e.area && dist(o.x, o.y, e.x, e.y) < 26) hurtEnemy(o, 6 + Math.max(0, mod(a.dnd.str)), a, false, "slash");
    }
    if (crit) logEvent(a.name + "'s " + ABILITIES[key].name.toLowerCase() + " lands a crushing crit!");
  }
  // Whirlwind: hit EVERYTHING in the circle, kick up a ring of dust
  function castWhirlwind(a, r) {
    a.lungeT = 0.16;
    const rad = 22 + r * 4;
    for (let k = 0; k < 10 + r * 4; k++) {
      const ang = k / (10 + r * 4) * 6.28;
      parts.push({ type: "poof", x: a.x + Math.cos(ang) * rad * 0.8, y: a.y - 2 + Math.sin(ang) * rad * 0.4, area: a.area, life: 0.5 + Math.random() * 0.3, maxLife: 0.8, vx: Math.cos(ang) * 26, vy: Math.sin(ang) * 10 - 6 });
    }
    parts.push({ type: "swordarc", x: a.x + 5, y: a.y - 9, dir: 1, area: a.area, life: 0.3, maxLife: 0.3, vx: 0, vy: 0, big: r >= 3 });
    parts.push({ type: "swordarc", x: a.x - 5, y: a.y - 9, dir: -1, area: a.area, life: 0.3, maxLife: 0.3, vx: 0, vy: 0, big: r >= 3 });
    if (r >= 5) for (let k = 0; k < 16; k++) parts.push({ type: "poof", x: a.x + (Math.random() * rad * 2 - rad), y: a.y - Math.random() * 10, area: a.area, life: 0.9, maxLife: 0.9, vx: (Math.random() - 0.5) * 40, vy: -8 });   // DUST STORM
    let hits = 0;
    for (const e of enemies) {
      if (e.hp <= 0 || e.burnT > 0 || e.area !== a.area || dist(e.x, e.y, a.x, a.y) > rad) continue;
      const roll = d20();
      if (roll === 1 || (roll !== 20 && roll + (a.atkBonus || 2) < e.def.ac)) { floatText(e.x, e.y - 16, "Miss!", "#cfd8f2", e.area); continue; }
      const crit = roll === 20;
      hurtEnemy(e, (8 + r * 5) + Math.max(0, mod(a.dnd.str)) + (a.stratT > 0 ? 2 : 0) + (crit ? rollDice(8) : 0), a, crit, "slash");
      hits++;
    }
    if (hits >= 3) logEvent(a.name + "'s whirlwind scythes through " + hits + " monsters!");
  }
  // Hammer Bash: one skull, one hammer, stun stars
  function castHammerBash(a, e, r) {
    a.facing = e.x < a.x ? -1 : 1;
    a.lungeT = 0.16;
    const roll = d20();
    if (roll === 1 || (roll !== 20 && roll + (a.atkBonus || 2) < e.def.ac)) { floatText(e.x, e.y - 16, "Miss!", "#cfd8f2", e.area); return; }
    const crit = roll === 20;
    hurtEnemy(e, (10 + r * 5) + Math.max(0, mod(a.dnd.str)) + (crit ? rollDice(6) : 0), a, crit, "slash");
    sparkBurst(e.x, e.y - 10, e.area);
    playFX("impact_smash", e.x, e.y - 8, e.area, 0.8 + r * 0.1);
    parts.push({ type: "wave", x: e.x, y: e.y - 6, area: e.area, life: 0.3, maxLife: 0.3, vx: 0, vy: 0, sp: 8 });
    if (e.hp > 0) { e.stunT = Math.max(e.stunT || 0, 1 + r * 0.3); floatText(e.x, e.y - 26, "STUNNED!", "#ffd166", e.area); }
  }
  // Earthshatter: the ground CRACKS and a dust shockwave staggers the area
  function castEarthshatter(a, r) {
    a.lungeT = 0.2;
    const cx = a.x + a.facing * 10, cy = a.y + 2;
    // jagged crack decal, radiating from the slam
    const segs = [];
    for (let arm = 0; arm < 3 + Math.min(2, Math.floor(r / 2)); arm++) {
      let px2 = cx, py2 = cy, ang = a.facing > 0 ? (arm - 1.5) * 0.5 : 3.14 + (arm - 1.5) * 0.5;
      for (let s = 0; s < 4 + r; s++) {
        const len = 3 + Math.random() * 4;
        ang += (Math.random() - 0.5) * 0.8;
        const nx = px2 + Math.cos(ang) * len, ny = py2 + Math.sin(ang) * len * 0.5;
        segs.push([Math.round(px2), Math.round(py2), Math.round(nx), Math.round(ny)]);
        px2 = nx; py2 = ny;
      }
    }
    residues.push({ type: "crack", x: cx, y: cy, area: a.area, life: 8, maxLife: 8, segs });
    playFX("impact_smash", cx, cy - 4, a.area, 1 + r * 0.15);
    parts.push({ type: "wave", x: cx, y: cy, area: a.area, life: 0.5, maxLife: 0.5, vx: 0, vy: 0, sp: 16 + r * 4 });
    for (let k = 0; k < 12 + r * 4; k++) parts.push({ type: "poof", x: cx + (Math.random() * 40 - 20), y: cy - Math.random() * 6, area: a.area, life: 0.6 + Math.random() * 0.4, maxLife: 1, vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 10 });
    const rad = 30 + r * 6;
    for (const e of enemies) {
      if (e.hp <= 0 || e.burnT > 0 || e.area !== a.area || dist(e.x, e.y, cx, cy) > rad) continue;
      hurtEnemy(e, (12 + r * 6) + Math.max(0, mod(a.dnd.str)), a, false, "slash");
      if (e.hp > 0) { e.cd = Math.max(e.cd, 1.2); e.stunT = Math.max(e.stunT || 0, 0.6); }   // staggered
    }
    if (r >= 5) parts.push({ type: "wave", x: cx, y: cy, area: a.area, life: 0.7, maxLife: 0.7, vx: 0, vy: 0, sp: rad });   // FAULT LINE: second ring
  }
  // Flame Wave: a travelling WALL of fire that torches everything it passes
  const flameWaves = [];
  function castFlameWave(a, r) {
    flameWaves.push({ x: a.x + a.facing * 8, y: a.y, dir: a.facing, traveled: 0, reach: 56 + r * 9, rank: r, owner: a, area: a.area, hit: {}, ph: Math.random() * 6.28 });
  }
  function updateFlameWaves(dt) {
    for (let i = flameWaves.length - 1; i >= 0; i--) {
      const w = flameWaves[i];
      const step = 85 * dt;
      w.x += w.dir * step; w.traveled += step; w.ph += dt * 14;
      if (Math.random() < dt * 22) addPart("ember", w.x + (Math.random() * 10 - 5), w.y - Math.random() * 10, w.area);
      if (w.rank >= 3 && Math.random() < dt * 7) addResidue("scorch", w.x, w.y + 2, w.area, 5 + Math.random() * 3);   // BURNING GROUND
      for (const e of enemies) {
        if (w.hit[e.kind + e.phase] || e.hp <= 0 || e.burnT > 0 || e.area !== w.area) continue;
        if (Math.abs(e.x - w.x) < 10 && Math.abs(e.y - w.y) < 16 + w.rank * 2) {
          w.hit[e.kind + e.phase] = 1;
          const a = w.owner;
          hurtEnemy(e, (9 + w.rank * 5) + Math.max(0, a.dnd ? mod(a.dnd.int) : 1) + (a.passiveSpellDmg || 0), a, false, "fireball");
          if (e.hp > 0) { e.scorchT = Math.max(e.scorchT || 0, 2.5); e.scorchSrc = a; }
        }
      }
      if (w.traveled >= w.reach) { for (let k = 0; k < 8; k++) addPart("ember", w.x + (Math.random() * 14 - 7), w.y - Math.random() * 12, w.area); flameWaves.splice(i, 1); }
    }
  }
  function drawFlameWaves(t) {
    for (const w of flameWaves) {
      if (w.area !== viewArea) continue;
      const x = Math.round(w.x), y = Math.round(w.y);
      const h = 10 + w.rank * 3;
      for (let k = -2; k <= 2; k++) {
        const fh = Math.round(h * (1 - Math.abs(k) * 0.22) + Math.sin(w.ph + k * 1.7) * 2);
        const fx = x + k * 3;
        ctx.fillStyle = "#a8341e"; ctx.fillRect(fx - 1, y - fh, 3, fh);
        ctx.fillStyle = "#e8702a"; ctx.fillRect(fx, y - fh + 2, 2, fh - 3);
        ctx.fillStyle = "#f2b441"; ctx.fillRect(fx, y - Math.round(fh * 0.55), 1, Math.round(fh * 0.45));
        if (Math.sin(w.ph * 1.3 + k) > 0.4) { ctx.fillStyle = "#fff2a0"; ctx.fillRect(fx, y - 3, 1, 2); }
      }
      ctx.globalAlpha = 0.22;
      disc(ctx, x, y - 4, 12 + w.rank * 2, "#ff9a3c");
      ctx.globalAlpha = 1;
    }
  }

  /* ---- ULTIMATES: one per hero, none alike -------------------------------- */
  const meteors = [];
  const stampede = [];
  function ultPopup(a, key) {
    const ab = ABILITIES[key];
    floatText(a.x, a.y - a.sh - 18, "★ " + ab.name.toUpperCase() + " ★", classColor(a), a.area, true);
    logEvent("★ " + a.name + " unleashes " + ab.name + "!");
    a.ultCD = ab.cd;
  }
  function castMasterStrategist(a, foes) {       // Claude: the battlefield, read like a book
    ultPopup(a, "master_strategist");
    for (const b of actives) {
      if (b.area !== a.area || b.state === "ko") continue;
      b.stratT = 10;
      for (let k = 0; k < 8; k++) parts.push({ type: "lightmote", x: b.x + (Math.random() * 14 - 7), y: b.y - Math.random() * 14, area: b.area, life: 0.7, maxLife: 0.7, vx: 0, vy: -12 });
    }
    for (const e of foes) { e.markedT = 10; floatText(e.x, e.y - 20, "MARKED", "#ffd166", e.area); }
    say(a, pick(["I see every opening!", "There — strike THERE!", "The battle is already won."]));
  }
  function castMeteorStorm(a, foes) {            // Averis: the sky, torn open
    ultPopup(a, "meteor_storm");
    const cx = foes.reduce((s, e) => s + e.x, 0) / foes.length;
    const cy = foes.reduce((s, e) => s + e.y, 0) / foes.length;
    const n = 6 + Math.max(0, mod(a.dnd.int));
    for (let i = 0; i < n; i++) {
      meteors.push({ x: cx + (Math.random() * 120 - 60), y: cy + (Math.random() * 60 - 30), delay: i * 0.28 + Math.random() * 0.15, fall: 0.55, t: 0, area: a.area, owner: a });
    }
    say(a, "The sky! MOVE!");
  }
  function updateMeteors(dt) {
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      if (m.delay > 0) { m.delay -= dt; continue; }
      m.t += dt;
      if (m.t >= m.fall) {   // IMPACT: a crater of fire
        playFX("explosion", m.x, m.y - 8, m.area, 1.1);
        sparkBurst(m.x, m.y, m.area);
        for (let k = 0; k < 16; k++) addPart("ember", m.x + (Math.random() * 26 - 13), m.y + (Math.random() * 16 - 8), m.area);
        parts.push({ type: "wave", x: m.x, y: m.y, area: m.area, life: 0.5, maxLife: 0.5, vx: 0, vy: 0, sp: 20 });
        addResidue("scorch", m.x, m.y, m.area, 10 + Math.random() * 5);
        const a = m.owner;
        for (const e of enemies) {
          if (e.hp <= 0 || e.burnT > 0 || e.area !== m.area || dist(e.x, e.y, m.x, m.y) > 28) continue;
          hurtEnemy(e, 22 + rollDice(8) + Math.max(0, mod(a.dnd.int)) * 3 + (a.passiveSpellDmg || 0), a, false, "fireball");
          if (e.hp > 0) { e.scorchT = Math.max(e.scorchT || 0, 4); e.scorchSrc = a; }
        }
        meteors.splice(i, 1);
      }
    }
  }
  function drawMeteors(t) {
    for (const m of meteors) {
      if (m.area !== viewArea || m.delay > 0) continue;
      const pr = m.t / m.fall;
      const x = Math.round(m.x + (1 - pr) * 34), y = Math.round(m.y - (1 - pr) * 110);
      ctx.globalAlpha = 0.25; disc(ctx, x, y, 7, "#ff9a3c"); ctx.globalAlpha = 1;
      ctx.fillStyle = "#a8341e"; ctx.fillRect(x - 3, y - 3, 7, 6);
      ctx.fillStyle = "#f2b441"; ctx.fillRect(x - 2, y - 2, 5, 4);
      ctx.fillStyle = "#fff2a0"; ctx.fillRect(x - 1, y - 1, 2, 2);
      for (let k = 1; k <= 4; k++) { ctx.globalAlpha = 1 - k * 0.2; ctx.fillStyle = k < 3 ? "#e8702a" : "#5a4438"; ctx.fillRect(x + k * 3, y - k * 7, 2, 3); }
      ctx.globalAlpha = 1;
      // the shadow of what's coming
      ctx.globalAlpha = 0.25 + pr * 0.3; ctx.fillStyle = "#1a1410";
      ctx.fillRect(Math.round(m.x) - 4, Math.round(m.y) - 1, 8, 3);
      ctx.globalAlpha = 1;
    }
  }
  function castDawn(a) {                          // Suni: a private sunrise
    ultPopup(a, "dawn_of_renewal");
    for (const sp of [26, 44, 66]) parts.push({ type: "wave", x: a.x, y: a.y - 6, area: a.area, life: 0.8, maxLife: 0.8, vx: 0, vy: 0, sp });
    for (let k = 0; k < 30; k++) parts.push({ type: "lightmote", x: a.x + (Math.random() * 200 - 100), y: a.y - Math.random() * 30, area: a.area, life: 1, maxLife: 1, vx: 0, vy: -16 - Math.random() * 8 });
    const heal = 36 + Math.max(0, mod(a.dnd.wis)) * 4;
    for (const b of actives) {
      if (b.area !== a.area) continue;
      if (b.state === "ko") { revive(b, a); floatText(b.x, b.y - b.sh - 8, "RISE!", "#ffe9a8", b.area); }
      else { b.stats.health = Math.min(b.maxHP, b.stats.health + heal); floatText(b.x, b.y - b.sh - 6, "+" + heal, "#a8f0c0", b.area); }
      playFX("heal", b.x, b.y - 10, b.area, 1);
      for (let k = 0; k < 6; k++) parts.push({ type: "petal", x: b.x + (Math.random() * 16 - 8), y: b.y - Math.random() * 14, area: b.area, life: 1.1, maxLife: 1.1, vx: (Math.random() - 0.5) * 8, vy: -8 });
    }
    for (const e of enemies) if (e.area === a.area && e.hp > 0 && !e.burnT) { e.dazzleT = Math.max(e.dazzleT || 0, 3.5); }
    say(a, "Let there be morning!");
  }
  function castWildHunt(a) {                      // Yenna: the Hunt answers
    ultPopup(a, "wild_hunt");
    summonWolves(a, null, 5, true);
    const dir = a.facing || 1;
    for (let i = 0; i < 8; i++) {
      stampede.push({ x: dir > 0 ? -24 - i * 26 : VW + 24 + i * 26, y: a.y - 26 + (i % 4) * 16 + Math.random() * 8, dir, sp: 200 + Math.random() * 40, area: a.area, owner: a, hit: {} });
    }
    say(a, "RUN WITH ME!");
  }
  function updateStampede(dt) {
    for (let i = stampede.length - 1; i >= 0; i--) {
      const s = stampede[i];
      s.x += s.dir * s.sp * dt;
      if (Math.random() < dt * 8) addPart("poof", s.x - s.dir * 6, s.y + 2, s.area);
      for (const e of enemies) {
        if (s.hit[e.phase] || e.hp <= 0 || e.burnT > 0 || e.area !== s.area) continue;
        if (Math.abs(e.x - s.x) < 9 && Math.abs(e.y - s.y) < 12) {
          s.hit[e.phase] = 1;
          hurtEnemy(e, 8 + rollDice(6) + Math.max(0, mod(s.owner.dnd.str)), s.owner, false, "wolf");
        }
      }
      if (s.x < -40 || s.x > VW + 40) stampede.splice(i, 1);
    }
  }
  function drawStampede(t) {
    for (const s of stampede) {
      if (s.area !== viewArea) continue;
      if (ready(WOLF_MINI.img)) {
        const m = Object.assign({}, WOLF_MINI, { scale: 1.5 });
        const f = Math.floor((t / 80 + s.y) % m.walkN);
        drawMini(m, s.x, s.y + Math.sin(s.x / 14) * 2, s.dir, f, m.walkRow, "hue-rotate(160deg) saturate(0.5) brightness(1.3)", 0.55);
      } else {
        const w = wolfSpr.width * 1.6, h = wolfSpr.height * 1.6;
        const dx = Math.round(s.x - w / 2), dy = Math.round(s.y - h + Math.sin(s.x / 14) * 2);
        ctx.globalAlpha = 0.5;
        if (s.dir < 0) { ctx.save(); ctx.translate(dx + w, dy); ctx.scale(-1, 1); ctx.drawImage(wolfSpr, 0, 0, w, h); ctx.restore(); }
        else ctx.drawImage(wolfSpr, dx, dy, w, h);
        ctx.globalAlpha = 1;
      }
    }
  }
  function castSanctuary(a) {                     // Atlas: walls, raised from nothing
    ultPopup(a, "sanctuary_walls");
    for (const b of actives) {
      if (b.area !== a.area || b.state === "ko") continue;
      b.sanctT = 9;
      parts.push({ type: "wave", x: b.x, y: b.y - 4, area: b.area, life: 0.4, maxLife: 0.4, vx: 0, vy: 0, sp: 12 });
    }
    say(a, "Walls UP!");
  }
  function tryUltimate(a) {
    const tr = AGENT_TREE[a.id];
    if (!tr || a.level < 5 || a.ultCD > 0 || a.state === "ko" || a.chargeSkill || a.castPauseT > 0) return;
    const foes = enemies.filter(e => e.area === a.area && e.hp > 0 && e.burnT <= 0 && !(e.disT > 0));
    switch (tr.ultimate) {
      case "master_strategist": if (foes.length >= 2) castMasterStrategist(a, foes); break;
      case "meteor_storm": { const near = foes.filter(e => dist(e.x, e.y, a.x, a.y) < 140); if (near.length >= 3) castMeteorStorm(a, near); break; }
      case "dawn_of_renewal": { const down = actives.some(b => b.area === a.area && b.state === "ko"); const hurt = actives.filter(b => b.area === a.area && b.state !== "ko" && hpPct(b) < 45).length; if (down || hurt >= 2) castDawn(a); break; }
      case "wild_hunt": if (foes.length >= 3) castWildHunt(a); break;
      case "sanctuary_walls": if (foes.length >= 2 && actives.some(b => b.area === a.area && b.state !== "ko" && hpPct(b) < 70)) castSanctuary(a); break;
    }
  }

  /* ---- Averis' fire imps: small, rude, and very flammable ----------------- */
  const IMPLING = [
    ".k....k.",
    ".kk..kk.",
    ".kRRRRk.",
    "kReRReRk",
    ".kRRRRk.",
    "..kRRk..",
    ".kRkkRk.",
  ];
  const IMPLING_PAL = { ".": null, k: "#2a1410", R: "#c84a32", e: "#ffd166" };
  let impMinionSpr = null;   // rendered in start()
  const impMinions = [];
  function summonImps(a, r) {
    for (let i = impMinions.length - 1; i >= 0; i--) { poof(impMinions[i].x, impMinions[i].y - 3, impMinions[i].area); impMinions.splice(i, 1); }   // the old gaggle pops away
    const n = 1 + Math.ceil(r / 2) + Math.floor((a.level || 1) / 4);   // more imps as HE grows
    for (let i = 0; i < n; i++) {
      const ox = Math.cos(i / n * 6.28) * 11, oy = Math.sin(i / n * 6.28) * 5;
      impMinions.push({ x: a.x + ox, y: a.y + 2 + oy, area: a.area, owner: a, life: 16, atkCD: 0.4 + i * 0.3, facing: a.facing, phase: Math.random() * 6.28, lungeT: 0, bite: 1 + Math.floor(r / 2) });
      poof(a.x + ox, a.y - 2 + oy, a.area);
      addPart("ember", a.x + ox, a.y - 4 + oy, a.area);
    }
    floatText(a.x, a.y - a.sh - 8, "Hehehe!", "#ff9a3c", a.area);
    if (Math.random() < 0.6) say(a, pick(["Go on, you little menaces!", "Bite first, cackle later!", "Out you come!"]));
  }
  function updateImpMinions(dt) {
    for (let i = impMinions.length - 1; i >= 0; i--) {
      const m = impMinions[i];
      m.life -= dt; m.atkCD = Math.max(0, m.atkCD - dt); m.lungeT = Math.max(0, m.lungeT - dt);
      const owner = m.owner;
      if (m.life <= 0 || !owner || owner.area !== m.area) { poof(m.x, m.y - 3, m.area); impMinions.splice(i, 1); continue; }
      const e = nearestEnemy(m.x, m.y, 200, m.area);
      const tx = e ? e.x : owner.x + Math.cos(m.phase) * 14, ty = e ? e.y : owner.y + 4 + Math.sin(m.phase) * 5;
      const d = dist(m.x, m.y, tx, ty) || 1;
      if (d > (e ? 8 : 5)) {
        m.x += (tx - m.x) / d * 62 * dt; m.y += (ty - m.y) / d * 62 * dt;
        m.phase += dt * 11;
        if (Math.abs(tx - m.x) > 1) m.facing = tx < m.x ? -1 : 1;
        if (Math.random() < dt * 5) addPart("ember", m.x, m.y - 4, m.area);
      } else if (e && m.atkCD <= 0) {
        m.atkCD = 1.1; m.lungeT = 0.14;
        const roll = d20();
        if (roll === 1 || (roll !== 20 && roll + 3 < e.def.ac)) floatText(e.x, e.y - 16, "Miss!", "#cfd8f2", e.area);
        else {
          const crit = roll === 20;
          hurtEnemy(e, rollDice(3) + m.bite + (crit ? rollDice(3) : 0), owner, crit, "fireball");
          if (e.hp > 0) { e.scorchT = Math.max(e.scorchT || 0, 1.2); e.scorchSrc = owner; }   // nippy little burns
        }
      }
      m.x = clamp(m.x, 10, VW - 10); m.y = clamp(m.y, 30, VH - 10);
    }
  }
  function drawImpMinion(m, t) {
    if (!impMinionSpr) return;
    const hover = -2 - Math.abs(Math.round(Math.sin(m.phase * 1.4) * 2));
    const lunge = m.lungeT > 0 ? Math.round(Math.sin((0.14 - m.lungeT) / 0.14 * Math.PI) * 3) * m.facing : 0;
    const dx = Math.round(m.x - impMinionSpr.width / 2) + lunge, dy = Math.round(m.y - impMinionSpr.height + hover);
    ctx.globalAlpha = Math.min(1, m.life / 1.5) * 0.95;
    drawShadow(m.x, m.y, 6);
    if (m.facing < 0) { ctx.save(); ctx.translate(dx + impMinionSpr.width, dy); ctx.scale(-1, 1); ctx.drawImage(impMinionSpr, 0, 0); ctx.restore(); }
    else ctx.drawImage(impMinionSpr, dx, dy);
    ctx.globalAlpha = 1;
  }

  // Yenna's call: two spirit wolves answer and join the hunt
  const wolves = [];
  function summonWolves(a, e, rank, hunt) {
    const r = rank || 2;
    if (!hunt) for (let i = wolves.length - 1; i >= 0; i--) { poof(wolves[i].x, wolves[i].y - 3, wolves[i].area); wolves.splice(i, 1); }   // the old pack fades
    const n = hunt ? 4 : 2 + Math.floor(r / 2);
    for (let i = 0; i < n; i++) {
      const ox = Math.cos(i / n * 6.28) * 12, oy = Math.sin(i / n * 6.28) * 6;
      wolves.push({ x: a.x + ox, y: a.y + 4 + oy, area: a.area, owner: a, life: hunt ? 14 : 18, atkCD: 0.5 + i * 0.3, facing: a.facing, phase: Math.random() * 6.28, lungeT: 0, dmgBase: 2 + r + (hunt ? 2 : 0) });
      poof(a.x + ox, a.y - 2 + oy, a.area);
    }
    floatText(a.x, a.y - a.sh - 8, "AWOO!", "#c9bda8", a.area);
    if (Math.random() < 0.6) say(a, pick(["Hunt with me!", "To me, pack!", "Run them down!"]));
  }
  function updateWolves(dt) {
    for (let i = wolves.length - 1; i >= 0; i--) {
      const w = wolves[i];
      w.life -= dt; w.atkCD = Math.max(0, w.atkCD - dt); w.lungeT = Math.max(0, w.lungeT - dt);
      const owner = w.owner;
      if (w.life <= 0 || !owner || owner.area !== w.area) { poof(w.x, w.y - 3, w.area); wolves.splice(i, 1); continue; }
      const e = nearestEnemy(w.x, w.y, 220, w.area);
      const tx = e ? e.x : owner.x + (i % 2 ? 14 : -14), ty = e ? e.y : owner.y + 6;
      const d = dist(w.x, w.y, tx, ty) || 1;
      if (d > (e ? 9 : 6)) {
        w.x += (tx - w.x) / d * 55 * dt; w.y += (ty - w.y) / d * 55 * dt;
        w.phase += dt * 13;
        if (Math.abs(tx - w.x) > 1) w.facing = tx < w.x ? -1 : 1;
      } else if (e && w.atkCD <= 0) {
        w.atkCD = 1.0; w.lungeT = 0.15;
        const roll = d20();
        if (roll === 1 || (roll !== 20 && roll + 4 < e.def.ac)) floatText(e.x, e.y - 16, "Miss!", "#cfd8f2", e.area);
        else {
          const crit = roll === 20;
          hurtEnemy(e, rollDice(4) + (w.dmgBase || 2) + (crit ? rollDice(4) : 0), owner, crit, "wolf");
        }
      }
      w.x = clamp(w.x, 10, VW - 10); w.y = clamp(w.y, 30, VH - 10);
    }
  }
  const WOLF_MINI = MINI_ANIMAL.wolf();
  function drawWolf(w, t) {
    const hop = -Math.abs(Math.round(Math.sin(w.phase) * 2));
    const lunge = w.lungeT > 0 ? Math.round(Math.sin((0.15 - w.lungeT) / 0.15 * Math.PI) * 3) * w.facing : 0;
    drawShadow(w.x, w.y, 8);
    const alpha = Math.min(1, w.life / 2) * 0.85;   // spirit-flesh, fading at the end
    if (ready(WOLF_MINI.img)) {
      const f = Math.floor((t / 110 + w.phase * 3) % WOLF_MINI.walkN);
      drawMini(WOLF_MINI, w.x + lunge, w.y + hop, w.facing, f, WOLF_MINI.walkRow, "hue-rotate(160deg) saturate(0.5) brightness(1.25)", alpha);
    } else {
      const dx = Math.round(w.x - wolfSpr.width / 2) + lunge, dy = Math.round(w.y - wolfSpr.height + hop);
      ctx.globalAlpha = alpha;
      if (w.facing < 0) { ctx.save(); ctx.translate(dx + wolfSpr.width, dy); ctx.scale(-1, 1); ctx.drawImage(wolfSpr, 0, 0); ctx.restore(); }
      else ctx.drawImage(wolfSpr, dx, dy);
      ctx.globalAlpha = 1;
    }
  }
  // the Ice Mage special: a SWARM of little shards that chill to the bone
  function castIcicles(a, e) {
    a.facing = e.x < a.x ? -1 : 1;
    a.lungeT = 0.14;
    for (let i = 0; i < 6; i++) {
      projectiles.push({
        ice: true, lead: i === 0,
        x: a.x + a.facing * 5 + (Math.random() * 8 - 4), y: a.y - a.sh / 2 - 4 + (i % 3) * 3,
        target: e, owner: a, area: a.area,
        sp: 150 + i * 8, life: 1.3, ph: Math.random() * 6.28, delay: i * 0.07,
      });
    }
    if (Math.random() < 0.4) say(a, pick(["Freeze!", "Stay cold.", "Winter calls."]));
  }
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (p.delay > 0) { p.delay -= dt; continue; }   // icicles fly in sequence
      p.life -= dt; p.ph += dt * 20;
      const e = p.target;
      if (!e || e.hp <= 0 || e.burnT > 0 || e.area !== p.area || p.life <= 0) {
        poof(p.x, p.y, p.area);
        if (!p.ice) addResidue("scorch", p.x, p.y + 4, p.area, 6 + Math.random() * 2);   // fizzled, still singes
        projectiles.splice(i, 1); continue;
      }
      const d = dist(p.x, p.y, e.x, e.y - 8) || 1;
      p.x += (e.x - p.x) / d * p.sp * dt;
      p.y += (e.y - 8 - p.y) / d * p.sp * dt;
      if (p.ice) { if (Math.random() < dt * 30) addPart("frost", p.x + (Math.random() * 4 - 2), p.y + (Math.random() * 4 - 2), p.area); }
      else {
        // the comet remembers where it's been — that's the licking flame tail
        p.trail = p.trail || [];
        p.trail.unshift({ x: p.x, y: p.y });
        if (p.trail.length > 11) p.trail.pop();
        if (Math.random() < dt * 70) addPart("ember", p.x + (Math.random() * 6 - 3), p.y + (Math.random() * 6 - 3), p.area);
        if (Math.random() < dt * 10) addPart("smoke", p.x + (Math.random() * 6 - 3), p.y - 2, p.area);
      }
      if (d < 7) {   // impact! roll the attack now
        const a = p.owner;
        const roll = d20();
        const atk = (a.atkBonus || 2) + (a.inspired ? 1 : 0);
        if (p.ice) {   // a chilling shard: small bite, and it SLOWS them
          for (let k = 0; k < 4; k++) addPart("frost", p.x + (Math.random() * 10 - 5), p.y + (Math.random() * 8 - 4), p.area);
          if (roll === 1 || (roll !== 20 && roll + atk < e.def.ac)) floatText(e.x, e.y - 16, "Miss!", "#cfd8f2", e.area);
          else {
            const crit = roll === 20;
            let dmg = rollDice(3) + 1 + (a.npcSpellDmg || 0);
            if (crit && p.lead) { dmg = Math.max(e.hp, 1); floatText(e.x, e.y - 24, "SHATTERED!", "#bfe6f5", e.area); }   // a perfect LEAD shard: one-shot
            else if (crit) dmg *= 3;
            hurtEnemy(e, dmg, a, crit, "ice");
            e.slowT = 2.5;
          }
        } else {       // the charged fireball: rank decides the boom
          const r = p.rank || 2;
          if (r >= 5) playFX("explosion", p.x, p.y - 6, p.area, 1);   // INFERNO: the full cartoon boom
          sparkBurst(p.x, p.y, p.area);
          for (let k = 0; k < 8 + r * 4; k++) addPart("ember", p.x + (Math.random() * (12 + r * 3) - (6 + r * 1.5)), p.y + (Math.random() * 12 - 6), p.area);
          parts.push({ type: "wave", x: p.x, y: p.y, area: p.area, life: 0.4, maxLife: 0.4, vx: 0, vy: 0, sp: 10 + r * 3 });
          if (r >= 5) parts.push({ type: "wave", x: p.x, y: p.y, area: p.area, life: 0.55, maxLife: 0.55, vx: 0, vy: 0, sp: 26 });
          addResidue("scorch", e.x, e.y, p.area, 7 + r * 1.6 + Math.random() * 3);   // the ground smolders long after
          if (roll === 1 || (roll !== 20 && roll + atk < e.def.ac)) {
            floatText(e.x, e.y - 16, "Miss!", "#cfd8f2", e.area);
          } else {
            const crit = roll === 20;
            let dmg = (4 + r * 5) + rollDice(6) + rollDice(6) + Math.max(0, a.dnd ? mod(a.dnd.int) : 1) + (a.passiveSpellDmg || 0) + (a.soulFury ? (a.passiveSoulbond || 0) + 2 : 0) + (a.inspired ? 1 : 0) - (a.weakT > 0 ? 2 : 0);
            if (crit) { dmg = Math.max(e.hp, dmg); floatText(e.x, e.y - 24, "OBLITERATED!", "#ffd166", e.area); }   // a perfect throw: one-shot
            hurtEnemy(e, Math.max(1, dmg), a, crit, "fireball");
            if (r >= 4 && e.hp > 0) { e.scorchT = Math.max(e.scorchT || 0, 3 + r); e.scorchSrc = a; }   // BURNING evolution
          }
        }
        projectiles.splice(i, 1);
      }
    }
  }
  function drawProjectiles(t) {
    for (const p of projectiles) {
      if (p.area !== viewArea || p.delay > 0) continue;
      const x = Math.round(p.x), y = Math.round(p.y);
      const flick = Math.sin(p.ph) > 0 ? 1 : 0;
      if (p.ice) {
        // a sleek frost dart: dark edge, cyan body, white core, point first
        const f2 = p.target && p.target.x < p.x ? -1 : 1;
        ctx.globalAlpha = 0.18;
        disc(ctx, x, y, 4, "#bfe6f5");
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#2e3450";
        ctx.fillRect(x - f2 * 4, y - 2, 4, 1); ctx.fillRect(x - f2 * 4, y + 1, 3, 1);
        ctx.fillStyle = "#7fd4e8";
        ctx.fillRect(x - f2 * 3, y - 1, 5, 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - f2 * 1, y - 1 + flick, 3, 1);
        ctx.fillRect(x + f2 * 3, y, 1, 1);   // the gleaming tip
      } else {
        // the COMET, scaled by rank: smoke -> deep red -> orange -> gold tail...
        const rk = p.rank || 2;
        const sc = 0.55 + rk * 0.16;   // rank 1 = modest, rank 5 = monstrous
        const tr = p.trail || [];
        const show = Math.min(tr.length, 4 + rk * 2);
        for (let i = show - 1; i >= 0; i--) {
          const q = tr[i];
          const fr = 1 - i / Math.max(1, show);
          const wob = Math.sin(p.ph * 0.7 + i * 0.9) * (0.4 + (1 - fr) * 2.2) * sc;
          const X = Math.round(q.x), Y = Math.round(q.y + wob);
          const w1 = Math.max(1, Math.round(2 * sc)), w2 = Math.max(2, Math.round(3 * sc)), w3 = Math.max(2, Math.round(4 * sc)), w4 = Math.max(3, Math.round(5 * sc));
          if (fr < 0.3) { ctx.globalAlpha = 0.2 + 0.4 * fr; ctx.fillStyle = "#5a4438"; ctx.fillRect(X, Y, w1, w1); }
          else if (fr < 0.5) { ctx.globalAlpha = 0.75; ctx.fillStyle = "#a8341e"; ctx.fillRect(X - 1, Y - 1, w2, 2); }
          else if (fr < 0.75) { ctx.globalAlpha = 0.9; ctx.fillStyle = "#e8702a"; ctx.fillRect(X - 2, Y - 1, w3, Math.max(2, Math.round(3 * sc))); }
          else { ctx.globalAlpha = 1; ctx.fillStyle = "#f2b441"; ctx.fillRect(X - 2, Y - 2, w4, Math.max(3, Math.round(4 * sc))); }
        }
        // ...crowned by a roaring, haloed head
        ctx.globalAlpha = 0.16 + 0.06 * Math.sin(p.ph);
        disc(ctx, x, y, Math.round(8 + rk * 1.6), "#ff9a3c");
        ctx.globalAlpha = 0.32 + 0.08 * Math.sin(p.ph * 1.3);
        disc(ctx, x, y, Math.round(5 + rk), "#ffb45c");
        ctx.globalAlpha = 1;
        const hw = Math.round(7 + rk * 1.6), hh = Math.round(5 + rk);
        ctx.fillStyle = "#a8341e"; ctx.fillRect(x - (hw >> 1) - 1, y - (hh >> 1) - 1, hw + 2, hh + 2);
        ctx.fillStyle = "#e8702a"; ctx.fillRect(x - (hw >> 1), y - (hh >> 1), hw, hh);
        ctx.fillStyle = "#f2b441"; ctx.fillRect(x - (hw >> 1) + 1, y - (hh >> 1) + 1 + flick, hw - 2, hh - 2);
        ctx.fillStyle = "#fff2a0"; ctx.fillRect(x - 2, y - 1, Math.max(3, hw - 5), Math.max(2, hh - 4) + flick);
        ctx.fillStyle = "#ffffff"; ctx.fillRect(x - 1, y, 2, 2);
      }
    }
  }
  // an enemy's swing: d20 + attack bonus vs the agent's AC (DEX = dodging).
  // Heavy hits force a WIS save vs fear.
  function enemyAttack(e, a) {
    e.lungeT = 0.18;
    const roll = d20();
    if (roll !== 20 && (roll === 1 || roll + e.def.atk < a.ac + (a.passiveAC || 0))) {
      floatText(a.x, a.y - a.sh - 4, "Dodged!", "#a8f0c0", a.area);
      return;
    }
    const crit = roll === 20;
    let dmg = rollDice(e.def.die) + e.def.dmgBonus;
    if (crit) dmg += rollDice(e.def.die);
    hurtAgent(a, dmg, e, crit);
    if (dmg >= 9 && a.state !== "ko" && a.afraidT <= 0) {
      const save = d20() + mod(a.dnd.wis) + (a.passiveFear || 0) - (a.traits.has("shy") ? 2 : 0);
      if (save < 12) {
        a.afraidT = 18;
        floatText(a.x, a.y - a.sh - 10, "Failed save!", "#e8a0ff", a.area);
        say(a, "That was close...");
      }
    }
  }
  function hurtAgent(a, dmg, e, crit) {
    if (a.passiveArmor) dmg = Math.max(1, dmg - a.passiveArmor);          // STONESKIN shaves it down
    if (a.sanctT > 0) { dmg = Math.max(1, Math.ceil(dmg * 0.5)); sparkBurst(a.x + (Math.random() * 10 - 5), a.y - 10, a.area); }   // SANCTUARY: the walls take half
    a.stats.health = Math.max(0, a.stats.health - dmg);
    a.stats.mood = Math.max(0, a.stats.mood - 2);
    a.flashT = 0.12;
    floatText(a.x, a.y - a.sh - 4, (crit ? "CRIT -" : "-") + dmg, "#ff8a8a", a.area);
    addPart("slash", a.x, a.y - 8, a.area);
    gore(a.x, a.y - 8, a.area, (a.look && a.look.shirt) || "#b8b0a0", crit ? 8 : 4);
    if (crit) maybeLog("enemycrit", "A " + e.kind + " critically hit " + a.name + "!", 20);
    // a hard hit breaks Suni's healing concentration
    if (a.doKind === "tend" && a.state === "do") {
      a.doKind = null; a.task = null; a.state = "idle"; a.idleT = 0.5;
      say(a, "Ah—! Hold on!");
      floatText(a.x, a.y - a.sh - 10, "Interrupted!", "#e8a0ff", a.area);
    }
    if (a.state === "ko") return;
    if (a.stats.health <= 0) { knockOut(a, e.kind); return; }
    // already running for it? (agents flee via walk + task.fleeing, not a state)
    if (a.state !== "fight" && !(a.task && a.task.fleeing)) {
      if ((a.traits.has("brave") || a.traits.has("helper")) && hpPct(a) > 40 && a.afraidT <= 0 && a.weakT <= 0) startFight(a, e);
      else startFlee(a);
    }
  }
  function updateEnemies(dt, t) {
    const night = Time.phase() === "night";
    if (night) {
      nightSpawnT -= dt;
      const alive = enemies.filter(e => e.hp > 0 && e.burnT <= 0).length;
      if (alive < 2 + Math.min(4, danger) && nightSpawnT <= 0) {
        // packs! pick one dark doorway and pour through it
        const r = Math.random();
        const area = r < 0.4 ? "town" : r < 0.68 ? "route" : r < 0.92 ? "deepwood" : "lake";
        const ptArr = pick(AREAS[area].enemySpawns);
        const n = 1 + (Math.random() < 0.3 + danger * 0.08 ? 1 : 0) + (danger >= 3 && Math.random() < 0.25 ? 1 : 0);
        for (let k = 0; k < n; k++) spawnEnemy(area, ptArr);
        if (n >= 2) maybeLog("pack", "A pack of monsters pours out of the dark!", 30);
        nightSpawnT = 4 + Math.random() * Math.random() * 90;   // wildly erratic — quick double-waves AND long eerie lulls
      }
    } else if (enemies.some(e => e.burnT <= 0 && !e.manual)) burnAll();
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.disT > 0) {   // smitten: dissolving into rising light
        e.disT -= dt;
        if (Math.random() < dt * 30) parts.push({ type: "lightmote", x: e.x + (Math.random() * 12 - 6), y: e.y - Math.random() * 14, area: e.area, life: 0.7, maxLife: 0.7, vx: (Math.random() - 0.5) * 6, vy: -18 - Math.random() * 8 });
        if (e.disT <= 0) enemies.splice(i, 1);
        continue;
      }
      if (e.burnT > 0) {
        e.burnT -= dt;
        if (Math.random() < dt * 22) addPart("ember", e.x + (Math.random() * 10 - 5), e.y - Math.random() * 12, e.area);
        if (e.burnT <= 0) enemies.splice(i, 1);
        continue;
      }
      e.cd = Math.max(0, e.cd - dt);
      e.lungeT = Math.max(0, e.lungeT - dt);
      e.flashT = Math.max(0, e.flashT - dt);
      if (e.slowT > 0) e.slowT -= dt;   // frostbitten: half speed
      if (e.scorchT > 0) {   // still smoldering: char, drips of ember, slow burn
        e.scorchT -= dt;
        e.hp -= 1.2 * dt;
        if (Math.random() < dt * 8) addPart("ember", e.x + (Math.random() * 8 - 4), e.y - Math.random() * 10, e.area);
        if (e.hp <= 0) {
          e.burnT = 0.7;
          nightKills++;
          poof(e.x, e.y - 6, e.area);
          const src = e.scorchSrc || claude;
          logEvent(src.name + "'s flames consumed a " + e.kind + "!");
          if (src.stats) src.stats.mood = clamp(src.stats.mood + 6, 0, 100);
          if (resolveTree(src)) grantXP(src, 8 + Math.round(e.maxhp / 9));
          continue;
        }
      }
      // knockback decays quickly
      if (Math.abs(e.kbx) > 0.5 || Math.abs(e.kby) > 0.5) { e.x += e.kbx * dt; e.y += e.kby * dt; e.kbx *= 1 - 8 * dt; e.kby *= 1 - 8 * dt; }
      if (e.markedT > 0) { e.markedT -= dt; if (Math.random() < dt * 5) parts.push({ type: "dazzle", x: e.x, y: e.y - 18, area: e.area, life: 0.4, maxLife: 0.4, vx: 0, vy: 2 }); }
      if (e.bleedT > 0) {   // rending wounds: dripping, draining
        e.bleedT -= dt;
        e.hp -= 1.1 * dt;
        if (Math.random() < dt * 6) parts.push({ type: "blood", x: e.x + (Math.random() * 8 - 4), y: e.y - 6, area: e.area, life: 0.5, maxLife: 0.5, vx: (Math.random() - 0.5) * 12, vy: 8, g: 90 });
        if (e.hp <= 0) {
          e.burnT = 0.7; nightKills++;
          poof(e.x, e.y - 6, e.area);
          const src = e.bleedSrc || claude;
          logEvent(src.name + "'s rending wound finished a " + e.kind + "!");
          if (resolveTree(src)) grantXP(src, 8 + Math.round(e.maxhp / 9));
          continue;
        }
      }
      if (e.dazzleT > 0 || e.stunT > 0) {   // dazzled by light, or seeing hammer-stars: rooted and helpless
        if (e.dazzleT > 0) e.dazzleT -= dt;
        if (e.stunT > 0) { e.stunT -= dt; if (Math.random() < dt * 9) parts.push({ type: "star", x: e.x + (Math.random() * 10 - 5), y: e.y - 14 - Math.random() * 4, area: e.area, life: 0.6, maxLife: 0.6, vx: (Math.random() - 0.5) * 10, vy: -3 }); }
        e.vx = e.vy = 0;
        if (e.dazzleT > 0 && Math.random() < dt * 11) parts.push({ type: "dazzle", x: e.x + (Math.random() * 14 - 7), y: e.y - 6 - Math.random() * 12, area: e.area, life: 0.5, maxLife: 0.5, vx: (Math.random() - 0.5) * 6, vy: -7 });
        e.x = clamp(e.x, 10, VW - 10); e.y = clamp(e.y, 26, VH - 8);
        continue;   // no stalking, no biting, no smashing
      }
      // pick the closest awake agent IN THIS AREA; anyone indoors is safe.
      // No agents around? The mortal townsfolk will do...
      let best = null, bd = 1e9;
      for (const a of actives) { if (a.state === "ko" || a.inside || a.area !== e.area) continue; const d = dist(a.x, a.y, e.x, e.y); if (d < bd) { bd = d; best = a; } }
      let prey = null, pd = 1e9;
      for (const v of villagers.concat(travellers)) { if (v.area !== e.area || v.dead || v.inside) continue; const d = dist(v.x, v.y, e.x, e.y); if (d < pd) { pd = d; prey = v; } }
      const center = AREAS[e.area].center;
      let tx = center.x, ty = center.y, engaged = false, smashing = null, victim = null, victimNpc = false;
      if (best && bd < 95) {
        const home = REST_SPOTS.some(rs => rs.area === e.area && dist(best.x, best.y, rs.x, rs.y) < 24);
        const safe = home && best.state === "do" && (best.doKind === "rest" || best.doKind === "hide");
        if (!safe) victim = best;
      }
      if (!victim && prey && pd < 95) { victim = prey; victimNpc = true; }
      if (victim) { tx = victim.x; ty = victim.y; engaged = true; }
      if (!engaged) {   // nobody to bite? wreck the nearest building instead
        let bs = 170;
        for (const s of allStructs()) {
          if (s.area !== e.area || s.hp <= 0) continue;
          const sd = dist(e.x, e.y, s.x, s.by + 4);
          if (sd < bs) { bs = sd; smashing = s; }
        }
        if (smashing) { tx = smashing.x; ty = smashing.by + 6; }
      }
      const d = dist(e.x, e.y, tx, ty);
      if (engaged && d < 11) {
        e.vx = e.vy = 0;
        if (e.cd <= 0) { e.cd = e.cdScaled; if (victimNpc) npcAttack(e, victim); else enemyAttack(e, victim); }
      } else if (smashing && d < 16) {
        e.vx = e.vy = 0;
        e.facing = smashing.x < e.x ? -1 : 1;
        if (e.cd <= 0) { e.cd = e.cdScaled; e.lungeT = 0.18; shackDamage(smashing, rollDice(6) + 2, e); }
      } else if (d > (engaged ? 11 : smashing ? 16 : 44)) {
        const wob = Math.sin(t / 420 + e.phase) * 0.4;
        let sx = (tx - e.x) / d, sy = (ty - e.y) / d;
        if (!engaged && e.area === "town") {   // monsters shy away from the campfire light
          const fd = dist(e.x, e.y, firepit.x, firepit.y);
          if (fd < 46 && fd > 0.01) { sx += (e.x - firepit.x) / fd * 0.8; sy += (e.y - firepit.y) / fd * 0.8; }
        }
        const wx = sx - sy * wob, wy = sy + sx * wob;
        const sl = Math.hypot(wx, wy) || 1;
        const spd = e.def.speed * (e.slowT > 0 ? 0.5 : 1);
        e.x += wx / sl * spd * dt; e.y += wy / sl * spd * dt;
        e.facing = wx < 0 ? -1 : 1;
        e.phase += dt * (e.kind === "demon" ? 10 : 5);
      } else { e.x += Math.sin(t / 500 + e.phase) * 3 * dt; }
      e.x = clamp(e.x, 10, VW - 10); e.y = clamp(e.y, 26, VH - 8);
    }
  }

  /* ==========================================================================
     15. Farm logic
     ========================================================================== */
  function farmChore() {
    let p;
    if (p = plots.find(q => q.crop && q.stage >= 3 && !q.claimedBy)) return { action: "harvest", plot: p };
    if (p = plots.find(q => !q.crop && !q.claimedBy)) return { action: "plant", plot: p };
    if (!Weather.isWet() && (p = plots.find(q => q.crop && q.stage < 3 && q.water <= 0 && !q.claimedBy))) return { action: "water", plot: p };
    return null;
  }
  function updatePlots(dt) {
    const raining = Weather.isWet();
    for (const p of plots) {
      if (raining && p.crop) p.water = Math.max(p.water, 8);   // rain waters the crops
      if (!p.crop || p.stage >= 3) { p.water = Math.max(0, p.water - dt); continue; }
      const def = CROPS[p.crop];
      p.growth += dt * (p.water > 0 ? 1 : 0.45);
      p.water = Math.max(0, p.water - dt);
      const r = p.growth / def.grow;
      const ns = r >= 1 ? 3 : r >= 0.55 ? 2 : 1;
      if (ns !== p.stage) {
        p.stage = ns;
        if (ns === 3) maybeLog("farmready", "The farm is ready to harvest.", 40);
      }
    }
    for (const b of bushes) {
      if (!b.ready) { b.regrowT -= dt; if (b.regrowT <= 0) b.ready = true; }
    }
  }

  /* ==========================================================================
     16. Dialogue — little bubbles above heads
     ========================================================================== */
  const CHATTER = {
    idle: ["Nice weather today.", "The town feels peaceful.", "I should check the farm.", "I'm getting hungry...", "What a view.", "Hm, what next?", "Maybe I'll walk the east road."],
    farm: ["These crops need water.", "I planted some carrots.", "Harvest time!", "We need more food for tonight.", "Grow, little ones."],
    cook: ["Dinner's ready!", "This smells good.", "A pinch of... something.", "Stew night!", "I'm cooking this meat.", "Dinner's almost ready."],
    house: ["I need to rest inside.", "I'm going home for now.", "I'll recover here.", "Time to put my feet up."],
    eat: ["That helped my hunger.", "Mmm. Cosy.", "I'll save some food for later.", "Delicious!"],
    hunt: ["I saw a rabbit!", "Careful, the deer is running!", "We need meat for the campfire.", "Stay quiet...", "Got it!"],
    social: ["Want to farm together?", "You're actually pretty cool.", "Thanks for helping me.", "Let's stick together tonight.", "Heard anything from the forest?", "Have you been out east?"],
    night: ["Something's coming...", "Protect the town!", "Stay near the fire.", "I don't like the dark forest.", "Eyes open, everyone."],
    combat: ["Back off!", "Protect the town!", "I need backup!", "Take this!", "I'll cover you!", "Stay behind me!", "Roll high!"],
    hurt: ["I'm hurt!", "Ow ow ow...", "I need help here!"],
    flee: ["Run to the house!", "Too dangerous!", "Falling back!"],
    rest: ["Just five more minutes...", "A good rest fixes everything.", "Zzz..."],
    sunrise: ["We made it through the night.", "The sun! Finally.", "Morning chores first."],
    sunset: ["Let's cook before dark.", "The light's turning gold.", "Everyone back to town soon."],
    relax: ["The pond is so calm.", "Deep breaths.", "I could stay here all day.", "The water is calm.", "I needed a break."],
    read: ["Huh, interesting sign.", "Who wrote this?", "Good to know."],
    garden: ["These smell wonderful.", "Mina keeps this so tidy.", "A flower for your thoughts?"],
    well: ["Cold and clear.", "Much better.", "Best water in town."],
    dummy: ["Hyah!", "One more round.", "The dummy never wins.", "Footwork, footwork..."],
    shrine: ["I wish for... no, it's a secret.", "The old stones are humming.", "Someone left berries here once."],
    ruins: ["Who built this place?", "These stones are older than the town.", "Hello? ...echo!", "It feels watchful in here."],
    stones: ["Three skips!", "The lake's so calm today.", "Plunk.", "Almost reached the middle!"],
    plaza: ["Atlas laid every stone himself.", "The flag's looking proud today.", "Meet you at the square!", "Best people-watching in town.", "These paving stones are so even..."],
    forage: ["Berries!", "A good haul today.", "Something rustled over there...", "One for the basket, one for me."],
    gather: ["The fire's warm tonight.", "Best seat in town.", "Anyone hungry?", "The fire feels warm.", "Let's eat together."],
    awkward: ["That was awkward...", "Let's... talk later.", "Hmph."],
    mourn: ["No... not them.", "We should have been faster.", "Rest easy, friend.", "The town feels smaller tonight.", "I'll plant flowers there."],
    weather: ["It's starting to rain.", "That storm looks bad.", "It's windy today.", "Look at those clouds.", "Stormy night... great."],
    weatherClear: ["The rain finally stopped.", "The weather finally cleared up.", "The weather feels nice today.", "Sun's back!"],
    shelter: ["Let's wait under the tree.", "I'll stay near shelter.", "It's too wet to keep farming.", "I'm staying under this tree.", "Cosy enough here.", "At least the tree keeps us dry.", "I'll stay dry here."],
    villager: ["Lovely day for it.", "Have you seen my trowel?", "The flowers are coming in nicely.", "Fresh air does wonders.", "Mind the tall grass, dear.", "I heard a rabbit got away again."],
    traveller: ["Just passing through.", "Long road ahead.", "Nice little town you have.", "Heard there are monsters at night...", "Any stew left?"],
    imp: ["Ribbit.", "Croak!", "*eyes a fly*", "*puffs up proudly*", "Brrp.", "*happy frog noises*"],
    cower: ["Eek!", "Is it morning yet?", "They're back...", "Stay away!", "H-hide!"],
    smite: ["Begone!", "By the light!", "Light, guide me!", "Leave my town alone!", "Shoo. Politely."],
    cheer: ["Get them!", "Behind you!", "Nice hit!", "You can do it!", "Protect the town!", "What a shot!"],
  };
  const CLAUDE_LINES = {
    combat: ["Hold the line!", "I've got your back!", "Aim for the slow ones!"],
    social: ["Eat something, you'll feel better.", "Good work out there today.", "I'll take night watch."],
    night: ["Stay together. We've got this.", "I'll guard the path."],
  };
  function chatterLine(a, poolName) {
    let pool = CHATTER[poolName] || CHATTER.idle;
    if (a.id === "claude" && CLAUDE_LINES[poolName] && Math.random() < 0.5) pool = CLAUDE_LINES[poolName];
    return pick(pool);
  }
  function ambientChatter(a, dt) {
    if (a.bubbleCD > 0) { a.bubbleCD -= dt; return; }
    if (a.bubbleEl || a.state === "ko") return;
    const ph = Time.phase();
    let poolName = "idle";
    if (a.state === "fight") poolName = "combat";
    else if (a.state === "hunt") poolName = "hunt";
    else if (a.state === "do") {
      if (a.doKind === "leisure" && a.task && a.task.poi) poolName = { read: "read", relax: "relax", garden: "garden", well: "well", dummy: "dummy", bench: "relax", shrine: "shrine", ruins: "ruins", stones: "stones", plaza: "plaza" }[a.task.poi.id] || "idle";
      else poolName = { rest: "rest", hide: "night", cook: "cook", eat: "eat", farm: "farm", forage: "forage", gather: "gather", shelter: "shelter" }[a.doKind] || "idle";
    }
    else if (ph === "night") poolName = "night";
    else if (ph === "sunset") poolName = "sunset";
    if (a.stats.hunger < 35 && poolName === "idle") { say(a, "I'm getting hungry..."); a.bubbleCD = 9 + Math.random() * 9; return; }
    say(a, chatterLine(a, poolName));
    a.bubbleCD = 9 + Math.random() * 9;
  }

  /* ==========================================================================
     17. Agent AI — survival decisions, navigation & cross-area travel.
     ========================================================================== */
  const STAT_KEYS = ["health", "mana", "hunger", "energy", "mood"];
  const STAT_COLOR = { health: "#74d36c", mana: "#5aa0e8", hunger: "#e8825c", energy: "#f2c14e", mood: "#e85c8a" };
  function isCaster(a) { return a.cls === "Ranger" || a.cls === "Healer" || a.cls === "Beast Warrior"; }

  // EVERY big move is charged now: stand still, wind it up, let it rip.
  // Charged attacks hit much harder than the old quick versions.
  const SKILLS = {
    fireball: { charge: 1.4, cd: 3.2, mana: 30, min: 18, max: 110, pause: 1.5, name: "fireball" },
    smite:    { charge: 1.5, cd: 4.5, mana: 45, min: 20, max: 150, pause: 2.0, name: "holy smite" },
    slash:    { charge: 0.9, cd: 3.5, mana: 0,  min: 0,  max: 26,  pause: 0.8, name: "heavy strike" },
    icicles:  { charge: 1.2, cd: 3.8, mana: 25, min: 18, max: 100, pause: 1.2, name: "icicle volley" },
    wolves:   { charge: 1.3, cd: 12,  mana: 40, min: 0,  max: 120, pause: 1.0, name: "wolf pack" },
  };
  const AGENT_SKILL = { claude: "slash", averis: "fireball", sunbeam: "smite", yenna: "wolves", atlas: "slash" };

  /* ==========================================================================
     16b. THE RPG LAYER — classes, the ability library, skill trees, XP.
     Every ability: its own identity, numbers, scaling, ranks and evolutions.
     ========================================================================== */
  const CLASSES = {
    fighter: { name: "Fighter", color: "#ff9a76", glow: "#ffd166" },
    mage: { name: "Mage", color: "#ffb84d", glow: "#ff9a3c" },
    druid: { name: "Druid", color: "#7ae0a0", glow: "#c8e8a8" },
  };
  const ABILITIES = {
    /* ---------------- FIGHTER · Strategist (Claude) ---------------- */
    heavy_strike: {
      name: "Heavy Strike", cls: "fighter", kind: "active", icon: "&#9876;",
      desc: "A charged two-handed blow that carves away a chunk of the target's very frame.",
      scale: "STR", cd: 6, mana: 0, range: [0, 26], charge: 0.9, pause: 0.8,
      dmgText: r => Math.round((0.2 + r * 0.05) * 100) + "% of target max HP + d8 + STR",
      rankNotes: ["a solid blow", "heavier still", "GREATER ARC — a wider, brighter sweep", "quicker wind-up", "AFTERSHOCK — a shockwave rolls off every hit"],
      evolutions: [{ at: 3, name: "Greater Arc" }, { at: 5, name: "Aftershock" }],
    },
    whirlwind: {
      name: "Whirlwind", cls: "fighter", kind: "active", icon: "&#127744;",
      desc: "Spin with the blade out — EVERY monster in reach is struck at once, in a rising ring of dust.",
      scale: "STR", cd: 9, mana: 0, range: [0, 30], charge: 1.0, pause: 0.9, lvlReq: 2,
      dmgText: r => (8 + r * 5) + " + STR to all in " + (22 + r * 4) + "px",
      rankNotes: ["a tight spin", "harder hits", "WIDE SWEEP — bigger circle", "harder still", "DUST STORM — a massive spinning gale"],
      evolutions: [{ at: 3, name: "Wide Sweep" }, { at: 5, name: "Dust Storm" }],
    },
    iron_resolve: {
      name: "Iron Resolve", cls: "fighter", kind: "passive", icon: "&#9670;",
      desc: "Stand like a wall. Each rank toughens armour and steadies the heart against fear.",
      dmgText: r => "+" + Math.floor(r / 2) + " AC, +" + r + " on fear saves",
      rankNotes: ["steadier nerves", "+1 AC", "steadier still", "+2 AC", "unshakeable"],
    },
    master_strategist: {
      name: "Master Strategist", cls: "fighter", kind: "ultimate", icon: "&#9733;",
      desc: "ULTIMATE — Claude reads the whole battlefield: every ally fights harder, and every enemy's weakness is REVEALED (+25% damage taken).",
      cd: 75, dmgText: () => "allies +1 to hit/+2 damage, enemies marked 10s",
    },
    /* ---------------- FIGHTER · Earthshaper (Atlas) ---------------- */
    hammer_bash: {
      name: "Hammer Bash", cls: "fighter", kind: "active", icon: "&#128296;",
      desc: "The builder's hammer, applied to a monster's skull. Leaves them seeing stun stars.",
      scale: "STR", cd: 7, mana: 0, range: [0, 24], charge: 0.8, pause: 0.7,
      dmgText: r => (10 + r * 5) + " + STR, stuns " + (1 + r * 0.3).toFixed(1) + "s",
      rankNotes: ["a ringing knock", "heavier head", "longer stun", "heavier still", "CONCUSSION — they forget what year it is"],
      evolutions: [{ at: 3, name: "Heavy Head" }, { at: 5, name: "Concussion" }],
    },
    earthshatter: {
      name: "Earthshatter", cls: "fighter", kind: "active", icon: "&#9935;",
      desc: "Slam the ground so hard it CRACKS — a dust shockwave staggers everything around him.",
      scale: "STR", cd: 12, mana: 0, range: [0, 40], charge: 1.2, pause: 1.0, lvlReq: 2,
      dmgText: r => (12 + r * 6) + " + STR to all in " + (30 + r * 6) + "px, staggers",
      rankNotes: ["the ground jumps", "harder slam", "DEEP FISSURE — longer cracks", "wider shock", "FAULT LINE — the earth ERUPTS"],
      evolutions: [{ at: 3, name: "Deep Fissure" }, { at: 5, name: "Fault Line" }],
    },
    stoneskin: {
      name: "Stoneskin", cls: "fighter", kind: "passive", icon: "&#9670;",
      desc: "Skin like good masonry — a flat chunk shaved off every hit he takes.",
      dmgText: r => "-" + Math.ceil(r / 2) + " damage from every hit",
      rankNotes: ["a little tougher", "tougher", "like brick", "like granite", "like the town walls"],
    },
    sanctuary_walls: {
      name: "Sanctuary Walls", cls: "fighter", kind: "ultimate", icon: "&#9733;",
      desc: "ULTIMATE — Atlas raises a ring of spectral stone around his friends: incoming damage HALVED while the walls stand.",
      cd: 75, dmgText: () => "all nearby allies take half damage for 9s",
    },
    /* ---------------- MAGE · Fire Mage (Averis) ---------------- */
    fireball: {
      name: "Fireball", cls: "mage", kind: "active", icon: "&#128293;",
      desc: "A sung spark that grows into a roaring comet. The classic, perfected.",
      scale: "INT", cd: 4, mana: 30, range: [18, 110], charge: 1.4, pause: 1.5,
      dmgText: r => (4 + r * 5) + " + 2d6 + INT" + (r >= 4 ? ", sets targets ALIGHT" : ""),
      rankNotes: ["a modest fireball", "hotter, faster", "GREATER FIREBALL — a bigger blast", "BURNING — victims stay alight", "INFERNO — a huge comet, a huge boom"],
      evolutions: [{ at: 3, name: "Greater Fireball" }, { at: 4, name: "Burning" }, { at: 5, name: "Inferno" }],
    },
    flame_wave: {
      name: "Flame Wave", cls: "mage", kind: "active", icon: "&#127754;",
      desc: "A rolling WALL of flame sweeps forward, scorching the ground and everything standing on it.",
      scale: "INT", cd: 11, mana: 40, range: [0, 90], charge: 1.6, pause: 1.4, lvlReq: 2,
      dmgText: r => (9 + r * 5) + " + INT to everything in its path (" + (56 + r * 9) + "px)",
      rankNotes: ["a low wave", "hotter", "BURNING GROUND — the scorch lingers", "a taller wave", "INFERNO WAVE — a towering tide of fire"],
      evolutions: [{ at: 3, name: "Burning Ground" }, { at: 5, name: "Inferno Wave" }],
    },
    inner_flame: {
      name: "Inner Flame", cls: "mage", kind: "passive", icon: "&#9670;",
      desc: "The fire feeds back: mana returns faster and every spell hits a little harder.",
      dmgText: r => "+" + (r * 0.8).toFixed(1) + " mana/s, +" + Math.floor(r / 2) + " spell damage",
      rankNotes: ["a warm core", "+spell damage", "warmer", "+spell damage", "a burning heart"],
    },
    summon_imps: {
      name: "Summon Imps", cls: "mage", kind: "active", icon: "&#128520;",
      desc: "Averis snaps his fingers and little fire imps wriggle out of the air — cackling, biting, loyal. The stronger HE gets, the more answer the call.",
      scale: "INT", cd: 14, mana: 35, range: [0, 120], charge: 1.2, pause: 1.0, lvlReq: 3,
      dmgText: r => (1 + Math.ceil(r / 2)) + " imps (+1 per 4 hero levels), nipping d3+" + Math.floor(r / 2) + " fire each",
      rankNotes: ["one imp... maybe two", "spicier bites", "A THIRD IMP wriggles out", "spicier still", "A LITTLE LEGION"],
      evolutions: [{ at: 3, name: "Third Imp" }, { at: 5, name: "Little Legion" }],
    },
    soulbound: {
      name: "Soulbound — Husband of Suni", cls: "mage", kind: "passive", icon: "&#10084;",
      desc: "Averis and Suni are married — two flames, one hearth. Near her, both slowly mend. And if anyone DARES hurt her, his fire answers faster and hits harder.",
      dmgText: r => "near Suni: both regen +" + (r * 0.3).toFixed(1) + " HP/s · she's hurt: +" + (r + 2) + " spell damage and faster casting",
      rankNotes: ["a quiet vow", "a warm hearth", "a fierce devotion", "an unbreakable thread", "two flames, one soul"],
    },
    meteor_storm: {
      name: "Meteor Storm", cls: "mage", kind: "ultimate", icon: "&#9733;",
      desc: "ULTIMATE — Averis tears the sky open. METEORS hammer the battlefield in craters of fire.",
      cd: 90, dmgText: () => "6+ meteors, ~30 + 3×INT each, in craters of flame",
    },
    /* ---------------- DRUID · Sun Warden (Suni) ---------------- */
    healing_bloom: {
      name: "Healing Bloom", cls: "druid", kind: "active", icon: "&#10047;", heal: true,
      desc: "She kneels by the wounded and FLOWERS burst where her light lands — channelled until they are whole.",
      scale: "WIS", cd: 3, mana: 0, range: [0, 24],
      dmgText: r => "heals " + (16 + r * 6) + "/s to FULL — costs nothing, breaks if she's hit",
      rankNotes: ["a gentle mend", "faster mending", "FLOWER BURST — petals everywhere", "faster still", "FULL BLOOM — a garden erupts around them"],
      evolutions: [{ at: 3, name: "Flower Burst" }, { at: 5, name: "Full Bloom" }],
    },
    solar_smite: {
      name: "Solar Smite", cls: "druid", kind: "active", icon: "&#9728;",
      desc: "Sun-fire called straight down — one colossal beam, then a volley of echoes. Survivors stand DAZZLED.",
      scale: "WIS", cd: 4.5, mana: 45, range: [20, 150], charge: 1.5, pause: 2.0,
      dmgText: r => (2 + Math.ceil(r / 2)) + "d8 + 2×WIS, " + (1 + Math.ceil(r / 2)) + " echo beams, dazzle " + (3 + r * 0.4).toFixed(1) + "s",
      rankNotes: ["one echo", "two echoes", "TRIPLE ECHO", "brighter light", "NOON JUDGEMENT — maximum daylight"],
      evolutions: [{ at: 3, name: "Triple Echo" }, { at: 5, name: "Noon Judgement" }],
    },
    verdant_grace: {
      name: "Verdant Grace", cls: "druid", kind: "passive", icon: "&#9670;",
      desc: "Life clings to her: slow, constant regeneration, rain or shine.",
      dmgText: r => "+" + (r * 0.4).toFixed(1) + " HP/s regeneration",
      rankNotes: ["a green thumb", "greener", "evergreen", "spring eternal", "life itself"],
    },
    dawn_of_renewal: {
      name: "Dawn of Renewal", cls: "druid", kind: "ultimate", icon: "&#9733;",
      desc: "ULTIMATE — Suni calls a private sunrise: every ally is healed, the fallen RISE, and every monster stands dazzled blind.",
      cd: 90, dmgText: () => "heal all allies, revive the downed, dazzle every enemy",
    },
    /* ---------------- DRUID · Beastmaster (Yenna) ---------------- */
    savage_maul: {
      name: "Savage Maul", cls: "druid", kind: "active", icon: "&#129683;",
      desc: "Yenna's axe, swung like the forest falling. Heavy, fast, personal.",
      scale: "STR", cd: 6, mana: 0, range: [0, 26], charge: 0.9, pause: 0.8,
      dmgText: r => Math.round((0.16 + r * 0.04) * 100) + "% of target max HP + d10 + STR" + (r >= 3 ? ", victims BLEED" : ""),
      rankNotes: ["a heavy swing", "heavier", "RENDING EDGE — victims bleed", "heavier still", "PRIMAL MAUL — devastating"],
      evolutions: [{ at: 3, name: "Rending Edge" }, { at: 5, name: "Primal Maul" }],
    },
    summon_wolves: {
      name: "Summon Wolves", cls: "druid", kind: "active", icon: "&#128058;",
      desc: "Old pack magic: spirit wolves answer her call and hunt at her side.",
      scale: "WIS", cd: 12, mana: 40, range: [0, 120], charge: 1.3, pause: 1.0, lvlReq: 2,
      dmgText: r => (2 + Math.floor(r / 2)) + " wolves, biting d4+" + (2 + r) + " each",
      rankNotes: ["two wolves", "sharper teeth", "A THIRD WOLF joins the pack", "sharper still", "FULL PACK — four wolves"],
      evolutions: [{ at: 3, name: "Third Wolf" }, { at: 5, name: "Full Pack" }],
    },
    thick_hide: {
      name: "Thick Hide", cls: "druid", kind: "passive", icon: "&#9670;",
      desc: "Fur, sinew and stubbornness — more health per rank.",
      dmgText: r => "+" + r * 6 + " max HP",
      rankNotes: ["+6 HP", "+12 HP", "+18 HP", "+24 HP", "+30 HP"],
    },
    wild_hunt: {
      name: "Call of the Wild Hunt", cls: "druid", kind: "ultimate", icon: "&#9733;",
      desc: "ULTIMATE — Yenna howls and the WILD HUNT answers: a spectral stampede tramples the battlefield, and her own pack swells.",
      cd: 90, dmgText: () => "a stampede tramples all enemies; four hunt-wolves join her",
    },
  };
  const AGENT_TREE = {
    claude: { cls: "fighter", spec: "Strategist", actives: ["heavy_strike", "whirlwind"], passive: "iron_resolve", ultimate: "master_strategist",
      innate: "Inspire — allies fighting beside Claude roll +1.",
      order: ["heavy_strike", "whirlwind", "heavy_strike", "iron_resolve", "whirlwind", "heavy_strike", "iron_resolve", "whirlwind", "heavy_strike", "whirlwind", "heavy_strike", "iron_resolve", "iron_resolve", "iron_resolve"] },
    averis: { cls: "mage", spec: "Fire Mage", actives: ["summon_imps", "fireball", "flame_wave"], passive: "inner_flame", passive2: "soulbound", ultimate: "meteor_storm",
      innate: "Hunter's Eye — the wilds feed him; game comes easy. Married to Suni.",
      order: ["fireball", "soulbound", "fireball", "flame_wave", "summon_imps", "fireball", "inner_flame", "soulbound", "summon_imps", "flame_wave", "fireball", "summon_imps", "soulbound", "inner_flame", "fireball", "flame_wave", "summon_imps", "soulbound", "inner_flame", "soulbound"] },
    sunbeam: { cls: "druid", spec: "Sun Warden", actives: ["healing_bloom", "solar_smite"], passive: "verdant_grace", ultimate: "dawn_of_renewal",
      innate: "Daylight — her healing costs nothing at all.",
      order: ["healing_bloom", "solar_smite", "healing_bloom", "solar_smite", "verdant_grace", "healing_bloom", "solar_smite", "healing_bloom", "solar_smite", "verdant_grace", "healing_bloom", "verdant_grace", "verdant_grace", "verdant_grace"] },
    yenna: { cls: "druid", spec: "Beastmaster", actives: ["summon_wolves", "savage_maul"], passive: "thick_hide", ultimate: "wild_hunt",
      innate: "Guardian Instinct — she shields the builder and walks the bounds.",
      order: ["savage_maul", "summon_wolves", "savage_maul", "thick_hide", "summon_wolves", "savage_maul", "thick_hide", "summon_wolves", "savage_maul", "summon_wolves", "savage_maul", "thick_hide", "thick_hide", "thick_hide"] },
    atlas: { cls: "fighter", spec: "Earthshaper", actives: ["hammer_bash", "earthshatter"], passive: "stoneskin", ultimate: "sanctuary_walls",
      innate: "Master Builder — repairs nearly three times faster than anyone.",
      order: ["hammer_bash", "earthshatter", "hammer_bash", "stoneskin", "earthshatter", "hammer_bash", "stoneskin", "earthshatter", "hammer_bash", "earthshatter", "hammer_bash", "stoneskin", "stoneskin", "stoneskin"] },
  };
  // the townsfolk get trees too — shared, humble, no ultimates
  const NPC_ABILITIES = {
    npc_slash: {
      name: "Knight's Slash", cls: "fighter", kind: "active", icon: "&#9876;",
      desc: "The town militia's bread and butter: a charged, honest sword blow.",
      scale: "STR", cd: 3.5, range: [0, 30],
      dmgText: r => "40% of target max HP + d8 + " + r * 2,
      rankNotes: ["a solid blow", "+2 damage", "+2 damage", "+2 damage", "a veteran's arm"],
    },
    npc_guard: {
      name: "Sturdy Stance", cls: "fighter", kind: "passive", icon: "&#9670;",
      desc: "Drilled at the training dummy: more health per rank.",
      dmgText: r => "+" + r * 5 + " max HP",
      rankNotes: ["+5 HP", "+10 HP", "+15 HP", "+20 HP", "+25 HP"],
    },
    npc_icicles: {
      name: "Icicle Volley", cls: "mage", kind: "active", icon: "&#10052;",
      desc: "A swarm of conjured frost darts that slow whatever they sting.",
      scale: "INT", cd: 3.8, range: [18, 100],
      dmgText: r => "6 darts of d3+1+" + Math.floor(r / 2) + ", slowing on hit",
      rankNotes: ["a cold sting", "sharper darts", "sharper still", "biting cold", "deep winter"],
    },
    npc_focus: {
      name: "Frost Focus", cls: "mage", kind: "passive", icon: "&#9670;",
      desc: "Practice on the pond: every dart bites a little deeper.",
      dmgText: r => "+" + Math.ceil(r / 2) + " damage per dart",
      rankNotes: ["focus", "sharper", "sharper", "keen", "glacial"],
    },
  };
  Object.assign(ABILITIES, NPC_ABILITIES);
  const NPC_TREE = {
    slash: { cls: "fighter", spec: "Town Knight", actives: ["npc_slash"], passive: "npc_guard", ultimate: null,
      innate: "Townsfolk — no ultimates, just grit and a good blade.",
      order: ["npc_slash", "npc_guard", "npc_slash", "npc_guard", "npc_slash", "npc_guard", "npc_slash", "npc_guard", "npc_slash", "npc_guard"] },
    icicles: { cls: "mage", spec: "Town Ice Mage", actives: ["npc_icicles"], passive: "npc_focus", ultimate: null,
      innate: "Townsfolk — no ultimates, just frost and patience.",
      order: ["npc_icicles", "npc_focus", "npc_icicles", "npc_focus", "npc_icicles", "npc_focus", "npc_icicles", "npc_focus", "npc_icicles", "npc_focus"] },
  };
  function resolveTree(p) { return AGENT_TREE[p.id] || (p.skill && NPC_TREE[p.skill]) || null; }
  function classOf(p) { const tr = resolveTree(p); return tr ? CLASSES[tr.cls] : null; }
  function classColor(p) { const c = classOf(p); return c ? c.color : "#fff2a0"; }
  function rankOf(a, key) { return (a.ranks && a.ranks[key]) || 0; }
  // skillDef: one lookup for SKILLS (townsfolk) AND ABILITIES (heroes)
  function skillDef(key) {
    if (SKILLS[key]) return SKILLS[key];
    const ab = ABILITIES[key];
    if (!ab) return { charge: 1, cd: 5, mana: 0, min: 0, max: 999, pause: 1, name: key };
    return { charge: ab.charge || 1, cd: ab.cd, mana: ab.mana || 0, min: ab.range ? ab.range[0] : 0, max: ab.range ? ab.range[1] : 999, pause: ab.pause || 1, name: ab.name };
  }
  const MELEE_CHARGE = { slash: 1, heavy_strike: 1, savage_maul: 1, hammer_bash: 1, whirlwind: 1, earthshatter: 1 };
  const CHARGE_LOOK = { heavy_strike: "slash", savage_maul: "slash", hammer_bash: "slash", whirlwind: "slash", earthshatter: "slash", flame_wave: "fireball", solar_smite: "smite", summon_wolves: "wolves", summon_imps: "fireball" };

  /* ---- XP, levels and auto-spent talent points --------------------------- */
  const MAX_LEVEL = 10;
  const xpNeed = lvl => 45 + (lvl - 1) * 35;
  function grantXP(a, n) {
    const tree = resolveTree(a);
    if (!tree || a.level === undefined || a.level >= MAX_LEVEL) return;
    a.xp += Math.round(n);
    while (a.level < MAX_LEVEL && a.xp >= xpNeed(a.level)) {
      a.xp -= xpNeed(a.level);
      a.level++; a.talentPts++;
      floatText(a.x, a.y - (a.sh || 16) - 12, "LEVEL " + a.level + "!", classColor(a), a.area, true);
      for (let k = 0; k < 14; k++) parts.push({ type: "lightmote", x: a.x + Math.cos(k / 14 * 6.28) * 9, y: a.y - 6 + Math.sin(k / 14 * 6.28) * 4, area: a.area, life: 0.8, maxLife: 0.8, vx: 0, vy: -14 });
      logEvent(a.name + " reached level " + a.level + "!");
      if (a.level === 5 && tree.ultimate) logEvent("✦ " + a.name + " unlocked their ULTIMATE: " + ABILITIES[tree.ultimate].name + "!");
      autoSpend(a);
    }
  }
  function autoSpend(a) {
    const tr = resolveTree(a); if (!tr) return;
    while (a.talentPts > 0) {
      let spent = false;
      while (a.spendIdx < tr.order.length) {
        const k = tr.order[a.spendIdx];
        const ab = ABILITIES[k];
        if (rankOf(a, k) >= 5 || a.level < (ab.lvlReq || 1)) { if (rankOf(a, k) >= 5) { a.spendIdx++; continue; } break; }
        a.ranks[k] = rankOf(a, k) + 1; a.spendIdx++; a.talentPts--;
        const evo = (ab.evolutions || []).find(ev => ev.at === a.ranks[k]);
        logEvent(a.name + " learned " + ab.name + " Rank " + a.ranks[k] + (evo ? " — " + evo.name.toUpperCase() + "!" : "."));
        spent = true; break;
      }
      if (!spent) break;   // gated by level requirements: the point waits
    }
    applyPassives(a);
  }
  function applyPassives(a) {
    const tr = resolveTree(a); if (!tr) return;
    const r = rankOf(a, tr.passive);
    if (tr === NPC_TREE.slash) {   // townsfolk: simple, sturdy bonuses
      const base = 40, nm = base + r * 5;
      if (a.maxhp !== nm) { a.maxhp = nm; a.hp = Math.min(nm, a.hp + 5); }
      return;
    }
    if (tr === NPC_TREE.icicles) { a.npcSpellDmg = Math.ceil(r / 2); return; }
    a.passiveAC = tr.passive === "iron_resolve" ? Math.floor(r / 2) : 0;
    a.passiveFear = tr.passive === "iron_resolve" ? r : 0;
    a.passiveArmor = tr.passive === "stoneskin" ? Math.ceil(r / 2) : 0;
    a.passiveManaRegen = tr.passive === "inner_flame" ? r * 0.8 : 0;
    a.passiveSpellDmg = tr.passive === "inner_flame" ? Math.floor(r / 2) : 0;
    a.passiveRegen = tr.passive === "verdant_grace" ? r * 0.4 : 0;
    a.passiveSoulbond = tr.passive2 ? rankOf(a, tr.passive2) : 0;
    const hpBonus = tr.passive === "thick_hide" ? r * 6 : 0;
    const newMax = a.baseMaxHP + hpBonus;
    if (newMax !== a.maxHP) { const pct = a.stats.health / a.maxHP; a.maxHP = newMax; a.stats.health = Math.min(a.maxHP, pct * a.maxHP + 6); }
  }
  function skillPopup(a, key) {
    const ab = ABILITIES[key]; if (!ab) return;
    floatText(a.x, a.y - a.sh - 14, ab.name.toUpperCase() + " Lv" + rankOf(a, key) + "!", classColor(a), a.area, true);
  }
  // everyone starts with their first talent already spent — townsfolk included
  for (const a of actives) { autoSpend(a); }
  for (const v of villagers) { autoSpend(v); }

  function releaseSkill(a) {
    const e = a.chargeTarget, sk = skillDef(a.chargeSkill), which = a.chargeSkill;
    a.chargeSkill = null; a.chargeTarget = null; a.chargingT = 0;
    if (!e || e.hp <= 0 || e.burnT > 0) return;
    a.castPauseT = sk.pause;
    if (sk.mana && a.stats) a.stats.mana = Math.max(0, a.stats.mana - sk.mana);
    if (ABILITIES[which]) { a.abilityCDs[which] = sk.cd; skillPopup(a, which); }
    else a.skillCD = sk.cd;
    const r = Math.max(1, rankOf(a, which));
    switch (which) {
      // the hero kit — every cast carries its rank
      case "heavy_strike": castSmash(a, e, "heavy_strike", r); break;
      case "savage_maul": castSmash(a, e, "savage_maul", r); break;
      case "whirlwind": castWhirlwind(a, r); break;
      case "hammer_bash": castHammerBash(a, e, r); break;
      case "earthshatter": castEarthshatter(a, r); break;
      case "flame_wave": castFlameWave(a, r); break;
      case "solar_smite": castSmite(a, e, r); break;
      case "summon_wolves": summonWolves(a, e, r); break;
      case "summon_imps": summonImps(a, r); break;
      // legacy keys (kept so nothing old can break)
      case "fireball": castFireball(a, e, r); break;
      case "smite": castSmite(a, e, 2); break;
      case "slash": heavySlash(a, e); break;
      case "icicles": castIcicles(a, e); break;
      case "wolves": summonWolves(a, e, 2); break;
    }
  }
  const ARRIVE = 5, MEET = 26;
  const FORAGE_SPOT = { x: 398, y: 86, area: "town" };

  // start walking to the current goal; the timeout scales with distance so far
  // places stay reachable, but a genuinely stuck agent still escapes.
  function setWalk(a) {
    const d = dist(a.x, a.y, a.goal.x, a.goal.y);
    a.walkTimeout = Math.min(30, Math.max(7, d / a.speed * 2.4 + 4));
    if (a.goal.area && a.goal.area !== a.area) a.walkTimeout = 30;   // cross-area trek
    if (a.koWalk) a.walkTimeout = Math.min(45, a.walkTimeout * 2);   // limping home takes longer
    a.state = "walk"; a.walkT = 0;
  }
  function goTo(a, x, y, extra) { a.goal = Object.assign({ x, y }, extra || {}); setWalk(a); }

  // shared steering: head for (tx,ty), avoid this area's solids (but never our
  // own destination's anchor solid — that was a "force wall" trap), clamp to
  // the map. The clamp relaxes along the road (|y-150|<20) so exits work.
  function steerMove(a, tx, ty, dt, opts = {}) {
    let dx = tx - a.x, dy = ty - a.y;
    const d = Math.hypot(dx, dy) || 1;
    let sx = dx / d, sy = dy / d;
    if (d > 18) for (const o of AREAS[a.area].solids) {
      if (opts.anchor && o.key === opts.anchor) continue;
      const ox = a.x - o.x, oy = a.y - o.y, od = Math.hypot(ox, oy);
      if (od > 0.01 && od < o.r + 8) { const f = (o.r + 8 - od) / (o.r + 8) * 1.7; sx += ox / od * f; sy += oy / od * f; }
    }
    const sl = Math.hypot(sx, sy) || 1;
    const sp = a.speed * (opts.speedMul || 1);
    a.vx = sx / sl * sp; a.vy = sy / sl * sp;
    a.x += a.vx * dt; a.y += a.vy * dt;
    const onRoad = Math.abs(a.y - 150) < 20;
    a.x = clamp(a.x, onRoad ? 4 : 26, onRoad ? VW - 4 : VW - 26);
    a.y = clamp(a.y, 44, VH - 24);
    // hard rule: never stand inside a solid's core (steering only nudges)
    for (const o of AREAS[a.area].solids) {
      if (opts.anchor && o.key === opts.anchor) continue;
      const ox = a.x - o.x, oy = a.y - o.y, od = Math.hypot(ox, oy);
      const core = o.r * 0.75;
      if (od > 0.01 && od < core) { a.x = o.x + ox / od * core; a.y = o.y + oy / od * core; }
    }
    if (Math.abs(a.vx) > 2) a.facing = a.vx < 0 ? -1 : 1;
    a.walkPhase += dt * 9;
    // rustle the tall grass as we pass through it
    if (inTallGrass(a.area, a.x, a.y) && Math.random() < dt * 6) addPart("rustle", a.x + (Math.random() * 8 - 4), a.y - 2, a.area);
    return d;
  }
  function moveToArea(ent, exit) {
    ent.area = exit.to;
    ent.x = exit.entry.x; ent.y = exit.entry.y;
  }
  // the areas form a chain along the road; to reach a far area, head for the
  // exit toward the next one over
  function exitToward(fromArea, goalArea) {
    if (fromArea === goalArea || !AREAS[fromArea] || !AREAS[goalArea]) return null;
    const direct = AREAS[fromArea].exits.find(x => x.to === goalArea);
    if (direct) return direct;
    return AREAS[fromArea].exits.find(x => x.to === "town") || null;   // all roads lead through town
  }

  function releaseClaims(a) {
    for (const p of plots) if (p.claimedBy === a.id) p.claimedBy = null;
    for (const b of actives) if (b.helper === a.id) b.helper = null;
  }
  function nearestRestSpot(a, preferTree) {
    let best = null, bd = 1e9;
    for (const rs of REST_SPOTS) {
      if (rs.anchor && buildingByKey[rs.anchor] && buildingByKey[rs.anchor].hp <= 0) continue;   // that roof is gone
      let d = dist(a.x, a.y, rs.x, rs.y) + (rs.area === a.area ? 0 : 500);
      if (preferTree && rs.anchor === "healtree") d -= 140;   // worth the extra walk when badly hurt
      if (d < bd) { bd = d; best = rs; }
    }
    // nowhere left? huddle together in the town square
    return best || { x: SQUARE.x + (Math.random() * 20 - 10), y: SQUARE.y + 4 + Math.random() * 8, anchor: null, area: "town" };
  }

  /* ---- task starters ---------------------------------------------------- */
  function startStroll(a) {
    a.task = { kind: "stroll" };
    a.thought = pick(CHATTER.idle);
    // mostly wander this area's paths; sometimes set off down the road
    const areaKey = Math.random() < 0.75 ? a.area : pick(ORDER.filter(k => k !== a.area));
    if (Math.random() < 0.75) {
      const w = pick(AREAS[areaKey].waypoints);
      a.goal = { x: w[0] + (Math.random() * 30 - 15), y: w[1] + (Math.random() * 24 - 12), area: areaKey, stroll: true };
    } else a.goal = { x: 40 + Math.random() * (VW - 80), y: 56 + Math.random() * (VH - 104), area: areaKey, stroll: true };
    setWalk(a);
  }
  function startRest(a, urgent) {
    const spot = nearestRestSpot(a, urgent && hpPct(a) < 60);   // badly hurt -> the Healing Tree
    a.task = { kind: "rest", urgent: !!urgent };
    a.thought = urgent ? "I need to lie down..." : "Time for a rest.";
    if (spot.enter && Math.random() < 0.4) say(a, pick(CHATTER.house));
    goTo(a, spot.x + (Math.random() * 10 - 5), spot.y + (Math.random() * 4 - 2), { anchor: spot.anchor, area: spot.area, enter: spot.enter, faceX: spot.x });
  }
  function startHide(a) {
    const spot = nearestRestSpot(a);
    a.task = { kind: "hide" };
    a.thought = "Stay inside until morning.";
    if (Math.random() < 0.5) say(a, chatterLine(a, "flee"));
    goTo(a, spot.x + (Math.random() * 8 - 4), spot.y + (Math.random() * 4 - 2), { anchor: spot.anchor, area: spot.area, enter: spot.enter, faceX: spot.x });
  }
  function startFlee(a) {
    for (const b of actives) if (b !== a && b.state === "fight" && b.area === a.area && dist(a.x, a.y, b.x, b.y) < 70 && canRelEvent(b, a, 25)) changeRel(b, a, -8, "Was left mid-fight by " + a.name);
    releaseClaims(a);
    say(a, pick(CHATTER.flee));
    const spot = nearestRestSpot(a);
    a.task = { kind: "rest", urgent: true, fleeing: true };
    a.thought = "Too dangerous!";
    goTo(a, spot.x + (Math.random() * 8 - 4), spot.y + (Math.random() * 4 - 2), { anchor: spot.anchor, area: spot.area, enter: spot.enter, faceX: spot.x });
  }
  function startEat(a) {
    a.task = { kind: "eat" };
    a.state = "do"; a.doKind = "eat"; a.doT = 1.6; a.vx = a.vy = 0;
    a.thought = "Food time.";
  }
  function startCook(a) {
    a.task = { kind: "cook" };
    a.cookLeft = Math.min(2, cookables(a).length);
    a.thought = "Let's get cooking.";
    goTo(a, firepit.x + (Math.random() * 10 - 5), firepit.y + 13 + (Math.random() * 4 - 2), { anchor: "firepit", area: "town", faceX: firepit.x });
  }
  function startForage(a) {
    // berries in town grass, mushrooms at the ring or the deepwood patch,
    // or fish off the lakeshore dock — whichever is closest (hops count)
    const opts = [
      { what: "berries", x: FORAGE_SPOT.x, y: FORAGE_SPOT.y, area: "town" },
      { what: "mushroom", x: mushRing.x, y: mushRing.y, area: "route" },
      { what: "mushroom", x: mushPatch.x, y: mushPatch.y, area: "deepwood" },
      { what: "raw_fish", x: dockSpot.x, y: dockSpot.y, area: "lake", anchor: "dock" },
    ];
    let best = opts[0], bd = 1e9;
    for (const o of opts) {
      const hops = areaHops(o.area, a.area);
      const d = dist(a.x, a.y, o.x, o.y) + hops * 380;
      if (d < bd) { bd = d; best = o; }
    }
    a.task = { kind: "forage", what: best.what };
    a.thought = best.what === "raw_fish" ? "The lake's full of fish."
      : best.what === "mushroom" ? "Mushrooms by the old ring." : "Maybe there are berries in the tall grass.";
    goTo(a, best.x + (Math.random() * 10 - 5), best.y + (Math.random() * 6 - 3), { area: best.area, anchor: best.anchor });
  }
  function startLeisure(a, poiWant) {
    let poi = poiWant;
    if (!poi) {
      const weighted = [];
      for (const p of LEISURE) {
        let w = p.area === a.area ? 3 : 1;
        if (p.pref && a.traits.has(p.pref)) w += 3;
        if (p.id === "garden" && a.traits.has("shy")) w += 2;
        for (let i = 0; i < w; i++) weighted.push(p);
      }
      poi = pick(weighted);
    }
    a.task = { kind: "leisure", poi };
    a.thought = pick(CHATTER[{ read: "read", relax: "relax", garden: "garden", well: "well", dummy: "dummy", bench: "relax", shrine: "shrine" }[poi.id]] || CHATTER.idle);
    goTo(a, poi.x + (Math.random() * 8 - 4), poi.y + (Math.random() * 4 - 2), { anchor: poi.anchor, area: poi.area, faceX: poi.x });
  }
  function startGather(a) { a.task = { kind: "gather" }; a.thought = pick(CHATTER.gather); goTo(a, firepit.x + (Math.random() * 14 - 7), firepit.y + 14 + (Math.random() * 4 - 2), { anchor: "firepit", area: "town", faceX: firepit.x }); }
  function startShelter(a) {
    const list = AREAS[a.area].shelters.length ? AREAS[a.area].shelters : REST_SPOTS;
    let best = null, bd = 1e9;
    for (const sp of list) {
      if (sp.anchor && buildingByKey[sp.anchor] && buildingByKey[sp.anchor].hp <= 0) continue;
      const d = dist(a.x, a.y, sp.x, sp.y); if (d < bd) { bd = d; best = sp; }
    }
    if (!best) best = { x: SQUARE.x, y: SQUARE.y + 6, anchor: null, area: "town" };
    a.task = { kind: "shelter" };
    a.thought = pick(CHATTER.shelter);
    if (Math.random() < 0.5) say(a, chatterLine(a, "shelter"));
    goTo(a, best.x + (Math.random() * 10 - 5), best.y + (Math.random() * 4 - 2), { anchor: best.anchor, area: a.area, enter: best.enter, faceX: best.x });
  }
  function startFarm(a, action, target) {
    a.task = { kind: "farm", action };
    if (action === "berry") { a.task.bush = target; goTo(a, target.x, target.y + 5, { area: target.area, faceX: target.x }); }
    else { a.task.plot = target; target.claimedBy = a.id; goTo(a, target.x + (Math.random() * 6 - 3), target.y + 6, { area: "town", faceX: target.x }); }
    a.thought = pick(CHATTER.farm);
    if (Math.random() < 0.4) say(a, chatterLine(a, "farm"));
  }
  function startHunt(a) {
    const an = nearestAnimal(a);
    if (!an) {
      // no game here — trek to the nearest area that still has some
      let other = null, bd = 99;
      for (const k of ORDER) {
        if (k === a.area || !animalsAlive(k)) continue;
        const hops = areaHops(k, a.area);
        if (hops < bd) { bd = hops; other = k; }
      }
      if (other) {
        const z = AREAS[other].hunt;
        a.task = { kind: "stroll" };
        a.thought = "The game's better over in " + AREAS[other].name + ".";
        goTo(a, z.x + z.w / 2, z.y + z.h / 2, { area: other, stroll: true });
        return;
      }
      startForage(a); return;
    }
    a.task = { kind: "hunt", target: an };
    a.state = "hunt"; a.huntT = 0; a.missCount = 0;
    a.thought = "We need meat for the campfire.";
    if (Math.random() < 0.6) say(a, "I saw a " + an.kind + "!");
  }
  function startFight(a, e) {
    releaseClaims(a);
    a.task = { kind: "fight", target: e };
    a.state = "fight";
    a.thought = "Protect the town!";
    if (Math.random() < 0.6) say(a, chatterLine(a, "combat"));
  }
  function repairCrew(s) {
    // count workers on the job AND on their way to it
    let n = actives.filter(a => a.task && a.task.kind === "repair" && a.task.shack === s &&
      (a.state === "walk" || (a.state === "do" && a.doKind === "repair"))).length;
    n += villagers.filter(v => v.repairShack === s &&
      (v.state === "repair" || (v.state === "walk" && v.goal && v.goal.repair))).length;
    return n;
  }
  function startRepair(a, s) {
    a.task = { kind: "repair", shack: s };
    a.thought = a.cls === "Healer" ? "The light can mend this." : "Hammer time.";
    if (Math.random() < 0.5) say(a, pick(["We'll have this fixed in no time.", "Pass the nails.", "Right, let's rebuild."]));
    goTo(a, s.x + (Math.random() * 8 - 4), s.by + 7, { anchor: s.id, area: s.area, faceX: s.x });
    // the tiger drops what she's doing to cover the builder on a job
    if (a.traits.has("builder")) {
      const yen = actives.find(b => b.id === "yenna" && b.state !== "ko" && hpPct(b) > 40 && !b.chargeSkill);
      if (yen && (yen.state === "idle" ||
          (yen.state === "walk" && (!yen.task || ["stroll", "forage", "leisure"].includes(yen.task.kind)))))
        startGuard(yen, a);
    }
  }
  function startGuard(a, b, quiet) {
    a.task = { kind: "guard", target: b };
    if (!quiet) {
      a.thought = "Nobody touches " + b.name + " while they work.";
      if (Math.random() < 0.4) say(a, pick(["I've got your back.", "Build — I'll watch.", "*sniffs the air*"]));
    }
    goTo(a, b.x + (b.x > a.x ? -14 : 14), b.y + 4, { area: b.area });
  }
  // Yenna's beat around PokeTown, walked point to point once everything stands
  const PATROL = [[256, 60], [430, 150], [340, 250], [96, 200], [60, 150], [222, 80]];
  function startPatrol(a) {
    a.patrolIdx = ((a.patrolIdx == null ? -1 : a.patrolIdx) + 1) % PATROL.length;
    const p = PATROL[a.patrolIdx];
    a.task = { kind: "stroll", patrol: true };
    a.thought = "Walking the bounds. All quiet so far.";
    if (Math.random() < 0.15) say(a, pick(["All clear.", "*ears twitch*", "The town sleeps easy tonight."]));
    goTo(a, p[0] + (Math.random() * 8 - 4), p[1] + (Math.random() * 6 - 3), { area: "town", stroll: true });
  }
  function startChat(a, b) { a.task = { kind: "chat", partner: b }; a.thought = "I'll go say hi to " + b.name + "."; goTo(a, b.x, b.y, { area: b.area }); }
  function startShare(a, b) { a.task = { kind: "share", target: b }; a.thought = "I'll share with " + b.name + "."; goTo(a, b.x, b.y, { area: b.area }); }
  function startTend(a, b) {
    a.task = { kind: "tend", target: b };
    a.thought = b.name + " needs patching up.";
    say(a, "Hold still, I've got you.");
    goTo(a, b.x, b.y, { area: b.area });
  }
  function startHelp(a, b) {
    b.helper = a.id;
    a.task = { kind: "help", target: b };
    a.thought = "Hang on, " + b.name + "!";
    say(a, "Hang on, " + b.name + "!");
    goTo(a, b.x, b.y, { area: b.area });
  }

  function pickChatPartner(a) {
    const cands = actives.filter(b => b !== a && b.area === a.area && b.state !== "ko" && rel(a, b) > -40 &&
      (b.state === "idle" || (b.state === "walk" && (!b.task || b.task.kind === "stroll")) ||
       (b.state === "do" && ["gather", "leisure"].includes(b.doKind))));
    if (!cands.length) return null;
    cands.sort((x, y) => rel(a, y) - rel(a, x));   // friends first (rivals avoid each other)
    return Math.random() < 0.7 ? cands[0] : pick(cands);
  }

  /* ---- the decision brain ------------------------------------------------ */
  function chooseTask(a) {
    releaseClaims(a);
    if (a.inside) { a.inside = false; a.insideKey = null; poof(a.x, a.y - 8, a.area); }   // step back out the door
    a.task = null; a.missCount = 0; a.doKind = null; a.chargingT = 0; a.chargeSkill = null; a.chargeTarget = null;
    const ph = Time.phase(), night = ph === "night";
    const s = a.stats;

    // 0) badly hurt -> straight home
    if (hpPct(a) < 32) { startRest(a, true); return; }

    // 1) someone's down and needs a hand (same area)
    const ko = actives.find(b => b !== a && b.area === a.area && b.state === "ko" && !b.helper);
    if (ko && (a.traits.has("loyal") || a.traits.has("helper") || rel(a, ko) >= 10)) { startHelp(a, ko); return; }

    // 2) night: fight, hide, or keep cosy by the fire
    if (night) {
      let e = nearestEnemy(a.x, a.y, 1e9, a.area);
      if (e) {
        if (a.afraidT > 0 || a.weakT > 0) { startHide(a); return; }   // shaken/weakened agents sit this one out
        if ((a.traits.has("brave") || a.traits.has("helper")) && hpPct(a) > 45) {
          if (a.traits.has("helper")) {   // strategist: cover the weakest teammate
            let weak = null, wv = 70;
            for (const b of actives) if (b !== a && b.area === a.area && b.state !== "ko" && hpPct(b) < wv) { wv = hpPct(b); weak = b; }
            if (weak) e = nearestEnemy(weak.x, weak.y, 1e9, a.area) || e;
          }
          startFight(a, e); return;
        }
        startHide(a); return;
      }
      // no enemies here — brave defenders go where the trouble is
      const elsewhere = nearestEnemy(a.x, a.y, 1e9);
      if (elsewhere && (a.traits.has("brave") || a.traits.has("helper")) && hpPct(a) > 55 && a.afraidT <= 0 && a.weakT <= 0) {
        a.task = { kind: "stroll" };
        a.thought = "Trouble in the " + (elsewhere.area === "town" ? "town" : "east") + "!";
        goTo(a, AREAS[elsewhere.area].center.x, AREAS[elsewhere.area].center.y, { area: elsewhere.area, stroll: true });
        return;
      }
      if (s.energy < 50) { startRest(a); return; }
      if (s.hunger < 45 && bestFoodKey(a)) { startEat(a); return; }
      if (a.traits.has("chaotic") && Math.random() < 0.25) { startStroll(a); return; }
      startGather(a); return;
    }

    // 2a2) the Builder's calling comes FIRST: a broken roof beats breakfast
    if (a.traits.has("builder") && s.hunger > 20 && hpPct(a) > 40) {
      const brk = allStructs().find(sh => sh.hp < sh.maxhp && !nearestEnemy(sh.x, sh.by, 100, sh.area));
      if (brk && repairCrew(brk) < 2) { startRepair(a, brk); return; }
    }

    // 2b) bad weather: get under cover
    if (Weather.isWet() && s.hunger >= 30) {
      const tough = a.traits.has("hunter") || a.traits.has("brave");
      if (Weather.type === "storm" || !tough || Math.random() < 0.45) {
        if (s.energy < 35) startRest(a); else startShelter(a);
        return;
      }
    }

    // 3) hunger chain: eat -> cook -> get food
    if (s.hunger < 45) {
      if (bestFoodKey(a)) { startEat(a); return; }
      if (cookables(a).length) { startCook(a); return; }
      const readyPlot = plots.find(p => p.crop && p.stage >= 3 && !p.claimedBy);
      if (a.traits.has("hunter") && animalsAlive()) { startHunt(a); return; }
      if (readyPlot) { startFarm(a, "harvest", readyPlot); return; }
      const bush = bushes.find(b => b.ready && b.area === a.area) || bushes.find(b => b.ready);
      if (bush) { startFarm(a, "berry", bush); return; }
      if (animalsAlive()) { startHunt(a); return; }
      startForage(a); return;
    }

    // 4) tired
    if (s.energy < 35) { startRest(a); return; }

    // 5) cooks pre-cook the pantry; loyal friends share meals
    if (a.traits.has("cook") && cookables(a).length >= 2 && Math.random() < 0.6) { startCook(a); return; }
    const needy = actives.find(b => b !== a && b.area === a.area && b.state !== "ko" && b.stats.hunger < 32 && !bestFoodKey(b));
    if (needy && cookedCount(a) >= 2 && (a.traits.has("cook") || a.traits.has("loyal") || rel(a, needy) >= 40)) { startShare(a, needy); return; }

    // 5c) the Healer seeks out the wounded and channels them back to FULL
    if (a.cls === "Healer") {
      const hurt = actives.find(b => b !== a && b.area === a.area && b.state !== "ko" && hpPct(b) < 70 && !nearestEnemy(b.x, b.y, 120, b.area));
      if (hurt) { startTend(a, hurt); return; }
    }

    // 5c2) Yenna stands guard over the builder while he works
    if (a.id === "yenna" && hpPct(a) > 40) {
      const builder = actives.find(b => b !== a && b.traits.has("builder") && b.state !== "ko" &&
        ((b.task && b.task.kind === "repair") || (b.state === "do" && b.doKind === "repair")));
      if (builder) { startGuard(a, builder); return; }
    }

    // 5d) the town comes first: rebuild anything the monsters smashed
    const broken = allStructs().find(sh => sh.area === a.area && sh.hp < sh.maxhp && !nearestEnemy(sh.x, sh.by, 100, sh.area));
    if (broken && repairCrew(broken) < 2 && Math.random() < (a.traits.has("builder") ? 0.95 : a.traits.has("helper") || a.traits.has("loyal") || a.traits.has("farmer") ? 0.6 : 0.3)) {
      startRepair(a, broken); return;
    }
    // ...and the Builder will cross the world for a broken roof
    if (a.traits.has("builder")) {
      const farBroken = allStructs().find(sh => sh.hp < sh.maxhp && !nearestEnemy(sh.x, sh.by, 100, sh.area));
      if (farBroken && repairCrew(farBroken) < 2) { startRepair(a, farBroken); return; }
    }
    // 5e) every roof stands -> the tiger walks her beat (it's what she's FOR)
    if (a.id === "yenna" && allStructs().every(sh => sh.hp >= sh.maxhp) && Math.random() < 0.7) {
      if (a.area !== "town") { a.task = { kind: "stroll" }; a.thought = "Back to my rounds."; goTo(a, SQUARE.x, SQUARE.y, { area: "town", stroll: true }); return; }
      startPatrol(a); return;
    }

    // 6) farm chores (mornings especially)
    const chore = farmChore();
    if (chore && (a.traits.has("farmer") || Time.hour() < 11 || Math.random() < 0.45)) { startFarm(a, chore.action, chore.plot); return; }

    // 7) hunters stock the pantry
    if (a.traits.has("hunter") && rawMeatCount(a) < 2 && animalsAlive() && Math.random() < 0.5) { startHunt(a); return; }

    // 8) socialise
    if (a.chatCD <= 0 && Math.random() < (a.traits.has("shy") ? 0.35 : 0.65)) {
      const partner = pickChatPartner(a);
      if (partner) { startChat(a, partner); return; }
    }

    // 9) cosy mood top-ups; sunset draws everyone to the fire
    if (s.mood < 55 && Math.random() < 0.6) { startLeisure(a); return; }
    if (ph === "sunset" && Math.random() < 0.5) { startGather(a); return; }
    if (Math.random() < 0.25) { startLeisure(a); return; }

    // 10) just wander
    startStroll(a);
  }
  const pickGoal = chooseTask;   // old name, kept for the wave handler below

  function greet(a, b) {
    a.state = "wave"; a.waveT = 1.6; a.wavePartner = b; a.vx = a.vy = 0;
    a.socialCD = 5 + Math.random() * 3;
    a.stats.mood = Math.min(100, a.stats.mood + 4);
    a.facing = b.x < a.x ? -1 : 1;
  }

  function knockOut(a, cause) {
    releaseClaims(a);
    a.state = "ko"; a.koT = 9; a.task = null; a.goal = null; a.doKind = null;
    a.vx = a.vy = 0; a.helper = null; a.chargingT = 0;
    a.inside = false; a.insideKey = null;
    a.koCause = cause === "hunger" ? "they collapsed from hunger"
      : cause === "combat" ? "struck down in the fray"
      : "struck down by a " + cause;
    a.chargeSkill = null; a.chargeTarget = null;
    say(a, pick(CHATTER.hurt));
    logEvent(cause === "hunger" ? a.name + " fainted from hunger!" : a.name + " was downed by a " + cause + "!");
  }
  // back on your feet — with partial health and shaky knees. Used by both the
  // panel's REVIVE button and agents helping each other up.
  function revive(a, helper) {
    if (a.state !== "ko") return;
    a.stats.health = Math.max(a.stats.health, a.maxHP * 0.35);
    a.stats.energy = Math.max(10, a.stats.energy - 15);
    a.weakT = 60;
    a.state = "idle"; a.idleT = 0.3; a.koT = 0; a.koWalk = true; a.helper = null;
    floatText(a.x, a.y - 18, helper ? "Helped to safety" : "Revived!", "#a8f0c0", a.area);
    say(a, "Thanks... I owe you one.");
    if (helper) {
      relBoth(helper, a, 15, "Helped");
      if (helper.id && resolveTree(helper)) grantXP(helper, 18);
      logEvent(helper.name + " revived " + a.name + "!");
    } else logEvent(a.name + " was revived.");
  }

  function decayStats(a, dt) {
    const s = a.stats;
    const resting = a.state === "do" && (a.doKind === "rest" || a.doKind === "hide");
    const m = resting ? 0.35 : 1;
    s.hunger = Math.max(0, s.hunger - 1.0 * m * dt);
    if (!resting && a.state !== "ko") s.energy = Math.max(0, s.energy - 0.72 * dt);
    s.mood = Math.max(0, s.mood - 0.3 * dt);
    s.mana = Math.min(100, s.mana + (resting ? 9 : 4) * dt + (a.passiveManaRegen || 0) * dt);   // mana trickles back, faster in bed (INNER FLAME helps)
    if (s.hunger <= 0) s.health = Math.max(0, s.health - 0.7 * dt);
    else if (s.hunger < 20) s.mood = Math.max(0, s.mood - 0.5 * dt);
    if (s.hunger > 45 && a.state !== "ko") s.health = Math.min(a.maxHP, s.health + (0.35 + (a.passiveRegen || 0)) * dt);
    if (s.energy <= 0 && a.state !== "ko" && a.state !== "do" && (!a.task || a.task.kind !== "rest")) startRest(a, true);
  }

  /* ---- doing things: per-second effects & completions -------------------- */
  function applyDo(a, dt) {
    const s = a.stats;
    if (a.doKind === "rest") {
      // resting under the great Healing Tree heals fastest — with an aura
      const underTree = a.area === "town" && dist(a.x, a.y, healTree.x, healTree.y + 10) < 28;
      s.energy = Math.min(100, s.energy + (underTree ? 11 : 9) * dt);
      s.health = Math.min(a.maxHP, s.health + (underTree ? 7 : 4) * dt);
      s.mood = Math.min(100, s.mood + (underTree ? 2 : 1) * dt);
      if (underTree && Math.random() < dt * 9) {
        // green plus signs sprout from the ground and float up into the air
        const life = 1.3 + Math.random() * 0.4;
        parts.push({
          type: "heal",
          x: a.x + (Math.random() * 26 - 13), y: a.y + 2 + Math.random() * 3,   // at the dirt
          area: "town", life, maxLife: life,
          vx: (Math.random() - 0.5) * 3, vy: -12 - Math.random() * 7,           // rising
        });
      }
    }
    else if (a.doKind === "hide") { s.mood = Math.max(0, s.mood - 0.3 * dt); }
    else if (a.doKind === "gather") { s.mood = Math.min(100, s.mood + 5 * dt); }
    else if (a.doKind === "leisure" && a.task && a.task.poi) {
      s.mood = clamp(s.mood + a.task.poi.mood * dt, 0, 100);
      s.energy = clamp(s.energy + a.task.poi.energy * dt, 0, 100);
    }
    else if (a.doKind === "shelter") { s.mood = Weather.type === "storm" ? Math.max(0, s.mood - 0.4 * dt) : Math.min(100, s.mood + 0.3 * dt); }
    else if (a.doKind === "guard") {
      // on watch: face the nearest threat, or scan away from the builder
      const b = a.task && a.task.target;
      const e = nearestEnemy(a.x, a.y, 140, a.area);
      if (e) a.facing = e.x < a.x ? -1 : 1;
      else if (b) a.facing = b.x > a.x ? -1 : 1;   // back to the worker, eyes outward
    }
    else if (a.doKind === "tend" && a.task && a.task.target) {
      // HEALING BLOOM: warm light flows until the patient is WHOLE — rank feeds the rate
      const b = a.task.target;
      const r = Math.max(1, rankOf(a, "healing_bloom"));
      if (b.state !== "ko" && b.area === a.area && dist(a.x, a.y, b.x, b.y) < 24) {
        a.facing = b.x < a.x ? -1 : 1;
        b.stats.health = Math.min(b.maxHP, b.stats.health + (16 + r * 6) * dt);
        if (Math.random() < dt * 9) parts.push({ type: "heal", x: b.x + (Math.random() * 14 - 7), y: b.y + 1 + Math.random() * 3, area: b.area, life: 1.2, maxLife: 1.2, vx: (Math.random() - 0.5) * 3, vy: -11 - Math.random() * 6 });
        if (r >= 3 && Math.random() < dt * (3 + r)) parts.push({ type: "petal", x: b.x + (Math.random() * 16 - 8), y: b.y - Math.random() * 12, area: b.area, life: 1.1, maxLife: 1.1, vx: (Math.random() - 0.5) * 8, vy: -7 });   // FLOWER BURST
        if (Math.random() < dt * 5) parts.push({ type: "lightmote", x: a.x + (a.facing > 0 ? 5 : -5), y: a.y - 9, area: a.area, life: 0.4, maxLife: 0.4, vx: a.facing * 14, vy: -2 });
      }
    }
    else if (a.doKind === "farm" && a.task && a.task.action === "water" && a.task.plot) {
      // blue droplets sprinkle over the plot while watering
      if (Math.random() < dt * 14) parts.push({ type: "splash", x: a.task.plot.x + (Math.random() * 12 - 6), y: a.task.plot.y - 3 - Math.random() * 4, area: "town", life: 0.3, maxLife: 0.3, vx: 0, vy: 9 });
    }
    else if (a.doKind === "repair" && a.task && a.task.shack) {
      const sh = a.task.shack;
      const wasFull = sh.hp >= sh.maxhp;
      if (a.traits.has("builder")) {   // nobody rebuilds like Atlas
        sh.hp = Math.min(sh.maxhp, sh.hp + 40 * dt);
        a.repairKnock = (a.repairKnock || 0) - dt;
        if (a.repairKnock <= 0) { a.repairKnock = 0.28; a.lungeT = 0.1; sparkBurst(sh.x + (Math.random() * 14 - 7), sh.by - 8 - Math.random() * 12, sh.area); }
      } else if (a.cls === "Healer") {   // magical mending: golden motes flow into the wood
        sh.hp = Math.min(sh.maxhp, sh.hp + 30 * dt);
        if (Math.random() < dt * 9) parts.push({ type: "lightmote", x: sh.x + (Math.random() * 20 - 10), y: sh.by - 4 - Math.random() * 18, area: sh.area, life: 0.6, maxLife: 0.6, vx: 0, vy: -6 });
      } else {                    // good honest hammering
        sh.hp = Math.min(sh.maxhp, sh.hp + 20 * dt);
        a.repairKnock = (a.repairKnock || 0) - dt;
        if (a.repairKnock <= 0) {
          a.repairKnock = 0.55;
          a.lungeT = 0.1;
          sparkBurst(sh.x + (Math.random() * 12 - 6), sh.by - 8 - Math.random() * 10, sh.area);
        }
      }
      if (sh.hp >= sh.maxhp && sh.state === "rubble") {
        sh.state = "intact";
        poof(sh.x, sh.by - 10, sh.area);
        logEvent("The " + sh.name.toLowerCase() + " stands again!");
        a.stats.mood = clamp(a.stats.mood + 8, 0, 100);
      }
      if (!wasFull && sh.hp >= sh.maxhp) grantXP(a, 14);   // good work feeds the legend too
    }
  }
  function doDone(a) {
    if (a.doKind === "rest") return a.stats.energy >= 90 && hpPct(a) >= (a.task && a.task.urgent ? 85 : 70);
    if (a.doKind === "hide") return Time.phase() !== "night" || !nearestEnemy(a.x, a.y, 1e9, a.area);
    if (a.doKind === "shelter") return !Weather.isWet();
    if (a.doKind === "repair") return !a.task || !a.task.shack || a.task.shack.hp >= a.task.shack.maxhp || !!nearestEnemy(a.x, a.y, 90, a.area);
    if (a.doKind === "tend") {   // done when the patient is at FULL health (or gone)
      const b = a.task && a.task.target;
      return !b || b.state === "ko" || b.area !== a.area || dist(a.x, a.y, b.x, b.y) > 30 || b.stats.health >= b.maxHP;
    }
    return false;
  }

  function eatNow(a) {
    const k = bestFoodKey(a);
    if (!k) return false;
    removeItem(a, k, 1);
    const f = FOODS[k];
    a.stats.hunger = clamp(a.stats.hunger + f.hunger, 0, 100);
    a.stats.mood = clamp(a.stats.mood + f.mood, 0, 100);
    if (f.cooked) a.stats.health = clamp(a.stats.health + 4, 0, a.maxHP);
    if (f.raw && Math.random() < 0.35) { a.stats.health = Math.max(0, a.stats.health - 4); say(a, "Ugh... raw."); }
    floatText(a.x, a.y - a.sh - 6, "Ate " + f.label, "#d8f0a8", a.area);
    // a shared meal by the fire warms everyone up
    if (a.area === "town" && dist(a.x, a.y, firepit.x, firepit.y) < 46) {
      const buddies = actives.filter(b => b !== a && b.area === "town" && b.state === "do" && ["eat", "gather", "cook"].includes(b.doKind) && dist(b.x, b.y, firepit.x, firepit.y) < 46);
      if (buddies.length) {
        a.stats.mood = clamp(a.stats.mood + 6, 0, 100);
        for (const b of buddies) { b.stats.mood = clamp(b.stats.mood + 6, 0, 100); if (canRelEvent(a, b, 30)) relBoth(a, b, 5, "Shared a meal with"); }
        maybeLog("meal", "A shared meal improved everyone's mood.", 45);
      }
    }
    return true;
  }

  function applyFarm(a) {
    const task = a.task, p = task.plot;
    if (task.action === "harvest" && p && p.crop && p.stage >= 3) {
      const def = CROPS[p.crop];
      addItem(a, p.crop, def.yield);
      floatText(p.x, p.y - 8, "+" + def.yield + " " + p.crop, "#d8f0a8", "town");
      for (let k = 0; k < 4; k++) parts.push({ type: "pop", col: def.ripe, x: p.x + (Math.random() * 10 - 5), y: p.y - 2, area: "town", life: 0.5, maxLife: 0.5, vx: (Math.random() - 0.5) * 22, vy: -24 - Math.random() * 10 });
      maybeLog("harvest", a.name + " harvested " + (p.crop === "corn" ? "corn" : p.crop + "s") + ".", 18);
      p.crop = null; p.stage = 0; p.growth = 0;
    } else if (task.action === "plant" && p && !p.crop) {
      const crop = pick(["carrot", "carrot", "potato", "potato", "corn"]);
      p.crop = crop; p.stage = 1; p.growth = 0; p.water = 30;
      floatText(p.x, p.y - 8, "Planted " + (crop === "corn" ? "corn" : crop + "s"), "#d8f0a8", "town");
    } else if (task.action === "water" && p && p.crop) {
      p.water = 50;
      floatText(p.x, p.y - 8, "Watered crops", "#a8d8f0", "town");
      a.stats.mood = clamp(a.stats.mood + 2, 0, 100);
    } else if (task.action === "berry" && task.bush && task.bush.ready) {
      task.bush.ready = false; task.bush.regrowT = 80;
      addItem(a, "berries", 2);
      floatText(task.bush.x, task.bush.y - 8, "+2 berries", "#d8f0a8", task.bush.area);
    }
    if (p) p.claimedBy = null;
    for (const b of actives) if (b !== a && b.area === a.area && b.state === "do" && b.doKind === "farm" && dist(a.x, a.y, b.x, b.y) < 60 && canRelEvent(a, b, 25)) relBoth(a, b, 5, "Farmed with");
    const next = (Time.phase() !== "night" && a.stats.hunger > 30 && a.stats.energy > 25) ? farmChore() : null;
    if (next && Math.random() < (a.traits.has("farmer") ? 0.75 : 0.45)) startFarm(a, next.action, next.plot);
    else chooseTask(a);
  }

  function beginChat(a, b) {
    if (b.state === "do" && b.doKind === "chat") { chooseTask(a); return; }
    const free = b.state === "idle" || (b.state === "walk" && (!b.task || b.task.kind === "stroll")) ||
      (b.state === "do" && ["gather", "leisure"].includes(b.doKind));
    if (!free) { chooseTask(a); return; }
    releaseClaims(b);
    a.state = "do"; a.doKind = "chat"; a.doT = 3.8; a.vx = a.vy = 0;
    b.state = "do"; b.doKind = "chat"; b.doT = 3.8; b.vx = b.vy = 0; b.task = { kind: "chatted", partner: a };
    a.facing = b.x < a.x ? -1 : 1; b.facing = a.x < b.x ? -1 : 1;
    say(a, chatterLine(a, "social"));
    pendingSays.push({ agent: b, text: chatterLine(b, "social"), delay: 1.3 });
    a.chatCD = 18 + Math.random() * 14; b.chatCD = 14 + Math.random() * 12;
  }
  function finishChat(a) {
    const b = a.task && a.task.partner;
    if (b) {
      const grumpy = a.stats.mood < 30 || a.stats.hunger < 18 || b.stats.mood < 30 || b.stats.hunger < 18;
      if (grumpy && Math.random() < 0.35) {
        relBoth(a, b, -10, "Argued with");
        say(a, pick(CHATTER.awkward));
        pendingSays.push({ agent: b, text: pick(CHATTER.awkward), delay: 0.7 });
        maybeLog("argue", "An argument broke out between " + a.name + " and " + b.name + ".", 30);
      } else {
        let d = 5 + Math.random() * 4;
        if (a.traits.has("shy") || b.traits.has("shy")) d *= 0.8;
        if (a.stats.mood > 70 && b.stats.mood > 70) d += 2;
        relBoth(a, b, Math.round(d), "Chatted with");
        a.stats.mood = clamp(a.stats.mood + 6, 0, 100);
        b.stats.mood = clamp(b.stats.mood + 6, 0, 100);
      }
    }
    chooseTask(a);
  }

  function doShare(a, b) {
    const k = COOKED_ORDER.find(key => a.inv[key]) || (a.inv.berries ? "berries" : null);
    if (k) {
      removeItem(a, k, 1); addItem(b, k, 1);
      floatText((a.x + b.x) / 2, Math.min(a.y, b.y) - 22, "Shared food", "#a8f0c0", a.area);
      relBoth(a, b, 12, "Shared food with");
      maybeLog("share", a.name + " shared a meal with " + b.name + ".", 15);
      say(b, "Thanks for helping me.");
      if (b.state === "idle" || (b.state === "walk" && (!b.task || b.task.kind === "stroll"))) startEat(b);
    }
    chooseTask(a);
  }

  function finishDo(a) {
    const k = a.doKind;
    if (k === "eat") {
      eatNow(a);
      if (a.stats.hunger < 40 && bestFoodKey(a)) { a.doT = 1.4; return; }
      chooseTask(a); return;
    }
    if (k === "cook") {
      cookBatch(a);
      a.cookLeft = (a.cookLeft || 1) - 1;
      if (a.cookLeft > 0 && cookables(a).length) { a.doT = 3; return; }
      if (a.stats.hunger < 55 && bestFoodKey(a)) { a.task = { kind: "eat" }; a.doKind = "eat"; a.doT = 1.6; return; }
      chooseTask(a); return;
    }
    if (k === "forage") {
      const what = (a.task && a.task.what) || "berries";
      if (Math.random() < 0.7) { const n = 1 + (Math.random() < 0.4 ? 1 : 0); addItem(a, what, n); floatText(a.x, a.y - a.sh - 6, "+" + n + " " + FOODS[what].label, "#d8f0a8", a.area); }
      else floatText(a.x, a.y - a.sh - 6, "nothing here...", "#cfd8f2", a.area);
      chooseTask(a); return;
    }
    if (k === "farm") { applyFarm(a); return; }
    if (k === "help") {
      const b = a.task && a.task.target;
      if (b && b.state === "ko") revive(b, a);
      chooseTask(a); return;
    }
    if (k === "tend") {
      const b = a.task && a.task.target;
      if (b && b.state !== "ko" && b.stats.health >= b.maxHP) {   // the channel finished: good as new
        b.stats.mood = clamp(b.stats.mood + 8, 0, 100);
        floatText(b.x, b.y - b.sh - 6, "FULLY HEALED!", "#a8f0c0", b.area);
        const rr = Math.max(1, rankOf(a, "healing_bloom"));
        playFX("heal", b.x, b.y - 10, b.area, 0.8 + rr * 0.12);
        playFX("impact_green", b.x, b.y - 6, b.area, 0.6 + rr * 0.1);
        for (let i = 0; i < 4 + rr * 3; i++) parts.push({ type: "petal", x: b.x + (Math.random() * 18 - 9), y: b.y - 2 - Math.random() * 12, area: b.area, life: 1.2, maxLife: 1.2, vx: (Math.random() - 0.5) * 14, vy: -9 - Math.random() * 5 });   // the bloom BURSTS
        say(b, pick(["Good as new!", "Thank you, Suni!", "I owe you one."]));
        relBoth(a, b, 8, "Healed to full");
        grantXP(a, 12);
        maybeLog("tend", a.name + " healed " + b.name + " back to full health.", 25);
      }
      chooseTask(a); return;
    }
    if (k === "chat") {
      if (a.task && a.task.kind === "chat") { finishChat(a); return; }
      chooseTask(a); return;
    }
    if (k === "gather") {
      for (const b of actives) {
        if (b !== a && b.area === a.area && b.state === "do" && ["gather", "eat", "cook"].includes(b.doKind) && dist(a.x, a.y, b.x, b.y) < 42 && canRelEvent(a, b, 30)) {
          relBoth(a, b, 3, "Sat by the fire with");
          maybeLog("campfire", "Stories around the campfire bring the town closer.", 60);
        }
      }
      chooseTask(a); return;
    }
    if (k === "shelter") {
      for (const b of actives) {
        if (b !== a && b.area === a.area && b.state === "do" && b.doKind === "shelter" && dist(a.x, a.y, b.x, b.y) < 28 && canRelEvent(a, b, 40)) {
          relBoth(a, b, 4, "Sheltered with");
        }
      }
      if (!Weather.isWet() && Math.random() < 0.5) say(a, pick(CHATTER.weatherClear));
      chooseTask(a); return;
    }
    if (k === "guard") {
      const b = a.task && a.task.target;
      const threat = b && b.area === a.area ? nearestEnemy(b.x, b.y, 90, b.area) : null;
      if (threat) { startFight(a, threat); return; }   // something's stalking the builder — intercept!
      if (b && b.state !== "ko" && b.area === a.area &&
          ((b.task && b.task.kind === "repair") || (b.state === "do" && b.doKind === "repair"))) {
        startGuard(a, b, true); return;                // still working: keep watch
      }
      chooseTask(a); return;                           // job's done — stand down
    }
    chooseTask(a);   // rest / hide / leisure
  }

  /* ---- the per-frame state machine --------------------------------------- */
  function updateAgents(dt, t) {
    for (const a of actives) {
      decayStats(a, dt);
      a.socialCD = Math.max(0, a.socialCD - dt);
      a.chatCD = Math.max(0, a.chatCD - dt);
      a.atkCD = Math.max(0, a.atkCD - dt);
      a.skillCD = Math.max(0, (a.skillCD || 0) - dt);
      a.castPauseT = Math.max(0, (a.castPauseT || 0) - dt);
      a.afraidT = Math.max(0, a.afraidT - dt);
      // the RPG layer ticks: ability cooldowns, ultimate timer, buffs
      for (const k in a.abilityCDs) if (a.abilityCDs[k] > 0) a.abilityCDs[k] -= dt;
      if (a.ultCD > 0) a.ultCD -= dt;
      if (a.stratT > 0) a.stratT -= dt;
      if (a.sanctT > 0) a.sanctT -= dt;
      // SOULBOUND: husband and wife, two flames one hearth
      if (a.id === "averis" && a.passiveSoulbond > 0) {
        const su = agents.find(q => q.id === "sunbeam");
        if (su && su.area === a.area) {
          if (su.state !== "ko" && dist(a.x, a.y, su.x, su.y) < 70) {   // close together: both mend
            const rg = a.passiveSoulbond * 0.3 * dt;
            a.stats.health = Math.min(a.maxHP, a.stats.health + rg);
            su.stats.health = Math.min(su.maxHP, su.stats.health + rg);
            if (Math.random() < dt * 0.35) addPart("heart", (a.x + su.x) / 2, Math.min(a.y, su.y) - 20, a.area);
          }
          const fury = su.state === "ko" || hpPct(su) < 50;
          if (fury && !a.soulFury && Math.random() < 0.7) { say(a, pick(["SUNI!", "Get AWAY from her!", "You picked the wrong wife."])); floatText(a.x, a.y - a.sh - 12, "SOULFIRE!", "#ff9a3c", a.area, true); }
          a.soulFury = fury;
        } else a.soulFury = false;
      }
      tryUltimate(a);
      // the Healer calls down holy light on monsters that stray too close —
      // even from the safety of a doorway. NEVER while running for her life:
      // the charge roots her, and rooted prey is dead prey.
      if (a.cls === "Healer" && a.state !== "ko" && !a.chargeSkill && rankOf(a, "solar_smite") > 0 &&
          (a.abilityCDs.solar_smite || 0) <= 0 && a.stats.mana >= ABILITIES.solar_smite.mana && hpPct(a) > 30 &&
          !(a.task && (a.task.fleeing || a.task.urgent))) {
        const target = nearestEnemy(a.x, a.y, ABILITIES.solar_smite.range[1], a.area);
        if (target) {
          a.chargeSkill = "solar_smite"; a.chargeTarget = target; a.chargingT = 0.01;
          if (Math.random() < 0.5) say(a, pick(["Gathering the light...", "Hold still...", "Just a moment..."]));
        }
      }
      a.weakT = Math.max(0, a.weakT - dt);
      a.inspired = a.state === "fight" && !a.traits.has("helper") &&
        actives.some(b => b !== a && b.traits.has("helper") && b.state === "fight" && b.area === a.area && dist(a.x, a.y, b.x, b.y) < 50);
      if (a.state !== "ko" && a.stats.health <= 0) knockOut(a, a.stats.hunger <= 0 ? "hunger" : "combat");
    }
    // chance meetings -> a quick wave (kept from the original route)
    for (let i = 0; i < actives.length; i++) for (let j = i + 1; j < actives.length; j++) {
      const a = actives[i], b = actives[j];
      if (a.area !== b.area) continue;
      const freeA = (a.state === "idle" || a.state === "walk") && !(a.task && (a.task.urgent || a.task.fleeing));
      const freeB = (b.state === "idle" || b.state === "walk") && !(b.task && (b.task.urgent || b.task.fleeing));
      if (!freeA || !freeB || a.socialCD > 0 || b.socialCD > 0) continue;
      if (dist(a.x, a.y, b.x, b.y) < MEET) {
        greet(a, b); greet(b, a);
        if (canRelEvent(a, b, 20)) relBoth(a, b, 2, "Waved at");
      }
    }
    for (const a of actives) {
      ambientChatter(a, dt);
      // winding up a charged skill: rooted, facing the target, power building
      if (a.chargeSkill && a.state !== "ko") {
        const sk = skillDef(a.chargeSkill);
        const tgt = a.chargeTarget;
        const td = tgt ? dist(a.x, a.y, tgt.x, tgt.y) : 1e9;
        if (!tgt || tgt.hp <= 0 || tgt.burnT > 0 || tgt.area !== a.area ||
            (MELEE_CHARGE[a.chargeSkill] ? td > 42 : td < 13)) {
          a.chargeSkill = null; a.chargeTarget = null; a.chargingT = 0;   // lost the moment
        } else {
          a.vx = a.vy = 0;
          a.facing = tgt.x < a.x ? -1 : 1;
          a.chargingT += dt * (a.soulFury ? 1.6 : 1);   // soulfire: his casting races when Suni's in danger
          castNotes(a, dt);   // ♪ the incantation spills out
          if (a.chargingT >= sk.charge) releaseSkill(a);
          continue;
        }
      }
      // ...and the follow-through roots them a moment longer (bigger spell, longer pause)
      if (a.castPauseT > 0 && a.state !== "ko") { a.vx = a.vy = 0; continue; }
      switch (a.state) {
        case "wave": {
          a.waveT -= dt;
          if (a.wavePartner) a.facing = a.wavePartner.x < a.x ? -1 : 1;
          if (a.waveT <= 0) pickGoal(a);
          break;
        }
        case "idle": {
          a.idleT -= dt;
          if (a.idleT <= 0) chooseTask(a);
          break;
        }
        case "do": {
          applyDo(a, dt);
          a.doT -= dt;
          if (a.doT <= 0 || doDone(a)) finishDo(a);
          break;
        }
        case "walk": {
          if (!a.goal) { chooseTask(a); break; }
          a.walkT += dt;
          const kind = a.task && a.task.kind;
          // heading to another area? walk to the exit first
          const goalArea = a.goal.area || a.area;
          if (goalArea !== a.area) {
            const exit = exitToward(a.area, goalArea);
            if (!exit) { chooseTask(a); break; }
            const d = steerMove(a, exit.x, exit.y, dt, { speedMul: a.task && a.task.fleeing ? 1.3 : (a.koWalk ? 0.5 : 1) });
            if (d < 12) { moveToArea(a, exit); setWalk(a); }
            else if (a.walkT > a.walkTimeout) { releaseClaims(a); a.task = { kind: "stroll" }; a.goal = { x: 40 + Math.random() * (VW - 80), y: 56 + Math.random() * (VH - 104), stroll: true }; setWalk(a); }
            break;
          }
          if (kind === "chat" || kind === "share" || kind === "help" || kind === "tend" || kind === "guard") {  // moving targets
            const tgt = a.task.partner || a.task.target;
            const lost = !tgt || tgt.area !== a.area || (kind === "help" ? tgt.state !== "ko" : tgt.state === "ko");
            if (lost) { chooseTask(a); break; }
            a.goal.x = tgt.x; a.goal.y = tgt.y;
            if (dist(a.x, a.y, tgt.x, tgt.y) < (kind === "guard" ? 26 : 18)) {
              a.vx = a.vy = 0;
              if (kind === "chat") beginChat(a, tgt);
              else if (kind === "share") doShare(a, tgt);
              else if (kind === "tend") { a.state = "do"; a.doKind = "tend"; a.doT = 30; }   // channelled — doDone ends it when they're FULL
              else if (kind === "guard") { a.state = "do"; a.doKind = "guard"; a.doT = 2.5; }
              else { a.state = "do"; a.doKind = "help"; a.doT = 1.5; }
              break;
            }
          }
          const d = steerMove(a, a.goal.x, a.goal.y, dt, { anchor: a.goal.anchor, speedMul: a.task && a.task.fleeing ? 1.3 : (a.koWalk ? 0.5 : 1) });
          if (d < ARRIVE) { a.vx = a.vy = 0; onArrive(a); break; }
          if (a.walkT > a.walkTimeout) {    // stuck: wander off, then re-evaluate
            releaseClaims(a);
            a.task = { kind: "stroll" };
            a.goal = { x: 40 + Math.random() * (VW - 80), y: 56 + Math.random() * (VH - 104), stroll: true };
            setWalk(a);   // distance-scaled timeout, same as every other walk
          }
          break;
        }
        case "hunt": {
          const an = a.task && a.task.target;
          if (Time.phase() === "night" || !an || (Weather.type === "storm" && Weather.intensity > 0.5)) { chooseTask(a); break; }
          if (an.state === "gone" || an.area !== a.area) { const nxt = nearestAnimal(a); if (nxt) a.task.target = nxt; else { chooseTask(a); break; } break; }
          a.huntT += dt;
          const d = steerMove(a, an.x, an.y, dt, { speedMul: 1.15 });
          if (d < 9) {
            if (Math.random() < an.def.catch) {
              addItem(a, an.def.meat, 1);
              floatText(an.x, an.y - 8, "+ " + FOODS[an.def.meat].label, "#ffe9a8", a.area);
              poof(an.x, an.y, a.area);
              an.state = "gone"; an.respawnT = an.def.respawn[0] + Math.random() * (an.def.respawn[1] - an.def.respawn[0]);
              a.stats.mood = clamp(a.stats.mood + 4, 0, 100);
              maybeLog("hunt", a.name + " caught a " + an.kind + "!", 14);
              chooseTask(a);
            } else {
              floatText(a.x, a.y - a.sh - 4, "missed!", "#ffb4a0", a.area);
              an.state = "flee"; an.fleeT = 1.6;
              const ux = (an.x - a.x) / (d || 1), uy = (an.y - a.y) / (d || 1);
              an.vx = ux * an.def.speed * 1.8; an.vy = uy * an.def.speed * 1.8;
              a.missCount++;
              if (a.missCount > 2) { say(a, "It got away..."); a.stats.mood = Math.max(0, a.stats.mood - 3); chooseTask(a); }
            }
          } else if (a.huntT > 14) { say(a, "Too quick for me."); chooseTask(a); }
          break;
        }
        case "fight": {
          const e = a.task && a.task.target;
          if (!e || e.hp <= 0 || e.burnT > 0 || e.area !== a.area) {
            const nxt = nearestEnemy(a.x, a.y, 1e9, a.area);
            if (nxt && Time.phase() === "night") { a.task = { kind: "fight", target: nxt }; }
            else { chooseTask(a); }
            break;
          }
          if (hpPct(a) < 30) { a.chargeSkill = null; a.chargingT = 0; startFlee(a); break; }
          if (hpPct(a) < 45 && !a.bubbleEl && Math.random() < dt * 0.25) say(a, "I need healing!");
          const d = dist(a.x, a.y, e.x, e.y);
          // the hero kit: pick the first ready ability that fits the moment
          const tree = AGENT_TREE[a.id];
          if (tree && !a.chargeSkill) {
            let pickKey = null;
            for (const key of tree.actives) {
              const ab = ABILITIES[key];
              if (ab.heal || !rankOf(a, key)) continue;
              if ((a.abilityCDs[key] || 0) > 0) continue;
              if (a.stats.mana < (ab.mana || 0)) continue;
              if (d < ab.range[0] || d > ab.range[1]) continue;
              if (!MELEE_CHARGE[key] && d < 14) continue;   // too close to sing a spell — just swing (the charge would abort and re-pick forever)
              if (key === "whirlwind" && enemies.filter(q => q.hp > 0 && !q.burnT && q.area === a.area && dist(q.x, q.y, a.x, a.y) < 30).length < 2) continue;   // save the spin for crowds
              if (key === "summon_imps" && impMinions.some(m => m.owner === a)) continue;     // the gaggle's already out
              if (key === "summon_wolves" && wolves.some(w => w.owner === a)) continue;       // the pack's already out
              pickKey = key; break;
            }
            if (pickKey) {
              a.chargeSkill = pickKey; a.chargeTarget = e; a.chargingT = 0.01;
              a.vx = a.vy = 0;
              if (Math.random() < 0.5) say(a, MELEE_CHARGE[pickKey] ? pick(["Stand back!", "One good swing...", "Steady..."]) : pick(["Charging...", "Hold... hold...", "Wait for it..."]));
              break;
            }
          }
          if (d > 12) steerMove(a, e.x, e.y, dt, { speedMul: 1.1 });
          else {
            a.vx = a.vy = 0; a.facing = e.x < a.x ? -1 : 1;
            if (a.atkCD <= 0) {
              a.atkCD = attackCooldown(a);
              agentAttack(a, e);
            }
          }
          break;
        }
        case "ko": {
          a.koT -= dt;
          a.stats.health = Math.min(a.maxHP, a.stats.health + 1.4 * dt);
          a.stats.energy = Math.min(100, a.stats.energy + 2 * dt);
          if (a.helper) break;
          if (a.koT <= 0 && hpPct(a) >= 16) {
            a.stats.health = Math.max(a.stats.health, a.maxHP * 0.25);
            a.weakT = 40;
            a.koWalk = true;
            startRest(a, true);
          }
          break;
        }
      }
    }
    applySeparation(dt);
  }

  function onArrive(a) {
    const k = a.task && a.task.kind;
    const night = Time.phase() === "night";
    a.koWalk = false;
    // face whatever we came to use
    if (a.goal && a.goal.faceX !== undefined && Math.abs(a.goal.faceX - a.x) > 1) a.facing = a.goal.faceX < a.x ? -1 : 1;
    // step through the door: vanish inside with a little puff
    const entering = a.goal && a.goal.enter && (k === "rest" || k === "hide" || k === "shelter");
    if (entering) { a.inside = true; a.insideKey = a.goal.anchor; poof(a.x, a.y - 8, a.area); }
    if (k === "rest") { if (a.task.fleeing) a.task.fleeing = false; a.state = "do"; a.doKind = "rest"; a.doT = night ? 22 : 14; }
    else if (k === "hide") { a.state = "do"; a.doKind = "hide"; a.doT = 9; }
    else if (k === "shelter") { a.state = "do"; a.doKind = "shelter"; a.doT = 8; }
    else if (k === "cook") { a.state = "do"; a.doKind = "cook"; a.doT = 3; }
    else if (k === "forage") { a.state = "do"; a.doKind = "forage"; a.doT = 3; }
    else if (k === "leisure") { a.state = "do"; a.doKind = "leisure"; a.doT = (a.task.poi && a.task.poi.dur) || 4; }
    else if (k === "gather") { a.state = "do"; a.doKind = "gather"; a.doT = 6; }
    else if (k === "farm") { a.state = "do"; a.doKind = "farm"; a.doT = a.task.action === "plant" ? 2 : a.task.action === "water" ? 1.5 : 1.8; }
    else if (k === "repair") { a.state = "do"; a.doKind = "repair"; a.doT = 40; }
    else { a.state = "idle"; a.idleT = 0.7 + Math.random() * 1.6; }
  }

  // gentle elbow room: nobody stands inside anybody else (dormant sleepers
  // are exempt — nothing would ever walk them back to their cabins)
  function applySeparation(dt) {
    const ppl = allPeople().filter(p => p.state !== "ko" && p.active !== false && !p.inside);
    for (let i = 0; i < ppl.length; i++) for (let j = i + 1; j < ppl.length; j++) {
      const a = ppl[i], b = ppl[j];
      if (a.area !== b.area) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d > 0.01 && d < 9) {
        const push = (9 - d) * 1.8 * dt;
        const ux = (a.x - b.x) / d, uy = (a.y - b.y) / d;
        a.x += ux * push; a.y += uy * push;
        b.x -= ux * push; b.y -= uy * push;
      }
    }
  }

  // where does this villager go to sleep / hide? Their own bed — unless their
  // home is rubble (or NOTHING is left standing), in which case everyone
  // huddles together at the centre of their area (the town square in PokeTown).
  function villagerHome(v) {
    const homeGone = v.homeKey && buildingByKey[v.homeKey] && buildingByKey[v.homeKey].hp <= 0;
    if (homeGone || (!anyHomeStanding() && v.area === "town")) {
      v.communeSeed = v.communeSeed || Math.random() * 6.28;
      const c = v.area === "town" ? { x: SQUARE.x, y: SQUARE.y + 6 } : AREAS[v.area].center;
      return [c.x + Math.cos(v.communeSeed) * 14, c.y + Math.sin(v.communeSeed) * 7];
    }
    return v.sleepSpot;
  }

  // does this villager have a standing home they can actually step inside?
  function villagerDoor(v) {
    const b = v.homeKey && buildingByKey[v.homeKey];
    return b && b.hp > 0 ? b : null;
  }
  function enterVillager(v, b, dur, sleep) {
    v.inside = true; v.insideKey = b.key; v.insideT = dur; v.insideSleep = !!sleep;
    v.x = b.x; v.y = b.by + 4; v.vx = v.vy = 0;
    v.state = "idle"; v.idleT = 0.5;   // ready for when they re-emerge
    poof(v.x, v.y - 6, v.area);
    if (v.bubbleEl) { v.bubbleEl.remove(); v.bubbleEl = null; v.bubbleT = 0; }
  }

  /* ---- villagers: simple wander / chatter / sleep / flee loop ------------ */
  function updateVillagers(dt, t) {
    const night = Time.phase() === "night";
    for (const v of villagers) {
      v.bubbleCD -= dt;
      v.skillCD = Math.max(0, v.skillCD - dt);
      // tucked away indoors: wait out the timer (or the night), then step out
      if (v.inside) {
        const b = buildingByKey[v.insideKey];
        if (!b || b.hp <= 0) { v.inside = false; v.insideSleep = false; continue; }   // collapse ejection is handled by shackDamage
        v.insideT = (v.insideT || 0) - dt;
        const wantOut = v.insideSleep ? !night : v.insideT <= 0;
        if (wantOut && !nearestEnemy(v.x, v.y, 110, v.area)) {   // never step out into a monster's arms
          v.inside = false; v.insideSleep = false;
          poof(v.x, v.y - 6, v.area);
          v.state = "idle"; v.idleT = 1 + Math.random() * 2;
        }
        continue;
      }
      const home = villagerHome(v);
      const atSpot = dist(v.x, v.y, home[0], home[1]) < 10;
      const siege = !!nearestEnemy(v.x, v.y, 999, v.area);    // monsters in this area at all
      const scary = nearestEnemy(v.x, v.y, 70, v.area);       // monsters CLOSE
      // winding up their skill: rooted until it releases
      if (v.chargeSkill) {
        const sk = SKILLS[v.chargeSkill];
        const tgt = v.chargeTarget;
        if (!tgt || tgt.hp <= 0 || tgt.burnT > 0 || tgt.area !== v.area || (v.chargeSkill === "slash" && dist(v.x, v.y, tgt.x, tgt.y) > 38)) {
          v.chargeSkill = null; v.chargeTarget = null; v.chargingT = 0;
        } else {
          v.vx = v.vy = 0;
          v.facing = tgt.x < v.x ? -1 : 1;
          v.chargingT += dt;
          castNotes(v, dt);
          if (v.chargingT >= sk.charge) {
            const which = v.chargeSkill, e2 = v.chargeTarget;
            v.chargeSkill = null; v.chargeTarget = null; v.chargingT = 0;
            v.skillCD = sk.cd + 2;   // townsfolk recover slower than heroes
            if (which === "slash") heavySlash(v, e2); else castIcicles(v, e2);
            v.state = "idle"; v.idleT = sk.pause;
          }
          continue;
        }
      }
      // everyone who lives here can FIGHT: knights at arm's reach, ice mages from range
      if (v.skill && v.skillCD <= 0 && v.hp > v.maxhp * 0.4 && scary) {
        const reach = v.skill === "slash" ? 30 : 95;
        const foe = nearestEnemy(v.x, v.y, reach, v.area);
        if (foe && (v.skill !== "icicles" || dist(v.x, v.y, foe.x, foe.y) > 16)) {
          v.chargeSkill = v.skill; v.chargeTarget = foe; v.chargingT = 0.01;
          v.vx = v.vy = 0;
          if (Math.random() < 0.5) say(v, v.skill === "slash" ? pick(["Back, beast!", "Not my town!", "Have at you!"]) : pick(["Freeze!", "Cold welcome for you!", "Frost take you!"]));
          continue;
        }
      }
      // a monster nearby -> hurry home (unless already huddled at the spot)
      if (scary && v.state !== "flee" && !((v.state === "sleep" || v.state === "cower") && atSpot)) {
        v.state = "flee"; v.goal = { x: home[0], y: home[1], sleepy: true };
        if (v.bubbleCD <= 0) { say(v, "Eek!"); v.bubbleCD = 8; }
      }
      if (v.state === "idle") {
        v.idleT -= dt;
        if (v.bubbleCD <= 0 && !v.bubbleEl && !night && Math.random() < 0.4) { say(v, pick(CHATTER.villager)); v.bubbleCD = 12 + Math.random() * 16; }
        if (night) { v.state = "walk"; v.goal = { x: home[0], y: home[1], sleepy: true }; }
        else if (v.idleT <= 0) {
          // villagers pitch in on repairs before strolling
          const broken = allStructs().find(sh => sh.area === v.area && sh.hp < sh.maxhp && !nearestEnemy(sh.x, sh.by, 100, sh.area));
          const door = villagerDoor(v);
          if (broken && repairCrew(broken) < 2 && Math.random() < 0.5) {
            v.repairShack = broken;
            v.state = "walk"; v.goal = { x: broken.x + (Math.random() * 8 - 4), y: broken.by + 7, repair: true };
            if (Math.random() < 0.5) say(v, pick(["Oh, the poor shack...", "I'll fetch my hammer.", "We can fix this."]));
          } else if (door && Math.random() < 0.22) {
            // pop home for a bit — walk to the door and step inside
            v.state = "walk"; v.goal = { x: door.x + (Math.random() * 6 - 3), y: door.by + 5, enterHome: true };
            if (Math.random() < 0.3) say(v, pick(["Just popping home.", "Left the kettle on...", "Back in a tick."]));
          } else if (door && Math.random() < 0.35) {
            // potter about the yard — villagers stick close to their own house
            v.state = "walk"; v.goal = { x: door.x + (Math.random() * 56 - 28), y: door.by + 6 + Math.random() * 18 };
          } else {
            const spot = Math.random() < 0.6 ? pick(v.favs) : pick(AREAS[v.area].waypoints);
            v.state = "walk"; v.goal = { x: spot[0] + (Math.random() * 10 - 5), y: spot[1] + (Math.random() * 6 - 3) };
          }
        }
      } else if (v.state === "walk" || v.state === "flee") {
        if (night && v.state === "walk" && !v.goal.sleepy) v.goal = { x: home[0], y: home[1], sleepy: true };   // bedtime overrides errands
        const d = steerMove(v, v.goal.x, v.goal.y, dt, { speedMul: v.state === "flee" ? 1.5 : 1 });
        if (d < 6) {
          v.vx = v.vy = 0;
          const door = villagerDoor(v);
          const bedtime = (v.goal.sleepy || v.state === "flee") && door && dist(v.x, v.y, door.x, door.by + 5) < 30;
          if (v.goal.enterHome && door) enterVillager(v, door, 8 + Math.random() * 16, false);
          else if (bedtime) enterVillager(v, door, 999, true);   // indoors is the safest place there is
          else if (siege) v.state = "cower";                     // no sleeping through an attack!
          else if (v.goal.repair && v.repairShack) { v.state = "repair"; v.facing = v.repairShack.x < v.x ? -1 : 1; }
          else if (v.goal.sleepy || v.state === "flee") v.state = "sleep";
          else { v.state = "idle"; v.idleT = 2 + Math.random() * 5; }
        }
      } else if (v.state === "repair") {
        const sh = v.repairShack;
        if (!sh || sh.hp >= sh.maxhp || night || nearestEnemy(v.x, v.y, 90, v.area)) {
          if (sh && sh.hp >= sh.maxhp && sh.state === "rubble") { sh.state = "intact"; poof(sh.x, sh.by - 10, sh.area); logEvent("The " + sh.name.toLowerCase() + " stands again!"); }
          v.repairShack = null; v.state = "idle"; v.idleT = 1.5;
        } else {
          sh.hp = Math.min(sh.maxhp, sh.hp + 15 * dt);
          v.repairKnock = (v.repairKnock || 0) - dt;
          if (v.repairKnock <= 0) { v.repairKnock = 0.45; v.lungeT = 0.1; sparkBurst(sh.x + (Math.random() * 12 - 6), sh.by - 8 - Math.random() * 10, sh.area); }
        }
      } else if (v.state === "cower") {
        // huddled and wide awake: shivering, squeaking, cheering the defenders
        if (!siege) { v.state = night ? "sleep" : "idle"; v.idleT = 1; }
        else if (v.bubbleCD <= 0 && !v.bubbleEl) {
          const fightNearby = actives.some(a => a.area === v.area && a.state === "fight" && dist(a.x, a.y, v.x, v.y) < 110);
          say(v, pick(fightNearby ? CHATTER.cheer : CHATTER.cower));
          v.bubbleCD = 6 + Math.random() * 7;
        }
      } else if (v.state === "sleep") {
        if (siege) { v.state = "cower"; if (v.bubbleCD <= 0) { say(v, pick(CHATTER.cower)); v.bubbleCD = 7; } }
        else if (!night) { v.state = "idle"; v.idleT = 1; }
      }
    }
  }

  /* ---- travellers: walk the whole road, then vanish over the horizon ----- */
  function updateTravellers(dt, t) {
    travellerT -= dt;
    if (travellerT <= 0) {
      travellerT = 8 + Math.random() * Math.random() * 220;   // wildly uneven — bustling spells AND long lonely stretches
      if (travellers.length < 8 && Time.phase() !== "night") {
        const n = Math.random() < 0.3 ? 2 + (Math.random() < 0.3 ? 1 : 0) : 1;
        for (let k = 0; k < n; k++) spawnTraveller(k * 16);
        if (n > 1) maybeLog("caravan", "A little caravan appears on the road.", 40);
      }
    }
    for (let i = travellers.length - 1; i >= 0; i--) {
      const tr = travellers[i];
      tr.bubbleCD -= dt; tr.waveCD -= dt;
      tr.skillCD = Math.max(0, tr.skillCD - dt);
      // travellers fight back if something jumps them on the road
      if (tr.chargeSkill) {
        const sk = SKILLS[tr.chargeSkill];
        const tgt = tr.chargeTarget;
        if (!tgt || tgt.hp <= 0 || tgt.burnT > 0 || tgt.area !== tr.area) { tr.chargeSkill = null; tr.chargingT = 0; }
        else {
          tr.vx = tr.vy = 0; tr.facing = tgt.x < tr.x ? -1 : 1;
          tr.chargingT += dt;
          castNotes(tr, dt);
          if (tr.chargingT >= sk.charge) {
            const which = tr.chargeSkill, e2 = tr.chargeTarget;
            tr.chargeSkill = null; tr.chargeTarget = null; tr.chargingT = 0;
            tr.skillCD = sk.cd + 3;
            if (which === "slash") heavySlash(tr, e2); else castIcicles(tr, e2);
          }
          continue;
        }
      }
      if (tr.skill && tr.skillCD <= 0 && tr.hp > tr.maxhp * 0.4) {
        const foe = nearestEnemy(tr.x, tr.y, 30, tr.area);
        if (foe) { tr.chargeSkill = tr.skill; tr.chargeTarget = foe; tr.chargingT = 0.01; tr.vx = tr.vy = 0; continue; }
      }
      // would-be settlers turn off the road at the Deepwood Inn
      if (tr.settler && villagers.length >= 8) tr.settler = false;   // no vacancy after all
      if (tr.settler && tr.area === "deepwood") {
        const d2 = steerMove(tr, inn.x, inn.by + 9, dt, { anchor: "inn" });
        if (tr.waveCD <= 0 && !tr.bubbleEl && Math.random() < 0.2) { say(tr, pick(["That inn looks cosy...", "Maybe just one night.", "I could live here."])); tr.waveCD = 10; }
        if (d2 < 8) settleIn(tr);
        continue;
      }
      // walk the journey plan: leg by leg, all roads through town
      const lastLeg = !tr.path || tr.leg >= tr.path.length - 1;
      let txp, typ, exit = null;
      if (lastLeg) {
        const fin = tr.area === "lake" ? [350, 164] : TRAVEL_EDGE[tr.area] || [VW - 8, 150];   // lake enders stroll to the dock
        txp = fin[0]; typ = fin[1];
      } else {
        exit = exitToward(tr.area, tr.path[tr.leg + 1]);
        if (!exit) { despawnTraveller(tr); continue; }
        const vert = exit.y < 40 || exit.y > 240;   // south/north doors: wobble sideways, not up-down
        const wob = Math.sin(t / 900 + tr.phase) * 7;
        txp = exit.x + (vert ? wob : 0); typ = exit.y + (vert ? 0 : wob);
      }
      const d = steerMove(tr, txp, typ, dt, {});
      // greet whoever they pass
      if (tr.waveCD <= 0 && !tr.bubbleEl) {
        const near = actives.find(a => a.area === tr.area && a.state !== "ko" && dist(a.x, a.y, tr.x, tr.y) < 26);
        if (near) { say(tr, pick(["Hello there!", "Morning!", "Nice town!", "Safe travels!"])); tr.waveCD = 14; }
        else if (tr.bubbleCD <= 0 && Math.random() < 0.3) { say(tr, pick(CHATTER.traveller)); tr.bubbleCD = 10 + Math.random() * 12; }
      }
      if (lastLeg) {
        if (d < 9) { if (tr.area === "lake") say(tr, "Made it to the water!"); despawnTraveller(tr); }
      } else if (d < 11) {
        moveToArea(tr, exit);
        tr.leg++;
      }
    }
  }

  /* ---- the pet frog: zippy, nosy, loyal — and a monster-eater ------------- */
  function updateImp(dt, t) {
    if (!imp) return;
    imp.bubbleCD -= dt; imp.retargetT -= dt;
    imp.eatCD = Math.max(0, imp.eatCD - dt);
    imp.fatT = Math.max(0, imp.fatT - dt);
    if (imp.tongue) { imp.tongue.t -= dt; if (imp.tongue.t <= 0) imp.tongue = null; }
    const night = Time.phase() === "night";
    const owner = actives.filter(a => a.state !== "ko").sort((x, y) => dist(imp.x, imp.y, x.x, x.y) + (x.area === imp.area ? 0 : 400) - dist(imp.x, imp.y, y.x, y.y) - (y.area === imp.area ? 0 : 400))[0];
    // a weakened monster within tongue range? GULP.
    if (imp.eatCD <= 0) {
      const snack = enemies.find(e => e.area === imp.area && e.hp > 0 && e.burnT <= 0 && e.hp <= 14 && dist(imp.x, imp.y, e.x, e.y) < 34);
      if (snack) {
        imp.facing = snack.x < imp.x ? -1 : 1;
        imp.tongue = { x: snack.x, y: snack.y - 7, t: 0.28 };
        imp.eatCD = 22; imp.fatT = 5;
        imp.vx = imp.vy = 0; imp.state = "idle"; imp.idleT = 1.2;
        snack.hp = 0; snack.burnT = 0.0001;   // gone next frame, no burn show — it's INSIDE the frog
        poof(snack.x, snack.y - 4, imp.area);
        floatText(imp.x, imp.y - imp.sh - 6, "GULP!", "#c8e8a8", imp.area);
        nightKills++;
        logEvent("The frog ate a " + snack.kind + ". Whole.");
        say(imp, "*satisfied croak*");
      }
    }
    // a weakened monster in the area? the frog smells dinner and hops over
    if (imp.eatCD <= 0) {
      const prey = (() => {
        let best = null, bd = 130;
        for (const e of enemies) { if (e.area !== imp.area || e.hp > 14 || e.hp <= 0 || e.burnT > 0) continue; const d = dist(imp.x, imp.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
        return best;
      })();
      if (prey) {
        imp.goal = { x: prey.x, y: prey.y + 4 };
        imp.state = "walk";
        imp.retargetT = 0.4;   // keep re-aiming at the wounded snack
      }
    }
    // a scary (healthy) monster nearby? scoot!
    const scary = (() => {
      let best = null, bd = 50;
      for (const e of enemies) { if (e.area !== imp.area || e.hp <= 14 || e.burnT > 0) continue; const d = dist(imp.x, imp.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
      return best;
    })();
    if (scary) {
      const d = dist(imp.x, imp.y, scary.x, scary.y) || 1;
      imp.goal = { x: clamp(imp.x + (imp.x - scary.x) / d * 60, 30, VW - 30), y: clamp(imp.y + (imp.y - scary.y) / d * 60, 48, VH - 28) };
      imp.state = "walk";
    } else if (owner && owner.area !== imp.area) {
      const exit = exitToward(imp.area, owner.area);
      if (exit) {
        imp.goal = { x: exit.x, y: exit.y };
        imp.state = "walk";
        if (dist(imp.x, imp.y, exit.x, exit.y) < 12) {
          moveToArea(imp, exit);
          imp.goal = null; imp.state = "idle"; imp.retargetT = 0;   // re-target fresh in the new area
        }
      }
    } else if (imp.retargetT <= 0) {
      imp.retargetT = 1.5 + Math.random() * 2.5;
      const r = Math.random();
      // at night the imp curls up by the warmest light in its area
      if (night) {
        const nightSpots = {
          town: { x: firepit.x, y: firepit.y + 14 },
          route: { x: shrine.x, y: shrine.y + 16 },
          deepwood: { x: ruins.x, y: ruins.y + 18 },
          lake: { x: dockSpot.x, y: dockSpot.y + 4 },
        };
        const ns = nightSpots[imp.area] || nightSpots.town;
        imp.goal = { x: ns.x + (Math.random() * 16 - 8), y: ns.y + Math.random() * 6 };
      }
      else if (owner && r < 0.55) imp.goal = { x: owner.x + (Math.random() * 32 - 16), y: owner.y + (Math.random() * 22 - 11) };
      else if (r < 0.75) { const b = butterflies.find(bf => bf.area === imp.area); imp.goal = b ? { x: b.x, y: b.y } : null; }
      else { const w = pick(AREAS[imp.area].waypoints); imp.goal = { x: w[0] + (Math.random() * 20 - 10), y: w[1] + (Math.random() * 14 - 7) }; }
      imp.state = imp.goal ? "walk" : "idle";
    }
    if (imp.state === "walk" && imp.goal) {
      const d = steerMove(imp, imp.goal.x, imp.goal.y, dt, { speedMul: 1 });
      imp.walkPhase += dt * 6;   // extra-bouncy hops
      if (d < 6) {
        imp.vx = imp.vy = 0; imp.state = "idle";
        if (owner && owner.area === imp.area && dist(imp.x, imp.y, owner.x, owner.y) < 26 && Math.random() < 0.4) addPart("heart", imp.x, imp.y - 12, imp.area);
      }
    }
    if (imp.bubbleCD <= 0 && !imp.bubbleEl && Math.random() < 0.5) { say(imp, pick(CHATTER.imp), 2); imp.bubbleCD = 11 + Math.random() * 14; }
  }

  /* ==========================================================================
     18. World update + phase changes (nightfall, sunrise...)
     ========================================================================== */
  function onPhaseChange(oldPh, ph) {
    if (oldPh === null) {
      if (ph === "night") { for (let i = 0; i < 1 + Math.min(3, danger); i++) spawnEnemy(); nightSpawnT = 30; logEvent("It's night. Stay close to the fire..."); }
      else logEvent("Welcome to PokeTown. The road east leads onward...");
      return;
    }
    if (ph === "night") {
      const t = lastNow / 1000;
      if (t - lastDangerBump > 60) { if (lastDangerBump >= 0) danger = Math.min(5, danger + 1); lastDangerBump = t; }
      for (let i = 0; i < 1 + Math.min(3, danger); i++) spawnEnemy();
      nightSpawnT = 30;
      nightKills = 0;
      logEvent("Night falls. Danger level " + danger + ". Something stirs in the forest...");
      const inits = actives.map(a => { a.initiative = d20() + mod(a.dnd.dex); return a.name + " " + a.initiative; });
      logEvent("Roll for initiative! " + inits.join(" · "));
      for (const a of actives) {
        if (!a.traits.has("brave")) a.stats.mood = Math.max(0, a.stats.mood - 4);
        if (a.traits.has("shy") && (Weather.type === "storm" || Weather.type === "rain")) { a.afraidT = 20; say(a, "Stormy night... great."); }
        if (a.state === "idle" || (a.state === "walk" && a.task && a.task.kind === "stroll")) chooseTask(a);
      }
      if (claude.active) say(claude, pick(["Stay together — I have a plan.", "I'll take first watch.", "Everyone near the fire!"]));
    } else if (ph === "sunrise") {
      logEvent("The sun is rising over PokeTown.");
      if (nightKills > 0 && !actives.some(a => a.state === "ko")) logEvent("The party survived the night!");
      nightKills = 0;
      const sp = pick(actives); say(sp, chatterLine(sp, "sunrise"));
    } else if (ph === "sunset") {
      maybeLog("sunsetlog", "The light turns gold. Time to cook before dark.", 120);
      const sp = pick(actives); say(sp, chatterLine(sp, "sunset"));
    } else if (ph === "day") {
      maybeLog("daylog", "A bright new day in PokeTown.", 120);
    }
  }

  function update(dt, t) {
    lastNow = t;
    const ph = Time.phase();
    if (ph !== prevPhase) { onPhaseChange(prevPhase, ph); prevPhase = ph; }
    updateWeather(dt, t);
    updateGrass(dt);
    updatePlots(dt);
    updateAnimals(dt);
    updateEnemies(dt, t);
    updateProjectiles(dt);
    updateSmites(dt);
    updateFlameWaves(dt);
    updateMeteors(dt);
    updateStampede(dt);
    updateFxAnims(dt);
    updateWolves(dt);
    updateImpMinions(dt);
    updateResidues(dt);
    updateDebris(dt);
    updateShacks(dt);
    updateAgents(dt, t);
    updateVillagers(dt, t);
    updateTravellers(dt, t);
    updateImp(dt, t);
    // blinks, hit-flashes and lunges tick down for everyone
    for (const p of allPeople()) {
      p.blinkT -= dt;
      if (p.blinkT < -0.13) p.blinkT = 2.2 + Math.random() * 3.4;
      if (p.flashT) p.flashT = Math.max(0, p.flashT - dt);
      if (p.lungeT) p.lungeT = Math.max(0, p.lungeT - dt);
      if (p.pingT) p.pingT = Math.max(0, p.pingT - dt);
    }
    updateHotbar();
    if (!anyHomeStanding()) maybeLog("commune", "With nothing left standing, everyone huddles together at the town square.", 90);
    // ambient sparkles around Claude + campfire smoke
    if (Math.random() < dt * 2.0) sparkles.push({ x: claude.x + (Math.random() * 14 - 7), y: claude.y - claude.sh - 2 - Math.random() * 8, life: 1, vy: 5 + Math.random() * 5 });
    for (let i = sparkles.length - 1; i >= 0; i--) { const s = sparkles[i]; s.y -= s.vy * dt; s.life -= dt; if (s.life <= 0) sparkles.splice(i, 1); }
    if (Math.random() < dt * 3.4) {   // a proper rising column of smoke
      const life = 2 + Math.random() * 0.8;
      parts.push({ type: "smoke", x: firepit.x + (Math.random() * 4 - 2), y: firepit.y - 9, area: "town", life, maxLife: life, vx: Weather.wind * 3, vy: -9 - Math.random() * 4 });
    }
    // golden petals drift around the Healing Tree's canopy
    if (Math.random() < dt * 2.2) {
      const life = 1.1;
      parts.push({ type: "glint", x: healTree.x + (Math.random() * 40 - 20), y: healTree.y - 24 - Math.random() * 26, area: "town", life, maxLife: life, vx: (Math.random() - 0.5) * 5, vy: 4 + Math.random() * 4 });
    }
    updateParts(dt);
    updateFx(dt);
    updateClock();
    if (panelOpen && panelAgent && panelAgent.active) updateNeedsUI();
    if (panelOpen && panelObject) updateObjectPanel();
  }

  /* ==========================================================================
     19. Rendering
     ========================================================================== */
  /* shadows follow the sun: west in the morning, east in the evening, longer
     near sunrise/sunset, softer under clouds and moonlight */
  let shAlpha = 0.22, shStretch = 1, shOffX = 0, shColor = "rgba(20,30,18,0.22)";
  function computeShadowParams() {
    const h = Time.hour(), dark = Time.darkness();
    if (h >= 5 && h < 19) {
      const t = (h - 12) / 7;
      shOffX = Math.round(t * 3);
      shStretch = 1 + Math.abs(t) * 0.5;
    } else { shOffX = 0; shStretch = 1; }
    shAlpha = 0.22;
    if (Weather.type === "cloudy" || Weather.type === "mist" || Weather.isWet()) shAlpha *= 1 - 0.45 * Weather.intensity;
    if (dark > 0.3) { shAlpha *= 0.75; shStretch = 1; shOffX = 0; }   // soft moonlight
    shColor = "rgba(20,30,18," + shAlpha.toFixed(3) + ")";            // built once per frame
  }
  function drawShadow(cx, by, w) { ellipseFill(ctx, Math.round(cx + shOffX * (w / 16)), Math.round(by - 1), Math.round(w / 2 * shStretch), 2, shColor); }

  function drawEmote(kind, ax, ey, t) {
    const ex = Math.round(ax);
    if (kind === "zzz") { const p = (t / 520) % 1; ctx.fillStyle = "rgba(230,236,248,0.85)"; const s = p < 0.5 ? 2 : 1; ctx.fillRect(ex + 2, Math.round(ey - p * 6), s, s); }
    else if (kind === "leaf") { ctx.fillStyle = "#6fcf4a"; ctx.fillRect(ex, ey, 2, 1); ctx.fillRect(ex + 1, ey - 1, 1, 2); ctx.fillStyle = "#3f8a3f"; ctx.fillRect(ex, ey + 1, 1, 1); }
    else if (kind === "note") { ctx.fillStyle = "#35314c"; ctx.fillRect(ex + 2, ey - 2, 1, 5); ctx.fillRect(ex, ey + 2, 2, 1); ctx.fillRect(ex, ey + 3, 1, 1); }
    else if (kind === "heart") { ctx.fillStyle = "#e8556a"; ctx.fillRect(ex, ey, 1, 1); ctx.fillRect(ex + 2, ey, 1, 1); ctx.fillRect(ex, ey + 1, 3, 1); ctx.fillRect(ex + 1, ey + 2, 1, 1); }
    else if (kind === "food") { ctx.fillStyle = "#b87a4a"; ctx.fillRect(ex, ey, 2, 3); ctx.fillStyle = "#f5f1e4"; ctx.fillRect(ex + 1, ey + 3, 1, 1); }
    else if (kind === "drop") { ctx.fillStyle = "#5aa0c4"; ctx.fillRect(ex + 1, ey, 1, 1); ctx.fillRect(ex, ey + 1, 3, 2); ctx.fillStyle = "#bfe6f5"; ctx.fillRect(ex + 1, ey + 1, 1, 1); }
    else if (kind === "alert") { ctx.fillStyle = "#e8556a"; ctx.fillRect(ex + 1, ey - 1, 1, 3); ctx.fillRect(ex + 1, ey + 3, 1, 1); }
  }
  const DO_EMOTE = { rest: "zzz", hide: "alert", cook: "food", eat: "food", farm: "leaf", forage: "leaf", gather: "heart", help: "heart", tend: "heart" };

  function drawWave(a, dx, dy, t) {
    const swing = Math.round(Math.sin(t / 70) * 2);
    const hx = a.facing > 0 ? dx + a.sw - 1 + swing : dx - 4 - swing;
    const hy = dy + 2;
    ctx.fillStyle = C.outline; ctx.fillRect(hx - 1, hy - 1, 5, 6);
    ctx.fillStyle = a.skin || "#f0c89a"; ctx.fillRect(hx, hy, 3, 4);
    const bx = Math.round(a.x) + 2, by = dy - 11;
    ctx.fillStyle = C.outline; ctx.fillRect(bx - 1, by - 1, 9, 8);
    ctx.fillStyle = "#fff7ea"; ctx.fillRect(bx, by, 7, 6);
    ctx.fillStyle = "#e8a05c"; ctx.fillRect(bx + 2, by + 1, 3, 4);
    ctx.fillStyle = C.outline; ctx.fillRect(bx + 2, by + 2, 1, 2); ctx.fillRect(bx + 4, by + 2, 1, 2);
  }

  // overhead bars: health + mana only (hunger lives in the click panel)
  function drawMiniBars(a, dy) {
    const caster = isCaster(a);
    if (!(a.state === "ko" || a.state === "fight" || hpPct(a) < 70 || (caster && a.stats.mana < 60))) return;
    const w = 12, x = Math.round(a.x - w / 2), y = dy - 5;
    ctx.fillStyle = "rgba(13,16,24,0.7)"; ctx.fillRect(x - 1, y - 1, w + 2, caster ? 5 : 3);
    ctx.fillStyle = STAT_COLOR.health; ctx.fillRect(x, y, Math.max(1, Math.round(w * hpPct(a) / 100)), 1);
    if (caster) { ctx.fillStyle = STAT_COLOR.mana; ctx.fillRect(x, y + 2, Math.max(1, Math.round(w * a.stats.mana / 100)), 1); }
  }

  // the hotbar's "you are here" marker: a bouncing golden arrow + pulse ring
  function drawPing(ent, t) {
    if (!(ent.pingT > 0)) return;
    const bounce = Math.round(Math.abs(Math.sin(t / 160)) * 3);
    const px = Math.round(ent.x), py = Math.round(ent.y - (ent.sh || 12) - 12 - bounce);
    ctx.fillStyle = C.outline;
    ctx.fillRect(px - 4, py - 8, 9, 2); ctx.fillRect(px - 3, py - 6, 7, 2); ctx.fillRect(px - 2, py - 4, 5, 2); ctx.fillRect(px - 1, py - 2, 3, 2);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(px - 3, py - 8, 7, 2); ctx.fillRect(px - 2, py - 6, 5, 2); ctx.fillRect(px - 1, py - 4, 3, 2); ctx.fillRect(px, py - 2, 1, 2);
    // pulse ring at their feet
    const pr = 1 - (ent.pingT % 0.8) / 0.8;
    const r = Math.round(pr * 10) + 2;
    ctx.globalAlpha = (1 - pr) * Math.min(1, ent.pingT);
    ctx.fillStyle = "#ffd166";
    for (let k = 0; k < 10; k++) {
      const ang = k / 10 * 6.283;
      ctx.fillRect(px + Math.round(Math.cos(ang) * r), Math.round(ent.y) + Math.round(Math.sin(ang) * r * 0.5), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawBlink(ent, dx, dy) {
    if (ent.blinkT > 0 || !ent.eyes) return;   // blink lasts while blinkT in (-0.13, 0]
    ctx.fillStyle = ent.eyeCover;
    for (const [ex, ey] of ent.eyes) {
      const px = ent.facing < 0 ? dx + ent.sw - 1 - ex : dx + ex;
      ctx.fillRect(px, dy + ey, 1, 1);
    }
  }
  function drawFlash(ent, spr, dx, dy) {
    if (!ent.flashT) return;
    ctx.globalAlpha = clamp(ent.flashT / 0.12, 0, 1) * 0.75;
    if (ent.facing < 0) { ctx.save(); ctx.translate(dx + ent.sw, dy); ctx.scale(-1, 1); ctx.drawImage(ent.white, 0, 0); ctx.restore(); }
    else ctx.drawImage(ent.white, dx, dy);
    ctx.globalAlpha = 1;
  }

  function drawAgent(a, t) {
    const spr = a.active ? a.spr : a.gray;
    const useMini = a.mini && ready(a.mini.img);
    if (a.state === "ko") {                     // lying down, seeing stars
      drawShadow(a.x, a.y + a.sw / 2, a.sh - 2);
      ctx.save();
      ctx.translate(Math.round(a.x), Math.round(a.y));
      ctx.rotate(Math.PI / 2);
      if (useMini) ctx.drawImage(a.mini.img, 0, 0, a.mini.fw, a.mini.fh, Math.round(-a.mini.fw / 2), Math.round(-a.mini.foot + 4), a.mini.fw, a.mini.fh);
      else ctx.drawImage(spr, Math.round(-a.sw / 2), Math.round(-a.sh / 2));
      ctx.restore();
      a.box = { x: a.x - a.sh / 2 - 2, y: a.y - a.sw / 2 - 2, w: a.sh + 4, h: a.sw + 4 };
      const ang = t / 220;
      ctx.fillStyle = "#ffd166";
      ctx.fillRect(Math.round(a.x + Math.cos(ang) * 6), Math.round(a.y - 14 + Math.sin(ang) * 2), 1, 1);
      ctx.fillRect(Math.round(a.x + Math.cos(ang + 3.14) * 6), Math.round(a.y - 14 + Math.sin(ang + 3.14) * 2), 1, 1);
      drawMiniBars(a, Math.round(a.y - 16));
      return;
    }
    if (a.inside) {   // tucked away indoors — just a cosy Z drifting from the house
      a.box = { x: a.x - 7, y: a.y - 18, w: 14, h: 20 };
      const zt = (t / 700 + a.phase) % 2.2;
      if (zt < 1.6) { ctx.fillStyle = "rgba(230,236,248,0.65)"; const zs = zt < 0.8 ? 2 : 1; ctx.fillRect(Math.round(a.x) + 4, Math.round(a.y) - 20 - Math.round(zt * 4), zs, zs); }
      drawPing(a, t);
      return;
    }
    // pose: sit by fires/trees/benches, kneel to cook and farm
    let sink = 0;
    if (a.state === "do") {
      if (a.doKind === "gather" || a.doKind === "shelter" || a.doKind === "rest") sink = 5;
      else if (a.doKind === "leisure" && a.task && a.task.poi && ["relax", "bench", "stones"].includes(a.task.poi.id)) sink = 5;
      else if (a.doKind === "cook" || a.doKind === "farm") sink = 3;
    }
    const moving = a.state === "walk" || a.state === "hunt" || a.state === "fight";
    let bob = sink ? Math.round(Math.sin(t / 800 + a.phase) * 0.8)
      : moving ? -Math.abs(Math.round(Math.sin(a.walkPhase) * 2))
      : Math.round(Math.sin(t / 600 + a.phase) * 1.2);
    if (a.state === "do" && a.doKind === "eat") bob = -Math.abs(Math.round(Math.sin(t / 110) * 1));   // happy munching
    const lunge = a.lungeT > 0 ? Math.round(Math.sin((0.16 - a.lungeT) / 0.16 * Math.PI) * 3) * a.facing : 0;
    const dx = Math.round(a.x - a.sw / 2) + lunge, dy = Math.round(a.y - a.sh + bob);
    a.box = { x: dx - 1, y: dy - 6, w: a.sw + 2, h: a.sh + 10 };
    drawShadow(a.x, a.y, a.sw - 2);
    if (!a.active) ctx.globalAlpha = 0.8;
    if (useMini) {   // the Minifolk skin: real idle & walk frames
      const mf = miniFrame(a, t, moving);
      drawMini(a.mini, a.x + lunge, a.y + bob + (sink ? 3 : 0), a.facing, mf.f, mf.row, a.active ? null : "grayscale(1) brightness(0.85)");
      if (a.flashT > 0) drawMini(a.mini, a.x + lunge, a.y + bob, a.facing, mf.f, mf.row, "brightness(2.6) saturate(0.4)", clamp(a.flashT / 0.12, 0, 1) * 0.8);
    } else if (sink) {   // seated/kneeling: legs sink out of view, body settles lower
      if (a.facing < 0) { ctx.save(); ctx.translate(dx + a.sw, dy + sink); ctx.scale(-1, 1); ctx.drawImage(spr, 0, 0, a.sw, a.sh - sink, 0, 0, a.sw, a.sh - sink); ctx.restore(); }
      else ctx.drawImage(spr, 0, 0, a.sw, a.sh - sink, dx, dy + sink, a.sw, a.sh - sink);
    } else if (a.facing < 0) { ctx.save(); ctx.translate(dx + a.sw, dy); ctx.scale(-1, 1); ctx.drawImage(spr, 0, 0); ctx.restore(); }
    else ctx.drawImage(spr, dx, dy);
    ctx.globalAlpha = 1;
    if (a.active && !useMini) drawBlink(a, dx, dy + sink);
    if (!useMini) drawFlash(a, spr, dx, dy);
    if (a.sanctT > 0) {   // SANCTUARY WALLS: a slow ring of spectral stone posts
      for (let k = 0; k < 6; k++) {
        const ang = t / 900 + k * 1.047;
        const px2 = Math.round(a.x + Math.cos(ang) * 12), py2 = Math.round(a.y - 3 + Math.sin(ang) * 6);
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = "#9b8f7c"; ctx.fillRect(px2, py2 - 4, 2, 5);
        ctx.fillStyle = "#cfc6b4"; ctx.fillRect(px2, py2 - 4, 2, 1);
        ctx.globalAlpha = 1;
      }
    }
    if (a.stratT > 0 && Math.random() < 0.08) parts.push({ type: "lightmote", x: a.x + (Math.random() * 12 - 6), y: a.y - a.sh - 2, area: a.area, life: 0.5, maxLife: 0.5, vx: 0, vy: -8 });
    // little tools & held things make the work readable
    if (a.state === "do" && a.doKind === "cook") {           // stirring stick over the fire
      const hx = a.facing > 0 ? dx + a.sw : dx - 1;
      ctx.fillStyle = "#8a6a44";
      for (let k = 0; k < 4; k++) ctx.fillRect(Math.round(hx + a.facing * k), Math.round(dy + sink + 7 + Math.sin(t / 160) * 1.5 - k * 0.4), 1, 1);
    }
    if (a.state === "walk" && a.task && a.task.kind === "cook") drawEmote("food", a.facing > 0 ? dx + a.sw + 1 : dx - 3, dy + Math.round(a.sh / 2), t);   // carrying dinner-to-be
    if (a.state === "do" && a.doKind === "repair") {
      const hx = a.facing > 0 ? dx + a.sw : dx - 4, hy = dy + sink + Math.round(a.sh / 2) - 1;
      if (a.cls === "Healer") {   // mending light shimmers at her hands
        if (Math.sin(t / 90) > -0.3) { ctx.fillStyle = Math.random() < 0.5 ? "#ffe9a8" : "#fff7ea"; ctx.fillRect(hx + 1, hy - 1 - (Math.random() * 3 | 0), 1, 1); ctx.fillRect(hx - 1 + (Math.random() * 4 | 0), hy + 1, 1, 1); }
      } else {                    // a tiny swinging hammer
        const swing = Math.sin(t / 140) > 0 ? 0 : -2;
        ctx.fillStyle = "#5e4026"; ctx.fillRect(hx + 1, hy + swing + 1, 1, 3);
        ctx.fillStyle = "#9a9488"; ctx.fillRect(hx, hy + swing - 1, 3, 2);
      }
    }
    if (a.castPauseT > 0) {       // spell fatigue: little mana sparks while rooted
      if (Math.random() < 0.4) { ctx.fillStyle = a.cls === "Healer" ? "#ffe9a8" : "#f2b441"; ctx.fillRect(dx + (Math.random() * a.sw | 0), dy + (Math.random() * a.sh | 0), 1, 1); }
    }
    if (a.state === "do" && a.doKind === "farm" && a.task) {
      const hx = a.facing > 0 ? dx + a.sw : dx - 4, hy = dy + sink + Math.round(a.sh / 2);
      if (a.task.action === "water") {                       // tiny watering can
        ctx.fillStyle = "#5aa0c4"; ctx.fillRect(hx, hy, 3, 2); ctx.fillRect(hx + (a.facing > 0 ? 3 : -1), hy, 1, 1);
        ctx.fillStyle = "#bfe6f5"; ctx.fillRect(hx + 1, hy, 1, 1);
      } else if (a.task.action === "plant") {                // seed packet
        ctx.fillStyle = "#d9b25a"; ctx.fillRect(hx, hy - 1, 3, 4);
        ctx.fillStyle = "#8a6a44"; ctx.fillRect(hx + 1, hy, 1, 1);
      } else {                                               // basket for the harvest
        ctx.fillStyle = "#8a6a44"; ctx.fillRect(hx, hy, 4, 2); ctx.fillRect(hx, hy - 1, 1, 1); ctx.fillRect(hx + 3, hy - 1, 1, 1);
      }
    }

    if (!a.active) { // dormant: sleeping Zzz
      const zt = (t / 700 + a.phase) % 2.2;
      if (zt < 1.6) { ctx.fillStyle = "rgba(230,236,248,0.8)"; const s = zt < 0.8 ? 2 : 1; ctx.fillRect(dx + a.sw - 2, dy - 2 - Math.round(zt * 5), s, s); }
      return;
    }
    if (a.state === "wave") drawWave(a, dx, dy, t);
    else if (a.state === "do" && a.doKind) {
      let emote = (a.doKind === "farm" && a.task && a.task.action === "water") ? "drop"
        : a.doKind === "leisure" && a.task && a.task.poi ? a.task.poi.emote
        : DO_EMOTE[a.doKind];
      if (emote) drawEmote(emote, a.x + 1, dy - 3, t);
    }
    if (a.chargeSkill) drawCharge(a, t, dx, dy, sink);
    // weapons out — only for code-drawn folk; the Minifolk art carries its own steel
    if (!useMini && !sink && !(a.state === "do" && ["repair", "tend", "eat", "cook", "farm"].includes(a.doKind))) drawGear(a, t);
    drawGrassCover(a);
    drawMiniBars(a, dy);
    drawPing(a, t);
  }

  // drawn steel & staves: fighters carry their weapons OUT now.
  // Knights (slash townsfolk/travellers): sword up + shield on the off-arm.
  // Claude: sword. Yenna: her mother's axe, in hand. Suni: the healer's staff.
  function drawGear(p, t) {
    const f = p.facing || 1;
    const hx = Math.round(p.x) + f * 6;                       // weapon hand, a step ahead
    const hy = Math.round(p.y - (p.sh || 16) * 0.45);
    if (p.id === "sunbeam") {                                  // the healer's staff, gem aglow
      ctx.fillStyle = "#7c5a36"; ctx.fillRect(hx, hy - 8, 1, 10);
      ctx.fillStyle = "#ffe9a8"; ctx.fillRect(hx - 1, hy - 10, 3, 2);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(hx, hy - 10, 1, 1);
      ctx.globalAlpha = 0.22 + 0.1 * Math.sin(t / 300);
      disc(ctx, hx, hy - 9, 3, "#ffe9a8");
      ctx.globalAlpha = 1;
    } else if (p.id === "yenna") {                             // the axe, out where everyone can see it
      ctx.fillStyle = "#7c5a36"; ctx.fillRect(hx, hy - 7, 1, 9);
      ctx.fillStyle = "#c9ced8"; ctx.fillRect(f > 0 ? hx + 1 : hx - 2, hy - 8, 2, 3);
      ctx.fillStyle = "#e8ecf2"; ctx.fillRect(f > 0 ? hx + 2 : hx - 2, hy - 7, 1, 1);
      ctx.fillStyle = "#9aa2b2"; ctx.fillRect(f > 0 ? hx - 1 : hx + 1, hy - 8, 1, 2);
    } else if (p.id === "claude" || p.skill === "slash") {     // a drawn longsword...
      ctx.fillStyle = "#e8ecf2"; ctx.fillRect(hx, hy - 7, 1, 6);
      ctx.fillStyle = "#ffffff"; ctx.fillRect(hx + f, hy - 8, 1, 2);   // the tip leans forward
      ctx.fillStyle = "#8a92a8"; ctx.fillRect(hx - 1, hy - 1, 3, 1);   // crossguard
      ctx.fillStyle = "#6b4a2e"; ctx.fillRect(hx, hy, 1, 2);           // grip
      if (p.skill === "slash") {                               // ...and a KNIGHT brings the shield too
        const sx = Math.round(p.x) - f * 6, sy = hy - 3;
        ctx.fillStyle = "#2a2a33"; ctx.fillRect(sx - 2, sy, 4, 6); ctx.fillRect(sx - 1, sy + 6, 2, 1);
        ctx.fillStyle = "#c8d4e0"; ctx.fillRect(sx - 1, sy + 1, 2, 5);
        ctx.fillStyle = "#8fb4d8"; ctx.fillRect(sx - 1, sy + 2, 2, 2);
      }
    }
  }

  // while ANY caster winds up, little musical notes spill from their mouth —
  // every spell here is sung before it's thrown
  function castNotes(p, dt) {
    if (Math.random() < dt * 7) {
      const f = p.facing || 1;
      parts.push({
        type: "note", x: p.x + f * 3, y: p.y - (p.sh || 16) + 6, area: p.area,
        life: 0.9, maxLife: 0.9, vx: f * (8 + Math.random() * 8), vy: -13 - Math.random() * 8,
      });
    }
  }

  // wind-up visuals, one per skill — the power should be VISIBLE
  function drawCharge(ent, t, dx, dy, sink) {
    const sk = skillDef(ent.chargeSkill);
    const look = CHARGE_LOOK[ent.chargeSkill] || ent.chargeSkill;
    const pr = Math.min(1, ent.chargingT / sk.charge);
    const hx = ent.facing > 0 ? dx + (ent.sw || 12) + 1 : dx - 2;
    const hy = dy + (sink || 0) + Math.round((ent.sh || 16) / 2) - 1;
    if (look === "fireball") {
      // arm thrust out, palm open — and the fire ANSWERS
      const f = ent.facing || 1;
      ctx.fillStyle = "#caa05e";
      ctx.fillRect(hx - f * 3, hy, 3, 1); ctx.fillRect(hx - f * 1, hy, 1, 1);   // the outstretched arm
      const r = 2 + Math.round(pr * 4);
      ctx.globalAlpha = 0.18 + 0.35 * pr + 0.08 * Math.sin(t / 55);
      disc(ctx, hx + f * 2, hy, r + 7, "#ff9a3c");
      ctx.globalAlpha = 1;
      disc(ctx, hx + f * 2, hy, r, "#e8702a");
      if (r > 1) disc(ctx, hx + f * 2, hy, r - 1, "#f2b441");
      ctx.fillStyle = "#fff2a0"; ctx.fillRect(hx + f * 2 - 1, hy - 1, 3, 2);
      // flame tongues licking UP off the open palm
      ctx.fillStyle = Math.sin(t / 70) > 0 ? "#f2b441" : "#e8702a";
      ctx.fillRect(hx + f * 2 - 2, hy - r - 1, 1, 2); ctx.fillRect(hx + f * 2 + 2, hy - r, 1, 2);
      if (Math.random() < 0.5) addPart("ember", hx + f * 2 + (Math.random() * 8 - 4), hy + (Math.random() * 6 - 3), ent.area);
    } else if (look === "smite") {
      // light pours into her, and a golden mark hangs over the target
      ctx.globalAlpha = 0.25 + 0.45 * pr;
      disc(ctx, Math.round(ent.x), dy - 6 - Math.round(pr * 4), 2 + Math.round(pr * 3), "#ffe9a8");
      ctx.globalAlpha = 1;
      if (Math.random() < 0.5) parts.push({ type: "lightmote", x: ent.x + (Math.random() * 14 - 7), y: ent.y - Math.random() * 6, area: ent.area, life: 0.5, maxLife: 0.5, vx: 0, vy: -16 });
      const tgt = ent.chargeTarget;
      if (tgt) {
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t / 90);
        ctx.fillStyle = "#ffe9a8";
        const mx = Math.round(tgt.x), my = Math.round(tgt.y - 22);
        ctx.fillRect(mx - 2, my, 5, 1); ctx.fillRect(mx - 1, my + 1, 3, 1); ctx.fillRect(mx, my + 2, 1, 1);
        ctx.globalAlpha = 1;
      }
    } else if (look === "slash") {
      // blade raised high, glint travelling up the edge
      const ang = -1.9 * (ent.facing || 1);
      ctx.fillStyle = "#cfd8e8";
      for (let i = 3; i <= 12; i++) ctx.fillRect(hx + Math.round(Math.cos(ang) * i) * (ent.facing || 1), hy - 2 + Math.round(Math.sin(ang) * i * 0.8), 1, 1);
      const gi = 3 + Math.round(pr * 9);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(hx + Math.round(Math.cos(ang) * gi) * (ent.facing || 1), hy - 2 + Math.round(Math.sin(ang) * gi * 0.8), 1, 1);
      if (pr > 0.6 && Math.random() < 0.3) addPart("spark", hx, hy - 8, ent.area);
    } else if (look === "icicles") {
      // shards crystallising in a swirl of frost
      for (let i = 0; i < 3; i++) {
        const ang = t / 200 + i * 2.1;
        const r = 4 + pr * 2;
        ctx.fillStyle = i === 0 ? "#e8f6ff" : "#bfe6f5";
        ctx.fillRect(hx + Math.round(Math.cos(ang) * r), hy - 3 + Math.round(Math.sin(ang) * r * 0.6), Math.random() < pr ? 2 : 1, 1);
      }
      if (Math.random() < 0.4) addPart("frost", hx + (Math.random() * 8 - 4), hy + (Math.random() * 6 - 3), ent.area);
    } else if (look === "wolves") {
      // spectral paws circling — the pack gathering on the other side
      for (let i = 0; i < 2 + Math.round(pr * 2); i++) {
        const ang = t / 260 + i * 2.4;
        const r = 8 + pr * 4;
        ctx.globalAlpha = 0.35 + 0.4 * pr;
        ctx.fillStyle = i % 2 ? "#c9bda8" : "#9a8c7a";
        ctx.fillRect(Math.round(ent.x + Math.cos(ang) * r), Math.round(ent.y - 4 + Math.sin(ang) * r * 0.45), 2, 2);
        ctx.globalAlpha = 1;
      }
      if (Math.random() < 0.3) addPart("poof", ent.x + (Math.random() * 16 - 8), ent.y - Math.random() * 6, ent.area);
    }
  }

  // villagers, travellers and the frog share one simple draw path
  function drawExtra(p, t) {
    const moving = Math.abs(p.vx) + Math.abs(p.vy) > 2;
    const shiver = p.state === "cower" ? Math.round(Math.sin(t / 45 + p.phase) * 1) : 0;
    const hop = p.kind === "frog" ? -Math.abs(Math.round(Math.sin(p.walkPhase * 1.4) * 3)) : 0;
    const bob = p.kind === "frog" ? hop : moving ? -Math.abs(Math.round(Math.sin(p.walkPhase) * 2)) : Math.round(Math.sin(t / 600 + p.phase) * 1.2);
    const dx = Math.round(p.x - p.sw / 2) + shiver, dy = Math.round(p.y - p.sh + bob);
    p.box = { x: dx - 1, y: dy - 6, w: p.sw + 2, h: p.sh + 10 };
    drawShadow(p.x, p.y, p.sw - 2);
    const useMini = p.mini && ready(p.mini.img);
    if (useMini) {
      const mf = miniFrame(p, t, moving);
      drawMini(p.mini, p.x + shiver, p.y + bob, p.facing, mf.f, mf.row);
      if (p.flashT > 0) drawMini(p.mini, p.x + shiver, p.y + bob, p.facing, mf.f, mf.row, "brightness(2.6) saturate(0.4)", clamp(p.flashT / 0.12, 0, 1) * 0.8);
    }
    else if (p.facing < 0) { ctx.save(); ctx.translate(dx + p.sw, dy); ctx.scale(-1, 1); ctx.drawImage(p.spr, 0, 0); ctx.restore(); }
    else ctx.drawImage(p.spr, dx, dy);
    if (p.kind === "frog" && p.fatT > 0) {   // a very full frog
      ctx.fillStyle = "#c8e8a8";
      ctx.fillRect(dx + 2, dy + p.sh - 3, p.sw - 4, 1);
      ctx.fillRect(dx + 1, dy + p.sh - 4, 1, 1); ctx.fillRect(dx + p.sw - 2, dy + p.sh - 4, 1, 1);
    }
    if (p.kind === "frog" && p.tongue && p.tongue.t > 0) {   // SLURP
      const mx = p.facing < 0 ? dx + 1 : dx + p.sw - 2, my = dy + 3;
      const steps = 5;
      ctx.fillStyle = "#ff9eb0";
      for (let i = 0; i <= steps; i++) {
        ctx.fillRect(Math.round(mx + (p.tongue.x - mx) * i / steps), Math.round(my + (p.tongue.y - my) * i / steps), 1, 1);
      }
      ctx.fillStyle = "#ffc4d0"; ctx.fillRect(Math.round(p.tongue.x) - 1, Math.round(p.tongue.y) - 1, 2, 2);
    }
    if (p.state !== "sleep" && !useMini) drawBlink(p, dx, dy);
    if (p.chargeSkill) drawCharge(p, t, dx, dy, 0);
    if (p.flashT > 0 && !useMini) drawFlash(p, p.spr, dx, dy);
    if (p.hp !== undefined && p.hp < p.maxhp) {   // a hurt townsperson
      const w = 12, bx = Math.round(p.x - w / 2), by2 = dy - 5;
      ctx.fillStyle = "rgba(13,16,24,0.7)"; ctx.fillRect(bx - 1, by2 - 1, w + 2, 4);
      ctx.fillStyle = p.hp < p.maxhp * 0.4 ? "#e8556a" : "#74d36c";
      ctx.fillRect(bx, by2, Math.max(1, Math.round(w * p.hp / p.maxhp)), 2);
    }
    if (p.state === "cower") drawEmote("alert", p.x + 1, dy - 4, t);
    if (p.state === "sleep") {
      const zt = (t / 700 + p.phase) % 2.2;
      if (zt < 1.6) { ctx.fillStyle = "rgba(230,236,248,0.8)"; const s = zt < 0.8 ? 2 : 1; ctx.fillRect(dx + p.sw - 2, dy - 2 - Math.round(zt * 5), s, s); }
    }
    if (!useMini && p.skill && !["sleep", "cower", "repair"].includes(p.state) && !p.dead) drawGear(p, t);   // armed townsfolk show their steel (legacy art only)
    drawGrassCover(p);
    drawPing(p, t);
  }

  function drawAnimal(an, t) {
    const hop = an.kind === "rabbit" ? -Math.abs(Math.round(Math.sin(an.phase) * 2)) : 0;
    drawShadow(an.x, an.y, 9);
    if (an.mini && ready(an.mini.img)) {
      const moving = an.state === "flee" || (Math.abs(an.x - an.tx) + Math.abs(an.y - an.ty) > 3);
      const m = an.mini;
      const f = moving ? Math.floor((t / 110 + an.phase * 3) % m.walkN) : Math.floor((t / 300 + an.phase * 3) % m.idleN);
      drawMini(m, an.x, an.y + hop, an.facing, f, moving ? m.walkRow : m.idleRow);
    } else {
      const spr = an.kind === "rabbit" ? rabbitSpr : deerSpr;
      const dx = Math.round(an.x - spr.width / 2), dy = Math.round(an.y - spr.height + hop);
      if (an.facing < 0) { ctx.save(); ctx.translate(dx + spr.width, dy); ctx.scale(-1, 1); ctx.drawImage(spr, 0, 0); ctx.restore(); }
      else ctx.drawImage(spr, dx, dy);
    }
    drawGrassCover(an);   // rabbits all but vanish in the tall grass
  }

  // monsters wear the Tiny RPG Orc now: real idle/walk/attack/death animation
  // strips (100×100 frames, drawn at 0.42). Demons are the same beast,
  // hue-shifted hellward. Falls back to the old pixel grids until images load.
  const ORC_SCALE = 0.42, ORC_FOOT = 66;
  function drawOrcFrame(e, t, strip, frame, filter, alpha) {
    const im = strip.img;
    if (!ready(im)) return false;
    const fw = 100, fh = 100;
    const dw = fw * ORC_SCALE, dh = fh * ORC_SCALE;
    const lunge = e.lungeT > 0 ? Math.round(Math.sin((0.18 - e.lungeT) / 0.18 * Math.PI) * 3) * e.facing : 0;
    const dx = Math.round(e.x - dw / 2) + lunge, dy = Math.round(e.y - ORC_FOOT * ORC_SCALE);
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    let f = filter || "";
    if (e.kind === "demon") f = "hue-rotate(-72deg) saturate(1.6) brightness(0.92) " + f;
    if (f) ctx.filter = f.trim();
    if (e.facing < 0) { ctx.translate(dx + dw, dy); ctx.scale(-1, 1); ctx.drawImage(im, frame * fw, 0, fw, fh, 0, 0, dw, dh); }
    else ctx.drawImage(im, frame * fw, 0, fw, fh, dx, dy, dw, dh);
    ctx.restore();
    return true;
  }
  function drawEnemy(e, t) {
    const orcReady = ready(ORC.idle.img);
    e.animT = (e.animT || 0);
    if (e.disT > 0) {   // disintegrating in a blaze of light
      const pr = e.disT / 0.9;
      if (!orcReady || !drawOrcFrame(e, t, ORC.death, Math.min(3, Math.floor((1 - pr) * 4)), "brightness(2.4)", pr)) {
        const spr = e.kind === "zombie" ? zombSpr : demonSpr, white = e.kind === "zombie" ? zombWhite : demonWhite;
        const ddx = Math.round(e.x - spr.width / 2), ddy = Math.round(e.y - spr.height);
        ctx.globalAlpha = pr * 0.8; ctx.drawImage(spr, ddx, ddy);
        ctx.globalAlpha = pr; ctx.drawImage(white, ddx, ddy);
        ctx.globalAlpha = 1;
      }
      return;
    }
    if (e.scorchT > 0) {   // a charred mark trails under a burning monster
      ctx.globalAlpha = 0.45 * Math.min(1, e.scorchT / 2);
      ellipseFill(ctx, Math.round(e.x), Math.round(e.y), 6, 2, "#1a0f0a");
      ctx.globalAlpha = 1;
      if (Math.random() < 0.4) { ctx.fillStyle = Math.random() < 0.5 ? "#e8702a" : "#f2b441"; ctx.fillRect(Math.round(e.x) + ((Math.random() * 10 | 0) - 5), Math.round(e.y) - 1, 1, 1); }
    }
    drawShadow(e.x, e.y, 12);
    let drewMini = false;
    if (orcReady) {
      let strip, frame;
      if (e.burnT > 0) { strip = ORC.death; frame = Math.min(3, Math.floor((1 - e.burnT / 0.9) * 4)); }
      else if (e.lungeT > 0) { strip = ORC.attack; frame = Math.min(5, Math.floor((0.18 - e.lungeT) / 0.18 * 6)); }
      else if (Math.abs(e.kbx) > 4 || e.dazzleT > 0 || e.stunT > 0) { strip = ORC.idle; frame = Math.floor((t / 240 + e.phase) % 6); }
      else { strip = ORC.walk; frame = Math.floor((t / 110 + e.phase * 4) % 8); }
      const scorchF = e.scorchT > 0 && e.burnT <= 0 ? "brightness(0.55) sepia(0.4) " : "";
      drewMini = drawOrcFrame(e, t, strip, frame, scorchF, e.burnT > 0 ? Math.max(0, e.burnT / 0.9) : undefined);
      if (drewMini && e.flashT > 0 && e.burnT <= 0) drawOrcFrame(e, t, strip, frame, "brightness(2.6)", clamp(e.flashT / 0.12, 0, 1) * 0.8);
    }
    if (!drewMini) {   // assets still loading: the old pixel-grid monsters
      const spr = e.kind === "zombie" ? zombSpr : demonSpr, white = e.kind === "zombie" ? zombWhite : demonWhite;
      const bob = e.kind === "demon" ? Math.round(Math.sin(t / 150 + e.phase) * 2) - 2 : Math.round(Math.sin(e.phase) * 1);
      const lunge = e.lungeT > 0 ? Math.round(Math.sin((0.18 - e.lungeT) / 0.18 * Math.PI) * 3) * e.facing : 0;
      const dx = Math.round(e.x - spr.width / 2) + lunge, dy = Math.round(e.y - spr.height + bob);
      if (e.burnT > 0) ctx.globalAlpha = Math.max(0, e.burnT / 0.9);
      if (e.facing < 0) { ctx.save(); ctx.translate(dx + spr.width, dy); ctx.scale(-1, 1); ctx.drawImage(spr, 0, 0); ctx.restore(); }
      else ctx.drawImage(spr, dx, dy);
      ctx.globalAlpha = 1;
      if (e.flashT > 0 && e.burnT <= 0) {
        ctx.globalAlpha = clamp(e.flashT / 0.12, 0, 1) * 0.8;
        if (e.facing < 0) { ctx.save(); ctx.translate(dx + spr.width, dy); ctx.scale(-1, 1); ctx.drawImage(white, 0, 0); ctx.restore(); }
        else ctx.drawImage(white, dx, dy);
        ctx.globalAlpha = 1;
      }
    }
    const topY = Math.round(e.y - ORC_FOOT * ORC_SCALE);
    if (e.slowT > 0 && e.burnT <= 0) {   // frostbitten: ice crystals cling to it
      ctx.fillStyle = Math.random() < 0.5 ? "#bfe6f5" : "#e8f6ff";
      ctx.fillRect(Math.round(e.x) - 6 + ((t / 90 | 0) % 12), topY + 8 + ((t / 130 | 0) % 12), 1, 1);
      ctx.fillRect(Math.round(e.x) + 4, Math.round(e.y) - 4, 1, 1);
    }
    if (e.hp < e.maxhp && e.hp > 0 && e.burnT <= 0) {
      const w = 14, x = Math.round(e.x - w / 2), y = topY + 4;
      ctx.fillStyle = "rgba(13,16,24,0.75)"; ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = "#e8556a"; ctx.fillRect(x, y, Math.max(1, Math.round(w * e.hp / e.maxhp)), 2);
    }
  }

  function drawPlot(p) {
    const x = p.x - 8, y = p.y - 6;
    ctx.fillStyle = p.water > 0 ? C.soilW : C.soilD; ctx.fillRect(x, y, 16, 12);
    ctx.fillStyle = p.water > 0 ? "#583e24" : "#8a653c";
    for (let ry = y + 2; ry < y + 12; ry += 3) ctx.fillRect(x + 1, ry, 14, 1);
    if (!p.crop) return;
    const def = CROPS[p.crop];
    for (const ox of [-5, 2]) {
      const cx = p.x + ox, cy = p.y + 2;
      if (p.stage === 1) { ctx.fillStyle = def.leaf; ctx.fillRect(cx, cy - 1, 1, 2); }
      else if (p.stage === 2) { ctx.fillStyle = def.leaf; ctx.fillRect(cx - 1, cy - 2, 3, 2); ctx.fillRect(cx, cy, 1, 1); }
      else if (p.crop === "corn") { ctx.fillStyle = def.leaf; ctx.fillRect(cx, cy - 6, 1, 6); ctx.fillRect(cx - 1, cy - 4, 1, 2); ctx.fillRect(cx + 1, cy - 5, 1, 2); ctx.fillStyle = def.ripe; ctx.fillRect(cx, cy - 3, 1, 2); }
      else { ctx.fillStyle = def.leaf; ctx.fillRect(cx - 1, cy - 3, 3, 2); ctx.fillStyle = def.ripe; ctx.fillRect(cx - 1, cy - 1, 2, 2); }
    }
  }
  function drawGrave(gv) {
    const x = Math.round(gv.x), y = Math.round(gv.y);
    drawShadow(gv.x, gv.y, 7);
    ctx.fillStyle = C.outline; ctx.fillRect(x - 3, y - 8, 7, 8);
    ctx.fillStyle = C.stone; ctx.fillRect(x - 2, y - 7, 5, 6);
    ctx.fillStyle = C.stoneD; ctx.fillRect(x - 2, y - 3, 5, 2);
    ctx.fillStyle = C.stoneDD; ctx.fillRect(x - 1, y - 6, 3, 1);   // the inscription
    ctx.fillStyle = C.flower[(x + y) % C.flower.length];   // someone leaves flowers
    ctx.fillRect(x + 3, y - 1, 2, 1);
    ctx.fillStyle = "#3f8a3f"; ctx.fillRect(x + 3, y, 1, 1);
  }
  // any big building: intact sprite (with cracks + bar when hurt) or a wide
  // rubble heap once it's been brought down
  function drawBuilding(b, spr, drawX, shadowW, t) {
    if (b.hp <= 0) {
      drawShadow(b.x, b.by, Math.round(shadowW * 0.7));
      const n = Math.round(b.w / 3.5);
      for (let i = 0; i < n; i++) {
        const px = b.x - b.w / 2 + ((hash2(b.x + i * 7, b.by) * b.w) | 0);
        const py = b.by - 1 - ((hash2(b.by + i * 11, b.x) * 8) | 0);
        ctx.fillStyle = SHACK_COLS[i % SHACK_COLS.length];
        ctx.fillRect(px, py, 2 + (i % 3), 1 + (i % 2));
      }
      ctx.fillStyle = C.outline;
      ctx.fillRect(b.x - 5, b.by - 4, 3, 1); ctx.fillRect(b.x + 4, b.by - 6, 2, 2); ctx.fillRect(b.x - b.w / 2 + 3, b.by - 2, 2, 1);
      return;
    }
    drawShadow(b.x, b.by, shadowW);
    const hit = b.hitT > 0 ? Math.round(Math.sin(t / 18)) : 0;
    ctx.drawImage(spr, drawX + hit, Math.round(b.by - spr.height));
    if (b.hp < b.maxhp * 0.6) {
      ctx.fillStyle = C.outline;
      for (let k = 0; k < 7; k++) {
        const cx2 = b.x - b.w / 2 + 4 + ((hash2(b.x + k * 7, b.by) * (b.w - 8)) | 0);
        const cy2 = b.by - 5 - ((hash2(b.by + k * 5, b.x) * 18) | 0);
        ctx.fillRect(cx2, cy2, 1, 2 + (k % 2)); ctx.fillRect(cx2 + 1, cy2 + 2, 1, 1);
      }
    }
    if (b.hp < b.maxhp) {
      const w = 24, bx = Math.round(b.x - w / 2), by2 = Math.round(b.by - spr.height - 6);
      ctx.fillStyle = "rgba(13,16,24,0.75)"; ctx.fillRect(bx - 1, by2 - 1, w + 2, 4);
      ctx.fillStyle = b.hp < b.maxhp * 0.35 ? "#e8556a" : "#d9a05c";
      ctx.fillRect(bx, by2, Math.max(1, Math.round(w * b.hp / b.maxhp)), 2);
    }
  }
  function drawShack(s, t) {
    const x = Math.round(s.x), hit = s.hitT > 0 ? Math.round(Math.sin(t / 18) * 1) : 0;
    if (s.state === "rubble") {
      // a sad heap of planks
      drawShadow(s.x, s.by, 26);
      const heap = [[-10, -2, 6, 2], [-3, -4, 8, 2], [4, -2, 7, 2], [-7, -5, 4, 1], [1, -7, 5,2], [-12, -1, 3, 1], [9, -3, 4, 1]];
      heap.forEach(([ox, oy, w, h], i) => {
        ctx.fillStyle = SHACK_COLS[i % SHACK_COLS.length];
        ctx.fillRect(x + ox, s.by + oy, w, h);
      });
      ctx.fillStyle = C.outline; ctx.fillRect(x - 6, s.by - 3, 3, 1); ctx.fillRect(x + 2, s.by - 5, 2, 1);
    } else {
      drawShadow(s.x, s.by, 30);
      ctx.drawImage(shackSpr, x - 17 + hit, Math.round(s.by - shackSpr.height));
      if (s.hp < s.maxhp * 0.6) {   // visible cracks once it's taken a beating
        ctx.fillStyle = C.outline;
        for (let k = 0; k < 5; k++) {
          const cx2 = x - 12 + ((hash2(s.x + k * 7, s.by) * 24) | 0), cy2 = s.by - 4 - ((hash2(s.by + k * 5, s.x) * 14) | 0);
          ctx.fillRect(cx2, cy2, 1, 2 + (k % 2)); ctx.fillRect(cx2 + 1, cy2 + 2, 1, 1);
        }
      }
    }
    // condition bar while hurt or under repair
    if (s.hp < s.maxhp) {
      const w = 20, bx = x - w / 2, by2 = s.by - shackSpr.height - 5;
      ctx.fillStyle = "rgba(13,16,24,0.75)"; ctx.fillRect(bx - 1, by2 - 1, w + 2, 4);
      ctx.fillStyle = s.hp < s.maxhp * 0.35 ? "#e8556a" : "#d9a05c";
      ctx.fillRect(bx, by2, Math.max(1, Math.round(w * s.hp / s.maxhp)), 2);
    }
  }
  function drawBush(b) {
    drawShadow(b.x, b.y + 1, 8);
    disc(ctx, b.x, b.y - 2, 4, C.treeO);
    disc(ctx, b.x, b.y - 3, 3, C.treeM);
    ctx.fillStyle = C.treeL; ctx.fillRect(b.x - 2, b.y - 5, 2, 1);
    if (b.ready) { ctx.fillStyle = "#e8556a"; ctx.fillRect(b.x - 2, b.y - 3, 1, 1); ctx.fillRect(b.x + 1, b.y - 4, 1, 1); ctx.fillRect(b.x, b.y - 2, 1, 1); }
  }

  // swaying blades over the tall grass (stronger in the wind). Blade spots are
  // precomputed per area — and they REACT: walk past one and it bends away,
  // then springs back with a little wobble, like real grass.
  function buildBlades(area) {
    area.blades = [];
    for (const tt of area.tallGrass) {
      for (let gy = tt.y + 4; gy < tt.y + tt.h - 2; gy += 9) {
        for (let gx = tt.x + 3; gx < tt.x + tt.w - 3; gx += 8) {
          area.blades.push({ x: gx + ((hash2(gx, gy) * 5) | 0), y: gy + ((hash2(gy, gx) * 5) | 0), e: 0, push: 0 });
        }
      }
    }
  }
  function updateGrass(dt) {
    for (const key in AREAS) {
      const blades = AREAS[key].blades;
      if (!blades || !blades.length) continue;
      // who's brushing through this area's grass right now?
      const movers = [];
      for (const m of allPeople()) if (m.area === key && m.state !== "ko" && (Math.abs(m.vx) + Math.abs(m.vy)) > 4) movers.push(m);
      for (const an of animals) if (an.area === key && an.state !== "gone" && (Math.abs(an.vx) + Math.abs(an.vy)) > 4) movers.push(an);
      for (const e of enemies) if (e.area === key && e.burnT <= 0) movers.push(e);
      for (const b of blades) {
        b.e = Math.max(0, b.e - dt * 1.4);   // springiness fades
        for (const m of movers) {
          const ddx = b.x - m.x, ddy = b.y - (m.y - 2);
          if (ddx > 11 || ddx < -11 || ddy > 9 || ddy < -9) continue;
          const dd = Math.hypot(ddx, ddy);
          if (dd < 11) {
            b.e = 1;                                            // freshly brushed
            b.push = (ddx >= 0 ? 1 : -1) * (11 - dd) / 11 * 2.5; // bend away
          }
        }
        if (b.e <= 0) b.push = 0;
      }
    }
  }
  function drawGrassSway(t) {
    const amp = Weather.type === "windy" ? 1.6 : Weather.type === "storm" ? 1.3 : 0.7;
    const blades = AREAS[viewArea].blades || [];
    // pass 1: the swaying/bending tips (3px tall — this grass is TALL)
    ctx.fillStyle = C.grassDD;
    for (const b of blades) {
      const tip = Math.round(Math.sin(t / 420 + b.x * 0.53 + b.y * 0.31) * amp + b.push * b.e + Math.sin(t / 55 + b.x) * 1.5 * b.e);
      ctx.fillRect(b.x + tip, b.y - 3, 1, 3);
    }
    // pass 2: the rooted bases (brushed blades catch the light)
    ctx.fillStyle = C.grassD;
    for (const b of blades) if (b.e <= 0.4) ctx.fillRect(b.x, b.y, 1, 1);
    ctx.fillStyle = C.grassL;
    for (const b of blades) if (b.e > 0.4) ctx.fillRect(b.x, b.y, 1, 1);
  }
  // the classic HGSS effect: anyone standing in tall grass sinks into it —
  // tufts are drawn OVER their feet/lower body
  function drawGrassCover(ent) {
    if (!inTallGrass(ent.area, ent.x, ent.y)) return;
    const baseX = Math.round(ent.x), baseY = Math.round(ent.y);
    const half = Math.max(5, Math.round((ent.sw || 10) / 2) + 1);
    for (let k = -half; k <= half; k += 3) {
      const tx = baseX + k + (((hash2(baseX + k, baseY) * 2) | 0) - 1);
      const ty = baseY - 1 - ((hash2(tx, baseY + 7) * 2) | 0);
      ctx.fillStyle = C.grassDD;
      ctx.fillRect(tx, ty - 4, 1, 5);                       // tall covering blades
      ctx.fillRect(tx - 1, ty - 2, 3, 3);
      ctx.fillStyle = C.grassD;
      ctx.fillRect(tx, ty - 2, 1, 2);
    }
  }

  function drawPuddles() {
    if (Weather.wetness < 0.05) return;
    ctx.globalAlpha = 0.45 * Weather.wetness;
    for (const [px, py] of AREAS[viewArea].puddles) {
      ellipseFill(ctx, px, py, 6, 3, C.waterO);
      ellipseFill(ctx, px - 1, py, 4, 2, C.waterL);
      ctx.fillStyle = C.waterS; ctx.fillRect(px - 2, py - 1, 2, 1);
    }
    ctx.globalAlpha = 1;
  }
  function drawCloudShadows() {
    if (!["cloudy", "rain", "storm"].includes(Weather.type) || Weather.intensity < 0.05) return;
    ctx.globalAlpha = 0.07 * Weather.intensity;
    for (const cs of cloudShadows) ellipseFill(ctx, Math.round(cs.x), Math.round(cs.y), cs.rx, cs.ry, "#1a2430");
    ctx.globalAlpha = 1;
  }
  function drawButterflies(t) {
    if (Time.darkness() > 0.2 || Weather.isWet()) return;
    for (const b of butterflies) {
      if (b.area !== viewArea || !b.x) continue;
      const open = Math.sin(b.ph * 2) > 0;
      ctx.fillStyle = hash2(b.hx, b.hy) < 0.5 ? "#f7f4e8" : "#ffd166";
      const x = Math.round(b.x), y = Math.round(b.y);
      if (open) { ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); }
      else ctx.fillRect(x, y, 1, 1);
    }
  }
  function renderWeather(t) {
    const i = Weather.intensity;
    if ((Weather.type === "rain" || Weather.type === "storm") && i > 0.05) {
      ctx.fillStyle = "rgba(190,215,255," + (0.5 * i).toFixed(2) + ")";
      for (const d of rainDrops) ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 3);
      ctx.fillStyle = "rgba(96,116,150," + (0.07 * i).toFixed(3) + ")";
      ctx.fillRect(0, 0, VW, VH);
    }
    if (Weather.type === "windy" && i > 0.05) {
      ctx.globalAlpha = 0.8 * i;
      for (const l of leaves) { ctx.fillStyle = l.col; ctx.fillRect(Math.round(l.x), Math.round(l.y), 2, 1); }
      ctx.globalAlpha = 1;
    }
    if (Weather.type === "clear" && i > 0.5 && Time.darkness() < 0.1) {
      ctx.fillStyle = "rgba(255,246,200,0.35)";
      for (const m of motes) ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
    }
    if (Weather.type === "mist" && i > 0.05) {
      ctx.globalAlpha = 0.10 * i;
      for (const b of mistBands) ellipseFill(ctx, Math.round(b.x), Math.round(b.y), b.rx, b.ry, "#dfe7f0");
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(223,231,240," + (0.08 * i).toFixed(3) + ")";
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  /* ---- day/night lighting overlay (flickering lights at night) ----------- */
  const lightCanvas = document.createElement("canvas"); lightCanvas.width = VW; lightCanvas.height = VH;
  const lightG = lightCanvas.getContext("2d");
  function computeWindowLights() {
    AREAS.town.windowLights = [
      { x: house.x - 36 + 22, y: house.y + 30 - 64 + 38, key: "house" },
      { x: house.x - 36 + 50, y: house.y + 30 - 64 + 38, key: "house" },
      { x: cabin2.x - 24 + 15, y: cabin2.by - 44 + 28, key: "cabin2" },
      { x: cabin3.x - 24 + 15, y: cabin3.by - 44 + 28, key: "cabin3" },
    ];
    AREAS.route.windowLights = [];
    AREAS.deepwood.windowLights = [   // the inn's warm windows + lantern
      { x: inn.x - 28 + 13, y: inn.by - 52 + 31, key: "inn" },
      { x: inn.x - 28 + 42, y: inn.by - 52 + 31, key: "inn" },
      { x: inn.x - 28 + 35, y: inn.by - 52 + 33, key: "inn" },
    ];
    AREAS.lake.windowLights = [];
  }
  function litWindows() { return AREAS[viewArea].windowLights.filter(w => !w.key || !buildingByKey[w.key] || buildingByKey[w.key].hp > 0); }
  function punchLight(cx, cy, r) {
    lightG.globalCompositeOperation = "destination-out";
    for (const [rr, alpha] of [[1, 0.3], [0.72, 0.4], [0.45, 0.55], [0.22, 0.75]]) {
      disc(lightG, Math.round(cx), Math.round(cy), Math.round(r * rr), "rgba(0,0,0," + alpha + ")");
    }
    lightG.globalCompositeOperation = "source-over";
  }
  function renderLighting(t) {
    const dark = clamp(Time.darkness() + Weather.darkAdd() + (AREAS[viewArea].gloom || 0), 0, 0.78);
    const warmA = Time.warm() * (Weather.isWet() || Weather.type === "mist" ? 1 - 0.8 * Weather.intensity : 1);
    if (dark > 0.02) {
      lightG.globalCompositeOperation = "source-over";
      lightG.clearRect(0, 0, VW, VH);
      lightG.fillStyle = "rgba(13,20,52," + dark.toFixed(3) + ")";
      lightG.fillRect(0, 0, VW, VH);
      if (dark > 0.15) {
        litWindows().forEach((w, i) => punchLight(w.x, w.y, 11 + Math.sin(t / 170 + i * 1.7) * 1.6));
        if (viewArea === "town") {
          const flick = 30 + Math.round(Math.sin(t / 110) * 2 + Math.sin(t / 53) * 2);
          punchLight(firepit.x, firepit.y - 3, flick);
          punchLight(healTree.x, healTree.y - 20, 20 + Math.sin(t / 300) * 2);   // the Healing Tree's soft halo
        } else if (viewArea === "route") {
          punchLight(shrine.x, shrine.y + 2, 13 + Math.sin(t / 230) * 1.5);   // the shrine gem glows
        } else if (viewArea === "deepwood") {
          punchLight(ruins.x, ruins.y + 6, 11 + Math.sin(t / 260) * 1.5);     // ghost-light in the arch
        }
        for (const p of projectiles) if (p.area === viewArea) punchLight(p.x, p.y, 16);   // fireballs light the dark
        for (const s of smites) if (s.area === viewArea && s.struck) { punchLight(s.x, s.y, 20); punchLight(s.x, Math.max(20, s.y - 60), 13); }   // ...and so do holy beams
        for (const e of enemies) if (e.area === viewArea && e.disT > 0) punchLight(e.x, e.y - 6, 12 * (e.disT / 0.9));   // disintegrating bodies glow
        for (const r of residues) if (r.area === viewArea) punchLight(r.x, r.y, (r.type === "holy" ? 11 : 8) * (r.life / r.maxLife));   // residue keeps glowing
        for (const a of actives.concat(villagers, travellers)) {   // ...and every charging skill glows
          if (a.area !== viewArea || !a.chargeSkill) continue;
          const pr = Math.min(1, a.chargingT / skillDef(a.chargeSkill).charge);
          punchLight(a.x + (a.facing || 1) * ((a.sw || 12) / 2 + 2), a.y - (a.sh || 16) / 2, (a.chargeSkill === "icicles" ? 5 : 7) + pr * 12);
        }
      }
      ctx.drawImage(lightCanvas, 0, 0);
      if (dark > 0.18) {
        litWindows().forEach((w, i) => {
          ctx.fillStyle = "rgba(255,209,102," + (0.6 + 0.18 * Math.sin(t / 210 + i * 2.1)).toFixed(2) + ")";
          ctx.fillRect(Math.round(w.x) - 3, Math.round(w.y) - 3, 7, 7);
        });
        if (viewArea === "town") {
          ctx.globalAlpha = 0.10 + 0.04 * Math.sin(t / 90);
          disc(ctx, firepit.x, firepit.y - 3, 15, "#ff9a3c");
          ctx.globalAlpha = 0.07 + 0.03 * Math.sin(t / 280);
          disc(ctx, healTree.x, healTree.y - 20, 13, "#f2b8d0");
          ctx.globalAlpha = 1;
        } else if (viewArea === "route") {
          ctx.globalAlpha = 0.10 + 0.04 * Math.sin(t / 160);
          disc(ctx, shrine.x, shrine.y + 2, 8, "#7ae0d8");
          ctx.globalAlpha = 1;
        } else if (viewArea === "deepwood") {
          ctx.globalAlpha = 0.08 + 0.04 * Math.sin(t / 190);
          disc(ctx, ruins.x, ruins.y + 6, 7, "#9ae07a");
          ctx.globalAlpha = 1;
        }
      }
    }
    if (warmA > 0.01) {
      ctx.fillStyle = (Time.hour() < 12 ? "rgba(255,170,90," : "rgba(255,110,96,") + warmA.toFixed(3) + ")";
      ctx.fillRect(0, 0, VW, VH);
    }
    // fireflies drift above the darkness, blinking
    if (dark > 0.3 && !Weather.isWet()) {
      for (const f of fireflies) {
        const blink = Math.sin(f.ph * 2.2);
        if (blink < 0.1) continue;
        ctx.globalAlpha = blink * 0.9;
        ctx.fillStyle = "#d8ff9a";
        ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
        ctx.globalAlpha = blink * 0.25;
        ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 3, 3);
      }
      ctx.globalAlpha = 1;
    }
  }

  let treeSpr, bigTreeSpr, houseSpr, cabin2Spr, cabin3Spr, signSpr, firepitSpr, wellSpr, dummySpr, benchSpr, shrineSpr, mushSpr, ruinsSpr, dockSpr, healTreeSpr, shackSpr, innSpr, flagSpr;
  let rabbitSpr, deerSpr, zombSpr, demonSpr, zombWhite, demonWhite, zombDark, demonDark, wolfSpr;
  let labelFontSize = 12;
  function render(t) {
    computeShadowParams();
    ctx.clearRect(0, 0, VW, VH);
    ctx.save();
    ctx.drawImage(AREAS[viewArea].ground, 0, 0);
    drawPuddles();
    if (viewArea === "town") { for (const p of plots) drawPlot(p); }
    for (const b of bushes) if (b.area === viewArea) drawBush(b);
    if (viewArea === "route") {   // mushroom ring (flat decals)
      for (let i = 0; i < 6; i++) {
        const ang = i / 6 * 6.283;
        ctx.drawImage(mushSpr, Math.round(mushRing.x + Math.cos(ang) * 11 - 3), Math.round(mushRing.y + Math.sin(ang) * 6 - 5));
      }
    }
    if (viewArea === "deepwood") {   // mushroom cluster
      for (let i = 0; i < 4; i++) {
        ctx.drawImage(mushSpr, Math.round(mushPatch.x - 8 + (hash2(i, 61) * 16)), Math.round(mushPatch.y - 6 + (hash2(i, 67) * 9)));
      }
    }
    drawCloudShadows();
    drawGrassSway(t);
    drawResidues(t);

    const items = [];
    for (const p of AREAS[viewArea].props) items.push({ by: p.by, kind: "tree", ref: p });
    if (viewArea === "town") {
      items.push({ by: house.y + 30, kind: "house" });
      items.push({ by: cabin2.by, kind: "cabin2" });
      items.push({ by: cabin3.by, kind: "cabin3" });
      items.push({ by: sign.y, kind: "sign" });
      items.push({ by: firepit.y, kind: "firepit" });
      items.push({ by: well.y + 13, kind: "well" });
      items.push({ by: dummy.y + 11, kind: "dummy" });
      items.push({ by: healTree.y, kind: "healtree" });
      items.push({ by: flagpole.y, kind: "flag" });
    } else if (viewArea === "route") {
      items.push({ by: bench.y + 10, kind: "bench" });
      items.push({ by: shrine.y + 14, kind: "shrine" });
    } else if (viewArea === "deepwood") {
      items.push({ by: ruins.y + 16, kind: "ruins" });
    } else if (viewArea === "lake") {
      items.push({ by: dock.y + 8, kind: "dock" });
    }
    for (const s of shacks) if (s.area === viewArea) items.push({ by: s.by, kind: "shack", ref: s });
    for (const gv of graves) if (gv.area === viewArea) items.push({ by: gv.y, kind: "grave", ref: gv });
    if (viewArea === "deepwood") items.push({ by: inn.by, kind: "inn" });
    for (const a of agents) if (a.area === viewArea) items.push({ by: a.state === "ko" ? a.y + a.sw / 2 : a.y, kind: "agent", ref: a });
    for (const v of villagers) if (v.area === viewArea && !v.inside) items.push({ by: v.y, kind: "extra", ref: v });
    for (const tr of travellers) if (tr.area === viewArea) items.push({ by: tr.y, kind: "extra", ref: tr });
    if (imp && imp.area === viewArea) items.push({ by: imp.y, kind: "extra", ref: imp });
    for (const an of animals) if (an.state !== "gone" && an.area === viewArea) items.push({ by: an.y, kind: "animal", ref: an });
    for (const w of wolves) if (w.area === viewArea) items.push({ by: w.y, kind: "wolf", ref: w });
    for (const m of impMinions) if (m.area === viewArea) items.push({ by: m.y, kind: "impm", ref: m });
    for (const e of enemies) if (e.area === viewArea) items.push({ by: e.y, kind: "enemy", ref: e });
    items.sort((m, n) => m.by - n.by);

    const sway = (Weather.type === "windy" && Weather.intensity > 0.4) ? 1 : 0;
    for (const it of items) {
      if (it.kind === "tree") {
        const p = it.ref;
        const sx = sway ? Math.round(Math.sin(t / 300 + p.x * 0.13)) : 0;
        if (p.big) { drawShadow(p.x, p.y, 30); ctx.drawImage(bigTreeSpr, Math.round(p.x - 20) + sx, Math.round(p.y - 45)); }
        else { drawShadow(p.x, p.y, 22); ctx.drawImage(treeSpr, Math.round(p.x - 15) + sx, Math.round(p.y - 33)); }
      }
      else if (it.kind === "house") drawBuilding(buildingByKey.house, houseSpr, Math.round(house.x - 36), 60, t);
      else if (it.kind === "cabin2") drawBuilding(buildingByKey.cabin2, cabin2Spr, Math.round(cabin2.x - 24), 42, t);
      else if (it.kind === "cabin3") drawBuilding(buildingByKey.cabin3, cabin3Spr, Math.round(cabin3.x - 24), 42, t);
      else if (it.kind === "flag") {
        drawShadow(flagpole.x, flagpole.y, 8);
        ctx.drawImage(flagSpr, Math.round(flagpole.x - 4), Math.round(flagpole.y - flagSpr.height));
        if (Math.sin(t / 220) > 0.4) { ctx.fillStyle = "#e8825c"; ctx.fillRect(flagpole.x + 9, flagpole.y - 21, 1, 4); }   // the banner snaps
      }
      else if (it.kind === "sign") { drawShadow(sign.x + 4, sign.y, 12); ctx.drawImage(signSpr, Math.round(sign.x - 4), Math.round(sign.y - signSpr.height)); }
      else if (it.kind === "healtree") { drawShadow(healTree.x, healTree.y, 40); ctx.drawImage(healTreeSpr, Math.round(healTree.x - 27), Math.round(healTree.y - healTreeSpr.height)); }
      else if (it.kind === "well") { drawShadow(well.x, well.y + 13, 18); ctx.drawImage(wellSpr, Math.round(well.x - 10), Math.round(well.y + 13 - wellSpr.height)); }
      else if (it.kind === "dummy") { drawShadow(dummy.x, dummy.y + 11, 12); ctx.drawImage(dummySpr, Math.round(dummy.x - 7), Math.round(dummy.y + 11 - dummySpr.height)); }
      else if (it.kind === "bench") { drawShadow(bench.x, bench.y + 10, 18); ctx.drawImage(benchSpr, Math.round(bench.x - 10), Math.round(bench.y + 10 - benchSpr.height)); }
      else if (it.kind === "shrine") { drawShadow(shrine.x, shrine.y + 14, 24); ctx.drawImage(shrineSpr, Math.round(shrine.x - 14), Math.round(shrine.y + 14 - shrineSpr.height)); }
      else if (it.kind === "ruins") { drawShadow(ruins.x, ruins.y + 16, 26); ctx.drawImage(ruinsSpr, Math.round(ruins.x - 15), Math.round(ruins.y + 16 - ruinsSpr.height)); }
      else if (it.kind === "dock") { ctx.drawImage(dockSpr, Math.round(dock.x - 13), Math.round(dock.y + 8 - dockSpr.height)); }
      else if (it.kind === "firepit") {
        drawShadow(firepit.x, firepit.y, 16); ctx.drawImage(firepitSpr, Math.round(firepit.x - 8), Math.round(firepit.y - 12));
        const fh = 4 + Math.round(Math.sin(t / 110) + Math.sin(t / 53)); const fx = firepit.x, fy = firepit.y - 4;
        ctx.fillStyle = "#e8702a"; ctx.fillRect(fx - 2, fy - fh, 4, fh);
        ctx.fillStyle = "#f2b441"; ctx.fillRect(fx - 1, fy - fh + 1, 2, fh);
        ctx.fillStyle = "#fff2a0"; ctx.fillRect(fx - 1, fy - 2, 1, 2);
      }
      else if (it.kind === "shack") drawShack(it.ref, t);
      else if (it.kind === "grave") drawGrave(it.ref);
      else if (it.kind === "inn") drawBuilding(buildingByKey.inn, innSpr, Math.round(inn.x - 28), 50, t);
      else if (it.kind === "animal") drawAnimal(it.ref, t);
      else if (it.kind === "wolf") drawWolf(it.ref, t);
      else if (it.kind === "impm") drawImpMinion(it.ref, t);
      else if (it.kind === "enemy") drawEnemy(it.ref, t);
      else if (it.kind === "extra") drawExtra(it.ref, t);
      else drawAgent(it.ref, t);
    }
    drawDebris();

    if (claude.area === viewArea) {
      for (const s of sparkles) { ctx.globalAlpha = Math.max(0, Math.min(1, s.life)); ctx.fillStyle = Math.random() < 0.5 ? "#fff2cc" : "#ffd9c7"; const x = Math.round(s.x), y = Math.round(s.y); if (s.life > 0.5) { ctx.fillRect(x, y - 1, 1, 3); ctx.fillRect(x - 1, y, 3, 1); } else ctx.fillRect(x, y, 1, 1); }
      ctx.globalAlpha = 1;
    }
    drawProjectiles(t);
    drawFlameWaves(t);
    drawSmites(t);
    drawMeteors(t);
    drawStampede(t);
    drawParts();
    drawFxAnims();
    drawButterflies(t);
    renderWeather(t);
    renderLighting(t);
    drawInsideBadges(t);
    ctx.restore();
  }

  // who's home? tidy little portrait chips float over the roof —
  // they replace the old "Name · inside" label text.
  function drawInsideBadges(t) {
    for (const b of buildings) {
      if (b.area !== viewArea || b.hp <= 0) continue;
      const folks = actives.concat(villagers).filter(p => p.inside && p.insideKey === b.key);
      if (!folks.length) continue;
      const w = 14, h = 13, gap = 1;
      const total = folks.length * w + (folks.length - 1) * gap;
      let x = Math.round(b.x - total / 2);
      const y = Math.round(b.top - h - 3 + Math.sin(t / 520) * 1);   // gentle hover
      for (const a of folks) {
        ctx.fillStyle = "rgba(244,232,204,0.85)";                    // light rounded frame
        ctx.fillRect(x, y + 1, w, h - 2); ctx.fillRect(x + 1, y, w - 2, h);
        ctx.fillStyle = "rgba(22,26,36,0.92)";                       // dark inner card
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        if (a.mini && ready(a.mini.img)) ctx.drawImage(a.mini.img, 10, 7, 12, 10, x + 1, y + 2, 12, 10);   // Minifolk head crop
        else { const sx = Math.max(0, Math.round((a.spr.width - 12) / 2)); ctx.drawImage(a.spr, sx, 0, 12, 10, x + 1, y + 2, 12, 10); }
        x += w + gap;
      }
      // a tiny stem so the chips clearly belong to this roof
      ctx.fillStyle = "rgba(244,232,204,0.85)";
      ctx.fillRect(Math.round(b.x) - 1, y + h, 2, 2);
    }
  }

  let last = performance.now();
  function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; update(dt, now); render(now); updateLabels(); requestAnimationFrame(loop); }

  function resize() {
    const s = Math.min(window.innerWidth / VW, window.innerHeight / VH);
    canvas.style.width = Math.round(VW * s) + "px";
    canvas.style.height = Math.round(VH * s) + "px";
    canvasRect = canvas.getBoundingClientRect();
    document.documentElement.style.setProperty("--s", s);
    labelFontSize = Math.max(10, Math.round(3.5 * s));
    for (const p of allPeople()) if (p.labelEl) p.labelEl.style.fontSize = labelFontSize + "px";
  }
  window.addEventListener("resize", resize);

  /* ==========================================================================
     20. Input + area navigation
     ========================================================================== */
  let hovered = null, panelOpen = false, panelAgent = null, panelObject = null, panelGen = 0;
  let canvasRect = { left: 0, top: 0, width: VW, height: VH };
  function toVirtual(e) { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * VW, y: ((e.clientY - r.top) / r.height) * VH }; }
  function agentAt(vx, vy) {
    let best = null, bd = 1e9;
    for (const a of allPeople()) {
      if (a.area !== viewArea) continue;
      const b = a.box;
      if (vx >= b.x && vx <= b.x + b.w && vy >= b.y && vy <= b.y + b.h) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2, d = (vx - cx) ** 2 + (vy - cy) ** 2;
        if (d < bd) { bd = d; best = a; }
      }
    }
    return best;
  }

  /* ---- clickable world objects: click the campfire, a house, the farm... -- */
  function insideList(key) {
    const ins = actives.filter(a => a.insideKey === key).map(a => a.name);
    return ins.length ? ins.join(", ") : "nobody";
  }
  function usingLeisure(id) {
    const u = actives.filter(a => a.state === "do" && a.doKind === "leisure" && a.task && a.task.poi && a.task.poi.id === id).map(a => a.name);
    return u.length ? u.join(", ") : "nobody";
  }
  const OBJECTS = [
    { id: "firepit", area: "town", name: "Campfire", x: firepit.x - 11, y: firepit.y - 18, w: 22, h: 24, icon: () => firepitSpr,
      blurb: "The heart of town — cooking, shared dinners and stories after dark.",
      info: () => [
        ["Cooking now", actives.filter(a => a.state === "do" && a.doKind === "cook").map(a => a.name).join(", ") || "nobody"],
        ["Around the fire", allPeople().filter(q => q.area === "town" && !q.inside && dist(q.x, q.y, firepit.x, firepit.y) < 46).map(q => q.name).join(", ") || "nobody"],
        ["The flames", "warm and crackling"],
      ] },
    { id: "house", area: "town", name: "The Big House", x: house.x - 36, y: house.y - 34, w: 72, h: 64, icon: () => houseSpr,
      blurb: "The red-roofed house. Agents step inside to rest, hide and recover.",
      info: () => [["Inside", insideList("house")], ["Condition", structCondition("house")], ["Comforts", "warm beds, a dry roof"]] },
    { id: "square", area: "town", name: "Town Square", x: PLAZA.x, y: PLAZA.y, w: PLAZA.w, h: PLAZA.h,
      draw: g => { g.fillStyle = "#9b8f7c"; g.fillRect(12, 28, 60, 38); g.fillStyle = "#8a7f6d"; for (let rx = 12; rx < 72; rx += 12) g.fillRect(rx, 28, 1, 38); for (let ry = 28; ry < 66; ry += 10) g.fillRect(12, ry, 60, 1); g.fillStyle = "#6e6354"; g.fillRect(40, 12, 2, 18); g.fillStyle = "#ff8a76"; g.fillRect(42, 12, 9, 6); },
      blurb: "Atlas's paved pride, flag and all. If every roof falls, the town gathers HERE.",
      info: () => [
        ["Gathered here", allPeople().filter(q => q.area === "town" && !q.inside && q.x > PLAZA.x && q.x < PLAZA.x + PLAZA.w && q.y > PLAZA.y && q.y < PLAZA.y + PLAZA.h).map(q => q.name).join(", ") || "nobody right now"],
        ["The flag", Weather.wind > 0.4 || Weather.wind < -0.4 ? "snapping in the wind" : "swaying gently"],
        ["Homes standing", anyHomeStanding() ? "yes — life as usual" : "NONE — this is the refuge now"],
      ] },
    { id: "cabin2", area: "town", name: "Teal Cabin", x: cabin2.x - 24, y: cabin2.by - 44, w: 48, h: 44, icon: () => cabin2Spr,
      blurb: "Yenna's cabin by the north path. Smells faintly of wolf.",
      info: () => [["Inside", insideList("cabin2")], ["Condition", structCondition("cabin2")]] },
    { id: "cabin3", area: "town", name: "Plum Cabin", x: cabin3.x - 24, y: cabin3.by - 44, w: 48, h: 44, icon: () => cabin3Spr,
      blurb: "Atlas's cabin down the south path. The toolbox by the door is organised to a fault.",
      info: () => [["Inside", insideList("cabin3")], ["Condition", structCondition("cabin3")]] },
    { id: "healtree", area: "town", name: "Healing Tree", x: healTree.x - 27, y: healTree.y - 62, w: 54, h: 64, icon: () => healTreeSpr,
      blurb: "The great blossoming tree. Resting beneath it knits wounds fastest of all.",
      info: () => [
        ["Healing now", actives.filter(a => a.state === "do" && a.doKind === "rest" && !a.inside && dist(a.x, a.y, healTree.x, healTree.y + 10) < 28).map(a => a.name).join(", ") || "nobody"],
        ["Blossoms", "softly glowing"],
      ] },
    { id: "farm", area: "town", name: "The Farm", x: FARM.x, y: FARM.y, w: FARM.w, h: FARM.h,
      draw: g => { g.fillStyle = C.soilD; g.fillRect(10, 22, 64, 44); g.fillStyle = "#583e24"; for (let ry = 28; ry < 64; ry += 8) g.fillRect(14, ry, 56, 2); g.fillStyle = "#6fcf4a"; g.fillRect(22, 30, 4, 6); g.fillRect(42, 38, 4, 6); g.fillRect(58, 30, 4, 6); },
      blurb: "Eight tilled plots behind the fence. Rain waters them for free.",
      info: () => {
        const rows = plots.map((p, i) => ["Plot " + (i + 1), p.crop ? p.crop + " · " + ["soil", "seedling", "growing", "READY"][p.stage] + (p.water > 0 ? " · watered" : " · dry") : "empty"]);
        rows.unshift(["Summary", plots.filter(p => p.stage >= 3).length + " ready · " + plots.filter(p => p.crop && p.stage < 3).length + " growing · " + plots.filter(p => !p.crop).length + " empty"]);
        return rows;
      } },
    { id: "pond", area: "town", name: "The Pond", x: pond.x - 23, y: pond.y - 14, w: 46, h: 28,
      draw: g => { disc(g, 42, 42, 30, C.waterO); disc(g, 42, 42, 27, C.water); disc(g, 36, 37, 13, C.waterL); g.fillStyle = C.waterS; g.fillRect(30, 32, 3, 2); },
      blurb: "Calm water, the occasional ripple, and Bo's eternal optimism.",
      info: () => [
        ["Relaxing here", usingLeisure("relax")],
        ["Surface", Weather.isWet() ? "dancing with raindrops" : "calm, with drifting ripples"],
      ] },
    { id: "well", area: "town", name: "The Well", x: well.x - 10, y: well.y - 9, w: 20, h: 23, icon: () => wellSpr,
      blurb: "Cold, clear water — best in town.",
      info: () => [["Freshening up", usingLeisure("well")]] },
    { id: "dummy", area: "town", name: "Training Dummy", x: dummy.x - 7, y: dummy.y - 9, w: 14, h: 21, icon: () => dummySpr,
      blurb: "Straw head, stitched eyes, undefeated... at standing there.",
      info: () => [["Training now", usingLeisure("dummy")]] },
    { id: "sign", area: "town", name: "Town Sign", x: sign.x - 4, y: sign.y - 18, w: 16, h: 18, icon: () => signSpr,
      blurb: "“Welcome to PokeTown. Mind the tall grass. The road east leads onward.”",
      info: () => [["Reading it", usingLeisure("read")]] },
    { id: "bench", area: "route", name: "Old Bench", x: bench.x - 10, y: bench.y - 1, w: 20, h: 12, icon: () => benchSpr,
      blurb: "Petra insists it's hers. The moss disagrees.",
      info: () => [["Sitting here", usingLeisure("bench")]] },
    { id: "shrine", area: "route", name: "Wishing Shrine", x: shrine.x - 14, y: shrine.y - 10, w: 28, h: 24, icon: () => shrineSpr,
      blurb: "Three mossy stones around a gem that hums at night.",
      info: () => [["Making wishes", usingLeisure("shrine")], ["The gem", Time.phase() === "night" ? "glowing softly" : "quiet, waiting for dark"]] },
    { id: "ruins", area: "deepwood", name: "Old Ruins", x: ruins.x - 15, y: ruins.y - 12, w: 30, h: 28, icon: () => ruinsSpr,
      blurb: "A broken arch older than anyone's stories. Something faintly glows at night.",
      info: () => [["Exploring", usingLeisure("ruins")]] },
    { id: "inn", area: "deepwood", name: "Deepwood Inn", x: inn.x - 28, y: inn.by - 52, w: 56, h: 52, icon: () => innSpr,
      blurb: "Lantern-lit and warm, right off the dark road. Travellers check in... some never leave.",
      info: () => [
        ["Inside", insideList("inn")],
        ["Condition", structCondition("inn")],
        ["Residents", villagers.filter(v => v.sleepSpot && Math.abs(v.sleepSpot[0] - (inn.x + 16)) < 4).map(v => v.name).join(", ") || "none yet"],
        ["The lantern", Time.phase() === "night" ? "burning warm" : "waiting for dusk"],
      ] },
    { id: "dock", area: "lake", name: "Fishing Dock", x: dock.x - 13, y: dock.y - 4, w: 26, h: 12, icon: () => dockSpr,
      blurb: "A stubby pier. The fish are biting; ask Nilo about the big one.",
      info: () => [["Fishing now", actives.filter(a => a.state === "do" && a.doKind === "forage" && a.task && a.task.what === "raw_fish").map(a => a.name).join(", ") || "nobody"]] },
    { id: "lake", area: "lake", name: "The Lake", x: LAKE.x - LAKE.rx, y: LAKE.y - LAKE.ry, w: LAKE.rx * 2, h: LAKE.ry * 2,
      draw: g => { disc(g, 42, 42, 32, C.waterO); disc(g, 42, 42, 29, C.water); disc(g, 34, 35, 14, C.waterL); g.fillStyle = C.waterS; g.fillRect(28, 30, 3, 2); g.fillRect(48, 50, 2, 1); },
      blurb: "The road ends here. The water doesn't.",
      info: () => [
        ["Skipping stones", usingLeisure("stones")],
        ["Surface", Weather.isWet() ? "alive with rain" : "wide and calm"],
      ] },
  ];
  for (const s of shacks) {
    OBJECTS.push({
      id: s.id, area: s.area, name: s.name, x: s.x - 17, y: s.by - 30, w: 34, h: 32, icon: () => shackSpr,
      blurb: "A small plank shack. Monsters love smashing it; the town loves rebuilding it.",
      info: () => [
        ["Condition", s.state === "rubble" && s.hp <= 0 ? "RUBBLE" : Math.round(s.hp / s.maxhp * 100) + "%" + (s.state === "rubble" ? " (rebuilding)" : "")],
        ["Repair crew", actives.filter(a => a.state === "do" && a.doKind === "repair" && a.task && a.task.shack === s).map(a => a.name).concat(villagers.filter(v => v.state === "repair" && v.repairShack === s).map(v => v.name)).join(", ") || "nobody"],
      ],
    });
  }
  function objectAt(vx, vy) {
    let best = null, bs = 1e9;
    for (const o of OBJECTS) {
      if (o.area !== viewArea) continue;
      if (vx >= o.x && vx <= o.x + o.w && vy >= o.y && vy <= o.y + o.h) {
        const s = o.w * o.h;
        if (s < bs) { bs = s; best = o; }
      }
    }
    return best;
  }

  canvas.addEventListener("mousemove", e => {
    if (panelOpen) return;
    const { x, y } = toVirtual(e);
    hovered = agentAt(x, y);
    canvas.style.cursor = (hovered || objectAt(x, y)) ? "pointer" : "default";
  });
  canvas.addEventListener("click", e => {
    if (panelOpen) return;
    const { x, y } = toVirtual(e);
    const a = agentAt(x, y);
    if (a) { openPanel(a); return; }
    const o = objectAt(x, y);
    if (o) openObjectPanel(o);
  });

  /* ---- agent hotbar (top-left): scrollable faces; click one to jump ------- */
  const hotbarEl = document.getElementById("hotbar");
  hotbarEl.addEventListener("wheel", e => { e.preventDefault(); hotbarEl.scrollLeft += e.deltaY; }, { passive: false });
  const AREA_TAG = { town: "T", route: "R", deepwood: "D", lake: "L" };
  function addHotbarTile(ent) {
    const tile = document.createElement("div");
    tile.className = "hb-tile" + (ent.active ? " hb-active" : "");
    tile.title = ent.name;
    const c = document.createElement("canvas"); c.width = 30; c.height = 28;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    const paint = () => {
      g.clearRect(0, 0, 30, 28);
      if (ent.mini && ready(ent.mini.img)) g.drawImage(ent.mini.img, 6, 6, 22, 23, 3, 2, 24, 25);
      else {
        const s = Math.max(1, Math.min(Math.floor(30 / ent.sw), Math.floor(28 / ent.sh)));
        g.drawImage(ent.spr, Math.floor((30 - ent.sw * s) / 2), Math.floor((28 - ent.sh * s) / 2), ent.sw * s, ent.sh * s);
      }
    };
    paint();
    if (ent.mini && !ready(ent.mini.img)) ent.mini.img.addEventListener("load", paint, { once: true });   // repaint when the sheet arrives
    tile.appendChild(c);
    if (ent.stats) { const hp = document.createElement("div"); hp.className = "hb-hp"; hp.innerHTML = "<i></i>"; tile.appendChild(hp); }
    const tag = document.createElement("span"); tag.className = "hb-area"; tag.textContent = AREA_TAG[ent.area] || "?"; tile.appendChild(tag);
    tile.addEventListener("click", () => {
      if (panelOpen || ent.dead) return;
      if (ent.area !== viewArea) setViewArea(ent.area);
      ent.pingT = 2.5;   // a bouncing marker shows exactly where they are
    });
    ent.hbTile = tile;
    hotbarEl.appendChild(tile);
  }
  function buildHotbar() {
    for (const ent of agents.concat(imp ? [imp] : [], villagers)) addHotbarTile(ent);
  }
  function updateHotbar() {
    for (const ent of allPeople()) {
      if (!ent.hbTile) continue;
      const tag = ent.hbTile.lastChild;
      const want = AREA_TAG[ent.area] || "?";
      if (tag.textContent !== want) tag.textContent = want;
      ent.hbTile.classList.toggle("hb-downed", ent.state === "ko");
      ent.hbTile.classList.toggle("hb-inside", !!ent.inside);
      if (ent.stats) {
        const bar = ent.hbTile.querySelector(".hb-hp i");
        const w = Math.round(hpPct(ent)) + "%";
        if (bar && bar.style.width !== w) { bar.style.width = w; bar.style.background = hpPct(ent) < 35 ? "#e8556a" : "#74d36c"; }
      }
    }
  }

  // four nav arrows — each area shows buttons on the edges its roads leave from
  const NAV_BTNS = {
    east: document.getElementById("navE"),
    west: document.getElementById("navW"),
    south: document.getElementById("navS"),
    north: document.getElementById("navN"),
  };
  function exitEdge(ex) {   // which screen edge an exit door sits on
    if (ex.y > 240) return "south";
    if (ex.y < 40) return "north";
    return ex.x < 256 ? "west" : "east";
  }
  function setViewArea(key) {
    viewArea = key;
    for (const dir in NAV_BTNS) { NAV_BTNS[dir].style.display = "none"; NAV_BTNS[dir].dataset.to = ""; }
    for (const ex of AREAS[key].exits) {
      const dir = exitEdge(ex), btn = NAV_BTNS[dir];
      btn.style.display = "block";
      btn.dataset.to = ex.to;
      const nm = AREAS[ex.to].name.toUpperCase();
      btn.innerHTML = dir === "east" ? nm + " &#9654;"
        : dir === "west" ? "&#9664; " + nm
        : dir === "south" ? nm + " &#9660;"
        : "&#9650; " + nm;
    }
    logEvent("Now viewing: " + AREAS[key].name + ".");
  }
  for (const dir in NAV_BTNS) NAV_BTNS[dir].addEventListener("click", () => { const to = NAV_BTNS[dir].dataset.to; if (to) setViewArea(to); });

  // bottom-right spawn buttons: summon a monster or a traveller into the view
  document.getElementById("spawnEnemyBtn").addEventListener("click", () => {
    spawnEnemy(viewArea, pick(AREAS[viewArea].enemySpawns), true);
    logEvent("Something stirs... a monster prowls into " + AREAS[viewArea].name + "!");
  });
  document.getElementById("spawnFolkBtn").addEventListener("click", () => {
    if (travellers.length >= 24) { logEvent("The road can't hold another soul."); return; }
    spawnTraveller(travellers.length * 9, viewArea);   // spam away — they stagger themselves
    logEvent("A new face appears on the road.");
  });

  /* ==========================================================================
     21. Interaction panel (stats + relationships + chat for active agents;
         simple cards for townsfolk, travellers and the imp)
     ========================================================================== */
  const overlay = document.getElementById("overlay");
  const panel = document.getElementById("panel");
  const panelBody = document.getElementById("panelBody");
  document.getElementById("closeBtn").addEventListener("click", closePanel);
  overlay.addEventListener("click", e => { if (e.target === overlay) closePanel(); });
  window.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const sp = document.getElementById("skillpop");
    if (sp && !sp.classList.contains("hidden")) { sp.classList.add("hidden"); return; }   // popup first, panel second
    closePanel();
  });

  function bigAvatar(a) {
    const s = 5, side = Math.max(a.sw, a.sh) * s;
    const c = document.createElement("canvas"); c.width = side; c.height = side; c.className = "agent-avatar";
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    if (a.mini && ready(a.mini.img)) {   // the Minifolk face, blown up
      const m = a.mini, sc = Math.floor(side / 26);
      g.drawImage(m.img, 3, 4, 26, 26, Math.floor((side - 26 * sc) / 2), Math.floor((side - 26 * sc) / 2), 26 * sc, 26 * sc);
      return c;
    }
    const dw = a.sw * s, dh = a.sh * s;
    g.drawImage(a.simple ? a.spr : (a.active ? a.spr : a.gray), Math.floor((side - dw) / 2), Math.floor((side - dh) / 2), dw, dh);
    return c;
  }

  // one-word RPG status for the panel (priority order matters)
  function statusText(a) {
    if (a.state === "ko") return "Downed";
    if (a.afraidT > 0) return "Afraid";
    if (a.weakT > 0) return "Weakened";
    if (a.inspired) return "Inspired";
    if (hpPct(a) < 50) return "Injured";
    if (a.stats.hunger < 35) return "Hungry";
    if (a.stats.energy < 35) return "Tired";
    if (a.state === "fight") return "Defending";
    if ((a.state === "do" && (a.doKind === "help" || a.doKind === "tend")) || (a.task && a.task.kind === "share")) return "Helping";
    if (a.state === "do" && a.doKind === "rest") return "Resting";
    return "Healthy";
  }

  function activityText(a) {
    if (a.state === "ko") return "Knocked out...";
    if (a.state === "fight") return "Fighting a " + (a.task && a.task.target ? a.task.target.kind : "monster") + "!";
    if (a.state === "hunt") return "Hunting " + (a.task && a.task.target ? a.task.target.kind : "game");
    if (a.state === "wave") return "Greeting a friend";
    if (a.state === "do") {
      if (a.doKind === "leisure" && a.task && a.task.poi) return a.task.poi.label;
      if (a.doKind === "rest") return a.inside ? "Resting inside" : (a.area === "town" && dist(a.x, a.y, healTree.x, healTree.y + 10) < 28) ? "Healing under the great tree" : "Resting at home";
      if (a.doKind === "hide") return a.inside ? "Hiding inside" : "Hiding by the door";
      if (a.doKind === "shelter") return a.inside ? "Sheltering inside" : "Sheltering from the rain";
      const m = { cook: "Cooking at the campfire", eat: "Eating", farm: "Working the farm", forage: "Foraging", gather: "Sitting by the fire", chat: "Chatting", help: "Helping a friend", tend: "Patching up a friend", guard: "Standing guard", repair: a.cls === "Healer" ? "Mending the shack with light" : "Rebuilding the shack" };
      return m[a.doKind] || "Busy";
    }
    if (a.state === "walk" && a.task) {
      if (a.task.patrol) return "Patrolling the town";
      if (a.goal && a.goal.area && a.goal.area !== a.area) return "Travelling to " + AREAS[a.goal.area].name;
      if (a.goal && a.goal.enter) return "Heading inside";
      const m = { stroll: "Strolling", rest: a.task.fleeing ? "Running for safety!" : "Heading home to rest", hide: "Heading indoors", shelter: "Running for cover", cook: "Carrying food to the fire", forage: "Off foraging", leisure: "Heading somewhere nice", gather: "Walking to the campfire", farm: "Walking to the farm", chat: "Going to chat", share: "Bringing food to a friend", help: "Rushing to help!", tend: "Going to heal a friend", guard: "Moving to guard" };
      if (m[a.task.kind]) return m[a.task.kind];
    }
    if (a.state === "walk") return "Heading somewhere";
    return "Idling";
  }

  function updateNeedsUI() {
    const a = panelAgent; if (!a || panelBody.dataset.agentId !== a.id) return;
    const showingRevive = !!panelBody.querySelector(".revive-btn");
    if (a.active && showingRevive !== (a.state === "ko")) { openPanel(a); return; }
    for (const el of panelBody.querySelectorAll(".needfill")) {
      const k = el.dataset.need;
      el.style.width = Math.round(k === "health" ? hpPct(a) : a.stats[k]) + "%";
    }
    // only touch the DOM when the text actually changed (this runs every frame)
    const act = panelBody.querySelector("#activity");
    if (act) { const s = "Now: " + activityText(a); if (act.textContent !== s) act.textContent = s; }
    const th = panelBody.querySelector("#thought");
    if (th) { const s = "“" + a.thought + "”"; if (th.textContent !== s) th.textContent = s; }
    const kvs = panelBody.querySelector("#kvs");
    if (kvs) {
      const bf = bestFriend(a), wr = worstRel(a);
      const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>";
      const tr2 = AGENT_TREE[a.id];
      const html =
        (tr2 ? kv("Hero", CLASSES[tr2.cls].name + " · " + tr2.spec + " · Level " + a.level + " (" + a.xp + "/" + xpNeed(a.level) + " xp)") : "") +
        kv("Class", a.cls + " · AC " + (a.ac + (a.passiveAC || 0)) + " · d" + a.dmgDie) +
        kv("Status", statusText(a)) +
        kv("Area", AREAS[a.area].name) +
        kv("Inventory", invText(a)) +
        kv("Best friend", bf ? bf.who.name + " — " + relLevel(bf.v) + " (" + Math.round(bf.v) + ")" : "none yet") +
        kv("Rival", wr ? wr.who.name + " — " + relLevel(wr.v) + " (" + Math.round(wr.v) + ")" : "none") +
        kv("Last social", a.lastSocial);
      if (kvs.dataset.last !== html) { kvs.dataset.last = html; kvs.innerHTML = html; }
    }
  }

  /* ---- the SKILL TREE view: nodes, ranks, evolutions, details ------------- */
  function treeNodeHtml(a, key, last) {
    const ab = ABILITIES[key];
    const r = rankOf(a, key);
    const lvl = a.level || 1;
    const locked = ab.kind === "ultimate" ? lvl < 5 : (r === 0 && lvl < (ab.lvlReq || 1));
    const maxed = ab.kind === "ultimate" ? lvl >= 5 : r >= 5;
    const cls2 = "stnode" + (maxed ? " maxed" : locked ? " locked" : " unlocked");
    const branch = last ? "└── " : "├── ";
    let label;
    if (ab.kind === "ultimate") label = ab.name + " (ULTIMATE" + (a.level >= 5 ? (a.ultCD > 0 ? " · " + Math.ceil(a.ultCD) + "s" : " · READY") : " — unlocks Lv5") + ")";
    else if (locked) label = ab.name + " — needs Lv" + (ab.lvlReq || 1);
    else label = ab.name + " Lv" + r + "/5" + (ab.kind === "passive" ? " (passive)" : "");
    let out = branch + ab.icon + ' <span class="' + cls2 + '" data-k="' + key + '" data-a="' + a.id + '">' + label + "</span>\n";
    if (ab.evolutions && !locked) {
      const stem = last ? "    " : "│   ";
      ab.evolutions.forEach((ev, i) => {
        const on = r >= ev.at;
        const eb = i === ab.evolutions.length - 1 ? "└── " : "├── ";
        out += stem + eb + '<span class="stevo ' + (on ? "on" : "off") + '">' + ev.name + (on ? " ✓" : " (Rank " + ev.at + ")") + "</span>\n";
      });
    }
    return out;
  }
  function treeHtml(a, compact) {
    const tr = resolveTree(a); if (!tr) return "";
    const C2 = CLASSES[tr.cls];
    const keys = tr.actives.concat([tr.passive, tr.passive2].filter(Boolean), tr.ultimate ? [tr.ultimate] : []);
    const spent = keys.reduce((s, k) => s + rankOf(a, k), 0);
    let ascii = C2.name + " · " + tr.spec + "\n│\n";
    keys.forEach((k, i) => { ascii += treeNodeHtml(a, k, i === keys.length - 1); if (i < keys.length - 1) ascii += "│\n"; });
    const xpPct = Math.round((a.xp || 0) / xpNeed(a.level || 1) * 100);
    return '<div class="treewrap" style="--cc:' + C2.color + '">' +
      '<div class="treehead"><b style="color:' + C2.color + '">' + a.name + "</b> — Level " + a.level +
      ' · <span style="color:' + C2.color + '">' + C2.name + " · " + tr.spec + "</span></div>" +
      '<div class="xpbar"><i style="width:' + xpPct + '%;background:' + C2.color + '"></i></div>' +
      '<div class="treemeta">XP ' + (a.xp || 0) + "/" + xpNeed(a.level || 1) + " · Talent points: " + (a.talentPts || 0) + " · Tree: " + spent + "/" + ((keys.length - (tr.ultimate ? 1 : 0)) * 5) + " ranks</div>" +
      '<div class="treemeta">✦ Unique: ' + tr.innate + "</div>" +
      '<pre class="treeascii">' + ascii + "</pre>" +
      (compact ? "" : '<div class="skilldetail" id="skillDetail">— click any skill for its full sheet —</div>') +
      "</div>";
  }
  function skillDetailHtml(a, key) {
    const ab = ABILITIES[key];
    const r = rankOf(a, key);
    const C2 = CLASSES[ab.cls];
    const rows = [];
    rows.push(["Class", C2.name + (ab.kind === "ultimate" ? " · ULTIMATE" : ab.kind === "passive" ? " · Passive" : "")]);
    rows.push(["Rank", ab.kind === "ultimate" ? (a.level >= 5 ? "UNLOCKED" : "locked — unlocks at level 5") : r + " / 5"]);
    if (ab.dmgText) rows.push([ab.kind === "passive" ? "Effect" : key === "healing_bloom" ? "Healing" : "Damage", ab.dmgText(Math.max(1, r))]);
    if (ab.scale) rows.push(["Scales with", ab.scale]);
    if (ab.cd) rows.push(["Cooldown", ab.cd + "s"]);
    if (ab.range) rows.push(["Range", ab.range[0] + "–" + ab.range[1] + "px"]);
    if (ab.mana) rows.push(["Mana", ab.mana]);
    if (ab.rankNotes && r > 0 && r < 5) rows.push(["Next rank", ab.rankNotes[r]]);
    if (ab.rankNotes && r >= 5) rows.push(["Mastered", ab.rankNotes[4]]);
    return '<b style="color:' + C2.color + '">' + ab.icon + " " + ab.name + "</b><br>" + ab.desc + "<br><br>" +
      rows.map(rw => '<span class="sdk">' + rw[0] + ":</span> " + rw[1]).join("<br>");
  }
  // clicking any skill node opens a big, readable POPUP card
  const skillpop = document.getElementById("skillpop");
  const skillpopBody = document.getElementById("skillpopBody");
  document.getElementById("skillpopClose").addEventListener("click", () => skillpop.classList.add("hidden"));
  skillpop.addEventListener("click", e => { if (e.target === skillpop) skillpop.classList.add("hidden"); });
  function anyoneById(id) {
    return agents.find(q => q.id === id) || villagers.find(q => q.id === id) || travellers.find(q => q.id === id) || null;
  }
  function wireTreeClicks(scope) {
    for (const el of scope.querySelectorAll(".stnode")) {
      el.addEventListener("click", ev => {
        ev.stopPropagation();
        const a = anyoneById(el.dataset.a);
        if (!a) return;
        skillpopBody.innerHTML = skillDetailHtml(a, el.dataset.k);
        skillpop.classList.remove("hidden");
      });
    }
  }
  function openTreePanel(a) {
    panelOpen = true; panelAgent = null; panelObject = null; panelGen++; hovered = null;
    panel.classList.toggle("dormant", false);
    panelBody.innerHTML = "";
    panelBody.dataset.agentId = "tree_" + a.id;
    const back = document.createElement("button"); back.className = "tree-btn"; back.innerHTML = "&#9664; BACK TO " + a.name.toUpperCase();
    back.addEventListener("click", () => openPanel(a));
    panelBody.appendChild(back);
    const wrap = document.createElement("div");
    wrap.innerHTML = treeHtml(a, true);
    panelBody.appendChild(wrap);
    const hint = document.createElement("p"); hint.className = "agent-blurb"; hint.textContent = "Click any skill for its full card.";
    panelBody.appendChild(hint);
    wireTreeClicks(panelBody);
    overlay.classList.remove("hidden");
    panelBody.scrollTop = 0;
  }
  function openSheet() {   // the SUMMARY SHEET: every hero's tree, one scroll
    panelOpen = true; panelAgent = null; panelObject = null; panelGen++; hovered = null;
    panel.classList.toggle("dormant", false);
    panelBody.innerHTML = "";
    panelBody.dataset.agentId = "sheet";
    const h = document.createElement("h2"); h.className = "active"; h.textContent = "✦ SKILL CODEX ✦"; h.style.textAlign = "center";
    panelBody.appendChild(h);
    const sub = document.createElement("p"); sub.className = "agent-blurb";
    sub.textContent = "Every hero, every class, every ability — click any skill for its full sheet. Levels are earned by fighting, healing, building and cooking; talent points spend themselves as each hero grows.";
    panelBody.appendChild(sub);
    const wrap = document.createElement("div");
    const folk = villagers.filter(v => !v.dead && v.skill);
    wrap.innerHTML = actives.map(a => treeHtml(a, true)).join("") +
      '<h2 class="active" style="text-align:center">— THE TOWNSFOLK —</h2>' +
      folk.map(v => treeHtml(v, true)).join("");
    panelBody.appendChild(wrap);
    wireTreeClicks(panelBody);
    overlay.classList.remove("hidden");
    panelBody.scrollTop = 0;
  }
  document.getElementById("sheetBtn").addEventListener("click", openSheet);

  function openPanel(a) {
    panelOpen = true; panelAgent = a; panelGen++; hovered = null; canvas.style.cursor = "default";
    panel.classList.toggle("dormant", !a.simple && !a.active);
    panelBody.innerHTML = "";
    panelBody.dataset.agentId = a.id;
    const head = document.createElement("div"); head.className = "agent-head";
    head.appendChild(bigAvatar(a));
    const meta = document.createElement("div"); meta.className = "agent-meta";
    const badge = a.simple
      ? (a.kind === "frog" ? "PET FROG" : a.kind === "traveller" ? "TRAVELLER" : "TOWNSFOLK")
      : (a.active ? "&#9679; ACTIVE" : "&#9675; DORMANT");
    meta.innerHTML = '<h2 class="' + (a.simple || a.active ? "active" : "dormant") + '">' + a.name + "</h2>" +
      '<span class="badge ' + (a.simple || a.active ? "active" : "dormant") + '">' + badge + "</span>" +
      (!a.simple && a.active ? '<span class="persona-badge">' + a.personality.toUpperCase() + "</span>" : "") +
      (a.simple && a.skill ? '<span class="persona-badge">' + SKILL_LABEL[a.skill] + "</span>" : "");
    head.appendChild(meta); panelBody.appendChild(head);
    const blurb = document.createElement("p"); blurb.className = "agent-blurb" + (a.simple || a.active ? "" : " dim"); blurb.textContent = a.blurb; panelBody.appendChild(blurb);
    if (a.simple && resolveTree(a) && !a.dead) {   // townsfolk show their humble tree right in the card
      const tw = document.createElement("div");
      tw.innerHTML = treeHtml(a, true);
      panelBody.appendChild(tw);
      wireTreeClicks(tw);
    }
    if (!a.simple && a.active && AGENT_TREE[a.id]) {
      const tb = document.createElement("button"); tb.className = "tree-btn";
      tb.innerHTML = ABILITIES[AGENT_TREE[a.id].ultimate].icon + " SKILL TREE — Lv" + a.level + " " + CLASSES[AGENT_TREE[a.id].cls].name.toUpperCase();
      tb.addEventListener("click", () => openTreePanel(a));
      panelBody.appendChild(tb);
    }
    if (!a.simple && a.active) {
      const th = document.createElement("div"); th.className = "thought"; th.id = "thought"; panelBody.appendChild(th);
      const act = document.createElement("div"); act.className = "activity"; act.id = "activity"; panelBody.appendChild(act);
      const needs = document.createElement("div"); needs.className = "needs";
      needs.innerHTML = STAT_KEYS.filter(k => k !== "mana" || isCaster(a))
        .map(k => '<div class="needrow"><span class="nlabel">' + k + '</span><div class="needbar"><div class="needfill" data-need="' + k + '" style="background:' + STAT_COLOR[k] + '"></div></div></div>').join("");
      panelBody.appendChild(needs);
      const kvs = document.createElement("div"); kvs.className = "kvs"; kvs.id = "kvs"; panelBody.appendChild(kvs);
      if (a.state === "ko") {
        const note = document.createElement("div"); note.className = "downed-note";
        note.textContent = a.name + " is downed and needs help" + (a.koCause ? " — " + a.koCause + "." : ".");
        panelBody.appendChild(note);
        const btn = document.createElement("button"); btn.className = "revive-btn";
        btn.textContent = "✚ REVIVE " + a.name.toUpperCase();
        btn.addEventListener("click", () => { revive(a, null); openPanel(a); });
        panelBody.appendChild(btn);
        const warn = document.createElement("p"); warn.className = "revive-warning";
        warn.textContent = "They'll get up with partial health and feel weakened for a while — food and rest will fix them right up.";
        panelBody.appendChild(warn);
        updateNeedsUI();
      } else {
        updateNeedsUI();
        buildChat(a);
      }
    }
    overlay.classList.remove("hidden");
    panelBody.scrollTop = 0;
  }
  function closePanel() { panelOpen = false; panelAgent = null; panelObject = null; overlay.classList.add("hidden"); }

  // little info card for a clicked world object (campfire, house, farm...)
  function openObjectPanel(o) {
    panelOpen = true; panelAgent = null; panelObject = o; panelGen++; hovered = null; canvas.style.cursor = "default";
    panel.classList.toggle("dormant", false);
    panelBody.innerHTML = "";
    panelBody.dataset.agentId = "obj_" + o.id;
    const head = document.createElement("div"); head.className = "agent-head";
    const c = document.createElement("canvas"); c.width = 84; c.height = 84; c.className = "agent-avatar";
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    if (o.icon) {
      const spr = o.icon();
      const s = Math.max(1, Math.floor(72 / Math.max(spr.width, spr.height)));
      g.drawImage(spr, Math.floor((84 - spr.width * s) / 2), Math.floor((84 - spr.height * s) / 2), spr.width * s, spr.height * s);
    } else if (o.draw) o.draw(g);
    head.appendChild(c);
    const meta = document.createElement("div"); meta.className = "agent-meta";
    meta.innerHTML = '<h2 class="active">' + o.name + '</h2><span class="badge active">PLACE</span>';
    head.appendChild(meta); panelBody.appendChild(head);
    const blurb = document.createElement("p"); blurb.className = "agent-blurb"; blurb.textContent = o.blurb; panelBody.appendChild(blurb);
    const kvs = document.createElement("div"); kvs.className = "kvs"; kvs.id = "objinfo"; panelBody.appendChild(kvs);
    updateObjectPanel();
    overlay.classList.remove("hidden");
    panelBody.scrollTop = 0;
  }
  function updateObjectPanel() {
    const o = panelObject; if (!o) return;
    const kvs = panelBody.querySelector("#objinfo"); if (!kvs) return;
    const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>";
    const html = o.info().map(row => kv(row[0], row[1])).join("");
    if (kvs.dataset.last !== html) { kvs.dataset.last = html; kvs.innerHTML = html; }
  }

  function buildChat(a) {
    const log = document.createElement("div"); log.id = "chatlog"; panelBody.appendChild(log);
    const form = document.createElement("form"); form.id = "chatform";
    form.innerHTML = '<input id="chatinput" autocomplete="off" placeholder="Talk to ' + a.name + '..." /><button class="send-btn" type="submit">SEND</button>';
    panelBody.appendChild(form);
    const input = form.querySelector("#chatinput");
    function add(text, who) { const m = document.createElement("div"); m.className = "msg " + who; m.textContent = text; log.appendChild(m); log.scrollTop = log.scrollHeight; return m; }
    const persona = PERSONAS[a.id];
    add(persona ? persona.intro : ("Hi! I'm " + a.name + "."), "bot");
    setTimeout(() => input.focus({ preventScroll: true }), 50);
    form.addEventListener("submit", async e => {
      e.preventDefault(); const text = input.value.trim(); if (!text) return;
      const gen = panelGen;
      add(text, "you"); input.value = ""; input.disabled = true;
      const typing = add(a.name + " is thinking...", "bot typing");
      const reply = await getReply(a, text);
      if (gen !== panelGen) return; // panel closed/switched mid-reply — drop stale update
      typing.remove(); add(reply, "bot");
      input.disabled = false; input.focus();
    });
  }

  /* ==========================================================================
     ★★★  WHERE TO PLUG IN THE REAL AI  ★★★
     Replace PERSONAS.claude.reply with an Anthropic API call. Example:
       const res = await fetch("https://api.anthropic.com/v1/messages", {
         method:"POST",
         headers:{ "content-type":"application/json", "x-api-key":YOUR_KEY,
           "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true" },
         body: JSON.stringify({ model:"claude-opus-4-8", max_tokens:300,
           messages:[{ role:"user", content:userText }] })
       });
       return (await res.json()).content[0].text;
     (For a public site, route through a backend so the key stays secret.)
     ========================================================================== */
  const PERSONAS = {
    claude: {
      intro: "Hi! I'm Claude — the agent running this town. What's up?",
      reply: (t, raw) => {
        if (/\b(hi|hello|hey|yo|sup)\b/.test(t)) return "Hey there! Welcome to PokeAgents. Everyone's busy surviving — hunting, farming, cooking. Stick around for sunset dinner.";
        if (/who are you|what are you|your name/.test(t)) return "I'm Claude, the strategic one. I plan ahead, share food, and take night watch when the zombies come.";
        if (/how are you|how's it going|how do you feel/.test(t)) return "Pretty good — pantry's stocked and the farm's growing. Ask me again after a night shift.";
        if (/zombie|demon|monster|night|scary|fight|danger/.test(t)) return "At night, zombies shamble out of the dark forest edge — demons too, on bad nights. We roll initiative and hold the line by the fire. Danger creeps up every night.";
        if (/imp\b|pet/.test(t)) return "The imp? Hatched from a mystery egg. Completely friendly, chases butterflies, naps by the fire. We didn't have the heart to shoo it off.";
        if (/route|east|area|travel|road|explore/.test(t)) return "The east road leads out to the route — wilder country: meadows, mushrooms, an old shrine. Use the arrow at the edge of the screen to look around there.";
        if (/farm|crop|carrot|potato|corn|plant|harvest/.test(t)) return "The farm's south-west — carrots grow fast, corn takes ages but feeds more. Suni keeps it watered. Rain does it for free!";
        if (/hunt|rabbit|deer|meat|animal/.test(t)) return "Averis does most of the hunting in the tall grass — here and out east. Rabbits dodge, deer bolt. Cook everything at the campfire first.";
        if (/cook|food|stew|eat|hungry|campfire|fire/.test(t)) return "The campfire is the heart of town. Meat plus veggies makes stew — best meal we've got. A shared dinner lifts everyone's mood.";
        if (/friend|relationship|social|rival|love/.test(t)) return "We all keep score quietly — chats, shared meals, sheltering from rain, and fighting side by side make friends. Arguments and running from a fight... don't.";
        if (/weather|rain|storm|wind|mist/.test(t)) return "Weather rolls through on its own — and rain waters the crops for free. When a storm hits, find me under a big tree. Press W if you want to see it change.";
        if (/help|what can you do|can you do/.test(t)) return "I'm in demo mode with scripted replies. Wire me to the real Claude API and I'll actually think — there's a note in game.js.";
        if (/averis|sunbeam|suni|character|\boc\b/.test(t)) return "Averis and Suni are Mark's original characters. He hunts and slings fireballs; she farms, cooks — and smites monsters with holy light from her doorstep.";
        if (/need|sleep|tired|sims|stat/.test(t)) return "We run on health, hunger, energy and mood. When one dips we deal with it — eat, rest, or find a friend. Very Sims of us.";
        if (/wake|activate|turn on|dormant|yenna|atlas/.test(t)) return "Everyone's awake these days! Atlas rebuilds whatever the monsters smash, and Yenna — the wolf girl with the enormous tail — guards him while he works, then patrols the bounds. Her wolves are friendly. Probably.";
        if (/heal|tree|rest|recover/.test(t)) return "The great Healing Tree north-east of the crossroads is where we recover now — rest under its blossoms and you can literally see the healing sparkle. Beats a stuffy house.";
        if (/frog/.test(t)) return "Averis's frog adopted the whole town. Hops after us everywhere — and if a monster's on its last legs, the frog just... eats it. Whole. We don't ask questions.";
        if (/time|clock|day|sunset|sunrise/.test(t)) return "The town follows your real clock! Click the clock top-right to preview sunrise, day, sunset or night.";
        if (/bye|see ya|goodbye|later/.test(t)) return "Catch you later! I'll be on watch.";
        if (/love|cool|awesome|nice|amazing|beautiful|pok|heartgold/.test(t)) return "Right? Mark calls it PokeAgents. I just live here — and defend it.";
        return "I'm in demo mode, so this reply is scripted — but I heard “" + raw + "”. Connect me to the real API for a proper answer!";
      }
    },
    averis: {
      intro: "Oh — hey. Didn't hear you on the path. Name's Averis.",
      reply: (t, raw) => {
        if (/\b(hi|hello|hey|yo|sup)\b/.test(t)) return "Hey. I was about to go hunting — stomach's grumbling and the rabbits are quick today.";
        if (/who are you|what are you|your name|averis/.test(t)) return "Averis. Hunter, mostly. The hood's got ears, the tail's got spots — don't make it weird.";
        if (/wife|suni|sunbeam|married|marriage|love/.test(t)) return "Suni? She's my wife. Best thing that ever happened to me — and the only reason this town eats hot meals. Touch her and you'll learn what my fire is actually for.";
        if (/imp(s)?\b.*summon|summon.*imp|minion/.test(t)) return "The imps? Family recipe. Snap of the fingers and out they wriggle — rude little things, but they bite for me. More of them answer every year I get stronger.";
        if (/frog|pet|cheese|companion/.test(t)) return "That'd be my little frog back at camp. Picky eater — only the good cheese. The imp keeps trying to befriend it.";
        if (/imp/.test(t)) return "The imp follows me on hunts sometimes. Scares off every rabbit within a mile. Can't stay mad at it though.";
        if (/route|east|road/.test(t)) return "The east route's my favourite ground — big meadows, more game, fewer interruptions. Watch the grass out there at night.";
        if (/tail|hood|dragon|ears/.test(t)) return "Hood keeps the sun off. The tail's mostly for balance. Mostly.";
        if (/hunt|rabbit|deer|meat/.test(t)) return "Rabbits juke sideways, deer just run. Miss three times and you go home embarrassed. I rarely go home embarrassed.";
        if (/fire|fireball|magic|spell|cast/.test(t)) return "The fireball? Ranger trick — flint, focus, and a good throwing arm. I soften them up from range before they ever reach the fire.";
        if (/zombie|demon|night|fight|scared/.test(t)) return "Scared? Of those shamblers? I open with a fireball and roll first at the line every night. Someone has to.";
        if (/how are you|how's it going|feel|need|tired|hungry/.test(t)) return "Bit peckish, bit restless. I'll catch something for the fire and sort myself out.";
        if (/mark|who made|drew|design/.test(t)) return "Mark drew me. Took him forever to get the tail spots right. Worth it.";
        if (/bye|see ya|goodbye|later/.test(t)) return "Safe travels. Mind the grass — and the dark.";
        return "Huh. Anyway — I'm just passing through. Ask me about hunting, or my frog if you're curious.";
      }
    },
    sunbeam: {
      intro: "Oh! Hello there… welcome. It's a lovely day for the town, isn't it?",
      reply: (t, raw) => {
        if (/\b(hi|hello|hey|yo|sup)\b/.test(t)) return "Hello, hello… I was just heading to water the crops. Care to walk with me?";
        if (/who are you|what are you|name|sunbeam|suni|yearn/.test(t)) return "Mark finally settled it — I'm Suni! The folder used to literally say 'idk yet'. Suni. I rather like the sound of it.";
        if (/smite|holy|light.*(strike|smite|beam)|power|magic/.test(t)) return "When the monsters press too close to my friends… I ask the light to come down. Politely. It listens — and they rather dramatically stop.";
        if (/husband|averis|married|marriage|love/.test(t)) return "Averis is my husband — my restless, fire-flinging husband. He acts so tough, but he still picks me flowers from Mina's garden. Don't tell Mina.";
        if (/tea|cookie|cookies|food|eat|drink|cook|stew/.test(t)) return "I do most of the cooking here — stew nights are my favourite. Tea and cookies make the world kinder, I think.";
        if (/imp/.test(t)) return "The little imp? It naps in the flower garden and squeaks when dinner's ready. I leave it berries sometimes.";
        if (/farm|crop|carrot|potato|corn|berry|berries|plant|mushroom/.test(t)) return "The farm is my little kingdom — and there's a mushroom ring out east by the old stones, if you're brave enough to cross the road.";
        if (/shrine|wish|stones/.test(t)) return "The shrine on the route... I made a wish there once. I won't say what. The gem glows at night, you know.";
        if (/zombie|night|scared|demon|hide/.test(t)) return "When night comes I keep close to the house. Averis and Claude are braver than me… I make sure there's warm food when they get back.";
        if (/how are you|how's it going|feel|need|social/.test(t)) return "Warm and content — though I do love a little company. Come sit by the fire at sunset.";
        if (/mark|who made|drew|design/.test(t)) return "Mark made me. He calls me his 'little sunbeam'. I rather like that.";
        if (/sad|light|warm|pretty|beautiful|sun/.test(t)) return "The light always finds its way, even on grey days. Hold onto that.";
        if (/bye|see ya|goodbye|later/.test(t)) return "Take care now, and mind the puddles. The light will follow you home.";
        return "That's kind of you to say… would you like to hear about the farm, or help me pick a name?";
      }
    },
    yenna: {
      intro: "*a low rumble* …You smell like a friend. Speak.",
      reply: (t, raw) => {
        if (/\b(hi|hello|hey|yo|sup)\b/.test(t)) return "*nods once* Hm. You may stand near me. Most can't.";
        if (/who are you|what are you|your name|yenna|wolf|tiger|beast/.test(t)) return "Yenna. Beast warrior. Part wolf, all teeth. I guard this town and the soft ones in it.";
        if (/wolf|wolves|pack|summon/.test(t)) return "The little wolves? Old pack magic — I call, they come, they bite, they fade. Loyal as moonlight. Don't try to pet them mid-fight.";
        if (/axe|weapon|fight|strong/.test(t)) return "The axe was my mother's. It remembers every swing. Monsters learn its name quickly — they just don't keep it long.";
        if (/atlas|builder|guard|protect/.test(t)) return "Atlas builds; I watch his back. Hammer-folk forget to look behind them. That's what I'm for.";
        if (/patrol|watch|bounds/.test(t)) return "When every roof stands, I walk the bounds. Corner to corner, scent to scent. Nothing crosses my line twice.";
        if (/zombie|demon|monster|night|scared/.test(t)) return "Scared? *bares teeth in what might be a smile* Night is when the work gets interesting.";
        if (/how are you|feel|tired|hungry/.test(t)) return "Fed, rested, restless. A quiet day dulls the claws. Hoping something stupid wanders out of the forest.";
        if (/eye|patch|scar/.test(t)) return "The patch? A story for another fire. The eye underneath still works... on the things that matter.";
        if (/mark|who made|drew|design/.test(t)) return "The maker gave me the wild mane, the jacket, and this magnificent tail. Good eye. The fangs were my idea.";
        if (/tail/.test(t)) return "*the tail swishes, knocking a cup off the table* ...It has a mind of its own. We've made peace with that.";
        if (/bye|see ya|goodbye|later/.test(t)) return "Walk safe. If something follows you... it won't for long.";
        return "*flicks an ear* Words are small. Ask about the pack, the axe, or who I guard.";
      }
    },
    atlas: {
      intro: "Oh — hello! Mind the sawdust. Always something to fix around here.",
      reply: (t, raw) => {
        if (/\b(hi|hello|hey|yo|sup)\b/.test(t)) return "Hey hey! Good timing — just finished re-shingling. Or was about to. One of the two.";
        if (/who are you|what are you|your name|atlas/.test(t)) return "Atlas — town builder. If it's got walls and the monsters knocked it down, I put it back up. Usually better than before.";
        if (/build|repair|fix|hammer|shack|house|rebuild/.test(t)) return "Fifteen planks a second, that's my pace! Shacks, cabins, even the inn out east — nothing stays rubble while I've got my hammer.";
        if (/yenna|tiger|guard|wolf/.test(t)) return "Yenna? Best workmate I've ever had. I hammer, she glowers at the treeline. Haven't been eaten even once since she started.";
        if (/eye|patch/.test(t)) return "Her eyepatch? I asked once. She sharpened the axe for an hour and didn't answer. Didn't ask twice.";
        if (/square|plaza|town centre|center|flag/.test(t)) return "The town square's my pride — laid every paving stone myself. If everything ever burns down, that's where we all gather. Stone doesn't burn, see.";
        if (/zombie|demon|monster|night|scared/.test(t)) return "Monsters make work, I'll give them that. Smash, rebuild, smash, rebuild... honestly it keeps me employed.";
        if (/farm|crop|food|eat/.test(t)) return "I lend a hand on the farm between jobs — a builder's no good on an empty stomach.";
        if (/how are you|feel|tired/.test(t)) return "Splinters in both thumbs and couldn't be happier. A town that needs fixing is a town worth keeping.";
        if (/mark|who made|drew|design/.test(t)) return "Mark sketched me ages ago and finally woke me up. Worth the wait — look at all this stuff to fix!";
        if (/bye|see ya|goodbye|later/.test(t)) return "Mind how you go! And if you hear creaking timber — that's probably mine, send for me.";
        return "Ha, sure! Ask me about building, the town square, or my bodyguard. Yes, the wolf.";
      }
    }
  };

  async function getReply(agent, userText) {
    await new Promise(r => setTimeout(r, 420 + Math.random() * 480));
    const p = PERSONAS[agent.id];
    return p ? p.reply(userText.toLowerCase(), userText) : "…";
  }

  /* ==========================================================================
     22. Go!
     ========================================================================== */
  function buildSolids() {
    for (const key in AREAS) {
      const area = AREAS[key];
      area.solids = [];
      for (const p of area.props) area.solids.push({ x: p.x, y: p.y - 2, r: p.big ? 9 : 7, key: p.key });
    }
    for (const s of shacks) AREAS[s.area].solids.push({ x: s.x, y: s.by - 9, r: 11, key: s.id });
    AREAS.deepwood.solids.push({ x: inn.x, y: inn.by - 14, r: 18, key: "inn" });
    AREAS.town.solids.push(
      { x: healTree.x, y: healTree.y - 6, r: 12, key: "healtree" },
      { x: house.x, y: house.y + 8, r: 20, key: "house" },
      { x: cabin2.x, y: cabin2.by - 10, r: 16, key: "cabin2" },
      { x: cabin3.x, y: cabin3.by - 10, r: 16, key: "cabin3" },
      { x: firepit.x, y: firepit.y, r: 7, key: "firepit" },
      { x: pond.x, y: pond.y, r: 13, key: "pond" },
      { x: well.x, y: well.y + 8, r: 7, key: "well" },
      { x: dummy.x, y: dummy.y + 6, r: 5, key: "dummy" },
      { x: flagpole.x, y: flagpole.y - 2, r: 3, key: "flag" },
    );
    AREAS.route.solids.push(
      { x: bench.x, y: bench.y + 6, r: 6, key: "bench" },
      { x: shrine.x, y: shrine.y + 8, r: 9, key: "shrine" },
    );
    AREAS.deepwood.solids.push(
      { x: ruins.x, y: ruins.y + 8, r: 10, key: "ruins" },
    );
    AREAS.lake.solids.push(
      { x: dock.x + 6, y: dock.y, r: 8, key: "dock" },
      { x: LAKE.x - 22, y: LAKE.y, r: 56, key: "lake1" },
      { x: LAKE.x + 38, y: LAKE.y, r: 54, key: "lake2" },
    );
  }
  function start() {
    treeSpr = makeTree(); bigTreeSpr = makeTree(true); houseSpr = makeHouse(); signSpr = makeSign(); firepitSpr = makeFirepit();
    cabin2Spr = makeCabin({ roof: "#4f9aa2", roofL: "#74bcc2", roofD: "#3c7a84" });
    cabin3Spr = makeCabin({ roof: "#7a6fb0", roofL: "#988fc8", roofD: "#5d5390" });
    wellSpr = makeWell(); dummySpr = makeDummy(); benchSpr = makeBench(); shrineSpr = makeShrine(); mushSpr = makeMush();
    ruinsSpr = makeRuins(); dockSpr = makeDock(); healTreeSpr = makeHealTree(); shackSpr = makeShack(); innSpr = makeInn(); flagSpr = makeFlag();
    rabbitSpr = renderGrid(RABBIT, RABBIT_PAL);
    deerSpr = renderGrid(DEER, DEER_PAL);
    zombSpr = buildPerson(ZOMBIE_LOOK, true);
    demonSpr = renderGrid(DEMON, DEMON_PAL);
    zombWhite = makeWhite(zombSpr); demonWhite = makeWhite(demonSpr);
    zombDark = makeDark(zombSpr); demonDark = makeDark(demonSpr);
    wolfSpr = renderGrid(WOLF, WOLF_PAL);
    impMinionSpr = renderGrid(IMPLING, IMPLING_PAL);
    computeWindowLights();
    buildTrees();
    for (const key in AREAS) {
      const area = AREAS[key];
      for (const p of area.props) if (p.big) area.shelters.push({ x: p.x, y: p.y + 11, anchor: p.key });
    }
    for (const rs of REST_SPOTS) AREAS[rs.area].shelters.push({ x: rs.x, y: rs.y, anchor: rs.anchor, enter: rs.enter });
    buildSolids();
    for (const key in AREAS) { buildGround(key); buildBlades(AREAS[key]); }
    makeImp();
    buildLabels();
    buildHotbar();
    setViewArea("town");
    resize();
    requestAnimationFrame(loop);
  }

  // press W to preview the next weather type (handy for seeing rain/storms)
  window.addEventListener("keydown", e => {
    if (e.key === "w" || e.key === "W") {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      const i = WEATHER_CYCLE.indexOf(Weather.changingTo || Weather.type);
      Weather.changingTo = WEATHER_CYCLE[(i + 1) % WEATHER_CYCLE.length];
      Weather.nextChange = 60 + Math.random() * 60;
    }
  });

  // little debug handle (also handy for tinkering from the console)
  let debugT = 0;
  window.poke = {
    agents, animals, enemies, plots, bushes, villagers, travellers, Time, Weather, AREAS,
    shacks, buildings, impMinions, wolves, fxAnims,
    get imp() { return imp; },
    get viewArea() { return viewArea; },
    go: a => setViewArea(a),
    setMode: m => { Time.mode = m; },
    setWeather: w => { Weather.changingTo = w; Weather.nextChange = 150; },
    // advance the sim by hand (the browser pauses rAF in hidden tabs)
    step: (ms = 33) => { debugT = Math.max(debugT + ms, performance.now()); update(ms / 1000, debugT); render(debugT); updateLabels(); },
  };

  if (document.fonts && document.fonts.load) {
    Promise.race([
      Promise.all([document.fonts.load('8px "Press Start 2P"'), document.fonts.load('16px "VT323"')]),
      new Promise(r => setTimeout(r, 1500)),
    ]).then(start, start);
  } else start();
})();
