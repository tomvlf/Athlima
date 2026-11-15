# Athlima brand guidelines

## Brand idea

Athlima connects focused training with forward momentum. The rising A is the
road ahead; the forward-leaning rider and partial wheels make the mark
recognizable as cycling without becoming a literal illustration. The blue to
cyan to green gradient expresses progress.

The **production** kit is the recommended, simplified version. The **reference**
kit is a separately drawn interpretation of the supplied raster reference:
its silhouette, color direction and layout are closely matched, but it is not
an exact trace or a substitute for the original vector source.

## Logo system

Paths below are relative to either kit directory. SVGs have editable vector
groups; the wordmark and tagline are outlined, so viewing does not depend on
installed fonts.

| Asset | Use |
| --- | --- |
| `svg/icon.svg` | Transparent gradient symbol, when space is limited |
| `svg/logo-horizontal.svg` | Primary lockup on light surfaces |
| `svg/logo-horizontal-dark.svg` | Gradient symbol and white type on dark surfaces |
| `svg/logo-stacked.svg` / `svg/logo-stacked-dark.svg` | Centered presentations |
| `svg/monochrome.svg` / `svg/white.svg` | Single-color marks for light / dark surfaces |
| `svg/logo-horizontal-white.svg` / `svg/logo-stacked-white.svg` | All-white lockups on dark or photographic surfaces |
| `svg/icon-dark.svg` / `svg/icon-light.svg` | Full-bleed square app icons |
| `svg/favicon.svg` / `svg/social-avatar.svg` | Square, optically sized variants |

Use the horizontal lockup by default. Use the symbol alone where the brand is
already identified or the full name is too small to read. The dark and light
lockup SVGs have transparent backgrounds; select the one appropriate to the
surface. Do not add a tagline at small sizes.

## Clear space and minimum size

- Keep at least **one rider-head diameter** of clear space around the visible
  mark and around every side of a lockup. This space is in addition to the
  canvas padding already included in an exported square.
- Keep the square favicon at least **16 × 16 px**. Dedicated 16, 24, 32, 48
  and 64 px exports are included; use those rather than shrinking a lockup.
  The production favicon simplifies the rear wheel and thickens the front
  wheel; at 16 px the silhouette takes priority over fine detail.
- Use the standalone symbol at a visible width of at least **24 px**. Use
  the horizontal lockup at a width of at least **180 px**, and the stacked
  lockup at least **160 px**. Omit the tagline below **240 px** stacked width;
  use the icon or horizontal version instead.
- Preserve proportions. The app icon is full bleed and square: let iOS and
  Android apply their own masks and corners. Do not add baked-in rounded
  corners, shadows, or a border.

These are recommended minimums, not a guarantee of legibility on every display.
Preview at actual size, particularly the 16 px favicon.

## Color

| Role | Hex | Usage |
| --- | --- | --- |
| Primary blue | `#1479F6` | Beginning of the gradient |
| Primary cyan | `#27C9E8` | Gradient midpoint |
| Primary green | `#42E89B` | Gradient endpoint |
| Dark background / dark text | `#061527` | Default app icon surface; text on light |
| Light background | `#F6F9FC` | Light surfaces |
| Light text | `#FFFFFF` | Text and white mark on dark |

```css
:root {
  --athlima-blue: #1479f6;
  --athlima-cyan: #27c9e8;
  --athlima-green: #42e89b;
  --athlima-dark: #061527;
  --athlima-light: #f6f9fc;
  --athlima-text-dark: #061527;
  --athlima-text-light: #ffffff;
}
```

Use the gradient for the logo and accents, not as the default text color.
Dark text on light is approximately **17.37:1** and white on dark **18.35:1**.
The blue stop on dark is approximately **4.45:1**, slightly below the 4.5:1
normal-text threshold; cyan and green have low contrast on light. For small
graphics on light surfaces prefer the dark monochrome mark; never rely on
gradient color alone to convey meaning. Check contrast against the actual
background and applicable accessibility requirements.

## Typography

- **Wordmark:** Lato Heavy, with custom proportions in the supplied outlined
  lockups. Google Fonts equivalent: [Lato](https://fonts.google.com/specimen/Lato).
- **Headlines:** Manrope Bold or ExtraBold.
  [Google Fonts](https://fonts.google.com/specimen/Manrope).
- **UI and data:** Inter Regular, Medium and Semibold; use tabular numbers for
  metrics. [Google Fonts](https://fonts.google.com/specimen/Inter).

Do not retype the wordmark to reproduce a logo. The outlines were generated
from Lato; its copyright and license are included in each kit as
`LATO-OFL.txt`. No fonts or raster images are embedded in the SVGs.

## Usage examples

**Do**

- Use the gradient symbol with dark lettering on a light, quiet surface.
- Use the gradient symbol with white lettering on a dark, quiet surface.
- Use the all-white lockup on a dark photograph with sufficient contrast.
- Use the supplied square avatar for circular social crops.

**Don't**

- Stretch, rotate, skew, outline, recolor individual elements, or reverse the
  gradient.
- Place the mark over busy detail or use low-contrast color combinations.
- Replace the wordmark with a different typeface or rearrange the rider.
- Put the full lockup or tiny tagline in a favicon.

## Export map

- `svg/`: editable, SVGO-optimized vectors and light, dark and single-color
  variants. `png/` contains transparent lockup PNGs and square icon exports.
- `favicon/`: PNGs and a multi-image ICO containing 16, 32 and 48 px frames.
- `ios/`: opaque RGB iPhone, iPad and App Store PNGs plus `Contents.json`.
  Copy the contents to an Xcode `.appiconset`; configure additional current
  platform appearances in Xcode if needed.
- `android/`: Play Store PNG, adaptive foreground and background masters,
  launcher PNGs for five densities, and `mipmap-anydpi-v26/ic_launcher.xml`.
  Copy the `mipmap-*` directories into `res/`. Foreground art sits within the
  central 66 dp safe circle of the 108 dp adaptive canvas.
- `social/` (production): square avatars for LinkedIn, GitHub, X and Discord.
  The composition leaves room for circular crops. Confirm current platform
  specifications before uploading.

## Regeneration

Run `scripts/generate-brand-kits.mjs` from the repository root with Node 22.18
or later, ImageMagick with SVG support, Pango (`pango-view`), Lato Heavy and
Medium, and SVGO 4 installed. The generator writes the two kit directories.
For example, install SVGO in a separate tools directory and set
`SVGO_MODULE` to its absolute `node_modules/svgo/lib/svgo-node.js` path:

```sh
npm install --prefix /tmp/athlima-brand-tools svgo
SVGO_MODULE=/tmp/athlima-brand-tools/node_modules/svgo/lib/svgo-node.js \
  node scripts/generate-brand-kits.mjs
```

Pango/font and renderer versions can change the exact exported pixels. Review
the SVGs and the small PNGs before shipping. The existing application's assets
are not changed by generating these kits.
