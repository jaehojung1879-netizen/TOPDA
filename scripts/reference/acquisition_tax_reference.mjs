/*
 * 취득세 — 법령 기준 독립 Reference Formula
 * ===========================================================================
 * ⚠ 이 파일은 site/assets/app.js 의 calcAcquisitionTax 와 **코드를 공유하지 않는다**.
 *   지방세법 조문만 보고 다시 구현한 것이며, golden test 의 expected 값은
 *   production 함수가 아니라 여기서 나온다. 같은 버그를 공유하면 검증이 무의미하다.
 *
 * ⚠ 세율 상수는 법령 그 자체이므로 production 과 값이 같을 수밖에 없다.
 *   불가피한 중복이므로 아래에 조문 근거를 함께 적어 명시적으로 관리한다.
 *
 * ─ 근거 ────────────────────────────────────────────────────────────────────
 * 지방세법 제11조 제1항 제8호 (유상거래 주택 취득의 세율)
 *   가. 취득당시가액 6억원 이하                  … 1천분의 10 (1%)
 *   나. 6억원 초과 9억원 이하                    … 다음 계산식에 따른 세율
 *          세율 = (해당 주택의 취득당시가액 × 2 / 3억원 − 3) × 1/100
 *        이 경우 **소수점 이하 다섯째 자리에서 반올림하여 소수점 넷째 자리까지** 계산한다.
 *   다. 9억원 초과                               … 1천분의 30 (3%)
 * 지방세법 제11조 제1항 제1호  무상취득(상속) 1천분의 28 / 그 밖의 무상취득 1천분의 35
 * 지방세법 제11조 제1항 제3호  원시취득 1천분의 28
 * 지방세법 제13조의2           다주택·법인 주택 취득 중과세율 (8% / 12%)
 * 지방세법 제15조 제1항        세율의 특례 — 상속 1가구1주택 등 (표준세율 − 중과기준세율 2%)
 * 지방세법 제151조             지방교육세
 * 농어촌특별세법 제5조·제4조   농어촌특별세(85㎡ 이하 주택 비과세)
 * 지방세특례제한법 제36조의3   생애최초 주택 취득 감면
 * 지방세특례제한법 제36조의5   출산·양육 가구 주택 취득 감면
 * ===========================================================================
 */

/**
 * 지방세법 제11조①8호 나목의 계산식을 조문 그대로 구현한다.
 * 반환값은 **세율(소수)** 이며 소수점 넷째 자리까지 반올림된 값이다.
 */
export function paidTransferHouseRate(acquisitionPrice) {
  if (acquisitionPrice <= 600000000) return 0.01;                 // 가목
  if (acquisitionPrice > 900000000) return 0.03;                  // 다목
  // 나목: (가액 × 2 / 3억원 − 3) × 1/100, 소수 다섯째 자리에서 반올림 → 넷째 자리
  const raw = ((acquisitionPrice * 2) / 300000000 - 3) / 100;
  return Math.round(raw * 10000) / 10000;
}

/**
 * 유상취득 주택의 본세율(중과 포함) — 지방세법 제11조·제13조의2.
 * @param {{price:number, homes:number, regulated:boolean}} o
 */
export function paidTransferRate({ price, homes, regulated }) {
  if (homes <= 1) return paidTransferHouseRate(price);
  if (homes === 2) return regulated ? 0.08 : paidTransferHouseRate(price);
  if (homes === 3) return regulated ? 0.12 : 0.08;
  return 0.12;
}

/** 중과세율(8%·12%) 적용 여부 — 농특세·교육세 산정 방식이 갈린다. */
export function isHeavyRate(rate) {
  return rate >= 0.08 - 1e-12;
}

/**
 * 농어촌특별세 (농어촌특별세법 제5조 제1항 [별표] 제6호·제4조 제11호)
 *  · 전용면적 85㎡ 이하 주택은 비과세
 *  · 표준세율 적용분: 과세표준 × 2% × 10% = 0.2%
 *  · 8% 중과분: 0.6% / 12% 중과분: 1.0%
 */
export function ruralSpecialTax({ taxBase, areaOver85, rate }) {
  if (!areaOver85) return 0;
  if (rate >= 0.12 - 1e-12) return taxBase * 0.010;
  if (rate >= 0.08 - 1e-12) return taxBase * 0.006;
  return taxBase * 0.002;
}

/**
 * 지방교육세 (지방세법 제151조 제1항 제1호)
 *  · 주택 유상거래(제11조①8호): 해당 세율 × 50% 로 산출한 취득세액의 20% = 취득세액의 10%
 *  · 중과세율(8%·12%) 적용분: 표준세율 4% 기준 → (4% − 2%) × 20% = 0.4% 고정
 *  · 그 밖의 취득(상속·증여·원시취득): (표준세율 − 2%) × 20%
 *  · 제15조①(상속 1가구1주택 등 세율특례) 적용분: 과세 제외
 */
export function localEducationTax({ taxBase, rate, isPaidTransfer, heavy }) {
  if (heavy) return taxBase * 0.004;
  if (isPaidTransfer) return taxBase * rate * 0.10;
  return taxBase * Math.max(0, rate - 0.02) * 0.20;
}

/**
 * 표준적인 주택 유상취득 1건의 총 취득세 (감면 없음).
 * golden test 의 expected 값을 만드는 입구.
 */
export function referenceAcquisitionTotal({ price, homes = 1, regulated = false, areaOver85 = false }) {
  const rate = paidTransferRate({ price, homes, regulated });
  const heavy = isHeavyRate(rate) && homes >= 2;
  const acquisition = price * rate;
  const rural = ruralSpecialTax({ taxBase: price, areaOver85, rate });
  const edu = localEducationTax({ taxBase: price, rate, isPaidTransfer: true, heavy });
  return { rate, acquisition, ruralTax: rural, localEduTax: edu, total: acquisition + rural + edu };
}

/**
 * 무상취득(증여)·상속·원시취득의 총 취득세.
 * @param {'gift'|'giftHeavy'|'inherit'|'inheritNoHome'|'original'} kind
 */
export function referenceNonPaidTotal({ kind, taxBase, areaOver85 = false }) {
  const RATE = {
    gift: 0.035,          // 제11조①2호 그 밖의 무상취득
    giftHeavy: 0.12,      // 제13조의2② 조정대상지역 시가표준액 3억 이상 증여
    inherit: 0.028,       // 제11조①1호 나목 상속
    inheritNoHome: 0.008, // 제15조① 상속 1가구1주택 특례 (2.8% − 2%)
    original: 0.028,      // 제11조①3호 원시취득
  };
  const rate = RATE[kind];
  if (rate == null) throw new Error('알 수 없는 취득 유형: ' + kind);
  const heavy = kind === 'giftHeavy';
  const acquisition = taxBase * rate;
  const rural = ruralSpecialTax({ taxBase, areaOver85, rate });
  // 제15조① 특례분(상속 1가구1주택 0.8%)은 지방교육세 과세 제외 → max(0, rate−2%) 가 0 이 되어 자연히 0.
  const edu = localEducationTax({ taxBase, rate, isPaidTransfer: false, heavy });
  return { rate, acquisition, ruralTax: rural, localEduTax: edu, total: acquisition + rural + edu };
}

/**
 * 생애최초 감면 (지방세특례제한법 제36조의3)
 *  · 취득당시가액 12억원 이하, 취득 후 1주택, 유상취득
 *  · 감면 한도 200만원 (소형 비아파트·인구감소지역 주택은 300만원)
 * 출산·양육 감면 (같은 법 제36조의5)
 *  · 12억원 이하 1가구 1주택, 한도 500만원
 *  · 두 감면은 중복 적용되지 않고 납세자에게 유리한 하나만 적용된다.
 */
export function reliefCap({ price, eligible, firstHome, firstHomeSmallHouse, childbirth }) {
  if (!eligible || price > 1200000000) return 0;
  const fh = firstHome ? (firstHomeSmallHouse ? 3000000 : 2000000) : 0;
  const cb = childbirth ? 5000000 : 0;
  return Math.max(fh, cb);
}
