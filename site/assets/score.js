/*
 * 톺다 — 맞춤 내집 찾기 점수 엔진 (score.js)
 * ------------------------------------------------------------------
 * 아파트 단지 데이터(apartments.json)와 사용자 조건을 받아
 *  1) 입력한 조건으로 필터링 (입력하지 않은 조건은 무시 → 부분 입력 허용)
 *  2) 단지별 종합점수(0~100) 계산
 *  3) 점수 내림차순 정렬 + 추천 이유 생성
 * 브라우저(window.TopdaScore)와 Node(module.exports) 양쪽에서 쓸 수 있습니다.
 *
 * 종합점수 가중치 (요구사항):
 *   예산 적합도 25 · 역세권 20 · 초등학교 접근성 20 · 실거래 안정성 15 · 단지규모 10 · 연식 10
 * 입력이 없어 계산 불가한 항목(예: 예산 미입력)은 가중치에서 제외하고 나머지를 재정규화합니다.
 */
(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  if (root) root.TopdaScore = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 가격 단위: 만원 (예: 195000 = 19.5억). 예산 입력은 억 단위로 받아 만원으로 변환.
  // 가중치 합 100. liquidity(거래 활성도) 5% 추가, 다른 항목은 비례 축소.
  const WEIGHTS = { appreciation: 23, subway: 19, school: 19, stability: 14, scale: 10, age: 10, liquidity: 5 };

  // 전용면적(㎡) → 평형 밴드
  const AREA_BANDS = [
    { key: 'small', label: '소형(~60㎡)', min: 0, max: 60 },
    { key: 'medium-small', label: '국민평형(60~85㎡)', min: 60, max: 85 },
    { key: 'medium', label: '중형(85~102㎡)', min: 85, max: 102 },
    { key: 'large', label: '대형(102㎡~)', min: 102, max: Infinity },
  ];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const nowYear = () => new Date().getFullYear();

  function bandOf(areaM2) {
    const b = AREA_BANDS.find((x) => areaM2 >= x.min && areaM2 < x.max);
    return b ? b.key : 'medium-small';
  }

  // ── 개별 항목 점수 (0~100). 데이터가 없으면 null → 가중치에서 제외 ──

  // 역세권: 도보 거리. 300m 이하 만점, 1.5km 이상 0점
  function scoreSubway(distM) {
    if (distM == null) return null;
    if (distM <= 300) return 100;
    if (distM >= 1500) return 0;
    return clamp((1500 - distM) / 1200 * 100, 0, 100);
  }

  // 초등학교 접근성: 150m 이하(초품아) 만점, 1.2km 이상 0점
  function scoreSchool(distM) {
    if (distM == null) return null;
    if (distM <= 150) return 100;
    if (distM >= 1200) return 0;
    return clamp((1200 - distM) / 1050 * 100, 0, 100);
  }

  // 단지규모: 2,000세대 이상 만점, 300세대 이하 20점
  function scoreScale(households) {
    if (!households) return null;
    if (households >= 2000) return 100;
    if (households <= 300) return 20;
    return clamp(20 + (households - 300) / 1700 * 80, 20, 100);
  }

  // 연식: 준공 2년 이내 만점, 35년 이상 10점 (신축일수록 가점)
  function scoreAge(builtYear, y) {
    if (!builtYear) return null;
    const age = (y || nowYear()) - builtYear;
    if (age <= 2) return 100;
    if (age >= 35) return 10;
    return clamp(100 - (age - 2) / 33 * 90, 10, 100);
  }

  // 최근 실거래 안정성: 최근 실거래가의 변동계수(표준편차/평균)가 낮을수록 안정적.
  // 거래 표본이 2건 미만이면 판단 불가 → 중립(60).
  function scoreStability(history) {
    if (!Array.isArray(history) || history.length < 2) return 60;
    const mean = history.reduce((a, b) => a + b, 0) / history.length;
    if (mean <= 0) return 60;
    const variance = history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length;
    const cv = Math.sqrt(variance) / mean; // 변동계수
    let s = 100 - cv * 600; // cv 0→100, 0.05→70, 0.13→22
    if (history.length < 3) s = (s + 60) / 2; // 표본 적으면 중립 쪽으로 보정
    return clamp(s, 20, 100);
  }

  // 가격 모멘텀: 최근 실거래 추세(price_history). 선형 회귀 기울기를 이용해
  // 단순 첫/끝점 비교보다 노이즈에 덜 휘둘리도록 한다. 표본 부족 시 null.
  function scoreMomentum(history) {
    if (!Array.isArray(history) || history.length < 2) return null;
    const valid = history.filter((x) => typeof x === 'number' && x > 0);
    if (valid.length < 2) return null;
    const n = valid.length;
    const mean = valid.reduce((a, b) => a + b, 0) / n;
    if (mean <= 0) return null;
    // 선형 회귀: x = 0,1,...,n-1, y = price
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += valid[i]; sxx += i * i; sxy += i * valid[i]; }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    // 월 슬로프 → 연환산 비율 (× 12 / 평균)
    const annual = (slope * 12) / mean;
    let s = clamp(50 + annual * 250, 0, 100); // +20%/yr→100, +10%→75, 0→50, -10%→25
    if (n < 4) s = (s + 50) / 2; // 표본 2~3개월이면 중립 쪽으로 보정(단발 거래에 과민 반응 방지)
    return s;
  }

  // 거래 활성도(유동성): 단지에 최근 거래가 많을수록(=시장 활성) 가점.
  // recent_tx_count: 최근 6개월 거래 건수 (외부에서 주입), 없으면 price_history 표본수로 근사.
  function scoreLiquidity(apt) {
    let n = apt.recent_tx_count;
    if (n == null && Array.isArray(apt.price_history)) n = apt.price_history.length;
    if (n == null) return null;
    // 0건 30점, 5건 70점, 15건↑ 100점
    return clamp(30 + (n / 15) * 70, 30, 100);
  }

  // 예산 적합도(가격 근접): 입력 예산에 가까운 가격일수록 높은 점수.
  //  - 예산 초과 평형은 필터에서 이미 제외됨 → 여기선 예산 이하 중 '가장 가까운' 가격을 본다.
  //  - 너무 싼 단지는 점수가 낮아져 예산대에 맞는 단지가 우선 노출된다.
  function scoreFit(price, budgetManwon) {
    if (price == null || !budgetManwon) return null;
    const ratio = clamp(price / budgetManwon, 0, 1); // 예산 대비 비율 (≤1)
    // 0.9↑ → 100, 0.5 → 약 56, 0.3 → 25
    return clamp(25 + (ratio - 0.3) / (0.9 - 0.3) * 75, 25, 100);
  }

  // 예산 이하 평형 중 예산에 가장 가까운(=가장 비싼) 가격. 없으면 null.
  function maxWithinBudget(units, budgetManwon) {
    if (!budgetManwon || !units || !units.length) return null;
    const within = units.filter((u) => u.recent_price <= budgetManwon);
    if (!within.length) return null;
    return Math.max.apply(null, within.map((u) => u.recent_price));
  }

  // 상승기대: 가격 모멘텀 중심 + 전세가율(낮을수록 상급지 경향) 보정.
  function scoreAppreciation(apt) {
    const mom = scoreMomentum(apt.price_history);
    const jr = apt.jeonse_ratio;
    const jrScore = (jr == null) ? null : clamp(100 - (jr - 45) / (70 - 45) * 100, 0, 100); // 45%→100, 70%→0
    if (mom == null && jrScore == null) return null;
    if (jrScore == null) return mom;
    if (mom == null) return jrScore;
    return 0.65 * mom + 0.35 * jrScore;
  }

  // area_type 밴드에 해당하는 평형들 (지정 없으면 전체)
  function candidateUnits(apt, areaType) {
    const units = apt.units || [];
    if (!areaType || areaType === 'all') return units.slice();
    return units.filter((u) => bandOf(u.area_m2) === areaType);
  }

  // 대표 평형: 예산이 있으면 예산 이내 평형 중, 국민평형(84㎡)에 가장 가까운 것.
  function representativeUnit(units, budgetManwon) {
    if (!units.length) return null;
    let pool = units;
    if (budgetManwon) {
      const within = units.filter((u) => u.recent_price <= budgetManwon);
      if (within.length) pool = within;
    }
    return pool.slice().sort((a, b) =>
      Math.abs(a.area_m2 - 84) - Math.abs(b.area_m2 - 84) || a.recent_price - b.recent_price
    )[0];
  }

  function walkMin(distM) { return Math.max(1, Math.round(distM / 80)); } // ≈80m/분

  const FILTER_LABELS = {
    budget_max: '예산', region: '지역', area_type: '평형', max_age_years: '연식',
    subway_distance_max: '역거리', elementary_distance_max: '초등학교 거리', min_households: '세대수',
    commute: '통근시간', parking_min: '주차', jeonse_ratio_max: '전세가율',
  };

  // ── 통과하지 못한 필터 목록 (입력한 조건만 검사) ──
  // 정책: 단지에 해당 데이터가 '없는' 경우는 fail로 보지 않는다(관대 모드).
  // 실거래 자료에만 등장하는 단지(좌표/세대수/역/학교 정보 없음)도 검색·점수 산정에서
  // 자동으로 누락되지 않고 결과에 노출된다.
  function failedFilters(apt, f, y) {
    const fails = [];
    if (f.region && f.region !== 'all') {
      if (!(apt.region_key === f.region || (apt.region || '').includes(f.region))) fails.push('region');
    }
    const cand = candidateUnits(apt, f.area_type);
    if (f.area_type && f.area_type !== 'all' && cand.length === 0) fails.push('area_type');
    if (f.budget_max) {
      const prices = cand.length ? cand : (apt.units || []);
      if (prices.length) {
        const minP = Math.min.apply(null, prices.map((u) => u.recent_price));
        if (!(minP <= f.budget_max)) fails.push('budget_max');
      }
    }
    // 연식/거리/세대수/통근/주차/전세가율: 데이터가 '있는데' 조건 미달인 경우만 fail.
    // 데이터가 비어 있으면 해당 단지는 그 조건을 무시하고 결과에 포함시킨다.
    if (f.max_age_years && apt.built_year && (y - apt.built_year) > f.max_age_years) fails.push('max_age_years');
    if (f.subway_distance_max && apt.subway && apt.subway.distance_m != null && apt.subway.distance_m > f.subway_distance_max) fails.push('subway_distance_max');
    if (f.elementary_distance_max && apt.elementary && apt.elementary.distance_m != null && apt.elementary.distance_m > f.elementary_distance_max) fails.push('elementary_distance_max');
    if (f.min_households && apt.households && apt.households < f.min_households) fails.push('min_households');
    if (f.commute_hub && f.commute_max) {
      const c = apt.commute && apt.commute[f.commute_hub];
      if (c != null && c > f.commute_max) fails.push('commute');
    }
    if (f.parking_min && apt.parking_per_household != null && apt.parking_per_household < f.parking_min) fails.push('parking_min');
    if (f.jeonse_ratio_max && apt.jeonse_ratio != null && apt.jeonse_ratio > f.jeonse_ratio_max) fails.push('jeonse_ratio_max');
    return fails;
  }

  // ── 필터 통과 여부 (입력한 조건만 검사) ──
  function passesFilters(apt, f, y) {
    return failedFilters(apt, f, y).length === 0;
  }

  // ── 단지 평가: 종합점수 + 항목점수 + 추천 이유 ──
  function evaluate(apt, f, y) {
    y = y || nowYear();
    const cand = candidateUnits(apt, f.area_type);
    const rep = representativeUnit(cand.length ? cand : (apt.units || []), f.budget_max);
    const price = rep ? rep.recent_price : null;

    const sub = {
      appreciation: scoreAppreciation(apt),
      subway: apt.subway ? scoreSubway(apt.subway.distance_m) : null,
      school: apt.elementary ? scoreSchool(apt.elementary.distance_m) : null,
      stability: scoreStability(apt.price_history),
      scale: scoreScale(apt.households),
      age: scoreAge(apt.built_year, y),
      liquidity: scoreLiquidity(apt),
    };
    // 예산을 입력한 경우에만 '예산 적합도(가격 근접)'를 점수에 포함한다.
    const weights = Object.assign({}, WEIGHTS);
    if (f.budget_max) {
      const near = maxWithinBudget(apt.units || [], f.budget_max);
      sub.fit = scoreFit(near, f.budget_max);
      weights.fit = 25; // 예산 입력 시 가격 근접도를 비중 높게 반영
    }

    // 사용 가능한 항목만으로 가중 평균 (재정규화)
    let wsum = 0, ssum = 0;
    Object.keys(weights).forEach((k) => {
      if (sub[k] == null) return;
      wsum += weights[k];
      ssum += weights[k] * sub[k];
    });
    const total = wsum ? ssum / wsum : 0;

    // 추천 이유: 강점 위주 (점수 높은 항목 우선) 최대 3개
    const reasons = [];
    if (sub.subway != null && apt.subway.distance_m <= 600)
      reasons.push({ t: `🚇 ${apt.subway.station} 도보 ${walkMin(apt.subway.distance_m)}분`, s: sub.subway });
    if (sub.school != null && apt.elementary.distance_m <= 600)
      reasons.push({ t: `🎒 ${apt.elementary.name} ${apt.elementary.distance_m}m${apt.elementary.in_zone ? ' 배정' : ''}`, s: sub.school });
    if (apt.households >= 1500)
      reasons.push({ t: `🏙 ${apt.households.toLocaleString()}세대 대단지`, s: sub.scale });
    if ((y - apt.built_year) <= 7)
      reasons.push({ t: `🏗 준공 ${apt.built_year}년 신축급`, s: sub.age });
    if (scoreMomentum(apt.price_history) >= 68)
      reasons.push({ t: `📈 최근 실거래 상승세`, s: sub.appreciation || 70 });
    if (sub.stability >= 80)
      reasons.push({ t: `🛡 실거래가 안정적`, s: sub.stability });
    if (f.commute_hub && apt.commute && apt.commute[f.commute_hub] != null && apt.commute[f.commute_hub] <= 30)
      reasons.push({ t: `🏢 ${f.commute_hub} ${apt.commute[f.commute_hub]}분`, s: 100 - apt.commute[f.commute_hub] });
    if (apt.parking_per_household != null && apt.parking_per_household >= 1.3)
      reasons.push({ t: `🅿 세대당 ${apt.parking_per_household.toFixed(2)}대`, s: 80 });

    reasons.sort((a, b) => b.s - a.s);
    let reasonTexts = reasons.slice(0, 3).map((r) => r.t);
    if (!reasonTexts.length) {
      // 강점이 뚜렷하지 않으면 최고 점수 항목으로 한 줄
      const labels = { appreciation: '상승기대', subway: '교통', school: '학군', stability: '실거래 안정', scale: '단지 규모', age: '연식' };
      const best = Object.keys(sub).filter((k) => sub[k] != null).sort((a, b) => sub[b] - sub[a])[0];
      if (best) reasonTexts = [`${labels[best]} 항목이 가장 우수`];
    }

    return {
      apt, rep, price,
      total: Math.round(total * 10) / 10,
      sub, reasons: reasonTexts,
      ageYears: y - apt.built_year,
    };
  }

  // ── 검색: 필터 → 평가 → 정렬 ──
  function search(apartments, filters, y) {
    y = y || nowYear();
    const f = filters || {};
    return (apartments || [])
      .filter((apt) => passesFilters(apt, f, y))
      .map((apt) => evaluate(apt, f, y))
      .sort((a, b) => b.total - a.total);
  }

  // 정확히 일치하는 단지가 없을 때: 조건을 1~2개 완화하면 맞는 "근접 추천"
  function nearMatches(apartments, filters, y, maxFails) {
    y = y || nowYear();
    const f = filters || {};
    maxFails = maxFails || 2;
    return (apartments || [])
      .map((apt) => ({ apt, fails: failedFilters(apt, f, y) }))
      .filter((x) => x.fails.length > 0 && x.fails.length <= maxFails)
      .map((x) => {
        const r = evaluate(x.apt, f, y);
        r.relaxed = x.fails.map((k) => FILTER_LABELS[k] || k);
        return r;
      })
      .sort((a, b) => b.total - a.total);
  }

  // 표시용 포맷
  function formatEok(manwon) {
    if (manwon == null) return '—';
    const eok = manwon / 10000;
    return (Number.isInteger(eok) ? eok : eok.toFixed(1)) + '억';
  }

  return {
    WEIGHTS, AREA_BANDS, FILTER_LABELS, bandOf, walkMin,
    scoreSubway, scoreSchool, scoreScale, scoreAge, scoreStability, scoreAppreciation, scoreMomentum,
    scoreLiquidity, scoreFit, maxWithinBudget,
    candidateUnits, representativeUnit, failedFilters, passesFilters,
    evaluate, search, nearMatches, formatEok,
  };
});
