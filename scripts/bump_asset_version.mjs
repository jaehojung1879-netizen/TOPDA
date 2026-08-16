/*
 * 정적 자산 캐시 버전 자동 갱신
 * -----------------------------------------------------------------------
 * 왜 필요한가 (2026-08-02 사고)
 *
 * 계산기 페이지들은 app.js·rates.js·styles.css 를 `?v=20260730` 같은 날짜 문자열로
 * 캐시 버스팅한다. 그런데 이 문자열은 사람이 손으로 고치게 돼 있었고, 실제로는
 * 아무도 고치지 않았다. 그 결과:
 *
 *   HTML 은 새로 배포됐는데 app.js 는 예전 것이 캐시에서 그대로 쓰였다.
 *   → 새 입력칸(KB시세)은 화면에 보이는데 그 값을 읽는 코드가 없어서
 *     대출 한도가 예전 값(4억)으로 계속 나왔다. 사용자가 직접 발견했다.
 *
 * 이 스크립트는 각 자산의 **내용 해시**를 버전으로 박는다. 내용이 바뀌면 URL 이
 * 바뀌고, 안 바뀌면 그대로라 불필요한 재다운로드도 없다. 손으로 날짜를 고칠 일이
 * 없어지므로 같은 사고가 다시 나지 않는다.
 *
 * 실행:
 *   node scripts/bump_asset_version.mjs           # 적용
 *   node scripts/bump_asset_version.mjs --check   # 어긋난 파일이 있으면 exit 1 (CI용)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

// 버전을 붙일 자산 — 계산 결과에 영향을 주는 것들.
const ASSETS = [
  'app.js', 'rates.js', 'styles.css', 'official_price.js', 'calculator_sources.js', 'analytics.js',
];

function hashOf(name) {
  const p = path.join(ROOT, 'site', 'assets', name);
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 10);
}

const versions = {};
for (const a of ASSETS) {
  const h = hashOf(a);
  if (h) versions[a] = h;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // 단지 페이지(site/apt)는 커밋하지 않고 배포 때마다 생성되므로 건너뛴다.
      if (e.name === 'apt' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walk(p, out);
    } else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

// 생성기 템플릿도 함께 고친다 — 안 그러면 다음 생성 때 옛 버전이 되살아난다.
const GENERATORS = fs.readdirSync(path.join(ROOT, 'scripts'))
  .filter((f) => f.startsWith('gen_') && f.endsWith('.mjs'))
  .map((f) => path.join(ROOT, 'scripts', f))
  .concat(
    fs.existsSync(path.join(ROOT, '_meta'))
      ? fs.readdirSync(path.join(ROOT, '_meta'))
        .filter((f) => f.endsWith('.py'))
        .map((f) => path.join(ROOT, '_meta', f))
      : [],
  );

const targets = walk(path.join(ROOT, 'site')).concat(GENERATORS);

let changed = 0;
const stale = [];
for (const file of targets) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const [name, hash] of Object.entries(versions)) {
    // assets/app.js?v=... → assets/app.js?v=<hash>  (경로 접두사는 파일마다 다르므로 느슨하게)
    const re = new RegExp(`(assets/${name.replace('.', '\\.')})\\?v=[A-Za-z0-9._-]+`, 'g');
    after = after.replace(re, `$1?v=${hash}`);
  }
  if (after !== before) {
    stale.push(path.relative(ROOT, file));
    if (!CHECK) fs.writeFileSync(file, after);
    changed += 1;
  }
}

if (CHECK) {
  if (changed) {
    console.error(`\n캐시 버전이 자산 내용과 어긋난 파일 ${changed}개:`);
    stale.slice(0, 20).forEach((f) => console.error('  · ' + f));
    if (stale.length > 20) console.error(`  … 외 ${stale.length - 20}개`);
    console.error('\n`node scripts/bump_asset_version.mjs` 를 실행해 갱신하세요.');
    console.error('(고치지 않으면 방문자 브라우저가 예전 JS를 계속 씁니다 — 새 HTML + 옛 로직 = 잘못된 계산)\n');
    process.exit(1);
  }
  console.log('캐시 버전이 모두 최신입니다.');
} else {
  console.log('자산 해시:');
  for (const [k, v] of Object.entries(versions)) console.log(`  ${k} → ${v}`);
  console.log(`\n${changed}개 파일의 ?v= 를 갱신했습니다.`);
}
