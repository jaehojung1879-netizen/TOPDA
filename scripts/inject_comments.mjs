import { readFileSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

const groups = [
  {
    directory: 'site/calculators',
    type: 'calculator',
    files: [
      'total-cost-dashboard.html',
      'acquisition-tax.html',
      'auction-bid.html',
      'balance-settlement.html',
      'brokerage-fee.html',
      'commercial-rent.html',
      'dsr.html',
      'housing-subscription.html',
      'interior-estimate.html',
      'jeonse-monthly.html',
      'jeonse-ratio.html',
      'loan-compare.html',
      'loan-limit.html',
      'market-trends.html',
      'registration-cost.html',
      'rti-calculator.html',
      'search.html',
      'transactions.html',
      'transfer-tax.html',
    ],
  },
  {
    directory: 'site/checklists',
    type: 'checklist',
    files: [
      'dday-scheduler.html',
      'interior-contract.html',
      'lease-contract.html',
      'moving-day.html',
      'sale-balance-day.html',
    ],
  },
  {
    directory: 'site/interior',
    type: 'interior',
    files: [
      'bathroom.html',
      'cost.html',
      'flooring.html',
      'kitchen.html',
      'tile.html',
      'wallpaper.html',
      'windows.html',
    ],
  },
  {
    directory: 'site/posts',
    type: 'guide',
    files: [
      'balance-day-settlement.html',
      'contract-viewer-lease.html',
      'dsr-explain.html',
      'funding-plan.html',
      'good-house-eye.html',
      'interior-company.html',
      'interior-contract.html',
      'interior-defect.html',
      'interior-quote.html',
      'jeonse-protection.html',
      'jeonse-scam.html',
      'lease-contract-tips.html',
      'lease-renewal.html',
      'lease-return.html',
      'loan-policy.html',
      'location-analysis.html',
      'ltv-explain.html',
      'market-cycle.html',
      'move-in-admin.html',
      'moving-company.html',
      'moving-day-tips.html',
      'moving-quote.html',
      'moving-types.html',
      'property-tour.html',
      'recent-jeonse-issues-2026.html',
      'recent-loan-issues-2026.html',
      'recent-sale-issues-2026.html',
      'reconstruction-invest.html',
      'registry-reading.html',
      'sale-contract-tips.html',
      'storage-moving.html',
      'stress-dsr.html',
      'tax-roadmap.html',
      'transfer-tax-guide.html',
    ],
  },
];

function decodeText(value) {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function escapeAttribute(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

let changed = 0;
for (const group of groups) {
  for (const filename of group.files) {
    const absolute = resolve(repoRoot, group.directory, filename);
    let html = readFileSync(absolute, 'utf8');
    if (html.includes('data-comments')) continue;

    const titleMatch = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
      || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (!titleMatch) throw new Error(`제목을 찾을 수 없습니다: ${relative(repoRoot, absolute)}`);

    const title = escapeAttribute(decodeText(titleMatch[1]));
    const slug = basename(filename, '.html');
    const page = '/' + relative(resolve(repoRoot, 'site'), absolute).replaceAll('\\', '/');
    const mount = [
      '',
      `<section class="content-comments" data-comments data-comment-type="page" data-comment-key="${group.type}:${slug}" data-comment-title="${title}" data-comment-page="${page}"></section>`,
      '<script src="../assets/supabase-client.js?v=20260728"></script>',
      '<script src="../assets/comments.js?v=20260728"></script>',
      '',
    ].join('\n');

    const footerIndex = html.indexOf('<footer');
    if (footerIndex < 0) throw new Error(`footer를 찾을 수 없습니다: ${relative(repoRoot, absolute)}`);
    html = html.slice(0, footerIndex) + mount + html.slice(footerIndex);
    writeFileSync(absolute, html, 'utf8');
    changed += 1;
  }
}

console.log(`댓글 컴포넌트 적용: ${changed}개 파일`);
