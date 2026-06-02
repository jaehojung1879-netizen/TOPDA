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
    lastReviewed: '2026-06-02',

    // 계산기별 주요 출처 (계산기 페이지 하단에 자동 표기)
    sources: {
      'acquisition-tax': '지방세법 제11·15조, 지방세특례제한법 제36조의2',
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
    bond: {
      discountDefault: 8.7, // 즉시매도 시 본인부담률(%) — 시장금리 따라 매일 변동
      note: '당일 고시는 은행·법무사 확인. 최근 8% 안팎.',
      effectiveFrom: '2026-06',
      source: '주택도시기금 / 은행 국민주택채권 포털',
    },

    // ── 아래는 reference: 각 계산기 코드에 동일 값 존재(점진 이관 대상) ──

    // 취득세 (주택, 지방세법) reference
    acquisitionTax: {
      base: { under6eok: 1.0, over9eok: 3.0 }, // 6억↓ 1%, 6~9억 누진, 9억↑ 3%
      heavy: { twoHomeRegulated: 8.0, threeHomeRegulated: 12.0, threeHomeNonReg: 8.0, fourPlus: 12.0 },
      nonHouse: 4.0, // 비주택 본세(%)
      firstHomeDeductMax: 2000000, // 생애최초 감면 한도(원)
      ruralTaxOver85: 0.2, // 85㎡ 초과 농특세(%)
      effectiveFrom: '2023-01-01',
      source: '지방세법 제11·15조, 지방세특례제한법 제36조의2',
    },

    // 양도소득세 (소득세법) reference
    transferTax: {
      onlyHomeExemptCap: 1200000000, // 1세대1주택 비과세 한도(원)
      shortTermHouse: { under1y: 70, under2y: 60 }, // 단기 세율(%)
      shortTermNonHouse: { under1y: 50, under2y: 40 },
      basicDeduct: 2500000, // 기본공제(원)
      localTaxRate: 10, // 지방소득세(국세의 %)
      effectiveFrom: '2024-01-01',
      source: '소득세법 제55·95·104조',
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
      { date: '2026-06-02', note: '단일 데이터 파일 신설. 국민주택채권 할인율 기본값 8.7%로 갱신. DSR/RTI 임계값 분리.' },
    ],
  };
})();
