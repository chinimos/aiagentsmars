# ✦ PokeAgents

A HeartGold-style pixel **survival world** that runs itself — **four connected
areas** with **PokeTown as the hub**: the **East Route** lies east, gloomy
**Deepwood** west (mind the ruins), and the road south runs down to
**Lakeshore**, where the fish are biting. Agents, travellers, animals and
monsters genuinely walk between them — use the arrow buttons on the screen
edges (east, west, south... and north to come home) to follow. Every area is
one hop from town, so the roads stay busy.

**You can stir the pot yourself:** the two buttons in the bottom-right
**spawn a monster or a traveller** into whichever area you're watching —
button-summoned monsters don't fear the daylight. Natural spawn timing is
wildly erratic now: bursts of trouble, then long eerie lulls.

The agents live like little Sims with a survival twist: each one tracks
**health, hunger, energy and mood**, and decides on its own to hunt, farm,
cook, eat, rest, make friends — and fight off the monsters that creep out of
the forest at night.

**The world is alive:** TALL tall grass, HeartGold-style — characters and
animals **sink into it**, and it bends and springs back when anyone brushes
through · flickering window lights · fireflies at night · butterflies and
pollen by day · blinking eyes · four background townsfolk (Mina, Bo, Petra,
Nilo) who **cower indoors and cheer the defenders during night attacks** ·
random travellers walking the whole road end to end · and **Averis's pet
frog**, which hops after the agents, chases butterflies — and swallows
weakened monsters whole (GULP!).

Combat is fully visible: attack lunges, hit flashes, knockback, spark bursts,
screen shake on crits — and **Averis charges his fireball**: he stands still
while the orb grows and glows in his hand, then lets a big, haloed fireball
fly (d8 on impact, ember trail, lights up the night).

**The great Healing Tree** (NE of the crossroads) replaced the house as the
town's healing station — resting under its pink blossoms heals fastest, with
a visible aura of healing pixels and rising sparkles. Badly hurt agents make
straight for it.

**Places to be:** the farm, campfire, pond, sign, **well**, **flower garden**
and **training dummy** in town; the **old bench**, glowing **wishing shrine**
and **mushroom ring** on the route; the haunted-looking **ruins** and mushroom
cluster in Deepwood; the **dock** (fishing!) and skipping-stones shore at the
lake.

- **Day & night follow your real clock** (sunrise 5–7, day 7–17, sunset 17–20,
  night 20–5). Click the clock (top-right) to preview any time of day.
- **Weather changes over time** — clear, cloudy, windy (drifting leaves),
  rain, storms and misty mornings, with puddles, pond ripples, cloud shadows
  and pollen motes. Rain waters the crops for free; agents dash for cover
  under the big trees or by the house doors (press **W** to preview weather).
- **Shadows follow the sun** — long and warm at sunrise/sunset, soft under
  clouds and moonlight.
- **Day:** hunt rabbits & deer in the NE tall grass, plant / water / harvest the
  SW farm, forage berries, cook at the campfire (meat + veg = stew!), chat, wave.
- **Sunset:** everyone drifts to the campfire for dinner and stories.
- **Night:** zombies (and demons, on bad nights) creep out of the dark forest
  edge — and combat plays out **D&D-style**: initiative is rolled at nightfall,
  attacks are d20 + bonus vs AC, with crits, fumbles, dodges, and WIS saves
  against fear. Claude (Strategist) covers the weakest teammate and inspires
  nearby fighters; Averis (Ranger) hits hard; Sunbeam (Healer) patches people up.
- **Nobody dies** — a downed agent shows **DOWNED**; click them and press
  **REVIVE**, or wait for a friend to help them up. They return weakened.
- **Relationships** (-100…100): chatting, shared meals, sheltering from rain,
  farming and fighting side-by-side build friendships; arguments and fleeing
  a fight don't.

**Agents:** Claude (Strategist), plus Mark's original characters
**Averis** (Ranger — charges and slings fireballs) & **Suni** (Healer — calls
down **holy light to smite monsters**, who die in bright expanding waves and
disintegrate into rising light) — and now the whole roster is awake:
**Atlas** (Builder — built like the houses he raises: broad shoulders, bare
working arms, gold tank top and a loaded tool belt; crosses the world to
rebuild anything broken) and **Yenna** (Beast Warrior — a head-taller,
silver-maned wolf warrior with wolf ears, two sharp red eyes, a red choker,
a fur-trimmed jacket and her mother's axe; the most HP on the team. She
**summons a pack of spirit wolves** to fight beside her, drops everything to
**stand guard over Atlas while he repairs**, and **walks a six-point patrol
of the town bounds** whenever every roof stands whole).

**NOW IN REAL PIXEL-ART (v15):** the whole cast wears the **Minifolk asset
pack** — every hero, villager and traveller is a proper animated sprite with
idle and walk cycles (Claude the SwordMan, Atlas the Worker; knights and
mages on the road). **The OCs wear Mark's own designs**, hand-pixelled into
matching Minifolk-style sheets (generated by `tools/make-oc-sheets.ps1`):
**Averis** the deadpan devil-boy — dark curls, red horns with a gold band,
red vest under a gold-trimmed black coat; **Suni** the little sunbeam —
golden waves, golden eyes, cream-and-gold dress; and **Yenna** the punk wolf
girl — wild dark mane, amber eyes, a fanged grin, leather jacket with a grey
fur collar, ripped jeans, and one ENORMOUS tan-tipped tail. Monsters are the **Tiny RPG Orc** with real walk/attack/death
animations (demons are hue-shifted hellward), rabbits, deer and the spirit
wolves use the Minifolk forest animals, and hits land with **real effect
sheets** — slash arcs, elemental impact bursts, heal sparkles and a proper
cartoon explosion for meteors. **Townsfolk have skill trees too** (humble
ones — Knight and Ice Mage, no ultimates), clicking any skill now opens a
big **popup card**, the TRAVELLER button can flood the road with up to 24
wanderers — and **Averis married Suni**: his new *Soulbound* passive mends
them both when they're close and sets his casting on fire when she's in
danger, while *Summon Imps* pops a gaggle of biting fire imps that grows
with his level.

**THE TOWN IS AN RPG PARTY NOW.** Every agent is a hero with a **class, a
specialization, a skill tree, levels and XP**: Claude the Fighter-Strategist,
Atlas the Fighter-Earthshaper, Averis the Fire Mage, Suni the Druid Sun
Warden, Yenna the Druid Beastmaster. They earn XP by fighting, healing,
rebuilding and cooking; talent points spend themselves as each hero grows,
ranking abilities from a humble Rank 1 to a spectacular Rank 5 — bigger
numbers AND visibly bigger effects (a Rank 5 fireball is a monster compared
to Rank 1). New moves join the kit on the way up: Claude's **Whirlwind**
(a dust-ring spin that hits everything in reach), Atlas's **Hammer Bash**
(stun stars!) and **Earthshatter** (the ground literally CRACKS), Averis's
**Flame Wave** (a travelling wall of fire). Every cast announces itself with
a big skill-name popup in the caster's class colour, and damage numbers are
class-tinted so you can read a brawl at a glance.

**At level 5 each hero unlocks a UNIQUE ULTIMATE**, no two alike:
- Claude — **Master Strategist**: allies fight harder; every enemy's weakness
  is revealed (+25% damage taken, marked overhead).
- Averis — **Meteor Storm**: the sky opens and meteors hammer the field.
- Suni — **Dawn of Renewal**: a private sunrise — allies healed, the fallen
  RISE, every monster dazzled blind.
- Yenna — **Call of the Wild Hunt**: a spectral stampede tramples the
  battlefield while her pack swells to four.
- Atlas — **Sanctuary Walls**: a ring of spectral stone; friends take half
  damage while it stands.

**Open any agent's panel → SKILL TREE** for their full sheet: class, spec,
level, XP bar, talent points, the node tree (locked / unlocked / MAXED with
a glow), rank-milestone evolutions like *Greater Fireball* and *Rending
Edge*, and a click-for-details card with damage, scaling, cooldown, range
and next-rank bonus. The **📜 SKILLS button** (bottom-right) opens the whole
codex — every hero's tree on one scroll.

**Steel is drawn and spells are sung:** fighters carry their weapons in the
open now — Claude's longsword, **Yenna's axe in hand**, **Suni's gem-tipped
healer's staff**, and every Knight walks with **sword up and shield out**.
When anyone winds up a spell, **little musical notes spill from their mouth**
— every incantation here is sung. Averis thrusts an open palm forward and
the fire answers: his fireball is a proper **comet** now, a roaring haloed
head dragging a licking golden-to-smoke tail. Ice mages loose a **swarm of
six sleek frost darts** per volley. And the town rebuilds FAST — Atlas drops
everything for a broken roof and hammers it whole in seconds.

**The monster roster grew teeth (v16):** orcs are properly BIG now (scaled
to loom over the heroes), every orc rolls its own shade of mean, and new
threats prowl the night — the hulking **Brute** (slow, dark, 120 HP of bad
news), charging **wild boars** and fast **feral wolf packs** wearing the
forest-animal sheets at threat scale. And Atlas got the ability he was built
for: **Goblin Toss** — he grabs the nearest monster by the scruff, winds up,
and HURLS it in an arc at its friends; everyone involved in the landing
takes damage and sees stars. Rank it up for *Bowling Ball* splash and the
*Fastball Special*.

**Combat bleeds now:** every solid hit sprays **blood droplets** and knocks
**pixel chips off the victim** in their own colours, tumbling under gravity.
And **Suni got a holy upgrade**: her smite opens with **one colossal beam,
then a volley of three echo beams** rains down on whatever's nearby (3d8 +
double WIS on the big one), and survivors are **DAZZLED — frozen, unable to
move or attack, for 5 full seconds**. Off the battlefield she's the town
medic: she walks to anyone wounded and **channels them back to FULL health**
— costs no mana, but a monster's hit breaks her concentration.

**The townsfolk live in their homes now:** villagers and settled travellers
potter around their own yards, **pop indoors** during the day (portrait chip
over the roof), and at night they don't sleep on the lawn — they **step
inside and go to bed**. If the roof comes down on them, they're thrown out
with the splinters.

Click any active agent for live stats, class & AC, status condition, inventory,
current task & thought, best friend / rival, and chat.

**They truly USE the town:** agents walk to an object's interaction point,
turn to face it, and act — **sitting** around the campfire and under trees,
**kneeling** to cook (with a stirring stick) and farm (tiny watering can,
seed packet, harvest basket), carrying food to the fire, and **actually
entering the houses**: they walk to the door, vanish inside with a puff,
recover safely away from rain and monsters, and step back out when done —
and while they're in there, **little portrait chips hover over the roof**
so you always know who's home. Hard collision keeps everyone out of walls,
trees and water.

**Everyone fights with style:** every soul in this world has a charged
signature skill — stand still, wind it up, unleash. Claude's **heavy strike**
sweeps a huge ghosting sword arc; Averis' **fireball** is a roaring haloed
boulder of flame; Suni's **holy smite** drops a colossal pillar of light; and
the townsfolk are either **Knights** (longsword arcs) or **Ice Mages**
(icicle volleys that slow monsters to a crawl). Charged hits hit HARD.
Newcomers carry generated one-of-a-kind names (Eddaelyn, Yarawood...) and
their own skill. Monsters now arrive in erratic packs; travellers sometimes
roll in as little caravans.

**Life is real now:** the townsfolk and travellers are **mortal** — a monster
that corners one can kill them for good, leaving a little **grave** where they
fell (the agents mourn; the town remembers). But the road brings new life:
every so often a traveller likes what they see and **checks into the Deepwood
Inn** — a lantern-lit haven right off the dark road — becoming a permanent
new resident with their own name, face and hotbar tile. The inn also gives
the agents a bed for overnight expeditions out east.

**The town can be hurt — ALL of it:** not just the three wooden **shacks**
but **every house** — the Big House, both cabins, even the Deepwood Inn —
can be smashed apart by monsters with nobody to bite, splinters and planks
flying with real physics until the building collapses into rubble (anyone
inside is thrown out with the furniture). By day the town rebuilds: villagers
and agents hammer away, Atlas fastest of all with Yenna glowering at the
treeline beside him (Suni mends with golden light instead). Casting magic
roots the caster for a moment — bigger spell, longer pause — and fireball
victims stay **scorched**: charred, dripping embers, slowly burning.

**The town square** is the heart of PokeTown now — Atlas's paved plaza at
the crossroads, flag snapping in the wind, the townsfolk's favourite spot
for people-watching. And it's more than decoration: **if every home falls
to rubble, everyone huddles together at the square** — villagers sleeping
shoulder to shoulder on the stones until the hammers bring the roofs back.

**Combat hits harder:** charged heavy strikes now carve away **around half
the target's health** in one swing, and every spell — fireball, smite,
icicle volley — **one-shots outright on a natural 20** (OBLITERATED! /
JUDGEMENT! / SHATTERED!).

**Click the world too:** the campfire, houses, Healing Tree, farm, pond,
well, dummy, sign, bench, shrine, ruins, dock and lake all open little live
info cards — who's inside, what's cooking, which plots are ready, who's
making wishes.

## Run it

No build step.

- **Easiest:** double-click `index.html`.
- **Local server:** `npm run dev`, then open http://localhost:5173.

## The files

| File | What it is |
|------|------------|
| `index.html` | Page shell: canvas, labels/fx layers, HUD, clock, event log, panel. |
| `styles.css` | All styling (HUD, clock, event log, bubbles, panel). Colours in `:root`. |
| `game.js` | The whole world: art, map, day/night, survival AI, combat, farming, UI. |
| `server.js` | Tiny static server for `npm run dev`. |
| `sprite-lab.html` | Dev page that renders the character sprites large, for editing. |

## Tweak it (no asset files — everything is drawn in code)

In `game.js`, top to bottom:

- **Characters** → `PERSON` / `AVERIS` / `SUNBEAM` pixel grids; creatures →
  `RABBIT`, `DEER`, `DEMON` grids (+ `ZOMBIE_LOOK` palette). Swap a grid to
  swap the art.
- **Agents & personalities** → `AGENT_DEFS` (traits: `brave`, `hunter`, `cook`,
  `farmer`, `loyal`, `shy`, `helper`, `chaotic`, `builder`; plus `cls`, D&D
  ability scores in `dnd`, and a damage die `dmgDie`). Signature skills live
  in `SKILLS` / `AGENT_SKILL`; Yenna's beat is the `PATROL` point list.
- **The world** → `AREAS.town` / `AREAS.route` (paths, waypoints, exits,
  enemy spawns, hunt zones); landmarks like `house`, `firepit`, `well`,
  `dummy`, `bench`, `shrine`, `mushRing`; cosy activities in `LEISURE`.
  Big trees with `shadeN` keys are the rain shelters. Add a third area by
  copying an entry in `AREAS` and linking it with `exits`.
- **Background folk** → `villagers` defs; traveller looks/blurbs in
  `TRAVELLER_LOOKS`/`TRAVELLER_BLURBS`; the imp lives in `makeImp`.
- **Food & crops** → `FOODS`, `CROPS` (grow times, yields), `plots`, `bushes`.
- **Combat maths** → `agentAttack` / `enemyAttack` (d20 rolls), `ENEMY_TYPES`
  (AC, attack bonus, damage dice), `danger`, decay rates in `decayStats`.
- **Day/night feel** → the `Time` object (`darkness`, `warm`) and
  `renderLighting`; **weather** → the `Weather` object + `pickWeather`.
- **Dialogue** → `CHATTER` pools (+ `CLAUDE_LINES`); chat → `PERSONAS`.
- **Console tinkering** → `window.poke` (e.g. `poke.setWeather("storm")`,
  `poke.setMode("night")`, `poke.step()` to advance a paused tab).

## Real AI

Claude's panel replies are scripted for now. To make him actually think, replace
`PERSONAS.claude.reply` with the Anthropic API call shown in the comment above it
(model `claude-opus-4-8`). For a public site, route it through a small backend so
your API key stays secret.

## Deploy (Cloudflare Pages)

Plain static site — **Build command:** *(empty)*, **Output directory:** `/`.
