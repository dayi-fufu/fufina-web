// utils/save.js（网页版移植）
/**
 * 游戏存档工具
 * 使用浏览器 localStorage 保存/读取游戏进度
 */
(function (global) {
  const SAVE_KEY = 'visual_novel_save';  // 存储键名（与小程序版一致）

  /**
   * 保存游戏
   */
  function saveGame(data) {
    try {
      if (!data) {
        console.warn('saveGame: 没有提供存档数据');
        return false;
      }
      global.wx.setStorageSync(SAVE_KEY, data);
      console.log('游戏已保存', data);
      return true;
    } catch (err) {
      console.error('保存游戏失败', err);
      return false;
    }
  }

  /**
   * 读取游戏存档
   */
  function loadGame() {
    try {
      const data = global.wx.getStorageSync(SAVE_KEY);
      if (data) {
        console.log('读取存档成功', data);
        return data;
      } else {
        console.log('没有找到存档');
        return null;
      }
    } catch (err) {
      console.error('读取存档失败', err);
      return null;
    }
  }

  /**
   * 清除游戏存档（重新开始游戏时调用）
   */
  function clearGame() {
    try {
      global.wx.removeStorageSync(SAVE_KEY);
      console.log('已清除存档');
      return true;
    } catch (err) {
      console.error('清除存档失败', err);
      return false;
    }
  }

  global.SaveUtils = {
    saveGame,
    loadGame,
    clearGame
  };
})(typeof window !== 'undefined' ? window : globalThis);
