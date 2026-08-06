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

Both are in pixels. Discord reads the range once, when the sidebar mounts, so a
changed setting takes effect on the next reload rather than immediately.

## Does it need a theme?

No, and it does not need any extra CSS on stock Discord.

Discord drives the whole column from a single CSS variable,
`--custom-guild-sidebar-width`, which the drag handler writes to `document.body`.
The sidebar, the channel list and every channel and DM row all size off it, so
widening the clamp is enough on its own and everything else follows.

Themes that move the server column can be a different matter. Discord sizes the
channel list as
`calc(var(--custom-guild-sidebar-width) - var(--custom-guild-list-width))`,
assuming that column sits beside it. A theme that puts the column somewhere else
leaves the subtraction behind as a dead gap, and the gap grows as you drag wider.
That is the theme's to fix, not the plugin's.

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
limit, compares against 264 and 432 from a separate pair of literals. Left alone
it would look maxed out at 432 of a 900 range. That fix is deliberately its own
patch entry, so if Discord changes those numbers it fails on its own and
resizing itself keeps working.

## License

GPL-3.0-or-later
