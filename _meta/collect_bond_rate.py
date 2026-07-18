#!/usr/bin/env python3
"""제1종국민주택채권 당일 할인율(고객부담률) → site/assets/bond_rate.json.

⚠ 공식 오픈API가 없다. 정부(주택도시기금)·은행 포털 모두 사람이 보는 조회
페이지(HTML)만 제공해, 이 수집기는 그 페이지를 파싱하는 방식이다.

2026-07-17 첫 실행에서 주택도시기금 포털(FP070509.jsp)이 실제 조회 화면이 아니라
'청약/채권' 메뉴 목록만 반환해 JS 위젯으로 오판, 은행 페이지(우리은행·KB)를 대신
1순위로 썼다. 이후 사용자가 실제 화면 캡처로 정확한 페이지(FP070503.jsp — '채권매도
단가/수익률/할인율 조회', 정적 HTML로 표가 그대로 뜸)를 확인해줘 정부 원천을 1순위로
돌렸는데, 2026-07-18 CI 재검증 결과 FP070503.jsp도 세션·쿠키 의존적인지 단순 GET에
메뉴/사이트맵 텍스트만 돌아오는 경우가 있음을 확인(반면 같은 실행에서 우리은행은
과거 정상적으로 실제 표를 반환한 전적이 있음 — 그때는 열 정렬 버그로 값만 틀렸을 뿐
페이지 자체는 정상 수신했었다). 국민주택채권 할인율은 은행마다 다른 값이 아니라
한국거래소 신고시장단가 기반의 전국 공통 기준값이라 어느 소스든 같은 숫자를
보여주므로, CI에서 더 안정적으로 응답하는 우리은행을 1순위로 하고 주택도시기금·KB는
폴백으로 둔다. 은행 페이지는 EUC-KR 인코딩·비브라우저 UA 차단 가능성이 있어 자체
fetch(UA 지정 + cp949 폴백)를 쓴다.

⚠ 과거엔 표 구조 파서가 실패하면 '키워드 인근 숫자'를 그냥 집는 근접 정규식으로
폴백했는데, 2026-07-18에 이 폴백이 두 번이나 같은 의심스러운 값(3.8546%, 실제
고객부담률과 무관해 보이는 수치)을 만들어냈다 — 표 어디서 온 숫자인지 모르니
틀려도 알 방법이 없었다. 그래서 폴백을 완전히 제거했다: 구조화 파서(표에서 열
위치를 찾아 값을 취하는 방식)만 신뢰하고, 실패하면 그냥 실패로 처리해 기존 값을
유지한다. '틀린 값'보다 '갱신 안 됨'이 안전하다는 원칙.

모든 소스가 실패하면 기존 값을 그대로 유지하고(save_json_safe), 소스별 실패
사유와 '부담/할인' 키워드 주변 텍스트를 stderr에 남긴다 — Actions 로그의
"[bond_rate]" 라인만 보면 다음에 표 구조 파서를 어떻게 고쳐야 할지 알 수 있게.
"""
import datetime as dt
import os
import re
import sys
import urllib.request

from lib_pdata import SITE_ASSETS, save_json_safe  # noqa: E402

OUT = os.path.join(SITE_ASSETS, "bond_rate.json")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# 시도 순서: CI에서 실제로 안정적으로 응답하는 순.
#  · 우리은행 — 2026-07-18 CI 실행에서 실제 표를 정상 수신한 전적 있음(1순위)
#  · 주택도시기금 — 공식 원천(FP070503.jsp, 사용자 화면 캡처로 확인)이지만 CI에서
#    세션·쿠키 의존인지 메뉴 텍스트만 돌아온 사례 있어 2순위. FP070509는 메뉴
#    페이지라 표가 아예 없으니 절대 혼동하지 말 것
#  · KB — 마지막 폴백
SOURCES = [
    ("우리은행 1종채권 매도단가/할인율", "https://svc.wooribank.com/svc/Dream?withyou=HBNHB0036"),
    ("주택도시기금", "https://nhuf.molit.go.kr/FP/FP07/FP0705/FP070503.jsp"),
    ("KB 1종채권 매도단가/할인율", "https://okbfex.kbstar.com/quics?page=C028010"),
]

def fetch(url, timeout=15):
    """UA를 브라우저로 지정해 GET. UTF-8 → CP949(EUC-KR) 순으로 디코딩 시도.
    (은행 페이지는 EUC-KR이 흔해 utf-8 강제 디코딩 시 '고객부담률' 키워드가 깨져
    정규식이 절대 매치되지 않는다.)"""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ko"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    for enc in ("utf-8", "cp949"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def strip_tags(html):
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text)


def _build_grid(html, max_col=20):
    """<table> HTML → colspan·rowspan을 실제 렌더링 열 위치대로 반영한 2차원 셀 그리드.

    2026-07-18 첫 실행에서 '고객부담률' 열 대신 '수익률' 열 값(3.8546% — 당시 국고채
    3년물 수익률 3.758%와 사실상 동일)을 잘못 집어왔다. 원인으로 가장 유력한 것은
    은행 표에 흔한 '회차'처럼 rowspan으로 헤더 두 행을 가로지르는 선행 열 — 이 열이
    두 번째(실제 라벨) 헤더 행에는 안 나타나므로, 그 행만 보고 계산한 열 인덱스가
    데이터 행보다 1칸씩 왼쪽으로 밀린다. colspan만 펼치고 rowspan을 무시하면 이 밀림을
    못 잡으므로, 위에서 걸쳐온 rowspan 셀을 이번 행의 실제 칸에 그대로 끌어와 채운
    뒤에 이번 행 고유 셀을 이어 붙인다 — 브라우저가 표를 그리는 방식과 동일하게."""
    rows_out = []
    pending = {}   # col_index -> [남은 행 수, 텍스트] — 위 행에서 rowspan으로 걸쳐온 셀
    for tr in re.finditer(r"<tr[^>]*>([\s\S]*?)</tr>", html, re.I):
        cells = []
        for cm in re.finditer(r"<t([hd])([^>]*)>([\s\S]*?)</t[hd]>", tr.group(1), re.I):
            attrs, inner = cm.group(2), cm.group(3)
            text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", inner)).strip()
            cs = re.search(r'colspan\s*=\s*["\']?(\d+)', attrs, re.I)
            rs = re.search(r'rowspan\s*=\s*["\']?(\d+)', attrs, re.I)
            cells.append({"text": text, "colspan": int(cs.group(1)) if cs else 1,
                          "rowspan": int(rs.group(1)) if rs else 1})
        if not cells and not pending:
            continue
        row, col, new_pending = [], 0, {}
        it = iter(cells)
        cur = next(it, None)
        while col < max_col:
            if col in pending:
                remaining, text = pending[col]
                row.append(text)
                if remaining > 1:
                    new_pending[col] = (remaining - 1, text)
                col += 1
                continue
            if cur is None:
                break
            for k in range(cur["colspan"]):
                if col + k >= max_col:
                    break
                row.append(cur["text"])
                if cur["rowspan"] > 1:
                    new_pending[col + k] = (cur["rowspan"] - 1, cur["text"])
            col += cur["colspan"]
            cur = next(it, None)
        for k, v in pending.items():   # 이번 행 폭 밖에 남은 이전 rowspan은 다음 행으로 이월
            if k not in new_pending and k >= col:
                new_pending[k] = v
        pending = new_pending
        while row and row[-1] == "":
            row.pop()
        if row:
            rows_out.append(row)
    return rows_out


def _row_date(row):
    """행의 셀 중 'YYYY.MM.DD'류 날짜가 있으면 ISO(YYYY-MM-DD)로, 없으면 None.
    은행 조회 표의 '기준일' 열 값을 실제 as_of로 쓰기 위함(수집 시각의 '오늘'이
    아니라 표가 실제로 보여주는 마지막 영업일 기준이 더 정확하다)."""
    for cell in row:
        m = re.search(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})", cell)
        if m:
            return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return None


def extract_rate_from_table(html, diag=None):
    """은행 조회 페이지의 표 구조 대응 — 헤더행의 '고객부담률/할인율' 열 위치를 찾고,
    그 아래 데이터행들에서 값을 취한다. (헤더와 값이 떨어져 있어 근접 정규식으로는
    매도단가·수익률 등 다른 열 숫자와 구분할 수 없기 때문.)

    실제 페이지(우리은행 매도단가/수익률/할인율 조회, 2026-07-18 캡처로 확인)는
    '기준일·매도단가·수익률·할인율' 4열 표에 조회월의 여러 영업일이 날짜 오름차순
    (7/1 → 7/2 → … → 최신)으로 나열된다. 헤더 바로 다음 행만 보면 그 달의 '가장
    오래된' 날짜를 집게 되므로 — 헤더 아래 유효한 값을 가진 모든 행을 훑어 그중
    '마지막'(가장 최근 날짜) 값을 채택한다.

    diag: dict를 넘기면 matched_header_row·matched_value_row·matched_date를 채운다 —
    성공 시에도 '어느 행에서 어떻게 골랐는지'를 로그로 남겨, 혹시 또 잘못돼도 다음엔
    웹서치 없이 로그만 보고 바로 고칠 수 있게 한다(2026-07-18 사고 — 표 열 정렬 오류로
    '수익률' 값을 '고객부담률'로 잘못 기록했으나 성공 로그가 없어 원인 파악에 외부
    검색이 필요했음)."""
    rows = _build_grid(html)

    def value_at(ci, row):
        if ci >= len(row):
            return None
        if re.search(r"\d{4}\s*[.\-/년]\s*\d{1,2}", row[ci]):
            return None   # 날짜 셀("2026.07.18"·"2026년 7월") — 중간 숫자 오탐 방지
        m = re.search(r"(?<!\d)(\d{1,2}\.\d{1,6})(?!\d)\s*%?", row[ci])
        return float(m.group(1)) if m else None

    for ri, row in enumerate(rows):
        for ci, cell in enumerate(row):
            if not any(kw in cell for kw in ("고객부담률", "할인율", "본인부담률")):
                continue
            # 좌우 이웃 칸과 텍스트가 완전히 같으면 이 칸은 colspan으로 펼쳐진 '그룹
            # 헤더'(예: "매도단가/수익률/할인율" 제목행)의 일부다 — 실제 열별 라벨이
            # 아니므로 건너뛰고 그 아래(진짜 개별 열 라벨) 행에서 다시 찾게 한다.
            if (ci > 0 and row[ci - 1] == cell) or (ci + 1 < len(row) and row[ci + 1] == cell):
                continue
            # 같은 헤더 행에 '수익률' 열이 따로 있으면 그 열 인덱스를 기억해 뒀다가,
            # 우리가 고른 값이 그 열 값과 같으면(=열이 밀려 같은 값을 집었다는 뜻)
            # 오탐으로 보고 그 행만 건너뛴다.
            yield_ci = next((j for j, c in enumerate(row) if "수익률" in c and j != ci), None)

            # 라벨-값 가로 배치(예: <th>할인율</th><td>13.95%</td>) — 같은 행 다음 칸.
            same_row_val = value_at(ci + 1, row)
            if same_row_val is not None:
                yield_val = value_at(yield_ci, row) if yield_ci is not None else None
                if not (yield_val is not None and abs(same_row_val - yield_val) < 1e-6):
                    if diag is not None:
                        diag["matched_header_row"] = row
                        diag["matched_value_row"] = row
                        diag["matched_col"] = ci + 1
                    return same_row_val

            # 헤더-데이터 세로 배치 — 헤더 아래 모든 행 중 유효한 값을 가진 '마지막'
            # 행(최신 날짜)을 채택. 오탐(수익률과 값 동일) 행은 건너뛰되 탐색은 계속한다.
            last_val, last_row = None, None
            for below in rows[ri + 1:]:
                val = value_at(ci, below)
                if val is None:
                    continue
                yield_val = value_at(yield_ci, below) if yield_ci is not None else None
                if yield_val is not None and abs(val - yield_val) < 1e-6:
                    continue
                last_val, last_row = val, below
            if last_val is not None:
                if diag is not None:
                    diag["matched_header_row"] = row
                    diag["matched_value_row"] = last_row
                    diag["matched_col"] = ci
                    diag["matched_date"] = _row_date(last_row)
                return last_val
    return None


def extract_rate(html, diag=None):
    """구조화된 표 파서(extract_rate_from_table)만 신뢰한다 — 과거에 썼던 '키워드
    인근 숫자'식 근접 정규식 폴백은 2026-07-18에 두 번이나 같은 의심스러운 값
    (3.8546%)을 만들어냈다. 표 어디에서 왔는지 알 수 없는 숫자를 그냥 채택하는
    방식이라, 페이지에 있는 무관한 숫자(다른 채권 시리즈·안내문 등)를 잘못 집어도
    구분할 방법이 없었다. 값을 못 찾으면 '틀린 값을 넣는 것'보다 '기존 값을
    유지하는 것'이 안전하므로, 구조 파서가 실패하면 그냥 실패로 처리한다."""
    return extract_rate_from_table(html, diag=diag)


def excerpt_around_keywords(html, keywords=("부담", "할인"), width=120):
    """실패 진단용 — 키워드 주변 텍스트 조각을 모아 반환(정규식만 고치면 되게)."""
    text = strip_tags(html)
    pieces = []
    for kw in keywords:
        i = text.find(kw)
        if i >= 0:
            pieces.append(text[max(0, i - 20):i + width])
    return " ⧸ ".join(pieces) if pieces else text[:200]


def main():
    rate, used, diag = None, None, {}
    for label, url in SOURCES:
        try:
            html = fetch(url)
        except Exception as e:  # noqa: BLE001
            print(f"[bond_rate] {label} 조회 실패: {e}", file=sys.stderr)
            continue
        diag = {}
        rate = extract_rate(html, diag=diag)
        if rate is not None:
            used = label
            break
        print(f"[bond_rate] {label} 파싱 실패 — 키워드 주변: "
              f"{excerpt_around_keywords(html)!r}", file=sys.stderr)

    if rate is None:
        print("[bond_rate] 모든 소스에서 할인율 파싱 실패 — 기존 값 유지.", file=sys.stderr)
        return
    if not (0 < rate < 50):   # 상식적 범위를 벗어나면 오탐 가능성 — 저장하지 않음
        print(f"[bond_rate] 파싱값이 비정상 범위({rate}%) — 저장하지 않음", file=sys.stderr)
        return
    # 표에 찍힌 실제 기준일(예: 조회월의 마지막 영업일)을 as_of로 쓴다 — 수집 시각의
    # '오늘'은 은행이 아직 그날 값을 안 올렸을 수 있어 부정확할 수 있음.
    as_of = diag.get("matched_date") or dt.date.today().isoformat()
    data = {
        "_meta": {"source": f"{used} 조회 페이지 파싱 — 제1종국민주택채권 고객부담률(할인율)",
                  "note": "공식 오픈API가 없어 조회 페이지를 파싱함. 실패 시 기존 값 유지."},
        "as_of": as_of,
        "customer_burden_rate_pct": rate,
    }
    save_json_safe(OUT, data)
    print(f"[bond_rate] 고객부담률 {rate}% ({used}, {data['as_of']})")
    if diag.get("matched_header_row") is not None:
        print(f"[bond_rate] 매치 근거 — 헤더행: {diag['matched_header_row']} · "
              f"값행: {diag['matched_value_row']} · 열idx: {diag['matched_col']}")


if __name__ == "__main__":
    main()
