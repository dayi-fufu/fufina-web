// utils/audio.js（网页版移植）
/**
 * 音频工具（浏览器 HTMLAudioElement 实现）
 * - 保留小程序版全部接口与行为：
 *   BGM 片头+循环无缝衔接、SE、语音、BGS 循环、独立音量、淡入淡出
 * - 全局缓存映射：原始URL（适配后） => 实际地址（网页版为原地址）
 */
(function (global) {
  const { adaptAudioUrl } = global.PlatformUtils;

  let bgmIntroAudio = null;   // 片头音乐实例（单次播放）
  let bgmLoopAudio = null;    // 循环音乐实例（无限循环）
  let bgsAudio = null;        // 背景音效实例（循环）
  let se = null;              // 音效实例（复用）
  let voice = null;

  // 全局缓存映射：原始URL（适配后） => 实际播放地址
  let audioCacheMap = new Map();

  // 渐弱定时器
  let fadeOutInterval = null;
  let bgsFadeOutInterval = null;

  // ---- 全局初始化：浏览器无需覆盖静音开关，空实现 ----
  if (global.wx && global.wx.setInnerAudioOption) global.wx.setInnerAudioOption({ obeyMuteSwitch: false });

  /**
   * 设置缓存映射（由预加载模块调用）
   */
  function setCacheMap(map) {
    audioCacheMap = map;
  }

  /**
   * 获取实际播放路径（优先使用缓存映射，否则使用适配后的网络地址）
   */
  function getRealPath(url) {
    if (!url) return url;
    const adaptedUrl = adaptAudioUrl(url);
    return audioCacheMap.get(adaptedUrl) || adaptedUrl;
  }

  /**
   * 创建并配置一个音频实例
   */
  function createAudio(src, loop = false) {
    const realSrc = getRealPath(src);
    const audio = global.wx.createInnerAudioContext({ useWebAudioImplement: true });
    audio.src = realSrc;
    audio.loop = loop;
    audio.autoplay = false;
    audio.onError((err) => {
      console.error('[音频错误]', err);
      console.error('[错误音频 src]', realSrc);
    });
    return audio;
  }

  /**
   * 设置背景音乐音量（包括 intro 和 loop）
   */
  function setBgmVolume(volume) {
    const vol = Math.max(0, Math.min(1, volume));
    if (bgmIntroAudio) bgmIntroAudio.volume = vol;
    if (bgmLoopAudio) bgmLoopAudio.volume = vol;
  }

  /**
   * 设置背景音效音量
   */
  function setBgsVolume(volume) {
    const vol = Math.max(0, Math.min(1, volume));
    if (bgsAudio) bgsAudio.volume = vol;
  }

  /**
   * 播放背景音乐（支持片头 intro，无缝衔接循环，支持初始音量）
   */
  function playBgmWithIntro(bgmSrc, introSrc, bgmVolume = 1) {
    stopBgm();  // 停止当前并清理渐弱
    const volume = Math.max(0, Math.min(1, bgmVolume));

    if (!introSrc) {
      if (!bgmSrc) return;
      bgmLoopAudio = createAudio(bgmSrc, true);
      bgmLoopAudio.volume = volume;
      bgmLoopAudio.play();
      return;
    }

    if (bgmSrc) {
      bgmLoopAudio = createAudio(bgmSrc, true);
      bgmLoopAudio.volume = volume;
    }

    bgmIntroAudio = createAudio(introSrc, false);
    bgmIntroAudio.volume = volume;

    bgmIntroAudio.onEnded(() => {
      if (bgmIntroAudio) {
        bgmIntroAudio.destroy();
        bgmIntroAudio = null;
      }
      if (bgmLoopAudio) {
        if (bgmLoopAudio.duration > 0) bgmLoopAudio.seek(0);
        bgmLoopAudio.play();
      }
    });

    bgmIntroAudio.play();
  }

  /**
   * 播放背景音乐（仅循环，支持音量）
   */
  function playBgm(src, volume = 1) {
    if (!src) return;
    playBgmWithIntro(src, null, volume);
  }

  /**
   * 停止背景音乐
   */
  function stopBgm() {
    if (fadeOutInterval) {
      clearInterval(fadeOutInterval);
      fadeOutInterval = null;
    }
    if (bgmIntroAudio) {
      bgmIntroAudio.stop();
      bgmIntroAudio.destroy();
      bgmIntroAudio = null;
    }
    if (bgmLoopAudio) {
      bgmLoopAudio.stop();
      bgmLoopAudio.destroy();
      bgmLoopAudio = null;
    }
  }

  /**
   * 暂停背景音乐
   */
  function pauseBgm() {
    if (bgmLoopAudio && !bgmLoopAudio.paused) bgmLoopAudio.pause();
    if (bgmIntroAudio && !bgmIntroAudio.paused) bgmIntroAudio.pause();
  }

  /**
   * 淡出背景音乐（从当前实际音量开始递减）
   */
  function fadeOutBgm(duration = 2000) {
    if (fadeOutInterval) clearInterval(fadeOutInterval);

    const bgmAudioList = [];
    const initialVolumes = [];

    if (bgmIntroAudio && !bgmIntroAudio.paused) {
      bgmAudioList.push(bgmIntroAudio);
      initialVolumes.push(bgmIntroAudio.volume);
    }
    if (bgmLoopAudio && !bgmLoopAudio.paused) {
      bgmAudioList.push(bgmLoopAudio);
      initialVolumes.push(bgmLoopAudio.volume);
    }

    if (bgmAudioList.length === 0) return;

    const stepTime = 50;
    const steps = Math.ceil(duration / stepTime);
    let currentStep = 0;

    fadeOutInterval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      bgmAudioList.forEach((audio, idx) => {
        const initialVol = initialVolumes[idx];
        const newVolume = Math.max(0, initialVol * (1 - progress));
        if (audio && !audio.paused) audio.volume = newVolume;
      });

      if (currentStep >= steps) {
        clearInterval(fadeOutInterval);
        fadeOutInterval = null;
        stopBgm();
      }
    }, stepTime);
  }

  /**
   * 播放音效（每次独立实例）
   */
  function playSe(src) {
    if (!src) return;
    const realSrc = getRealPath(src);
    const seAudio = global.wx.createInnerAudioContext({ useWebAudioImplement: true });
    seAudio.src = realSrc;
    seAudio.play();
    seAudio.onEnded(() => seAudio.destroy());
    seAudio.onError((err) => {
      console.error('[SE 错误]', err, 'src:', realSrc);
      seAudio.destroy();
    });
  }

  /**
   * 初始化语音实例
   */
  function initVoice() {
    if (!voice) {
      voice = global.wx.createInnerAudioContext({ useWebAudioImplement: true });
      voice.loop = false;
      voice.autoplay = false;
      voice.onError((err) => console.error('[语音错误]', err, 'src:', voice.src));
    }
    return voice;
  }

  /**
   * 播放语音
   */
  function playVoice(src) {
    if (!src) return;
    const audio = initVoice();
    const realSrc = getRealPath(src);
    try {
      audio.stop();
      audio.src = realSrc;
      audio.play();
    } catch (e) {
      console.error('playVoice 异常：', e);
    }
  }

  /**
   * 停止语音
   */
  function stopVoice() {
    if (voice) {
      try { voice.stop(); } catch (e) {}
    }
  }

  /**
   * 播放背景音效（循环，支持音量）
   */
  function playBgs(src, bgsVolume = 1) {
    if (!src) return;
    const realSrc = getRealPath(src);
    const volume = Math.max(0, Math.min(1, bgsVolume));

    // 清除正在进行的淡出
    if (bgsFadeOutInterval) {
      clearInterval(bgsFadeOutInterval);
      bgsFadeOutInterval = null;
    }

    // 已有实例且地址相同
    if (bgsAudio && bgsAudio.src === realSrc) {
      if (bgsAudio.volume !== 1) bgsAudio.volume = 1;
      if (bgsAudio.paused) {
        bgsAudio.play();
        console.log('[BGS] 恢复播放相同背景音效');
      } else {
        console.log('[BGS] 背景音效已在播放，忽略重复请求');
      }
      bgsAudio.volume = volume;
      return;
    }

    // 不同地址则停止旧的并播放新的
    stopBgs();

    bgsAudio = createAudio(src, true);
    bgsAudio.volume = volume;
    bgsAudio.play();
    console.log('[BGS] 开始播放:', realSrc);
  }

  /**
   * 淡出并停止背景音效
   */
  function fadeOutBgs(duration = 2000) {
    if (!bgsAudio || bgsAudio.paused) {
      return;
    }

    if (bgsFadeOutInterval) {
      clearInterval(bgsFadeOutInterval);
      bgsFadeOutInterval = null;
    }

    const initialVolume = bgsAudio.volume;
    const stepTime = 50;
    const steps = Math.ceil(duration / stepTime);
    let currentStep = 0;

    bgsFadeOutInterval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      const newVolume = Math.max(0, initialVolume * (1 - progress));
      if (bgsAudio) bgsAudio.volume = newVolume;

      if (currentStep >= steps) {
        clearInterval(bgsFadeOutInterval);
        bgsFadeOutInterval = null;
        stopBgs();
      }
    }, stepTime);
  }

  /**
   * 立即停止并销毁背景音效（无淡出）
   */
  function stopBgs() {
    if (bgsFadeOutInterval) {
      clearInterval(bgsFadeOutInterval);
      bgsFadeOutInterval = null;
    }
    if (bgsAudio) {
      try {
        bgsAudio.stop();
        bgsAudio.destroy();
      } catch (e) {
        console.error('[BGS] 停止失败', e);
      }
      bgsAudio = null;
      console.log('[BGS] 已立即停止');
    }
  }

  /**
   * 销毁所有音频实例
   */
  function destroyAllAudio() {
    stopBgm();
    stopBgs();
    if (voice) {
      voice.destroy();
      voice = null;
    }
    if (se) {
      se.destroy();
      se = null;
    }
  }

  global.AudioUtils = {
    playBgm,
    playBgmWithIntro,
    stopBgm,
    pauseBgm,
    playSe,
    playVoice,
    stopVoice,
    destroyAllAudio,
    setCacheMap,
    fadeOutBgm,
    playBgs,
    stopBgs,
    fadeOutBgs,
    setBgmVolume,
    setBgsVolume
  };
})(typeof window !== 'undefined' ? window : globalThis);
