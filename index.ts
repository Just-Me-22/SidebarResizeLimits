/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

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

export default definePlugin({
    name: "SidebarResizeLimits",
    description: "Lets the channel sidebar's drag handle travel further than Discord allows, in both directions",
    authors: [{ name: "heart_menace", id: 281162701303185408n }],
    settings,

    patches: [
        {
            find: /CHANNEL_SIDEBAR_RESIZED.{0,200}?minDimension:\d+,maxDimension:\d+/,
            replacement: {
                match: /minDimension:\d+,maxDimension:\d+/,
                replace: "minDimension:$self.min,maxDimension:$self.max"
            }
        },
        {
            find: /CHANNEL_SIDEBAR_RESIZED.{0,200}?minDimension:\d+,maxDimension:\d+/,
            replacement: [
                {
                    match: /(\i)<=264\?/,
                    replace: "$1<=$self.min?"
                },
                {
                    match: /(\i)>=432\?/,
                    replace: "$1>=$self.max?"
                }
            ]
        }
    ],

    get min() {
        return settings.store.minWidth;
    },

    get max() {
        return settings.store.maxWidth;
    }
});
