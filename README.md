# SidebarResizeLimits

An [Equicord](https://github.com/Equicord/Equicord) userplugin that lets the
channel sidebar's drag handle travel further than Discord allows, in both
directions.

Discord already gives the sidebar a real drag handle, it just clamps it between
264px and 432px. This turns those two numbers into settings, so you can pull the
sidebar in to a narrow strip or out to something much wider.

## Settings

| Setting | Default | Discord's own value |
|---|---|---|
| Minimum width | 150 | 264 |
| Maximum width | 900 | 432 |
| Width | 0 | - |

All three are in pixels. Width is written by dragging the handle and is what gets
restored on the next start; leave it at 0 to let Discord manage the width itself.

On builds where the patches still apply, Discord reads the range once when the
sidebar mounts, so a changed minimum or maximum takes effect on the next reload
rather than immediately.

## Requirements

Equicord installed **from source**. Userplugins are compiled into the bundle, so
this will not work on the installer's prebuilt build. See
[Equicord's installation guide](https://github.com/Equicord/Equicord).

## Install

Clone into your Equicord checkout's userplugins folder:

```bash
cd Equicord/src/userplugins
git clone https://github.com/Just-Me-22/SidebarResizeLimits sidebarResizeLimits
cd ../..
pnpm build
```

Restart or reload Discord (Ctrl+R), then enable **SidebarResizeLimits** in
Equicord's plugin settings and reload once more. Patches are applied at startup,
so enabling alone does nothing until the next reload.

## How it works

The range is a pair of literals passed to Discord's resize hook:

```js
{minDimension:264,maxDimension:432,resizableDomNodeRef:d,onElementResize:c,...}
```

The plugin rewrites those two values to read from its settings, through getters
so that changing a setting needs only a reload and not a rebuild.

The `find` is a regular expression rather than the obvious
`"CHANNEL_SIDEBAR_RESIZED"` string, because that string appears in two modules
and the second one would report a patch that had no effect. Anchoring on the
dimension pair that follows makes it unique, and `\d+` in place of the literals
keeps it matching if Discord changes its own defaults.

The overdrag styling, which decides when the sidebar looks like it has hit the
limit, clamps against the same two numbers in a separate expression:

```js
let n=Math.min(Math.max(t,264),432)
```

Left alone it would look maxed out at 432 of a 900 range. That fix is
deliberately its own patch entry, so if Discord changes the shape it fails on its
own and resizing itself keeps working. It used to read `t<=264?` / `t>=432?`;
Discord rewrote it into the `Math.min`/`Math.max` form, which broke the old
match and is exactly the failure this split is meant to contain.

## Canary: the patches cannot land

On current Canary the patches above are never applied, and no regex will fix
that. The module holding the resize code is bundled into a single ~1MB factory
that Discord requires before Vencord's webpack hook is installed, so the patcher
never sees it. Confirmed by reading the factory's own symbols: it carries neither
`WebpackPatcher.patchedBy` nor `WebpackPatcher.patchedSource`, while its source
still contains the untouched `minDimension:264,maxDimension:432`.

So on Canary the plugin takes the drag gesture over instead. It intercepts
`pointerdown` on the handle, cancels Discord's own handler, and writes the width
into the grid track between `[sidebarEnd]` and `[channelsEnd]` on whichever
ancestor actually defines the columns. If that grid is not found the plugin does
nothing and leaves Discord's drag alone, which is what keeps the patched path
working on stable.

Discord repeats the same 432 limit in three further places, each of which
silently caps the one above it, so releasing the track alone is not enough:

- the grid track itself
- `sidebarList_`, via `min-width` / `max-width` / `flex-basis`
- every row `li`, via `max-width`

Because of that this plugin **now ships a small stylesheet**, which earlier
versions deliberately did not. It is two rules, injected only while the plugin is
running and removed on stop:

```css
[class*="sidebarList"]{min-width:0;max-width:none;width:auto;flex:1 1 auto;}
[class*="sidebarList"] li{max-width:none;}
```

`privateChannels_` and `sidebar_ > container_` are *not* constrained and need no
rule; they already stretch on their own.

## License

GPL-3.0-or-later
