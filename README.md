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

The minimum and maximum are read at the moment you drag, so changing either one
takes effect straight away.

## Holding the width

Discord re-lays the sidebar out for reasons unrelated to the drag - clicking into the
message box is one - and that puts the width back to its own default. The drag result
is still stored, so the plugin watches the sidebar and re-applies your width the moment
it drifts. It uses a ResizeObserver rather than a timer: a poll corrects it too, but not
before the wrong width has been on screen for a tick, which reads as the sidebar jumping
about. Leaving Width at 0 disables the watch along with everything else.

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
Equicord's plugin settings.

## How it works

The plugin takes the drag gesture over rather than patching Discord's own.

The obvious approach is a webpack patch on the range Discord passes to its resize
hook, `{minDimension:264,maxDimension:432,...}`. That works on stable and does
not work on Canary, where the module holding the resize code is bundled into a
single ~1MB factory that Discord requires before Vencord's webpack hook is
installed, so the patcher never sees it. Confirmed by reading the factory's own
symbols: it carries neither `WebpackPatcher.patchedBy` nor
`WebpackPatcher.patchedSource`, while its source still contains the untouched
`minDimension:264,maxDimension:432`. Those patches were shipped for a while and
have been removed, because the gesture takeover cancels Discord's handler outright
and the patched values were never read on either build.

The takeover intercepts `pointerdown` on the handle, cancels Discord's own
handler, and writes the width in two places: the CSS variable
`--vc-sidebar-width` on `<html>`, and the grid track between `[sidebarEnd]` and
`[channelsEnd]` on whichever ancestor actually defines the columns. The track
write is skipped when no such grid is found.

The pointer position is turned into a width by subtracting the channel list's own
`getBoundingClientRect().left`, measured once when the drag starts. An earlier
version added up the pixel values in the grid template ahead of `[sidebarEnd]`
instead; that only worked while the grid was the thing doing the placing.

Discord repeats the same 432 limit in three further places, each of which
silently caps the one above it, so releasing the track alone is not enough:

- the grid track itself
- `sidebarList_`, via `min-width` / `max-width` / `flex-basis`
- every row `li`, via `max-width`

Because of that this plugin **now ships a small stylesheet**, which earlier
versions deliberately did not. It is three rules, injected only while the plugin
is running and removed on stop:

```css
[class*="sidebarList"]{min-width:0;max-width:none;
  width:var(--vc-sidebar-width,auto);flex:0 0 var(--vc-sidebar-width,auto);}
[class*="sidebarList"] li{max-width:none;}
[class*="sidebarList"] [class*="banner" i]{width:100%;}
```

The third one is for the guild banner, which keeps whatever width Discord laid it
out at and otherwise stops short of a widened sidebar.

`privateChannels_` and `sidebar_ > container_` are *not* constrained and need no
rule; they already stretch on their own.

## For theme authors

The current width is always readable as `--vc-sidebar-width` on the root element,
and is set on start as well as during a drag, so it is there before the user
touches the handle.

If your theme lays the sidebar out itself, size the channel list from that
variable rather than from a literal:

```css
[class*="sidebar__"] > [class*="sidebarList__"] {
  flex: 0 0 var(--vc-sidebar-width, 360px) !important;
}
```

Without it the drag has no visible effect. A theme rule only needs one more class
in the selector than the plugin's own `[class*="sidebarList"]` to win the cascade,
`!important` on both sides included, and it will then hold the list at its literal
width no matter what the handle does.

## License

GPL-3.0-or-later
