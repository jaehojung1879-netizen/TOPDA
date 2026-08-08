#!/usr/bin/env node
// 맞춤 내집 찾기(search.html)의 다국어판을 생성한다 → site/{lang}/calculators/search.html
// - 계산/점수 로직(score.js·region.js)은 공유·불변. 한국어 원본 출력도 불변.
// - 표시 문자열만 언어별 사전(T)으로 조립. 아파트·지역·역·학교명 등 데이터는 한국어 유지.
// - 가격은 국제 표기(zh: 亿 / en·vi·th: 십억 ₩)로 렌더.
//   node scripts/gen_search_pages.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const LANGS = ['en', 'zh-Hans', 'zh-Hant', 'vi', 'th'];
const OG = { en: 'en_US', 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', vi: 'vi_VN', th: 'th_TH' };
const REVIEW = {
  en: 'machine-assisted draft, needs native review',
  'zh-Hans': '机器初译，需母语者校对', 'zh-Hant': '機器初譯，需母語者校對',
  vi: 'bản dịch máy, cần người bản ngữ rà soát', th: 'แปลด้วยเครื่อง ต้องให้เจ้าของภาษาตรวจ',
};
// 헤더/푸터 라벨 (기존 번역 계산기 페이지와 동일)
const CHROME = {
  en: { guides: 'Guides', calc: 'Calculators', market: 'Market Data', checklists: 'Checklists', board: 'Board', foot: '&copy; TOPDA. General information only.' },
  'zh-Hans': { guides: '指南', calc: '计算器', market: '行情信息', checklists: '清单', board: '论坛', foot: '&copy; TOPDA。仅供一般参考。' },
  'zh-Hant': { guides: '指南', calc: '計算器', market: '行情資訊', checklists: '清單', board: '論壇', foot: '&copy; TOPDA。僅供一般參考。' },
  vi: { guides: 'Hướng dẫn', calc: 'Máy tính', market: 'Giá thị trường', checklists: 'Danh sách', board: 'Diễn đàn', foot: '&copy; TOPDA. Chỉ là thông tin chung.' },
  th: { guides: 'คู่มือ', calc: 'เครื่องคำนวณ', market: 'ข้อมูลราคาตลาด', checklists: 'เช็กลิสต์', board: 'กระดาน', foot: '&copy; TOPDA ข้อมูลทั่วไปเท่านั้น' },
};
// 업무지구(값=한국어, 표시=로마자/현지)
const HUB_DISPLAY = {
  en: { '강남': 'Gangnam', '판교': 'Pangyo', '여의도': 'Yeouido', '광화문': 'Gwanghwamun' },
  'zh-Hans': { '강남': '江南 Gangnam', '판교': '板桥 Pangyo', '여의도': '汝矣岛 Yeouido', '광화문': '光化门 Gwanghwamun' },
  'zh-Hant': { '강남': '江南 Gangnam', '판교': '板橋 Pangyo', '여의도': '汝矣島 Yeouido', '광화문': '光化門 Gwanghwamun' },
  vi: { '강남': 'Gangnam', '판교': 'Pangyo', '여의도': 'Yeouido', '광화문': 'Gwanghwamun' },
  th: { '강남': 'Gangnam', '판교': 'Pangyo', '여의도': 'Yeouido', '광화문': 'Gwanghwamun' },
};

// ===== 언어별 문자열 사전 =====
const T = {
  en: {
    title: 'Find Your Home', metaDesc: 'Enter budget, region, size, age, distance to station/school and household count — complexes are ranked by an overall score. A few conditions are enough.',
    home: 'Home', h1: 'Find Your Home',
    intro: 'Enter a few conditions and complexes are scored by upside, transit, school zone and more. <strong>Enter a budget and complexes near that price show first.</strong> ',
    howtoToggle: 'How scoring works ▾',
    condH: 'Conditions', searchLabel: 'Complex name · keyword', searchPh: '헬리오시티, 래미안', searchHint: 'Find by complex or region name',
    searchNote: '⌨️ Search matches Korean text only — type the Korean name (e.g. 헬리오시티) or region. Romanizations like “Helio” won’t match. The Region dropdowns below are shown in English for reference.',
    sortLabel: 'Sort', sortScore: 'Highest score', sortPriceAsc: 'Lowest price', sortPriceDesc: 'Highest price', sortRecent: 'Most recent deal', sortMomentum: 'Strongest momentum',
    budgetLabel: 'Budget (max)', budgetSuffix: 'B ₩', budgetPh: '1.5', budgetStep: '0.1', budgetScale: 100000, budgetHint: 'In billions of KRW (1 = ₩1,000,000,000). Shows complexes with a unit at or below this.',
    sidoLabel: 'Region — Province/City', guLabel: 'Region — District', optAll: 'All',
    areaLabel: 'Size (exclusive area)', areaAll: 'All', areaSmall: 'Small (~60㎡)', areaMs: 'Standard (60~85㎡)', areaMid: 'Mid (85~102㎡)', areaLarge: 'Large (102㎡~)',
    familyLabel: 'Household size (optional — suggests size)', famNone: 'None', fam1: '1–2 people', fam3: '3 people', fam4: '4+ people',
    ageLabel: 'Max age', ageSuffix: 'yr', agePh: 'e.g. 15',
    subwayLabel: 'Distance to station (max)', elemLabel: 'Distance to elementary (max)', mSuffix: 'm', subwayPh: 'e.g. 500', elemPh: 'e.g. 400',
    houseLabel: 'Min households', houseSuffix: 'units', housePh: 'e.g. 1000',
    commuteLabel: 'Commute to business district', commuteNone: 'None', commuteSuffix: 'min', commutePh: '40', commuteHint: 'Pick a district and a max commute (min); only complexes within that time are shown.',
    parkingLabel: 'Min parking per household', parkingSuffix: '/unit', parkingPh: 'e.g. 1.2',
    ratioLabel: 'Max Jeonse ratio', ratioSuffix: '%', ratioPh: 'e.g. 55', ratioHint: 'A lower ratio tends to mean pricier, more sought-after areas.',
    submit: 'Get recommendations', reset: 'Reset',
    loading: 'Loading complexes…',
    howtoSummary: 'How the total score is calculated',
    howtoP1: 'Each factor is scored 0–100, then combined as a <strong>weighted average</strong> for the total (0–100). Factors with no data or no input are dropped and their weight is redistributed to the rest.',
    thFactor: 'Factor', thWeight: 'Weight', thFormula: 'Score formula (0–100)',
    rows: [
      ['Upside', '23%', 'Trend of recent <strong>price per ㎡</strong> (linear-regression slope → annualized) at 65%, plus <strong>Jeonse ratio</strong> (lower = pricier area) at 35%. +20%/yr = full marks, 0% = 50.'],
      ['Transit', '19%', 'Walking distance to the nearest subway station. ≤300m = 100, ≥1.5km = 0 (linear).'],
      ['School', '19%', 'Distance to the nearest elementary school. ≤150m = 100, ≥1.2km = 0 (linear).'],
      ['Price stability', '14%', 'Lower coefficient of variation (std ÷ mean) of recent prices scores higher. Fewer than 2 samples = neutral (60).'],
      ['Scale', '10%', '≥2,000 households = 100, ≤300 = 20 (linear).'],
      ['Age', '10%', 'Built within 2 years = 100, ≥35 years = 10 (linear).'],
      ['Liquidity', '5%', 'Deals in the last 6 months. ≥15 = 100, 0 = 30.'],
      ['Budget fit', '25%<br/><span style="font-size:0.8em;color:var(--text-muted)">when budget entered</span>', 'Among units at or below budget, closer to your budget scores higher. Entering a budget adds this factor with the largest weight.'],
    ],
    howtoP2: '※ The price trend uses <strong>monthly average price per ㎡</strong> to remove distortion from which unit sizes traded. When a complex has no per-complex Jeonse ratio, the <strong>regional average</strong> is used and marked "(area)" on the card. This score is a <strong>reference indicator</strong> from public transaction/open data and does not guarantee returns.',
    sampleNote: 'Figures are illustrative references. Always verify prices, the property and its legal status in person before signing.',
    close: 'Close', mapAria: 'Complex location map', recentDeals: 'Recent transactions', thDate: 'Date', thAreaPy: 'Area (pyeong)', thAmount: 'Amount', moreLink: 'See full history in Transactions →', noDeals: 'No transaction records.',
    // currency
    curMode: 'bn', curPrefix: '₩', curUnit: 'B',
    // dynamic
    bars: { fit: 'Budget', appreciation: 'Upside', subway: 'Transit', school: 'School', stability: 'Stability', liquidity: 'Liquidity', scale: 'Scale', age: 'Age' },
    rankPre: '#', rankSuf: '', totalScore: 'Total score',
    units: ' units', unitsUnknown: 'Households unknown', noInfo: 'No data', unknown: 'Unknown',
    specSubway: 'To station', specElem: 'Elementary', specBuilt: 'Built', specHouseholds: 'Households', specRatio: 'Jeonse ratio', specParking: 'Parking/unit',
    walk: 'walk', min: ' min', builtYr: '', yrOld: ' yrs old', about: '~', areaAvg: '(area)', perUnit: '/unit', toPrefix: 'To ', toSuffix: '',
    recentDeal: 'recent deal',
    reasons: { subway: '🚇 {station} · {min} min walk', school: '🎒 {name} {dist}m{zone}', scale: '🏙 {n}-unit large complex', age: '🏗 Built {year}, near-new', momentum: '📈 Recent price uptrend', stability: '🛡 Stable prices', commute: '🏢 {hub} {min} min', parking: '🅿 {per}/unit' },
    assigned: ' (assigned)',
    bestLabels: { appreciation: 'Upside', subway: 'Transit', school: 'School', stability: 'Price stability', scale: 'Scale', age: 'Age' }, bestSuffix: ' is the strongest factor',
    relaxedCardPre: '⚠ Didn’t meet <strong>', relaxedCardSuf: '</strong>, but recommended for strong other factors.',
    filterLabels: { budget_max: 'budget', region: 'region', area_type: 'size', max_age_years: 'age', subway_distance_max: 'station distance', elementary_distance_max: 'school distance', min_households: 'households', commute: 'commute', parking_min: 'parking', jeonse_ratio_max: 'Jeonse ratio' },
    countMatch: '<span class="em">{n}</span> complexes match · {sort}', countUnit: '',
    countRelaxed: 'No exact match — showing <span class="em">slightly relaxed</span> picks',
    relaxedBanner: 'No complex met every condition, but these match if you relax 1–2 conditions — try widening the filters.',
    noMatch: 'No matching complexes', emptyRelax: 'Try relaxing your conditions.',
    more: 'Show more', moreLeft: '{n} left',
    initialEmpty: 'Enter <strong>a keyword or at least one condition</strong> on the left<br/>and we’ll rank matching complexes by overall score',
    loadFail: 'Could not load data. Please try again shortly.',
    sortLabelsShort: { score: 'highest score', price_asc: 'lowest price', price_desc: 'highest price', recent: 'most recent', momentum: 'strongest momentum' },
    mLatest: 'Latest deal', mDeals: 'Deals', mAvg: 'Average', mBuilt: 'Built', mHouseholds: 'Households', mStation: 'Nearest station', mElem: 'Elementary', mRatio: 'Jeonse ratio', mParking: 'Parking/unit', dealsCnt: '', py: 'py', ago: { today: 'today', d: ' days ago', mo: ' months ago', y: ' years ago' },
  },
  'zh-Hans': {
    title: '定制找房', metaDesc: '输入预算、地区、户型、房龄、离地铁/小学距离、户数，即可按综合评分排序推荐单个小区。只填几项也行。',
    home: '首页', h1: '定制找房',
    intro: '只需输入条件，系统就按上涨预期、地铁、学区等为小区打分。<strong>输入预算后，接近该价位的小区会优先显示。</strong> ',
    howtoToggle: '评分方式 ▾',
    condH: '输入条件', searchLabel: '小区名·关键词', searchPh: '헬리오시티, 래미안', searchHint: '按小区名或地区名查找',
    searchNote: '⌨️ 搜索仅匹配韩文——请输入韩文名称（例：헬리오시티）或地区名。“Helio” 等罗马字不会命中。下方地区下拉框以英文显示供参考。',
    sortLabel: '排序', sortScore: '综合评分从高到低', sortPriceAsc: '价格从低到高', sortPriceDesc: '价格从高到低', sortRecent: '最近成交优先', sortMomentum: '上涨动能优先',
    budgetLabel: '预算（上限）', budgetSuffix: '亿', budgetPh: '15', budgetStep: '0.5', budgetScale: 10000, budgetHint: '单位为亿韩元（1＝1亿韩元）。仅推荐存在不超过此价位户型的小区。',
    sidoLabel: '地区 — 市·道', guLabel: '地区 — 市·郡·区', optAll: '全部',
    areaLabel: '户型（专用面积）', areaAll: '全部', areaSmall: '小户型（~60㎡）', areaMs: '国民户型（60~85㎡）', areaMid: '中户型（85~102㎡）', areaLarge: '大户型（102㎡~）',
    familyLabel: '家庭人数（可选 — 推荐户型）', famNone: '不选', fam1: '1~2人', fam3: '3人', fam4: '4人以上',
    ageLabel: '最大房龄', ageSuffix: '年', agePh: '例：15',
    subwayLabel: '离地铁站距离（上限）', elemLabel: '离小学距离（上限）', mSuffix: 'm', subwayPh: '例：500', elemPh: '例：400',
    houseLabel: '最少户数', houseSuffix: '户', housePh: '例：1000',
    commuteLabel: '到商务区通勤', commuteNone: '不选', commuteSuffix: '分', commutePh: '40', commuteHint: '选择商务区并填最大通勤时间（分钟），只推荐在此时间内的小区。',
    parkingLabel: '每户最少车位', parkingSuffix: '辆', parkingPh: '例：1.2',
    ratioLabel: '全租率上限', ratioSuffix: '%', ratioPh: '例：55', ratioHint: '比率越低，通常越是价差大的高档地段。',
    submit: '获取推荐', reset: '重置',
    loading: '正在加载小区…',
    howtoSummary: '综合评分的计算方式',
    howtoP1: '各项先按 0~100 打分，再<strong>按下列权重加权平均</strong>得到综合评分（0~100）。无数据或未填写的项从计算中剔除，其权重自动分配给其余项。',
    thFactor: '项目', thWeight: '权重', thFormula: '评分算式（0~100）',
    rows: [
      ['上涨预期', '23%', '近期实际成交<strong>每㎡单价</strong>的趋势（线性回归斜率→年化）占65%，<strong>全租率</strong>（越低越是高档地段）占35%。年+20%满分，0%为50分。'],
      ['地铁', '19%', '到最近地铁站的步行距离。≤300m 100分，≥1.5km 0分（线性）。'],
      ['学区', '19%', '到最近小学的距离。≤150m 100分，≥1.2km 0分（线性）。'],
      ['成交稳定', '14%', '近期成交价的变异系数（标准差÷均值）越小越加分。样本少于2笔为中性（60分）。'],
      ['小区规模', '10%', '≥2,000户 100分，≤300户 20分（线性）。'],
      ['房龄', '10%', '竣工2年内 100分，≥35年 10分（线性）。'],
      ['成交活跃', '5%', '近6个月成交笔数。≥15笔 100分，0笔 30分。'],
      ['预算契合', '25%<br/><span style="font-size:0.8em;color:var(--text-muted)">填预算时</span>', '在不超预算的户型中，越接近预算越加分。填了预算才加入此项，且权重最大。'],
    ],
    howtoP2: '※ 价格趋势按<strong>每月每㎡均价</strong>计算，以消除成交户型不同带来的失真。小区无自有全租率时使用<strong>地区平均</strong>，并在卡片上标注“(地区)”。本评分为公开成交·公共数据的<strong>参考指标</strong>，不保证投资收益。',
    sampleNote: '所示信息为参考示例，签约前请务必亲自核实成交价、现场与权利关系。',
    close: '关闭', mapAria: '小区位置地图', recentDeals: '最近成交', thDate: '成交日', thAreaPy: '专用（坪）', thAmount: '金额', moreLink: '在成交价查询查看全部记录 →', noDeals: '暂无成交记录。',
    curMode: 'eok', curPrefix: '', curUnit: '亿',
    bars: { fit: '预算', appreciation: '上涨', subway: '地铁', school: '学区', stability: '稳定', liquidity: '活跃', scale: '规模', age: '房龄' },
    rankPre: '第', rankSuf: '名', totalScore: '综合评分',
    units: '户', unitsUnknown: '户数不详', noInfo: '无信息', unknown: '不详',
    specSubway: '离地铁', specElem: '小学', specBuilt: '竣工', specHouseholds: '户数', specRatio: '全租率', specParking: '每户车位',
    walk: '步行', min: '分', builtYr: '年', yrOld: '年', about: '约', areaAvg: '(地区)', perUnit: '辆', toPrefix: '到', toSuffix: '',
    recentDeal: '近期成交',
    reasons: { subway: '🚇 {station} 步行{min}分', school: '🎒 {name} {dist}m{zone}', scale: '🏙 {n}户大型社区', age: '🏗 竣工{year}年 准新房', momentum: '📈 近期成交上涨', stability: '🛡 成交价稳定', commute: '🏢 {hub} {min}分', parking: '🅿 每户{per}辆' },
    assigned: ' 划片',
    bestLabels: { appreciation: '上涨预期', subway: '交通', school: '学区', stability: '成交稳定', scale: '小区规模', age: '房龄' }, bestSuffix: '项最佳',
    relaxedCardPre: '⚠ 未满足 <strong>', relaxedCardSuf: '</strong>，但其他条件优秀故推荐。',
    filterLabels: { budget_max: '预算', region: '地区', area_type: '户型', max_age_years: '房龄', subway_distance_max: '离地铁', elementary_distance_max: '离小学', min_households: '户数', commute: '通勤', parking_min: '车位', jeonse_ratio_max: '全租率' },
    countMatch: '符合条件的小区 <span class="em">{n}</span> 个 · {sort}', countUnit: '',
    countRelaxed: '没有完全匹配，为您<span class="em">略微放宽条件</span>推荐',
    relaxedBanner: '没有满足全部条件的小区，但放宽1~2个条件即可匹配 — 试试放宽筛选。',
    noMatch: '没有符合条件的小区', emptyRelax: '请放宽条件后重试。',
    more: '显示更多', moreLeft: '还有 {n} 个',
    initialEmpty: '在左侧输入<strong>关键词或至少一个条件</strong><br/>我们会按综合评分为您排序推荐',
    loadFail: '数据加载失败，请稍后重试。',
    sortLabelsShort: { score: '评分从高到低', price_asc: '价格从低到高', price_desc: '价格从高到低', recent: '最近成交', momentum: '上涨动能' },
    mLatest: '最近成交', mDeals: '成交笔数', mAvg: '平均价', mBuilt: '竣工', mHouseholds: '户数', mStation: '最近车站', mElem: '小学', mRatio: '全租率', mParking: '每户车位', dealsCnt: '笔', py: '坪', ago: { today: '今天', d: '天前', mo: '个月前', y: '年前' },
  },
  'zh-Hant': {
    title: '定制找房', metaDesc: '輸入預算、地區、坪型、屋齡、離捷運/小學距離、戶數，即可按綜合評分排序推薦社區。只填幾項也行。',
    home: '首頁', h1: '定制找房',
    intro: '只需輸入條件，系統就按上漲預期、捷運、學區等為社區打分。<strong>輸入預算後，接近該價位的社區會優先顯示。</strong> ',
    howtoToggle: '評分方式 ▾',
    condH: '輸入條件', searchLabel: '社區名·關鍵詞', searchPh: '헬리오시티, 래미안', searchHint: '按社區名或地區名查找',
    searchNote: '⌨️ 搜尋僅比對韓文——請輸入韓文名稱（例：헬리오시티）或地區名。「Helio」等羅馬字不會命中。下方地區下拉選單以英文顯示供參考。',
    sortLabel: '排序', sortScore: '綜合評分從高到低', sortPriceAsc: '價格從低到高', sortPriceDesc: '價格從高到低', sortRecent: '最近成交優先', sortMomentum: '上漲動能優先',
    budgetLabel: '預算（上限）', budgetSuffix: '億', budgetPh: '15', budgetStep: '0.5', budgetScale: 10000, budgetHint: '單位為億韓元（1＝1億韓元）。僅推薦存在不超過此價位坪型的社區。',
    sidoLabel: '地區 — 市·道', guLabel: '地區 — 市·郡·區', optAll: '全部',
    areaLabel: '坪型（專用面積）', areaAll: '全部', areaSmall: '小坪型（~60㎡）', areaMs: '國民坪型（60~85㎡）', areaMid: '中坪型（85~102㎡）', areaLarge: '大坪型（102㎡~）',
    familyLabel: '家庭人數（可選 — 推薦坪型）', famNone: '不選', fam1: '1~2人', fam3: '3人', fam4: '4人以上',
    ageLabel: '最大屋齡', ageSuffix: '年', agePh: '例：15',
    subwayLabel: '離捷運站距離（上限）', elemLabel: '離小學距離（上限）', mSuffix: 'm', subwayPh: '例：500', elemPh: '例：400',
    houseLabel: '最少戶數', houseSuffix: '戶', housePh: '例：1000',
    commuteLabel: '到商務區通勤', commuteNone: '不選', commuteSuffix: '分', commutePh: '40', commuteHint: '選擇商務區並填最大通勤時間（分鐘），只推薦在此時間內的社區。',
    parkingLabel: '每戶最少車位', parkingSuffix: '輛', parkingPh: '例：1.2',
    ratioLabel: '全租率上限', ratioSuffix: '%', ratioPh: '例：55', ratioHint: '比率越低，通常越是價差大的高檔地段。',
    submit: '取得推薦', reset: '重設',
    loading: '正在載入社區…',
    howtoSummary: '綜合評分的計算方式',
    howtoP1: '各項先按 0~100 打分，再<strong>按下列權重加權平均</strong>得到綜合評分（0~100）。無資料或未填寫的項從計算中剔除，其權重自動分配給其餘項。',
    thFactor: '項目', thWeight: '權重', thFormula: '評分算式（0~100）',
    rows: [
      ['上漲預期', '23%', '近期實際成交<strong>每㎡單價</strong>的趨勢（線性回歸斜率→年化）佔65%，<strong>全租率</strong>（越低越是高檔地段）佔35%。年+20%滿分，0%為50分。'],
      ['捷運', '19%', '到最近捷運站的步行距離。≤300m 100分，≥1.5km 0分（線性）。'],
      ['學區', '19%', '到最近小學的距離。≤150m 100分，≥1.2km 0分（線性）。'],
      ['成交穩定', '14%', '近期成交價的變異係數（標準差÷均值）越小越加分。樣本少於2筆為中性（60分）。'],
      ['社區規模', '10%', '≥2,000戶 100分，≤300戶 20分（線性）。'],
      ['屋齡', '10%', '竣工2年內 100分，≥35年 10分（線性）。'],
      ['成交活躍', '5%', '近6個月成交筆數。≥15筆 100分，0筆 30分。'],
      ['預算契合', '25%<br/><span style="font-size:0.8em;color:var(--text-muted)">填預算時</span>', '在不超預算的坪型中，越接近預算越加分。填了預算才加入此項，且權重最大。'],
    ],
    howtoP2: '※ 價格趨勢按<strong>每月每㎡均價</strong>計算，以消除成交坪型不同帶來的失真。社區無自有全租率時使用<strong>地區平均</strong>，並在卡片上標註「(地區)」。本評分為公開成交·公共資料的<strong>參考指標</strong>，不保證投資收益。',
    sampleNote: '所示資訊為參考範例，簽約前請務必親自核實成交價、現場與權利關係。',
    close: '關閉', mapAria: '社區位置地圖', recentDeals: '最近成交', thDate: '成交日', thAreaPy: '專用（坪）', thAmount: '金額', moreLink: '在成交價查詢查看全部紀錄 →', noDeals: '暫無成交紀錄。',
    curMode: 'eok', curPrefix: '', curUnit: '億',
    bars: { fit: '預算', appreciation: '上漲', subway: '捷運', school: '學區', stability: '穩定', liquidity: '活躍', scale: '規模', age: '屋齡' },
    rankPre: '第', rankSuf: '名', totalScore: '綜合評分',
    units: '戶', unitsUnknown: '戶數不詳', noInfo: '無資訊', unknown: '不詳',
    specSubway: '離捷運', specElem: '小學', specBuilt: '竣工', specHouseholds: '戶數', specRatio: '全租率', specParking: '每戶車位',
    walk: '步行', min: '分', builtYr: '年', yrOld: '年', about: '約', areaAvg: '(地區)', perUnit: '輛', toPrefix: '到', toSuffix: '',
    recentDeal: '近期成交',
    reasons: { subway: '🚇 {station} 步行{min}分', school: '🎒 {name} {dist}m{zone}', scale: '🏙 {n}戶大型社區', age: '🏗 竣工{year}年 準新房', momentum: '📈 近期成交上漲', stability: '🛡 成交價穩定', commute: '🏢 {hub} {min}分', parking: '🅿 每戶{per}輛' },
    assigned: ' 劃片',
    bestLabels: { appreciation: '上漲預期', subway: '交通', school: '學區', stability: '成交穩定', scale: '社區規模', age: '屋齡' }, bestSuffix: '項最佳',
    relaxedCardPre: '⚠ 未滿足 <strong>', relaxedCardSuf: '</strong>，但其他條件優秀故推薦。',
    filterLabels: { budget_max: '預算', region: '地區', area_type: '坪型', max_age_years: '屋齡', subway_distance_max: '離捷運', elementary_distance_max: '離小學', min_households: '戶數', commute: '通勤', parking_min: '車位', jeonse_ratio_max: '全租率' },
    countMatch: '符合條件的社區 <span class="em">{n}</span> 個 · {sort}', countUnit: '',
    countRelaxed: '沒有完全匹配，為您<span class="em">略微放寬條件</span>推薦',
    relaxedBanner: '沒有滿足全部條件的社區，但放寬1~2個條件即可匹配 — 試試放寬篩選。',
    noMatch: '沒有符合條件的社區', emptyRelax: '請放寬條件後重試。',
    more: '顯示更多', moreLeft: '還有 {n} 個',
    initialEmpty: '在左側輸入<strong>關鍵詞或至少一個條件</strong><br/>我們會按綜合評分為您排序推薦',
    loadFail: '資料載入失敗，請稍後重試。',
    sortLabelsShort: { score: '評分從高到低', price_asc: '價格從低到高', price_desc: '價格從高到低', recent: '最近成交', momentum: '上漲動能' },
    mLatest: '最近成交', mDeals: '成交筆數', mAvg: '平均價', mBuilt: '竣工', mHouseholds: '戶數', mStation: '最近車站', mElem: '小學', mRatio: '全租率', mParking: '每戶車位', dealsCnt: '筆', py: '坪', ago: { today: '今天', d: '天前', mo: '個月前', y: '年前' },
  },
  vi: {
    title: 'Tìm nhà theo nhu cầu', metaDesc: 'Nhập ngân sách, khu vực, diện tích, tuổi nhà, khoảng cách tới ga/trường và số căn hộ — các chung cư được xếp hạng theo điểm tổng hợp. Chỉ vài điều kiện là đủ.',
    home: 'Trang chủ', h1: 'Tìm nhà theo nhu cầu',
    intro: 'Chỉ cần nhập điều kiện, chung cư được chấm điểm theo kỳ vọng tăng giá, gần ga, tuyến trường… <strong>Nhập ngân sách thì các chung cư gần mức giá đó hiện trước.</strong> ',
    howtoToggle: 'Cách tính điểm ▾',
    condH: 'Nhập điều kiện', searchLabel: 'Tên chung cư · từ khóa', searchPh: '헬리오시티, 래미안', searchHint: 'Tìm theo tên chung cư hoặc khu vực',
    searchNote: '⌨️ Tìm kiếm chỉ khớp tiếng Hàn — hãy gõ tên tiếng Hàn (vd: 헬리오시티) hoặc khu vực. Chữ La-tinh như “Helio” sẽ không khớp. Danh sách khu vực bên dưới hiển thị bằng tiếng Anh để tham khảo.',
    sortLabel: 'Sắp xếp', sortScore: 'Điểm cao nhất', sortPriceAsc: 'Giá thấp nhất', sortPriceDesc: 'Giá cao nhất', sortRecent: 'Giao dịch gần nhất', sortMomentum: 'Đà tăng mạnh nhất',
    budgetLabel: 'Ngân sách (tối đa)', budgetSuffix: 'tỷ ₩', budgetPh: '1.5', budgetStep: '0.1', budgetScale: 100000, budgetHint: 'Đơn vị tỷ KRW (1 = 1.000.000.000 KRW). Chỉ gợi ý chung cư có căn ≤ mức này.',
    sidoLabel: 'Khu vực — Tỉnh/Thành', guLabel: 'Khu vực — Quận/Huyện', optAll: 'Tất cả',
    areaLabel: 'Diện tích (sử dụng)', areaAll: 'Tất cả', areaSmall: 'Nhỏ (~60㎡)', areaMs: 'Phổ thông (60~85㎡)', areaMid: 'Trung (85~102㎡)', areaLarge: 'Lớn (102㎡~)',
    familyLabel: 'Số người (tùy chọn — gợi ý diện tích)', famNone: 'Không chọn', fam1: '1–2 người', fam3: '3 người', fam4: '4+ người',
    ageLabel: 'Tuổi nhà tối đa', ageSuffix: 'năm', agePh: 'vd: 15',
    subwayLabel: 'Khoảng cách tới ga (tối đa)', elemLabel: 'Khoảng cách tới tiểu học (tối đa)', mSuffix: 'm', subwayPh: 'vd: 500', elemPh: 'vd: 400',
    houseLabel: 'Số căn hộ tối thiểu', houseSuffix: 'căn', housePh: 'vd: 1000',
    commuteLabel: 'Đi làm tới khu văn phòng', commuteNone: 'Không chọn', commuteSuffix: 'phút', commutePh: '40', commuteHint: 'Chọn khu văn phòng và thời gian tối đa (phút); chỉ hiện chung cư trong khoảng đó.',
    parkingLabel: 'Chỗ đỗ tối thiểu/căn', parkingSuffix: 'chỗ', parkingPh: 'vd: 1.2',
    ratioLabel: 'Trần tỷ lệ Jeonse', ratioSuffix: '%', ratioPh: 'vd: 55', ratioHint: 'Tỷ lệ càng thấp thường là khu đắt, được ưa chuộng hơn.',
    submit: 'Nhận gợi ý', reset: 'Đặt lại',
    loading: 'Đang tải chung cư…',
    howtoSummary: 'Cách tính điểm tổng hợp',
    howtoP1: 'Mỗi yếu tố được chấm 0–100, rồi <strong>lấy trung bình có trọng số</strong> thành điểm tổng (0–100). Yếu tố không có dữ liệu hoặc chưa nhập sẽ bị loại và trọng số phân bổ lại cho phần còn lại.',
    thFactor: 'Yếu tố', thWeight: 'Trọng số', thFormula: 'Công thức điểm (0–100)',
    rows: [
      ['Kỳ vọng tăng', '23%', 'Xu hướng <strong>giá/㎡</strong> gần đây (độ dốc hồi quy → quy năm) 65%, cộng <strong>tỷ lệ Jeonse</strong> (càng thấp càng là khu cao cấp) 35%. +20%/năm = tối đa, 0% = 50.'],
      ['Gần ga', '19%', 'Khoảng cách đi bộ tới ga gần nhất. ≤300m = 100, ≥1.5km = 0 (tuyến tính).'],
      ['Trường học', '19%', 'Khoảng cách tới tiểu học gần nhất. ≤150m = 100, ≥1.2km = 0 (tuyến tính).'],
      ['Ổn định giá', '14%', 'Hệ số biến thiên (độ lệch chuẩn ÷ trung bình) của giá gần đây càng nhỏ càng cao điểm. Dưới 2 mẫu = trung tính (60).'],
      ['Quy mô', '10%', '≥2.000 căn = 100, ≤300 = 20 (tuyến tính).'],
      ['Tuổi nhà', '10%', 'Xây trong 2 năm = 100, ≥35 năm = 10 (tuyến tính).'],
      ['Thanh khoản', '5%', 'Số giao dịch 6 tháng qua. ≥15 = 100, 0 = 30.'],
      ['Hợp ngân sách', '25%<br/><span style="font-size:0.8em;color:var(--text-muted)">khi nhập ngân sách</span>', 'Trong các căn ≤ ngân sách, càng gần ngân sách càng cao điểm. Nhập ngân sách sẽ thêm yếu tố này với trọng số lớn nhất.'],
    ],
    howtoP2: '※ Xu hướng giá dùng <strong>giá trung bình/㎡ theo tháng</strong> để loại méo do loại diện tích giao dịch. Khi chung cư không có tỷ lệ Jeonse riêng, dùng <strong>trung bình khu vực</strong> và ghi "(khu vực)" trên thẻ. Điểm này là <strong>chỉ báo tham khảo</strong> từ dữ liệu giao dịch/công khai, không đảm bảo lợi nhuận.',
    sampleNote: 'Số liệu chỉ mang tính minh họa tham khảo. Luôn tự kiểm tra giá, hiện trạng và tình trạng pháp lý trước khi ký.',
    close: 'Đóng', mapAria: 'Bản đồ vị trí chung cư', recentDeals: 'Giao dịch gần đây', thDate: 'Ngày', thAreaPy: 'Diện tích (pyeong)', thAmount: 'Số tiền', moreLink: 'Xem toàn bộ tại Tra giá giao dịch →', noDeals: 'Không có dữ liệu giao dịch.',
    curMode: 'bn', curPrefix: '₩', curUnit: ' tỷ',
    bars: { fit: 'Ngân sách', appreciation: 'Tăng giá', subway: 'Gần ga', school: 'Trường', stability: 'Ổn định', liquidity: 'Thanh khoản', scale: 'Quy mô', age: 'Tuổi nhà' },
    rankPre: '#', rankSuf: '', totalScore: 'Điểm tổng',
    units: ' căn', unitsUnknown: 'Không rõ số căn', noInfo: 'Không có', unknown: 'Không rõ',
    specSubway: 'Tới ga', specElem: 'Tiểu học', specBuilt: 'Xây', specHouseholds: 'Số căn', specRatio: 'Tỷ lệ Jeonse', specParking: 'Đỗ/căn',
    walk: 'đi bộ', min: ' phút', builtYr: '', yrOld: ' năm', about: '~', areaAvg: '(khu vực)', perUnit: ' chỗ', toPrefix: 'Tới ', toSuffix: '',
    recentDeal: 'giao dịch gần đây',
    reasons: { subway: '🚇 {station} · đi bộ {min} phút', school: '🎒 {name} {dist}m{zone}', scale: '🏙 Đại đô thị {n} căn', age: '🏗 Xây {year}, gần như mới', momentum: '📈 Giá gần đây tăng', stability: '🛡 Giá ổn định', commute: '🏢 {hub} {min} phút', parking: '🅿 {per}/căn' },
    assigned: ' (tuyến)',
    bestLabels: { appreciation: 'Kỳ vọng tăng', subway: 'Giao thông', school: 'Trường học', stability: 'Ổn định giá', scale: 'Quy mô', age: 'Tuổi nhà' }, bestSuffix: ' là yếu tố mạnh nhất',
    relaxedCardPre: '⚠ Chưa đạt <strong>', relaxedCardSuf: '</strong>, nhưng vẫn gợi ý vì các yếu tố khác tốt.',
    filterLabels: { budget_max: 'ngân sách', region: 'khu vực', area_type: 'diện tích', max_age_years: 'tuổi nhà', subway_distance_max: 'khoảng cách ga', elementary_distance_max: 'khoảng cách trường', min_households: 'số căn', commute: 'đi làm', parking_min: 'đỗ xe', jeonse_ratio_max: 'tỷ lệ Jeonse' },
    countMatch: '<span class="em">{n}</span> chung cư phù hợp · {sort}', countUnit: '',
    countRelaxed: 'Không khớp chính xác — gợi ý <span class="em">nới lỏng đôi chút</span>',
    relaxedBanner: 'Không chung cư nào đạt mọi điều kiện, nhưng khớp nếu nới 1–2 điều kiện — hãy mở rộng bộ lọc.',
    noMatch: 'Không có chung cư phù hợp', emptyRelax: 'Hãy nới điều kiện và thử lại.',
    more: 'Xem thêm', moreLeft: 'còn {n}',
    initialEmpty: 'Nhập <strong>từ khóa hoặc ít nhất một điều kiện</strong> ở bên trái<br/>chúng tôi sẽ xếp hạng chung cư phù hợp theo điểm tổng hợp',
    loadFail: 'Không tải được dữ liệu. Vui lòng thử lại sau.',
    sortLabelsShort: { score: 'điểm cao nhất', price_asc: 'giá thấp nhất', price_desc: 'giá cao nhất', recent: 'gần nhất', momentum: 'đà tăng mạnh' },
    mLatest: 'Gần nhất', mDeals: 'Số giao dịch', mAvg: 'Trung bình', mBuilt: 'Xây', mHouseholds: 'Số căn', mStation: 'Ga gần nhất', mElem: 'Tiểu học', mRatio: 'Tỷ lệ Jeonse', mParking: 'Đỗ/căn', dealsCnt: '', py: 'pyeong', ago: { today: 'hôm nay', d: ' ngày trước', mo: ' tháng trước', y: ' năm trước' },
  },
  th: {
    title: 'ค้นหาบ้านตามใจ', metaDesc: 'กรอกงบประมาณ พื้นที่ ขนาด อายุอาคาร ระยะถึงสถานี/โรงเรียน และจำนวนยูนิต ระบบจัดอันดับโครงการตามคะแนนรวม กรอกไม่กี่ข้อก็พอ',
    home: 'หน้าแรก', h1: 'ค้นหาบ้านตามใจ',
    intro: 'แค่กรอกเงื่อนไข ระบบให้คะแนนโครงการตามโอกาสราคาขึ้น ใกล้รถไฟ เขตโรงเรียน ฯลฯ <strong>กรอกงบแล้วโครงการใกล้ระดับราคานั้นจะแสดงก่อน</strong> ',
    howtoToggle: 'วิธีให้คะแนน ▾',
    condH: 'กรอกเงื่อนไข', searchLabel: 'ชื่อโครงการ · คำค้น', searchPh: '헬리오시티, 래미안', searchHint: 'ค้นด้วยชื่อโครงการหรือพื้นที่',
    searchNote: '⌨️ การค้นหาจับคู่เฉพาะภาษาเกาหลี — พิมพ์ชื่อภาษาเกาหลี (เช่น 헬리오시티) หรือชื่อพื้นที่ อักษรโรมันเช่น “Helio” จะไม่ตรง รายการพื้นที่ด้านล่างแสดงเป็นภาษาอังกฤษเพื่ออ้างอิง',
    sortLabel: 'จัดเรียง', sortScore: 'คะแนนสูงสุด', sortPriceAsc: 'ราคาต่ำสุด', sortPriceDesc: 'ราคาสูงสุด', sortRecent: 'ซื้อขายล่าสุด', sortMomentum: 'โมเมนตัมแรงสุด',
    budgetLabel: 'งบประมาณ (สูงสุด)', budgetSuffix: 'พันล้าน', budgetPh: '1.5', budgetStep: '0.1', budgetScale: 100000, budgetHint: 'หน่วยพันล้านวอน (1 = 1,000,000,000 วอน) แสดงเฉพาะโครงการที่มียูนิต ≤ ระดับนี้',
    sidoLabel: 'พื้นที่ — จังหวัด', guLabel: 'พื้นที่ — เขต/อำเภอ', optAll: 'ทั้งหมด',
    areaLabel: 'ขนาด (พื้นที่ใช้สอย)', areaAll: 'ทั้งหมด', areaSmall: 'เล็ก (~60㎡)', areaMs: 'มาตรฐาน (60~85㎡)', areaMid: 'กลาง (85~102㎡)', areaLarge: 'ใหญ่ (102㎡~)',
    familyLabel: 'จำนวนคน (ไม่บังคับ — แนะนำขนาด)', famNone: 'ไม่เลือก', fam1: '1–2 คน', fam3: '3 คน', fam4: '4 คนขึ้นไป',
    ageLabel: 'อายุอาคารสูงสุด', ageSuffix: 'ปี', agePh: 'เช่น 15',
    subwayLabel: 'ระยะถึงสถานี (สูงสุด)', elemLabel: 'ระยะถึงโรงเรียนประถม (สูงสุด)', mSuffix: 'm', subwayPh: 'เช่น 500', elemPh: 'เช่น 400',
    houseLabel: 'จำนวนยูนิตขั้นต่ำ', houseSuffix: 'ยูนิต', housePh: 'เช่น 1000',
    commuteLabel: 'เดินทางไปย่านธุรกิจ', commuteNone: 'ไม่เลือก', commuteSuffix: 'นาที', commutePh: '40', commuteHint: 'เลือกย่านธุรกิจและเวลาเดินทางสูงสุด (นาที) จะแสดงเฉพาะโครงการในเวลานั้น',
    parkingLabel: 'ที่จอดขั้นต่ำต่อยูนิต', parkingSuffix: 'คัน', parkingPh: 'เช่น 1.2',
    ratioLabel: 'เพดานอัตรา Jeonse', ratioSuffix: '%', ratioPh: 'เช่น 55', ratioHint: 'อัตรายิ่งต่ำมักเป็นย่านราคาสูงและเป็นที่ต้องการมากกว่า',
    submit: 'รับคำแนะนำ', reset: 'รีเซ็ต',
    loading: 'กำลังโหลดโครงการ…',
    howtoSummary: 'วิธีคำนวณคะแนนรวม',
    howtoP1: 'แต่ละปัจจัยให้คะแนน 0–100 แล้ว<strong>ถัวเฉลี่ยแบบถ่วงน้ำหนัก</strong>เป็นคะแนนรวม (0–100) ปัจจัยที่ไม่มีข้อมูลหรือไม่ได้กรอกจะถูกตัดออก และกระจายน้ำหนักไปยังปัจจัยที่เหลือ',
    thFactor: 'ปัจจัย', thWeight: 'น้ำหนัก', thFormula: 'สูตรคะแนน (0–100)',
    rows: [
      ['โอกาสขึ้นราคา', '23%', 'แนวโน้ม<strong>ราคาต่อ㎡</strong>ล่าสุด (ความชันถดถอย → ต่อปี) 65% บวก<strong>อัตรา Jeonse</strong> (ยิ่งต่ำยิ่งเป็นย่านพรีเมียม) 35% +20%/ปี = เต็ม, 0% = 50'],
      ['ใกล้รถไฟ', '19%', 'ระยะเดินถึงสถานีใกล้สุด ≤300m = 100, ≥1.5km = 0 (เชิงเส้น)'],
      ['เขตโรงเรียน', '19%', 'ระยะถึงโรงเรียนประถมใกล้สุด ≤150m = 100, ≥1.2km = 0 (เชิงเส้น)'],
      ['เสถียรราคา', '14%', 'ค่าสัมประสิทธิ์การผันแปร (SD ÷ ค่าเฉลี่ย) ของราคาล่าสุดยิ่งต่ำยิ่งได้คะแนน ต่ำกว่า 2 ตัวอย่าง = กลาง (60)'],
      ['ขนาดโครงการ', '10%', '≥2,000 ยูนิต = 100, ≤300 = 20 (เชิงเส้น)'],
      ['อายุอาคาร', '10%', 'สร้างภายใน 2 ปี = 100, ≥35 ปี = 10 (เชิงเส้น)'],
      ['สภาพคล่อง', '5%', 'จำนวนซื้อขาย 6 เดือนล่าสุด ≥15 = 100, 0 = 30'],
      ['เข้ากับงบ', '25%<br/><span style="font-size:0.8em;color:var(--text-muted)">เมื่อกรอกงบ</span>', 'ในยูนิตที่ ≤ งบ ยิ่งใกล้งบยิ่งได้คะแนน การกรอกงบจะเพิ่มปัจจัยนี้ด้วยน้ำหนักสูงสุด'],
    ],
    howtoP2: '※ แนวโน้มราคาใช้<strong>ราคาเฉลี่ยต่อ㎡รายเดือน</strong>เพื่อลดความบิดเบือนจากขนาดที่ซื้อขาย เมื่อโครงการไม่มีอัตรา Jeonse ของตัวเอง จะใช้<strong>ค่าเฉลี่ยพื้นที่</strong>และระบุ "(พื้นที่)" บนการ์ด คะแนนนี้เป็น<strong>ตัวชี้วัดอ้างอิง</strong>จากข้อมูลซื้อขาย/ข้อมูลเปิด ไม่รับประกันผลตอบแทน',
    sampleNote: 'ตัวเลขเป็นตัวอย่างอ้างอิง โปรดตรวจสอบราคา สถานที่จริง และสถานะทางกฎหมายด้วยตนเองก่อนเซ็นสัญญาเสมอ',
    close: 'ปิด', mapAria: 'แผนที่ตำแหน่งโครงการ', recentDeals: 'ซื้อขายล่าสุด', thDate: 'วันที่', thAreaPy: 'พื้นที่ (พยอง)', thAmount: 'จำนวนเงิน', moreLink: 'ดูทั้งหมดที่ค้นราคาซื้อขาย →', noDeals: 'ไม่มีข้อมูลการซื้อขาย',
    curMode: 'bn', curPrefix: '₩', curUnit: ' พันล้าน',
    bars: { fit: 'งบ', appreciation: 'ขึ้นราคา', subway: 'ใกล้รถไฟ', school: 'โรงเรียน', stability: 'เสถียร', liquidity: 'สภาพคล่อง', scale: 'ขนาด', age: 'อายุ' },
    rankPre: '#', rankSuf: '', totalScore: 'คะแนนรวม',
    units: ' ยูนิต', unitsUnknown: 'ไม่ทราบจำนวนยูนิต', noInfo: 'ไม่มีข้อมูล', unknown: 'ไม่ทราบ',
    specSubway: 'ถึงสถานี', specElem: 'ประถม', specBuilt: 'สร้าง', specHouseholds: 'ยูนิต', specRatio: 'อัตรา Jeonse', specParking: 'จอด/ยูนิต',
    walk: 'เดิน', min: ' นาที', builtYr: '', yrOld: ' ปี', about: '~', areaAvg: '(พื้นที่)', perUnit: ' คัน', toPrefix: 'ถึง ', toSuffix: '',
    recentDeal: 'ซื้อขายล่าสุด',
    reasons: { subway: '🚇 {station} · เดิน {min} นาที', school: '🎒 {name} {dist}m{zone}', scale: '🏙 โครงการใหญ่ {n} ยูนิต', age: '🏗 สร้างปี {year} เกือบใหม่', momentum: '📈 ราคาล่าสุดขาขึ้น', stability: '🛡 ราคานิ่ง', commute: '🏢 {hub} {min} นาที', parking: '🅿 {per}/ยูนิต' },
    assigned: ' (เขต)',
    bestLabels: { appreciation: 'โอกาสขึ้นราคา', subway: 'คมนาคม', school: 'เขตโรงเรียน', stability: 'เสถียรราคา', scale: 'ขนาดโครงการ', age: 'อายุอาคาร' }, bestSuffix: ' เด่นที่สุด',
    relaxedCardPre: '⚠ ไม่ผ่าน <strong>', relaxedCardSuf: '</strong> แต่แนะนำเพราะปัจจัยอื่นดีเด่น',
    filterLabels: { budget_max: 'งบ', region: 'พื้นที่', area_type: 'ขนาด', max_age_years: 'อายุ', subway_distance_max: 'ระยะสถานี', elementary_distance_max: 'ระยะโรงเรียน', min_households: 'ยูนิต', commute: 'เดินทาง', parking_min: 'ที่จอด', jeonse_ratio_max: 'อัตรา Jeonse' },
    countMatch: 'โครงการที่ตรง <span class="em">{n}</span> แห่ง · {sort}', countUnit: '',
    countRelaxed: 'ไม่มีที่ตรงพอดี — แนะนำแบบ<span class="em">ผ่อนเงื่อนไขเล็กน้อย</span>',
    relaxedBanner: 'ไม่มีโครงการที่ผ่านทุกเงื่อนไข แต่ผ่านหากผ่อน 1–2 เงื่อนไข ลองขยายตัวกรอง',
    noMatch: 'ไม่มีโครงการที่ตรงเงื่อนไข', emptyRelax: 'โปรดผ่อนเงื่อนไขแล้วลองใหม่',
    more: 'ดูเพิ่มเติม', moreLeft: 'เหลือ {n}',
    initialEmpty: 'กรอก<strong>คำค้นหรืออย่างน้อยหนึ่งเงื่อนไข</strong>ทางซ้าย<br/>เราจะจัดอันดับโครงการที่ตรงตามคะแนนรวม',
    loadFail: 'โหลดข้อมูลไม่สำเร็จ โปรดลองใหม่ภายหลัง',
    sortLabelsShort: { score: 'คะแนนสูงสุด', price_asc: 'ราคาต่ำสุด', price_desc: 'ราคาสูงสุด', recent: 'ล่าสุด', momentum: 'โมเมนตัมแรง' },
    mLatest: 'ล่าสุด', mDeals: 'จำนวนซื้อขาย', mAvg: 'เฉลี่ย', mBuilt: 'สร้าง', mHouseholds: 'ยูนิต', mStation: 'สถานีใกล้สุด', mElem: 'ประถม', mRatio: 'อัตรา Jeonse', mParking: 'จอด/ยูนิต', dealsCnt: ' รายการ', py: 'พยอง', ago: { today: 'วันนี้', d: ' วันก่อน', mo: ' เดือนก่อน', y: ' ปีก่อน' },
  },
};

function head(lang, t) {
  const alts = ['ko', 'en', 'zh-Hans', 'zh-Hant', 'vi', 'th'].map((l) => {
    const href = l === 'ko' ? 'https://topda.kr/calculators/search.html' : `https://topda.kr/${l}/calculators/search.html`;
    return `<link rel="alternate" hreflang="${l}" href="${href}" />`;
  }).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="https://topda.kr/calculators/search.html" />`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6725359021570843" crossorigin="anonymous"></script>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- i18n:review lang=${lang} — ${REVIEW[lang]} -->
<title>${t.title} — TOPDA</title>
<meta name="description" content="${t.metaDesc}" />
<link rel="icon" href="https://topda.kr/assets/images/brand/logo.png" type="image/png" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
<link rel="canonical" href="https://topda.kr/${lang}/calculators/search.html" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TOPDA" />
<meta property="og:title" content="${t.title} — TOPDA" />
<meta property="og:description" content="${t.metaDesc}" />
<meta property="og:url" content="https://topda.kr/${lang}/calculators/search.html" />
<meta property="og:image" content="https://topda.kr/assets/images/brand/logo.png" />
<meta property="og:locale" content="${OG[lang]}" />
${alts}
<script defer src="https://topda.kr/assets/analytics.js?v=3e86e8b800"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
<link rel="stylesheet" href="../../assets/styles.css?v=1315e3db3b" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
${STYLE}
</head>
<body>`;
}

function header(lang, c) {
  return `<header class="site-header">
  <div class="container row">
    <a href="../index.html" class="brand"><span class="brand-mark"></span>TOPDA</a>
    <nav class="nav">
      <a href="../guides.html" data-nav>${c.guides}</a>
      <a href="../calculators/index.html" data-nav class="active">${c.calc}</a>
      <a href="../market.html" data-nav>${c.market}</a>
      <a href="../../checklists/index.html" data-nav>${c.checklists}</a>
      <a href="../../board.html" data-nav>${c.board}</a>
    </nav>
    <button class="nav-toggle" data-nav-toggle aria-label="Menu">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
    </button>
  </div>
  <div class="mobile-menu" data-mobile-menu>
    <a href="../guides.html">${c.guides}</a>
    <a href="../calculators/index.html">${c.calc}</a>
    <a href="../market.html">${c.market}</a>
    <a href="../../checklists/index.html">${c.checklists}</a>
    <a href="../../board.html">${c.board}</a>
    <a href="../../index.html">한국어</a>
  </div>
</header>`;
}

function hubOptions(lang) {
  const d = HUB_DISPLAY[lang];
  return ['강남', '판교', '여의도', '광화문'].map((k) => `            <option value="${k}">${d[k]}</option>`).join('\n');
}

function howtoRows(t) {
  return t.rows.map((r) => `          <tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('\n');
}

function main(lang, t) {
  return `<main class="container">
  <div class="article-header" style="margin-bottom: 8px;">
    <div class="breadcrumb"><a href="../index.html">${t.home}</a> / <a href="../market.html">${CHROME[lang].market}</a> / ${t.title}</div>
    <h1 style="margin-bottom: 4px;">${t.h1}</h1>
    <p class="finder-intro" style="margin: 0;">${t.intro}<button type="button" class="finder-howto-toggle" data-finder-howto>${t.howtoToggle}</button></p>
  </div>

  <div class="finder-layout">
    <form class="finder-panel" id="finderForm" autocomplete="off">
      <h2>${t.condH}</h2>

      <div class="finder-field">
        <label for="f-search">${t.searchLabel}</label>
        <input id="f-search" name="search" type="search" placeholder="${t.searchPh}" />
        <span class="finder-hint">${t.searchHint}</span>
        <div class="finder-note">${t.searchNote}</div>
      </div>

      <div class="finder-field">
        <label for="f-sort">${t.sortLabel}</label>
        <select id="f-sort" name="sort">
          <option value="score">${t.sortScore}</option>
          <option value="price_asc">${t.sortPriceAsc}</option>
          <option value="price_desc">${t.sortPriceDesc}</option>
          <option value="recent">${t.sortRecent}</option>
          <option value="momentum">${t.sortMomentum}</option>
        </select>
      </div>

      <div class="finder-field">
        <label for="f-budget">${t.budgetLabel}</label>
        <div class="finder-suffix" data-suffix="${t.budgetSuffix}">
          <input id="f-budget" name="budget" type="number" min="0" step="${t.budgetStep}" inputmode="decimal" placeholder="${t.budgetPh}" />
        </div>
        <span class="finder-hint">${t.budgetHint}</span>
      </div>

      <div class="finder-field">
        <label for="f-sido">${t.sidoLabel}</label>
        <select id="f-sido" name="sido"><option value="all">${t.optAll}</option></select>
      </div>
      <div class="finder-field">
        <label for="f-gu">${t.guLabel}</label>
        <select id="f-gu" name="gu"><option value="all">${t.optAll}</option></select>
      </div>

      <div class="finder-field">
        <label for="f-area">${t.areaLabel}</label>
        <select id="f-area" name="area_type">
          <option value="all">${t.areaAll}</option>
          <option value="small">${t.areaSmall}</option>
          <option value="medium-small">${t.areaMs}</option>
          <option value="medium">${t.areaMid}</option>
          <option value="large">${t.areaLarge}</option>
        </select>
      </div>

      <div class="finder-field">
        <label for="f-family">${t.familyLabel}</label>
        <select id="f-family" name="family">
          <option value="">${t.famNone}</option>
          <option value="1">${t.fam1}</option>
          <option value="3">${t.fam3}</option>
          <option value="4">${t.fam4}</option>
        </select>
      </div>

      <div class="finder-field">
        <label for="f-age">${t.ageLabel}</label>
        <div class="finder-suffix" data-suffix="${t.ageSuffix}">
          <input id="f-age" name="max_age_years" type="number" min="0" step="1" inputmode="numeric" placeholder="${t.agePh}" />
        </div>
      </div>

      <div class="finder-field">
        <label for="f-subway">${t.subwayLabel}</label>
        <div class="finder-suffix" data-suffix="${t.mSuffix}">
          <input id="f-subway" name="subway_distance_max" type="number" min="0" step="50" inputmode="numeric" placeholder="${t.subwayPh}" />
        </div>
      </div>

      <div class="finder-field">
        <label for="f-elem">${t.elemLabel}</label>
        <div class="finder-suffix" data-suffix="${t.mSuffix}">
          <input id="f-elem" name="elementary_distance_max" type="number" min="0" step="50" inputmode="numeric" placeholder="${t.elemPh}" />
        </div>
      </div>

      <div class="finder-field">
        <label for="f-house">${t.houseLabel}</label>
        <div class="finder-suffix" data-suffix="${t.houseSuffix}">
          <input id="f-house" name="min_households" type="number" min="0" step="100" inputmode="numeric" placeholder="${t.housePh}" />
        </div>
      </div>

      <div class="finder-field">
        <label for="f-hub">${t.commuteLabel}</label>
        <div style="display:flex; gap:8px;">
          <select id="f-hub" name="commute_hub" style="flex:1.1;">
            <option value="">${t.commuteNone}</option>
${hubOptions(lang)}
          </select>
          <div class="finder-suffix" data-suffix="${t.commuteSuffix}" style="flex:1;">
            <input id="f-commute" name="commute_max" type="number" min="0" step="5" inputmode="numeric" placeholder="${t.commutePh}" />
          </div>
        </div>
        <span class="finder-hint">${t.commuteHint}</span>
      </div>

      <div class="finder-field">
        <label for="f-parking">${t.parkingLabel}</label>
        <div class="finder-suffix" data-suffix="${t.parkingSuffix}">
          <input id="f-parking" name="parking_min" type="number" min="0" step="0.1" inputmode="decimal" placeholder="${t.parkingPh}" />
        </div>
      </div>

      <div class="finder-field">
        <label for="f-ratio">${t.ratioLabel}</label>
        <div class="finder-suffix" data-suffix="${t.ratioSuffix}">
          <input id="f-ratio" name="jeonse_ratio_max" type="number" min="0" max="100" step="1" inputmode="numeric" placeholder="${t.ratioPh}" />
        </div>
        <span class="finder-hint">${t.ratioHint}</span>
      </div>

      <div class="finder-actions">
        <button type="submit" class="btn btn-primary">${t.submit}</button>
        <button type="button" class="btn btn-secondary" id="finderReset">${t.reset}</button>
      </div>
    </form>

    <section>
      <p class="finder-count" id="finderCount">${t.loading}</p>
      <div id="finderRelaxed"></div>
      <div class="finder-results" id="finderResults"></div>
    </section>
  </div>

  <details id="finderHowto" class="finder-howto" style="margin-top: 32px;">
    <summary>${t.howtoSummary}</summary>
    <p style="color: var(--text-muted); font-size: 0.85rem; margin: 12px 0 8px;">${t.howtoP1}</p>
    <div class="table-wrap" style="margin-top: 12px;">
      <table class="data">
        <thead><tr><th>${t.thFactor}</th><th>${t.thWeight}</th><th>${t.thFormula}</th></tr></thead>
        <tbody>
${howtoRows(t)}
        </tbody>
      </table>
    </div>
    <p style="color: var(--text-muted); font-size: 0.82rem; margin-top: 8px;">${t.howtoP2}</p>
  </details>

  <p class="finder-sample-note">${t.sampleNote}</p>
</main>

<div class="apt-modal" id="aptModal" aria-hidden="true">
  <div class="apt-modal-backdrop" data-apt-close></div>
  <div class="apt-modal-panel" role="dialog" aria-labelledby="aptModalTitle">
    <div class="apt-modal-head">
      <div>
        <h2 id="aptModalTitle">—</h2>
        <p id="aptModalSub" class="apt-modal-sub">—</p>
      </div>
      <button class="apt-modal-close" data-apt-close aria-label="${t.close}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div id="aptModalMap" role="region" aria-label="${t.mapAria}"></div>
    <div class="apt-modal-meta" id="aptModalMeta"></div>
    <div class="apt-modal-list">
      <h3>${t.recentDeals}</h3>
      <table>
        <thead><tr><th>${t.thDate}</th><th>${t.thAreaPy}</th><th class="num">${t.thAmount}</th></tr></thead>
        <tbody id="aptModalBody"></tbody>
      </table>
    </div>
    <a href="#" id="aptModalMore" class="apt-modal-more">${t.moreLink}</a>
  </div>
</div>

<footer class="site-footer">
  <div class="container">
    <p class="disclaimer">${CHROME[lang].foot}</p>
  </div>
</footer>`;
}

// styles from the Korean page (finder-specific) — reuse verbatim
const STYLE = `<style>
  .finder-intro { color: var(--text-muted); max-width: 720px; line-height: 1.7; }
  .apt-card { cursor: pointer; }
  .finder-layout { display: grid; grid-template-columns: 320px 1fr; gap: 28px; margin-top: 28px; align-items: start; }
  .finder-panel { background: var(--surface, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 16px; padding: 20px; position: sticky; top: 88px; }
  .finder-panel h2 { font-size: 1rem; margin: 0 0 14px; }
  .finder-field { margin-bottom: 14px; }
  .finder-field > label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 6px; }
  .finder-field input, .finder-field select { width: 100%; padding: 10px 12px; border: 1px solid var(--border, #d1d5db); border-radius: 10px; font-size: 0.95rem; font-family: inherit; background: #fff; color: inherit; }
  .finder-suffix { position: relative; }
  .finder-suffix input { padding-right: 44px; }
  .finder-suffix::after { content: attr(data-suffix); position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 0.85rem; pointer-events: none; }
  .finder-hint { font-size: 0.76rem; color: var(--text-muted); margin-top: 4px; display: block; }
  .finder-actions { display: flex; gap: 8px; margin-top: 8px; }
  .finder-actions .btn { flex: 1; }
  .finder-count { font-weight: 700; margin: 0 0 14px; font-size: 1.05rem; }
  .finder-count .em { color: var(--accent, #2563eb); }
  .finder-results { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  /* 더보기 버튼은 카드 그리드 한 줄을 통째로 차지한다(그리드 칸에 끼면 카드처럼 보인다). */
  .finder-more {
    grid-column: 1 / -1; justify-self: center; min-width: 200px; margin-top: 4px;
  }
  .finder-more-left { opacity: .7; font-weight: 400; margin-left: 6px; }
  .apt-card { border: 1px solid var(--border, #e5e7eb); border-radius: 16px; padding: 18px; background: #fff; display: flex; flex-direction: column; gap: 12px; position: relative; overflow: hidden; }
  .apt-card .rank { position: absolute; top: 0; left: 0; background: var(--accent, #2563eb); color: #fff; font-size: 0.75rem; font-weight: 700; padding: 3px 10px; border-bottom-right-radius: 10px; }
  .apt-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-top: 8px; }
  .apt-name { font-size: 1.12rem; font-weight: 800; letter-spacing: -0.02em; }
  .apt-region { font-size: 0.82rem; color: var(--text-muted); margin-top: 2px; }
  .apt-score { text-align: center; flex-shrink: 0; }
  .apt-score .num { font-size: 1.7rem; font-weight: 800; line-height: 1; color: var(--accent, #2563eb); font-variant-numeric: tabular-nums; }
  .apt-score .lbl { font-size: 0.68rem; color: var(--text-muted); }
  .apt-price { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.02em; }
  .apt-price small { font-size: 0.78rem; font-weight: 500; color: var(--text-muted); }
  .apt-units { display: flex; flex-wrap: wrap; gap: 5px; }
  .apt-unit { font-size: 0.74rem; padding: 3px 8px; border: 1px solid var(--border, #e5e7eb); border-radius: 8px; color: var(--text-muted); }
  .apt-unit.is-rep { border-color: var(--accent, #2563eb); color: var(--accent, #2563eb); font-weight: 600; }
  .apt-spec { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; font-size: 0.85rem; }
  .apt-spec .k { color: var(--text-muted); }
  .apt-spec .v { font-weight: 600; }
  .apt-reasons { display: flex; flex-wrap: wrap; gap: 6px; }
  .apt-chip { background: color-mix(in srgb, var(--accent, #2563eb) 10%, transparent); color: var(--accent, #2563eb); border-radius: 999px; padding: 4px 10px; font-size: 0.78rem; font-weight: 600; word-break: keep-all; }
  .apt-relaxed { font-size: 0.76rem; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 6px 10px; }
  .apt-bars { display: grid; gap: 5px; }
  .apt-bar { display: grid; grid-template-columns: 64px 1fr 34px; align-items: center; gap: 8px; font-size: 0.72rem; color: var(--text-muted); }
  .apt-bar .track { height: 6px; background: var(--surface-2, #f1f5f9); border-radius: 4px; overflow: hidden; }
  .apt-bar .fill { height: 100%; background: var(--accent, #2563eb); border-radius: 4px; }
  .finder-empty { border: 1px dashed var(--border, #d1d5db); border-radius: 14px; padding: 28px; text-align: center; color: var(--text-muted); }
  .finder-relaxed-banner { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; font-size: 0.9rem; }
  .finder-howto-toggle { background: none; border: 0; padding: 0; margin-left: 4px; color: var(--accent, #2563eb); font-weight: 600; cursor: pointer; font-size: inherit; }
  .finder-note { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; border-radius: 10px; padding: 8px 11px; font-size: 0.78rem; line-height: 1.55; margin-top: 6px; }
  .apt-modal { position: fixed; inset: 0; display: none; z-index: 1000; }
  .apt-modal.open { display: block; }
  .apt-modal-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,0.5); }
  .apt-modal-panel { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: min(560px, calc(100vw - 32px)); max-height: 90vh; overflow: auto; background: #fff; border-radius: 18px; padding: 22px; box-shadow: 0 20px 60px -16px rgba(15,23,42,0.4); }
  .apt-modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
  .apt-modal-head h2 { margin: 0; font-size: 1.2rem; letter-spacing: -0.02em; }
  .apt-modal-sub { margin: 4px 0 0; color: var(--text-muted); font-size: 0.86rem; }
  .apt-modal-close { background: none; border: 0; padding: 4px; cursor: pointer; color: var(--text-muted); flex-shrink: 0; }
  .apt-modal-close:hover { color: var(--text); }
  #aptModalMap { width: 100%; height: 200px; border-radius: 12px; border: 1px solid var(--border, #e5e7eb); background: #f1f5f9; margin-bottom: 14px; }
  .apt-modal-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px,1fr)); gap: 8px; margin-bottom: 16px; }
  .apt-modal-meta .item { background: var(--surface-2, #f8fafc); border-radius: 10px; padding: 8px 10px; }
  .apt-modal-meta .lbl { font-size: 0.72rem; color: var(--text-muted); }
  .apt-modal-meta .val { font-size: 0.98rem; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .apt-modal-list h3 { font-size: 0.9rem; margin: 0 0 8px; }
  .apt-modal-list table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .apt-modal-list th, .apt-modal-list td { padding: 7px 8px; border-bottom: 1px solid var(--border, #eee); text-align: left; }
  .apt-modal-list td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .apt-modal-more { display: inline-block; margin-top: 14px; color: var(--accent, #2563eb); font-weight: 600; text-decoration: none; font-size: 0.88rem; }
  .apt-modal-more:hover { text-decoration: underline; }
</style>`;

// ===== 공유 인라인 JS (T 사전 기반). 백틱/${ 없이 문자열 결합만 사용. =====
const JS_BODY = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'search_app.js.txt'), 'utf8');

function page(lang) {
  const t = T[lang];
  const c = CHROME[lang];
  const hubDisplayJson = JSON.stringify(HUB_DISPLAY[lang]);
  return `${head(lang, t)}

${header(lang, c)}

${main(lang, t)}

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script src="../../assets/score.js?v=20260722"></script>
<script src="../../assets/region.js?v=20260629"></script>
<script src="../../assets/kmap.js?v=20260722"></script>
<script src="../../assets/app.js?v=4aae4d5dfe"></script>
<script>
var T = ${JSON.stringify(t)};
var HUB_DISPLAY = ${hubDisplayJson};
</script>
<script>
${JS_BODY}
</script>
</body>
</html>
`;
}

for (const lang of LANGS) {
  mkdirSync(join(SITE, lang, 'calculators'), { recursive: true });
  const p = join(SITE, lang, 'calculators', 'search.html');
  writeFileSync(p, page(lang));
  console.log('generated', p.replace(SITE + '/', ''));
}
