#!/usr/bin/env node
// 다국어 계산기 페이지 생성기. 순수 Node(무의존).
// 한국어 원본/영문 페이지의 계산 로직(app.js의 data-calc/name/data-out 훅)을 그대로 재사용하고,
// UI 문자열만 언어별로 교체해 site/{lang}/calculators/ 아래에 생성한다.
//   node scripts/gen_calc_pages.mjs
// 계산 로직은 언어와 무관하게 동일(app.js). 통화·동적 문구는 비-한국어에서 KRW·영문으로 렌더된다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const CALCS = ['jeonse-monthly', 'brokerage-fee', 'acquisition-tax'];
// EN 계산기 페이지는 이미 별도로 존재(더 상세)하므로 생성 대상에서 제외한다.
const LANGS = ['zh-Hans', 'zh-Hant', 'vi', 'th'];
const OG = { en: 'en_US', 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', vi: 'vi_VN', th: 'th_TH' };
const REVIEW = { 'zh-Hans': '机器初译，需母语者校对', 'zh-Hant': '機器初譯，需母語者校對', vi: 'bản dịch máy, cần người bản ngữ rà soát', th: 'แปลด้วยเครื่อง ต้องให้เจ้าของภาษาตรวจ' };

// ── 공통 UI 문자열 ──
const UI = {
  en:      { native: 'English',   calc: 'Calculators', glossary: 'Glossary', home: 'Home',       disc: 'General information only.', idxTitle: 'Calculators', idxLead: 'Interactive calculators for Korean real estate. The math is identical across languages; only the interface is translated.' },
  'zh-Hans': { native: '简体中文', calc: '计算器',      glossary: '术语表',   home: '首页',       disc: '仅供一般信息参考。', idxTitle: '计算器', idxLead: '韩国房地产互动计算器。各语言计算逻辑一致，仅界面翻译。' },
  'zh-Hant': { native: '繁體中文', calc: '計算器',      glossary: '術語表',   home: '首頁',       disc: '僅供一般資訊參考。', idxTitle: '計算器', idxLead: '韓國房地產互動計算器。各語言計算邏輯一致，僅介面翻譯。' },
  vi:      { native: 'Tiếng Việt', calc: 'Công cụ tính', glossary: 'Từ điển', home: 'Trang chủ', disc: 'Chỉ là thông tin chung.', idxTitle: 'Công cụ tính', idxLead: 'Công cụ tính bất động sản Hàn Quốc. Phép tính giống nhau ở mọi ngôn ngữ, chỉ giao diện được dịch.' },
  th:      { native: 'ภาษาไทย',   calc: 'เครื่องคำนวณ', glossary: 'อภิธานศัพท์', home: 'หน้าแรก', disc: 'เป็นข้อมูลทั่วไปเท่านั้น', idxTitle: 'เครื่องคำนวณ', idxLead: 'เครื่องคำนวณอสังหาริมทรัพย์เกาหลี การคำนวณเหมือนกันทุกภาษา แปลเฉพาะส่วนติดต่อผู้ใช้' },
};

// ── 계산기별 문자열 ──
const T = {
  'jeonse-monthly': {
    en: { title: 'Jeonse ↔ Monthly Rent Conversion', desc: 'Convert between a Jeonse deposit and monthly rent using the Jeonse conversion rate.', crumb: 'Jeonse ↔ Monthly', meta: 'Uses the Jeonse-to-monthly conversion rate (전월세전환율).', dir: 'Direction', toM: 'Jeonse → Monthly', toJ: 'Monthly → Jeonse', deposit: 'Current Jeonse deposit (KRW)', base: 'Remaining deposit after conversion (KRW)', baseHint: 'Amount to keep as deposit instead of converting.', monthly: 'Monthly rent (KRW)', monthlyHint: 'Used as input when converting Monthly → Jeonse.', rate: 'Conversion rate (%/year)', rateHint: 'Statutory cap = lower of BOK base rate + 2% or 10%/year.', result: 'Result', perMonth: '/ month', keep: 'Remaining deposit', fromDep: 'Converted from deposit', addFromM: 'Added from monthly', applied: 'Applied rate', note: 'The rate is set by law; the market rate may differ. Formula: monthly = (deposit − kept) × rate ÷ 12.' },
    'zh-Hans': { title: 'Jeonse（全租）↔ 月租 换算器', desc: '按 Jeonse 换算率在全租押金与月租之间双向换算。', crumb: 'Jeonse ↔ 月租', meta: '采用全租↔月租换算率（전월세전환율）。', dir: '换算方向', toM: '全租 → 月租', toJ: '月租 → 全租', deposit: '当前全租押金（KRW）', base: '换算后保留的押金（KRW）', baseHint: '不换成月租、想保留的押金。', monthly: '月租（KRW）', monthlyHint: '在“月租 → 全租”方向作为输入。', rate: '换算率（%/年）', rateHint: '法定上限 = 韩国央行基准利率+2% 与 10%/年 中较低者。', result: '结果', perMonth: '/ 月', keep: '保留押金', fromDep: '由押金换算', addFromM: '由月租换算增加', applied: '适用换算率', note: '换算率由法律规定；实际市场利率可能不同。公式：月租 =（押金 − 保留）× 换算率 ÷ 12。' },
    'zh-Hant': { title: 'Jeonse（全租）↔ 月租 換算器', desc: '按 Jeonse 換算率在全租押金與月租之間雙向換算。', crumb: 'Jeonse ↔ 月租', meta: '採用全租↔月租換算率（전월세전환율）。', dir: '換算方向', toM: '全租 → 月租', toJ: '月租 → 全租', deposit: '目前全租押金（KRW）', base: '換算後保留的押金（KRW）', baseHint: '不換成月租、想保留的押金。', monthly: '月租（KRW）', monthlyHint: '在「月租 → 全租」方向作為輸入。', rate: '換算率（%/年）', rateHint: '法定上限 = 韓國央行基準利率+2% 與 10%/年 中較低者。', result: '結果', perMonth: '/ 月', keep: '保留押金', fromDep: '由押金換算', addFromM: '由月租換算增加', applied: '適用換算率', note: '換算率由法律規定；實際市場利率可能不同。公式：月租 =（押金 − 保留）× 換算率 ÷ 12。' },
    vi: { title: 'Máy tính quy đổi Jeonse ↔ Tiền thuê tháng', desc: 'Quy đổi giữa tiền cọc Jeonse và tiền thuê hằng tháng theo tỷ lệ quy đổi Jeonse.', crumb: 'Jeonse ↔ Tháng', meta: 'Dùng tỷ lệ quy đổi Jeonse (전월세전환율).', dir: 'Chiều quy đổi', toM: 'Jeonse → Thuê tháng', toJ: 'Thuê tháng → Jeonse', deposit: 'Tiền cọc Jeonse hiện tại (KRW)', base: 'Cọc giữ lại sau quy đổi (KRW)', baseHint: 'Phần cọc muốn giữ thay vì quy đổi sang tiền thuê.', monthly: 'Tiền thuê tháng (KRW)', monthlyHint: 'Dùng làm đầu vào khi quy đổi Tháng → Jeonse.', rate: 'Tỷ lệ quy đổi (%/năm)', rateHint: 'Trần luật định = nhỏ hơn giữa lãi suất cơ bản BOK + 2% hoặc 10%/năm.', result: 'Kết quả', perMonth: '/ tháng', keep: 'Cọc giữ lại', fromDep: 'Quy đổi từ cọc', addFromM: 'Thêm từ tiền thuê', applied: 'Tỷ lệ áp dụng', note: 'Tỷ lệ do luật quy định; tỷ lệ thị trường có thể khác. Công thức: thuê tháng = (cọc − giữ lại) × tỷ lệ ÷ 12.' },
    th: { title: 'เครื่องคำนวณแปลง Jeonse ↔ ค่าเช่ารายเดือน', desc: 'แปลงระหว่างเงินมัดจำ Jeonse กับค่าเช่ารายเดือนตามอัตราแปลง Jeonse', crumb: 'Jeonse ↔ รายเดือน', meta: 'ใช้อัตราแปลง Jeonse↔รายเดือน (전월세전환율)', dir: 'ทิศทางการแปลง', toM: 'Jeonse → ค่าเช่ารายเดือน', toJ: 'ค่าเช่ารายเดือน → Jeonse', deposit: 'เงินมัดจำ Jeonse ปัจจุบัน (KRW)', base: 'เงินมัดจำที่เก็บไว้หลังแปลง (KRW)', baseHint: 'ส่วนที่ต้องการเก็บเป็นเงินมัดจำแทนการแปลงเป็นค่าเช่า', monthly: 'ค่าเช่ารายเดือน (KRW)', monthlyHint: 'ใช้เป็นค่าตั้งต้นเมื่อแปลง รายเดือน → Jeonse', rate: 'อัตราแปลง (%/ปี)', rateHint: 'เพดานตามกฎหมาย = ค่าที่ต่ำกว่าระหว่าง อัตราดอกเบี้ยฐาน BOK + 2% หรือ 10%/ปี', result: 'ผลลัพธ์', perMonth: '/ เดือน', keep: 'เงินมัดจำที่เก็บไว้', fromDep: 'แปลงจากเงินมัดจำ', addFromM: 'เพิ่มจากค่าเช่ารายเดือน', applied: 'อัตราที่ใช้', note: 'อัตราแปลงกำหนดโดยกฎหมาย อัตราตลาดจริงอาจต่างกัน สูตร: ค่าเช่ารายเดือน = (เงินมัดจำ − ที่เก็บไว้) × อัตรา ÷ 12' },
  },
  'brokerage-fee': {
    en: { title: 'Brokerage Fee Calculator', desc: 'Calculate the maximum real estate agent commission for a sale or Jeonse in Seoul.', crumb: 'Brokerage Fee', meta: 'Seoul max rates · negotiable in practice · VAT additional', ttype: 'Transaction type', sale: 'Sale (매매)', jeonse: 'Jeonse (전세)', value: 'Transaction value (KRW)', valueHint: 'Sale price for purchases; deposit for Jeonse.', totalH: 'Maximum total (incl. VAT)', rate: 'Rate', cap: 'Cap', fee: 'Commission (excl. VAT)', vat: 'VAT (10%)', note: 'These are caps, not fixed rates. The actual fee is negotiable. VAT applies only if the agent is a standard taxpayer.' },
    'zh-Hans': { title: '中介手续费计算器', desc: '按首尔上限费率计算买卖或全租交易的中介佣金上限。', crumb: '中介手续费', meta: '首尔上限费率 · 实际可协商 · 另加增值税', ttype: '交易类型', sale: '买卖 (매매)', jeonse: '全租 (전세)', value: '交易金额（KRW）', valueHint: '买卖填成交价；全租填押金。', totalH: '最高合计（含增值税）', rate: '费率', cap: '上限', fee: '佣金（不含税）', vat: '增值税（10%）', note: '这是上限而非固定费率，实际可协商。仅当中介为一般纳税人时收取增值税。' },
    'zh-Hant': { title: '仲介手續費計算器', desc: '按首爾上限費率計算買賣或全租交易的仲介佣金上限。', crumb: '仲介手續費', meta: '首爾上限費率 · 實際可協商 · 另加加值稅', ttype: '交易類型', sale: '買賣 (매매)', jeonse: '全租 (전세)', value: '交易金額（KRW）', valueHint: '買賣填成交價；全租填押金。', totalH: '最高合計（含加值稅）', rate: '費率', cap: '上限', fee: '佣金（不含稅）', vat: '加值稅（10%）', note: '這是上限而非固定費率，實際可協商。僅當仲介為一般納稅人時收取加值稅。' },
    vi: { title: 'Máy tính phí môi giới', desc: 'Tính hoa hồng môi giới tối đa cho giao dịch mua bán hoặc Jeonse tại Seoul.', crumb: 'Phí môi giới', meta: 'Mức trần Seoul · có thể thương lượng · VAT tính thêm', ttype: 'Loại giao dịch', sale: 'Mua bán (매매)', jeonse: 'Jeonse (전세)', value: 'Giá trị giao dịch (KRW)', valueHint: 'Giá bán khi mua bán; tiền cọc khi Jeonse.', totalH: 'Tối đa (gồm VAT)', rate: 'Tỷ lệ', cap: 'Trần', fee: 'Hoa hồng (chưa VAT)', vat: 'VAT (10%)', note: 'Đây là mức trần, không phải phí cố định — thực tế có thể thương lượng. VAT chỉ áp dụng nếu môi giới là người nộp thuế thông thường.' },
    th: { title: 'เครื่องคำนวณค่านายหน้า', desc: 'คำนวณค่าคอมมิชชั่นนายหน้าสูงสุดสำหรับการซื้อขายหรือ Jeonse ในโซล', crumb: 'ค่านายหน้า', meta: 'อัตราเพดานโซล · ต่อรองได้จริง · VAT เพิ่มต่างหาก', ttype: 'ประเภทธุรกรรม', sale: 'ซื้อขาย (매매)', jeonse: 'Jeonse (전세)', value: 'มูลค่าธุรกรรม (KRW)', valueHint: 'ราคาขายสำหรับการซื้อ; เงินมัดจำสำหรับ Jeonse', totalH: 'สูงสุด (รวม VAT)', rate: 'อัตรา', cap: 'เพดาน', fee: 'ค่าคอมมิชชั่น (ไม่รวม VAT)', vat: 'VAT (10%)', note: 'นี่คือเพดาน ไม่ใช่อัตราตายตัว — ต่อรองได้จริง VAT เก็บเฉพาะเมื่อนายหน้าเป็นผู้เสียภาษีทั่วไป' },
  },
  'acquisition-tax': {
    en: { title: 'Acquisition Tax Calculator', desc: 'Calculate Korean property acquisition tax with rural special tax and local education tax.', crumb: 'Acquisition Tax', meta: 'Residential property · standard rates · same rates apply to foreigners', price: 'Purchase price (KRW)', priceHint: 'Actual contract price.', homes: 'Number of homes (incl. this purchase)', h1: '1 home', h2: '2 homes', h3: '3 homes', h4: '4+ homes', homesHint: 'Includes homes owned by the household.', regulated: 'Located in a regulated area (조정대상지역)', regulatedNote: 'From the 2nd home, the heavy-tax rate applies.', area: 'Floor area > 85 m²', areaNote: 'Triggers a 0.2% rural special tax.', totalH: 'Estimated total', rate: 'Applied rate', acq: 'Acquisition tax', rural: 'Rural special tax', edu: 'Local education tax', note: 'Standard rates only. First-home relief and pre-sale rights are not modeled. Consult a tax accountant for non-standard cases.' },
    'zh-Hans': { title: '取得税计算器', desc: '计算韩国房产取得税，含农渔村特别税与地方教育税。', crumb: '取得税', meta: '住宅 · 标准税率 · 外国人适用同样税率', price: '取得价（成交价，KRW）', priceHint: '实际合同价。', homes: '房屋套数（含本次）', h1: '1套', h2: '2套', h3: '3套', h4: '4套以上', homesHint: '按家庭为单位持有的套数。', regulated: '位于调整对象地区（조정대상지역）', regulatedNote: '自第2套起适用重课税率。', area: '专用面积 > 85㎡', areaNote: '触发 0.2% 农渔村特别税。', totalH: '预计合计', rate: '适用税率', acq: '取得税', rural: '农渔村特别税', edu: '地方教育税', note: '仅按标准税率。未含生涯首套减免、预售权等情形。非标准情形请咨询税务师。' },
    'zh-Hant': { title: '取得稅計算器', desc: '計算韓國房產取得稅，含農漁村特別稅與地方教育稅。', crumb: '取得稅', meta: '住宅 · 標準稅率 · 外國人適用同樣稅率', price: '取得價（成交價，KRW）', priceHint: '實際合約價。', homes: '房屋數（含本次）', h1: '1戶', h2: '2戶', h3: '3戶', h4: '4戶以上', homesHint: '以家庭為單位持有的戶數。', regulated: '位於調整對象地區（조정대상지역）', regulatedNote: '自第2戶起適用重課稅率。', area: '專用面積 > 85㎡', areaNote: '觸發 0.2% 農漁村特別稅。', totalH: '預計合計', rate: '適用稅率', acq: '取得稅', rural: '農漁村特別稅', edu: '地方教育稅', note: '僅按標準稅率。未含生涯首購減免、預售權等情形。非標準情形請諮詢稅務師。' },
    vi: { title: 'Máy tính thuế mua bất động sản', desc: 'Tính thuế mua bất động sản Hàn Quốc gồm thuế đặc biệt nông thôn và thuế giáo dục địa phương.', crumb: 'Thuế mua', meta: 'Nhà ở · thuế suất chuẩn · áp dụng như nhau cho người nước ngoài', price: 'Giá mua (KRW)', priceHint: 'Giá hợp đồng thực tế.', homes: 'Số căn nhà (gồm căn này)', h1: '1 căn', h2: '2 căn', h3: '3 căn', h4: '4+ căn', homesHint: 'Gồm cả nhà do hộ gia đình sở hữu.', regulated: 'Nằm trong khu vực điều tiết (조정대상지역)', regulatedNote: 'Từ căn thứ 2, áp mức thuế nặng.', area: 'Diện tích > 85 m²', areaNote: 'Phát sinh thuế đặc biệt nông thôn 0,2%.', totalH: 'Tổng ước tính', rate: 'Thuế suất áp dụng', acq: 'Thuế mua', rural: 'Thuế đặc biệt nông thôn', edu: 'Thuế giáo dục địa phương', note: 'Chỉ theo thuế suất chuẩn. Chưa tính miễn giảm nhà đầu tiên, quyền mua trước. Trường hợp đặc biệt hãy hỏi kế toán thuế.' },
    th: { title: 'เครื่องคำนวณภาษีการได้มาซึ่งอสังหาฯ', desc: 'คำนวณภาษีการได้มาซึ่งอสังหาริมทรัพย์เกาหลี รวมภาษีพิเศษชนบทและภาษีการศึกษาท้องถิ่น', crumb: 'ภาษีการได้มา', meta: 'ที่อยู่อาศัย · อัตรามาตรฐาน · ใช้อัตราเดียวกันกับชาวต่างชาติ', price: 'ราคาซื้อ (KRW)', priceHint: 'ราคาตามสัญญาจริง', homes: 'จำนวนที่อยู่อาศัย (รวมหลังนี้)', h1: '1 หลัง', h2: '2 หลัง', h3: '3 หลัง', h4: '4+ หลัง', homesHint: 'รวมที่อยู่อาศัยที่ครัวเรือนถือครอง', regulated: 'อยู่ในเขตควบคุม (조정대상지역)', regulatedNote: 'ตั้งแต่หลังที่ 2 ใช้อัตราภาษีสูง', area: 'พื้นที่ใช้สอย > 85 ตร.ม.', areaNote: 'ทำให้เกิดภาษีพิเศษชนบท 0.2%', totalH: 'ยอดรวมประมาณการ', rate: 'อัตราที่ใช้', acq: 'ภาษีการได้มา', rural: 'ภาษีพิเศษชนบท', edu: 'ภาษีการศึกษาท้องถิ่น', note: 'อัตรามาตรฐานเท่านั้น ไม่รวมการลดหย่อนบ้านหลังแรกและสิทธิจองซื้อ กรณีพิเศษโปรดปรึกษานักบัญชีภาษี' },
  },
};

function head(lang, calc, t) {
  const canon = `https://topda.kr/${lang}/calculators/${calc}.html`;
  const alts = ['ko', 'en', 'zh-Hans', 'zh-Hant', 'vi', 'th'].map((l) => {
    const href = l === 'ko' ? `https://topda.kr/calculators/${calc}.html` : `https://topda.kr/${l}/calculators/${calc}.html`;
    return `<link rel="alternate" hreflang="${l}" href="${href}" />`;
  }).join('\n');
  const review = REVIEW[lang] ? `\n<!-- i18n:review lang=${lang} — ${REVIEW[lang]} -->` : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />${review}
<title>${t.title} — TOPDA</title>
<meta name="description" content="${t.desc}" />
<link rel="icon" href="https://topda.kr/assets/images/brand/logo.png" type="image/png" />
<link rel="canonical" href="${canon}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TOPDA" />
<meta property="og:title" content="${t.title} — TOPDA" />
<meta property="og:description" content="${t.desc}" />
<meta property="og:url" content="${canon}" />
<meta property="og:image" content="https://topda.kr/assets/images/brand/logo.png" />
<meta property="og:locale" content="${OG[lang]}" />
<meta name="twitter:card" content="summary_large_image" />
${alts}
<link rel="alternate" hreflang="x-default" href="https://topda.kr/calculators/${calc}.html" />
<script defer src="https://topda.kr/assets/analytics.js?v=20260719"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
<link rel="stylesheet" href="../../assets/styles.css?v=20260719" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"${UI[lang].home}","item":"https://topda.kr/${lang}/index.html"},{"@type":"ListItem","position":2,"name":"${UI[lang].calc}","item":"https://topda.kr/${lang}/calculators/index.html"},{"@type":"ListItem","position":3,"name":"${t.title}","item":"${canon}"}]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"WebApplication","name":"${t.title}","url":"${canon}","applicationCategory":"FinanceApplication","operatingSystem":"Any","browserRequirements":"Requires JavaScript","inLanguage":"${lang}","isAccessibleForFree":true,"offers":{"@type":"Offer","price":"0","priceCurrency":"KRW"},"publisher":{"@id":"https://topda.kr/#organization"}}
</script>
</head>`;
}

function chrome(lang, bodyMain) {
  const u = UI[lang];
  return `<body>
<header class="site-header">
  <div class="container row">
    <a href="../index.html" class="brand"><span class="brand-mark"></span>TOPDA</a>
    <nav class="nav">
      <a href="index.html" data-nav class="active">${u.calc}</a>
      <a href="../../en/glossary.html" data-nav>${u.glossary}</a>
      <a href="../../en/index.html" data-nav>English</a>
    </nav>
    <button class="nav-toggle" data-nav-toggle aria-label="Menu">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
    </button>
  </div>
  <div class="mobile-menu" data-mobile-menu>
    <a href="index.html">${u.calc}</a>
    <a href="../../en/glossary.html">${u.glossary}</a>
    <a href="../index.html">${u.home}</a>
    <a href="../../index.html">한국어</a>
  </div>
</header>
${bodyMain}
<footer class="site-footer"><div class="container"><p class="disclaimer">&copy; TOPDA. ${u.disc}</p></div></footer>
<script src="../../assets/rates.js?v=20260719"></script>
<script src="../../assets/app.js?v=20260719"></script>
</body>
</html>
`;
}

function bodyJeonse(lang, t) {
  const u = UI[lang];
  return `<main class="container">
  <div class="article-header">
    <div class="breadcrumb"><a href="../index.html">${u.home}</a> / <a href="index.html">${u.calc}</a> / ${t.crumb}</div>
    <h1>${t.title}</h1>
    <div class="meta"><span>${t.meta}</span></div>
  </div>
  <div class="calc-layout" data-calc="jeonse-monthly">
    <div class="calc-form">
      <div class="field"><label>${t.dir}</label>
        <div class="radio-group">
          <label><input type="radio" name="mode" value="toMonthly" checked/><span>${t.toM}</span></label>
          <label><input type="radio" name="mode" value="toJeonse"/><span>${t.toJ}</span></label>
        </div>
      </div>
      <div class="field"><label for="jm-deposit">${t.deposit}</label>
        <div class="input-suffix" data-suffix="KRW"><input id="jm-deposit" name="deposit" type="text" inputmode="numeric" data-format="won" value="500,000,000" /></div>
      </div>
      <div class="field" data-mode="toMonthly"><label for="jm-base">${t.base}</label>
        <div class="input-suffix" data-suffix="KRW"><input id="jm-base" name="baseDeposit" type="text" inputmode="numeric" data-format="won" value="100,000,000" /></div>
        <span class="hint">${t.baseHint}</span>
      </div>
      <div class="field"><label for="jm-monthly">${t.monthly}</label>
        <div class="input-suffix" data-suffix="KRW"><input id="jm-monthly" name="monthly" type="text" inputmode="numeric" data-format="won" value="1,000,000" /></div>
        <span class="hint">${t.monthlyHint}</span>
      </div>
      <div class="field"><label for="jm-rate">${t.rate}</label>
        <input id="jm-rate" name="rate" type="number" min="1" max="15" step="0.1" value="5.5" />
        <span class="hint">${t.rateHint}</span>
      </div>
    </div>
    <div class="calc-result">
      <h3>${t.result}</h3>
      <div data-mode="toMonthly">
        <div class="total"><span data-out="outMonthly">KRW 0</span> ${t.perMonth}</div>
        <div class="breakdown">
          <div class="row"><span class="key">${t.keep}</span><span class="val" data-out="outBaseDeposit">KRW 0</span></div>
          <div class="row sub"><span class="key">${t.fromDep}</span><span class="val" data-out="outConverted">KRW 0</span></div>
        </div>
      </div>
      <div data-mode="toJeonse" style="display:none;">
        <div class="total" data-out="outTotalDeposit">KRW 0</div>
        <div class="breakdown"><div class="row sub"><span class="key">${t.addFromM}</span><span class="val" data-out="outAddedDeposit">KRW 0</span></div></div>
      </div>
      <div class="breakdown" style="margin-top:16px;"><div class="row"><span class="key">${t.applied}</span><span class="val" data-out="outRate">—</span></div></div>
      <div class="callout callout-info" style="margin-top:24px; margin-bottom:0;"><div class="icon">i</div><div class="body">${t.note}</div></div>
    </div>
  </div>
</main>`;
}

function bodyBrokerage(lang, t) {
  const u = UI[lang];
  return `<main class="container">
  <div class="article-header">
    <div class="breadcrumb"><a href="../index.html">${u.home}</a> / <a href="index.html">${u.calc}</a> / ${t.crumb}</div>
    <h1>${t.title}</h1>
    <div class="meta"><span>${t.meta}</span></div>
  </div>
  <div class="calc-layout" data-calc="brokerage-fee">
    <div class="calc-form">
      <div class="field"><label>${t.ttype}</label>
        <div class="radio-group">
          <label><input type="radio" name="type" value="sale" checked/><span>${t.sale}</span></label>
          <label><input type="radio" name="type" value="jeonse"/><span>${t.jeonse}</span></label>
        </div>
      </div>
      <div class="field"><label for="price">${t.value}</label>
        <div class="input-suffix" data-suffix="KRW"><input id="price" name="price" type="text" inputmode="numeric" data-format="won" value="500,000,000" /></div>
        <span class="hint">${t.valueHint}</span>
      </div>
    </div>
    <div class="calc-result">
      <h3>${t.totalH}</h3>
      <div class="total" data-out="total">KRW 0</div>
      <div class="breakdown">
        <div class="row"><span class="key">${t.rate}</span><span class="val" data-out="rate">—</span></div>
        <div class="row"><span class="key">${t.cap}</span><span class="val" data-out="cap">—</span></div>
        <div class="row sub"><span class="key">${t.fee}</span><span class="val" data-out="fee">KRW 0</span></div>
        <div class="row sub"><span class="key">${t.vat}</span><span class="val" data-out="vat">KRW 0</span></div>
      </div>
      <div class="callout callout-info" style="margin-top:24px; margin-bottom:0;"><div class="icon">i</div><div class="body">${t.note}</div></div>
    </div>
  </div>
</main>`;
}

function bodyAcq(lang, t) {
  const u = UI[lang];
  return `<main class="container">
  <div class="article-header">
    <div class="breadcrumb"><a href="../index.html">${u.home}</a> / <a href="index.html">${u.calc}</a> / ${t.crumb}</div>
    <h1>${t.title}</h1>
    <div class="meta"><span>${t.meta}</span></div>
  </div>
  <div class="calc-layout" data-calc="acquisition-tax">
    <div class="calc-form">
      <div class="field"><label for="price">${t.price}</label>
        <div class="input-suffix" data-suffix="KRW"><input id="price" name="price" type="text" inputmode="numeric" data-format="won" value="800,000,000" /></div>
        <span class="hint">${t.priceHint}</span>
      </div>
      <div class="field"><label>${t.homes}</label>
        <div class="radio-group">
          <label><input type="radio" name="homes" value="1" checked/><span>${t.h1}</span></label>
          <label><input type="radio" name="homes" value="2"/><span>${t.h2}</span></label>
          <label><input type="radio" name="homes" value="3"/><span>${t.h3}</span></label>
          <label><input type="radio" name="homes" value="4"/><span>${t.h4}</span></label>
        </div>
        <span class="hint">${t.homesHint}</span>
      </div>
      <div class="field"><label class="check-item" style="padding:0; cursor:pointer;">
        <input type="checkbox" name="regulated"/><span class="text">${t.regulated}<span class="note">${t.regulatedNote}</span></span>
      </label></div>
      <div class="field"><label class="check-item" style="padding:0; cursor:pointer;">
        <input type="checkbox" name="areaOver85"/><span class="text">${t.area}<span class="note">${t.areaNote}</span></span>
      </label></div>
    </div>
    <div class="calc-result">
      <h3>${t.totalH}</h3>
      <div class="total" data-out="total">KRW 0</div>
      <div class="breakdown">
        <div class="row"><span class="key">${t.rate}</span><span class="val" data-out="rate">—</span></div>
        <div class="row sub"><span class="key">${t.acq}</span><span class="val" data-out="acquisition">KRW 0</span></div>
        <div class="row sub"><span class="key">${t.rural}</span><span class="val" data-out="ruralTax">KRW 0</span></div>
        <div class="row sub"><span class="key">${t.edu}</span><span class="val" data-out="localEduTax">KRW 0</span></div>
      </div>
      <div class="callout callout-info" style="margin-top:24px; margin-bottom:0;"><div class="icon">i</div><div class="body">${t.note}</div></div>
    </div>
  </div>
</main>`;
}

const BODY = { 'jeonse-monthly': bodyJeonse, 'brokerage-fee': bodyBrokerage, 'acquisition-tax': bodyAcq };

function indexHead(lang) {
  const u = UI[lang];
  const canon = `https://topda.kr/${lang}/calculators/index.html`;
  const alts = ['ko', 'en', 'zh-Hans', 'zh-Hant', 'vi', 'th'].map((l) => {
    const href = l === 'ko' ? 'https://topda.kr/calculators/index.html' : `https://topda.kr/${l}/calculators/index.html`;
    return `<link rel="alternate" hreflang="${l}" href="${href}" />`;
  }).join('\n');
  const review = REVIEW[lang] ? `\n<!-- i18n:review lang=${lang} — ${REVIEW[lang]} -->` : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />${review}
<title>${u.idxTitle} — TOPDA</title>
<meta name="description" content="${u.idxLead}" />
<link rel="icon" href="https://topda.kr/assets/images/brand/logo.png" type="image/png" />
<link rel="canonical" href="${canon}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TOPDA" />
<meta property="og:title" content="${u.idxTitle} — TOPDA" />
<meta property="og:description" content="${u.idxLead}" />
<meta property="og:url" content="${canon}" />
<meta property="og:image" content="https://topda.kr/assets/images/brand/logo.png" />
<meta property="og:locale" content="${OG[lang]}" />
<meta name="twitter:card" content="summary_large_image" />
${alts}
<link rel="alternate" hreflang="x-default" href="https://topda.kr/calculators/index.html" />
<script defer src="https://topda.kr/assets/analytics.js?v=20260719"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
<link rel="stylesheet" href="../../assets/styles.css?v=20260719" />
</head>`;
}
function indexBody(lang) {
  const u = UI[lang];
  const cards = CALCS.map((calc) => {
    const t = T[calc][lang];
    return `      <a class="card" href="${calc}.html">
        <span class="badge badge-success">${u.calc}</span>
        <h3>${t.crumb}</h3>
        <p>${t.desc}</p>
      </a>`;
  }).join('\n');
  return `<main class="container">
  <div class="article-header">
    <div class="breadcrumb"><a href="../index.html">${u.home}</a> / ${u.idxTitle}</div>
    <h1>${u.idxTitle}</h1>
    <p class="lead">${u.idxLead}</p>
  </div>
  <div class="cards-grid">
${cards}
  </div>
</main>`;
}

let count = 0;
for (const lang of LANGS) {
  mkdirSync(join(SITE, lang, 'calculators'), { recursive: true });
  for (const calc of CALCS) {
    const t = T[calc][lang];
    if (!t) continue;
    const html = head(lang, calc, t) + '\n' + chrome(lang, BODY[calc](lang, t));
    writeFileSync(join(SITE, lang, 'calculators', calc + '.html'), html);
    count++;
  }
  writeFileSync(join(SITE, lang, 'calculators', 'index.html'), indexHead(lang) + '\n' + chrome(lang, indexBody(lang)));
  count++;
}
console.log(`generated ${count} pages (calculators + index) across ${LANGS.length} languages`);
