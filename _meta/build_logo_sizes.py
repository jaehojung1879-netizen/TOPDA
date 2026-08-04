#!/usr/bin/env python3
"""원본 로고 한 장 → 실제로 쓰이는 크기의 파생본 생성.

■ 왜 필요한가 (2026-08-02)

`site/assets/images/brand/logo.png` 는 773×826 · 688KB 원본인데, 헤더 브랜드 마크는
CSS 상 **26×26** 이고 파비콘은 16~32px 다. 즉 모든 페이지가 26px 자리에 688KB 를
내려받고 있었다. 실측(Chromium, 로컬 서버)에서 이 파일 하나가 계산기 3개 화면 모두에서
가장 느린 리소스였다 — 142~211ms 로 2위(app.js 333KB)의 6~9배다. 로컬이 이 정도면
모바일 4G 에서는 초 단위가 된다.

원본을 지우지는 않는다. OG 카드·앱 아이콘처럼 큰 그림이 필요한 자리가 있고, 새 로고를
올릴 때의 입력이기도 하다(브랜드 README 참고). 대신 화면에서 참조하는 곳은 파생본을
보게 바꾼다.

■ 생성물

    logo-32.png    파비콘(16·32 겸용)
    logo-96.png    헤더 브랜드 마크 — 28px @3x 까지 커버
    logo-192.png   apple-touch-icon · PWA 아이콘

RGBA 를 유지해야 투명 배경이 살아 있으므로 팔레트 양자화는 알파를 보존하는
`quantize(method=FASTOCTREE)` 로만 한다. 그래도 원본 대비 100분의 1 이하가 된다.

    python3 _meta/build_logo_sizes.py          # 생성
    python3 _meta/build_logo_sizes.py --check  # 최신인지 검사 (CI)
"""
import argparse
import io
import os
import sys

from PIL import Image

BRAND_DIR = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "site", "assets", "images", "brand"))
SRC = os.path.join(BRAND_DIR, "logo.png")

# (파일명, 한 변 픽셀). 정사각으로 맞추지 않고 긴 변 기준으로 줄인다 — 헤더는
# background-size: contain 이라 원본 비율을 그대로 두는 편이 안전하다.
SIZES = [("logo-32.png", 32), ("logo-96.png", 96), ("logo-192.png", 192)]

# 팔레트 색 수. 로고는 색이 몇 개 안 되므로 64색이면 눈에 띄는 손실이 없다.
PALETTE_COLORS = 64


def render(px):
    """원본을 긴 변 px 로 줄여 PNG 바이트로."""
    with Image.open(SRC) as im:
        im = im.convert("RGBA")
        im.thumbnail((px, px), Image.LANCZOS)
        # FASTOCTREE 는 RGBA 를 그대로 양자화한다(MEDIANCUT 은 알파를 못 다룬다).
        q = im.quantize(colors=PALETTE_COLORS, method=Image.Quantize.FASTOCTREE)
        buf = io.BytesIO()
        q.save(buf, format="PNG", optimize=True)
        return buf.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="파일이 원본과 어긋나면 1로 종료(생성하지 않음)")
    args = ap.parse_args()

    if not os.path.exists(SRC):
        print(f"원본 없음: {SRC}", file=sys.stderr)
        return 1

    stale = []
    for name, px in SIZES:
        path = os.path.join(BRAND_DIR, name)
        data = render(px)
        old = None
        if os.path.exists(path):
            with open(path, "rb") as f:
                old = f.read()
        if old == data:
            print(f"  = {name} ({len(data) // 1024}KB)")
            continue
        if args.check:
            stale.append(name)
            print(f"  ! {name} 가 원본과 어긋남")
            continue
        with open(path, "wb") as f:
            f.write(data)
        print(f"  + {name} ({len(data) // 1024}KB)")

    if stale:
        print("\n원본 로고가 바뀌었는데 파생본이 갱신되지 않았습니다.\n"
              "  python3 _meta/build_logo_sizes.py", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
