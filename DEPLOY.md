# 在线部署（免费静态托管）

网页版是纯静态站点：一个 `web/` 目录（`index.html` + 已本地化的 `assets/`），
**整目录上传到任意静态托管即可运行，不需要构建、不需要服务器、不需要备案**。

本文给出几种免费方案，任选其一（方案 A、B 支持"push 代码 → 自动部署"）。

| 方案 | 是否免费 | 默认访问域名 | 国内访问 | 需要注册 |
| --- | --- | --- | --- | --- |
| A. EdgeOne Pages（腾讯，已配好流水线） | 免费版长期可用 | 大陆区默认预览域名有时效，稳定访问建议绑域名 | 快 | 腾讯云账号 |
| **B. Cloudflare Pages（推荐）** | **免费**，静态请求不限量 | `项目名.pages.dev`，永久 | 一般（可绑域名加快） | 邮箱即可 |
| C. Netlify | 免费 100GB/月 | `项目名.netlify.app`，永久 | 一般 | 邮箱即可 |
| D. GitHub Pages | 免费 | `用户名.github.io/仓库名`，永久 | 慢 | GitHub 账号 |

> 关于方案 A 的"要付费"：EdgeOne Pages **官方明确有长期免费版**（流量与请求不限量），
> 见 [官方 FAQ](http://edgeone.cloud.tencent.com/pages/document/162936949996421120)。
> 2026 年 11 月起产品更名为 EdgeOne Makers 并上线了专业版/商业版付费套餐，但免费版保留
> （构建额度由 500 次/月调整为 300 分钟/月，[参考](https://www.ittellyou.com/606.html)）。
> 需要注意：**大陆区项目默认访问域名是限时的预览链接（约 3 小时），想长期稳定访问要绑定自定义域名**，
> 这大概就是你被引导到付费/域名环节的原因。

---

## 方案 B：Cloudflare Pages（推荐，完全免费）

免费额度：静态文件请求与带宽不限量、每月 500 次构建、默认 `xxx.pages.dev` 域名永久有效、自动 HTTPS、无需备案。

### 1. 创建 Pages 项目

1. 注册/登录 <https://dash.cloudflare.com/>（邮箱即可）
2. 左侧 **Workers & Pages → Create → Pages → Upload assets（直接上传）**
3. 项目名填 `gala-web`（可自定义），随意上传任意一个文件完成首次创建
4. 记下项目名，以及页面右侧栏的 **Account ID**（账户 ID）

### 2. 创建 API 令牌

1. 右上角头像 → **My Profile → API Tokens → Create Token**
2. 用 **Create Custom Token**：权限 `Account` → **Cloudflare Pages** → **Edit**
3. 创建后复制令牌（只显示一次）

### 3. 在 CNB 建密钥仓库

1. cnb.cool → 新建仓库 → 类型选 **密钥仓库**（例如 `secrets`）
2. 新建文件 `cf-envs.yml`：

   ```yaml
   CLOUDFLARE_API_TOKEN: 粘贴你的 Cloudflare API 令牌
   CLOUDFLARE_ACCOUNT_ID: 粘贴你的 Account ID
   ```

3. 复制该文件地址（形如 `https://cnb.cool/你的账号/secrets/-/blob/main/cf-envs.yml`）

### 4. 换成 Cloudflare 版流水线

仓库根目录的 `.cnb.yml` 换成 [deploy/cnb-cloudflare.yml](deploy/cnb-cloudflare.yml) 的内容（本地参考副本），
并做两处修改（文件里共 3 处）：

1. `CF_PAGES_PROJECT: gala-web` → 你第 1 步创建的项目名
2. 解开 `# imports:` 注释 → 填第 3 步的密钥文件地址

### 5. 触发部署

push 到 `main` 或 `web-version` 即自动部署，日志在仓库「云原生构建」页；
站点地址：`https://<项目名>.pages.dev`

> 想绑定自己的域名：Cloudflare Pages 项目 → Custom domains → 添加域名（域名 DNS 需托管在 Cloudflare，免费）。
> 国内访问速度一般，绑自己的域名后更稳定。

---

## 方案 A：EdgeOne Pages（已配好，免费版可用）

流水线配置：[deploy/cnb.yml](deploy/cnb.yml) → 仓库根目录 `.cnb.yml`
部署环境定义：[deploy/tag_deploy.yml](deploy/tag_deploy.yml) → `.cnb/tag_deploy.yml`

### 步骤

1. <https://console.tencentcloud.com/edgeone/pages> → 创建项目 → **必须选「直接上传」类型** → 记下项目名
2. Pages 控制台 → **API Token → 新建** → 复制
3. CNB 密钥仓库建 `envs.yml`：

   ```yaml
   EDGEONE_PAGES_API_TOKEN: 你的 Pages API Token
   ```

4. 修改 `.cnb.yml`：把 3 处 `EO_PAGES_PROJECT: manosaba2c` 改成你的项目名，并解开 3 处 `# imports:` 注释
5. push（`main` 或 `web-version`）或到仓库「部署」页手动选择环境

部署地址以 EdgeOne Pages 控制台显示为准（默认域名有时效，建议绑定自定义域名）。

---

## 方案 C：Netlify（拖拽即可）

1. 注册 <https://app.netlify.com/>
2. **Add new site → Deploy manually**，把 `web/` 目录整个拖进去，几秒后得到
   `https://随机名.netlify.app`（可在 Site settings 改站点名）
3. 想自动部署：Site settings → Build & deploy → 用 `netlify deploy` CLI + `NETLIFY_AUTH_TOKEN`
   （同样建议放 CNB 密钥仓库，在 `.cnb.yml` 里执行 `netlify deploy --dir web --prod`）

无需备案；免费额度 100GB 流量/月。

---

## 方案 D：GitHub Pages（需要单独的小仓库）

⚠️ 主仓库 `gala` 约 1.2GB（含 `galagame/` 原始素材），超过 GitHub 建议的仓库体积，
不适合整体推上去。做法：**只把 `web/` 目录（约 83MB）推到新仓库**：

```bash
mkdir gala-web && cd gala-web && git init
cp -R /path/to/web/. .
git add . && git commit -m "web"
git remote add origin https://github.com/<你>/gala-web.git
git push -u origin main
```

然后在仓库 Settings → Pages 选择 `main` 分支根目录发布。
GitHub Pages 免费、永久，但**国内访问较慢**，且仓库必须公开。

---

## 方案 E：干脆不部署

- **本地直接玩**：下载/克隆仓库后双击 `web/index.html`，资源全在本地，离线可玩；
- **发给别人**：把 `web/` 压成 zip 发过去，对方解压双击 `index.html` 即可；
- **内网/自建**：任意静态服务器（Nginx、`python3 -m http.server`、对象存储静态网站）托管 `web/` 目录。

---

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 流水线显示"未配置 TOKEN，本次跳过部署" | `imports` 还没解开注释，或密钥仓库文件没建好 |
| 部署报鉴权失败 | Token 错误/失效/权限不足（Cloudflare 需 `Pages: Edit`） |
| Cloudflare 报找不到项目 | 先在控制台用「直接上传」创建项目，且项目名与 `CF_PAGES_PROJECT` 完全一致 |
| 站点打开白屏、资源 404 | 部署目录必须是 `web`（其中直接含 `index.html`），不要部署 `web/index.html` 这个层级 |
| push 后没触发流水线 | 仓库 `设置 → 云原生构建` 确认开启「允许自动触发」；Fork 仓库默认不自动触发 |
| 页面能打开但没声音 | 浏览器自动播放限制：先点一下对话区域，之后 BGM/语音才会播放 |
