/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

const HANDLE = '[class*="sidebarResizeHandle"]';
const SIDEBAR = '[class*="sidebar_"]';

const settings = definePluginSettings({
    minWidth: {
        type: OptionType.NUMBER,
        description: "Narrowest the channel sidebar can be dragged, in pixels (Discord's own limit is 264)",
        default: 150,
        isValid(value: number) {
            if (!Number.isFinite(value) || value < 0) return "Must be a positive number";
            if (value >= this.store.maxWidth) return "Must be smaller than the maximum width";
            return true;
        }
    },
    width: {
        type: OptionType.NUMBER,
        description: "Current sidebar width in pixels. Set by dragging the handle; you can also type an exact value here. 0 leaves Discord's own width alone",
        default: 0,
        isValid(value: number) {
            if (!Number.isFinite(value) || value < 0) return "Must be a positive number";
            return true;
        }
    },
    maxWidth: {
        type: OptionType.NUMBER,
        description: "Widest the channel sidebar can be dragged, in pixels (Discord's own limit is 432)",
        default: 900,
        isValid(value: number) {
            if (!Number.isFinite(value) || value < 0) return "Must be a positive number";
            if (value <= this.store.minWidth) return "Must be larger than the minimum width";
            return true;
        }
    }
});

let onPointerDown: ((e: PointerEvent) => void) | null = null;

/**
 * The sidebar is a grid item spanning named tracks, so its own width is ignored -
 * the channel list is the track between [sidebarEnd] and [channelsEnd]. Find the
 * ancestor that actually defines the columns (the ones below it are subgrid).
 */
function findGrid(): HTMLElement | null {
    const bar = document.querySelector(HANDLE)?.closest(SIDEBAR) as HTMLElement | null;
    for (let n = bar?.parentElement; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (!cs.display.includes("grid")) continue;
        if (cs.gridTemplateColumns.includes("subgrid")) continue;
        if (cs.gridTemplateColumns.includes("[sidebarEnd]")) return n;
    }
    return null;
}

/** width of everything left of the channel list, so a pointer x can become a track width */
function railsWidth(cols: string): number {
    const head = cols.slice(0, cols.indexOf("[sidebarEnd]"));
    return (head.match(/[\d.]+px/g) ?? []).reduce((a, b) => a + parseFloat(b), 0);
}

function applyTrack(grid: HTMLElement, px: number) {
    const cols = grid.style.getPropertyValue("grid-template-columns") || getComputedStyle(grid).gridTemplateColumns;
    const next = cols
        .replace(/(\[sidebarEnd\]\s*)[\d.]+px/, `$1${Math.round(px)}px`)
        .replace(/(\[channelsEnd\]\s*)[\d.]+px/, "$1minmax(0, 1fr)");
    grid.style.setProperty("grid-template-columns", next, "important");
}

function clearTrack(grid: HTMLElement | null) {
    grid?.style.removeProperty("grid-template-columns");
}

const STRETCH_ID = "sidebar-resize-limits-stretch";

/**
 * Widening the track alone leaves dead space. sidebarList_ carries discord's 264/432
 * clamp as plain css (min-width/max-width/flex-basis), so it has to be released too.
 */
function ensureStretch() {
    if (document.getElementById(STRETCH_ID)) return;
    const el = document.createElement("style");
    el.id = STRETCH_ID;
    el.textContent =
        '[class*="sidebarList"]{min-width:0!important;max-width:none!important;' +
        "width:auto!important;flex:1 1 auto!important;}" +
        // each row caps itself at discord's old maximum as well
        '[class*="sidebarList"] li{max-width:none!important;}';
    document.documentElement.appendChild(el);
}

function clearStretch() {
    document.getElementById(STRETCH_ID)?.remove();
}

export default definePlugin({
    name: "SidebarResizeLimits",
    description: "Lets the channel sidebar's drag handle travel further than Discord allows, in both directions",
    authors: [{ name: "heart_menace", id: 281162701303185408n }],
    settings,

    // stable still lets these land; canary bundles the module too early to patch, which is what
    // the grid takeover below is for. findGrid() returning null leaves discord's drag alone.
    patches: [
        {
            find: /CHANNEL_SIDEBAR_RESIZED.{0,200}?minDimension:\d+,maxDimension:\d+/,
            replacement: {
                match: /minDimension:\d+,maxDimension:\d+/,
                replace: "minDimension:$self.min,maxDimension:$self.max"
            }
        },
        {
            find: /CHANNEL_SIDEBAR_RESIZED.{0,800}?Math\.min\(Math\.max\(/,
            replacement: {
                match: /Math\.min\(Math\.max\((\i),\d+\),\d+\)/,
                replace: "Math.min(Math.max($1,$self.min),$self.max)"
            }
        }
    ],

    get min() {
        return settings.store.minWidth;
    },

    get max() {
        return settings.store.maxWidth;
    },

    start() {
        const saved = settings.store.width;
        if (Number.isFinite(saved) && saved > 0) {
            // the sidebar may not be mounted yet on a cold start
            let tries = 0;
            const reapply = setInterval(() => {
                const grid = findGrid();
                if (grid) { ensureStretch(); applyTrack(grid, saved); clearInterval(reapply); }
                if (++tries > 40) clearInterval(reapply);
            }, 250);
        }

        onPointerDown = (e: PointerEvent) => {
            if (e.button !== 0) return;

            const target = e.target as Element | null;
            if (!target || typeof target.closest !== "function") return;

            const handle = target.closest(HANDLE) as HTMLElement | null;
            if (!handle) return;

            const grid = findGrid();
            if (!grid) return;

            // discord clamps its own drag to 264..432, so take the gesture over entirely
            e.preventDefault();
            e.stopImmediatePropagation();

            ensureStretch();
            const rails = railsWidth(getComputedStyle(grid).gridTemplateColumns);
            let latest = settings.store.width || 0;

            const move = (ev: PointerEvent) => {
                const { minWidth, maxWidth } = settings.store;
                latest = Math.min(Math.max(ev.clientX - rails, minWidth), maxWidth);
                applyTrack(grid, latest);
            };

            const up = () => {
                document.removeEventListener("pointermove", move, true);
                document.removeEventListener("pointerup", up, true);
                settings.store.width = Math.round(latest);
            };

            document.addEventListener("pointermove", move, true);
            document.addEventListener("pointerup", up, true);
        };

        document.addEventListener("pointerdown", onPointerDown, true);
    },

    stop() {
        if (onPointerDown) document.removeEventListener("pointerdown", onPointerDown, true);
        onPointerDown = null;
        clearTrack(findGrid());
        clearStretch();
    }
});
