#!/usr/bin/env node
// 인테리어 가이드 허브의 다국어판 생성 → site/{lang}/interior/index.html
// 한국어 원본(interior/index.html) 구조를 그대로 옮기되 문자열만 번역한다.
// 자재 상세 페이지(cost/flooring/…)와 관련 글은 국내(한국어) 콘텐츠라 그대로 링크하고,
// 상단에 "상세는 한국어 → 브라우저 번역 권장" 안내를 명시한다(사실·시세 창작 금지).
//   node scripts/gen_interior_pages.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const LANGS = ['en', 'zh-Hans', 'zh-Hant', 'vi', 'th'];
const OG = { en: 'en_US', 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', vi: 'vi_VN', th: 'th_TH' };
const REVIEW = {
  en: 'machine-assisted draft, needs native review', 'zh-Hans': '机器初译，需母语者校对',
  'zh-Hant': '機器初譯，需母語者校對', vi: 'bản dịch máy, cần người bản ngữ rà soát', th: 'แปลด้วยเครื่อง ต้องให้เจ้าของภาษาตรวจ',
};
const CHROME = {
  en: { guides: 'Guides', calc: 'Calculators', market: 'Market Data', checklists: 'Checklists', board: 'Board', about: 'About', korean: '한국어', home: 'Home', tagline: 'Korea real estate, examined in detail.', exploreH: 'Explore', siteH: 'Site', cats: 'Categories', principlesL: 'About & principles', disclaimerL: 'Disclaimer' },
  'zh-Hans': { guides: '指南', calc: '计算器', market: '行情信息', checklists: '清单', board: '论坛', about: '关于', korean: '한국어', home: '首页', tagline: '韩国房产，逐一细究。', exploreH: '探索', siteH: '站点', cats: '分类', principlesL: '关于·运营原则', disclaimerL: '免责声明' },
  'zh-Hant': { guides: '指南', calc: '計算器', market: '行情資訊', checklists: '清單', board: '論壇', about: '關於', korean: '한국어', home: '首頁', tagline: '韓國房產，逐一細究。', exploreH: '探索', siteH: '網站', cats: '分類', principlesL: '關於·營運原則', disclaimerL: '免責聲明' },
  vi: { guides: 'Hướng dẫn', calc: 'Máy tính', market: 'Giá thị trường', checklists: 'Danh sách', board: 'Diễn đàn', about: 'Giới thiệu', korean: '한국어', home: 'Trang chủ', tagline: 'Bất động sản Hàn Quốc, tường tận từng chi tiết.', exploreH: 'Khám phá', siteH: 'Trang', cats: 'Danh mục', principlesL: 'Giới thiệu · nguyên tắc', disclaimerL: 'Miễn trừ' },
  th: { guides: 'คู่มือ', calc: 'เครื่องคำนวณ', market: 'ข้อมูลราคาตลาด', checklists: 'เช็กลิสต์', board: 'กระดาน', about: 'เกี่ยวกับ', korean: '한국어', home: 'หน้าแรก', tagline: 'อสังหาฯ เกาหลี ทีละรายละเอียด', exploreH: 'สำรวจ', siteH: 'ไซต์', cats: 'หมวดหมู่', principlesL: 'เกี่ยวกับ · หลักการ', disclaimerL: 'ข้อจำกัดความรับผิด' },
};

// 자재 카드(6종): 데이터는 언어 공통(파일·이미지·pro/rec 키만). 문구는 T.mat 에서.
const MAT_KEYS = ['flooring', 'wallpaper', 'tile', 'bathroom', 'kitchen', 'windows'];
const MAT_IMG = {
  flooring: 'flooring/gangmaru.webp', wallpaper: 'wallpaper/silk.webp', tile: 'tile/porcelain.webp',
  bathroom: 'bathroom/shower-booth.webp', kitchen: 'kitchen/engineered-stone.webp', windows: 'windows/system-window.webp',
};

const T = {
  en: {
    title: 'Interior Renovation Guide', desc: 'Korea interior renovation for foreigners — flooring, wallpaper, tile, bathroom, kitchen and windows, plus how to pick a contractor, compare quotes, sign a standard contract and handle defects.',
    eyebrow: 'Interior guide', h1: 'Interior renovation, one topic at a time',
    lead: 'A plain-language overview of finishes — <strong>flooring, wallpaper, tile, bathroom, kitchen, windows</strong> — plus a <strong>contractor guide</strong> covering firm types, quotes, contracts and defect repair. Written as practical criteria for choosing and reviewing quotes yourself, not as advertising.',
    asof: 'As of 2026.05', priceNote: 'Prices are market-practice references',
    xlateNote: 'The detailed material pages and linked articles are in Korean. Your browser’s built-in translation (e.g. Chrome) reads them well; prices are in KRW and reflect Korean market practice.',
    tocH: 'What this guide covers', toc: ['① Materials & finishes', '② Choosing a contractor', 'Official sources · dispute mediation', 'Standard schedule'],
    matTag: '01', matH: 'Materials & finishes', matDesc: 'Compares visible finishes — floor, wall, tile, bathroom, kitchen, windows — and performance-critical materials. Each card shows the main types, strengths and best-fit spaces; the detailed guide continues into selection, quoting, installation and care.',
    costTitle: 'Interior cost · budget by size', costDesc: 'Before picking individual finishes, get the big picture: cost share by unit size and trade, turnkey vs semi-self vs self, and the add-ons quotes often miss.',
    costFactK1: 'Key', costFactV1: 'Kitchen, bathroom and windows are over half the budget', costFactK2: 'Watch', costFactV2: 'VAT, demolition and worn-out utility replacement are easy to leave out', costLink: 'See the cost guide →',
    proK: 'Strength', recK: 'Best for', matLink: 'guide →',
    mat: {
      flooring: { h3: 'Flooring', desc: 'Compares gangmaru (engineered), laminate, solid wood, LVT and sheet vinyl by price, durability, noise and heat conduction.', pro: 'Balances ondol heat transfer with durability', rec: 'Living room, bedrooms — general living space' },
      wallpaper: { h3: 'Wallpaper & wall finish', desc: 'Silk vs paper vs mural wallpaper vs water-based paint, install order, and fixing peeling/mold defects.', pro: 'Changes the largest surface area', rec: 'All walls and ceilings, accent walls' },
      tile: { h3: 'Tile', desc: 'Porcelain vs ceramic vs polished, size choice, thinset vs adhesive install, and grout/caulk care.', pro: 'Near-permanent, water- and stain-resistant', rec: 'Bathroom, kitchen, entryway, balcony' },
      bathroom: { h3: 'Bathroom', desc: 'Waterproofing, slope and ventilation-first work order, fixture/faucet choice, and preventing leaks and mold.', pro: 'Hidden waterproofing is what matters most', rec: 'Full bathroom remodel' },
      kitchen: { h3: 'Kitchen', desc: 'Door materials (LPM, PET, painted) and countertops (engineered stone, etc.), plus built-in electrical/plumbing needs.', pro: 'Choose for daily workflow and durability', rec: 'Kitchen cabinet replacement / remodel' },
      windows: { h3: 'Windows & doors', desc: 'System vs double windows, insulation/airtightness grade (U-value), glazing, and condensation/noise solutions.', pro: 'Drives heating/cooling cost and condensation', rec: 'Balcony/exterior windows, door replacement' },
    },
    brandNote: '※ A lighting guide (colour temperature, colour rendering, downlight layout and circuit planning) is published in Korean at /interior/lighting.html — browser translation reads it well.',
    coTag: '02', coH: 'Choosing a contractor', coDesc: 'From first search through consultation, quote, contract, construction and defect repair — in the order a consumer should check. Each step links to a detailed (Korean) article.',
    steps: [
      ['1. Understand firm types', 'General / specialist / direct / platform — scope of responsibility and construction-business registration'],
      ['2. How to find firms', 'Check track record and portfolio; look up KISCON-registered firms'],
      ['3. Prep before consulting', 'Organize scope, budget and material taste with photos'],
      ['4. Compare quotes', 'Split into material / spec / quantity / unit price; compare 3–5 firms on identical terms'],
      ['5. Check the contract', 'Standard contract, staged payment (deposit/interim/balance), late-penalty clause'],
      ['6. Prevent extra-cost disputes', 'State in the contract that extra work can’t be billed without written consent'],
      ['7. Check during construction', 'Photograph/record trades that get covered up — waterproofing, plumbing, electrical'],
      ['8. Defect repair & aftercare', 'Use trade warranty periods (papering 1yr, flooring/tile 2yr, waterproofing 3yr)'],
    ],
    relTag: 'Interior contract checklist',
    rel: [
      { cat: 'Firm types · finding', h3: '8 ways to choose an interior firm', p: 'Business registration, track record, defect warranty, standard contract' },
      { cat: 'Comparing quotes', h3: 'How to compare quotes properly', p: 'Split material / spec / quantity / unit price · extra-work consent process' },
      { cat: 'Checking the contract', h3: 'Standard contract & staged payment', p: 'Deposit 30 / interim 40 / balance 30 · penalty & defect clauses' },
      { cat: 'Defects · disputes', h3: 'Claiming defect repair & disputes', p: 'Warranty periods · free mediation by KCA / construction dispute board' },
    ],
    offH: 'Official sources · dispute mediation', offDesc: 'Standard contracts, dispute-application channels and registered-firm lookup.',
    src: [
      { icon: '📋', h4: 'FTC standard contract', p: 'Interior & window work' },
      { icon: '🛡', h4: 'Korea Consumer Agency (1372)', p: 'Free interior-dispute counseling' },
      { icon: '⚖', h4: 'Construction Dispute Mediation Committee', p: 'Defect & payment mediation' },
      { icon: '🔍', h4: 'KISCON', p: 'Look up registered construction firms' },
      { icon: '⚖', h4: 'Framework Act on the Construction Industry', p: 'Statutory defect-warranty periods' },
      { icon: '🏛', h4: 'Ministry of Land (MOLIT)', p: 'Interior-business registration standards' },
    ],
    schH: 'Standard interior schedule (reference)', schSub: 'Based on closing day D-30',
    sched: [
      ['D-45 – D-30', 'Concept & budget', 'Gather 50 photos'],
      ['D-30 – D-15', 'Visit-quote 3–5 firms', 'Quote comparison'],
      ['D-15 – D-7', 'Sign standard contract, pay deposit', 'Selection criteria'],
      ['D-day – +21d', 'Demolition → carpentry → papering/paint → finish', 'Contract checklist'],
      ['Completion +14d', 'Defect check → pay balance', 'Photo/video record'],
    ],
    disclaimerT: 'Disclaimer', disclaimerB: 'This guide is general information only. Material prices and labor vary widely by time, region and firm; base your final contract on an on-site quote and a standard contract.',
  },
  'zh-Hans': {
    title: '装修（室内设计）指南', desc: '面向外国人的韩国装修指南——地板、壁纸、瓷砖、卫浴、厨房、门窗，以及如何选公司、比价、签标准合同与处理瑕疵。',
    eyebrow: '装修指南', h1: '装修，一次一个主题从头到尾',
    lead: '用通俗语言梳理各类饰面——<strong>地板、壁纸、瓷砖、卫浴、厨房、门窗</strong>，并附上涵盖公司类型、报价、合同与瑕疵维修的<strong>选公司指南</strong>。这不是广告，而是消费者自己挑选、审阅报价时可用的实务标准。',
    asof: '基准时点 2026.05', priceNote: '价格为市场惯例参考值',
    xlateNote: '各饰面的详细页面与相关文章为韩文。用浏览器的翻译功能（例如 Chrome 内置翻译）即可阅读；价格以韩元计并反映韩国市场惯例。',
    tocH: '本指南的构成', toc: ['① 材料·饰面', '② 选择装修公司', '官方资料·纠纷调解', '标准工期'],
    matTag: '01', matH: '材料·饰面', matDesc: '比较看得见的饰面——地板、墙面、瓷砖、卫浴、厨房、门窗，以及性能重要的材料。每张卡片先看代表种类·优点·推荐空间，进入详细指南后延伸到选择·报价·施工·养护。',
    costTitle: '装修费用·按面积预算', costDesc: '在挑选单项饰面前，先看整体预算的大图：按面积·工序的费用占比、整包 vs 半自装 vs 自装，以及报价常漏掉的额外费用。',
    costFactK1: '核心', costFactV1: '厨房·卫浴·门窗占预算一半以上', costFactK2: '注意', costFactV2: '增值税·拆除·老旧管线更换容易被漏掉', costLink: '查看费用指南 →',
    proK: '优点', recK: '推荐', matLink: '指南 →',
    mat: {
      flooring: { h3: '地板', desc: '按单价·耐久·隔音·导热比较强化实木复合（强马鲁）、强化、实木、LVT、地革。', pro: '兼顾地暖导热与耐久', rec: '客厅·卧室等居住空间' },
      wallpaper: { h3: '壁纸·墙面饰面', desc: '丝绸·合纸·壁画壁纸与水性涂料的差异、施工顺序、起翘·霉变瑕疵应对。', pro: '改变面积最大的饰面', rec: '整墙·天花板、点缀墙' },
      tile: { h3: '瓷砖', desc: '瓷质·陶质·抛光区分与尺寸选择、干贴 vs 湿贴、填缝·打胶养护。', pro: '耐水耐污的半永久饰面', rec: '卫浴·厨房·玄关·阳台' },
      bathroom: { h3: '卫浴', desc: '以防水·坡度·通风为核心的施工顺序、洁具·水龙头选择、漏水·霉变预防。', pro: '看不见的防水施工是关键', rec: '整体卫生间改造' },
      kitchen: { h3: '厨房', desc: '门板材（LPM·PET·喷漆）与台面（人造大理石·石英石等）、嵌入式电气·管线条件比较。', pro: '按每日动线·耐用选择', rec: '厨房橱柜更换·改造' },
      windows: { h3: '门窗', desc: '系统窗·双层窗的隔热·气密等级（传热系数）、玻璃构成、结露·隔音对策。', pro: '决定冷暖费与结露的材料', rec: '阳台·外窗、房门更换' },
    },
    brandNote: '※ 照明指南（色温·显色性·筒灯布置·回路规划）已以韩文发布于 /interior/lighting.html，可用浏览器翻译阅读。',
    coTag: '02', coH: '选择装修公司', coDesc: '从初次找公司到咨询·报价·合同·施工·瑕疵维修，按消费者应确认的顺序整理。每一步链接到详细（韩文）文章。',
    steps: [
      ['1. 了解公司类型', '综合·专业·直营·平台——各类型的责任范围与建筑业登记与否'],
      ['2. 找公司的方法', '确认施工业绩·作品集，查询 KISCON 登记企业'],
      ['3. 咨询前准备', '把想要的范围·预算·材料喜好连同照片整理好'],
      ['4. 比较报价', '拆分材料名·规格·数量·单价四项，3~5 家同条件比较'],
      ['5. 确认合同', '标准合同·分期付款（首款/中期/尾款）·逾期违约金条款'],
      ['6. 预防加项纠纷', '在合同注明：未经书面同意的加项不得计费'],
      ['7. 施工中确认', '防水·管线·电气等封闭后看不到的工序要拍照·录像记录'],
      ['8. 瑕疵维修·售后', '善用各工序的瑕疵担保期（贴壁纸 1 年·地板·瓷砖 2 年·防水 3 年）'],
    ],
    relTag: '相关（韩文）',
    rel: [
      { cat: '公司类型·寻找', h3: '选装修公司的 8 个要点', p: '建筑业登记·施工业绩·瑕疵保修·使用标准合同' },
      { cat: '比较报价', h3: '报价比较的正道', p: '材料·规格·数量·单价四项拆分·加项同意流程' },
      { cat: '确认合同', h3: '标准合同 & 分期付款', p: '首款 30 / 中期 40 / 尾款 30·违约金·瑕疵条款' },
      { cat: '瑕疵·纠纷', h3: '瑕疵维修索赔·纠纷应对', p: '瑕疵担保期·韩国消费者院·建设纠纷调解委免费调解' },
    ],
    offH: '官方资料·纠纷调解', offDesc: '标准合同、纠纷申请窗口与登记企业查询处。',
    src: [
      { icon: '📋', h4: '公正委标准合同', p: '室内建筑·门窗工程' },
      { icon: '🛡', h4: '韩国消费者院（1372）', p: '装修纠纷免费咨询' },
      { icon: '⚖', h4: '建设纠纷调解委员会', p: '瑕疵·款项纠纷调解' },
      { icon: '🔍', h4: '建设产业知识信息系统（KISCON）', p: '查询建筑业登记企业' },
      { icon: '⚖', h4: '建设产业基本法', p: '瑕疵保修期限' },
      { icon: '🏛', h4: '国土交通部（MOLIT）', p: '室内建筑业登记标准' },
    ],
    schH: '标准装修工期（参考）', schSub: '以交房日 D-30 为准',
    sched: [
      ['D-45 ~ D-30', '概念·预算整理', '收集 50 张照片'],
      ['D-30 ~ D-15', '3~5 家上门报价', '报价比较法'],
      ['D-15 ~ D-7', '签标准合同·付定金', '选公司标准'],
      ['D-day ~ +21天', '拆除 → 木工 → 贴壁纸·涂装 → 收尾', '合同检查'],
      ['竣工 +14天', '瑕疵检查 → 付尾款', '照片·录像记录'],
    ],
    disclaimerT: '免责', disclaimerB: '本指南仅供一般参考。材料单价·施工费按时点·地区·公司差异很大，最终合同请以上门报价·标准合同为基础进行。',
  },
  'zh-Hant': {
    title: '裝修（室內設計）指南', desc: '面向外國人的韓國裝修指南——地板、壁紙、磁磚、衛浴、廚房、門窗，以及如何選公司、比價、簽標準合約與處理瑕疵。',
    eyebrow: '裝修指南', h1: '裝修，一次一個主題從頭到尾',
    lead: '用通俗語言梳理各類飾面——<strong>地板、壁紙、磁磚、衛浴、廚房、門窗</strong>，並附上涵蓋公司類型、報價、合約與瑕疵維修的<strong>選公司指南</strong>。這不是廣告，而是消費者自己挑選、審閱報價時可用的實務標準。',
    asof: '基準時點 2026.05', priceNote: '價格為市場慣例參考值',
    xlateNote: '各飾面的詳細頁面與相關文章為韓文。用瀏覽器的翻譯功能（例如 Chrome 內建翻譯）即可閱讀；價格以韓元計並反映韓國市場慣例。',
    tocH: '本指南的構成', toc: ['① 材料·飾面', '② 選擇裝修公司', '官方資料·糾紛調解', '標準工期'],
    matTag: '01', matH: '材料·飾面', matDesc: '比較看得見的飾面——地板、牆面、磁磚、衛浴、廚房、門窗，以及性能重要的材料。每張卡片先看代表種類·優點·推薦空間，進入詳細指南後延伸到選擇·報價·施工·養護。',
    costTitle: '裝修費用·按坪數預算', costDesc: '在挑選單項飾面前，先看整體預算的大圖：按坪數·工序的費用占比、統包 vs 半自裝 vs 自裝，以及報價常漏掉的額外費用。',
    costFactK1: '核心', costFactV1: '廚房·衛浴·門窗占預算一半以上', costFactK2: '注意', costFactV2: '加值稅·拆除·老舊管線更換容易被漏掉', costLink: '查看費用指南 →',
    proK: '優點', recK: '推薦', matLink: '指南 →',
    mat: {
      flooring: { h3: '地板', desc: '按單價·耐久·隔音·導熱比較超耐磨實木（強化實木複合）、強化、實木、LVT、地板革。', pro: '兼顧地暖導熱與耐久', rec: '客廳·臥室等居住空間' },
      wallpaper: { h3: '壁紙·牆面飾面', desc: '絲綢·合紙·壁畫壁紙與水性塗料的差異、施工順序、翹起·發霉瑕疵應對。', pro: '改變面積最大的飾面', rec: '整牆·天花板、跳色牆' },
      tile: { h3: '磁磚', desc: '瓷質·陶質·拋光區分與尺寸選擇、乾式 vs 濕式黏貼、填縫·打矽利康養護。', pro: '耐水耐污的半永久飾面', rec: '衛浴·廚房·玄關·陽台' },
      bathroom: { h3: '衛浴', desc: '以防水·洩水坡·通風為核心的施工順序、衛浴設備·龍頭選擇、漏水·發霉預防。', pro: '看不見的防水施工是關鍵', rec: '整體衛浴改造' },
      kitchen: { h3: '廚房', desc: '門板材（LPM·PET·烤漆）與檯面（人造大理石·石英石等）、嵌入式電氣·管線條件比較。', pro: '按每日動線·耐用選擇', rec: '廚具更換·改造' },
      windows: { h3: '門窗', desc: '系統窗·雙層窗的隔熱·氣密等級（熱傳透率）、玻璃構成、結露·隔音對策。', pro: '決定冷暖氣費與結露的材料', rec: '陽台·外窗、房門更換' },
    },
    brandNote: '※ 照明指南（色溫·顯色性·筒燈配置·迴路規劃）已以韓文發布於 /interior/lighting.html，可用瀏覽器翻譯閱讀。',
    coTag: '02', coH: '選擇裝修公司', coDesc: '從初次找公司到諮詢·報價·合約·施工·瑕疵維修，按消費者應確認的順序整理。每一步連結到詳細（韓文）文章。',
    steps: [
      ['1. 了解公司類型', '綜合·專業·直營·平台——各類型的責任範圍與營造業登記與否'],
      ['2. 找公司的方法', '確認施工業績·作品集，查詢 KISCON 登記業者'],
      ['3. 諮詢前準備', '把想要的範圍·預算·材料喜好連同照片整理好'],
      ['4. 比較報價', '拆分材料名·規格·數量·單價四項，3~5 家同條件比較'],
      ['5. 確認合約', '標準合約·分期付款（訂金/期中/尾款）·逾期違約金條款'],
      ['6. 預防加項糾紛', '在合約註明：未經書面同意的加項不得計費'],
      ['7. 施工中確認', '防水·管線·電氣等封閉後看不到的工序要拍照·錄影記錄'],
      ['8. 瑕疵維修·售後', '善用各工序的瑕疵擔保期（貼壁紙 1 年·地板·磁磚 2 年·防水 3 年）'],
    ],
    relTag: '相關（韓文）',
    rel: [
      { cat: '公司類型·尋找', h3: '選裝修公司的 8 個要點', p: '營造業登記·施工業績·瑕疵保固·使用標準合約' },
      { cat: '比較報價', h3: '報價比較的正道', p: '材料·規格·數量·單價四項拆分·加項同意流程' },
      { cat: '確認合約', h3: '標準合約 & 分期付款', p: '訂金 30 / 期中 40 / 尾款 30·違約金·瑕疵條款' },
      { cat: '瑕疵·糾紛', h3: '瑕疵維修求償·糾紛應對', p: '瑕疵擔保期·韓國消費者院·建設糾紛調解委免費調解' },
    ],
    offH: '官方資料·糾紛調解', offDesc: '標準合約、糾紛申請窗口與登記業者查詢處。',
    src: [
      { icon: '📋', h4: '公平會標準合約', p: '室內裝修·門窗工程' },
      { icon: '🛡', h4: '韓國消費者院（1372）', p: '裝修糾紛免費諮詢' },
      { icon: '⚖', h4: '建設糾紛調解委員會', p: '瑕疵·款項糾紛調解' },
      { icon: '🔍', h4: '建設產業知識資訊系統（KISCON）', p: '查詢營造業登記業者' },
      { icon: '⚖', h4: '建設產業基本法', p: '瑕疵保固期限' },
      { icon: '🏛', h4: '國土交通部（MOLIT）', p: '室內裝修業登記標準' },
    ],
    schH: '標準裝修工期（參考）', schSub: '以交屋日 D-30 為準',
    sched: [
      ['D-45 ~ D-30', '概念·預算整理', '蒐集 50 張照片'],
      ['D-30 ~ D-15', '3~5 家到府報價', '報價比較法'],
      ['D-15 ~ D-7', '簽標準合約·付訂金', '選公司標準'],
      ['D-day ~ +21天', '拆除 → 木工 → 貼壁紙·塗裝 → 收尾', '合約檢查'],
      ['竣工 +14天', '瑕疵檢查 → 付尾款', '照片·錄影記錄'],
    ],
    disclaimerT: '免責', disclaimerB: '本指南僅供一般參考。材料單價·施工費按時點·地區·公司差異很大，最終合約請以到府報價·標準合約為基礎進行。',
  },
  vi: {
    title: 'Hướng dẫn cải tạo nội thất', desc: 'Cải tạo nội thất Hàn Quốc cho người nước ngoài — sàn, giấy dán tường, gạch, phòng tắm, bếp và cửa, cùng cách chọn nhà thầu, so báo giá, ký hợp đồng chuẩn và xử lý lỗi.',
    eyebrow: 'Hướng dẫn nội thất', h1: 'Cải tạo nội thất, từng chủ đề một',
    lead: 'Tổng quan dễ hiểu về vật liệu hoàn thiện — <strong>sàn, giấy dán tường, gạch, phòng tắm, bếp, cửa</strong> — kèm <strong>hướng dẫn chọn nhà thầu</strong> về loại hình công ty, báo giá, hợp đồng và sửa lỗi. Viết như tiêu chí thực dụng để bạn tự chọn và xem xét báo giá, không phải quảng cáo.',
    asof: 'Cập nhật 2026.05', priceNote: 'Giá là tham chiếu theo thông lệ thị trường',
    xlateNote: 'Các trang vật liệu chi tiết và bài viết liên quan bằng tiếng Hàn. Chức năng dịch của trình duyệt (ví dụ Chrome) đọc khá ổn; giá tính bằng KRW và theo thông lệ thị trường Hàn Quốc.',
    tocH: 'Nội dung hướng dẫn', toc: ['① Vật liệu & hoàn thiện', '② Chọn nhà thầu', 'Nguồn chính thức · hòa giải tranh chấp', 'Lịch thi công chuẩn'],
    matTag: '01', matH: 'Vật liệu & hoàn thiện', matDesc: 'So sánh các vật liệu hoàn thiện nhìn thấy — sàn, tường, gạch, phòng tắm, bếp, cửa — và vật liệu quan trọng về hiệu năng. Mỗi thẻ cho biết loại tiêu biểu, ưu điểm và không gian phù hợp; hướng dẫn chi tiết đi tiếp tới chọn, báo giá, thi công và bảo dưỡng.',
    costTitle: 'Chi phí nội thất · ngân sách theo diện tích', costDesc: 'Trước khi chọn từng vật liệu, hãy nắm bức tranh tổng: tỷ trọng chi phí theo diện tích/hạng mục, trọn gói vs bán tự làm vs tự làm, và các chi phí phát sinh báo giá hay bỏ sót.',
    costFactK1: 'Cốt lõi', costFactV1: 'Bếp, phòng tắm và cửa chiếm hơn nửa ngân sách', costFactK2: 'Lưu ý', costFactV2: 'VAT, phá dỡ và thay thế đường ống cũ dễ bị bỏ sót', costLink: 'Xem hướng dẫn chi phí →',
    proK: 'Ưu điểm', recK: 'Phù hợp', matLink: 'hướng dẫn →',
    mat: {
      flooring: { h3: 'Sàn', desc: 'So sánh sàn gỗ kỹ thuật (gangmaru), laminate, gỗ tự nhiên, LVT và sàn nhựa cuộn theo giá, độ bền, cách âm và dẫn nhiệt.', pro: 'Cân bằng truyền nhiệt sàn ondol và độ bền', rec: 'Phòng khách, phòng ngủ — không gian ở' },
      wallpaper: { h3: 'Giấy dán tường & hoàn thiện tường', desc: 'Giấy lụa vs giấy thường vs tranh tường vs sơn gốc nước, thứ tự thi công, xử lý bong tróc/nấm mốc.', pro: 'Thay đổi diện tích lớn nhất', rec: 'Toàn bộ tường·trần, tường điểm nhấn' },
      tile: { h3: 'Gạch', desc: 'Phân biệt porcelain·ceramic·đánh bóng, chọn kích thước, dán vữa vs keo, và bảo dưỡng ron·keo.', pro: 'Bán vĩnh cửu, chống nước và bẩn', rec: 'Phòng tắm, bếp, lối vào, ban công' },
      bathroom: { h3: 'Phòng tắm', desc: 'Thứ tự ưu tiên chống thấm·độ dốc·thông gió, chọn thiết bị·vòi, và ngăn rò rỉ·nấm mốc.', pro: 'Chống thấm ẩn là quan trọng nhất', rec: 'Cải tạo phòng tắm toàn bộ' },
      kitchen: { h3: 'Bếp', desc: 'Vật liệu cánh (LPM·PET·sơn) và mặt bàn (đá nhân tạo, v.v.), cùng yêu cầu điện/nước âm.', pro: 'Chọn theo luồng công việc hằng ngày và độ bền', rec: 'Thay tủ bếp / cải tạo' },
      windows: { h3: 'Cửa sổ & cửa', desc: 'Cửa hệ vs cửa hai lớp, cấp cách nhiệt/kín khí (hệ số U), cấu tạo kính, và giải pháp đọng sương·tiếng ồn.', pro: 'Quyết định chi phí sưởi/làm mát và đọng sương', rec: 'Cửa ban công/ngoài, thay cửa phòng' },
    },
    brandNote: '※ Hướng dẫn chiếu sáng (nhiệt độ màu, độ hoàn màu, bố trí đèn âm trần, chia mạch) đã đăng bằng tiếng Hàn tại /interior/lighting.html — dịch bằng trình duyệt đọc tốt.',
    coTag: '02', coH: 'Chọn nhà thầu', coDesc: 'Từ lúc tìm nhà thầu tới tư vấn·báo giá·hợp đồng·thi công·sửa lỗi, theo thứ tự người tiêu dùng nên kiểm tra. Mỗi bước dẫn tới bài viết chi tiết (tiếng Hàn).',
    steps: [
      ['1. Hiểu loại hình công ty', 'Tổng hợp / chuyên môn / trực tiếp / nền tảng — phạm vi trách nhiệm và việc đăng ký ngành xây dựng'],
      ['2. Cách tìm công ty', 'Kiểm tra thành tích·hồ sơ; tra công ty đăng ký trên KISCON'],
      ['3. Chuẩn bị trước tư vấn', 'Sắp xếp phạm vi, ngân sách, gu vật liệu kèm ảnh'],
      ['4. So sánh báo giá', 'Tách vật liệu / quy cách / số lượng / đơn giá; so 3–5 công ty cùng điều kiện'],
      ['5. Kiểm tra hợp đồng', 'Hợp đồng chuẩn, thanh toán theo giai đoạn (cọc/giữa/cuối), điều khoản phạt trễ'],
      ['6. Ngừa tranh chấp phát sinh', 'Ghi trong hợp đồng: không được tính phí phần phát sinh nếu chưa đồng ý bằng văn bản'],
      ['7. Kiểm tra khi thi công', 'Chụp/quay các hạng mục sẽ bị che — chống thấm, đường ống, điện'],
      ['8. Sửa lỗi & hậu mãi', 'Dùng thời hạn bảo hành (dán giấy 1 năm, sàn/gạch 2 năm, chống thấm 3 năm)'],
    ],
    relTag: 'Liên quan (tiếng Hàn)',
    rel: [
      { cat: 'Loại hình · tìm', h3: '8 cách chọn công ty nội thất', p: 'Đăng ký ngành, thành tích, bảo hành lỗi, dùng hợp đồng chuẩn' },
      { cat: 'So báo giá', h3: 'So sánh báo giá đúng cách', p: 'Tách vật liệu / quy cách / số lượng / đơn giá · quy trình đồng ý phát sinh' },
      { cat: 'Kiểm tra hợp đồng', h3: 'Hợp đồng chuẩn & thanh toán theo giai đoạn', p: 'Cọc 30 / giữa 40 / cuối 30 · điều khoản phạt·lỗi' },
      { cat: 'Lỗi · tranh chấp', h3: 'Yêu cầu sửa lỗi & xử lý tranh chấp', p: 'Thời hạn bảo hành · hòa giải miễn phí của KCA / hội đồng tranh chấp xây dựng' },
    ],
    offH: 'Nguồn chính thức · hòa giải tranh chấp', offDesc: 'Hợp đồng chuẩn, kênh nộp tranh chấp và tra công ty đã đăng ký.',
    src: [
      { icon: '📋', h4: 'Hợp đồng chuẩn FTC', p: 'Thi công nội thất & cửa' },
      { icon: '🛡', h4: 'Cơ quan Người tiêu dùng Hàn Quốc (1372)', p: 'Tư vấn tranh chấp nội thất miễn phí' },
      { icon: '⚖', h4: 'Ủy ban Hòa giải Tranh chấp Xây dựng', p: 'Hòa giải lỗi & thanh toán' },
      { icon: '🔍', h4: 'KISCON', p: 'Tra công ty xây dựng đã đăng ký' },
      { icon: '⚖', h4: 'Luật Cơ bản về Ngành Xây dựng', p: 'Thời hạn bảo hành lỗi theo luật' },
      { icon: '🏛', h4: 'Bộ Đất đai (MOLIT)', p: 'Tiêu chuẩn đăng ký ngành nội thất' },
    ],
    schH: 'Lịch thi công nội thất chuẩn (tham khảo)', schSub: 'Tính theo ngày giao nhà D-30',
    sched: [
      ['D-45 – D-30', 'Ý tưởng & ngân sách', 'Thu 50 ảnh'],
      ['D-30 – D-15', 'Báo giá tại nhà 3–5 công ty', 'Cách so báo giá'],
      ['D-15 – D-7', 'Ký hợp đồng chuẩn, đặt cọc', 'Tiêu chí chọn'],
      ['D-day – +21 ngày', 'Phá dỡ → mộc → dán giấy·sơn → hoàn thiện', 'Danh sách hợp đồng'],
      ['Hoàn công +14 ngày', 'Kiểm tra lỗi → thanh toán cuối', 'Ghi ảnh·video'],
    ],
    disclaimerT: 'Miễn trừ', disclaimerB: 'Hướng dẫn này chỉ là thông tin chung. Đơn giá vật liệu·nhân công chênh lệch nhiều theo thời điểm, khu vực và công ty; hãy dựa vào báo giá tại chỗ và hợp đồng chuẩn cho hợp đồng cuối cùng.',
  },
  th: {
    title: 'คู่มือรีโนเวตภายใน', desc: 'รีโนเวตภายในบ้านเกาหลีสำหรับชาวต่างชาติ — พื้น วอลเปเปอร์ กระเบื้อง ห้องน้ำ ครัว และหน้าต่าง พร้อมวิธีเลือกผู้รับเหมา เทียบราคา เซ็นสัญญามาตรฐาน และจัดการข้อบกพร่อง',
    eyebrow: 'คู่มือภายใน', h1: 'รีโนเวตภายใน ทีละหัวข้อ',
    lead: 'ภาพรวมเข้าใจง่ายของวัสดุตกแต่ง — <strong>พื้น วอลเปเปอร์ กระเบื้อง ห้องน้ำ ครัว หน้าต่าง</strong> — พร้อม<strong>คู่มือเลือกผู้รับเหมา</strong> ครอบคลุมประเภทบริษัท ใบเสนอราคา สัญญา และการซ่อมข้อบกพร่อง เขียนเป็นเกณฑ์ใช้งานจริงเพื่อให้คุณเลือกและตรวจใบเสนอราคาเอง ไม่ใช่โฆษณา',
    asof: 'ณ 2026.05', priceNote: 'ราคาเป็นค่าอ้างอิงตามธรรมเนียมตลาด',
    xlateNote: 'หน้ารายละเอียดวัสดุและบทความที่ลิงก์เป็นภาษาเกาหลี ฟังก์ชันแปลของเบราว์เซอร์ (เช่น Chrome) อ่านได้ดี ราคาเป็นวอนและอิงธรรมเนียมตลาดเกาหลี',
    tocH: 'คู่มือนี้ครอบคลุม', toc: ['① วัสดุ & งานตกแต่ง', '② การเลือกผู้รับเหมา', 'แหล่งข้อมูลทางการ · การไกล่เกลี่ยข้อพิพาท', 'ตารางงานมาตรฐาน'],
    matTag: '01', matH: 'วัสดุ & งานตกแต่ง', matDesc: 'เปรียบเทียบวัสดุตกแต่งที่มองเห็น — พื้น ผนัง กระเบื้อง ห้องน้ำ ครัว หน้าต่าง — และวัสดุที่สำคัญด้านสมรรถนะ แต่ละการ์ดแสดงชนิดหลัก ข้อดี และพื้นที่ที่เหมาะ ก่อนเข้าคู่มือละเอียดที่ต่อไปถึงการเลือก ใบเสนอราคา การติดตั้ง และการดูแล',
    costTitle: 'ค่ารีโนเวต · งบตามขนาด', costDesc: 'ก่อนเลือกวัสดุแต่ละอย่าง ดูภาพรวมงบก่อน: สัดส่วนค่าใช้จ่ายตามขนาด/งาน เทิร์นคีย์ vs กึ่งทำเอง vs ทำเอง และค่าใช้จ่ายเพิ่มที่ใบเสนอราคามักตกหล่น',
    costFactK1: 'หัวใจ', costFactV1: 'ครัว ห้องน้ำ และหน้าต่างกินงบเกินครึ่ง', costFactK2: 'ระวัง', costFactV2: 'VAT รื้อถอน และเปลี่ยนงานระบบเก่ามักตกหล่น', costLink: 'ดูคู่มือค่าใช้จ่าย →',
    proK: 'ข้อดี', recK: 'เหมาะกับ', matLink: 'คู่มือ →',
    mat: {
      flooring: { h3: 'พื้น', desc: 'เทียบพื้นไม้เอนจิเนียร์ (กังมารู) ลามิเนต ไม้จริง LVT และแผ่นไวนิล ตามราคา ความทน เสียง และการนำความร้อน', pro: 'สมดุลการนำความร้อนออนดลกับความทน', rec: 'ห้องนั่งเล่น ห้องนอน พื้นที่อยู่อาศัย' },
      wallpaper: { h3: 'วอลเปเปอร์ & งานผนัง', desc: 'วอลเปเปอร์ผ้าไหม·กระดาษ·ภาพผนัง เทียบกับสีน้ำ ลำดับติดตั้ง และการแก้หลุดล่อน·เชื้อรา', pro: 'เปลี่ยนพื้นที่มากที่สุด', rec: 'ผนัง·เพดานทั้งหมด ผนังจุดเด่น' },
      tile: { h3: 'กระเบื้อง', desc: 'แยกพอร์ซเลน·เซรามิก·ขัดเงา เลือกขนาด ปูแบบแห้ง vs กาว และดูแลยาแนว·ซิลิโคน', pro: 'กึ่งถาวร ทนน้ำทนคราบ', rec: 'ห้องน้ำ ครัว ทางเข้า ระเบียง' },
      bathroom: { h3: 'ห้องน้ำ', desc: 'ลำดับงานเน้นกันซึม·ความลาด·ระบายอากาศ การเลือกสุขภัณฑ์·ก๊อก และป้องกันรั่วซึม·เชื้อรา', pro: 'งานกันซึมที่มองไม่เห็นสำคัญสุด', rec: 'รีโนเวตห้องน้ำทั้งหมด' },
      kitchen: { h3: 'ครัว', desc: 'วัสดุบานตู้ (LPM·PET·พ่นสี) และเคาน์เตอร์ (หินสังเคราะห์ ฯลฯ) พร้อมเงื่อนไขไฟฟ้า·ประปาแบบบิลต์อิน', pro: 'เลือกตามการใช้งานประจำวันและความทน', rec: 'เปลี่ยนตู้ครัว / รีโนเวต' },
      windows: { h3: 'หน้าต่าง & ประตู', desc: 'หน้าต่างระบบ vs สองชั้น ระดับฉนวน/กันอากาศ (ค่า U) โครงสร้างกระจก และแก้หยดน้ำ·เสียง', pro: 'กำหนดค่าไฟทำความร้อน/เย็นและหยดน้ำ', rec: 'หน้าต่างระเบียง/ภายนอก เปลี่ยนประตูห้อง' },
    },
    brandNote: '※ คู่มือแสงสว่าง (อุณหภูมิสี ค่าความถูกต้องของสี การจัดวางดาวน์ไลท์ และการแบ่งวงจร) เผยแพร่เป็นภาษาเกาหลีที่ /interior/lighting.html — ใช้การแปลของเบราว์เซอร์อ่านได้ดี',
    coTag: '02', coH: 'การเลือกผู้รับเหมา', coDesc: 'ตั้งแต่เริ่มหาผู้รับเหมาจนถึงปรึกษา·ใบเสนอราคา·สัญญา·ก่อสร้าง·ซ่อมข้อบกพร่อง ตามลำดับที่ผู้บริโภคควรตรวจ แต่ละขั้นลิงก์ไปบทความละเอียด (ภาษาเกาหลี)',
    steps: [
      ['1. เข้าใจประเภทบริษัท', 'รวม / เฉพาะทาง / ตรง / แพลตฟอร์ม — ขอบเขตความรับผิดชอบและการจดทะเบียนธุรกิจก่อสร้าง'],
      ['2. วิธีหาบริษัท', 'ตรวจผลงาน·พอร์ตโฟลิโอ ค้นบริษัทที่ขึ้นทะเบียน KISCON'],
      ['3. เตรียมก่อนปรึกษา', 'จัดขอบเขต งบ รสนิยมวัสดุ พร้อมรูปถ่าย'],
      ['4. เทียบใบเสนอราคา', 'แยกวัสดุ / สเปก / จำนวน / ราคาต่อหน่วย เทียบ 3–5 บริษัทเงื่อนไขเดียวกัน'],
      ['5. ตรวจสัญญา', 'สัญญามาตรฐาน จ่ายเป็นงวด (มัดจำ/ระหว่าง/สุดท้าย) ข้อกำหนดค่าปรับล่าช้า'],
      ['6. กันข้อพิพาทค่าเพิ่ม', 'ระบุในสัญญาว่า งานเพิ่มเรียกเก็บไม่ได้หากไม่ยินยอมเป็นลายลักษณ์อักษร'],
      ['7. ตรวจระหว่างก่อสร้าง', 'ถ่าย/บันทึกงานที่จะถูกปิดทับ — กันซึม ประปา ไฟฟ้า'],
      ['8. ซ่อมข้อบกพร่อง·ดูแลหลังงาน', 'ใช้ระยะประกันแต่ละงาน (ติดวอลเปเปอร์ 1 ปี พื้น/กระเบื้อง 2 ปี กันซึม 3 ปี)'],
    ],
    relTag: 'ที่เกี่ยวข้อง (ภาษาเกาหลี)',
    rel: [
      { cat: 'ประเภท·การหา', h3: '8 วิธีเลือกบริษัทตกแต่งภายใน', p: 'จดทะเบียนธุรกิจ ผลงาน ประกันข้อบกพร่อง ใช้สัญญามาตรฐาน' },
      { cat: 'เทียบใบเสนอราคา', h3: 'เทียบใบเสนอราคาอย่างถูกวิธี', p: 'แยกวัสดุ / สเปก / จำนวน / ราคาต่อหน่วย · ขั้นตอนยินยอมงานเพิ่ม' },
      { cat: 'ตรวจสัญญา', h3: 'สัญญามาตรฐาน & จ่ายเป็นงวด', p: 'มัดจำ 30 / ระหว่าง 40 / สุดท้าย 30 · ค่าปรับ·ข้อบกพร่อง' },
      { cat: 'ข้อบกพร่อง·ข้อพิพาท', h3: 'เรียกร้องซ่อม & จัดการข้อพิพาท', p: 'ระยะประกัน · ไกล่เกลี่ยฟรีโดย KCA / คณะกรรมการข้อพิพาทก่อสร้าง' },
    ],
    offH: 'แหล่งข้อมูลทางการ · การไกล่เกลี่ยข้อพิพาท', offDesc: 'สัญญามาตรฐาน ช่องทางยื่นข้อพิพาท และค้นบริษัทที่ขึ้นทะเบียน',
    src: [
      { icon: '📋', h4: 'สัญญามาตรฐาน FTC', p: 'งานตกแต่งภายใน & หน้าต่าง' },
      { icon: '🛡', h4: 'สำนักงานผู้บริโภคเกาหลี (1372)', p: 'ปรึกษาข้อพิพาทตกแต่งฟรี' },
      { icon: '⚖', h4: 'คณะกรรมการไกล่เกลี่ยข้อพิพาทก่อสร้าง', p: 'ไกล่เกลี่ยข้อบกพร่อง·ค่าจ้าง' },
      { icon: '🔍', h4: 'KISCON', p: 'ค้นบริษัทก่อสร้างที่ขึ้นทะเบียน' },
      { icon: '⚖', h4: 'พ.ร.บ.พื้นฐานอุตสาหกรรมก่อสร้าง', p: 'ระยะประกันข้อบกพร่องตามกฎหมาย' },
      { icon: '🏛', h4: 'กระทรวงที่ดิน (MOLIT)', p: 'เกณฑ์จดทะเบียนธุรกิจตกแต่งภายใน' },
    ],
    schH: 'ตารางงานตกแต่งมาตรฐาน (อ้างอิง)', schSub: 'อิงวันโอน D-30',
    sched: [
      ['D-45 – D-30', 'คอนเซปต์·งบ', 'รวบรวมรูป 50 รูป'],
      ['D-30 – D-15', 'ให้ 3–5 บริษัทมาประเมิน', 'วิธีเทียบราคา'],
      ['D-15 – D-7', 'เซ็นสัญญามาตรฐาน·วางมัดจำ', 'เกณฑ์เลือกบริษัท'],
      ['D-day – +21 วัน', 'รื้อ → งานไม้ → วอลเปเปอร์·ทาสี → เก็บงาน', 'เช็กสัญญา'],
      ['เสร็จงาน +14 วัน', 'ตรวจข้อบกพร่อง → จ่ายงวดสุดท้าย', 'บันทึกรูป·วิดีโอ'],
    ],
    disclaimerT: 'ข้อจำกัดความรับผิด', disclaimerB: 'คู่มือนี้เป็นข้อมูลทั่วไปเท่านั้น ราคาวัสดุ·ค่าแรงต่างกันมากตามเวลา พื้นที่ และบริษัท โปรดอิงใบเสนอราคาหน้างานและสัญญามาตรฐานสำหรับสัญญาสุดท้าย',
  },
};

// English has complete translated detail pages. Other localized hubs continue
// to point to Korean source pages until their detail translations are ready.
const DEEP = (f, lang) => lang === 'en' ? `./${f}` : `../../interior/${f}`;
const POST = (f, lang) => lang === 'en' ? `../posts/${f}` : `../../posts/${f}`;
const CHK = (f) => `../../checklists/${f}`;
const IMG = (p) => `../../assets/images/interior/${p}`;
const PLACEHOLDER = '../../assets/images/interior/_placeholder.svg';
const imgTag = (src, alt) => `<img src="${IMG(src)}" alt="${alt}" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}';" />`;

// 관련 글/타임라인 도구 링크(한국어 페이지) — 카드 순서와 매칭
const REL_HREF = ['posts/interior-company.html', 'posts/interior-quote.html', 'posts/interior-contract.html', 'posts/interior-defect.html'];
const STEP_TOOL = ['coRel0', 'coRel0', 'costShort', 'coRel1', 'coRel2', 'chk', 'bath', 'coRel3'];

function head(lang, t) {
  const alts = ['ko', 'en', 'zh-Hans', 'zh-Hant', 'vi', 'th'].map((l) => {
    const href = l === 'ko' ? 'https://topda.kr/interior/index.html' : `https://topda.kr/${l}/interior/index.html`;
    return `<link rel="alternate" hreflang="${l}" href="${href}" />`;
  }).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="https://topda.kr/interior/index.html" />`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6725359021570843" crossorigin="anonymous"></script>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<!-- i18n:review lang=${lang} — ${REVIEW[lang]} -->
<title>${t.title} — TOPDA</title>
<meta name="description" content="${t.desc}" />
<link rel="icon" href="https://topda.kr/assets/images/brand/logo.png" type="image/png" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
<link rel="canonical" href="https://topda.kr/${lang}/interior/index.html" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TOPDA" />
<meta property="og:title" content="${t.title} — TOPDA" />
<meta property="og:description" content="${t.desc}" />
<meta property="og:url" content="https://topda.kr/${lang}/interior/index.html" />
<meta property="og:image" content="https://topda.kr/assets/images/brand/logo.png" />
<meta property="og:locale" content="${OG[lang]}" />
<meta name="twitter:card" content="summary_large_image" />
${alts}
<script defer src="https://topda.kr/assets/analytics.js?v=3e86e8b800"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css" />
<link rel="stylesheet" href="../../assets/styles.css?v=b54e7c9b22" />
</head>
<body>`;
}

function header(c) {
  return `<header class="site-header">
  <div class="container row">
    <a href="../index.html" class="brand"><span class="brand-mark"></span>TOPDA</a>
    <nav class="nav">
      <a href="../guides.html" data-nav class="active">${c.guides}</a>
      <a href="../calculators/index.html" data-nav>${c.calc}</a>
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
    <a href="../../about.html">${c.about}</a>
    <a href="../../index.html">${c.korean}</a>
  </div>
</header>`;
}

function footer(c) {
  return `<footer class="site-footer">
  <div class="container">
    <div class="row">
      <div><div class="brand"><span class="brand-mark"></span>TOPDA</div><p>${c.tagline}</p></div>
      <div><h4>${c.exploreH}</h4><ul><li><a href="../index.html#categories">${c.cats}</a></li><li><a href="../calculators/index.html">${c.calc}</a></li><li><a href="../../checklists/index.html">${c.checklists}</a></li></ul></div>
      <div><h4>${c.siteH}</h4><ul><li><a href="../../about.html">${c.principlesL}</a></li><li><a href="../../about.html#disclaimer">${c.disclaimerL}</a></li></ul></div>
    </div>
    <p class="disclaimer">&copy; TOPDA.</p>
  </div>
</footer>`;
}

function matCard(lang, t, key) {
  const m = t.mat[key];
  return `      <a class="mat-card" href="${DEEP(key + '.html', lang)}">
        <div class="mat-card-media">${imgTag(MAT_IMG[key], m.h3)}</div>
        <div class="mat-card-body">
          <h3>${m.h3}</h3>
          <p class="mat-card-desc">${m.desc}</p>
          <div class="mat-card-facts">
            <div class="mat-card-fact"><span class="f-k">${t.proK}</span><span class="f-v">${m.pro}</span></div>
            <div class="mat-card-fact"><span class="f-k">${t.recK}</span><span class="f-v">${m.rec}</span></div>
          </div>
          <span class="mat-card-link">${m.h3} ${t.matLink}</span>
        </div>
      </a>`;
}

function stepTool(lang, t, i) {
  // 타임라인 각 단계의 도구 링크 라벨 — 관련 글/체크리스트/비용/욕실
  const rel = t.rel;
  const map = {
    coRel0: { label: rel[0].h3, href: POST('interior-company.html', lang) },
    coRel1: { label: rel[1].h3, href: POST('interior-quote.html', lang) },
    coRel2: { label: rel[2].h3, href: POST('interior-contract.html', lang) },
    coRel3: { label: rel[3].h3, href: POST('interior-defect.html', lang) },
    costShort: { label: t.costTitle, href: DEEP('cost.html', lang) },
    chk: { label: t.relTag, href: lang === 'en' ? '../checklists/interior-contract.html' : CHK('interior-contract.html') },
    bath: { label: t.mat.bathroom.h3, href: DEEP('bathroom.html', lang) },
  };
  const e = map[STEP_TOOL[i]];
  return `<a href="${e.href}">${e.label}</a>`;
}

function page(lang) {
  const t = T[lang];
  const c = CHROME[lang];
  const toc = t.toc.map((x, i) => `      <li><a href="#${['materials', 'company', 'official', 'schedule'][i]}">${x}</a></li>`).join('\n');
  const mats = MAT_KEYS.map((k) => matCard(lang, t, k)).join('\n');
  const steps = t.steps.map((s, i) => `      <li><span class="t-when">${s[0]}</span><span class="t-what">${s[1]}</span><span class="t-tool">${stepTool(lang, t, i)}</span></li>`).join('\n');
  const rels = t.rel.map((r, i) => `      <a class="g-related-card" href="${POST(REL_HREF[i].split('/')[1], lang)}">
        <span class="r-cat">${r.cat}</span>
        <h3>${r.h3}</h3>
        <p>${r.p}</p>
      </a>`).join('\n');
  const SRC_HREF = [
    'https://www.ftc.go.kr/www/contents.do?key=141', 'https://www.kca.go.kr', 'https://adr.cak.or.kr',
    'https://www.kiscon.net', 'https://www.law.go.kr/lsSc.do?menuId=1&subMenuId=15&tabMenuId=81&query=건설산업기본법', 'https://www.molit.go.kr',
  ];
  const srcs = t.src.map((s, i) => `      <a href="${SRC_HREF[i]}" target="_blank" rel="noopener" class="source-card">
        <span class="source-icon">${s.icon}</span>
        <div><h4>${s.h4}</h4><p>${s.p}</p></div>
      </a>`).join('\n');
  const sched = t.sched.map((s) => `      <li><span class="t-when">${s[0]}</span><span class="t-what">${s[1]}</span><span class="t-tool">${s[2]}</span></li>`).join('\n');

  return `${head(lang, t)}

${header(c)}

<main class="container-narrow">
  <div class="article-header" style="border-bottom:0; padding-bottom:8px;">
    <div class="breadcrumb"><a href="../index.html">${c.home}</a> / <a href="../guides.html">${c.guides}</a> / ${t.eyebrow}</div>
  </div>

  <section class="g-hero">
    <div class="g-hero-media">${imgTag('hero/interior-guide.webp', t.h1)}</div>
    <span class="g-eyebrow">${t.eyebrow}</span>
    <h1>${t.h1}</h1>
    <p class="g-lead">${t.lead}</p>
    <div class="g-meta"><span>${t.asof}</span><span class="dot">·</span><span>${t.priceNote}</span></div>
  </section>

  <div class="callout callout-info" style="margin-top:4px;">
    <div class="icon">i</div>
    <div class="body">${t.xlateNote}</div>
  </div>

  <nav class="g-toc" aria-label="${t.tocH}" data-collapsed="false">
    <div class="g-toc-head"><h2>${t.tocH}</h2></div>
    <ol class="g-toc-list">
${toc}
    </ol>
  </nav>

  <section class="g-area" id="materials">
    <div class="g-area-head"><span class="g-area-tag">${t.matTag}</span><h2>${t.matH}</h2></div>
    <p class="g-area-desc">${t.matDesc}</p>

    <a class="mat-card mat-card--wide" href="${DEEP('cost.html', lang)}">
      <div class="mat-card-media">${imgTag('hero/cost.webp', t.costTitle)}</div>
      <div class="mat-card-body">
        <h3>${t.costTitle}</h3>
        <p class="mat-card-desc">${t.costDesc}</p>
        <div class="mat-card-facts">
          <div class="mat-card-fact"><span class="f-k">${t.costFactK1}</span><span class="f-v">${t.costFactV1}</span></div>
          <div class="mat-card-fact"><span class="f-k">${t.costFactK2}</span><span class="f-v">${t.costFactV2}</span></div>
        </div>
        <span class="mat-card-link">${t.costLink}</span>
      </div>
    </a>

    <div class="mat-grid">
${mats}
    </div>
    <p class="brand-note">${t.brandNote}</p>
  </section>

  <section class="g-area" id="company">
    <div class="g-area-head"><span class="g-area-tag">${t.coTag}</span><h2>${t.coH}</h2></div>
    <p class="g-area-desc">${t.coDesc}</p>
    <ol class="timeline" style="margin-top:8px;">
${steps}
    </ol>
    <div class="g-related-grid" style="margin-top:20px;">
${rels}
    </div>
  </section>

  <section class="g-area" id="official">
    <div class="g-area-head"><h2>${t.offH}</h2></div>
    <p class="g-area-desc">${t.offDesc}</p>
    <div class="source-grid">
${srcs}
    </div>
  </section>

  <section class="g-area" id="schedule">
    <div class="g-area-head"><h2>${t.schH}</h2><span class="strip-sub">${t.schSub}</span></div>
    <ol class="timeline">
${sched}
    </ol>
  </section>

  <div class="callout callout-warn" style="margin-top: 32px;">
    <div class="icon">⚠</div>
    <div class="body"><strong>${t.disclaimerT}</strong> ${t.disclaimerB}</div>
  </div>
</main>

${footer(c)}

<script src="../../assets/app.js?v=a6d9173f4d"></script>
</body>
</html>
`;
}

for (const lang of LANGS) {
  mkdirSync(join(SITE, lang, 'interior'), { recursive: true });
  const p = join(SITE, lang, 'interior', 'index.html');
  writeFileSync(p, page(lang));
  console.log('generated', p.replace(SITE + '/', ''));
}
