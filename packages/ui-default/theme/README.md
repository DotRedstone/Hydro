# UI theme: design tokens

The UI is styled from **one token layer**. Nothing outside a palette is allowed to
hold a literal colour, so restyling the whole site (or adding a dark variant, or a
second palette) means editing values — not hunting through a hundred `.styl` files.

```
theme/palettes/*.css        <- values (the only place with literal colours)
theme/themes.ts             <- the theme list: id / label / dark / browser colour
common/variables.inc.styl   <- $stylus-variable -> var(--c-*) mapping
common/functions.inc.styl   <- token-alpha / token-mix / token-tint helpers
components/**/*.styl        <- consume $variables, never colours
```

## How theming works

* A palette defines CSS custom properties, scoped by a single class on `<html>`:
  `:root` is the default (light) paper, `:root.theme--dark` the dark one, and any
  extra palette adds `:root.theme--<id>`. So **a theme is a palette swap**, not a
  second stylesheet, and switching never reloads CSS.
* `theme/themes.ts` is the only list of themes (id, label, dark flag, browser
  colour). The server reads it for `/set_theme/:theme`, the display setting, the
  footer menu and `<meta name="theme-color">`; the client reads it for the in-place
  switch. Adding a theme = one palette file + one entry there.
* The active theme is, in order: the signed-in user's `theme` setting, then the
  `theme` cookie, then `default` (light). Anonymous visitors get the cookie, so
  picking a theme never requires an account; `components/theme/theme.page.ts`
  also flips the class in place and persists it in the background.
* `theme/dark.styl` (the old “override every light rule once more” file) is gone.
  Do not reintroduce it — add a token instead.
* `common/variables.inc.styl` keeps every historical `$name` (`$text-1-color`,
  `$primary-color`, …) but each one now points at a token. Existing `.styl` files
  therefore needed no renaming.
* Mantine islands (notifications, popovers, uploads) declare their own variables
  under `:root[data-mantine-color-scheme=…]`; the palette re-points those at the
  tokens at equal specificity ("Mantine bridge" block at the bottom of the file).
* Monaco (`components/monaco/index.ts`) defines the `hydro-tokens` editor theme
  from the computed token values and uses it when the user has not picked an
  editor theme. echarts (`pages/problem_statistics.page.ts`) reads tokens the same
  way.

## Tokens

| Group | Tokens |
| --- | --- |
| surfaces | `--c-bg` `--c-surface` `--c-sunken` `--c-hover` `--c-border` `--c-border-strong` `--c-nav-bg` `--c-overlay` |
| text | `--c-fg` `--c-fg-2` `--c-fg-3` `--c-heading` |
| accent | `--c-accent` `--c-accent-hover` `--c-accent-soft` `--c-accent-fg` `--c-focus-ring` |
| semantic | `--c-ok` `--c-ok-soft` `--c-bad` `--c-warn` `--c-warn-soft` `--c-info` `--c-neutral` `--c-neutral-soft` |
| content | `--c-code-bg` `--c-code-fg` `--c-mark` `--c-inverse-bg` `--c-inverse-fg` |
| categorical | `--c-cat-1` … `--c-cat-8` (calendar, level badges, tag colours) |
| elevation | `--shadow-pop` `--shadow-card` `--shadow-float` |
| shape | `--r-sm` `--r` `--r-lg` `--r-pill` |
| spacing | `--sp-1` 4px `--sp-2` 8px `--sp-3` 12px `--sp-4` 16px `--sp-5` 24px `--sp-6` 32px |
| layout | `--w-page` 1200px `--w-sidebar` 280px `--layout-gap` 24px `--layout-gutter` 15px |
| type | `--font-ui` `--font-display` `--font-code` |

`--c-inverse-*` is the “opposite of the page” pair (tooltips, mobile drawer): light
on dark in the light palette, dark on light in the dark palette. Use it for
anything sitting on `--c-inverse-bg` instead of hardcoding white.

`--c-accent-fg` is the text colour **on** an accent/semantic background. It flips
with the palette, which is why “white text on a coloured banner” must be written
as `var(--c-accent-fg)`.

## Colour maths

Compile-time `lighten()`, `darken()`, `rgba($var, …)`, `mix()` cannot work on CSS
custom properties, and they bake one theme's values into the CSS. Use the helpers
in `common/functions.inc.styl`:

| Instead of | Use | Result |
| --- | --- | --- |
| `lighten($x, 85%)` for a tinted background | `var(--c-accent-soft)` or `token-tint($x, 15%)` | colour mixed into `--c-surface` |
| `rgba($x, 0.4)` | `token-alpha($x, 40%)` | colour at 40% opacity |
| `mix($a, $b, 10%)` | `token-mix($a, $b, 10%)` | 10% of `$a` over `$b` |
| `lighten($text-1-color, 30%)` | `$text-3-color` | the token already exists |

They emit `color-mix()`, so the result follows the active palette and dark mode.

## Rules

1. No literal colours (`#rgb`, `rgb()`, `hsl()`) outside `theme/palettes/*.css`.
   `common/color.inc.styl` is exempt: it is a table of CSS colour *names*.
2. No `.theme--dark &` blocks in component files. If a value must change in dark
   mode, it is a token.
3. New visual constant (radius, shadow, spacing scale, colour) → add a token to
   the palette and use it, don’t inline it.
4. Run `yarn lint:tokens` (also part of `yarn lint:ci` and every `build:ui*`
   script). It fails on literal colours, literal `border-radius` values, on
   tokens used but not defined, and on tokens defined but unused.
5. Layout numbers (`max-width`, grid tracks, gutters) use the `--w-*` / `--layout-*`
   tokens, **not** `rem(...)`. The `rem()` helper divides by 15px while the
   document root is 16px, so `rem(1200px)` renders as 1280px — that mismatch is
   what previously made the catalog and the authoring shells wider than every
   other page.
6. Accent split: `--c-accent` is a **fill** colour (buttons, pills, marks);
   `--c-link` is the darker, text-safe clay for links and icon text. Clay on a
   card is only 2.9:1, so links must not use `--c-accent`.
7. One primary action per page or sidebar: `.button.primary` or
   `.menu__link--primary`. Everything else is secondary (outline) or a text link.

## Where a rule belongs

Three shared layout files sit on top of the page styles (`theme/default.js` loads
them last, in this order):

| File | Scope |
| --- | --- |
| `theme/claude-foundation.styl` | page shells shared by several pages: the problem catalog grid, learning-activity shells (`contest` / `homework` / `training`), footer rhythm |
| `theme/claude-navigation.styl` | the fixed desktop bar, its More/account dropdown panels and the mobile slideout |
| `theme/claude-authoring.styl` | authoring & administration shells (`problem_edit`, `manage_*`, files panes, the irreversible-action styling) |

Rules of thumb when adding UI:

1. **Component** (button, table, callout, pager…) → its own
   `components/<name>/<name>.page.styl`, using tokens only.
2. **One page** → `pages/<page>.page.styl` next to the page script.
3. **Shell shared by several pages** → one of the three files above; put it under a
   page-level class (`.problem-catalog`, `.authoring-workbench`, …), never on a bare
   element selector, or it silently restyles unrelated pages.
4. **Colour, radius, shadow, spacing that appears twice** → a token, not a value.

Colours also appear from JavaScript (Mantine calls, chart options, editor themes).
Those must pass `var(--c-*)` strings — `components/notification/index.ts` and
`pages/problem_statistics.page.ts` show the pattern. `yarn lint:tokens` only scans
`.styl`, so this is review discipline.

## Verifying a change

* Container check: `.row`, `.problem-catalog`, `.authoring-workbench`,
  `.administration-layout` and `.account-profile-layout` must all resolve to
  `--w-page` with a `--layout-gutter` inset and a `--w-sidebar` side column.
* `/theme-guide` renders every component and the full token list, in the active
  theme; switch the theme in the footer and reload to check dark.
* `yarn lint:tokens` for the automated part, then a page-level pass: catalog,
  problem detail, problem edit, a contest, the dashboard, and one admin page.

## Adding a palette

Three steps, no component edits:

1. Copy `theme/palettes/sepia.css` (the smallest example) to
   `theme/palettes/<name>.css` and redefine **every colour token** listed above
   under `:root.theme--<name>`. A missing token falls back to nothing and the UI
   loses that colour. Layout tokens (`--sp-*`, `--r-*`, `--w-*`, `--shadow-*`)
   stay inherited from `:root` unless the palette really needs different ones.
2. Add one entry to `theme/themes.ts`:

   ```ts
   { id: 'sepia', label: 'Sepia', dark: false, color: '#F4ECD9' }
   ```

   `label` goes through `_()`, so add the locale key too; `color` must match the
   palette's `--c-bg` (it becomes the browser toolbar colour).
3. `import './palettes/<name>.css'` in `theme/default.js`, next to the existing
   palette imports. The `theme` webpack cache group extracts it into
   `theme-<version>.css`, which the layout already links.

Then check `/set_theme/<name>` as a guest **and** signed in: the class must land on
`<html>`, the footer menu must list the new label, and `/theme-guide` should render
the whole token table in the new palette.

## Migrating upstream changes

When pulling `hydro-dev/Hydro`:

* `theme/dark.styl` will look modified upstream — it is deleted here on purpose.
  Ignore upstream edits to it.
* `.styl` files upstream that use `lighten/darken/rgba($var)` will not compile
  against the token layer. `yarn lint:tokens` plus `yarn build:ui` reports them;
  convert with the table above.
* `entry.js` sets `__webpack_public_path__` to `UiContext.cdn_prefix || '/'`. The
  fallback matters: with no CDN configured the prefix is empty, and an empty
  public path makes webpack resolve chunk URLs against the current document, which
  breaks every async chunk under a domain-prefixed URL such as `/system/`.
* `templates/layout/html5.html` carries the font fallback
  (`"<user font>", var(--font-ui)`); keep that shape when upstream changes the
  font block, or the user font setting will stop working.
