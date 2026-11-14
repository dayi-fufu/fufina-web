// utils/preload.js（网页版移植）
/**
 * 资源提取与预加载（浏览器版）
 * - 保留 extractChapterResources / extractEncyclopediaResources / downloadResources 接口
 * - 图片用 Image 预加载并缓存尺寸；音频/视频由浏览器按需流式加载
 */
(function (global) {
  const story = global.STORY;
  const encyclopedia = global.ENCYCLOPEDIA;
  const { adaptAudioUrl } = global.PlatformUtils;

  /**
   * 从单个 story 节点提取资源，加入对应的 Set
   */
  function collectItemResources(item, imageSet, audioSet, videoSet) {
    if (item.bg && typeof item.bg === 'string') imageSet.add(item.bg);
    if (item.bgVideo && typeof item.bgVideo === 'string') videoSet.add(item.bgVideo);
    if (item.bgPoster && typeof item.bgPoster === 'string') imageSet.add(item.bgPoster);

    if (item.character) {
      if (Array.isArray(item.character)) {
        item.character.forEach(src => {
          if (src && typeof src === 'string') imageSet.add(src);
        });
      } else if (typeof item.character === 'string') {
        imageSet.add(item.character);
      }
    }

    // /stop 和 !stop 是控制指令，不是真实 URL，跳过
    if (item.bgm && item.bgm !== '/stop' && item.bgm !== '!stop') audioSet.add(adaptAudioUrl(item.bgm));
    if (item.bgmIntro) audioSet.add(adaptAudioUrl(item.bgmIntro));
    if (item.bgs && item.bgs !== '/stop' && item.bgs !== '!stop') audioSet.add(adaptAudioUrl(item.bgs));
    if (item.se) audioSet.add(adaptAudioUrl(item.se));
    if (item.voice) audioSet.add(adaptAudioUrl(item.voice));

    if (item.objectionImg && typeof item.objectionImg === 'string') {
      imageSet.add(item.objectionImg);
    }

    if (item.table && typeof item.table === 'string') {
      imageSet.add(item.table);
    }

    // 收集 addEncyclopedia 条目中的图片
    if (item.addEncyclopedia) {
      const entries = Array.isArray(item.addEncyclopedia) ? item.addEncyclopedia : [item.addEncyclopedia];
      entries.forEach(entry => {
        if (entry.profile && typeof entry.profile === 'string') imageSet.add(entry.profile);
        if (entry.img && typeof entry.img === 'string') imageSet.add(entry.img);
        if (entry.details) {
          if (typeof entry.details === 'string' && entry.details.startsWith('http')) {
            imageSet.add(entry.details);
          } else if (Array.isArray(entry.details)) {
            entry.details.forEach(d => {
              if (typeof d === 'string' && d.startsWith('http')) imageSet.add(d);
            });
          }
        }
      });
    }
  }

  /**
   * 提取图鉴（百科）引用的所有图片资源
   */
  function extractEncyclopediaResources() {
    const imageSet = new Set();
    if (!encyclopedia) return { images: [], audios: [], videos: [] };

    for (const key in encyclopedia) {
      const items = encyclopedia[key];
      if (Array.isArray(items)) {
        items.forEach(item => {
          if (item.profile && typeof item.profile === 'string') imageSet.add(item.profile);
          if (item.details) {
            if (typeof item.details === 'string' && item.details.startsWith('http')) {
              imageSet.add(item.details);
            } else if (Array.isArray(item.details)) {
              item.details.forEach(d => {
                if (typeof d === 'string' && d.startsWith('http')) imageSet.add(d);
              });
            }
          }
        });
      }
    }

    return { images: Array.from(imageSet), audios: [], videos: [] };
  }

  /**
   * 提取某个章节（按 id 前缀）引用的所有资源
   */
  function extractChapterResources(prefix) {
    const imageSet = new Set();
    const audioSet = new Set();
    const videoSet = new Set();

    story.forEach(item => {
      const idStr = String(item.id);
      if (idStr.startsWith(prefix)) {
        collectItemResources(item, imageSet, audioSet, videoSet);
      }
    });

    return {
      images: Array.from(imageSet),
      audios: Array.from(audioSet),
      videos: Array.from(videoSet)
    };
  }

  /**
   * 预加载单张图片（本地相对路径或远程 URL，成功后把尺寸登记到 wx.getImageInfo 缓存）
   */
  function preloadImage(url) {
    return new Promise((resolve, reject) => {
      if (!url) {
        console.warn('跳过空 URL');
        reject(new Error('empty url'));
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (global.wx && global.wx.registerImageSize) global.wx.registerImageSize(url, img.naturalWidth, img.naturalHeight);
        resolve(url);
      };
      img.onerror = () => reject(new Error('image load fail'));
      img.src = url;
    });
  }

  /**
   * 下载指定的资源集合（网页版：图片预加载，音频/视频返回原地址映射）
   * @returns {Promise<{imageMap: Map, audioMap: Map, videoMap: Map}>}
   */
  async function downloadResources(images, audios, videos, onProgress) {
    const total = images.length + audios.length + videos.length;
    if (total === 0) {
      onProgress && onProgress(1, 1, null, 'none');
      return { imageMap: new Map(), audioMap: new Map(), videoMap: new Map() };
    }

    let currentCount = 0;
    const updateProgress = (type, url) => {
      currentCount++;
      if (onProgress) {
        onProgress(currentCount, total, url, type);
      }
    };

    const imageMap = new Map();
    await Promise.all(images.map(url =>
      preloadImage(url)
        .then(() => { imageMap.set(url, url); })
        .catch(err => console.warn('预加载失败:', url, err && err.message))
        .finally(() => updateProgress('image', url))
    ));

    const audioMap = new Map(audios.map(u => [u, u]));
    const videoMap = new Map(videos.map(u => [u, u]));
    audios.forEach(u => updateProgress('audio', u));
    videos.forEach(u => updateProgress('video', u));

    return { imageMap, audioMap, videoMap };
  }

  /**
   * 预加载全部资源（旧版，保留兼容）
   */
  async function preloadAll(onProgress) {
    const { images, audios, videos } = extractChapterResources('');
    const enc = extractEncyclopediaResources();
    const allImages = [...new Set([...images, ...enc.images])];
    return downloadResources(allImages, audios, videos, onProgress);
  }

  global.PreloadUtils = {
    preloadAll,
    extractChapterResources,
    extractEncyclopediaResources,
    downloadResources
  };
})(typeof window !== 'undefined' ? window : globalThis);
