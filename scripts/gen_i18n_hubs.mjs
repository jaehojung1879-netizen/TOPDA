#!/usr/bin/env node
// 언어별 허브 페이지(guides.html · market.html)를 생성한다.
// - guides.html: zh-Hans/zh-Hant/vi/th (en/guides.html 은 수기 관리라 건드리지 않음)
// - market.html(시세정보): en/zh-Hans/zh-Hant/vi/th
// 헤더/푸터는 각 언어 index.html 과 동일한 depth-1 상대경로를 쓰므로 그대로 재사용한다.
// 시세 데이터 도구(실거래·지도 등)는 한국어 데이터 앱을 그대로 링크하고(브라우저 번역 안내),
// 허브 페이지의 라벨·설명만 각 언어로 번역한다(사실·수치 창작 금지).
//   node scripts/gen_i18n_hubs.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const OG = { en: 'en_US', 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', vi: 'vi_VN', th: 'th_TH' };
const REVIEW = {
  en: 'machine-assisted draft, needs native review',
  'zh-Hans': '机器初译，需母语者校对',
  'zh-Hant': '機器初譯，需母語者校對',
  vi: 'bản dịch máy, cần người bản ngữ rà soát',
  th: 'แปลด้วยเครื่อง ต้องให้เจ้าของภาษาตรวจ',
};

// 각 언어 헤더/푸터 라벨 (index.html 과 일치)
const CHROME = {
  en: {
    lang: 'en', guides: 'Guides', calc: 'Calculators', market: 'Market Data', checklists: 'Checklists',
    board: 'Board', about: 'About', korean: '한국어', home: 'Home',
    tagline: 'Korea real estate, examined in detail.', toolsH: 'Tools', siteH: 'Site',
    disclaimerLabel: 'Disclaimer',
    disclaimer: 'All content is general information only, not legal, tax, or financial advice. Laws and rates change; consult a licensed professional before any transaction. © TOPDA.',
  },
  'zh-Hans': {
    lang: 'zh-Hans', guides: '指南', calc: '计算器', market: '行情信息', checklists: '清单',
    board: '论坛', about: '关于', korean: '한국어', home: '首页',
    tagline: '韩国房产，逐一细究。', toolsH: '工具', siteH: '站点', disclaimerLabel: '免责声明',
    disclaimer: '所有内容仅供一般参考，不构成法律、税务或金融建议。法律与税率会变动，交易前请咨询有资质的专业人士。© TOPDA。',
  },
  'zh-Hant': {
    lang: 'zh-Hant', guides: '指南', calc: '計算器', market: '行情資訊', checklists: '清單',
    board: '論壇', about: '關於', korean: '한국어', home: '首頁',
    tagline: '韓國房產，逐一細究。', toolsH: '工具', siteH: '網站', disclaimerLabel: '免責聲明',
    disclaimer: '所有內容僅供一般參考，不構成法律、稅務或金融建議。法律與稅率會變動，交易前請諮詢有資質的專業人士。© TOPDA。',
  },
  vi: {
    lang: 'vi', guides: 'Hướng dẫn', calc: 'Máy tính', market: 'Giá thị trường', checklists: 'Danh sách',
    board: 'Diễn đàn', about: 'Giới thiệu', korean: '한국어', home: 'Trang chủ',
    tagline: 'Bất động sản Hàn Quốc, tường tận từng chi tiết.', toolsH: 'Công cụ', siteH: 'Trang', disclaimerLabel: 'Miễn trừ',
    disclaimer: 'Mọi nội dung chỉ mang tính thông tin chung, không phải tư vấn pháp lý, thuế hay tài chính. Luật và thuế suất thay đổi. Hãy tham khảo chuyên gia có chứng chỉ trước khi giao dịch. © TOPDA.',
  },
  th: {
    lang: 'th', guides: 'คู่มือ', calc: 'เครื่องคำนวณ', market: 'ข้อมูลราคาตลาด', checklists: 'เช็กลิสต์',
    board: 'กระดาน', about: 'เกี่ยวกับ', korean: '한국어', home: 'หน้าแรก',
    tagline: 'อสังหาฯ เกาหลี ทีละรายละเอียด', toolsH: 'เครื่องมือ', siteH: 'ไซต์', disclaimerLabel: 'ข้อจำกัดความรับผิด',
    disclaimer: 'เนื้อหาทั้งหมดเป็นข้อมูลทั่วไป ไม่ใช่คำแนะนำทางกฎหมาย ภาษี หรือการเงิน กฎหมายและอัตราภาษีเปลี่ยนแปลงได้ โปรดปรึกษาผู้เชี่ยวชาญที่มีใบอนุญาตก่อนทำธุรกรรม © TOPDA',
  },
};

// active: 'guides' | 'market'
function header(c, active) {
  const cls = (k) => (active === k ? ' class="active"' : '');
  const nav = (k) => (active === k ? ' data-nav class="active"' : ' data-nav');
  return `<header class="site-header">
  <div class="container row">
    <a href="index.html" class="brand"><span class="brand-mark"></span>TOPDA</a>
    <nav class="nav">
      <a href="guides.html"${nav('guides')}>${c.guides}</a>
      <a href="calculators/index.html" data-nav>${c.calc}</a>
      <a href="market.html"${nav('market')}>${c.market}</a>
      <a href="../checklists/index.html" data-nav>${c.checklists}</a>
      <a href="../board.html" data-nav>${c.board}</a>
    </nav>
    <button class="nav-toggle" data-nav-toggle aria-label="Menu">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
    </button>
  </div>
  <div class="mobile-menu" data-mobile-menu>
    <a href="guides.html"${cls('guides')}>${c.guides}</a>
    <a href="calculators/index.html">${c.calc}</a>
    <a href="market.html"${cls('market')}>${c.market}</a>
    <a href="../checklists/index.html">${c.checklists}</a>
    <a href="../board.html">${c.board}</a>
    <a href="../about.html">${c.about}</a>
    <a href="../index.html">${c.korean}</a>
  </div>
</header>`;
}

function footer(c) {
  return `<footer class="site-footer">
  <div class="container">
    <div class="row">
      <div><div class="brand"><span class="brand-mark"></span>TOPDA</div><p>${c.tagline}</p></div>
      <div><h4>${c.toolsH}</h4><ul><li><a href="calculators/index.html">${c.calc}</a></li><li><a href="market.html">${c.market}</a></li><li><a href="../checklists/index.html">${c.checklists}</a></li></ul></div>
      <div><h4>${c.siteH}</h4><ul><li><a href="../about.html">${c.about}</a></li><li><a href="../about.html#disclaimer">${c.disclaimerLabel}</a></li><li><a href="../index.html">${c.korean}</a></li></ul></div>
    </div>
    <p class="disclaimer">${c.disclaimer}</p>
  </div>
</footer>`;
}

function hreflang(page, langs, xdefault) {
  const line = (l) => {
    const href = l === 'ko' ? `https://topda.kr/${page}` : `https://topda.kr/${l}/${page}`;
    return `<link rel="alternate" hreflang="${l}" href="${href}" />`;
  };
  const alts = langs.map(line).join('\n');
  const xd = xdefault === 'ko' ? `https://topda.kr/${page}` : `https://topda.kr/${xdefault}/${page}`;
  return alts + `\n<link rel="alternate" hreflang="x-default" href="${xd}" />`;
}

function head(lang, page, title, desc, extraStyle, alts) {
  const c = CHROME[lang];
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6725359021570843" crossorigin="anonymous"></script>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- i18n:review lang=${lang} — ${REVIEW[lang]} -->
<title>${title} — TOPDA</title>
<meta name="description" content="${desc}" />
<link rel="icon" href="https://topda.kr/assets/images/brand/logo.png" type="image/png" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
<link rel="canonical" href="https://topda.kr/${lang}/${page}" />
<link rel="alternate" type="application/rss+xml" title="톺다 RSS" href="https://topda.kr/feed.xml" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TOPDA" />
<meta property="og:title" content="${title} — TOPDA" />
<meta property="og:description" content="${desc}" />
<meta property="og:url" content="https://topda.kr/${lang}/${page}" />
<meta property="og:image" content="https://topda.kr/assets/images/brand/logo.png" />
<meta property="og:locale" content="${OG[lang]}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title} — TOPDA" />
<meta name="twitter:description" content="${desc}" />
<meta name="twitter:image" content="https://topda.kr/assets/images/brand/logo.png" />
${alts}
<script defer src="https://topda.kr/assets/analytics.js?v=3e86e8b800"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
<link rel="stylesheet" href="../assets/styles.css?v=b54e7c9b22" />${extraStyle || ''}
</head>
<body>`;
}

// ===================== GUIDES =====================
// card: {href, badge, badgeClass, h3, p}
const GUIDES = {
  'zh-Hans': {
    title: '指南', desc: '面向外国人的韩国房产指南——全租（Jeonse）、外国人贷款与税务、术语表，以及配套计算器。',
    h1: '指南', lead: 'TOPDA 上目前已翻译成中文的内容——韩国特有的全租（Jeonse）制度、外国人贷款与税务、常用术语表，以及帮你算清数字的计算器。',
    startTag: '从这里开始', startH2: '面向外国人', startP: '几乎每位外国居民最先问到的三个问题。',
    start: [
      { href: 'jeonse.html', badge: '必读', badgeClass: ' badge-accent', h3: '什么是全租（Jeonse）？', p: '以一笔大额保证金代替月租、租约结束时全额退还的租赁方式，以及为保障保证金必须办理的法律手续。' },
      { href: 'foreigner-loan.html', badge: '贷款', badgeClass: '', h3: '外国人能办全租贷款吗？', p: '韩国银行看重的签证类型、收入证明与租赁条件，以及可优先尝试的银行。' },
      { href: 'foreigner-tax.html', badge: '税务', badgeClass: '', h3: '非居民专属的税务规则', p: '取得税与本国人相同，但转让所得税与租金收入预扣不同。' },
    ],
    refTag: '参考与工具', refH2: '术语与数据',
    ref: [
      { href: 'glossary.html', badge: '术语', badgeClass: '', h3: '韩国房地产术语表', p: '全租、登记簿誊本、DSR、LTV 等——本站反复出现的词汇，一次讲清。' },
      { href: 'calculators/index.html', badge: '计算器', badgeClass: ' badge-success', h3: '计算器', p: '取得税、转让税、全租↔月租换算、中介报酬、交割日结算——全部在浏览器本地计算。' },
      { href: 'market.html', badge: '数据', badgeClass: ' badge-accent', h3: '行情信息', p: '实际成交价、地区行情、全租率地图——查询韩国房价数据。' },
    ],
    calloutStrong: '想了解更多？',
    calloutBody: '韩文站点还有 30 多篇深度指南（登记簿解读、全租诈骗防范、合同条款、装修合同、市场周期分析等）。用浏览器的翻译功能（例如 Chrome 内置翻译）阅读 <a href="../guides.html">韩文指南主页</a> 效果不错。',
  },
  'zh-Hant': {
    title: '指南', desc: '面向外國人的韓國房產指南——全租（Jeonse）、外國人貸款與稅務、術語表，以及配套計算器。',
    h1: '指南', lead: 'TOPDA 上目前已翻譯成中文的內容——韓國特有的全租（Jeonse）制度、外國人貸款與稅務、常用術語表，以及幫你算清數字的計算器。',
    startTag: '從這裡開始', startH2: '面向外國人', startP: '幾乎每位外國居民最先問到的三個問題。',
    start: [
      { href: 'jeonse.html', badge: '必讀', badgeClass: ' badge-accent', h3: '什麼是全租（Jeonse）？', p: '以一筆大額保證金代替月租、租約結束時全額退還的租賃方式，以及為保障保證金必須辦理的法律手續。' },
      { href: 'foreigner-loan.html', badge: '貸款', badgeClass: '', h3: '外國人能辦全租貸款嗎？', p: '韓國銀行看重的簽證類型、收入證明與租賃條件，以及可優先嘗試的銀行。' },
      { href: 'foreigner-tax.html', badge: '稅務', badgeClass: '', h3: '非居民專屬的稅務規則', p: '取得稅與本國人相同，但轉讓所得稅與租金收入預扣不同。' },
    ],
    refTag: '參考與工具', refH2: '術語與數據',
    ref: [
      { href: 'glossary.html', badge: '術語', badgeClass: '', h3: '韓國房地產術語表', p: '全租、登記簿謄本、DSR、LTV 等——本站反覆出現的詞彙，一次講清。' },
      { href: 'calculators/index.html', badge: '計算器', badgeClass: ' badge-success', h3: '計算器', p: '取得稅、轉讓稅、全租↔月租換算、仲介報酬、交割日結算——全部在瀏覽器本地計算。' },
      { href: 'market.html', badge: '數據', badgeClass: ' badge-accent', h3: '行情資訊', p: '實際成交價、地區行情、全租率地圖——查詢韓國房價數據。' },
    ],
    calloutStrong: '想了解更多？',
    calloutBody: '韓文站點還有 30 多篇深度指南（登記簿解讀、全租詐騙防範、合約條款、裝修合約、市場週期分析等）。用瀏覽器的翻譯功能（例如 Chrome 內建翻譯）閱讀 <a href="../guides.html">韓文指南主頁</a> 效果不錯。',
  },
  vi: {
    title: 'Hướng dẫn', desc: 'Hướng dẫn bất động sản Hàn Quốc cho người nước ngoài — Jeonse, thuê tháng, vay vốn, thuế và từ điển thuật ngữ, kèm công cụ tính.',
    h1: 'Hướng dẫn', lead: 'Những nội dung trên TOPDA hiện đã có tiếng Việt — hình thức thuê đặt cọc Jeonse đặc trưng của Hàn Quốc, vay vốn cho người nước ngoài, từ điển thuật ngữ, và các công cụ tính giúp bạn ra con số.',
    startTag: 'Bắt đầu từ đây', startH2: 'Dành cho người nước ngoài', startP: 'Ba điều hầu như người nước ngoài nào cũng hỏi đầu tiên.',
    start: [
      { href: 'jeonse.html', badge: 'Nên đọc', badgeClass: ' badge-accent', h3: 'Jeonse là gì?', p: 'Hình thức thuê trả một khoản đặt cọc lớn thay cho tiền thuê hằng tháng, được hoàn trả đủ khi hết hạn — cùng các thủ tục pháp lý bạn bắt buộc phải làm để bảo vệ tiền cọc.' },
      { href: 'foreigner-loan.html', badge: 'Vay vốn', badgeClass: '', h3: 'Người nước ngoài vay Jeonse được không?', p: 'Loại visa, chứng minh thu nhập và điều kiện thuê mà ngân hàng Hàn Quốc xét, và nên thử ngân hàng nào trước.' },
      { href: 'glossary.html', badge: 'Tra cứu', badgeClass: '', h3: 'Từ điển thuật ngữ nhà đất', p: 'Jeonse, sổ đăng ký (deungibu), DSR, LTV… — những từ xuất hiện khắp các trang khác, giải thích một lần.' },
    ],
    refTag: 'Công cụ & dữ liệu', refH2: 'Tính toán và tra giá',
    ref: [
      { href: 'calculators/index.html', badge: 'Máy tính', badgeClass: ' badge-success', h3: 'Máy tính', p: 'Thuế mua, đổi Jeonse↔thuê tháng, phí môi giới, quyết toán ngày giao nhà — tất cả tính ngay trên trình duyệt.' },
      { href: 'market.html', badge: 'Dữ liệu', badgeClass: ' badge-accent', h3: 'Giá thị trường', p: 'Giá giao dịch thực, giá theo khu vực, bản đồ tỷ lệ Jeonse — tra dữ liệu giá nhà Hàn Quốc.' },
    ],
    calloutStrong: 'Muốn tìm hiểu sâu hơn?',
    calloutBody: 'Trang tiếng Hàn có hơn 30 hướng dẫn chuyên sâu (đọc sổ đăng ký, phòng lừa đảo Jeonse, điều khoản hợp đồng, hợp đồng nội thất, phân tích chu kỳ thị trường…). Dùng chức năng dịch của trình duyệt (ví dụ dịch tích hợp của Chrome) đọc <a href="../guides.html">trang hướng dẫn tiếng Hàn</a> khá ổn.',
  },
  th: {
    title: 'คู่มือ', desc: 'คู่มืออสังหาริมทรัพย์เกาหลีสำหรับชาวต่างชาติ — Jeonse การเช่ารายเดือน สินเชื่อ ภาษี และอภิธานศัพท์ พร้อมเครื่องคำนวณ',
    h1: 'คู่มือ', lead: 'เนื้อหาบน TOPDA ที่แปลเป็นภาษาไทยแล้ว — ระบบเช่าแบบมัดจำ Jeonse ที่เป็นเอกลักษณ์ของเกาหลี สินเชื่อสำหรับชาวต่างชาติ อภิธานศัพท์ และเครื่องคำนวณที่ช่วยให้คุณได้ตัวเลข',
    startTag: 'เริ่มที่นี่', startH2: 'สำหรับชาวต่างชาติ', startP: 'สามเรื่องที่ผู้พำนักชาวต่างชาติเกือบทุกคนถามก่อน',
    start: [
      { href: 'jeonse.html', badge: 'ควรอ่าน', badgeClass: ' badge-accent', h3: 'Jeonse คืออะไร?', p: 'การเช่าที่จ่ายเงินมัดจำก้อนใหญ่แทนค่าเช่ารายเดือน และได้คืนเต็มจำนวนเมื่อครบสัญญา — พร้อมขั้นตอนทางกฎหมายที่คุณต้องทำเพื่อคุ้มครองเงินมัดจำ' },
      { href: 'foreigner-loan.html', badge: 'สินเชื่อ', badgeClass: '', h3: 'ชาวต่างชาติขอสินเชื่อ Jeonse ได้ไหม?', p: 'ประเภทวีซ่า หลักฐานรายได้ และเงื่อนไขการเช่าที่ธนาคารเกาหลีพิจารณา และควรลองธนาคารใดก่อน' },
      { href: 'glossary.html', badge: 'อ้างอิง', badgeClass: '', h3: 'อภิธานศัพท์อสังหาฯ เกาหลี', p: 'Jeonse, สำเนาทะเบียน (deungibu), DSR, LTV… — คำที่พบทั่วทุกหน้าในเว็บนี้ อธิบายไว้ในที่เดียว' },
    ],
    refTag: 'เครื่องมือและข้อมูล', refH2: 'คำนวณและดูราคา',
    ref: [
      { href: 'calculators/index.html', badge: 'เครื่องคำนวณ', badgeClass: ' badge-success', h3: 'เครื่องคำนวณ', p: 'ภาษีการได้มา แปลง Jeonse↔ค่าเช่ารายเดือน ค่านายหน้า การเคลียร์ยอดวันโอน — คำนวณในเบราว์เซอร์ทั้งหมด' },
      { href: 'market.html', badge: 'ข้อมูล', badgeClass: ' badge-accent', h3: 'ข้อมูลราคาตลาด', p: 'ราคาซื้อขายจริง ราคาตามพื้นที่ แผนที่อัตรา Jeonse — ค้นข้อมูลราคาบ้านในเกาหลี' },
    ],
    calloutStrong: 'อยากรู้ลึกกว่านี้?',
    calloutBody: 'เว็บภาษาเกาหลีมีคู่มือเชิงลึกกว่า 30 บทความ (อ่านทะเบียน ป้องกันการโกง Jeonse ข้อสัญญา สัญญาตกแต่ง วิเคราะห์วัฏจักรตลาด ฯลฯ) ใช้ฟังก์ชันแปลของเบราว์เซอร์ (เช่น การแปลในตัวของ Chrome) อ่าน <a href="../guides.html">หน้าคู่มือภาษาเกาหลี</a> ได้ผลดีพอสมควร',
  },
};

function cardHtml(card) {
  return `      <a class="card" href="${card.href}">
        <span class="badge${card.badgeClass}">${card.badge}</span>
        <h3>${card.h3}</h3>
        <p>${card.p}</p>
      </a>`;
}

function guidesPage(lang) {
  const c = CHROME[lang];
  const g = GUIDES[lang];
  const alts = hreflang('guides.html', ['ko', 'en', 'zh-Hans', 'zh-Hant', 'vi', 'th'], 'ko');
  const ld = `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"${c.home}","item":"https://topda.kr/${lang}/index.html"},{"@type":"ListItem","position":2,"name":"${g.title}","item":"https://topda.kr/${lang}/guides.html"}]}
</script>`;
  return `${head(lang, 'guides.html', g.title, g.desc, '\n' + ld, alts)}

${header(c, 'guides')}

<main class="container">
  <div class="article-header" style="border-bottom:0; padding-bottom:8px;">
    <div class="breadcrumb"><a href="index.html">${c.home}</a> / ${g.title}</div>
    <h1>${g.h1}</h1>
    <p class="lead">${g.lead}</p>
  </div>

  <section class="hub-section" aria-label="${g.startH2}">
    <div class="hub-section-head">
      <span class="hub-section-tag">${g.startTag}</span>
      <h2>${g.startH2}</h2>
      <p>${g.startP}</p>
    </div>
    <div class="cards-grid">
${g.start.map(cardHtml).join('\n')}
    </div>
  </section>

  <section class="hub-section" aria-label="${g.refH2}">
    <div class="hub-section-head">
      <span class="hub-section-tag">${g.refTag}</span>
      <h2>${g.refH2}</h2>
    </div>
    <div class="cards-grid">
${g.ref.map(cardHtml).join('\n')}
    </div>
  </section>

  <div class="callout callout-info" style="margin-top: 32px;">
    <div class="icon">i</div>
    <div class="body">
      <strong>${g.calloutStrong}</strong> ${g.calloutBody}
    </div>
  </div>
</main>

${footer(c)}

<script src="../assets/app.js?v=61e054e88c"></script>
</body>
</html>
`;
}

// ===================== MARKET (시세정보) =====================
const MARKET_STYLE = `
<style>
  .market-hero { display: grid; grid-template-columns: 1fr; gap: 14px; margin: 8px 0 28px; }
  .market-hero-card {
    display: flex; gap: 16px; align-items: center;
    padding: 24px; border-radius: 18px;
    background: linear-gradient(135deg, var(--accent) 0%, #2563eb 100%);
    color: #fff; box-shadow: 0 16px 32px -14px rgba(30,58,138,0.5);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .market-hero-card:hover { transform: translateY(-2px); }
  .market-hero-icon { width: 64px; height: 64px; border-radius: 18px; background: rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .market-hero-icon svg { width: 32px; height: 32px; color: #fff; }
  .market-hero-body { flex: 1; min-width: 0; }
  .market-hero-tag { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    background: rgba(255,255,255,0.22); display: inline-block; padding: 3px 10px; border-radius: 999px; margin-bottom: 8px; }
  .market-hero-body h2 { font-size: 1.4rem; color: #fff; margin: 0 0 6px; letter-spacing: -0.02em; }
  .market-hero-body p { font-size: 0.95rem; color: rgba(255,255,255,0.92); margin: 0; }
  .market-hero-cta { margin-top: 10px; display: inline-flex; align-items: center; gap: 4px; font-weight: 700; }
  .market-asof { font-size: 0.85rem; color: var(--text-muted); margin: 8px 0 0; }
  .market-asof .em { color: var(--text); font-weight: 700; }
  @media (min-width: 640px) { .market-hero-body h2 { font-size: 1.6rem; } }
</style>`;

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  transactions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  trends: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>',
  ratio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.2-7-11a7 7 0 0114 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  commercial: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 9h.01M13 9h.01M9 13h.01M13 13h.01M9 17h.01M13 17h.01"/></svg>',
};

const MARKET = {
  en: {
    title: 'Market Data', desc: 'Reported transaction prices, regional price indices, and a filter for finding complexes that fit your budget.',
    crumb: 'Market Data', sub: 'Regional price indices · complex-level transactions · budget filter',
    asofLoading: 'Checking data date…',
    heroTitle: 'Find your home', heroDesc: 'Enter budget, area, subway access, and school district — get scored complex recommendations.', heroCta: 'Set conditions and search →',
    toolsTag: 'Data tools', toolsH: 'More transactions & prices',
    tools: [
      { href: '../calculators/transactions.html', icon: 'transactions', h3: 'Real transaction prices', p: 'Recent sales by complex and unit size', link: 'Search →' },
      { href: '../calculators/market-trends.html', icon: 'trends', h3: 'Regional price dashboard', p: 'Sale & Jeonse price index, province → district', link: 'View →' },
      { href: '../calculators/jeonse-ratio.html', icon: 'ratio', h3: 'Jeonse-ratio map', p: 'Jeonse-to-price ratio by region, as a map and ranking', link: 'Open map →' },
      { href: '../calculators/commercial-rent.html', icon: 'commercial', h3: 'Office & retail rents', p: 'Rent, vacancy, and yield by office/retail type', link: 'Open map →' },
    ],
    note: 'The data tools run on Korean government datasets and display in Korean. Your browser’s built-in translation (e.g. Chrome) reads them well; the maps and numbers are language-independent.',
    jsLatest: (d, n) => `Latest transaction <span class="em">${d}</span> · ${n} deals`, jsClusters: (d) => `Complex data ${d}`, jsNone: 'Data date unavailable',
  },
  'zh-Hans': {
    title: '行情信息', desc: '在一个页面查看：找房、实际成交价、地区行情。',
    crumb: '行情信息', sub: '地区行情 · 小区实际成交 · 个性化推荐，一站汇总',
    asofLoading: '正在确认数据日期…',
    heroTitle: '找到合适的房子', heroDesc: '输入预算、地区、地铁、学区条件，即可按评分推荐小区。', heroCta: '输入条件并查找 →',
    toolsTag: '数据工具', toolsH: '更多成交与行情',
    tools: [
      { href: '../calculators/transactions.html', icon: 'transactions', h3: '实际成交价查询', p: '按小区与户型的近期买卖成交', link: '查询 →' },
      { href: '../calculators/market-trends.html', icon: 'trends', h3: '地区行情面板', p: '市·道→市·郡·区 买卖·全租价格指数', link: '查看 →' },
      { href: '../calculators/jeonse-ratio.html', icon: 'ratio', h3: '全租率地图', p: '各地区全租率，地图与排名', link: '查看地图 →' },
      { href: '../calculators/commercial-rent.html', icon: 'commercial', h3: '写字楼·商铺租金', p: '按写字楼·商铺类型的租金·空置率·收益率', link: '查看地图 →' },
    ],
    note: '这些数据工具基于韩国政府公开数据，界面为韩文。用浏览器的翻译功能（例如 Chrome 内置翻译）即可阅读；地图和数字与语言无关。',
    jsLatest: (d, n) => `实际成交最新 <span class="em">${d}</span> · 共 ${n} 笔`, jsClusters: (d) => `小区数据 ${d}`, jsNone: '暂无数据日期信息',
  },
  'zh-Hant': {
    title: '行情資訊', desc: '在一個頁面查看：找房、實際成交價、地區行情。',
    crumb: '行情資訊', sub: '地區行情 · 社區實際成交 · 個人化推薦，一站彙整',
    asofLoading: '正在確認資料日期…',
    heroTitle: '找到合適的房子', heroDesc: '輸入預算、地區、捷運、學區條件，即可依評分推薦社區。', heroCta: '輸入條件並查找 →',
    toolsTag: '資料工具', toolsH: '更多成交與行情',
    tools: [
      { href: '../calculators/transactions.html', icon: 'transactions', h3: '實際成交價查詢', p: '按社區與坪型的近期買賣成交', link: '查詢 →' },
      { href: '../calculators/market-trends.html', icon: 'trends', h3: '地區行情面板', p: '市·道→市·郡·區 買賣·全租價格指數', link: '查看 →' },
      { href: '../calculators/jeonse-ratio.html', icon: 'ratio', h3: '全租率地圖', p: '各地區全租率，地圖與排名', link: '查看地圖 →' },
      { href: '../calculators/commercial-rent.html', icon: 'commercial', h3: '辦公·店面租金', p: '按辦公·店面類型的租金·空置率·收益率', link: '查看地圖 →' },
    ],
    note: '這些資料工具基於韓國政府公開資料，介面為韓文。用瀏覽器的翻譯功能（例如 Chrome 內建翻譯）即可閱讀；地圖與數字與語言無關。',
    jsLatest: (d, n) => `實際成交最新 <span class="em">${d}</span> · 共 ${n} 筆`, jsClusters: (d) => `社區資料 ${d}`, jsNone: '暫無資料日期資訊',
  },
  vi: {
    title: 'Giá thị trường', desc: 'Tìm nhà, giá giao dịch thực và dữ liệu giá theo khu vực — tất cả trong một trang.',
    crumb: 'Giá thị trường', sub: 'Giá theo khu vực · giao dịch thực theo chung cư · gợi ý riêng, gộp một nơi',
    asofLoading: 'Đang kiểm tra ngày dữ liệu…',
    heroTitle: 'Tìm nhà theo nhu cầu', heroDesc: 'Nhập ngân sách, khu vực, gần ga, tuyến trường — nhận gợi ý chung cư theo điểm số.', heroCta: 'Nhập điều kiện và tìm →',
    toolsTag: 'Công cụ dữ liệu', toolsH: 'Xem thêm giao dịch & giá',
    tools: [
      { href: '../calculators/transactions.html', icon: 'transactions', h3: 'Tra giá giao dịch thực', p: 'Giao dịch mua bán gần đây theo chung cư và diện tích', link: 'Tra cứu →' },
      { href: '../calculators/market-trends.html', icon: 'trends', h3: 'Bảng giá theo khu vực', p: 'Chỉ số giá mua bán & Jeonse, tỉnh/thành → quận/huyện', link: 'Xem →' },
      { href: '../calculators/jeonse-ratio.html', icon: 'ratio', h3: 'Bản đồ tỷ lệ Jeonse', p: 'Tỷ lệ Jeonse trên giá theo khu vực, dạng bản đồ và xếp hạng', link: 'Xem bản đồ →' },
      { href: '../calculators/commercial-rent.html', icon: 'commercial', h3: 'Giá thuê văn phòng · mặt bằng', p: 'Tiền thuê, tỷ lệ trống và lợi suất theo loại văn phòng/mặt bằng', link: 'Xem bản đồ →' },
    ],
    note: 'Các công cụ dữ liệu dựa trên dữ liệu công khai của chính phủ Hàn Quốc và hiển thị bằng tiếng Hàn. Chức năng dịch của trình duyệt (ví dụ Chrome) đọc khá ổn; bản đồ và con số không phụ thuộc ngôn ngữ.',
    jsLatest: (d, n) => `Giao dịch mới nhất <span class="em">${d}</span> · ${n} giao dịch`, jsClusters: (d) => `Dữ liệu chung cư ${d}`, jsNone: 'Chưa có ngày dữ liệu',
  },
  th: {
    title: 'ข้อมูลราคาตลาด', desc: 'หาบ้าน ราคาซื้อขายจริง และข้อมูลราคาตามพื้นที่ — ในหน้าเดียว',
    crumb: 'ข้อมูลราคาตลาด', sub: 'ราคาตามพื้นที่ · ซื้อขายจริงรายโครงการ · แนะนำเฉพาะคุณ รวมไว้ที่เดียว',
    asofLoading: 'กำลังตรวจสอบวันที่ของข้อมูล…',
    heroTitle: 'หาบ้านตามเงื่อนไข', heroDesc: 'กรอกงบประมาณ พื้นที่ ใกล้สถานีรถไฟ เขตโรงเรียน — รับคำแนะนำโครงการตามคะแนน', heroCta: 'กรอกเงื่อนไขแล้วค้นหา →',
    toolsTag: 'เครื่องมือข้อมูล', toolsH: 'ดูการซื้อขายและราคาเพิ่มเติม',
    tools: [
      { href: '../calculators/transactions.html', icon: 'transactions', h3: 'ค้นราคาซื้อขายจริง', p: 'การซื้อขายล่าสุดตามโครงการและขนาดห้อง', link: 'ค้นหา →' },
      { href: '../calculators/market-trends.html', icon: 'trends', h3: 'แดชบอร์ดราคาตามพื้นที่', p: 'ดัชนีราคาซื้อขายและ Jeonse ระดับจังหวัด → เขต', link: 'ดู →' },
      { href: '../calculators/jeonse-ratio.html', icon: 'ratio', h3: 'แผนที่อัตรา Jeonse', p: 'อัตรา Jeonse ต่อราคาตามพื้นที่ เป็นแผนที่และอันดับ', link: 'ดูแผนที่ →' },
      { href: '../calculators/commercial-rent.html', icon: 'commercial', h3: 'ค่าเช่าออฟฟิศ · ร้านค้า', p: 'ค่าเช่า อัตราว่าง และผลตอบแทนตามประเภทออฟฟิศ/ร้านค้า', link: 'ดูแผนที่ →' },
    ],
    note: 'เครื่องมือข้อมูลใช้ชุดข้อมูลเปิดของรัฐบาลเกาหลีและแสดงผลเป็นภาษาเกาหลี ฟังก์ชันแปลของเบราว์เซอร์ (เช่น Chrome) อ่านได้ดี ส่วนแผนที่และตัวเลขไม่ขึ้นกับภาษา',
    jsLatest: (d, n) => `ซื้อขายล่าสุด <span class="em">${d}</span> · ${n} รายการ`, jsClusters: (d) => `ข้อมูลโครงการ ${d}`, jsNone: 'ไม่มีข้อมูลวันที่',
  },
};

function toolHtml(t) {
  return `      <a class="hub-tool" href="${t.href}">
        <div class="hub-tool-icon">${ICON[t.icon]}</div>
        <div class="hub-tool-body">
          <h3>${t.h3}</h3>
          <p>${t.p}</p>
          <span class="hub-tool-link">${t.link}</span>
        </div>
      </a>`;
}

function marketPage(lang) {
  const c = CHROME[lang];
  const m = MARKET[lang];
  const alts = hreflang('market.html', ['ko', 'en', 'zh-Hans', 'zh-Hant', 'vi', 'th'], 'ko');
  const ld = `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"${c.home}","item":"https://topda.kr/${lang}/index.html"},{"@type":"ListItem","position":2,"name":"${m.crumb}","item":"https://topda.kr/${lang}/market.html"}]}
</script>`;
  // JS 문자열(as-of)은 언어별 함수를 인라인으로 직렬화
  const jsLatest = m.jsLatest.toString();
  const jsClusters = m.jsClusters.toString();
  return `${head(lang, 'market.html', m.title, m.desc, MARKET_STYLE + '\n' + ld, alts)}

${header(c, 'market')}

<main class="container">
  <div class="article-header" style="margin-bottom: 4px;">
    <div class="breadcrumb"><a href="index.html">${c.home}</a> / ${m.crumb}</div>
    <h1 style="margin-bottom: 4px;">${m.crumb}</h1>
    <div class="meta"><span>${m.sub}</span></div>
    <p class="market-asof" id="marketAsof">${m.asofLoading}</p>
  </div>

  <section class="market-hero">
    <a class="market-hero-card" href="calculators/search.html">
      <div class="market-hero-icon">${ICON.search}</div>
      <div class="market-hero-body">
        <h2>${m.heroTitle}</h2>
        <p>${m.heroDesc}</p>
        <span class="market-hero-cta">${m.heroCta}</span>
      </div>
    </a>
  </section>

  <section class="hub-section">
    <div class="hub-section-head">
      <span class="hub-section-tag">${m.toolsTag}</span>
      <h2>${m.toolsH}</h2>
    </div>
    <div class="hub-grid">
${m.tools.map(toolHtml).join('\n')}
    </div>
  </section>

  <div class="callout callout-info" style="margin-top: 28px;">
    <div class="icon">i</div>
    <div class="body">${m.note}</div>
  </div>
</main>

${footer(c)}

<script src="../assets/app.js?v=61e054e88c"></script>
<script>
(function () {
  Promise.all([
    fetch('../assets/transactions.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch('../assets/apartments.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
  ]).then(function (results) {
    var tx = results[0], ap = results[1];
    var el = document.getElementById('marketAsof');
    if (!el) return;
    var parts = [];
    var jsLatest = ${jsLatest};
    var jsClusters = ${jsClusters};
    if (tx && tx.deals && tx.deals.length) {
      var latest = '';
      for (var i = 0; i < tx.deals.length; i++) { if (tx.deals[i].date > latest) latest = tx.deals[i].date; }
      if (latest) parts.push(jsLatest(latest, tx.deals.length.toLocaleString()));
    }
    if (ap && ap._meta && ap._meta.as_of) parts.push(jsClusters(ap._meta.as_of));
    el.innerHTML = parts.length ? parts.join(' · ') : ${JSON.stringify(m.jsNone)};
  });
})();
</script>
</body>
</html>
`;
}

// ===================== WRITE =====================
const written = [];
for (const lang of ['zh-Hans', 'zh-Hant', 'vi', 'th']) {
  mkdirSync(join(SITE, lang), { recursive: true });
  const p = join(SITE, lang, 'guides.html');
  writeFileSync(p, guidesPage(lang));
  written.push(p.replace(SITE + '/', ''));
}
for (const lang of ['en', 'zh-Hans', 'zh-Hant', 'vi', 'th']) {
  mkdirSync(join(SITE, lang), { recursive: true });
  const p = join(SITE, lang, 'market.html');
  writeFileSync(p, marketPage(lang));
  written.push(p.replace(SITE + '/', ''));
}
console.log('generated ' + written.length + ' hub pages:\n  ' + written.join('\n  '));
