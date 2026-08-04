#!/usr/bin/env python3
"""제1종국민주택채권 당일 할인율(고객부담률) → site/assets/bond_rate.json.

⚠ 공식 오픈API가 없다. 은행·정부 포털 모두 사람이 보는 조회 화면만 제공한다.

■ 왜 몇 주 동안 값이 멈춰 있었나 (2026-08-04 규명)

지금까지 이 수집기는 "조회 페이지를 GET 해서 표를 파싱"하는 구조였고, 실패할 때마다
표 파서(열 정렬·정규식)를 고쳐 왔다. 그건 오진이었다. **짚을 표가 애초에 없었다.**

KB 화면(quics?page=C028010)은 데이터 페이지가 아니라 **조회 폼**이다:

    기준년도/기준월  [2023…2027] 년 / [01…12] 월   [조회]

조회를 누르기 전에는 표가 존재하지 않는다. 그래서 GET 응답에는 메뉴·네비게이션
텍스트만 있었고, 어떤 파서로도 값을 찾을 수 없었다. 개발 환경에서는 은행·기금
도메인이 모두 막혀 있어(HTTP 000/403) 이 사실을 확인할 방법이 없었고, 네트워크가
열린 GitHub Actions 에서 진단 워크플로(probe-bond-rate.yml)를 돌려서야 드러났다.

■ 지금 방식 — 조회 폼을 그대로 재현한다

같은 진단에서 조회 버튼의 정체를 확보했다:

    <button type="button" onclick="uf_doInquiry(); return false;">조회</button>

    function uf_doInquiry() {
        var frm = document.IBS;
        frm.elements['기준년월일'].value = frm.year1.value + frm.mon1.value + "00";
        frm.elements['조회구분'].value   = "1";
        frm.elements["gubunB"].value     = "Y";
        ...
        frm.action = '/quics?page=C028010&cc=b046309:b046309';
        doAjaxCC(frm);
    }

즉 브라우저가 하는 일은 폼 필드 몇 개를 채워 POST 하는 것뿐이다. Playwright 를 상주
시킬 필요 없이 같은 POST 를 그대로 보내면 된다(표준 라이브러리만 씀).

응답 표는 이렇게 생겼다 — 2026-08-04 실측:

    기준일       고객부담률(할인율)   매도단가(매도시세)
    2026-08-05        15.0251 %          8,517 원
    2026-08-04        15.0528 %          8,514 원
    2026-08-03        15.1301 %          8,506 원

■ 행 고르기 — 두 가지 함정

  1) 행이 **내림차순**이다(최신이 맨 위). 예전 코드는 "헤더 아래 마지막 행이 최신"으로
     가정했는데, 그 가정대로면 그 달의 가장 오래된 값을 집는다.
  2) **미래 날짜가 섞인다.** 은행이 다음 영업일 값을 미리 올려 둔다(위 표의 08-05는
     조회 시점 기준 내일이다). 그냥 최댓값을 고르면 오늘 쓸 수 없는 값이 들어온다.

그래서 '오늘 이하 날짜 중 가장 최근' 행을 고른다. 날짜 순서나 행 위치에 기대지 않고
셀에 찍힌 날짜를 실제로 비교한다.

■ 실패했을 때

값을 덮어쓰지 않는다(save_json_safe). '틀린 값'보다 '갱신 안 됨'이 안전하다는 원칙은
그대로다. 과거에 표 파서가 실패하면 '키워드 인근 숫자'를 집는 근접 정규식으로 폴백한
적이 있는데, 2026-07-18 에 그 폴백이 두 번이나 같은 엉뚱한 값(3.8546%)을 만들어냈다.
어디서 온 숫자인지 알 수 없으니 틀려도 알 방법이 없었다 — 그래서 폴백은 없다.

실패는 파일에도 남긴다(last_attempt_at·consecutive_failures·last_error). 예전에는
조용히 끝나서 워크플로는 초록불인데 값만 몇 주째 그대로였고, 사용자가 화면에서
예시값을 보고서야 알았다.
"""
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

from lib_pdata import SITE_ASSETS, save_json_safe  # noqa: E402

OUT = os.path.join(SITE_ASSETS, "bond_rate.json")

# 며칠 연속 실패하면 워크플로 로그에 경고를 띄운다(조용한 실패 방지).
FAIL_ALERT_AFTER = 3

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# ── KB 조회 폼 재현 ───────────────────────────────────────────────────────
# uf_doInquiry() 가 하는 일을 그대로 옮긴 것. cc= 파라미터까지 포함해야 조회 결과가
# 온다(폼이 action 에 직접 박아 넣는 값이다).
KB_POST_URL = "https://okbfex.kbstar.com/quics?page=C028010&cc=b046309:b046309"

# 다른 은행·주택도시기금은 소스로 쓰지 않는다 — 2026-08-04 진단 실측:
#  · 우리은행(svc.wooribank.com): GitHub 러너에서 정적·렌더 모두 60초 타임아웃
#  · 주택도시기금(FP070503.jsp): 렌더해도 본문이 882자뿐(제목·발자취·푸터만)
# 할인율은 은행마다 다른 값이 아니라 한국거래소 신고시장단가 기반의 전국 공통
# 기준값이므로, 응답하는 곳 한 군데만 있으면 된다.


def kb_form_data(today):
    """uf_doInquiry() 가 채우는 폼 필드. 기준년월일의 끝 '00' 은 일자 자리로,
    '그 달 전체'를 뜻한다(함수가 year1+mon1+"00" 으로 만든다)."""
    return {
        "팝업여부": "N",
        "LOGIN_PASS": "T",
        "gubunB": "Y",
        "기준년월일": today.strftime("%Y%m") + "00",
        "조회구분": "1",
        "요청페이지": "",
        "year1": today.strftime("%Y"),
        "mon1": today.strftime("%m"),
    }


def fetch(url, data=None, timeout=30):
    """UA를 브라우저로 지정해 GET/POST. UTF-8 → CP949(EUC-KR) 순으로 디코딩 시도.

    data 를 주면 폼 POST. 파라미터 **이름이 한글**(기준년월일·조회구분·팝업여부)이라
    인코딩이 중요한데, KB 페이지는 `<meta charset="utf-8">` 이므로 브라우저도 UTF-8 로
    퍼센트 인코딩해 보낸다 — 여기서도 UTF-8 을 쓴다.

    응답은 EUC-KR 일 수 있어 cp949 폴백을 둔다. utf-8 로 강제 디코딩하면 '고객부담률'
    키워드가 깨져 표를 영영 못 찾는다.

    XHR 로 부르는 화면이라 X-Requested-With 를 붙인다 — 서버가 이 헤더로 전체 페이지
    대신 조회 결과 조각만 돌려주는 경우가 있다.
    """
    headers = {"User-Agent": UA, "Accept-Language": "ko"}
    body = None
    if data is not None:
        body = urllib.parse.urlencode(data, encoding="utf-8").encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        headers["X-Requested-With"] = "XMLHttpRequest"
        headers["Referer"] = "https://okbfex.kbstar.com/quics?page=C028010"
    req = urllib.request.Request(url, data=body, headers=headers)
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

            # 헤더-데이터 세로 배치 — 행마다 (기준일, 값)을 모은 뒤 **날짜로** 고른다.
            #
            # ⚠ 행 위치에 기대면 안 된다. 예전 코드는 "헤더 아래 마지막 행이 최신"으로
            #   가정했는데, KB 표는 최신이 맨 위인 **내림차순**이다(2026-08-04 실측).
            #   그 가정대로면 조회한 달의 가장 오래된 값을 집는다.
            # ⚠ **미래 날짜가 섞인다.** 은행이 다음 영업일 값을 미리 올려 둔다 —
            #   실측 표에 조회 당일(08-04)보다 하루 뒤인 08-05 행이 맨 위에 있었다.
            #   최댓값을 고르면 오늘 쓸 수 없는 값이 들어온다.
            # 그래서 '오늘 이하 중 가장 최근' 날짜의 행을 고른다.
            picked = []
            for below in rows[ri + 1:]:
                val = value_at(ci, below)
                if val is None:
                    continue
                yield_val = value_at(yield_ci, below) if yield_ci is not None else None
                if yield_val is not None and abs(val - yield_val) < 1e-6:
                    continue
                picked.append((_row_date(below), val, below))
            if not picked:
                continue

            today = dt.date.today().isoformat()
            dated = [p for p in picked if p[0]]
            usable = [p for p in dated if p[0] <= today]
            if usable:
                best = max(usable, key=lambda p: p[0])
            elif dated:
                # 전부 미래 날짜 — 표에 오늘 값이 아직 없다는 뜻이다. 그중 가장 이른
                # 날짜를 쓰되 로그로 남긴다(주말·공휴일 조회에서 나올 수 있다).
                best = min(dated, key=lambda p: p[0])
                print(f"[bond_rate] 오늘({today}) 이하 기준일이 없어 최근접 미래분 "
                      f"{best[0]} 을 사용", file=sys.stderr)
            else:
                # 날짜 열이 없는 표 — 값만 있으면 첫 유효 행을 쓴다.
                best = picked[0]

            if diag is not None:
                diag["matched_header_row"] = row
                diag["matched_value_row"] = best[2]
                diag["matched_col"] = ci
                diag["matched_date"] = best[0]
                diag["candidates"] = [(p[0], p[1]) for p in picked[:8]]
            return best[1]
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


def load_existing():
    """기존 파일 — 연속 실패 횟수를 이어가려면 이전 상태를 알아야 한다."""
    try:
        with open(OUT, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {}


def record_failure(reasons):
    """수집 실패를 **파일에 남긴다**.

    왜: 예전에는 실패하면 아무것도 안 하고 조용히 끝났다. 워크플로 스텝은 초록불이고,
    JSON은 몇 주 전 값 그대로였다. 그래서 '수집이 계속 실패 중'이라는 사실을 아무도
    몰랐다 — 사용자가 화면에서 예시값을 보고서야 알았다.
    이제 시도 시각·연속 실패 횟수·마지막 오류를 남겨, 화면과 CI 양쪽에서 보이게 한다.
    (값 자체는 절대 덮어쓰지 않는다 — 틀린 값보다 오래된 값이 낫다는 원칙은 그대로.)
    """
    data = load_existing()
    prev = int(data.get("consecutive_failures") or 0)
    data["last_attempt_at"] = dt.date.today().isoformat()
    data["consecutive_failures"] = prev + 1
    data["last_error"] = " / ".join(reasons)[:500]
    try:
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
    except Exception as e:  # noqa: BLE001
        print(f"[bond_rate] 실패 기록 저장 실패: {e}", file=sys.stderr)
    return data["consecutive_failures"]


def main():
    rate, used, diag = None, None, {}
    reasons = []
    today = dt.date.today()
    label = "KB 제1종국민주택채권 매도단가/할인율 조회"

    # 조회 폼을 POST 로 재현한다. 은행 페이지는 콜드 러너에서 첫 연결이 자주 끊기므로
    # 한 번 실패했다고 바로 포기하지 않는다(타임아웃도 늘려 잡는다).
    html = None
    for attempt, timeout in enumerate((25, 35, 45), start=1):
        try:
            html = fetch(KB_POST_URL, data=kb_form_data(today), timeout=timeout)
            break
        except Exception as e:  # noqa: BLE001
            print(f"[bond_rate] {label} 실패(시도 {attempt}/3, timeout={timeout}s): {e}",
                  file=sys.stderr)
            if attempt == 3:
                reasons.append(f"{label}: {e}")
            else:
                time.sleep(3 * attempt)

    if html is not None:
        diag = {}
        rate = extract_rate(html, diag=diag)
        if rate is not None:
            used = label
        else:
            excerpt = excerpt_around_keywords(html)
            reasons.append(f"{label}: 파싱 실패")
            print(f"[bond_rate] {label} 파싱 실패(len={len(html)}) — 키워드 주변: {excerpt!r}",
                  file=sys.stderr)

    if rate is None:
        n = record_failure(reasons or ["원인 미상"])
        print(f"[bond_rate] 할인율 확보 실패 — 기존 값 유지 "
              f"(연속 {n}회 실패).", file=sys.stderr)
        # 조용한 실패를 막는다: 며칠째 계속 실패하면 워크플로에서 눈에 띄게 만든다.
        if n >= FAIL_ALERT_AFTER:
            print(f"::warning title=국민주택채권 할인율 수집 실패::"
                  f"{n}일 연속 실패했습니다. 화면에는 예시값이 표시되고 있습니다. "
                  f"마지막 오류: {' / '.join(reasons)[:200]}")
            if os.environ.get("BOND_RATE_STRICT") == "1":
                sys.exit(1)
        return
    if not (0 < rate < 50):   # 상식적 범위를 벗어나면 오탐 가능성 — 저장하지 않음
        print(f"[bond_rate] 파싱값이 비정상 범위({rate}%) — 저장하지 않음", file=sys.stderr)
        return
    # 표에 찍힌 실제 기준일(예: 조회월의 마지막 영업일)을 as_of로 쓴다 — 수집 시각의
    # '오늘'은 은행이 아직 그날 값을 안 올렸을 수 있어 부정확할 수 있음.
    as_of = diag.get("matched_date") or dt.date.today().isoformat()
    # collected_at: 마지막 '정상 수집'이 언제였는지. 수집이 실패하면 파일을 건드리지 않으므로
    # 이 값이 그대로 남고, 화면은 그 날짜로 값이 얼마나 오래됐는지 판단한다.
    # (as_of는 은행 표에 찍힌 '적용 기준일'이라 의미가 다르다 — 둘 다 노출한다.)
    data = {
        "_meta": {"source": f"{used} — 조회 폼 POST 재현(uf_doInquiry 규약)",
                  "note": "공식 오픈API가 없어 조회 페이지를 파싱함. 실패 시 기존 값 유지. "
                          "seed=true 또는 collected_at 없음 = 예시값(자동 수집 전/실패) — "
                          "화면에서 실시간 값으로 표시하지 않는다."},
        "as_of": as_of,
        "collected_at": dt.date.today().isoformat(),
        "customer_burden_rate_pct": rate,
        "seed": False,
        "last_attempt_at": dt.date.today().isoformat(),
        "consecutive_failures": 0,
    }
    save_json_safe(OUT, data)
    print(f"[bond_rate] 고객부담률 {rate}% ({used}, {data['as_of']})")
    if diag.get("matched_header_row") is not None:
        print(f"[bond_rate] 매치 근거 — 헤더행: {diag['matched_header_row']} · "
              f"값행: {diag['matched_value_row']} · 열idx: {diag['matched_col']}")


if __name__ == "__main__":
    main()
