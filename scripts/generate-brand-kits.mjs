#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {mkdirSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

const require = createRequire(import.meta.url);
const {optimize} = require(process.env.SVGO_MODULE || "svgo");
const root = resolve(import.meta.dirname, "..");
const dark = "#061527";
const light = "#f6f9fc";
const blue = "#1479f6";
const cyan = "#27c9e8";
const green = "#42e89b";
const white = "#ffffff";

function outline(text, font, prefix) {
    const dir = mkdtempSync(join(tmpdir(), "too-many-watts-wordmark-"));
    const path = join(dir, "outline.svg");
    let svg;
    try {
        execFileSync("pango-view", [
            "--no-display", `--font=${font}`, `--text=${text}`, "--margin=0",
            "--background=transparent", `--output=${path}`
        ]);
        svg = readFileSync(path, "utf8");
    } finally {
        try { unlinkSync(path); } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
        rmdirSync(dir);
    }
    const match = svg.match(/<svg[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>/);
    if (!match) throw new Error(`Could not outline ${text}`);
    return {
        viewBox: match[1],
        content: match[2].replaceAll("glyph-0-", `${prefix}-glyph-`)
            .replace('fill="rgb(0%, 0%, 0%)"', 'fill="currentColor"')
    };
}

const word = outline("Too Many Watts", "Lato Heavy 100", "word");
const tagline = outline("TRAIN   PROGRESS   FURTHER", "Lato Medium 16", "tag");
const gradient = `<linearGradient id="too-many-watts-gradient" x1="0" y1="190" x2="300" y2="30" gradientUnits="userSpaceOnUse"><stop stop-color="${blue}"/><stop offset=".52" stop-color="${cyan}"/><stop offset="1" stop-color="${green}"/></linearGradient>`;
const shapes = {
    production: `<g id="a-and-rear-wheel">
      <path d="M8 192 119 35c14-20 32-19 43 2L58 192Z"/>
      <path d="m76 192 29-34c7-8 15-8 23 0l32 34Z"/>
      <path d="M137 102c29-1 48 17 48 43 0 12-5 24-14 33l-8-10c6-6 9-14 9-23 0-19-14-31-34-30Z"/>
    </g>
    <g id="rider">
      <circle cx="257" cy="27" r="22"/>
      <path d="M154 65c10-11 24-20 42-27 17-7 29-4 40 9l21 24c6 7 15 9 31 9-1 10-10 15-23 14-13-1-22-6-30-14l-17-16-26 13 34 22c11 7 13 17 6 29l-49 61c-4 5-10 3-8-3l29-64-45-25c-12-7-13-19-5-32Z"/>
    </g>
    <g id="front-wheel"><path d="M240 106a47 47 0 1 1-24 47l12-11a35 35 0 1 0 15-25Z"/></g>`,
    reference: `<g id="a-and-rear-wheel">
      <path d="M0 192 115 34c14-20 33-22 44 2L56 192Z"/>
      <path d="m67 192 29-34c7-9 14-13 22-4l36 38Z"/>
      <path d="M132 104c29-1 46 18 46 42 0 13-6 24-15 33l-7-8c7-7 11-16 11-25 0-19-14-32-35-32Z"/>
    </g>
    <g id="rider">
      <circle cx="256" cy="22" r="22"/>
      <path d="M147 66c10-13 29-23 45-30 17-7 27-4 37 8l23 27c7 8 15 10 34 10-2 9-11 13-25 12-12-1-22-5-30-13l-17-16-28 14 35 22c10 6 12 16 6 27l-50 61c-5 6-9 5-6-2l28-63-45-24c-12-6-16-16-7-33Z"/>
    </g>
    <g id="front-wheel"><path d="M237 106a47 47 0 1 1-26 49l10-10a36 36 0 1 0 19-28Z"/></g>`
};

function svg(width, height, viewBox, body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${viewBox}" role="img" aria-label="Too Many Watts"><defs>${gradient}</defs>${body}</svg>`;
}

function mark(kind, fill = "url(#too-many-watts-gradient)", transform = "") {
    return `<g id="too-many-watts-mark" fill="${fill}"${transform ? ` transform="${transform}"` : ""}>${shapes[kind]}</g>`;
}

function lettering(data, x, y, width, height, color, id) {
    return `<svg id="${id}" x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${data.viewBox}" style="color:${color}" overflow="visible">${data.content}</svg>`;
}

function icon(kind, background, scale = 2.45) {
    const x = (1024 - 320 * scale) / 2;
    const y = (1024 - 210 * scale) / 2;
    return svg(256, 256, "0 0 1024 1024",
        `${background ? `<path id="background" fill="${background}" d="M0 0h1024v1024H0z"/>` : ""}${mark(kind, "url(#too-many-watts-gradient)", `translate(${x} ${y}) scale(${scale})`)}`);
}

function favicon(kind) {
    if (kind === "reference") return icon(kind, dark, 2.7);
    return svg(256, 256, "0 0 1024 1024", `<path id="background" fill="${dark}" d="M0 0h1024v1024H0z"/>
      <g id="small-size-mark" transform="translate(48 207) scale(2.9)" fill="url(#too-many-watts-gradient)">
        <path d="M8 192 119 35c14-20 32-19 43 2L58 192Z"/>
        <path d="m76 192 29-34c7-8 15-8 23 0l32 34Z"/>
        <circle cx="257" cy="27" r="23"/>
        <path d="M154 65c10-11 24-20 42-27 17-7 29-4 40 9l21 24c6 7 15 9 31 9-1 10-10 15-23 14-13-1-22-6-30-14l-17-16-26 13 34 22c11 7 13 17 6 29l-49 61c-4 5-10 3-8-3l29-64-45-25c-12-7-13-19-5-32Z"/>
        <path d="M240 105a47 47 0 1 1-27 50l17-16a30 30 0 1 0 17-20Z"/>
      </g>`);
}

function foreground(kind) {
    // The mark stays inside Android's central 66dp safe circle on a 108dp canvas.
    return svg(256, 256, "0 0 1080 1080", mark(kind, "url(#too-many-watts-gradient)", "translate(270 363) scale(1.7)"));
}

function horizontal(kind, color, fill = "url(#too-many-watts-gradient)") {
    return svg(900, 260, "0 0 900 260",
        `${mark(kind, fill, "translate(12 22) scale(1.08)")}${lettering(word, 385, 49, 500, 170, color, "wordmark")}`);
}

function stacked(kind, color, fill = "url(#too-many-watts-gradient)") {
    return svg(500, 500, "0 0 500 500",
        `${mark(kind, fill, "translate(74 12) scale(1.1)")}${lettering(word, 35, 249, 430, 146, color, "wordmark")}${lettering(tagline, 70, 394, 360, 42, color, "tagline")}`);
}

function writeSvg(path, source) {
    mkdirSync(resolve(root, path, ".."), {recursive: true});
    const result = optimize(source, {
        multipass: true,
        plugins: [{name: "preset-default", params: {overrides: {
            cleanupIds: false, collapseGroups: false, convertShapeToPath: false
        }}}]
    });
    writeFileSync(resolve(root, path), `${result.data}\n`);
}

function image(input, output, size) {
    mkdirSync(resolve(root, output, ".."), {recursive: true});
    execFileSync("magick", ["-background", "none", "-density", "384",
        resolve(root, input), "-resize", `${size}x${size}!`,
        "-strip", resolve(root, output)]);
}

function resize(input, output, size, opaque = false) {
    mkdirSync(resolve(root, output, ".."), {recursive: true});
    const args = [resolve(root, input), "-filter", "Lanczos", "-resize", `${size}x${size}!`];
    if (opaque) args.push("-alpha", "off", "-type", "TrueColor", "-define", "png:color-type=2");
    execFileSync("magick", args.concat("-strip", resolve(root, output)));
}

function renderLogo(input, output, size) {
    execFileSync("magick", ["-background", "none", "-density", "384",
        resolve(root, input), "-resize", size, "-strip", resolve(root, output)]);
}

for (const kind of ["production", "reference"]) {
    const base = `brand-kit-${kind}`;
    const assets = {
        "icon.svg": svg(320, 210, "0 0 320 210", mark(kind)),
        "logo-horizontal.svg": horizontal(kind, dark),
        "logo-horizontal-dark.svg": horizontal(kind, white),
        "logo-stacked.svg": stacked(kind, dark),
        "logo-stacked-dark.svg": stacked(kind, white),
        "monochrome.svg": svg(320, 210, "0 0 320 210", mark(kind, dark)),
        "white.svg": svg(320, 210, "0 0 320 210", mark(kind, white)),
        "logo-horizontal-white.svg": horizontal(kind, white, white),
        "logo-stacked-white.svg": stacked(kind, white, white),
        "icon-dark.svg": icon(kind, dark),
        "icon-light.svg": icon(kind, light),
        "favicon.svg": favicon(kind),
        "social-avatar.svg": icon(kind, dark, 2.15),
        "adaptive-foreground.svg": foreground(kind),
        "adaptive-background.svg": svg(256, 256, "0 0 108 108", `<path id="background" fill="${dark}" d="M0 0h108v108H0z"/>`)
    };
    for (const [name, content] of Object.entries(assets)) writeSvg(`${base}/svg/${name}`, content);
    const master = `${base}/png/icon-1024.png`;
    image(`${base}/svg/icon-dark.svg`, master, 1024);
    for (const size of [64, 128, 256, 512]) resize(master, `${base}/png/icon-${size}.png`, size);
    image(`${base}/svg/icon-light.svg`, `${base}/png/icon-light-1024.png`, 1024);
    for (const name of ["logo-horizontal", "logo-horizontal-dark", "logo-horizontal-white"]) {
        renderLogo(`${base}/svg/${name}.svg`, `${base}/png/${name}.png`, "1800x520");
    }
    for (const name of ["logo-stacked", "logo-stacked-dark", "logo-stacked-white"]) {
        renderLogo(`${base}/svg/${name}.svg`, `${base}/png/${name}.png`, "1024x1024");
    }
    for (const name of ["icon", "monochrome", "white"]) {
        renderLogo(`${base}/svg/${name}.svg`, `${base}/png/${name}.png`, "1024x1024");
    }
    image(`${base}/svg/favicon.svg`, `${base}/favicon/favicon-master.png`, 512);
    for (const size of [16, 24, 32, 48, 64]) resize(`${base}/favicon/favicon-master.png`, `${base}/favicon/favicon-${size}.png`, size);
    execFileSync("magick", [16, 32, 48].map(size => resolve(root, `${base}/favicon/favicon-${size}.png`))
        .concat(resolve(root, `${base}/favicon/favicon.ico`)));

    const ios = [
        ["iphone-notification-20@2x", 40, "iphone", "20x20", "2x"], ["iphone-notification-20@3x", 60, "iphone", "20x20", "3x"],
        ["iphone-settings-29@2x", 58, "iphone", "29x29", "2x"], ["iphone-settings-29@3x", 87, "iphone", "29x29", "3x"],
        ["iphone-spotlight-40@2x", 80, "iphone", "40x40", "2x"], ["iphone-spotlight-40@3x", 120, "iphone", "40x40", "3x"],
        ["iphone-app-60@2x", 120, "iphone", "60x60", "2x"], ["iphone-app-60@3x", 180, "iphone", "60x60", "3x"],
        ["ipad-notification-20@1x", 20, "ipad", "20x20", "1x"], ["ipad-notification-20@2x", 40, "ipad", "20x20", "2x"],
        ["ipad-settings-29@1x", 29, "ipad", "29x29", "1x"], ["ipad-settings-29@2x", 58, "ipad", "29x29", "2x"],
        ["ipad-spotlight-40@1x", 40, "ipad", "40x40", "1x"], ["ipad-spotlight-40@2x", 80, "ipad", "40x40", "2x"],
        ["ipad-app-76@1x", 76, "ipad", "76x76", "1x"], ["ipad-app-76@2x", 152, "ipad", "76x76", "2x"],
        ["ipad-pro-app-83.5@2x", 167, "ipad", "83.5x83.5", "2x"], ["app-store-1024", 1024, "ios-marketing", "1024x1024", "1x"]
    ];
    for (const [name, size] of ios) resize(master, `${base}/ios/${name}.png`, size, true);
    writeFileSync(resolve(root, `${base}/ios/Contents.json`), `${JSON.stringify({
        images: ios.map(([name, , idiom, size, scale]) => ({filename: `${name}.png`, idiom, size, scale})),
        info: {author: "xcode", version: 1}
    }, null, 2)}\n`);

    const adaptiveMaster = `${base}/android/adaptive-foreground-1024.png`;
    image(`${base}/svg/adaptive-foreground.svg`, adaptiveMaster, 1024);
    image(`${base}/svg/adaptive-background.svg`, `${base}/android/adaptive-background-1024.png`, 1024);
    resize(master, `${base}/android/play-store-512.png`, 512, true);
    for (const [density, launcher, adaptive] of [
        ["mdpi", 48, 108], ["hdpi", 72, 162], ["xhdpi", 96, 216],
        ["xxhdpi", 144, 324], ["xxxhdpi", 192, 432]
    ]) {
        const dir = `${base}/android/mipmap-${density}`;
        resize(master, `${dir}/ic_launcher.png`, launcher);
        resize(adaptiveMaster, `${dir}/ic_launcher_foreground.png`, adaptive);
        resize(`${base}/android/adaptive-background-1024.png`, `${dir}/ic_launcher_background.png`, adaptive);
    }
    const anydpi = resolve(root, `${base}/android/mipmap-anydpi-v26`);
    mkdirSync(anydpi, {recursive: true});
    writeFileSync(join(anydpi, "ic_launcher.xml"), `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>\n`);
    if (kind === "production") {
        const socialMaster = `${base}/social/avatar-master.png`;
        image(`${base}/svg/social-avatar.svg`, socialMaster, 1024);
        for (const [name, size] of [["linkedin", 400], ["github", 500], ["x-twitter", 400], ["discord", 512]]) {
            resize(socialMaster, `${base}/social/${name}-${size}.png`, size);
        }
    }
    console.log(`Generated ${base}`);
}
