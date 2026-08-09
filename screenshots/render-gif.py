#!/usr/bin/env python3
"""Record the full-panel demo animation as a GIF.

The demo runs the full story: panel fade-in (list view) -> open the New
event form -> type a 24-hour start/end time -> save -> the new event shows
in list and day view -> switch to week view -> sync spinner.

We capture one frame every FRAME_MS and compose them into a GIF at FRAME_MS
per frame with ffmpeg.
"""
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "fixtures"
OUT = ROOT
FRAMES_DIR = OUT / ".gif-frames"

FRAME_MS = 125      # playback frame duration (~8fps)
CAPTURE_MS = 125    # capture interval
DURATION_MS = 10000 # total animation window
VIEW_W, VIEW_H = 900, 640


def main():
    FRAMES_DIR.mkdir(exist_ok=True)
    n = DURATION_MS // CAPTURE_MS
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(device_scale_factor=2, viewport={"width": VIEW_W, "height": VIEW_H})
        page.goto((FIXTURES / "demo-anim.html").as_uri())
        page.wait_for_load_state("networkidle")

        for i in range(n):
            page.screenshot(path=str(FRAMES_DIR / f"f{i:03d}.png"), clip={"x": 0, "y": 0, "width": VIEW_W, "height": VIEW_H})
            page.wait_for_timeout(CAPTURE_MS)

        browser.close()

    # Verify all frames captured.
    pngs = sorted(FRAMES_DIR.glob("f*.png"))
    print(f"captured {len(pngs)} frames")
    assert len(pngs) == n, f"expected {n} frames, got {len(pngs)}"

    # Compose the GIF with ffmpeg (reliable frame count + duration).
    fps = 1000 / FRAME_MS  # frames per second
    palette = FRAMES_DIR / "palette.png"
    subprocess.run(
        ["ffmpeg", "-y", "-framerate", str(fps), "-i", str(FRAMES_DIR / "f%03d.png"),
         "-vf", "fps=%d,scale=%d:%d:flags=lanczos,palettegen" % (fps, VIEW_W, VIEW_H), str(palette)],
        check=True, capture_output=True,
    )
    subprocess.run(
        ["ffmpeg", "-y", "-framerate", str(fps), "-i", str(FRAMES_DIR / "f%03d.png"),
         "-i", str(palette), "-lavfi", "fps=%d,scale=%d:%d:flags=lanczos[x];[x][1:v]paletteuse" % (fps, VIEW_W, VIEW_H),
         str(OUT / "ogenda-demo.gif")],
        check=True, capture_output=True,
    )
    print(f"ogenda-demo.gif written")
    return 0


if __name__ == "__main__":
    sys.exit(main())



if __name__ == "__main__":
    sys.exit(main())
