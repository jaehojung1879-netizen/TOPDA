/*
 * 톺다 — 세율·기준 단일 데이터 소스 (Single Source of Truth)
 * ------------------------------------------------------------------
 * 법령·세율·대출 규제 등 "자주 바뀌는 핵심 수치"를 한 곳에 모은 파일.
 * 계산기는 이 값을 참조하고, 갱신 시 이 파일만 고치면 됩니다.
 *
 * 갱신 절차
 *   1) 아래 값을 1차 출처(법령·고시)로 대조해 수정
 *   2) lastReviewed 날짜를 갱신
 *   3) changelog에 변경 내역 1줄 추가
 *
 * ⚠ consumed: true 로 표시된 항목은 현재 계산 로직이 직접 읽습니다.
 *   reference 항목은 각 계산기 코드에 같은 값이 있으며 점진적으로 이관 중입니다.
 */
(function () {
  'use strict';

  window.TOPDA_RATES = {
    // 사이트 전체 최종 검토일 (계산기 하단에 표기됨)
    lastReviewed: '2026-06-13',

    // 계산기별 주요 출처 (계산기 페이지 하단에 자동 표기)
    sources: {
      'acquisition-tax': '지방세법 제11·15조, 지방세특례제한법 제36조의3',
      'transfer-tax': '소득세법 제55·95·104조 (양도소득세)',
      'registration-cost': '인지세법 제3조, 주택도시기금 국민주택채권, 대한법무사협회 보수표',
      'total-cost-dashboard': '지방세법·소득세법·상속세및증여세법, 금융위 DSR·RTI 가이드',
      'dsr': '금융위원회·금융감독원 가계대출 관리방안 (DSR)',
      'brokerage-fee': '공인중개사법 시행규칙 [별표] 중개보수 상한요율',
      'loan-compare': '은행 원리금균등·원금균등 상환식',
      'default': '관련 법령·고시 (각 계산기 하단 출처 참고)',
    },

    // ── DSR (총부채원리금상환비율) 한도 ── consumed
    dsr: {
      tier1: 40, // 1금융권 한도(%)
      tier2: 50, // 2금융권 한도(%)
      creditAnnualizeYears: 5, // 신용대출 연환산 분모(년)
      effectiveFrom: '2022-07-01',
      source: '금융위·금감원 가계대출 관리방안',
    },

    // ── RTI (임대업이자상환비율) 승인 기준 ── consumed
    rti: {
      residential: 1.25, // 주택
      commercial: 1.5,   // 비주택
      source: '금융감독원 임대업 이자상환비율(RTI)',
    },

    // ── 국민주택채권 ── consumed (할인율 기본값)
    //   매입금액 = 시가표준액 × 매입률(주택도시기금법 시행령 별표) → 만원 단위 절상(5천원 미만 절사)
    //   매입률은 지역(특별시·광역시 / 그 밖의 지역)·자산유형(주택/토지)별로 다름 — 계산 로직에 반영됨
    //   본인부담금 = 채권 매입(액면)금액 × 할인율(고객부담률)
    bond: {
      discountDefault: 15, // 즉시매도 시 고객부담률(%) — 시장금리 따라 매일 변동(최근 15% 안팎)
      note: '당일 정확한 값은 은행 국민주택채권 포털 확인. 최근 15% 안팎. 매입금액은 만원 단위 절상.',
      roundUnit: 10000,     // 채권 매입금액 절상 단위(원)
      effectiveFrom: '2026-06',
      source: '주택도시기금 / 은행 국민주택채권 포털, 주택도시기금법 시행령 별표(매입률)',
    },

    // ── 대출 한도 규정 (주택담보대출·전세대출) ── consumed
    // ⚠ 정부 대책에 따라 자주 바뀝니다. 출처·시행일을 반드시 1차 자료로 대조하세요.
    loan: {
      effectiveFrom: '2026-06',
      source: '금융위 가계부채 관리방안(2025.6.27)·스트레스 DSR 3단계(2025.7)·각 보증기관 공시',
      // LTV(담보인정비율, %) — 지역×보유유형
      ltv: {
        nonRegulated: 70,       // 비규제 무주택·1주택
        nonRegulatedFirst: 80,  // 비규제 생애최초
        nonRegulatedMulti: 60,  // 비규제 다주택
        regulated: 50,          // 규제지역 무주택·처분조건부 1주택
        regulatedFirst: 70,     // 규제지역 생애최초(80→70 강화)
        regulatedStrong: 40,    // 신규 규제지역 강화 적용 사례
      },
      // 수도권·규제지역 주택구입 주담대 가격대별 한도(원)
      metroPriceCaps: [
        { upToEok: 15, cap: 600000000 },        // 15억 이하 → 6억
        { upToEok: 25, cap: 400000000 },        // 15~25억 → 4억
        { upToEok: Infinity, cap: 200000000 },  // 25억 초과 → 2억
      ],
      dsr: { tier1: 40, tier2: 50 }, // DSR 한도(%)
      // 스트레스 가산금리(%p) — DSR 한도 산정에만 가산(실제 상환금리 아님)
      stress: {
        metro: 1.5,        // 수도권(3단계)
        nonMetro: 0.75,    // 비수도권(한시)
        note: '2025.10.16~ 수도권·규제지역 주담대는 스트레스 3.0%p로 강화. 필요 시 직접 조정.',
      },
      // 전세자금대출 보증기관 비교
      //   한도 = min(
      //     보증금 × 보증비율,
      //     기관 최대한도,
      //     [HF만] 소득기준 한도 = 연소득 × incomeMultiple − 타행 신용대출 × creditDeductRatio
      //   )
      //   incomeCap: 부부합산 연소득 상한(원). null이면 소득 무관(SGI).
      //   ineligible 사유: 보증금 한도 초과 / 소득 한도 초과 / 산식 결과 0 이하
      jeonseAgencies: [
        { key: 'HF', name: '주택금융공사(HF)', ratio: 80, ratioYouth: 90, maxAmount: 400000000,
          depositCapMetro: 700000000, depositCapOther: 500000000, fee: '연 0.04~0.18%',
          incomeCap: 100000000, incomeCapYouth: 130000000,
          incomeMultiple: 4.5,        // 연소득 × 4.5 ≈ 소득기준 가용 한도(보증 가이드의 상한값 근사)
          creditDeductRatio: 0.25,    // 타행 신용대출 잔액의 25%를 차감
          note: '보증금×80% / 4억 / (소득×4.5 − 신용대출×0.25) 중 최소. 부부합산 1억 이하(청년·신혼 1.3억). 수도권·규제 1주택자 2억 한도.' },
        { key: 'HUG', name: '주택도시보증공사(HUG)', ratio: 80, ratioYouth: 90, maxAmount: 400000000,
          depositCapMetro: 700000000, depositCapOther: 500000000, fee: '연 0.111~0.211%',
          incomeCap: 100000000, incomeCapYouth: 130000000,
          incomeMultiple: null, creditDeductRatio: 0,   // 소득 기반 산식 없음(소득 자격만 본다)
          note: '보증금×80% / 4억 중 최소. 부부합산 1억 이하(청년·신혼 1.3억). 대출+반환보증 일괄(전세금안심대출).' },
        { key: 'SGI', name: 'SGI서울보증', ratio: 80, ratioYouth: 80, maxAmount: 500000000,
          depositCapMetro: Infinity, depositCapOther: Infinity, fee: '연 0.183~0.208%',
          incomeCap: null, incomeCapYouth: null,
          incomeMultiple: null, creditDeductRatio: 0,
          note: '보증금×80% / 5억 중 최소. 소득 제한 없음. 고액 전세 가능, 심사 빠른 편.' },
      ],
      jeonseNote: '전세대출은 보증부로 DSR 산정에서 원금이 제외됩니다(이자만 산입). 청년·신혼은 우대 비율(최대 90%)·소득 한도 완화 적용.',
    },

    // ── 아래는 reference: 각 계산기 코드에 동일 값 존재(점진 이관 대상) ──

    // 취득세 (주택, 지방세법) reference
    acquisitionTax: {
      base: { under6eok: 1.0, over9eok: 3.0 }, // 6억↓ 1%, 6~9억 누진, 9억↑ 3%
      heavy: { twoHomeRegulated: 8.0, threeHomeRegulated: 12.0, threeHomeNonReg: 8.0, fourPlus: 12.0 },
      nonHouse: 4.0, // 비주택 본세(%)
      firstHomeDeductMax: 2000000, // 생애최초 감면 한도(원)
      ruralTaxOver85: 0.2, // 85㎡ 초과 농특세(%)
      // 2026 한시: 지방 준공 후 미분양 아파트 — 전용 85㎡ 이하·취득가 6억 이하
      //   취득세 50% 감면 + 다주택자 취득세 중과에서 제외 (1년 한시)
      unsold2026Relief: {
        areaMaxSqm: 85,
        priceMax: 600000000,
        discountRatio: 0.50,
        excludeHeavySurcharge: true,
        validUntil: '2026-12-31',
        source: '지방세특례제한법(2026년 개정) — 지방 미분양 해소 한시 감면',
      },
      effectiveFrom: '2026-01-01',
      source: '지방세법 제11·15조, 지방세특례제한법 제36조의3 (2026 미분양 한시감면 반영)',
    },

    // 양도소득세 (소득세법) reference
    transferTax: {
      onlyHomeExemptCap: 1200000000, // 1세대1주택 비과세 한도(원)
      shortTermHouse: { under1y: 70, under2y: 60 }, // 단기 세율(%)
      shortTermNonHouse: { under1y: 50, under2y: 40 },
      basicDeduct: 2500000, // 기본공제(원)
      localTaxRate: 10, // 지방소득세(국세의 %)
      // 다주택 양도세 중과 한시 유예: 2년 이상 보유 시 2026-05-09까지 양도하면 중과 미적용
      multiHomeSurchargeWaiverUntil: '2026-05-09',
      multiHomeSurchargeWaiverMinHoldYears: 2,
      effectiveFrom: '2026-01-01',
      source: '소득세법 제55·95·104조 (다주택 중과 한시 유예 2026.5.9까지)',
    },

    // 인지세 (인지세법 제3조) reference — 구간별 정액(원)
    stampDuty: [
      { upTo: 10000000, amount: 0 },
      { upTo: 30000000, amount: 20000 },
      { upTo: 50000000, amount: 40000 },
      { upTo: 100000000, amount: 70000 },
      { upTo: 1000000000, amount: 150000 },
      { upTo: Infinity, amount: 350000 },
    ],

    // 상속·증여 공제 (상속세및증여세법) reference
    inheritGift: {
      lumpSumDeduct: 500000000, // 일괄공제(원)
      spouseMinDeduct: 500000000,
      giftDeduct: { spouse: 600000000, adult: 50000000, minor: 20000000, other: 10000000 },
      source: '상속세 및 증여세법',
    },

    // 변경 이력
    changelog: [
      { date: '2026-06-14', note: '국민주택채권 고객부담률 기본값 8.7%→15%로 갱신(최근 시장 수준 반영, 매일 변동·수정 가능). 전세대출 한도 계산기에 보증기관(HF/HUG/SGI) 선택 기능 추가(전체 비교 기본).' },
      { date: '2026-06-13', note: '국민주택채권 매입금액 만원 단위 절상 적용 + 지역(특별시·광역시/그 밖의 지역) 매입률 구분. 양도세 장기보유특별공제 표1 정정(연 2%·3년 6%~15년 30%).' },
      { date: '2026-06-04', note: '대출 한도 규정 블록 신설(LTV·가격대별 한도·스트레스 DSR·전세 보증기관 HF/HUG/SGI).' },
      { date: '2026-06-03', note: '취득세 계산기에 취득원인(상속·증여·신축)·일시적 2주택 반영. 생애최초 감면 근거를 제36조의3으로 정정.' },
      { date: '2026-06-02', note: '단일 데이터 파일 신설. 국민주택채권 할인율 기본값 8.7%로 갱신. DSR/RTI 임계값 분리.' },
    ],
  };
})();
