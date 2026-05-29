# 인테리어 자재 사진 안내

이 폴더에 자재별 예시 사진을 업로드하면, 해당 페이지의 자재 카드에 자동으로 표시됩니다.
사진이 없으면 회색 SVG placeholder가 자동으로 노출되므로, 빈 폴더라도 페이지는 정상 동작합니다.

---

## 1) 파일 경로 (어디에 넣을지)

```
site/assets/images/interior/{카테고리}/{슬러그}.{확장자}
```

| 카테고리 | 폴더 |
|---|---|
| 바닥재 (마루·장판·타일) | `flooring/` |
| 도배 (벽지) | `wallpaper/` |
| 욕실 (타일·도기) | `bathroom/` |
| 주방 (싱크대·상판) | `kitchen/` |
| 창호 (샷시) | `windows/` |
| 타일 | `tile/` |

예시:

```
site/assets/images/interior/flooring/gangmaru.webp
site/assets/images/interior/flooring/ganghwa-maru.webp
site/assets/images/interior/flooring/won-mok-maru.webp
site/assets/images/interior/wallpaper/silk.webp
site/assets/images/interior/wallpaper/habji.webp
site/assets/images/interior/bathroom/dogyak.webp
```

각 자재 카드의 `<img>` 태그에 미리 적힌 경로와 같은 파일명으로 업로드하세요.
페이지 HTML을 수정할 필요는 없습니다.

---

## 2) 권장 슬러그 (파일명) 목록

### 바닥재 (`flooring/`)
- `gangmaru` — 강마루
- `ganghwa-maru` — 강화마루
- `won-mok-maru` — 원목마루
- `lvt` — LVT (럭셔리 비닐 타일)
- `jangpan` — 장판 (PVC)

### 도배 (`wallpaper/`)
- `silk` — 실크 벽지
- `habji` — 합지 벽지
- `mural` — 뮤럴 벽지
- `paint` — 페인트 (수성·도장)

### 욕실 (`bathroom/`)
- `dogyak-tile` — 도기질 타일
- `jagi-tile` — 자기질 타일
- `polishing-tile` — 폴리싱 타일
- `bathtub` — 욕조
- `shower-booth` — 샤워부스
- `toilet` — 양변기

### 주방 (`kitchen/`)
- `pet-door` — PET 도어
- `up-door` — UV 도어
- `lpm-door` — LPM 도어
- `engineered-stone` — 인조대리석 상판
- `quartz` — 쿼츠 상판
- `built-in` — 빌트인 가전

### 창호 (`windows/`)
- `system-window` — 시스템 창호
- `normal-window` — 일반 이중창
- `pvc-frame` — PVC 프레임

### 타일 (`tile/`)
- `porcelain` — 자기질 타일
- `ceramic` — 도기질 타일
- `polishing` — 폴리싱 타일
- `wood-look` — 우드 타일

---

## 3) 이미지 규격

| 항목 | 권장값 |
|---|---|
| **가로:세로 비율** | 4:3 (예: 1200×900px) |
| **최소 가로** | 800px |
| **최대 가로** | 1600px |
| **포맷** | `.webp` (권장) · `.jpg` · `.png` 가능 |
| **파일 크기** | 200KB 이하 권장 (사용자 로딩 속도) |
| **색상 공간** | sRGB |

### WebP로 변환 (선택)

원본이 JPG/PNG라면 다음 명령으로 WebP로 변환할 수 있습니다.

```bash
# macOS / Linux (cwebp 설치 후)
cwebp -q 80 input.jpg -o output.webp
```

웹 도구: <https://squoosh.app> 에서 드래그 한 번이면 변환됩니다.

---

## 4) 사용 권한

업로드하는 이미지는 다음 중 하나여야 합니다.

- **직접 촬영한 사진** (가장 안전)
- **상업 사용 허가된 무료 이미지** (Unsplash, Pexels, Pixabay 등 / 라이선스 명기 확인)
- **자재 제조사 공식 보도자료 이미지** (출처 표기 권장)

> 구글·블로그·쇼핑몰의 이미지를 무단 사용하면 저작권 분쟁이 발생할 수 있습니다.

---

## 5) 파일이 없을 때

각 자재 카드에는 `onerror` 폴백으로 회색 SVG placeholder가 자동 표시됩니다.
따라서 사진을 일부만 올리고 나머지는 차차 채워도 됩니다.

```html
<img src="../assets/images/interior/flooring/gangmaru.webp"
     onerror="this.onerror=null; this.src='../assets/images/interior/_placeholder.svg';"
     alt="강마루 예시" />
```

---

## 6) 사진을 추가한 뒤

1. 깃허브에서 이 폴더에 파일을 업로드 (드래그 앤 드롭)
2. 커밋 메시지: `chore(images): 인테리어 자재 사진 추가 — 강마루·강화마루`
3. main 브랜치 머지 → GitHub Pages가 자동 배포
