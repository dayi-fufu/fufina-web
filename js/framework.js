// framework.js（网页版核心）
/**
 * 微信小程序 API 的浏览器适配层 + 渲染引擎
 *
 * 提供的 wx.*：
 *   showToast / setStorageSync / getStorageSync / removeStorageSync
 *   getWindowInfo / getSystemInfoSync / getDeviceInfo
 *   nextTick / createInnerAudioContext / createVideoContext / getImageInfo
 *   setInnerAudioOption / registerImageSize
 *
 * 提供的渲染机制：
 *   global.Page(def)  注册页面；def 中可使用与小程序相同的 this.data / this.setData
 *   setData 合并数据（支持 'a.b' 路径）后按区域增量刷新 DOM
 *   document 级事件委托：data-action="方法名" 模拟 bindtap/catchtap，
 *   data-stop 模拟 catchtap 的 stopPropagation
 */
(function (global) {
  'use strict';

  /* ======================= wx API 适配 ======================= */

  const imageSizeCache = new Map();

  let toastTimer = null;
  function showToast(opts) {
    opts = opts || {};
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = opts.title || '';
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), opts.duration || 1500);
  }

  const wx = {
    showToast,

    setStorageSync(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    },
    getStorageSync(k) {
      try {
        const raw = localStorage.getItem(k);
        return raw == null ? '' : JSON.parse(raw);
      } catch (e) { return ''; }
    },
    removeStorageSync(k) {
      try { localStorage.removeItem(k); } catch (e) {}
    },

    getWindowInfo() {
      return {
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height
      };
    },
    getSystemInfoSync() { return wx.getWindowInfo(); },
    getDeviceInfo() {
      return { platform: 'web', model: 'Browser' };
    },

    nextTick(fn) { requestAnimationFrame(fn); },

    setInnerAudioOption() {},

    registerImageSize(url, width, height) {
      imageSizeCache.set(url, { width, height });
    },

    getImageInfo({ src, success, fail }) {
      if (!src) { fail && fail({ errMsg: 'empty src' }); return; }
      if (imageSizeCache.has(src)) {
        const s = imageSizeCache.get(src);
        success && success({ width: s.width, height: s.height, path: src });
        return;
      }
      const img = new Image();
      img.onload = () => {
        imageSizeCache.set(src, { width: img.naturalWidth, height: img.naturalHeight });
        success && success({ width: img.naturalWidth, height: img.naturalHeight, path: src });
      };
      img.onerror = () => { fail && fail({ errMsg: 'image load fail', src }); };
      img.src = src;
    },

    createInnerAudioContext(opts) {
      const el = new Audio();
      el.preload = 'auto';
      const ctx = {
        _el: el,
        set src(v) { if (v !== this._src) { this._src = v; el.src = v; } },
        get src() { return el.src; },
        set loop(v) { el.loop = !!v; },
        get loop() { return el.loop; },
        set autoplay(v) { el.autoplay = !!v; },
        get autoplay() { return el.autoplay; },
        set volume(v) { el.volume = Math.max(0, Math.min(1, Number(v) || 0)); },
        get volume() { return el.volume; },
        get paused() { return el.paused; },
        get duration() { return (el.duration && isFinite(el.duration)) ? el.duration : 0; },
        play() {
          const p = el.play();
          if (p && p.catch) p.catch(e => console.warn('[audio] 播放被拦截:', e && e.name));
        },
        pause() { try { el.pause(); } catch (e) {} },
        stop() {
          try { el.pause(); } catch (e) {}
          try { el.currentTime = 0; } catch (e) {}
        },
        seek(t) { try { el.currentTime = t; } catch (e) {} },
        destroy() {
          try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) {}
        },
        onError(fn) { el.addEventListener('error', () => fn && fn({ errMsg: 'audio error', src: el.src })); },
        onEnded(fn) { el.addEventListener('ended', () => fn && fn()); }
      };
      return ctx;
    },

    createVideoContext(id) {
      return {
        play() {
          const v = document.getElementById(id);
          if (v) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
        },
        stop() {
          const v = document.getElementById(id);
          if (v) { try { v.pause(); v.currentTime = 0; } catch (e) {} }
        },
        seek(t) {
          const v = document.getElementById(id);
          if (v) { try { v.currentTime = t; } catch (e) {} }
        },
        destroy() {}
      };
    }
  };
  global.wx = wx;

  /* ======================= 工具 ======================= */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setByPath(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k];
    }
    cur[keys[keys.length - 1]] = value;
  }

  /* ======================= 渲染引擎 ======================= */

  function Framework() {
    return {
      /* ---- setData：合并数据 + 异步批量渲染 ---- */
      setData(updates, cb) {
        if (updates) {
          for (const k in updates) setByPath(this.data, k, updates[k]);
        }
        if (typeof cb === 'function') this._postCbs.push(cb);
        if (!this._renderQueued) {
          this._renderQueued = true;
          requestAnimationFrame(() => {
            this._renderQueued = false;
            try {
              this._renderAll();
            } catch (e) {
              console.error('[渲染] 出错', e);
            }
            const cbs = this._postCbs;
            this._postCbs = [];
            cbs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
          });
        }
      },

      _same(key, sig) {
        if (this._sig[key] === sig) return true;
        this._sig[key] = sig;
        return false;
      },

      _renderAll() {
        this._renderRoot();
        this._renderLoading();
        this._renderBg();
        this._renderDark();
        this._renderTable();
        this._renderTopBar();
        this._renderCharacters();
        this._renderDialog();
        this._renderChoices();
        this._renderEnding();
        this._renderHistory();
        this._renderSaveWarn();
        this._renderSavePoints();
        this._renderEncyclopedia();
        this._renderDetail();
        this._renderObjection();
      },

      /* ---- 根节点：法庭模式 class ---- */
      _renderRoot() {
        const d = this.data;
        const cls = 'page' + (d.courtMode ? (' court-' + d.courtMode) : '');
        const el = document.getElementById('app');
        if (el && el.className !== cls) el.className = cls;
      },

      /* ---- 预加载遮罩 ---- */
      _renderLoading() {
        const d = this.data;
        const sig = JSON.stringify([d.isLoading, d.loadText, d.loadError, d.loadProgress]);
        if (this._same('loading', sig)) return;
        const mask = document.getElementById('loadingMask');
        mask.classList.toggle('hidden', !d.isLoading);
        if (!d.isLoading) return;
        document.getElementById('loadingText').textContent = d.loadText;
        const bar = document.getElementById('progressFill').parentElement;
        bar.classList.toggle('hidden', !!d.loadError);
        document.getElementById('progressFill').style.width = d.loadProgress + '%';
        const percent = document.getElementById('loadingPercent');
        percent.classList.toggle('hidden', !!d.loadError);
        percent.textContent = d.loadProgress + '%';
        document.getElementById('retryBtn').classList.toggle('hidden', !d.loadError);
      },

      /* ---- 背景（图片或视频） ---- */
      _renderBg() {
        const d = this.data;
        const hasVideo = !!(d.current.bgVideo && d.currentVideoSrc);
        const sig = JSON.stringify([d.current.bg, d.bgPositionX, d.bgPositionY, d.bgSize,
          d.currentVideoSrc, d.currentVideoPoster, d.currentVideoLoop, d.current.bgVideoMode]);
        if (this._same('bg', sig)) return;
        const bg = document.getElementById('bg');
        bg.style.backgroundImage = d.current.bg ? 'url("' + d.current.bg.replace(/"/g, '%22') + '")' : 'none';
        bg.style.backgroundPosition = d.bgPositionX + ' ' + d.bgPositionY;
        bg.style.backgroundSize = d.bgSize;
        document.getElementById('bgWrap').classList.toggle('hidden', hasVideo);
        const v = document.getElementById('bgVideo');
        v.classList.toggle('hidden', !hasVideo);
        if (hasVideo) {
          if (v.dataset.src !== d.currentVideoSrc) {
            v.dataset.src = d.currentVideoSrc;
            v.src = d.currentVideoSrc;
            v.load();
          }
          v.loop = !!d.currentVideoLoop;
          if (d.currentVideoPoster) v.poster = d.currentVideoPoster;
          v.style.objectFit = d.current.bgVideoMode || 'cover';
        }
      },

      /* ---- 暗场遮罩 ---- */
      _renderDark() {
        const d = this.data;
        const sig = d.darkMaskOpacity + '|' + d.darkMaskTransition;
        if (this._same('dark', sig)) return;
        document.getElementById('darkMask').style.cssText =
          'opacity: ' + d.darkMaskOpacity + ';' + d.darkMaskTransition;
      },

      /* ---- 桌子图层 ---- */
      _renderTable() {
        const d = this.data;
        const sig = JSON.stringify([d.tableImageSrc, d.tableImageStyle, d.courtMode]);
        if (this._same('table', sig)) return;
        const wrap = document.getElementById('tableWrap');
        wrap.classList.toggle('hidden', !d.tableImageSrc);
        const img = document.getElementById('tableImage');
        if (d.tableImageSrc) {
          if (img.dataset.src !== d.tableImageSrc) {
            img.dataset.src = d.tableImageSrc;
            img.src = d.tableImageSrc;
          }
        }
        img.style.cssText = d.tableImageStyle || 'width: 100%; height: 100%;';
        img.style.objectFit = (d.courtMode === 'left' || d.courtMode === 'right') ? 'contain' : 'fill';
      },

      /* ---- 顶部功能栏 ---- */
      _renderTopBar() {
        const d = this.data;
        const sig = JSON.stringify([d.autoPlay, d.historyBtnText, d.savePointBtnText, !!d.current.judge]);
        if (this._same('topbar', sig)) return;
        document.getElementById('topBar').innerHTML =
          '<button class="top-btn" data-action="toggleAuto">' + (d.autoPlay ? '关闭自动' : '自动播放') + '</button>' +
          '<button class="top-btn" data-action="showHistory">' + esc(d.historyBtnText) + '</button>' +
          '<button class="top-btn" data-action="showSavePoints">' + esc(d.savePointBtnText) + '</button>' +
          (d.current.judge
            ? '<button class="top-btn" data-action="showPresentPanel">出示</button><button class="top-btn" data-action="askQuestion">追问</button>'
            : '<button class="top-btn" data-action="showEncyclopedia">图鉴</button>');
      },

      /* ---- 多角色立绘 ---- */
      _renderCharacters() {
        const d = this.data;
        const sig = JSON.stringify(d.characterList);
        if (this._same('chars', sig)) return;
        const wrap = document.getElementById('characterWrap');
        wrap.innerHTML = '';
        (d.characterList || []).forEach((item, index) => {
          if (!item || !item.src) return;
          const key = item.id + ':' + item.src;
          let cls = 'character';
          if (item.animClass) {
            // 已播放过入场动画的立绘不再重放
            if (!this._charEntered.has(key)) {
              this._charEntered.add(key);
              cls += ' ' + item.animClass;
            }
          }
          const img = document.createElement('img');
          img.className = cls;
          img.alt = '';
          img.src = item.src;
          img.style.cssText = 'left: ' + item.left + '%; transform: translateX(-50%);' + (item.sizeStyle || '');
          img.dataset.index = index;
          img.addEventListener('load', () => {
            const i = Number(img.dataset.index);
            this.onCharacterLoad && this.onCharacterLoad({
              currentTarget: { dataset: { index: i } },
              detail: { width: img.naturalWidth, height: img.naturalHeight }
            });
          });
          img.addEventListener('animationend', () => {
            this.onCharacterAnimEnd && this.onCharacterAnimEnd({});
          });
          wrap.appendChild(img);
        });
      },

      /* ---- 底部对话框 ---- */
      _renderDialog() {
        const d = this.data;
        const show = !!(d.current.text && d.current.text !== '');
        const sig = JSON.stringify([show, d.current.speaker, !!d.current.judge, d.displayText, d.showHint, d.isTyping]);
        if (this._same('dialog', sig)) return;
        document.getElementById('dialogArea').classList.toggle('hidden', !show);
        document.getElementById('nameBar').textContent = d.current.speaker || '';
        const c = document.getElementById('dialogContent');
        c.textContent = d.displayText;
        c.classList.toggle('judge-text', !!d.current.judge);
        document.getElementById('dialogHint').classList.toggle('hidden', !(d.showHint && !d.isTyping));
      },

      /* ---- 分支选项面板 ---- */
      _renderChoices() {
        const d = this.data;
        const choices = (d.showChoices && d.current.choices) || [];
        const sig = JSON.stringify(choices.map(c => [c.text, c.next, c.effect]));
        if (this._same('choices', sig)) return;
        const panel = document.getElementById('choicePanel');
        panel.classList.toggle('hidden', choices.length === 0);
        panel.innerHTML = '';
        choices.forEach((c) => {
          const btn = document.createElement('button');
          btn.className = 'choice-btn';
          btn.textContent = c.text;
          btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.onChoose({
              currentTarget: { dataset: { next: c.next, effect: c.effect || {}, text: c.text || '' } }
            });
          });
          panel.appendChild(btn);
        });
      },

      /* ---- 结局面板 ---- */
      _renderEnding() {
        const d = this.data;
        const sig = JSON.stringify([!!d.current.isEnding, d.current.endingTitle, d.current.endingText]);
        if (this._same('ending', sig)) return;
        document.getElementById('endingPanel').classList.toggle('hidden', !d.current.isEnding);
        if (!d.current.isEnding) return;
        document.getElementById('endingTitle').textContent = d.current.endingTitle || '结局';
        const hasText = !!d.current.endingText;
        document.getElementById('endingText').classList.toggle('hidden', !hasText);
        document.getElementById('endingText').textContent = d.current.endingText || '';
        document.getElementById('endingSubtitle').classList.toggle('hidden', hasText);
      },

      /* ---- 历史记录浮层 ---- */
      _renderHistory() {
        const d = this.data;
        const sig = JSON.stringify([d.showHistory, d.historyList]);
        if (this._same('history', sig)) return;
        const mask = document.getElementById('historyMask');
        mask.classList.toggle('hidden', !d.showHistory);
        if (!d.showHistory) return;
        const list = document.getElementById('historyList');
        list.innerHTML = (d.historyList || []).map(item =>
          '<div class="history-item">' +
          '<span class="history-speaker">' + esc(item.speaker || '') + '</span>' +
          '<span class="history-content">' + esc(item.content) + '</span>' +
          '</div>'
        ).join('') || '<div class="history-empty">暂无历史记录</div>';
        list.scrollTop = list.scrollHeight;
      },

      /* ---- 存档点警告浮层 ---- */
      _renderSaveWarn() {
        const d = this.data;
        if (this._same('savewarn', d.showSavePointWarning)) return;
        document.getElementById('savePointWarningMask').classList.toggle('hidden', !d.showSavePointWarning);
      },

      /* ---- 存档点浮层 ---- */
      _renderSavePoints() {
        const d = this.data;
        const sig = JSON.stringify([d.showSavePoints, d.savePointList, d.currentIndex]);
        if (this._same('savepoints', sig)) return;
        const mask = document.getElementById('savePointMask');
        mask.classList.toggle('hidden', !d.showSavePoints);
        if (!d.showSavePoints) return;
        const list = document.getElementById('savePointList');
        list.innerHTML = (d.savePointList || []).map(item =>
          '<div class="save-point-item' +
          (d.currentIndex === item.storyIndex ? ' active' : '') +
          (item.isSavePoint ? ' save-type' : '') +
          '" data-action="onSavePointTap" data-index="' + item.storyIndex + '">' +
          '<div class="save-point-title-row">' +
          '<span class="save-point-title">' + esc(item.title) + '</span>' +
          '<span class="save-point-id">ID ' + esc(item.idText) + '</span>' +
          '</div>' +
          '<span class="save-point-desc">' + esc(item.desc) + '</span>' +
          '</div>'
        ).join('') || '<div class="save-point-empty">暂无可跳转节点</div>';
        const act = list.querySelector('.save-point-item.active');
        if (act) act.scrollIntoView({ block: 'nearest' });
      },

      /* ---- 图鉴 / 出示浮层 ---- */
      _renderEncyclopedia() {
        const d = this.data;
        const sig = JSON.stringify([d.showEncyclopedia, d.forcedInteractiveMode, d.presentMode,
          d.presentForced, d.encyActiveTab, d.encySelectedId, d.encySelectedItem,
          d.encyData, d.forcedImageSrc, d.forcedImageStyle, d.forcedRectStyle, d.forcedMarkStyle]);
        if (this._same('ency', sig)) return;
        const mask = document.getElementById('encyclopediaMask');
        mask.classList.toggle('hidden', !d.showEncyclopedia);
        if (!d.showEncyclopedia) return;

        const forcedWrap = document.getElementById('forcedPresent');
        const container = document.getElementById('encyContainer');
        forcedWrap.classList.toggle('hidden', !d.forcedInteractiveMode);
        container.classList.toggle('hidden', !!d.forcedInteractiveMode);

        if (d.forcedInteractiveMode) {
          const img = document.getElementById('forcedImage');
          img.classList.toggle('hidden', !d.forcedImageSrc);
          if (d.forcedImageSrc && img.dataset.src !== d.forcedImageSrc) {
            img.dataset.src = d.forcedImageSrc;
            img.src = d.forcedImageSrc;
          }
          img.style.cssText = d.forcedImageStyle || '';
          const rect = document.getElementById('forcedRectBorder');
          rect.classList.toggle('hidden', !d.forcedRectStyle);
          rect.style.cssText = d.forcedRectStyle || '';
          const mark = document.getElementById('forcedMarkDot');
          mark.classList.toggle('hidden', !d.forcedMarkStyle);
          mark.style.cssText = d.forcedMarkStyle || '';
          this._bindForcedImage();
        } else {
          this._renderEncyRegular();
        }
      },

      /* 强制出示图片的 load/拖拽事件（只绑定一次） */
      _bindForcedImage() {
        const img = document.getElementById('forcedImage');
        if (!img || img.dataset.bound) return;
        img.dataset.bound = '1';
        img.addEventListener('load', () => {
          this.onForcedImageLoad && this.onForcedImageLoad({
            detail: { width: img.naturalWidth, height: img.naturalHeight }
          });
        });
        img.addEventListener('error', () => {
          this.onForcedImageError && this.onForcedImageError({});
        });
        let dragging = false;
        img.addEventListener('pointerdown', () => { dragging = true; });
        window.addEventListener('pointerup', () => { dragging = false; });
        img.addEventListener('pointermove', (ev) => {
          if (dragging) {
            this.onForcedImageTouchMove({ touches: [{ clientX: ev.clientX, clientY: ev.clientY }] });
          }
        });
        img.addEventListener('touchmove', (ev) => {
          if (ev.touches && ev.touches[0]) {
            this.onForcedImageTouchMove({ touches: [{ clientX: ev.touches[0].clientX, clientY: ev.touches[0].clientY }] });
          }
        }, { passive: true });
      },

      /* 普通百科/出示容器 */
      _renderEncyRegular() {
        const d = this.data;

        // 返回按钮（仅非强制出示显示）
        document.getElementById('encyBackBtn').classList.toggle('hidden', !!d.presentForced);

        // 右侧标签栏
        const tabsSig = (d.presentMode ? 'p' : 'n') + '|' + d.encyActiveTab;
        if (this._sig.encyTabs !== tabsSig) {
          this._sig.encyTabs = tabsSig;
          const labels = d.presentMode
            ? { evidence: '证物', witness: '证人', map: '地图', rule: '规定', record: '记录' }
            : { evidence: '物品', witness: '角色', map: '地图', rule: '规定', record: '记录' };
          document.getElementById('encyTabs').innerHTML =
            ['evidence', 'witness', 'map', 'rule', 'record'].map(k =>
              '<div class="ency-tab' + (d.encyActiveTab === k ? ' active' : '') +
              '" data-action="switchEncyTab" data-tab="' + k + '">' + labels[k] + '</div>'
            ).join('');
        }

        // 详情区域
        const sel = d.encySelectedItem || {};
        const isMap = d.encyActiveTab === 'map';
        document.getElementById('encyMapArea').classList.toggle('hidden', !isMap);
        document.getElementById('encyDetailRow').classList.toggle('hidden', isMap);
        if (isMap) {
          const mimg = document.getElementById('encyMapImg');
          const src = (typeof sel.details === 'string' && sel.details) ? sel.details : '';
          if (src) {
            if (mimg.dataset.src !== src) { mimg.dataset.src = src; mimg.src = src; }
          } else {
            mimg.removeAttribute('src');
            mimg.dataset.src = '';
          }
          document.getElementById('encyMapPlaceholder').classList.toggle('hidden', !!src);
        } else {
          const profile = document.getElementById('encyProfileWrap');
          const pimg = document.getElementById('encyProfileImg');
          const pSrc = sel.profileLocal || null;
          profile.classList.toggle('hidden', !pSrc);
          if (pSrc) {
            if (pimg.dataset.src !== pSrc) { pimg.dataset.src = pSrc; pimg.src = pSrc; }
          } else {
            pimg.removeAttribute('src');
            pimg.dataset.src = '';
          }
          document.getElementById('encyName').textContent = sel.name || '请选择一项';
          document.getElementById('encyPresentBtn').classList.toggle('hidden', !d.presentMode);
          document.getElementById('encyDesc').querySelector('.ency-detail-desc-text').textContent =
            sel.desc || '暂无描述';
        }

        // 地图出示浮动按钮
        document.getElementById('mapPresentBtn').classList.toggle('hidden',
          !(d.presentMode && isMap && sel.id != null));

        // 底部横向列表
        const items = (d.encyData && d.encyData[d.encyActiveTab]) || [];
        const listSig = d.encyActiveTab + '|' + d.encySelectedId + '|' + JSON.stringify(items);
        if (this._sig.encyList !== listSig) {
          this._sig.encyList = listSig;
          const wrapper = document.getElementById('encyListWrapper');
          const isIcon = d.encyActiveTab === 'evidence' || d.encyActiveTab === 'witness';
          wrapper.classList.toggle('empty', items.length === 0);
          if (items.length === 0) {
            wrapper.innerHTML = '<div class="ency-list-empty">暂无内容</div>';
          } else if (isIcon) {
            wrapper.innerHTML = items.map(item =>
              '<div class="ency-list-item icon-mode' + (d.encySelectedId === item.id ? ' active' : '') +
              '" data-action="selectEncyItem" data-id="' + esc(String(item.id)) + '">' +
              '<img class="list-item-icon" src="' + esc(item.profileLocal || item.profile || '') + '" alt="">' +
              '</div>'
            ).join('');
          } else {
            wrapper.innerHTML = items.map(item =>
              '<div class="ency-list-item' + (d.encySelectedId === item.id ? ' active' : '') +
              '" data-action="selectEncyItem" data-id="' + esc(String(item.id)) + '">' +
              '<span class="list-item-name">' + esc(item.scrollName || item.name || '') + '</span>' +
              '</div>'
            ).join('');
          }
        }
      },

      /* ---- 详情浮层（证物详情多页展示） ---- */
      _renderDetail() {
        const d = this.data;
        const sig = JSON.stringify([d.showDetailPopup, d.detailPages, d.detailCurrentPage, d.detailIsImage]);
        if (this._same('detail', sig)) return;
        const mask = document.getElementById('detailMask');
        mask.classList.toggle('hidden', !d.showDetailPopup);
        if (!d.showDetailPopup) return;
        const pages = Array.isArray(d.detailPages) ? d.detailPages : [];
        const isImage = !!d.detailIsImage;
        document.getElementById('detailContent').classList.toggle('hidden', isImage);
        document.getElementById('detailImageWrap').classList.toggle('hidden', !isImage);
        if (isImage) {
          const img = document.getElementById('detailImage');
          const src = typeof d.detailPages === 'string' ? d.detailPages : '';
          if (src && img.dataset.src !== src) { img.dataset.src = src; img.src = src; }
        } else {
          document.getElementById('detailText').textContent = pages[d.detailCurrentPage] || '无内容';
        }
        const multi = !isImage && pages.length > 1;
        const indicator = document.getElementById('detailIndicator');
        indicator.classList.toggle('hidden', !multi);
        if (multi) indicator.textContent = (d.detailCurrentPage + 1) + ' / ' + pages.length;
        const prev = document.getElementById('detailPrev');
        const next = document.getElementById('detailNext');
        prev.classList.toggle('hidden', !multi);
        next.classList.toggle('hidden', !multi);
        prev.classList.toggle('disabled', d.detailCurrentPage === 0);
        next.classList.toggle('disabled', d.detailCurrentPage === pages.length - 1);
      },

      /* ---- 异议图片浮层 ---- */
      _renderObjection() {
        const d = this.data;
        const sig = JSON.stringify([d.showObjection, d.objectionImg, d.objectionAnimClass]);
        if (this._same('objection', sig)) return;
        const mask = document.getElementById('objectionMask');
        mask.classList.toggle('hidden', !d.showObjection);
        if (!d.showObjection) return;
        const img = document.getElementById('objectionImg');
        img.className = 'objection-img' + (d.objectionAnimClass ? ' ' + d.objectionAnimClass : '');
        if (d.objectionImg && img.dataset.src !== d.objectionImg) {
          img.dataset.src = d.objectionImg;
          img.src = d.objectionImg;
        }
      }
    };
  }

  /* ======================= 事件委托 ======================= */
  document.addEventListener('click', function (e) {
    if (!page) return;
    let node = e.target;
    while (node && node !== document.body && node !== document.documentElement) {
      const ds = node.dataset || {};
      if (ds.action !== undefined) {
        const fn = page[ds.action];
        if (typeof fn === 'function') {
          const dataset = {};
          for (const k in ds) if (k !== 'action') dataset[k] = ds[k];
          fn.call(page, {
            currentTarget: { dataset: dataset },
            target: { dataset: dataset },
            detail: { x: e.clientX, y: e.clientY }
          });
        }
        return; // catchtap 语义：处理后停止冒泡
      }
      if (ds.stop !== undefined) return; // catchtap stopPropagation 语义
      node = node.parentElement;
    }
  });

  /* ======================= Page 注册 ======================= */

  let page = null;

  global.Page = function (def) {
    page = def;
    global.__page = def; // 暴露实例（供调试/测试使用）
    Object.assign(def, Framework());
    def._sig = {};
    def._postCbs = [];
    def._charEntered = new Set();

    // 背景视频事件（元素常驻，绑定一次）
    const v = document.getElementById('bgVideo');
    if (v) {
      v.addEventListener('loadedmetadata', () => def.onVideoLoaded && def.onVideoLoaded({}));
      v.addEventListener('error', () => def.onVideoError && def.onVideoError({}));
      v.addEventListener('ended', () => def.onVideoEnded && def.onVideoEnded({}));
      v.addEventListener('click', () => def.onVideoTap && def.onVideoTap({}));
    }

    const start = function () {
      if (def._started) return;
      def._started = true;
      def._renderAll();
      if (def.onLoad) def.onLoad();
      if (def.onReady) def.onReady();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }

    window.addEventListener('resize', () => def.onResize && def.onResize({}));
    window.addEventListener('orientationchange', () => {
      setTimeout(() => def.onResize && def.onResize({}), 300);
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
