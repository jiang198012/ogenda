#!/usr/bin/env python3
"""Render the Chinese-UI fixture HTML files into PNG screenshots with Playwright.

Desktop shots: 900px viewport @ 2x scale (1800px wide), full-page height.
Mobile shots:  375px viewport @ 2x scale (750px wide), iPhone-height.
A mobile strip is also composited: the given mobile views side by side.
"""
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "fixtures"
OUT = ROOT

DESKTOP = {"list", "day", "week", "month", "stats", "settings"}
MOBILE = {"day", "week", "month"}
MOBILE_STRIP = ["day", "week", "month"]  # the three mobile views shown in the README strip
MOBILE_WIDTH, MOBILE_HEIGHT = 375, 812  # iPhone-style screen ratio, one screen tall
STRIP_GAP = 20


def render(page, html_path: Path, png_path: Path, viewport_w: int, height: int, full_page: bool):
    page.set_viewport_size({"width": viewport_w, "height": height})
    page.goto(html_path.as_uri())
    page.wait_for_load_state("networkidle")
    if full_page:
        page.screenshot(path=str(png_path), full_page=True)
    else:
        page.screenshot(path=str(png_path), clip={"x": 0, "y": 0, "width": viewport_w, "height": height})


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(device_scale_factor=2)

        mobile_pngs = []
        for name in MOBILE:
            html = FIXTURES / f"{name}-mobile.html"
            if not html.exists():
                continue
            png = OUT / f"mobile-{name}.png"
            render(page, html, png, MOBILE_WIDTH, MOBILE_HEIGHT, full_page=False)
            print(f"rendered {png.name}")
            if name in MOBILE_STRIP:
                mobile_pngs.append(png)

        for name in DESKTOP:
            html = FIXTURES / f"{name}.html"
            png = OUT / f"{name}-view.png"
            render(page, html, png, 900, 812, full_page=True)
            print(f"rendered {png.name}")

        # Composite the mobile strip: three phones side by side on a light background.
        if len(mobile_pngs) == 3:
            imgs = [Image.open(p).convert("RGB") for p in mobile_pngs]
            h = max(im.size[1] for im in imgs)
            w = sum(im.size[0] for im in imgs) + STRIP_GAP * (len(imgs) - 1)
            canvas = Image.new("RGB", (w, h), (245, 245, 245))
            x = 0
            for im in imgs:
                canvas.paste(im, (x, 0))
                x += im.size[0] + STRIP_GAP
            strip = OUT / "mobile-strip.png"
            canvas.save(strip)
            print(f"composited {strip.name} ({w}x{h})")

        browser.close()


if __name__ == "__main__":
    sys.exit(main())
