"""Generate the Moyue Windows icon without changing the established logo.

Small Windows shell frames are drawn on their native pixel grids so the book,
ink M and red bookmark remain legible. Larger frames retain the original
high-detail brand artwork.
"""

from __future__ import annotations

import io
import struct
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "assets" / "brand" / "moyue-app-icon-master.png"
FRAME_DIR = ROOT / "assets" / "brand" / "icons"
ICO_PATH = ROOT / "src-tauri" / "icons" / "moyue" / "icon-brand-crisp.ico"
SIZES = (16, 20, 24, 32, 40, 44, 48, 64, 72, 96, 128, 256)


def point(size: int, x: float, y: float) -> tuple[int, int]:
    return round(x * size / 32), round(y * size / 32)


def small_frame(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Dark book cover, cream open pages and the central page crease.
    draw.polygon(
        [point(size, 1, 7), point(size, 15, 9), point(size, 16, 11),
         point(size, 17, 9), point(size, 31, 7), point(size, 30, 27),
         point(size, 18, 29), point(size, 16, 31), point(size, 14, 29),
         point(size, 2, 27)],
        fill=(42, 40, 39, 255),
    )
    draw.polygon(
        [point(size, 2, 4), point(size, 15, 7), point(size, 16, 9),
         point(size, 16, 27), point(size, 14, 25), point(size, 2, 23)],
        fill=(255, 247, 231, 255),
    )
    draw.polygon(
        [point(size, 30, 4), point(size, 17, 7), point(size, 16, 9),
         point(size, 16, 27), point(size, 18, 25), point(size, 30, 23)],
        fill=(255, 247, 231, 255),
    )
    crease_width = max(1, round(size / 32))
    draw.line([point(size, 16, 8), point(size, 16, 27)], fill=(218, 112, 75, 255), width=crease_width)

    # Pixel-aligned ink M. Its silhouette matches the original brush gesture,
    # while deliberately omitting texture that turns into grey noise at 24 px.
    m_width = max(2, round(size * 3.2 / 32))
    draw.line(
        [point(size, 6, 21), point(size, 10, 12), point(size, 16, 21),
         point(size, 22, 12), point(size, 27, 21)],
        fill=(42, 40, 39, 255),
        width=m_width,
        joint="curve",
    )

    # The established vermilion bookmark remains the only accent.
    draw.polygon(
        [point(size, 24, 3), point(size, 28, 3), point(size, 28, 14),
         point(size, 26, 12), point(size, 24, 14)],
        fill=(220, 83, 48, 255),
    )
    return image


def build_frames() -> list[tuple[int, bytes]]:
    master = Image.open(MASTER).convert("RGBA")
    FRAME_DIR.mkdir(parents=True, exist_ok=True)
    frames: list[tuple[int, bytes]] = []
    for size in SIZES:
        frame = small_frame(size) if size <= 48 else master.resize((size, size), Image.Resampling.LANCZOS)
        frame_path = FRAME_DIR / f"moyue-brand-crisp-{size}.png"
        frame.save(frame_path, format="PNG", optimize=True)
        buffer = io.BytesIO()
        frame.save(buffer, format="PNG", optimize=True)
        frames.append((size, buffer.getvalue()))
    return frames


def write_ico(frames: list[tuple[int, bytes]]) -> None:
    ICO_PATH.parent.mkdir(parents=True, exist_ok=True)
    header = struct.pack("<HHH", 0, 1, len(frames))
    offset = 6 + 16 * len(frames)
    directory = bytearray()
    payload = bytearray()
    for size, data in frames:
        width = 0 if size == 256 else size
        height = 0 if size == 256 else size
        directory.extend(struct.pack("<BBBBHHII", width, height, 0, 0, 1, 32, len(data), offset))
        payload.extend(data)
        offset += len(data)
    ICO_PATH.write_bytes(header + directory + payload)


if __name__ == "__main__":
    write_ico(build_frames())
    print(ICO_PATH)
