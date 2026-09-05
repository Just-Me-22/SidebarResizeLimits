/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

const HANDLE = '[class*="sidebarResizeHandle"]';
const SIDEBAR = '[class*="sidebar_"]';
const LIST = '[class*="sidebarList"]';
const WIDTH_VAR = "--vc-sidebar-width";

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

/** left edge of the channel list, so a pointer x becomes a width whether the list is
 *  sized by a grid track or by a flex basis a theme put on it */
function listLeft(): number {
    const list = document.querySelector(LIST);
    return list ? list.getBoundingClientRect().left : 0;
}

/** the width every consumer reads, including themes that lay the sidebar out themselves */
function publishWidth(px: number) {
    document.documentElement.style.setProperty(WIDTH_VAR, `${Math.round(px)}px`);
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
 * clamp as plain css (min-width/max-width/flex-basis), so it has to be released too,
 * and sized from the variable so the list follows the drag under a flex parent.
 */
function ensureStretch() {
    if (document.getElementById(STRETCH_ID)) return;
    const el = document.createElement("style");
    el.id = STRETCH_ID;
    el.textContent =
        `${LIST}{min-width:0!important;max-width:none!important;` +
        `width:var(${WIDTH_VAR},auto)!important;flex:0 0 var(${WIDTH_VAR},auto)!important;}` +
        // each row caps itself at discord's old maximum as well
        `${LIST} li{max-width:none!important;}` +
        // the banner keeps the width discord laid it out at, so it stops short of a widened sidebar
        `${LIST} [class*="banner" i]{width:100%!important;}`;
    document.documentElement.appendChild(el);
}

function clearStretch() {
    document.getElementById(STRETCH_ID)?.remove();
}

let keepAlive: number | undefined;
let guard: ResizeObserver | undefined;
let watched: HTMLElement | undefined;

/**
 * Discord re-lays the sidebar out for reasons that have nothing to do with the drag -
 * clicking into the message box is one of them - and that puts the width back to its
 * own default. The drag result is still in settings, so it is enough to notice and
 * re-apply. A poll is too slow: the snap back is visible for however long the tick
 * takes, which reads as the sidebar jumping about. A ResizeObserver corrects it inside
 * the same frame, so nothing is seen.
 */
function reapply() {
    const want = settings.store.width;
    if (!want) return;
    const list = document.querySelector(LIST) as HTMLElement | null;
    if (!list) return;
    if (Math.abs(list.getBoundingClientRect().width - want) < 2) return;
    publishWidth(want);
    ensureStretch();
    const grid = findGrid();
    if (grid) applyTrack(grid, want);
}

/** react swaps the list node out, so the observer has to follow it */
function watchList() {
    const list = document.querySelector(LIST) as HTMLElement | null;
    if (!list || list === watched) return;
    guard?.disconnect();
    guard = new ResizeObserver(reapply);
    guard.observe(list);
    watched = list;
}

function startKeepAlive() {
    watchList();
    keepAlive = window.setInterval(watchList, 2000);
}

function stopKeepAlive() {
    window.clearInterval(keepAlive);
    keepAlive = undefined;
    guard?.disconnect();
    guard = undefined;
    watched = undefined;
}

export default definePlugin({
    name: "SidebarResizeLimits",
    description: "Lets the channel sidebar's drag handle travel further than Discord allows, in both directions",
    authors: [{ name: "heart_menace", id: 281162701303185408n }],
    settings,

    start() {
        const saved = settings.store.width;
        if (Number.isFinite(saved) && saved > 0) {
            publishWidth(saved);
            ensureStretch();
            // the sidebar may not be mounted yet on a cold start
            let tries = 0;
            const reapply = setInterval(() => {
                const grid = findGrid();
                if (grid) { applyTrack(grid, saved); clearInterval(reapply); }
                if (++tries > 40) clearInterval(reapply);
            }, 250);
        }

        startKeepAlive();

        onPointerDown = (e: PointerEvent) => {
            if (e.button !== 0) return;

            const target = e.target as Element | null;
            if (!target || typeof target.closest !== "function") return;

            const handle = target.closest(HANDLE) as HTMLElement | null;
            if (!handle) return;

            const left = listLeft();
            if (!left) return;

            // discord clamps its own drag to 264..432, so take the gesture over entirely
            e.preventDefault();
            e.stopImmediatePropagation();

            ensureStretch();
            const grid = findGrid();
            let latest = settings.store.width || 0;

            const move = (ev: PointerEvent) => {
                const { minWidth, maxWidth } = settings.store;
                latest = Math.min(Math.max(ev.clientX - left, minWidth), maxWidth);
                publishWidth(latest);
                if (grid) applyTrack(grid, latest);
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
        stopKeepAlive();
        if (onPointerDown) document.removeEventListener("pointerdown", onPointerDown, true);
        onPointerDown = null;
        clearTrack(findGrid());
        clearStretch();
        document.documentElement.style.removeProperty(WIDTH_VAR);
    }
});
