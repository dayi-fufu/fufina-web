# 网页版《魔法少女的逆转裁判》

这是原微信小程序项目的浏览器网页版。原项目文件夹完全未被改动，本网页版全部代码位于本文件夹（`web/`）中。

## 如何打开

直接双击 `index.html` 用浏览器打开即可（推荐 Chrome / Edge），无需安装任何软件、无需启动服务器。

> 游戏所需的图片/音频资源已经全部打包在本文件夹的 `assets/` 目录中（约 82 MB），
> 打开即玩，无需联网；仅图鉴"地图"分类的 4 张地图大图仍来自外部图床（百度/米游社/B站，可直连）。
> 推荐横屏或宽窗口游玩（游戏原本为横屏设计，界面尺寸会随窗口宽度自动缩放）。

可选：也可以在 `web/` 目录下用任意静态服务器打开（不是必须）：
```bash
cd web
python3 -m http.server 8000
# 然后访问 http://localhost:8000
```

## 为什么资源要打包本地（重要）

cnb.cool 的原始文件接口会返回响应头：

```
cross-origin-resource-policy: same-origin
```

浏览器按规范会拦截任何跨源页面（包括本地 `file://` 网页）对这些图片/音频的加载，
所以直接引用 CDN 时网页版会"图片和音乐都加载不出来"。
微信小程序的网络栈是原生实现、不受该浏览器安全头限制，因此原版不受影响。

解决方案：构建时把剧情引用的全部资源下载到 `assets/` 目录，并把数据文件里的
远程 URL 全部改写为本地相对路径。这样浏览器端完全同源，资源必然加载成功。

## 功能清单（与原小程序一致）

- ✅ 剧情引擎：打字机效果、点击快进/继续、`\n` 换行、自动播放、skip 自动跳转
- ✅ 分支选项（影响好感度 favorability，结局判定逻辑保留）
- ✅ 图鉴（证物/证人/地图/规定/记录 5 个分类、详情弹窗多页翻页）
- ✅ 出示系统（普通出示、强制出示、特殊证物判定、强制图片点击区域判定）
- ✅ 法庭模式（追问/出示按钮、judge 高亮文本）
- ✅ 异议特效（全屏抖动图片）
- ✅ BGM / BGS / SE / 语音（HTML5 Audio 实现，含音量、淡入淡出、片头+循环衔接）
- ✅ 自动存档 / 读档 / 存档点列表（浏览器 localStorage，与小程序存储键一致）
- ✅ 历史记录
- ✅ 暗场过渡（dark: 01/10）
- ✅ 背景视频支持（story 中暂无实际视频）
- ✅ 预加载进度条 + 后台章节预下载（浏览器 Image 预加载）
- ✅ 横屏/窗口缩放适配（rpx 语义按 `100vw/750` 精确换算）

## 目录结构

```
web/
├── index.html            页面骨架
├── css/style.css         由原 wxss 自动转换生成（rpx -> calc(var(--rpx)*N)）
├── assets/               游戏资源（图片/音频，从 cnb.cool 仓库打包，约 82MB）
├── js/
│   ├── framework.js      微信小程序 API 浏览器适配层 + 渲染引擎 + 事件委托
│   ├── app.js            游戏主逻辑（移植自 pages/index/index.js）
│   ├── data/
│   │   ├── story.js          剧情数据（自动生成，URL 已本地化）
│   │   └── encyclopedia.js   图鉴数据（自动生成，URL 已本地化）
│   └── utils/
│       ├── platform.js   平台/音频格式适配
│       ├── audio.js      BGM/BGS/SE/语音
│       ├── save.js       存档（localStorage）
│       └── preload.js    资源提取与图片预加载
└── tools/
    ├── asset-manifest.json   仓库文件清单（构建用）
    ├── build.js              构建脚本（资源同步 + URL 本地化 + CSS 生成）
    └── smoke.js              冒烟测试
```

## 与原小程序的差异（均为网页环境必要适配）

1. **资源加载**：资源已本地化到 `assets/`；其余逻辑等价。
2. **音频**：`wx.createInnerAudioContext` 替换为 HTML5 `Audio`；远程 OGG 在 Safari 等
   浏览器会自动切换 m4a（沿用原 `adaptAudioUrl` 规则），本地文件不做转换。
3. **对话换行**：原 WXML 中 `\n` 不换行，网页版按 README 文档意图以 `white-space: pre-wrap` 显示为真实换行。
4. **按钮**：小程序 `<button>` 默认样式在网页上不存在，样式已按原 wxss 等价实现。
5. **触摸拖拽**：强制图片出示支持鼠标（按住拖动/点击）和触屏两种操作。
6. **已知小差异**：
   - 两句语音在仓库中找不到对应文件（一句德波尔的台词音频未上传），会静默无语音，不影响剧情文字；
   - 异议特效音效（`yjyl.ogg`，原引用自另一个仓库）本地不存在，异议动画仍正常播放，只是无音效。

## 如果改了原项目数据 / 资源更新

在原文件夹修改 `pages/index/index.wxss`、`data/story.js`、`data/encyclopedia.js` 后，在 `web/` 下重新运行：

```bash
node tools/build.js            # 仅重新生成（使用已有 assets 与清单）
node tools/build.js --fetch    # 先重新同步仓库资源，再生成（需要联网）
```

`--fetch` 会自动拉取 cnb.cool 仓库的最新文件清单，下载剧情引用的新增/变更资源，
并把新的远程 URL 改写为本地路径。原小程序文件夹始终只读，不会被修改。

## 在线部署（可选，均为免费方案）

想通过网址在线游玩，可以把 `web/` 部署到任意免费静态托管：

- 详细步骤见 [DEPLOY.md](DEPLOY.md)（含 EdgeOne Pages、Cloudflare Pages、Netlify、GitHub Pages 对比与操作步骤）
- **Cloudflare Pages**（推荐，完全免费、`xxx.pages.dev` 永久域名）：流水线参考 [deploy/cnb-cloudflare.yml](deploy/cnb-cloudflare.yml)
- **EdgeOne Pages**（腾讯，免费版可用）：流水线参考 [deploy/cnb.yml](deploy/cnb.yml) + 部署环境 [deploy/tag_deploy.yml](deploy/tag_deploy.yml)
- 两者的正式流水线文件都在仓库根目录：`.cnb.yml`、`.cnb/tag_deploy.yml`

不需要在线托管时，直接把 `web/` 整个目录上传到任意静态服务器（对象存储/Nginx 等）也能直接跑，
因为资源已全部在 `web/assets/` 内，无需构建。
