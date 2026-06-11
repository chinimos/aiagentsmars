# Pokémon HeartGold / SoulSilver — Pixel-Art Style Analysis

A breakdown of the HGSS overworld look (Nintendo DS, 2009) so we can apply the
*style* to **Sky Agents**. This studies the technique — we build original art
from it, we do **not** copy Nintendo's actual sprites (see copyright note).

---

## The system it came from
- Nintendo DS, ~256×192 px screen, built on a strict **16×16 tile grid**.
- Evolution of the Game Boy Advance (Gen III) look — same grammar, more shading
  and detail. Everything reads as *deliberately hand-placed*.

## 1. Perspective — "3/4 top-down"
The ground is seen from above and slightly ahead, but **objects on it (trees,
signs, people, buildings) are drawn almost front-on**. This split projection —
top-down floor + face-on props — is the single most recognisable RPG-overworld
trait. Your eye reads a floor plan and a storybook at the same time.

## 2. Proportions — chibi
Characters are roughly **2 heads tall**, with the head ~45% of the body. Big
expressive head, small stubby body. Overworld sprites sit around **16w × 24–32h**.
(Your red-cap trainer sheet shows this: huge cap+face, tiny legs, 3–4 walk frames.)

## 3. Outlines — *selective outlining* (selout)
Not flat black everywhere. The outline is usually a **darker shade of whatever
it borders** — dark maroon around the red cap, dark green on the grass-side of a
tree, deep brown on dirt. True black is saved for the highest-contrast spots.
This is what makes HGSS look *soft* instead of *harsh*.

## 4. Colour — limited, warm, value-ramped
Each material is a tiny **ramp of 2–3 values**: base + shadow (+ occasional
highlight). Cel-shaded, no smooth gradients. The whole palette is **warm and
slightly desaturated** — sage greens, sandy tans, muted reds and blues — so
everything looks like it belongs to one cohesive world. Nothing neon.

Working palette (approximate, to retune Sky Agents toward):
```
Grass   light #8ec56b   base #66a84e   shadow #468a3f   deep #356b34
Path    light #e7d39a   base #d6b87a   shadow #b6945a   edge #9a784a
Trees   light #7cc050   mid  #4e9c40   dark #2f7233   outline #1e4d2a
Skin    light #f8d2ac   shadow #d99c70
Outline (selout) ~ a darkened version of the adjacent colour, not #000
Contact shadow   rgba(0,0,0,0.22) flattened oval
```

## 5. Light — one consistent direction (top-left)
Highlights on the top-left of every form, shadow on the bottom-right. Every
object obeys the same sun. This consistency is half of why it feels "designed."

## 6. Contact shadows
A soft, dark, semi-transparent **oval directly under** each character, tree, and
sign. Tiny detail, huge payoff — it grounds props onto the 3/4 floor.

## 7. Terrain — organic edges + a depth "lip"
- **Grass:** two greens with little blade-clusters/dots scattered in a tileable
  but irregular pattern (never a flat fill).
- **Grass→path transitions:** the border is **jagged and organic, never a
  straight line**, with a slightly darker green "lip" on the grass edge and a
  1px soft shadow falling onto the path — so the grass reads as *slightly
  raised*. That little lip is the whole 3/4 illusion.
- **Dirt/path:** speckled texture with a darker border where it meets grass.

## 8. Foliage — clustered "bubbles"
Trees are **clusters of overlapping rounded puffs** in 2–3 greens, selout
outline, highlight top-left, contact shadow below. Reads as bushy *volume*, not
a flat green blob.

## 9. Texture & dithering — used sparingly
A 2px **checker dither** bridges two shades on cliff faces, water, and gentle
gradients. Crucially: it's rare. Most surfaces are clean cel shading; dither is
a seasoning, not the main dish.

## 10. Animation — small and charming
2–4 frame walk cycles, a slight head/body bob, alternating legs. Idle motion is
subtle. The life comes from *small* movement, not flashy effects.

## The overall feel
Cozy, readable, warm, nostalgic, handcrafted. Every tile looks placed by a
person who cared.

---

## How this maps onto Sky Agents
- **Agents** → redraw as **original** chibi characters: bigger heads, selout
  outlines, 2-shade cel shading, a contact shadow. Claude stays warm/coral and
  "awake"; the others stay desaturated/dormant — but now in HGSS shading.
- **Island tops** → HGSS 3/4 grass: blade clusters, a raised darker lip, and a
  soft shadow dropping onto the rock below.
- **Rock undersides** → warm tan/brown with light selout and *sparse* dither.
- **Trees / props** → clustered-puff foliage; optional sign, path, fence.
- **Palette** → retune the whole scene to the warm ramps above.
- **Light** → commit to one top-left sun across every element.

## Copyright note (important)
Art *style and technique* aren't copyrightable, so mimicking the HGSS look is
fine. The actual Pokémon sprites and characters (like the red-cap trainer in
your reference) **are** Nintendo/Game Freak's — so we create **original**
characters and tiles in this style rather than reproducing theirs.
