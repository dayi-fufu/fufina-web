// tools/smoke.js — 网页版冒烟测试（Node 环境，使用 DOM/音频桩）
// 用法：node tools/smoke.js
// 模拟浏览器加载全部脚本并走一遍核心游戏流程，检查运行时错误与关键状态。
'use strict';

/* ---------------- DOM / 浏览器环境桩 ---------------- */

function makeEl(id) {
  const el = {
    id,
    _children: [],
    className: '',
    innerHTML: '',
    textContent: '',
    style: {},
    dataset: {},
    scrollTop: 0,
    scrollHeight: 0,
    classList: {
      toggle() {},
      add() {},
      remove() {},
      contains() { return false; }
    },
    appendChild(c) { this._children.push(c); return c; },
    addEventListener() {},
    removeEventListener() {},
    removeAttribute(k) { delete this.dataset[k]; },
    setAttribute(k, v) { this.dataset[k] = v; },
    getAttribute(k) { return this.dataset[k]; },
    querySelector(sel) { return sel.includes('.active') ? null : makeEl('q:' + sel); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    scrollIntoView() {},
    load() {},
    pause() {},
    play() { return Promise.resolve(); },
    paused: true,
    currentTime: 0,
    volume: 1,
    loop: false,
    muted: false,
    poster: '',
    src: '',
    duration: NaN,
    parentNode: null
  };
  // 懒生成 parentElement（模拟真实 HTML 嵌套）
  Object.defineProperty(el, 'parentElement', {
    get() { return this.__pe || (this.__pe = makeEl('parent-of-' + id)); },
    configurable: true
  });
  return el;
}

const elMap = new Map();
const documentStub = {
  readyState: 'complete',
  body: makeEl('body'),
  documentElement: makeEl('html'),
  getElementById(id) {
    if (!elMap.has(id)) elMap.set(id, makeEl(id));
    return elMap.get(id);
  },
  createElement(tag) { return makeEl(tag + Math.random().toString(36).slice(2, 8)); },
  addEventListener() {}
};

class ImageStub {
  constructor() {
    this.naturalWidth = 100;
    this.naturalHeight = 200;
  }
  set src(v) {
    this._src = v;
    setTimeout(() => this.onload && this.onload(), 0);
  }
  get src() { return this._src; }
}

class AudioStub {
  constructor() {
    this.paused = true;
    this.volume = 1;
    this.loop = false;
    this.currentTime = 0;
    this.duration = 10;
  }
  canPlayType() { return 'maybe'; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener() {}
  removeAttribute() {}
  load() {}
}

const store = new Map();
const localStorageStub = {
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(k, String(v)); },
  removeItem(k) { store.delete(k); }
};

// 浏览器中 window === globalThis，桩环境保持相同语义
global.window = globalThis;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.screen = { width: 1280, height: 720 };
globalThis.addEventListener = function () {};
globalThis.MSStream = undefined;
Object.defineProperty(global, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 Chrome/120' },
  configurable: true
});
globalThis.document = documentStub;
globalThis.localStorage = localStorageStub;
globalThis.Image = ImageStub;
globalThis.Audio = AudioStub;
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

/* ---------------- 加载网页版脚本（与 index.html 同顺序） ---------------- */

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
[
  'js/utils/platform.js',
  'js/utils/audio.js',
  'js/utils/save.js',
  'js/data/story.js',
  'js/data/encyclopedia.js',
  'js/utils/preload.js',
  'js/framework.js',
  'js/app.js'
].forEach(f => {
  // 与浏览器 <script> 一致的全局作用域执行
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
});

/* ---------------- 测试流程 ---------------- */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
function assert(name, cond, extra) {
  if (cond) {
    console.log('  ✓', name);
  } else {
    failures++;
    console.error('  ✗', name, extra !== undefined ? extra : '');
  }
}

(async () => {
  await sleep(600); // 等待 onLoad / 预加载 / 首节点渲染

  // 抓取注册的 page 实例（framework 挂到全局钩子）
  const p = global.__page;
  assert('Page 实例已创建', !!p);
  if (!p) { console.log('终止：未拿到 Page 实例'); process.exit(1); }

  assert('剧情数据加载（214 节点）', p.data.storyList.length === 214, p.data.storyList.length);
  assert('存档点列表（12 个）', p.data.savePointList.length === 12, p.data.savePointList.length);
  assert('预加载完成 isLoading=false', p.data.isLoading === false);
  assert('初始剧情节点 0.1', String(p.data.current.id) === '0.1', p.data.current.id);
  assert('打字机已开始', p.data.displayText.length > 0, p.data.displayText.length);

  // 点击：快进当前文本
  p.onDialogTap();
  await sleep(50);
  assert('点击后文本完整显示', p.data.displayText === p.data.current.text);
  assert('历史记录已写入', p.data.historyList.length === 1, p.data.historyList.length);

  // 点击：进入 0.2（带 BGM）
  p.onDialogTap();
  await sleep(80);
  assert('跳转到 0.2', String(p.data.current.id) === '0.2', p.data.current.id);
  assert('BGM 已设置', typeof p.data.trackedBgm === 'string' && p.data.trackedBgm.length > 0, p.data.trackedBgm);

  // dot-path setData
  p.setData({ 'current.bgVideo': null, currentVideoSrc: '' });
  await sleep(30);
  assert('setData 支持 a.b 路径', p.data.current.bgVideo === null);

  // 图鉴
  p.showEncyclopedia();
  await sleep(80);
  assert('图鉴打开', p.data.showEncyclopedia === true);
  assert('自动选中首个证物(32)', p.data.encySelectedId === 32, p.data.encySelectedId);
  p.switchEncyTab({ currentTarget: { dataset: { tab: 'witness' } } });
  await sleep(30);
  assert('切换证人标签', p.data.encyActiveTab === 'witness');
  assert('证人自动选中(1)', p.data.encySelectedId === 1, p.data.encySelectedId);
  p.hideEncyclopedia();
  await sleep(30);
  assert('图鉴关闭', p.data.showEncyclopedia === false);

  // 分支选项节点 1.7
  p.jumpToStoryId('1.7');
  await sleep(120);
  assert('选项节点 showChoices', p.data.showChoices === true, p.data.showChoices);
  const choices = p.data.current.choices || [];
  assert('选项数量 3', choices.length === 3, choices.length);
  p.onChoose({ currentTarget: { dataset: { next: choices[1].next, effect: choices[1].effect, text: choices[1].text } } });
  await sleep(80);
  assert('选项跳转 1.9', String(p.data.current.id) === '1.9', p.data.current.id);
  assert('好感度 +1', p.data.state.favorability === 1, p.data.state.favorability);

  // 暗场节点
  const darkNode = p.data.storyList.find(n => n.dark === '10' || n.dark === '01');
  assert('剧情中存在暗场节点', !!darkNode);
  if (darkNode) {
    p.jumpToStoryId(darkNode.id);
    await sleep(100);
    assert('暗场过渡已触发（opacity 变化/无异常）', typeof p.data.darkMaskOpacity === 'number');
  }

  // 存档 / 读档
  const { saveGame, loadGame, clearGame } = global.SaveUtils;
  assert('存档成功', saveGame({ currentId: '0.1', state: { favorability: 2 }, historyList: [] }) === true);
  const sd = loadGame();
  assert('读档成功', !!sd && sd.currentId === '0.1');
  assert('清档成功', clearGame() === true);
  assert('清档后读档为空', loadGame() === null);

  // 重新开始
  p.onRestart();
  await sleep(150);
  assert('重新开始回到 0.1', String(p.data.current.id) === '0.1', p.data.current.id);
  assert('重新开始后状态重置', p.data.state.favorability === 0);

  // 历史 / 存档点浮层开关
  p.showHistory();
  await sleep(30);
  assert('历史浮层打开', p.data.showHistory === true);
  p.hideHistory();
  p.showSavePoints();
  await sleep(30);
  assert('存档点警告弹出', p.data.showSavePointWarning === true);
  p.confirmSavePointWarning();
  await sleep(30);
  assert('存档点列表打开', p.data.showSavePoints === true);
  p.onSavePointTap({ currentTarget: { dataset: { index: p.data.savePointList[0].storyIndex } } });
  await sleep(120);
  assert('存档点跳转', String(p.data.current.id) === String(p.data.savePointList[0].id), p.data.current.id);

  // 结局节点
  p.jumpToStoryId('6.32');
  await sleep(80);
  assert('结局面板显示', p.data.current.isEnding === true);

  console.log(failures === 0 ? '\n全部冒烟测试通过 ✅' : `\n有 ${failures} 项失败 ❌`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => {
  console.error('冒烟测试异常:', e);
  process.exit(1);
});
