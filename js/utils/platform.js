// utils/platform.js（网页版移植）
/**
 * 平台适配工具（浏览器版）
 * - 检测 Safari / iOS
 * - 不支持的音频格式时自动把 OGG 换成 M4A
 */
(function (global) {
  function getPlatform() {
    return 'web';
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  let canPlayOggCache = null;
  function canPlayOgg() {
    if (canPlayOggCache !== null) return canPlayOggCache;
    try {
      const a = new Audio();
      const r = a.canPlayType('audio/ogg');
      canPlayOggCache = !!(r && r !== 'no' && r !== '');
    } catch (e) {
      canPlayOggCache = false;
    }
    return canPlayOggCache;
  }

  /**
   * 将音频 URL 适配到当前浏览器
   * - 本地文件（assets/...）不做转换
   * - 远程 URL 且浏览器不支持 OGG（如 Safari/iOS）时：/ogg/ -> /m4a/，.ogg -> .m4a
   */
  function adaptAudioUrl(originalUrl) {
    if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;
    if (!/^https?:\/\//i.test(originalUrl)) return originalUrl; // 本地资源不做格式转换
    if (canPlayOgg()) return originalUrl;
    let adaptedUrl = originalUrl.replace(/\/ogg\//g, '/m4a/');
    adaptedUrl = adaptedUrl.replace(/\.ogg$/i, '.m4a');
    return adaptedUrl;
  }

  global.PlatformUtils = {
    getPlatform,
    isIOS,
    canPlayOgg,
    adaptAudioUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);
