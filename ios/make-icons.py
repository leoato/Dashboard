#!/usr/bin/env python3
"""오늘선생·오늘학생 앱 아이콘 생성기.

원본 512 아이콘(ios/icons/src-*.png)에서 도형(사람 둘·모눈)을 마스크로 뽑아
1024로 선명하게 재구성하고, 하단 밴드와 라벨만 다시 그린다.
App Store 요건: 1024x1024, 알파 채널 없음.

사용법:  python3 ios/make-icons.py
"""
from PIL import Image, ImageDraw, ImageFont
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
S = 1024
K = S / 512
INK  = (34, 34, 34)        # #222222
GRAY = (154, 160, 166)     # #9AA0A6
LIME = (185, 241, 141)     # #B9F18D
GRID = (247, 247, 249)
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"   # index 6 = Bold

# 원본(512)에서 실측한 좌표
BAND = (56, 362, 455, 447)      # 형광 밴드
LINE = (56, 352, 455, 361)      # 테이블 선
TXT_CX, TXT_CY = 254, 399       # 라벨 중심
TXT_H = 66                      # 원본 라벨의 글자 높이(512 기준). 폭이 아니라 높이를 맞춰야
                                # 글자 수가 늘어도 밴드 안에서 같은 크기로 앉는다.


def near(c, t, tol):
    return all(abs(a - b) <= tol for a, b in zip(c, t))


def P(v):
    return int(round(v * K))


def fit_font(draw, label, target_h):
    """목표 글자 높이에 가장 가까운 폰트 크기를 찾는다."""
    best_f, best_d = None, None
    for size in range(60, 260, 2):
        f = ImageFont.truetype(FONT, size, index=6)
        l, t, r, b = draw.textbbox((0, 0), label, font=f)
        d = abs((b - t) - target_h)
        if best_d is None or d < best_d:
            best_d, best_f = d, f
    return best_f


def build(src, label, out):
    im = Image.open(src).convert("RGB")
    W, H = im.size
    px = im.load()

    # 색상별 마스크 추출 → 2배 확대 후 재이진화(원본 형태 보존 + 선명도)
    # 밴드·테이블선 영역은 아래에서 사각형으로 직접 그리므로 제외한다.
    masks = {}
    for name, target, tol in (("grid", GRID, 6), ("gray", GRAY, 26), ("ink", INK, 40)):
        m = Image.new("L", (W, H), 0)
        mp = m.load()
        for y in range(H):
            if BAND[1] <= y <= BAND[3] or LINE[1] <= y <= LINE[3]:
                continue
            for x in range(W):
                if near(px[x, y], target, tol):
                    mp[x, y] = 255
        masks[name] = m.resize((S, S), Image.LANCZOS).point(lambda v: 255 if v >= 128 else 0)

    canvas = Image.new("RGB", (S, S), (255, 255, 255))   # RGB → 알파 없음
    for name, color in (("grid", GRID), ("gray", GRAY), ("ink", INK)):
        canvas.paste(Image.new("RGB", (S, S), color), (0, 0), masks[name])

    d = ImageDraw.Draw(canvas)
    d.rectangle([P(LINE[0]), P(LINE[1]), P(LINE[2]), P(LINE[3])], fill=INK)
    d.rectangle([P(BAND[0]), P(BAND[1]), P(BAND[2]), P(BAND[3])], fill=LIME)

    f = fit_font(d, label, TXT_H * K)
    l, t, r, b = d.textbbox((0, 0), label, font=f)
    band_w = P(BAND[2]) - P(BAND[0])
    if (r - l) > band_w * 0.92:      # 밴드를 넘칠 만큼 길면 폭 기준으로 줄인다
        while (r - l) > band_w * 0.86 and f.size > 60:
            f = ImageFont.truetype(FONT, f.size - 2, index=6)
            l, t, r, b = d.textbbox((0, 0), label, font=f)
    d.text((TXT_CX * K - (r - l) / 2 - l, TXT_CY * K - (b - t) / 2 - t), label, font=f, fill=INK)

    canvas.save(out)
    print(f"  {out.name}  글자 {r-l}x{b-t}px / 밴드 {band_w}x{P(BAND[3])-P(BAND[1])}px  폰트 {f.size}")
    return canvas


ICONS = ROOT / "ios" / "icons"
jobs = [("teacher", "오늘선생"), ("student", "오늘학생")]

print("1024 아이콘 생성:")
for who, label in jobs:
    big = build(ICONS / f"src-{who}-512.png", label, ICONS / f"icon-{who}-1024.png")
    # PWA·웹용 512는 1024를 줄여서 만든다 (두 곳의 아이콘을 같게 유지)
    big.resize((512, 512), Image.LANCZOS).save(ROOT / f"icon-{who}.png")
    # Xcode 에셋에도 반영
    ass = ROOT / "ios" / who / "ios" / "App" / "App" / "Assets.xcassets" / "AppIcon.appiconset" / "AppIcon-512@2x.png"
    if ass.parent.exists():
        big.save(ass)
print("완료")
