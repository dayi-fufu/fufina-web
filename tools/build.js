/**
 * build.js — 网页版构建脚本
 *
 * 功能：
 *   1. （--fetch 时）从 cnb.cool 仓库拉取剧情引用的全部资源到 web/assets/
 *   2. 把原小程序 data/story.js、data/encyclopedia.js 中的远程资源 URL
 *      改写成本地相对路径（assets/...），解决 cnb.cool 响应头
 *      cross-origin-resource-policy: same-origin 导致的浏览器跨源拦截问题
 *   3. 重新生成 css/style.css（rpx -> calc(var(--rpx)*N)）
 *
 * 用法（在 web/ 目录下）：
 *   node tools/build.js          仅重新生成（使用已有 assets 与清单）
 *   node tools/build.js --fetch  先从仓库同步资源，再重新生成
 *
 * 原小程序文件夹只读，不会被修改。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WEB_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.resolve(WEB_DIR, '..');
const ASSETS_DIR = path.join(WEB_DIR, 'assets');
const MANIFEST_PATH = path.join(__dirname, 'asset-manifest.json');

const GALA_REPO = 'https://cnb.cool/cnbgalagame/gala.git';
const GALA_RAW = 'https://cnb.cool/cnbgalagame/gala/-/git/raw/main/';

/* 特殊映射：原数据引用了另一个仓库（MainR256/Gresource）的资源 */
const SPECIAL_MAP = [
  {
    match: /yiyi_upscayl_4x_realesrgan-x4plus\.webp/,
    target: 'assets/galagame/物品/开审.webp' // 异议特效图用本仓库同风格图替代
  },
  {
    match: /\/audio\/se\/ogg\/yjyl\.ogg/,
    target: '' // 异议音效在本仓库不存在，置空静默跳过
  }
];

/* 仓库中确认不存在的文件（保持原路径但不尝试下载） */
const KNOWN_MISSING = new Set([
  'galagame/德波尔/芙宁娜，你自称水神。欺骗了我们五百年！你扮演着高高在上的神明，却对脚下的苦难视而不见。.mp3'
]);

/* URL 提取正则：URL 中不会出现空白和双引号（撇号可能出现，如 d'eau） */
const URL_RE = /https:\/\/cnb\.cool\/[^\s"]+/g;

/* ---------- 文件路径归一化（用于模糊匹配改名的文件） ---------- */
function normPath(p) {
  return p.split('/').map(seg => {
    let s = seg;
    // 去掉字面 \n、真实换行、反斜杠
    s = s.replace(/\\n/g, '').replace(/\n/g, '').replace(/\\/g, '');
    // 先去掉扩展名前的空格，再合并连续点号
    s = s.trim();
    s = s.replace(/\s+\.(\w+)$/, '.$1');
    s = s.replace(/\.{3,}/g, '...');
    return s;
  }).join('/');
}

/* ---------- URL 解析 ---------- */
function resolveGalaUrl(url, manifest, manifestNorm) {
  // 返回该 URL 应指向的本地相对路径
  if (url.includes('MainR256')) {
    for (const sp of SPECIAL_MAP) {
      if (sp.match.test(url)) return sp.target;
    }
    return null; // 其它（如 BASE 常量、注释里的 URL）不改
  }
  const m = url.match(/^https:\/\/cnb\.cool\/cnbgalagame\/gala\/-\/git\/raw\/main\/(.+)$/);
  if (!m) return null; // 外部图源（百度/米游社/B站等）保持远程
  let p;
  try { p = decodeURIComponent(m[1]); } catch (e) { p = m[1]; }
  if (manifest.has(p)) return 'assets/' + encodeURI(p);
  const hit = manifestNorm.get(normPath(p));
  if (hit) return 'assets/' + encodeURI(hit);
  // 仓库中确实不存在的文件：仍指向本地路径，运行时静默失败（与原版远程 404 行为一致）
  if (!KNOWN_MISSING.has(p)) {
    console.warn('[构建] 仓库中未找到（保持原路径，运行时会静默跳过）:', p);
  }
  return 'assets/' + encodeURI(p);
}

/* ---------- 数据改写 ---------- */
function rewriteData(text, manifest, manifestNorm) {
  const urls = [...new Set([...text.matchAll(URL_RE)].map(m => m[0]))];
  let out = text;
  let changed = 0;
  for (const u of urls) {
    const rep = resolveGalaUrl(u, manifest, manifestNorm);
    if (rep === null) continue;
    out = out.split(u).join(rep);
    changed++;
  }
  console.log('[构建] 数据文件改写远程 URL', changed, '个');
  return out;
}

/* ---------- CSS 生成 ---------- */
function convertWxss(text) {
  let css = text;
  css = css.replace(/([0-9]*\.?[0-9]+)rpx/g, 'calc(var(--rpx)*$1)');
  css = css.replace(/^page\s*\{/gm, 'html, body {');
  return css;
}

function buildCss() {
  const wxss = fs.readFileSync(path.join(SRC_DIR, 'pages/index/index.wxss'), 'utf8');
  const appWxss = fs.readFileSync(path.join(SRC_DIR, 'app.wxss'), 'utf8');

  const webOverrides = `
/* ==================== 网页版适配（自动追加） ==================== */
:root {
  --rpx: calc(100vw / 750); /* 1rpx 在网页中的等价长度 */
}
html, body {
  margin: 0;
  padding: 0;
}
.hidden { display: none !important; }
button { font-family: inherit; cursor: pointer; }

/* 对话/历史文本保留 \\n 换行（README 中说明 text 支持 \\n 换行） */
.content { white-space: pre-wrap; }
.history-content { white-space: pre-wrap; }
.ency-list-item .list-item-name { white-space: pre-wrap; }

/* 小程序 scroll-view -> 网页滚动容器 */
.ency-list-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}
.detail-content { overflow-y: auto; }

/* 异议图片按 WXML 内联样式设置 */
.objection-img { width: 95vw; height: 90vh; object-fit: contain; }

/* 图鉴列表为空时占满宽度 */
.ency-list-wrapper.empty { display: block; }

/* 提示浮层 */
.toast {
  position: fixed;
  top: 12%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  padding: calc(var(--rpx)*10) calc(var(--rpx)*18);
  border-radius: calc(var(--rpx)*8);
  font-size: calc(var(--rpx)*14);
  z-index: 9999;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
  max-width: 80%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border: calc(var(--rpx)*0.5) solid rgba(118, 217, 242, 0.42);
}
.toast.show { opacity: 1; }
`;

  const out = [
    '/* 本文件由 tools/build.js 从原小程序 wxss 自动生成，请勿手改（网页版覆盖样式在末尾） */',
    convertWxss(appWxss),
    convertWxss(wxss),
    webOverrides
  ].join('\n');

  fs.writeFileSync(path.join(WEB_DIR, 'css/style.css'), out);
  console.log('[构建] 已生成 css/style.css');
}

/* ---------- 资源同步（--fetch） ---------- */
function fetchRemoteManifest() {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gala-tree-'));
  console.log('[同步] 拉取仓库文件清单（仅目录树，不下载文件）...');
  execSync(`git clone --depth 1 --filter=blob:none --no-checkout --quiet ${JSON.stringify(GALA_REPO)} ${JSON.stringify(tmp)}`, { stdio: 'inherit' });
  const list = execSync('git -c core.quotepath=false ls-tree -r -z --name-only HEAD', { cwd: tmp, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean);
  fs.rmSync(tmp, { recursive: true, force: true });
  return list;
}

async function downloadWithRetry(url, dest, tries = 6) {
  const delays = [2000, 4000, 8000, 12000, 16000];
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      return;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise(r => setTimeout(r, delays[Math.min(i, delays.length - 1)]));
    }
  }
}

async function syncAssets() {
  const manifest = fetchRemoteManifest();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 0));
  console.log('[同步] 清单已保存（' + manifest.length + ' 个文件）');

  const manifestSet = new Set(manifest);
  const manifestNorm = new Map(manifest.map(f => [normPath(f), f]));

  // 汇总数据文件中所有需要本地化的资源
  const needed = new Map(); // 实际仓库路径 -> 下载 URL
  const texts = [
    fs.readFileSync(path.join(SRC_DIR, 'data/story.js'), 'utf8'),
    fs.readFileSync(path.join(SRC_DIR, 'data/encyclopedia.js'), 'utf8')
  ];
  for (const text of texts) {
    const urls = [...new Set([...text.matchAll(URL_RE)].map(m => m[0]))];
    for (const u of urls) {
      const rep = resolveGalaUrl(u, manifestSet, manifestNorm);
      if (rep === null || rep === '') continue;
      const rel = rep.replace(/^assets\//, '');
      const actualPath = decodeURIComponent(rel);
      if (!needed.has(actualPath)) needed.set(actualPath, GALA_RAW + encodeURI(actualPath));
    }
  }

  console.log('[同步] 需要下载 ' + needed.size + ' 个文件');
  const entries = [...needed.entries()];
  let done = 0;
  const CONCURRENCY = 8;
  const worker = async () => {
    while (entries.length) {
      const [p, url] = entries.shift();
      if (KNOWN_MISSING.has(p)) { done++; continue; }
      const dest = path.join(ASSETS_DIR, p);
      if (fs.existsSync(dest)) { done++; continue; }
      try {
        await downloadWithRetry(url, dest);
        done++;
        if (done % 20 === 0) console.log(`[同步] 进度 ${done}/${needed.size}`);
      } catch (e) {
        console.error('[同步] 下载失败:', p, e.message);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log('[同步] 资源同步完成，共', needed.size, '个文件');
}

/* ---------- 主流程 ---------- */
function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('未找到 tools/asset-manifest.json，请先运行：node tools/build.js --fetch');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const manifestSet = new Set(manifest);
  const manifestNorm = new Map(manifest.map(f => [normPath(f), f]));
  return { manifestSet, manifestNorm };
}

function buildData({ manifestSet, manifestNorm }) {
  // story.js
  let story = fs.readFileSync(path.join(SRC_DIR, 'data/story.js'), 'utf8');
  const idx = story.indexOf('module.exports');
  if (idx === -1) throw new Error('story.js 中未找到 module.exports');
  story = story.slice(0, idx) + 'window.STORY = ' + story.slice(idx + 'module.exports'.length).replace(/^[\s=]*/, '');
  story = rewriteData(story, manifestSet, manifestNorm);
  story = '/* 本文件由 tools/build.js 从原 data/story.js 自动生成，请勿手改 */\n(function () {\n' + story + '\n})();\n';
  fs.writeFileSync(path.join(WEB_DIR, 'js/data/story.js'), story);
  console.log('[构建] 已生成 js/data/story.js');

  // encyclopedia.js
  let ency = fs.readFileSync(path.join(SRC_DIR, 'data/encyclopedia.js'), 'utf8');
  ency = ency.replace('module.exports = encyclopedia;', 'window.ENCYCLOPEDIA = encyclopedia;');
  ency = rewriteData(ency, manifestSet, manifestNorm);
  ency = '/* 本文件由 tools/build.js 从原 data/encyclopedia.js 自动生成，请勿手改 */\n(function () {\n' + ency + '\n})();\n';
  fs.writeFileSync(path.join(WEB_DIR, 'js/data/encyclopedia.js'), ency);
  console.log('[构建] 已生成 js/data/encyclopedia.js');
}

(async () => {
  const fetchFlag = process.argv.includes('--fetch');
  if (fetchFlag) {
    await syncAssets();
  }
  const { manifestSet, manifestNorm } = loadManifest();
  buildData({ manifestSet, manifestNorm });
  buildCss();
  console.log('全部构建完成。');
})().catch(e => {
  console.error('构建失败:', e);
  process.exit(1);
});
