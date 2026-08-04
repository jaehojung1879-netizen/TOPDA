#!/usr/bin/env node
// site/i18n/glossary.json 데이터로 zh-Hans/zh-Hant/vi/th 용어집 페이지를 생성한다.
// en/glossary.html 구조(검색·카테고리·JS 필터)를 그대로 재사용하고 문자열만 교체한다.
//   node scripts/gen_glossary_pages.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const GL = JSON.parse(readFileSync(join(SITE, 'i18n', 'glossary.json'), 'utf8'));
const LANGS = ['zh-Hans', 'zh-Hant', 'vi', 'th'];
const OG = { 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', vi: 'vi_VN', th: 'th_TH' };
const REVIEW = { 'zh-Hans': '机器初译，需母语者校对', 'zh-Hant': '機器初譯，需母語者校對', vi: 'bản dịch máy, cần người bản ngữ rà soát', th: 'แปลด้วยเครื่อง ต้องให้เจ้าของภาษาตรวจ' };

const UI = {
  'zh-Hans': { calc: '计算器', glossary: '术语表', home: '首页', title: '韩国房地产术语表（韩中对照）', lead: '合同、登记簿誊本、银行表格上会看到的词汇——韩文、罗马拼音与中文说明。使用搜索框筛选。', searchPh: '例如：押金、全租、보증금、税……', searchLabel: '搜索术语', howToUse: '如何使用', howToBody: '罗马拼音仅用于识别，非准确发音。定义为一般信息，不构成法律或税务意见——请务必与登记簿及持牌专业人士核实。', disc: '本页内容仅供一般信息参考，不构成法律、税务或金融建议。法律与费率可能变动，请在交易前咨询持牌专业人士。&copy; TOPDA.', noMatch: '没有匹配的术语。', count: (n, t) => n === t ? `共${t}个术语` : `${n} / ${t} 个术语` },
  'zh-Hant': { calc: '計算器', glossary: '術語表', home: '首頁', title: '韓國房地產術語表（韓中對照）', lead: '合約、登記簿謄本、銀行表格上會看到的詞彙——韓文、羅馬拼音與中文說明。使用搜尋框篩選。', searchPh: '例如：押金、全租、보증금、稅……', searchLabel: '搜尋術語', howToUse: '如何使用', howToBody: '羅馬拼音僅用於識別，非準確發音。定義為一般資訊，不構成法律或稅務意見——請務必與登記簿及持牌專業人士核實。', disc: '本頁內容僅供一般資訊參考，不構成法律、稅務或金融建議。法律與費率可能變動，請在交易前諮詢持牌專業人士。&copy; TOPDA.', noMatch: '沒有符合的術語。', count: (n, t) => n === t ? `共${t}個術語` : `${n} / ${t} 個術語` },
  vi: { calc: 'Công cụ tính', glossary: 'Từ điển', home: 'Trang chủ', title: 'Từ điển bất động sản Hàn Quốc (Hàn-Việt)', lead: 'Các từ bạn sẽ gặp trên hợp đồng, sổ đăng ký bất động sản, và biểu mẫu ngân hàng — bằng Hangul, phiên âm La-tinh và giải thích tiếng Việt. Dùng ô tìm kiếm để lọc.', searchPh: 'vd: tiền cọc, jeonse, 보증금, thuế…', searchLabel: 'Tìm từ', howToUse: 'Cách dùng', howToBody: 'Phiên âm chỉ mang tính nhận diện, không phải phát âm chuẩn. Định nghĩa chỉ là thông tin chung, không phải tư vấn pháp lý hay thuế — luôn đối chiếu với sổ đăng ký và chuyên gia có giấy phép.', disc: 'Nội dung chỉ mang tính thông tin chung, không phải tư vấn pháp lý, thuế hay tài chính. Luật và mức phí có thể thay đổi. Hãy tham khảo chuyên gia có giấy phép trước mọi giao dịch. &copy; TOPDA.', noMatch: 'Không có từ nào khớp.', count: (n, t) => n === t ? `${t} từ` : `${n} / ${t} từ` },
  th: { calc: 'เครื่องคำนวณ', glossary: 'อภิธานศัพท์', home: 'หน้าแรก', title: 'อภิธานศัพท์อสังหาริมทรัพย์เกาหลี (เกาหลี-ไทย)', lead: 'คำศัพท์ที่คุณจะเห็นในสัญญา ทะเบียนอสังหาริมทรัพย์ และแบบฟอร์มธนาคาร — เป็นฮันกึล คำอ่าน และคำอธิบายภาษาไทย ใช้ช่องค้นหาเพื่อกรอง', searchPh: 'เช่น เงินมัดจำ, jeonse, 보증금, ภาษี…', searchLabel: 'ค้นหาคำศัพท์', howToUse: 'วิธีใช้', howToBody: 'คำอ่านใช้เพื่อจดจำเท่านั้น ไม่ใช่การออกเสียงที่แม่นยำ คำจำกัดความเป็นข้อมูลทั่วไป ไม่ใช่คำแนะนำทางกฎหมายหรือภาษี — ควรตรวจสอบกับทะเบียนและผู้เชี่ยวชาญที่มีใบอนุญาตเสมอ', disc: 'เนื้อหานี้เป็นข้อมูลทั่วไป ไม่ใช่คำแนะนำทางกฎหมาย ภาษี หรือการเงิน กฎหมายและอัตราอาจเปลี่ยนแปลงได้ โปรดปรึกษาผู้เชี่ยวชาญที่มีใบอนุญาตก่อนทำธุรกรรม &copy; TOPDA.', noMatch: 'ไม่พบคำที่ตรงกัน', count: (n, t) => n === t ? `${t} คำ` : `${n} / ${t} คำ` },
};

function page(lang) {
  const u = UI[lang];
  const canon = `https://topda.kr/${lang}/glossary.html`;
  const alts = ['ko', 'en', 'zh-Hans', 'zh-Hant', 'vi', 'th'].map((l) => {
    const href = l === 'ko' ? null : `https://topda.kr/${l}/glossary.html`; // ko 원본에는 glossary.html 없음(en/glossary가 원본)
    return href ? `<link rel="alternate" hreflang="${l}" href="${href}" />` : '';
  }).filter(Boolean).join('\n');
  const review = `\n<!-- i18n:review lang=${lang} — ${REVIEW[lang]} -->`;

  const categories = GL.categories.map((cat) => {
    const label = cat.label[lang] || cat.label.en;
    const rows = cat.terms.map((t) => {
      const val = t[lang] || t.en;
      return `      <div class="row" data-term><span class="k">${t.ko}</span><span class="v">${val}</span></div>`;
    }).join('\n');
    return `    <h2 class="cl-section-title">${label}</h2>\n    <div class="def-list">\n${rows}\n    </div>`;
  }).join('\n\n');

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />${review}
<title>${u.title} — TOPDA</title>
<meta name="description" content="${u.lead}" />
<link rel="icon" href="https://topda.kr/assets/images/brand/logo.png" type="image/png" />
<link rel="canonical" href="${canon}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TOPDA" />
<meta property="og:title" content="${u.title} — TOPDA" />
<meta property="og:description" content="${u.lead}" />
<meta property="og:url" content="${canon}" />
<meta property="og:image" content="https://topda.kr/assets/images/brand/logo.png" />
<meta property="og:locale" content="${OG[lang]}" />
<meta name="twitter:card" content="summary_large_image" />
${alts}
<link rel="alternate" hreflang="x-default" href="https://topda.kr/en/glossary.html" />
<script defer src="https://topda.kr/assets/analytics.js?v=3e86e8b800"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
<link rel="stylesheet" href="../assets/styles.css?v=35b4b1c50a" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"${u.home}","item":"https://topda.kr/${lang}/index.html"},{"@type":"ListItem","position":2,"name":"${u.title}","item":"${canon}"}]}
</script>
</head>
<body>

<header class="site-header">
  <div class="container row">
    <a href="index.html" class="brand"><span class="brand-mark"></span>TOPDA</a>
    <nav class="nav">
      <a href="calculators/index.html" data-nav>${u.calc}</a>
      <a href="glossary.html" data-nav class="active">${u.glossary}</a>
      <a href="../en/index.html" data-nav>English</a>
    </nav>
    <button class="nav-toggle" data-nav-toggle aria-label="Menu">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
    </button>
  </div>
  <div class="mobile-menu" data-mobile-menu>
    <a href="calculators/index.html">${u.calc}</a>
    <a href="glossary.html">${u.glossary}</a>
    <a href="../en/index.html">English</a>
    <a href="../index.html">한국어</a>
  </div>
</header>

<main class="container-narrow">
  <div class="article-header">
    <div class="breadcrumb"><a href="index.html">${u.home}</a> / ${u.glossary}</div>
    <h1>${u.title}</h1>
    <p class="lead">${u.lead}</p>
  </div>

  <div class="field" style="margin: 8px 0 20px;">
    <label for="gl-search">${u.searchLabel}</label>
    <input id="gl-search" type="text" placeholder="${u.searchPh}" autocomplete="off" />
    <span class="hint" data-gl-count></span>
  </div>

  <div data-glossary>

${categories}

    <p class="fb-empty" data-gl-empty hidden>${u.noMatch}</p>
  </div>

  <div class="callout callout-info" style="margin-top: 32px;">
    <div class="icon">i</div>
    <div class="body">
      <strong>${u.howToUse}</strong>
      ${u.howToBody}
    </div>
  </div>
</main>

<footer class="site-footer">
  <div class="container">
    <p class="disclaimer">${u.disc}</p>
  </div>
</footer>

<script src="../assets/app.js?v=d3158aa00d"></script>
<script>
(function () {
  const input = document.getElementById('gl-search');
  const root = document.querySelector('[data-glossary]');
  if (!input || !root) return;
  const rows = Array.from(root.querySelectorAll('[data-term]'));
  const groups = Array.from(root.querySelectorAll('h2, .def-list'));
  const empty = root.querySelector('[data-gl-empty]');
  const countEl = document.querySelector('[data-gl-count]');
  const total = rows.length;
  const glCount = ${u.count.toString()};
  const setCount = (n) => { if (countEl) countEl.textContent = glCount(n, total); };
  setCount(total);
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    rows.forEach((r) => {
      const match = !q || r.textContent.toLowerCase().includes(q);
      r.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    groups.forEach((g) => {
      if (g.classList.contains('def-list')) {
        const any = Array.from(g.querySelectorAll('[data-term]')).some((r) => r.style.display !== 'none');
        g.style.display = any ? '' : 'none';
        const heading = g.previousElementSibling;
        if (heading && heading.tagName === 'H2') heading.style.display = any ? '' : 'none';
      }
    });
    if (empty) empty.hidden = visible !== 0;
    setCount(visible);
  });
})();
</script>
</body>
</html>
`;
}

let count = 0;
for (const lang of LANGS) {
  writeFileSync(join(SITE, lang, 'glossary.html'), page(lang));
  count++;
}
console.log(`generated ${count} glossary pages: ${LANGS.join(', ')}`);
