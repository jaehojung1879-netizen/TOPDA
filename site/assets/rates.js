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
    lastReviewed: '2026-08-02',

    // 계산기별 주요 출처 (계산기 페이지 하단에 자동 표기)
    sources: {
      'acquisition-tax': '지방세법 제11·15조, 지방세특례제한법 제36조의3·제36조의5',
      'transfer-tax': '소득세법 제55·95·97조의2·제104조 (양도소득세)',
      'auction-bid': '민사집행법, 지방세법 제11·15조 (낙찰가 기준 취득세 공통 산정)',
      'jeonse-monthly': '주택임대차보호법 제7조의2, 같은 법 시행령 제9조 (전월세전환율 상한)',
      'housing-subscription': '주택공급에 관한 규칙 제28조 및 [별표1] (청약가점제)',
      'registration-cost': '인지세법 제3조, 등기사항증명서 등 수수료규칙 제5조의2, 주택도시기금 국민주택채권, 대한법무사협회 보수표·보수기준(2024.9.12 시행)',
      'total-cost-dashboard': '지방세법·소득세법·상속세및증여세법, 금융위 DSR·RTI 가이드',
      'dsr': '금융위원회·금융감독원 가계대출 관리방안 (DSR)',
      'loan-limit': '금융위 「가계부채 관리 강화 방안」(2025.6.27)·「대출수요 관리 방안」(2025.10.15, 10.16 시행)·「2026년도 가계부채 관리방안」(2026.4.1)·스트레스 DSR 3단계',
      'brokerage-fee': '공인중개사법 시행규칙 [별표] 중개보수 상한요율 + 시·도 조례',
      'loan-compare': '은행 원리금균등·원금균등 상환식',
      'default': '관련 법령·고시 (각 계산기 하단 출처 참고)',
    },

    // ── DSR (총부채원리금상환비율) 한도 ── consumed
    dsr: {
      tier1: 40, // 1금융권 한도(%)
      tier2: 50, // 2금융권 한도(%)
      creditAnnualizeYears: 5, // 신용대출 연환산 분모(년)

      // ── 적용 대상 요건 ──
      //  ⚠ DSR은 모든 대출에 항상 걸리는 규제가 아니다. 계산기가 이 요건을 밝히지 않으면
      //    사용자는 "왜 내 은행 한도와 다른가"를 알 방법이 없다.
      //    계산 자체는 **항상 DSR을 적용**한다(보수적). 요건에 해당하지 않으면 실제 한도는
      //    이 결과보다 **높게** 나올 수 있고, 그 방향의 오차는 사용자에게 손해가 아니다.
      applicability: {
        // 차주단위 DSR은 전 금융권 총 대출액이 이 금액을 넘을 때 적용된다.
        totalDebtThreshold: 100000000,
        alwaysAppliedInCalculator: true,
        // DSR 산정에서 아예 빠지는 대출 (소득 외 상환재원 인정 · 정책적 필요)
        excludedFromDsr: [
          '전세자금대출 (보증부는 원금 제외·이자만 산입)',
          '중도금대출(집단대출)·재건축 이주비대출 — 잔금대출로 전환되면 그때부터 산입',
          '예·적금 담보대출, 보험계약대출(약관대출)',
          '유가증권(주식)담보대출 — 담보가치가 확실해 원리금 상환금액에서 제외',
          '서민금융상품, 정부·지자체 협약대출',
          '자연재해 지역 등 긴급대출, 300만원 이하 소액 신용대출',
        ],
        note: '전 금융권 총 대출액이 1억원 이하이면 차주단위 DSR이 적용되지 않습니다. 이 계산기는 보수적으로 항상 DSR을 적용하므로, 요건에 해당하지 않으면 실제 한도는 더 높을 수 있습니다.',
        effectiveFrom: '2022-07-01',
        reviewedAt: '2026-08-02',
        jurisdiction: 'KR',
        confidence: 'verified',
        source: '금융위 가계부채 관리방안 — 차주단위 DSR 적용 대상(총 대출액 1억원 초과) 및 DSR 산정 제외 대출',
      },

      effectiveFrom: '2022-07-01',
      reviewedAt: '2026-08-02',
      jurisdiction: 'KR',
      confidence: 'verified',
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
    //
    // ⚠ 고객부담률(할인율)에는 "공식 기본값"이 없다. 시장금리에 따라 매일 바뀌는 시세다.
    //   따라서 아래 값은 **예시값(example)**이며, 실시간 수집(bond_rate.json)이 성공했을
    //   때에만 '실시간 조회값'으로 표기해야 한다. seed·수집실패 상태의 값을 실시간 값처럼
    //   보여주면 사용자가 확인해야 할 것을 확인하지 않고 지나간다.
    bond: {
      exampleDiscountPct: 15,   // 화면 초기값으로만 쓰는 예시값 (실시간 값 아님)
      exampleAsOf: '2026-06',   // 이 예시값이 시장 수준과 비슷했던 시점
      isExample: true,          // 실시간 수집 성공 시 false로 대체됨(런타임 판정)
      stalenessWarnDays: 7,     // 마지막 정상 수집일이 이만큼 지나면 직접 입력을 권한다
      note: '고객부담률(할인율)은 시장금리에 따라 매일 바뀝니다. 잔금일 당일 값을 은행 국민주택채권 포털에서 확인해 직접 입력하세요.',
      roundUnit: 10000,     // 채권 매입금액 절상 단위(원)
      effectiveFrom: '2026-06',
      reviewedAt: '2026-08-02',
      jurisdiction: 'KR',
      confidence: 'market-rate', // 법정값 아님 — 시세
      source: '주택도시기금 / 은행 국민주택채권 포털, 주택도시기금법 시행령 별표(매입률)',
    },

    // ── 등기 부대비용 (등기신청 수수료 · 법무사 보수) ── consumed
    //  ⚠ 법무사 "기본보수"와 "대행수수료·실비"는 전혀 다른 항목이다. 협회 보수표는
    //    기본보수의 **상한** 산정방법만 정한 것이고, 실제 청구서에는 위임한 부대업무의
    //    대행수수료·일당·교통비·부가세가 따로 붙는다. 섞어서 하나의 "법무사 보수 추정"으로
    //    보여주면 실제 청구액보다 크게 낮은 값이 나온다.
    registration: {
      // 등기신청 수수료 (등기사항증명서 등 수수료규칙 제5조의2, 2025.8.1 시행)
      //  소유권이전등기 기준 · 부동산 1개마다
      //  ⚠ 전자신청(인터넷등기소)은 금액을 1차 출처로 확인하지 못해 선택지에서 뺐다.
      //    확인 안 된 12,000원을 넣어봐야 e-Form과 3,000원 차이라 총액에 거의 영향이 없는데,
      //    "확인 못 한 값"을 화면에 띄우는 비용만 남는다. 보수적으로 방문(18,000원)을
      //    기본값으로 두고, 전자신청 이용자는 인터넷등기소 고지 금액으로 차액만 빼면 된다.
      filingFee: {
        methods: [
          { key: 'visit',  label: '방문(서면) 신청', amount: 18000, confidence: 'verified' },
          { key: 'eform',  label: '전자표준양식(e-Form)', amount: 15000, confidence: 'verified' },
        ],
        omittedNote: '전자신청(인터넷등기소)은 위 두 방식보다 수수료가 낮지만, 2025.8.1 인상 후 금액을 1차 출처로 확인하지 못해 선택지에서 제외했습니다. 전자신청을 이용하면 실제 부담은 위 금액보다 조금 더 낮습니다.',
        perExtraProperty: 0, // 부동산 1개마다 부과 — 개수는 UI에서 곱한다
        effectiveFrom: '2025-08-01',
        reviewedAt: '2026-08-02',
        jurisdiction: 'KR',
        confidence: 'verified',
        source: '등기사항증명서 등 수수료규칙 제5조의2 (대법원규칙 제3222호, 2025.8.1 시행)',
      },

      // 법무사 **기본보수 상한** (대한법무사협회 보수표, 2024.9.12 시행)
      //  누진 구조: 구간 하한까지의 누적 기초금액 + 그 구간 초과액 × 요율
      //  ⚠ 10억 초과 금액에 계속 0.05%를 적용하면 20억·200억 초과 구간이 통째로 빠진다.
      scrivenerBaseFee: {
        brackets: [
          { upTo: 50000000,     base: 210000,  rate: 0,       from: 0,           confidence: 'verified' },
          { upTo: 100000000,    base: 210000,  rate: 0.0010,  from: 50000000,    confidence: 'verified' },
          { upTo: 300000000,    base: 260000,  rate: 0.0009,  from: 100000000,   confidence: 'verified' },
          { upTo: 500000000,    base: 440000,  rate: 0.0008,  from: 300000000,   confidence: 'verified' },
          { upTo: 1000000000,   base: 600000,  rate: 0.0007,  from: 500000000,   confidence: 'verified' },
          { upTo: 2000000000,   base: 950000,  rate: 0.0005,  from: 1000000000,  confidence: 'verified' },
          { upTo: 20000000000,  base: 1450000, rate: 0.0003,  from: 2000000000,  confidence: 'needs-verification' },
          { upTo: Infinity,     base: 6850000, rate: 0.0001,  from: 20000000000, confidence: 'needs-verification' },
        ],
        roundUnit: 1000,           // 원 단위 절사 기준
        extraPropertyAdd: 20000,   // 1건의 신청서로 여러 부동산 → 초과 1개마다 가산
        // 난이도·복잡도에 따라 협의로 최대 100%까지 가산될 수 있다(가산보수).
        maxComplexitySurchargeRatio: 1.0,
        unverifiedNote: '20억원 초과 구간의 요율은 협회 보수표 원문을 아직 대조하지 못한 잠정값입니다. 해당 금액대는 반드시 견적서로 확인하세요.',
        effectiveFrom: '2024-09-12',
        reviewedAt: '2026-08-02',
        jurisdiction: 'KR',
        confidence: 'partial', // 20억 이하 구간 검증, 초과 구간 미검증
        source: '대한법무사협회 법무사보수표 (2024.9.12 개정·시행) — 기본보수 상한 산정방법',
      },

      // 대행수수료(기타 보수) — 실제로 **위임한 업무만** 붙는다.
      //  법무사보수기준상 정액이 정해진 항목과, 사무소별로 달라 범위로만 제시할 항목을 구분한다.
      agencyFees: [
        { key: 'acqTaxFiling', label: '취득세·등록면허세 신고·납부 대행', amount: 50000,
          confidence: 'verified', source: '대한법무사협회 법무사보수기준 (기타 보수)' },
        { key: 'bondAgency', label: '국민주택채권 매입·즉시매도 대행', amount: 40000,
          confidence: 'verified', source: '대한법무사협회 법무사보수기준 (기타 보수)' },
        { key: 'tradeReport', label: '부동산 거래신고 대행', amountMin: 30000, amountMax: 100000,
          confidence: 'estimate',
          note: '거래신고 대행료는 1차 출처로 정액을 확인하지 못했습니다. 사무소별 견적 범위로 표시합니다.' },
      ],
      // 일당·교통비 (법무사보수기준)
      fieldwork: {
        dayAllowanceUnder4h: 80000,
        dayAllowanceOver4h: 160000,
        localTransportMax: 80000,
        confidence: 'verified',
        note: '출장이 있을 때만 발생합니다. 교통비는 1등급 여객운임 실비(현지교통비는 8만원까지).',
        source: '대한법무사협회 법무사보수기준 — 일당·여비',
      },
      vatRate: 0.10,
      vatNote: '부가가치세는 법무사 보수(기본보수 + 대행수수료 + 일당·여비)를 합한 금액에 붙습니다. 인지세·등기신청수수료·채권 본인부담금은 세금·실비라 부가세 대상이 아닙니다.',
      // 시가표준액 미입력 시 추정 비율 — 법정값이 아니다.
      stdValueEstimateRatio: 0.7,
      stdValueEstimateNote: '시가표준액을 입력하지 않아 「매매가 × 70%」로 추정했습니다. 이 70%는 법령에 근거한 값이 아니라 단순 추정치이며, 실제 공시가격과 다르면 채권 매입액이 달라집니다.',
      effectiveFrom: '2025-08-01',
      reviewedAt: '2026-08-02',
      jurisdiction: 'KR',
      confidence: 'partial',
      source: '등기사항증명서 등 수수료규칙, 대한법무사협회 보수표·보수기준(2024.9.12 시행)',
    },

    // ── 대출 한도 규정 (주택담보대출·전세대출) ── consumed
    // ⚠ 정부 대책에 따라 자주 바뀝니다. 출처·시행일을 반드시 1차 자료로 대조하세요.
    loan: {
      effectiveFrom: '2025-10-16', // 10·15 대책 대출규제 시행일
      reviewedAt: '2026-08-02',
      jurisdiction: 'KR',
      confidence: 'verified',
      source: '금융위 「가계부채 관리 강화 방안」(2025.6.27) · 「주택시장 안정화를 위한 대출수요 관리 방안」(2025.10.15 발표, 10.16 시행) · 「2026년도 가계부채 관리방안」(2026.4.1) · 스트레스 DSR 3단계',

      // ── 지역 구분 ──
      //  ⚠ '규제지역·수도권'을 한 덩어리로 묶으면 안 된다. 수도권 비규제지역은
      //    LTV는 비규제(70%)인데 가격대별 한도·스트레스 3.0%p는 그대로 적용된다.
      //    지방 비규제지역만 가격대별 한도가 없고 스트레스도 0.75%p다.
      regions: [
        { key: 'metroNonRegulated', label: '수도권 비규제지역', metro: true,  regulated: false,
          note: '서울·경기·인천 중 규제지역(투기과열지구·조정대상지역)으로 지정되지 않은 곳.' },
        { key: 'regulated',         label: '규제지역',          metro: true,  regulated: true,
          note: '투기과열지구·조정대상지역. 2025.10.15 대책으로 서울 전역과 경기 일부가 지정됐고, 2026.6.30 화성 동탄·용인 기흥·구리가 추가됐습니다.' },
        { key: 'provincialNonRegulated', label: '지방 비규제지역', metro: false, regulated: false,
          note: '수도권 밖 비규제지역. 가격대별 한도가 없고 스트레스 DSR도 2단계(0.75%p)가 한시 적용됩니다.' },
      ],
      // 지방 규제지역이 새로 지정되면 regulated를 고르고 아래 note로 안내한다.
      regionNote: '규제지역 지정은 수시로 바뀝니다. 대상 주택의 시·군·구가 현재 규제지역인지 국토교통부 공고로 확인하세요.',

      // ── LTV(담보인정비율, %) — 지역 × 보유유형 ──
      //  10·15 대책: 규제지역 일반 LTV 70%→40% (무주택·처분조건부 1주택 모두 40%).
      //              생애최초는 이 하향에서 제외되어 70% 유지.
      //  6·27 대책: 수도권·규제지역 다주택자 및 기존주택 미처분 1주택자는 주택구입 목적
      //             주담대 금지(LTV 0%). 생애최초 LTV는 전국 80%→70%.
      ltvByRegion: {
        metroNonRegulated:      { none: 70, first: 70, replace: 70, keep1: 0,  multi: 0 },
        regulated:              { none: 40, first: 70, replace: 40, keep1: 0,  multi: 0 },
        provincialNonRegulated: { none: 70, first: 70, replace: 70, keep1: 60, multi: 60 },
      },
      // 지방 비규제 다주택 60%는 은행 자율·관행에 가까운 값이라 확정값으로 보지 않는다.
      ltvConfidence: {
        'metroNonRegulated.none': 'verified', 'metroNonRegulated.first': 'verified',
        'metroNonRegulated.replace': 'verified', 'metroNonRegulated.keep1': 'verified',
        'metroNonRegulated.multi': 'verified',
        'regulated.none': 'verified', 'regulated.first': 'verified',
        'regulated.replace': 'verified', 'regulated.keep1': 'verified', 'regulated.multi': 'verified',
        'provincialNonRegulated.none': 'verified', 'provincialNonRegulated.first': 'verified',
        'provincialNonRegulated.replace': 'verified',
        'provincialNonRegulated.keep1': 'estimate', 'provincialNonRegulated.multi': 'estimate',
      },
      ownershipLabels: {
        none: '무주택', first: '생애최초', replace: '처분조건부 1주택',
        keep1: '1주택 유지(기존주택 미처분)', multi: '다주택(2주택 이상)',
      },
      replaceDisposalMonths: 6, // 처분조건부: 기존주택을 6개월 이내 처분하는 조건

      // 수도권·규제지역 주택구입 주담대 가격대별 한도(원) — 지방 비규제는 미적용
      metroPriceCaps: [
        { upToEok: 15, cap: 600000000 },        // 15억 이하 → 6억
        { upToEok: 25, cap: 400000000 },        // 15~25억 → 4억
        { upToEok: Infinity, cap: 200000000 },  // 25억 초과 → 2억
      ],
      priceCapAppliesTo: ['metroNonRegulated', 'regulated'],

      // ── LTV·가격대별 한도의 판정 기준값 ──
      //  ⚠ 기준은 **매매가가 아니라 「시가」**다. 대출 신청일 기준으로 KB부동산 시세
      //    일반평균가·한국부동산원 가격 등 공신력 있는 평가자료로 판정한다.
      //    15.65억에 샀어도 신청일 KB시세가 15억이면 「15억 이하」 구간(6억 한도)이다.
      //    매매가를 그대로 넣으면 구간이 한 칸 올라가 한도가 2억 깎여 나온다 — 실제 사례.
      valuationBasis: {
        basis: '대출 신청일 기준 시가',
        sources: ['KB부동산 시세 일반평균가', '한국부동산원 시세', '감정평가액'],
        isPurchasePrice: false,
        asOf: '대출 신청일',
        note: 'LTV와 가격대별 한도는 매매가가 아니라 대출 신청일 기준 시가(KB시세 일반평균가·한국부동산원 등)로 판정합니다. 계약 시점과 대출 신청일 사이에 시세가 바뀌면 한도도 달라집니다.',
        fallbackNote: '시가를 입력하지 않아 매매가로 대신 판정했습니다. 매매가가 시세보다 높으면 한도가 실제보다 적게 나옵니다 — KB시세를 확인해 입력하세요.',
        reviewedAt: '2026-08-02',
        jurisdiction: 'KR',
        confidence: 'verified',
        source: '금융위 「대출수요 관리 방안」(2025.10.15) — 주택 시가는 대출 신청일 기준, KB부동산 일반평균가·한국부동산원 등 공신력 있는 평가자료로 산정',
      },

      // ── 이 계산기가 다루는 대출의 범위 ──
      //  ⚠ 가격대별 한도(6억 등)와 LTV 하향은 **주택구입 목적** 주담대에만 걸린다.
      //    같은 '주담대'라도 목적이 다르면 규제가 아예 다르므로, 범위를 밝히지 않으면
      //    생활안정자금·이주비 대출을 이 화면 값으로 오해한다.
      purposeScope: {
        covered: '주택구입 목적 주택담보대출',
        excluded: [
          '생활안정자금 목적 주담대 — 10·15 대책의 한도 축소 규제 미적용(별도 한도 규정)',
          '이주비대출 — 재건축·재개발 사업 영향을 감안해 미적용, 현행 6억원 유지',
          '중도금대출(집단대출) — 가격대별 한도 미적용. 다만 잔금대출로 전환되면 그때부터 적용',
          '전세자금대출 — LTV·가격대별 한도와 무관(전세 탭에서 별도 계산)',
          '정책대출(디딤돌·보금자리론 등) — 별도 자격·한도 기준',
        ],
        reviewedAt: '2026-08-02',
        confidence: 'verified',
        source: '금융위 「대출수요 관리 방안」 FAQ(2025.10.15) — 6억원 한도는 주택구입목적 주담대에 한정, 중도금대출 제외(잔금 전환 시 적용), 생활안정자금·이주비대출 미적용',
      },

      dsr: { tier1: 40, tier2: 50 }, // DSR 한도(%)

      // ── 스트레스 가산금리(%p) — DSR 한도 산정에만 가산(실제 상환금리 아님) ──
      //  가산금리 = 스트레스 금리 × 기본 적용비율 × 금리유형별 적용비율
      //  수도권·규제지역 주담대: 3.0% × 100%(3단계) = 3.0%p  (2025.10.16~)
      //  지방 비규제 주담대:     1.5% × 50%(2단계 유예) = 0.75%p (2026.12.31까지 연장)
      //
      //  ⚠ 3.0% 는 '스트레스 금리 산식의 상한'이 아니라 **수도권·규제지역에 적용되는
      //    하한**이다. 3단계 시행(2025.7.1) 당시에는 전국 하한이 1.5% 였고, 10·15
      //    대책이 수도권·규제지역에 한해 그 하한을 3%로 올렸다. 두 값이 흔히 혼동되니
      //    1.5 로 되돌리기 전에 아래 검증 결과를 먼저 볼 것.
      //
      //  ✅ 금융위 공표 예시로 교차검증했다(2026-08-03).
      //     "연 소득 1억원 차주가 수도권에서 변동금리로 주담대를 받는 경우,
      //      한도 5억 8,700만원 → 5억 100만원(약 14.7% 감소)"
      //     원리금균등 30년·금리 4.00% 전제에서 우리 엔진이 두 값을 그대로 재현한다
      //     (1.5%p → 5.87억, 3.0%p → 5.01억). scripts/check_loan_limit_rules.mjs 의
      //     '[대출 검증] 금융위 공표 예시와 대조' 가 이를 회귀로 고정한다.
      stress: {
        byRegion: {
          metroNonRegulated:      { stressRate: 3.0, applyRatio: 1.00, add: 3.00, stage: '3단계', effectiveFrom: '2025-10-16' },
          regulated:              { stressRate: 3.0, applyRatio: 1.00, add: 3.00, stage: '3단계', effectiveFrom: '2025-10-16' },
          provincialNonRegulated: { stressRate: 1.5, applyRatio: 0.50, add: 0.75, stage: '2단계 한시 유예',
            effectiveFrom: '2026-07-01', validUntil: '2026-12-31',
            note: '지방 주담대는 2026.12.31까지 2단계가 유지됩니다. 연장 여부는 반기마다 재결정되므로 시행 시점을 확인하세요.' },
        },
        // 금리유형별 적용비율 — 고정기간이 길수록 스트레스 가산이 줄어든다.
        //  ⚠ 은행별·고정기간별로 더 세분화되며(혼합형 5년/10년/15년 등), 아래는 대표값이다.
        rateTypeRatio: {
          variable: 1.00,  // 변동금리
          mixed:    0.80,  // 혼합형(일정기간 고정 후 변동)
          periodic: 0.40,  // 주기형(금리 조정주기 5년 이상)
          fixed:    0.00,  // 만기까지 순수 고정
        },
        rateTypeLabels: {
          variable: '변동금리', mixed: '혼합형(고정 후 변동)',
          periodic: '주기형(5년 주기 등)', fixed: '순수 고정(만기까지)',
        },
        rateTypeConfidence: 'estimate',
        rateTypeNote: '금리유형별 적용비율은 고정기간 길이에 따라 더 세분화되고 은행마다 다릅니다. 정확한 값은 대출 신청 은행에 확인하고, 필요하면 가산금리를 직접 입력하세요.',

        // ── 스트레스 DSR 적용 대상 (3단계, 2025.7.1~) ──
        //  ⚠ "스트레스 금리 3.0%p"는 적용 대상일 때의 값이다. 어떤 대출에 붙는지를
        //    밝히지 않으면, 스트레스가 붙지 않는 대출(전세·중도금 등)까지 깎인 한도로 본다.
        scope: {
          appliesTo: [
            '전 금융권 주택담보대출',
            '전 금융권 신용대출 — 잔액 1억원 초과분에만 스트레스 금리 적용',
            '전 금융권 기타대출(비주택담보대출 등)',
          ],
          excluded: [
            '전세자금대출 — DSR 산정 제외(보증부는 이자만 산입)',
            '중도금대출(집단대출) — 잔금대출 전환 시부터 산입',
            '정책대출(디딤돌·보금자리론 등) — 별도 기준',
          ],
          creditLoanStressThreshold: 100000000,
          note: '이 계산기는 주택담보대출 기준입니다. 전세대출·중도금대출·정책대출에는 스트레스 DSR이 그대로 적용되지 않으므로 이 결과를 쓰면 안 됩니다.',
        },

        effectiveFrom: '2025-10-16',
        reviewedAt: '2026-08-02',
        confidence: 'verified',
        source: '금융위 스트레스 DSR 3단계 시행방안 · 「대출수요 관리 방안」(2025.10.15) · 지방 주담대 2단계 유예 연장(2026.7~12)',
      },

      // ── 경과규정·기존대출 취급 ──
      //  자동 판정이 어려운 사실(계약일·계약금 납부 증빙·대환 여부)은 사용자 입력으로 받는다.
      grandfather: {
        cutoffDate: '2025-10-15', // 이 날까지 매매계약 체결 + 계약금 납부 증빙 → 종전 규정
        appliesToLoanApplied: true, // 시행일 전 대출 신청접수 완료분도 경과규정 대상
        options: [
          { key: 'new', label: '해당 없음 — 새로 신청하는 대출' },
          { key: 'preContract', label: '2025.10.15까지 매매계약 체결 + 계약금 납부 증빙 있음' },
          { key: 'preApplied', label: '시행일 전 대출 신청접수 완료' },
          { key: 'refinance', label: '기존 주담대 대환(증액 없음)' },
        ],
        note: '경과규정 해당 여부와 대환의 종전 조건 승계 여부는 은행이 증빙으로 판정합니다. 이 계산기는 사용자가 고른 값을 그대로 반영할 뿐 자동 판정하지 않습니다.',

        // ── 경과규정이 걸리면 실제로 적용되는 「종전 규정」 ──
        //  ⚠ 2026-08-03 이전에는 이 선택이 경고 문구만 띄우고 계산에는 전혀 반영되지
        //    않았다. 그래서 경과규정 대상자는 자기 대출을 계산기로 재현할 수 없었다
        //    (실사용자 사례: 2026년 4월 실행분이 화면값보다 1억 이상 많았다).
        //
        //  종전 규정 = 10·15 대책 시행(2025.10.16) 직전 상태다. 되돌아가는 것은 둘.
        //
        //   1) 가격대별 한도 — 6·27 대책의 **시가 무관 단일 6억**.
        //      10·15가 새로 만든 15억↑ 4억 / 25억↑ 2억 구간은 적용되지 않는다.
        //   2) 스트레스 금리 — 3단계 시행 당시의 전국 하한 **1.5%**.
        //      10·15가 수도권·규제지역만 3%로 올린 것이므로 그 인상분이 빠진다.
        //
        //  LTV 는 되돌리지 않는다. 종전 LTV 는 지역·주택가격·주택수에 따라 갈래가
        //  많아 한 값으로 못 박으면 오히려 틀린다 — 사용자가 직접 입력하는 칸이므로
        //  그대로 두고, 화면에서 "종전 LTV 를 확인해 직접 넣으라"고 안내한다.
        priorRules: {
          appliesToKeys: ['preContract', 'preApplied'],
          priceCapSingle: 600000000,
          stressRate: 1.5,
          ltvReverted: false,
          ltvNote: '종전 LTV 는 지역·주택가격·주택수에 따라 갈라져 자동 적용하지 않습니다. 은행에 확인한 값을 LTV 칸에 직접 넣으세요.',
          confidence: 'verified',
          source: '금융위 「대출수요 관리 방안」(2025.10.15) — 10.15까지 매매계약 체결 + 계약금 납부 시 종전 규정 적용(시가 무관 6억 한도). 스트레스 금리 하한 3% 상향도 같은 대책이므로 종전 1.5% 적용',
        },
        // 대환(증액 없음)은 종전 조건 승계 여부가 은행·상품마다 갈려 한 가지로 정할
        // 수 없다. 계산을 바꾸지 않고 경고만 남긴다 — 위 appliesToKeys 에 없는 이유다.
        refinanceNote: '대환은 종전 조건 승계 여부가 은행·상품마다 다릅니다. 계산에는 현행 규정을 그대로 적용했으니 실제 조건은 대환 은행에 확인하세요.',
        effectiveFrom: '2025-10-16',
        reviewedAt: '2026-08-02',
        confidence: 'verified',
        source: '금융위 「대출수요 관리 방안」 FAQ (2025.10.15) — 경과규정',
      },
      // 전세자금대출 보증기관 비교 (전세대출은 LTV 무관, DSR은 원금 제외·이자만 산입)
      //   한도 = min(
      //     소요자금별: 보증금 × 보증비율,
      //     보증과목별: 기관 최대한도,
      //     [HF] 상환능력별(소득 기준): 근사 = 연소득 × incomeMultiple − 타행 신용대출 × creditDeductRatio
      //   )
      //   ※ HF 공식 '상환능력별 보증한도 = 연간인정소득 − 연간부채상환예상액 + 우대'를 단순화한 근사치.
      //     정확한 금액은 HF 예상보증금액 조회로 확인. incomeCap=부부합산 연소득 자격상한(원), null=소득무관(SGI).
      // ※ 일반 보증(HF·HUG·SGI)에는 '소득 자격 상한'이 없다. 소득은 HF의 상환능력별
      //   한도 산정에만 반영된다(소득이 낮으면 한도가 줄 뿐, 자격이 박탈되지 않음).
      //   부부합산 소득 상한(5천만~1.3억)은 아래 jeonseFundProducts(버팀목 시리즈)에만 있는 요건.
      jeonseAgencies: [
        { key: 'HF', name: '주택금융공사(HF)', ratio: 80, ratioYouth: 90, maxAmount: 400000000,
          depositCapMetro: 700000000, depositCapOther: 500000000, fee: '연 0.04~0.18%',
          incomeCap: null, incomeCapYouth: null,   // 소득 자격 제한 없음 (한도만 소득 연동)
          incomeMultiple: 4.5,        // 상환능력별 한도 근사(연소득×4.5). 실제는 인정소득−부채상환예상액+우대
          creditDeductRatio: 0.25,    // 타행 신용대출 잔액의 25%를 차감
          source: 'https://www.hf.go.kr/ko/sub02/sub02_01_02.do',
          note: 'min(보증금×80%, 4억, 상환능력별 한도). 소득 자격 제한 없음 — 소득은 상환능력별 한도 산정에만 반영. 수도권·규제 1주택자 2억 한도. 상환능력별 한도는 근사치 — HF 예상보증금액 조회로 확인.' },
        { key: 'HUG', name: '주택도시보증공사(HUG)', ratio: 80, ratioYouth: 90, maxAmount: 400000000,
          depositCapMetro: 700000000, depositCapOther: 500000000, fee: '연 0.111~0.211%',
          incomeCap: null, incomeCapYouth: null,   // 소득 자격 제한 없음
          incomeMultiple: null, creditDeductRatio: 0,
          source: 'https://www.khug.or.kr/hug/web/ig/dl/igdl000001.jsp',
          note: 'min(보증금×80%, 4억). 소득 자격 제한 없음. 대출+반환보증 일괄(전세금안심대출).' },
        { key: 'SGI', name: 'SGI서울보증', ratio: 80, ratioYouth: 80, maxAmount: 500000000,
          depositCapMetro: Infinity, depositCapOther: Infinity, fee: '연 0.183~0.208%',
          incomeCap: null, incomeCapYouth: null,
          incomeMultiple: null, creditDeductRatio: 0,
          source: 'https://www.sgic.co.kr',
          note: 'min(보증금×80%, 5억). 소득 제한 없음. 고액 전세 가능, 심사 빠른 편.' },
      ],
      jeonseNote: '전세대출은 LTV와 무관하며, DSR 산정 시 보증부 대출은 원금이 제외(이자만 산입)됩니다. 일반 보증(HF·HUG·SGI)은 소득 자격 제한이 없고, 소득은 HF 상환능력별 한도 산정에만 반영됩니다. 청년·신혼은 보증비율 우대(최대 90%).',

      // 기금성 전세대출 (주택도시기금 — 버팀목 시리즈). 여기에만 부부합산 소득 상한이 있다.
      // 저리 대출이라 요건이 맞으면 일반 보증보다 우선 검토할 것. 금리·요건은 기금 고시로
      // 수시 변경 — 상세·최신값은 주택도시기금 포털(nhuf.molit.go.kr)에서 확인.
      jeonseFundProducts: [
        { key: 'general', name: '버팀목 전세자금 (일반)', who: '무주택 세대주',
          incomeCap: 50000000, ratio: 70,
          depositCapMetro: 300000000, depositCapOther: 200000000,
          maxMetro: 120000000, maxOther: 80000000,
          rate: '연 2%대~3%대 (소득·보증금 구간별)',
          note: '2자녀 이상 가구는 보증금·한도 상향' },
        { key: 'youth', name: '청년전용 버팀목', who: '만 19~34세 무주택',
          incomeCap: 50000000, ratio: 80,
          depositCapMetro: 300000000, depositCapOther: 300000000,
          maxMetro: 200000000, maxOther: 200000000,
          rate: '연 1%대 후반~3%대' },
        { key: 'newlywed', name: '신혼부부전용 버팀목', who: '혼인 7년 이내(예정 포함)',
          incomeCap: 75000000, ratio: 80,
          depositCapMetro: 400000000, depositCapOther: 300000000,
          maxMetro: 300000000, maxOther: 200000000,
          rate: '연 1%대 중반~3%대' },
        { key: 'newborn', name: '신생아 특례 버팀목', who: '2년 내 출산·입양 가구',
          incomeCap: 130000000, ratio: 80,
          depositCapMetro: 500000000, depositCapOther: 400000000,
          maxMetro: 300000000, maxOther: 300000000,
          rate: '연 1%대 초반~3%대 (소득 구간별)' },
      ],
      jeonseFundSource: 'https://nhuf.molit.go.kr',

    },

    // ── 아래는 reference: 각 계산기 코드에 동일 값 존재(점진 이관 대상) ──

    // 취득세 (주택, 지방세법) consumed — calcAcquisitionTax()가 직접 읽는다
    acquisitionTax: {
      base: { under6eok: 1.0, over9eok: 3.0 }, // 6억↓ 1%, 6~9억 누진, 9억↑ 3%
      heavy: { twoHomeRegulated: 8.0, threeHomeRegulated: 12.0, threeHomeNonReg: 8.0, fourPlus: 12.0 },
      nonHouse: 4.0, // 비주택 본세(%)
      ruralTaxOver85: 0.2, // 85㎡ 초과 농특세(%)

      // ── 생애최초 주택 취득 감면 (지방세특례제한법 제36조의3) ──
      //  일반 감면 한도 200만원. 다만 소형·비아파트(도시형생활주택·다가구 등) 및
      //  인구감소지역 주택은 300만원 한도가 적용될 수 있다.
      firstHomeRelief: {
        priceMax: 1200000000,   // 취득 당시 가액 상한(원)
        deductMax: 2000000,     // 일반 한도(원)
        smallHouseDeductMax: 3000000, // 소형 비아파트·인구감소지역 한도(원)
        smallHouseAreaMaxSqm: 60,     // 소형주택 판정 전용면적(㎡)
        smallHousePriceMaxMetro: 300000000,    // 수도권 소형주택 가액 상한(원)
        smallHousePriceMaxOther: 200000000,    // 비수도권 소형주택 가액 상한(원)
        effectiveFrom: '2025-01-01',
        reviewedAt: '2026-07-30',
        jurisdiction: 'KR',
        confidence: 'verified',
        source: '지방세특례제한법 제36조의3 (생애최초 주택 취득에 대한 감면)',
      },

      // ── 출산·양육 가구 주택 취득세 감면 (지방세특례제한법 제36조의5) ──
      //  자녀 출산일 전후 일정 기간 내 취득한 12억원 이하 1가구 1주택 → 최대 500만원 감면
      childbirthRelief: {
        priceMax: 1200000000,
        deductMax: 5000000,
        validUntil: '2028-12-31',
        effectiveFrom: '2024-01-01',
        reviewedAt: '2026-07-30',
        jurisdiction: 'KR',
        confidence: 'verified',
        source: '지방세특례제한법 제36조의5 (출산·양육을 위한 주택 취득에 대한 감면)',
      },

      // ── 지방 준공 후 미분양 주택 한시 감면 ──
      //  ⚠ 전국 일률 50%가 아니다. 법정 감면율은 25%이고, 지방자치단체 조례로
      //    최대 25%p가 추가 감면되어 최종 25~50% 범위가 된다.
      //    조례를 확인하지 못하면 법정 25%만 반영하고 결과에 그 사실을 밝힌다.
      //  요건: 사업주체로부터 최초 유상취득 · 수도권 밖 · 준공 후 미분양 ·
      //        실제 입주 사실 없음(입주 기간 1년 미만) · 전용 85㎡ 이하 · 취득가 6억 이하 ·
      //        개인(법인·단체 제외)
      unsold2026Relief: {
        areaMaxSqm: 85,
        priceMax: 600000000,
        statutoryRatio: 0.25,        // 법률에 따른 기본 감면율
        localMaxExtraRatio: 0.25,    // 조례로 추가 가능한 최대 감면율
        localExtraOptions: [0, 0.10, 0.25], // UI 선택지(조례 미확인 시 0)
        maxTotalRatio: 0.50,         // 법정 + 조례 상한
        discountRatio: 0.50,         // (레거시) 이전 버전 호환용 최대치
        excludeHeavySurcharge: true, // 다주택 취득세 중과 제외
        metroExcluded: true,         // 수도권은 대상 아님
        validUntil: '2026-12-31',
        effectiveFrom: '2026-01-01',
        reviewedAt: '2026-07-30',
        jurisdiction: 'KR',
        confidence: 'verified',
        source: '지방세특례제한법 — 지방 준공 후 미분양 주택 취득세 한시 감면(법정 25% + 조례 최대 25%)',
      },

      // ── 취득 원인별 세율 체계 ──
      //  ⚠ '신축'을 한 덩어리로 묶으면 안 된다. 직접 신축(원시취득 2.8%)과
      //    시행사로부터 분양받은 신축주택(유상거래 1~3% 또는 중과)은 세율 체계가 다르다.
      acqTypes: {
        purchase: { label: '매매(유상거래)', rateBasis: 'progressive-1to3' },
        presale:  { label: '분양받은 신축주택', rateBasis: 'progressive-1to3',
          note: '시행사·건설사로부터 분양받아 소유권을 취득하면 유상거래 주택 취득(1~3% 또는 중과)입니다.' },
        original: { label: '직접 신축·증축한 건축물', rate: 2.8,
          note: '건축주가 직접 신축·증축해 원시취득한 경우입니다.' },
        redevelop:{ label: '재개발·재건축 조합원 취득', rateBasis: 'mixed',
          note: '종전 토지·건물 지분과 추가분담금(원시취득)의 과세표준을 나누어 판정해야 합니다. 본 계산기는 개략 추정만 제공합니다.' },
        inherit:  { label: '상속', rate: 2.8, specialRate: 0.8 },
        gift:     { label: '증여(무상취득)', rate: 3.5, heavyRate: 12.0 },
      },

      // ── 증여(무상취득) 과세표준과 중과 판정 기준은 서로 다른 값이다 ──
      //  세액 계산: 시가인정액 (지방세법 제10조의2 — 매매사례가·감정가·경매가 등)
      //  12% 중과 판정: 시가표준액 (지방세법 제13조의2 제2항 — 조정대상지역 3억원 이상)
      //  → 하나의 'price'로 둘을 겸하면 시가인정액이 3억을 넘고 시가표준액이 3억 미만인
      //    흔한 경우에 중과가 잘못 걸린다. 반드시 분리해 입력받는다.
      giftAcquisition: {
        standardRate: 0.035,
        heavyRate: 0.12,
        heavyStdValueThreshold: 300000000, // 시가표준액 3억원 이상
        heavyRequiresRegulated: true,
        heavyRequiresDonorMultiHome: true, // 1세대 1주택자가 배우자·직계존비속에게 증여하면 제외
        baseIsMarketValue: true,           // 과세표준 = 시가인정액
        // 부담부증여: 승계채무액은 유상취득, 나머지는 무상취득으로 나뉜다.
        burdenedGiftSplit: true,
        effectiveFrom: '2023-01-01', // 무상취득 과세표준 시가인정액 전환
        reviewedAt: '2026-08-02',
        jurisdiction: 'KR',
        confidence: 'verified',
        source: '지방세법 제10조의2(무상취득 과세표준)·제13조의2 제2항(조정대상지역 3억원 이상 주택 무상취득 중과)',
      },

      effectiveFrom: '2026-01-01',
      reviewedAt: '2026-07-30',
      jurisdiction: 'KR',
      confidence: 'verified',
      source: '지방세법 제11·15조, 지방세특례제한법 제36조의3·제36조의5',
    },

    // 양도소득세 (소득세법) consumed
    transferTax: {
      onlyHomeExemptCap: 1200000000, // 1세대1주택 비과세 한도(원)
      shortTermHouse: { under1y: 70, under2y: 60 }, // 단기 세율(%)
      shortTermNonHouse: { under1y: 50, under2y: 40 },
      basicDeduct: 2500000, // 기본공제(원)
      localTaxRate: 10, // 지방소득세(국세의 %)

      // 장기보유특별공제 표2(1세대1주택) 거주기간 공제
      //  ⚠ 거주 2년 이상 3년 미만 구간(8%)이 존재한다. 3년부터 시작하면 과다 계산된다.
      ltDeductResidence: {
        minYears: 2,
        under3yRate: 0.08,     // 2년 이상 3년 미만
        from3yBaseRate: 0.12,  // 3년 이상 12%
        perYearRate: 0.04,     // 이후 연 4%p
        maxRate: 0.40,
        source: '소득세법 제95조 제2항 [표2]',
      },

      // 다주택 양도세 중과 한시 유예 + 경과규정
      //  ⚠ 잔금일이 유예 종료일 다음 날이라고 무조건 중과되는 것이 아니다.
      //    유예 종료일까지 계약·계약금 수령을 마쳤다면 일정 기간 내 양도까지 유예가 이어진다.
      multiHomeSurchargeWaiverUntil: '2026-05-09',
      multiHomeSurchargeWaiverMinHoldYears: 2,
      multiHomeSurchargeGrace: {
        contractBy: '2026-05-09',        // 이 날짜까지 매매계약 + 계약금 수령
        transferWithinMonths: 4,         // 계약일부터 4개월 이내 양도
        newRegulatedWithinMonths: 6,     // 일부 신규 조정대상지역은 6개월
        landPermitApplyBy: '2026-05-09', // 토지거래허가 대상은 이 날까지 허가 신청
        landPermitWithinMonths: 6,
        effectiveFrom: '2026-05-10',
        reviewedAt: '2026-07-30',
        jurisdiction: 'KR',
        confidence: 'verified',
        source: '소득세법 시행령 부칙 — 다주택자 중과 한시 배제 경과규정',
      },

      // 배우자·직계존비속 증여재산 이월과세 (소득세법 제97조의2)
      //  증여받은 부동산을 일정 기간 내 양도하면 증여자의 취득가액이 이월 적용된다.
      carryoverBasis: {
        withinYears: 10,
        appliesTo: '배우자 또는 직계존비속으로부터 증여받은 토지·건물·부동산에 관한 권리',
        effectiveFrom: '2023-01-01',
        reviewedAt: '2026-07-30',
        jurisdiction: 'KR',
        confidence: 'verified',
        source: '소득세법 제97조의2 (양도소득의 필요경비 계산 특례)',
      },

      effectiveFrom: '2026-01-01',
      reviewedAt: '2026-07-30',
      jurisdiction: 'KR',
      confidence: 'verified',
      source: '소득세법 제55·95·97조의2·제104조',
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

    // ── 상속·증여 (상속세 및 증여세법) consumed ──
    //  ⚠ 상속세 배우자 상속공제는 '순재산 × 30%'가 아니다.
    //    min(실제 상속받은 금액, 법정상속분 한도, 30억)이며 최소 5억이 보장된다.
    //    가족 구성·분할 방식에 따라 결과가 크게 달라져 단일 값 대신 범위로 제시한다.
    inheritGift: {
      lumpSumDeduct: 500000000,   // 일괄공제(원)
      basicDeduct: 200000000,     // 기초공제(원)
      childDeduct: 50000000,      // 자녀 1인당 인적공제(원)
      spouseMinDeduct: 500000000, // 배우자 최소 공제(원)
      spouseMaxDeduct: 3000000000,// 배우자 공제 상한(원)
      spouseStatutoryShareBonus: 0.5, // 배우자 법정상속분 가산(자녀 1인 대비 1.5)
      // 증여재산공제 (10년 합산 기준, 원)
      giftDeduct: {
        spouse: 600000000,
        adult: 50000000,   // 직계존비속(성년)
        minor: 20000000,   // 직계존비속(미성년)
        other: 10000000,   // 기타 친족 — 6촌 이내 혈족·4촌 이내 인척
      },
      // ⚠ 기타친족 1천만원 공제는 '친족'에게만 적용된다. 완전한 비친족(타인) 증여는
      //   증여재산공제가 없다. UI에서 반드시 구분해야 한다.
      otherRequiresKinship: true,
      strangerDeduct: 0,
      // 혼인·출산 증여재산공제 (상증법 제53조의2) — 혼인 + 출산 합산 1억원 한도
      marriageBirthDeduct: { max: 100000000, source: '상속세 및 증여세법 제53조의2' },
      // 세대생략 할증 (상증법 제57조)
      generationSkipSurcharge: {
        base: 0.30,          // 손자녀 등 세대생략 증여 30% 할증
        minorHighValue: 0.40,// 미성년자가 20억원 초과를 받는 경우 40%
        minorHighValueOver: 2000000000,
      },
      // 10년 합산 과세 (상증법 제47조 제2항) + 기납부세액공제 (제58조)
      priorGiftAggregation: {
        withinYears: 10,
        sameDonorIncludesSpouseOfLineal: true, // 직계존속은 그 배우자를 동일인으로 봄
        creditPriorTaxPaid: true,
        source: '상속세 및 증여세법 제47조·제58조',
      },
      effectiveFrom: '2026-01-01',
      reviewedAt: '2026-07-30',
      jurisdiction: 'KR',
      confidence: 'verified',
      source: '상속세 및 증여세법 제18조의2·제19조·제47조·제53조·제53조의2·제57조·제58조',
    },

    // ── 중개보수 (공인중개사법 시행규칙 [별표1~3]) consumed ──
    //  주택 상한요율은 시·도 조례로 정하며 아래는 서울특별시 기준.
    //  주택 외(오피스텔·상가·토지)는 조례가 아닌 법령 상한(0.9% 이내 협의)이 적용된다.
    brokerage: {
      // 월세·보증부 월세 거래금액 환산 (시행규칙 제20조 제4항)
      //  거래금액 = 보증금 + 월세 × 100. 다만 그 금액이 5천만원 미만이면 월세 × 70으로 환산.
      monthlyRentMultiplier: 100,
      monthlyRentMultiplierLow: 70,
      monthlyRentLowThreshold: 50000000,
      // 주거용 오피스텔(전용 85㎡ 이하 + 부엌·화장실·목욕시설 구비): 매매 0.5%, 임대차 0.4%
      officetelResidential: { sale: 0.005, lease: 0.004, areaMaxSqm: 85 },
      // 그 밖의 중개대상물(상가·토지·업무용 오피스텔): 0.9% 이내에서 협의
      otherPropertyMaxRate: 0.009,
      vatRate: 0.10,
      vatNote: '부가가치세는 중개업자가 일반과세자일 때 10%가 붙습니다. 간이과세자는 통상 4%(업종별 부가율) 수준이거나 별도 청구하지 않는 경우도 있어 반드시 확인하세요.',
      partyNote: '중개보수는 매도인·매수인(임대인·임차인)이 각각 부담합니다. 아래 금액은 “1인당” 부담액입니다.',

      // ── 시·도 선택 ──
      //  주택 중개보수 상한요율은 「공인중개사법 시행규칙 [별표1]」이 정한 범위에서
      //  각 시·도 조례로 정한다. 2021.10.19 국토교통부 개선안 이후 대부분의 시·도가
      //  동일한 요율표를 채택했지만 조례는 시·도마다 별개이므로 확정할 수 없다.
      //  → 기본값은 서울, 다른 시·도는 "같은 요율표로 계산했으나 조례 확인 필요"로 표시한다.
      defaultRegion: 'KR-11',
      regions: [
        { key: 'KR-11', name: '서울특별시', verified: true,  ordinance: '서울특별시 주택 중개보수 등에 관한 조례', link: 'https://land.seoul.go.kr/land/broker/brokerageCommission.do' },
        { key: 'KR-41', name: '경기도',     verified: false, ordinance: '경기도 부동산 중개보수 등에 관한 조례', link: 'https://gris.gg.go.kr/reb/selectRebRateView.do' },
        { key: 'KR-28', name: '인천광역시', verified: false, ordinance: '인천광역시 부동산 중개보수 등에 관한 조례', link: 'https://www.incheon.go.kr/build/BU060102/274' },
        { key: 'KR-26', name: '부산광역시', verified: false, ordinance: '부산광역시 주택 중개보수 등에 관한 조례' },
        { key: 'KR-27', name: '대구광역시', verified: false, ordinance: '대구광역시 주택 중개보수 등에 관한 조례' },
        { key: 'KR-30', name: '대전광역시', verified: false, ordinance: '대전광역시 주택 중개보수 등에 관한 조례' },
        { key: 'KR-29', name: '광주광역시', verified: false, ordinance: '광주광역시 주택 중개보수 등에 관한 조례' },
        { key: 'KR-31', name: '울산광역시', verified: false, ordinance: '울산광역시 주택 중개보수 등에 관한 조례' },
        { key: 'KR-50', name: '세종특별자치시', verified: false, ordinance: '세종특별자치시 주택 중개보수 등에 관한 조례' },
        { key: 'KR-43', name: '충청북도',  verified: false, ordinance: '충청북도 주택 중개보수 등에 관한 조례' },
        { key: 'KR-44', name: '충청남도',  verified: false, ordinance: '충청남도 주택 중개보수 등에 관한 조례' },
        { key: 'KR-45', name: '전북특별자치도', verified: false, ordinance: '전북특별자치도 주택 중개보수 등에 관한 조례' },
        { key: 'KR-46', name: '전라남도',  verified: false, ordinance: '전라남도 주택 중개보수 등에 관한 조례' },
        { key: 'KR-47', name: '경상북도',  verified: false, ordinance: '경상북도 주택 중개보수 등에 관한 조례' },
        { key: 'KR-48', name: '경상남도',  verified: false, ordinance: '경상남도 주택 중개보수 등에 관한 조례' },
        { key: 'KR-42', name: '강원특별자치도', verified: false, ordinance: '강원특별자치도 주택 중개보수 등에 관한 조례' },
        { key: 'KR-49', name: '제주특별자치도', verified: false, ordinance: '제주특별자치도 주택 중개보수 등에 관한 조례' },
      ],
      regionNote: '주택 중개보수 상한요율은 시·도 조례로 정합니다. 이 계산기는 서울특별시 조례 요율표를 기준으로 계산하며, 2021.10.19 국토교통부 개선안 이후 대부분의 시·도가 같은 요율을 채택했습니다. 다만 조례는 시·도마다 별개이므로 서울 외 지역은 해당 시·도 조례를 확인하세요.',
      regionUnverifiedWarn: '선택한 시·도 조례 요율표를 1차 출처로 대조하지 못했습니다. 서울특별시 조례 요율표로 계산한 참고값이며, 해당 시·도 조례로 확인하세요.',
      // 주택 외(오피스텔·상가·토지)는 조례가 아닌 법령 상한이라 시·도와 무관하다.
      regionAppliesTo: ['sale', 'jeonse', 'monthly'],

      effectiveFrom: '2021-10-19',
      reviewedAt: '2026-07-30',
      jurisdiction: 'KR-11', // 서울특별시 조례 기준
      confidence: 'verified',
      source: '공인중개사법 시행규칙 제20조 및 [별표], 서울특별시 주택 중개보수 조례',
    },

    // ── 전월세 전환율 (주택임대차보호법 제7조의2) consumed ──
    //  법정 상한 = min(연 10%, 한국은행 기준금리 + 2%p)
    //  ⚠ 이 상한은 '기존 계약의 전세 → 월세 전환' 시 적용되는 법정 한도이며,
    //    신규 계약의 시장 전환율과는 다르다. 화면에서 반드시 분리해 표시할 것.
    jeonseConversion: {
      baseRatePct: 2.75,      // 한국은행 기준금리(%)
      baseRateAsOf: '2026-07-30',
      addPct: 2.0,            // 대통령령으로 정하는 이율(%p)
      hardCapPct: 10.0,       // 법정 절대 상한(%)
      marketDefaultPct: 6.0,  // 시장 비교용 기본값(법정 상한 아님)
      effectiveFrom: '2020-09-29',
      reviewedAt: '2026-07-30',
      jurisdiction: 'KR',
      confidence: 'verified',
      source: '주택임대차보호법 제7조의2, 같은 법 시행령 제9조 / 한국은행 기준금리',
    },

    // ── 청약가점제 (주택공급에 관한 규칙 [별표1]) consumed ──
    subscription: {
      maxScore: 84,
      noHomeMax: 32,      // 무주택기간 (최대 32점)
      dependentsMax: 35,  // 부양가족 (최대 35점)
      accountMax: 17,     // 청약통장 가입기간 (최대 17점)
      // 배우자 청약통장 가입기간의 50%를 합산 (최대 3점). 합산 후에도 통장 점수 상한 17점.
      spouseAccountRatio: 0.5,
      spouseAccountMaxPoints: 3,
      effectiveFrom: '2024-03-25',
      reviewedAt: '2026-07-30',
      jurisdiction: 'KR',
      confidence: 'verified',
      source: '주택공급에 관한 규칙 제28조 및 [별표1] (배우자 통장 가입기간 합산)',
    },

    // 변경 이력
    changelog: [
      { date: '2026-08-02', note: '실사용자 제보로 확인된 계산 오류 2건 수정. ① LTV·가격대별 한도의 판정 기준을 매매가가 아니라 「대출 신청일 기준 시가」(KB부동산 일반평균가·한국부동산원)로 명시하고, 종합계산기에 KB시세 입력을 분리 신설 — 매매가 15.65억·신청일 시가 15억인 주택이 15~25억 구간(4억)에 잘못 걸려 한도가 2억 적게 나오던 오류. ② 유가증권(주식)담보대출·예적금담보대출·보험계약대출을 DSR 산정에서 완전 제외 — 주식담보대출을 「원금÷8년 + 이자」로 산입해 DSR을 부풀리고 주담대 한도를 깎던 오류. ③ 스트레스 DSR이 실제로 한도를 줄였는지(줄였다면 얼마나) 결과에 표시 — 가격대별 한도·LTV가 결정 요인이면 스트레스 영향은 0이다.' },
      { date: '2026-08-02', note: '적용 대상 요건 명시. ① DSR·스트레스 DSR이 "어떤 대출에 붙는지"를 결과에 표시 — 차주단위 DSR은 총 대출 1억원 초과 시 적용, 전세·중도금·예적금담보·서민금융 등은 DSR 산정 제외, 신용대출 스트레스는 잔액 1억원 초과분만. 계산은 보수적으로 항상 DSR을 적용하되 요건 미해당 시 실제 한도가 더 높을 수 있음을 밝힌다. ② 가격대별 한도·LTV 하향이 「주택구입 목적」 주담대에만 적용됨을 명시 — 생활안정자금·이주비·중도금대출은 대상 밖. ③ 등기신청 수수료에서 금액 미확인 「전자신청」 선택지 제거(방문 18,000·e-Form 15,000만 유지, 보수적으로 방문이 기본값).' },
      { date: '2026-08-02', note: '대출·등기·증여 정확성 정비. ① 규제지역 일반 LTV 50%→40%(10·15 대책), 생애최초 전국 70%(6·27 대책, 비규제 80% 표기 정정), 수도권 1주택 미처분·다주택 0%. ② 스트레스 가산금리 수도권·규제지역 1.5%p→3.0%p, 지방 비규제 0.75%p로 분리하고 금리유형별 적용비율 추가. ③ 지역 구분을 「수도권 비규제 / 규제지역 / 지방 비규제」 3분류로 세분화 — 가격대별 한도는 수도권·규제지역만 적용. ④ 경과규정(2025.10.15 이전 계약·신청접수)·대환을 사용자 입력으로 분리. ⑤ 법무사 기본보수에 20억·200억 초과 구간 추가(10억 초과 0.05% 고정 오류 수정)하고 대행수수료·실비·부가세를 별도 항목으로 분리. ⑥ 등기신청 수수료를 신청 방식별(방문 18,000 / e-Form 15,000 / 전자)로 구분(2025.8.1 인상 반영). ⑦ 국민주택채권 할인율의 seed·수집실패 값을 실시간 값으로 표시하지 않도록 예시값으로 분리. ⑧ 증여 취득세를 시가인정액(과세표준)·시가표준액(중과 판정)·승계채무액(부담부증여)으로 분리. ⑨ 양도세 공동명의 지분율 입력, 보유·거주기간 날짜 기준 계산. ⑩ 중개보수 시·도 선택 구조 추가.' },
      { date: '2026-07-30', note: '세무 정확성 정비(P0). ① 지방 미분양 감면을 전국 일률 50%→법정 25%+조례 추가 0~25%로 분리. ② 취득 원인에 「분양받은 신축주택(유상거래)」·「재개발 조합원」 추가 — 직접 신축(원시취득 2.8%)과 구분. ③ 양도세 장특공 거주 2년~3년 미만 8% 구간 추가. ④ 2026.5.9 다주택 중과 경과규정(계약일·계약금·토지거래허가) 반영. ⑤ 경매 계산기 취득세를 calcAcquisitionTax 공통 함수로 통합. ⑥ 상속세 배우자공제를 법정상속분 기반 범위 추정으로 교체. ⑦ 증여세 10년 합산 누진·기납부세액공제·혼인출산공제·세대생략 할증 반영. ⑧ 생애최초 300만원·출산양육 500만원 감면 추가. ⑨ 중개보수 월세 환산·오피스텔·상가/토지·협의요율. ⑩ 청약 배우자 통장 합산. ⑪ 전월세 법정 상한 분리 표시.' },
      { date: '2026-06-16', note: '등기비용 계산기에 취득세·지방교육세·농어촌특별세 통합(취득세 포함 토글, 주택수·조정·85㎡·생애최초 입력) — 총 등기비용 한 번에 산정.' },
      { date: '2026-06-16', note: '법무사 기본보수를 대한법무사협회 보수표 2024.9.12 시행 기준으로 갱신(5천만↓ 21만 정액·구간별 누진 0.10→0.05%, 임의 상한 1.5백만 제거). 등기·종합 계산기 공통 적용.' },
      { date: '2026-06-14', note: '국민주택채권 고객부담률 기본값 8.7%→15%로 갱신(최근 시장 수준 반영, 매일 변동·수정 가능). 전세대출 한도 계산기에 보증기관(HF/HUG/SGI) 선택 기능 추가(전체 비교 기본).' },
      { date: '2026-06-13', note: '국민주택채권 매입금액 만원 단위 절상 적용 + 지역(특별시·광역시/그 밖의 지역) 매입률 구분. 양도세 장기보유특별공제 표1 정정(연 2%·3년 6%~15년 30%).' },
      { date: '2026-06-04', note: '대출 한도 규정 블록 신설(LTV·가격대별 한도·스트레스 DSR·전세 보증기관 HF/HUG/SGI).' },
      { date: '2026-06-03', note: '취득세 계산기에 취득원인(상속·증여·신축)·일시적 2주택 반영. 생애최초 감면 근거를 제36조의3으로 정정.' },
      { date: '2026-06-02', note: '단일 데이터 파일 신설. 국민주택채권 할인율 기본값 8.7%로 갱신. DSR/RTI 임계값 분리.' },
    ],
  };
})();
