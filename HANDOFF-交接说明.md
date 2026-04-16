# 金星幼儿园 Taro 小程序 — 程序员接手指南

> **仓库路径**：`金星幼儿园/Gemini/taro-app`（本文件与源码同目录，可整份发给接任者）  
> **读完你能做什么**：知道用的什么框架、业务代码怎么分层、数据从哪来、哪些页面已闭环、哪些是半成品、接手后先改什么。

---

## 零、五分钟上手（新任程序员按顺序做）

1. **Node 版本**：使用 **Node 18 或 20 LTS**。Node 22+（含当前常见的 25.x）易导致 Taro 依赖的 `@swc/core` 报 `Bindings not found`，无法启动构建。
2. **安装与构建**：
   ```bash
   cd 金星幼儿园/Gemini/taro-app   # 以你本机克隆后的实际路径为准
   npm install
   npm run build:weapp
   ```
   若 `node_modules/.bin/taro` 报 `Permission denied`，可 `chmod +x node_modules/.bin/taro` 或删除 `node_modules` 后重装。
3. **微信开发者工具**：导入本项目的 **`dist/`** 目录作为小程序根目录（具体子路径以构建产物为准，团队习惯可能为 `dist` 本身）。
4. **建议阅读顺序**：本文件 → `src/app.config.ts`（路由与 tab）→ `src/config/index.ts`（云托管与开关）→ `src/services/qideApi.ts` + `aliyunOssService.ts` → `src/services/dataService.ts` → 各 `pages/*`。
5. **和业务对齐一件事**：**线上一律按腾讯侧闭环理解**——登录与业务接口走 **微信云托管 `qide-api`**；学生/教职工等还可经 **公共读 JSON**（当前实现为阿里云 OSS 域名，若已迁腾讯云 COS 需改 `aliyunOssService.ts`）。**不使用 Supabase** 时，应清空 `src/config/index.ts` 里的 `SUPABASE_CONFIG`，使 `isSupabaseConfigured === false`，避免误连第三方库表。

---

## 一、框架与业务逻辑（一段话 + 一张表）

**框架**：**Taro 3.6** + **React 18** + **TypeScript** + **Sass**，目标运行环境主要是**微信小程序**（命令 `npm run build:weapp`）。

**业务逻辑（金星 / 腾讯云端口径）**：各页面以 **`Taro.getStorageSync` / `setStorageSync`** 读写约定键名（如 `kt_students`、`kt_staff`）作为**端上主真相**。登录与拉数主链路为：

- **腾讯微信云托管 `qide-api`**（`QIDE_API_CONFIG.baseUrl`，默认 `*.sh.run.tcloudbase.com`）：发码、密码/验证码登录、注册、`staff-bootstrap` 把学生与教职工写入本地。
- **公共读 JSON**（`aliyunOssService.ts`）：无 JWT 或兜底时从固定 URL 拉数组 JSON；**小程序内上传未实现**，写入仍依赖网站/运营侧。

**仓库中的历史代码**：`supabaseClient.ts` / `dataService` / `cloudSyncService` 里仍有 **PostgREST（历史上称 Supabase）** 分支：当 `src/config/index.ts` 中 `SUPABASE_CONFIG` 填了有效 url 与 anonKey 时会走 REST。**金星幼儿园若确定不用该链路**，交接上视为关闭；新任应清空配置或后续删代码，避免与「全腾讯云端」架构混淆。

### 完成度总览（TL;DR）

| 状态 | 含义 |
|------|------|
| **已闭环** | 主要用户路径在小程序内可完成读写（依赖云托管 + 本地存储） |
| **半成品** | 能跑，但有配置缺口、权限/同步不一致、或强依赖外部站点 |
| **未做/弱项** | 无全局登录拦截、家长角色链路不完整、小程序侧 OSS 上传未实现、历史 PostgREST 双轨封装仍在仓库、自动化测试缺失等（详见第七节） |

### 一分钟总览表

| 维度 | 说明 |
|------|------|
| 技术栈 | Taro 3.6 + React 18 + TypeScript + Sass |
| 目标端 | 微信小程序为主（`npm run build:weapp`） |
| 数据形态（生产口径） | **本地 `Taro` 存储为主** + **腾讯微信云托管 `qide-api`** + **公共读 JSON（当前 OSS 实现，可换 COS）** |
| 登录 | **qide-api 员工体系**（密码 / 验证码）；发码失败时可回退 **短信云函数**（实现里为阿里云 FC，若已迁腾讯云短信需改 `smsService.ts`） |
| 测试 | 仓库内**未见** Jest/Vitest 等自动化测试配置 |

---

## 二、目录与职责（按接手顺序读）

```
src/
├── app.tsx                 # 启动后：已登录则按条件触发「从 OSS / qide 拉数」
├── app.config.ts           # 页面路由 + tabBar（首页/学生/成长/我的）
├── config/index.ts         # qide-api 基址与 brandId；（可选）PostgREST 占位
├── pages/                  # 各业务页面（见下文「页面清单」）
├── services/
│   ├── dataService.ts      # 核心：本地键 ↔ 读写；若开启 PostgREST 则同步表
│   ├── cloudSyncService.ts # 考勤/缴费等与 PostgREST 的同步（本项目关闭时仅本地）
│   ├── supabaseClient.ts   # Taro.request 调 PostgREST（历史命名，非必须）
│   ├── aliyunOssService.ts # 公共读 JSON；有 token 时配合 qide bootstrap
│   ├── qideApi.ts          # 云托管：发码、登录、注册、bootstrap 落本地
│   └── smsService.ts       # 短信云函数（与 qide 发码并行）
└── utils/nav.ts            # tabBar / 普通页 安全跳转封装
```

---

## 三、页面清单与「完成度」主观标注

图例：**已完成（可用闭环）** / **半成品（能跑但有缺口）** / **未闭环（需后续）**

> 下表「云端」在关闭 PostgREST 时指：**仅本地 + qide / OSS JSON**。

| 路由 | tab | 状态 | 做什么 | 主要依赖 |
|------|-----|------|--------|----------|
| `pages/login/index` | 否 | **已完成** | 密码登录、验证码登录、注册；登录后 `initializeFromAliyun` 拉学生/教职工 | `qideApi`、`smsService`、`aliyunOssService` |
| `pages/index/index` | 是 | **已完成** | 首页仪表盘：学生数、教职工数、今日考勤汇总、本月缴费、快捷入口 | 纯读本地 `kt_*` |
| `pages/students/index` | 是 | **已完成** | 列表、搜索、按班筛选、新增学生（本地；若误开 PostgREST 会尝试 upsert） | `dataService` |
| `pages/students/detail` | 否 | **已完成** | 档案查看/编辑、考勤小记、缴费子列表、删除 | `dataService` + 本地考勤 key |
| `pages/students/attendance` | 否 | **已完成** | 单日考勤单生/批量；PostgREST 关闭时仅本地 | `cloudSyncService` + 本地 |
| `pages/growth/index` | 是 | **半成品** | 成长评价模板打分、列表、同步；**AI 润色**依赖 `TARO_APP_DOUBAO_API_KEY`（未注入则不可用） | `dataService` + 火山方舟 HTTP |
| `pages/finance/index` | 否 | **半成品** | 缴费列表/汇总；删除仅「本地」且权限判断可能不一致 | `cloudSyncService` + 本地 |
| `pages/finance/payment` | 否 | **已完成** | 录入缴费：写 `kt_payments`；PostgREST 关闭时不上云表 | 本地 + `uploadPayment` |
| `pages/kitchen/index` | 否 | **已完成** | 周食谱展示；优先本地，空则公共读 JSON | `aliyunOssService` |
| `pages/staff/index` | 否 | **已完成** | 教职工列表、增删改；同步路径为 PostgREST 或 OSS（以配置为准） | `dataService` / `aliyunOssService` |
| `pages/profile/index` | 是 | **半成品** | 退出登录、改名、同步 UI；**上传 JSON 在小程序侧未实现**（toast 引导去网站） | `aliyunOssService` |

**未做 / 弱项（从代码可直接看出）**

- **无全局路由守卫**：除「我的」页对未登录有提示外，其他 tab 页不强制跳转登录。
- **家长角色（PARENT）**：登录 UI 可选，但 qide 员工链路不会自然产生 PARENT。
- **成长页 AI**：依赖构建期环境变量；需在 Taro `defineConstants` 或 CI 注入 `TARO_APP_DOUBAO_API_KEY`。
- **财务页管理员删除**：只改本地数组，未做与网站/云端的删除对齐（若需要需补接口）。

---

## 四、数据流与功能联动（最重要）

### 4.1 本地存储键（约定俗成的「总线」）

| 键名 | 含义 | 常见写入方 |
|------|------|------------|
| `kt_current_user` | 当前登录用户（name/phone/role/campus…） | 登录成功 |
| `kt_auth_token` | qide-api JWT | `qideApi` 登录 |
| `kt_students` | 学生列表 | bootstrap / 公共读 JSON / `dataService` / 页面新增 |
| `kt_staff` | 教职工 | 同上 |
| `kt_classrooms` | 教室/班级（bootstrap） | `fetchEduBootstrapToStorage` |
| `kt_payments` | 缴费记录（小程序主用） | `finance/payment`、部分读兼容 `kt_fee_payments` |
| `kt_student_evaluations` | 成长评价 | `growth`、`dataService` |
| `kt_meal_plans` / `kt_kitchen_history_v2` | 食谱（新旧 key） | 厨房页、公共读 JSON |
| `kt_attendance_YYYY-MM-DD` | 某日考勤 map | 考勤页、`dataService.saveAttendanceData` |
| `kt_last_sync_time` | 上次同步时间 | 多处 |

### 4.2 生产环境：两条主路径 + 可选历史路径

```text
                    ┌─────────────────────┐
                    │   Taro 本地存储      │
                    │  (各页读写的主真相)  │
                    └─────────┬───────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
   ┌──────────────────────┐        ┌─────────────────────┐
   │ 微信云托管 qide-api   │        │ 公共读 JSON（HTTP） │
   │ JWT + staff-bootstrap │        │ 当前：阿里云 OSS 路径 │
   └──────────────────────┘        └─────────────────────┘

   （可选，建议关闭）PostgREST：isSupabaseConfigured === true 时 dataService / cloudSyncService 才会上云表
```

1. **qide-api（腾讯微信云托管）**  
   - 存在 `kt_auth_token` 时：`initializeFromAliyun` 等**优先** `fetchEduBootstrapToStorage`，写入学生、教职工等到本地。

2. **公共读 JSON**  
   - `aliyunOssService.ts` 从固定 URL GET 数组 JSON。**若全栈已迁腾讯云对象存储**，应把域名与路径改为 COS，逻辑仍是「公共读 JSON」。

3. **PostgREST（文件里常标为 Supabase）** — **金星不接则视为关闭**  
   - 清空 `SUPABASE_CONFIG` 的 url/key 或改为无效占位后，`isSupabaseConfigured` 为 false，所有相关 upsert/select 跳过，**不会访问任何 Supabase 项目**。

### 4.3 启动时自动同步（`app.tsx`）

- 条件：`kt_current_user` 存在 **且** `isAliyunConfigured` **且** 距离上次同步 ≥ 1 小时。  
- 行为：调用 `initializeFromAliyun()`（内部走 qide bootstrap 或公共读 JSON）。  
- **注意**：变量名来自历史「阿里云 OSS」实现；与是否使用 PostgREST 无关。

### 4.4 登录与验证码

- 发码：**先** `sendQideVerificationCode`（云托管），失败再 `sendLocalVerificationCode`（云函数，当前实现为阿里云 FC）。  
- 登录：`staffPasswordLogin` / `staffCodeLogin`；注册：`staffRegister`。  
- 成功后：`toLocalUser` 映射角色为 `ADMIN | TEACHER | KITCHEN`（正则匹配职务中文）。

---

## 五、与其他端（网站 / 后台）的关系（从代码注释推断）

- 财务完整功能、JSON **写入**、部分主数据维护：代码里多次出现 **「请使用网站」** 类提示。  
- 小程序定位：**移动办公 + 展示 + 本地缓存**；**不是**唯一权威后台。

---

## 六、构建与发布（操作清单）

```bash
cd Gemini/taro-app
npm install
npm run build:weapp
```

- 输出目录：`dist/`（微信开发者工具导入该目录或子目录按团队习惯）。  
- 环境变量：若要用 **豆包 AI 润色**，需在 Taro `defineConstants` 或 CI 注入 `TARO_APP_DOUBAO_API_KEY`。  
- `TARO_APP_API_BASE`：可选覆盖 `qideApi` 默认云托管域名（见 `src/config/index.ts`）。

### 6.1 本地环境踩坑（交接时已发现）

若出现 `Permission denied` 无法执行 `node_modules/.bin/taro`，检查该文件是否缺少可执行位（可 `chmod +x node_modules/.bin/taro` 或重新 `npm install`）。  
若 Taro 报 `@swc/core` **Bindings not found**，多为 **Node 主版本过新** 与本仓锁定的 `@swc` 二进制不匹配，建议改用 **Node 18/20 LTS** 再构建。

---

## 七、已知代码级不一致（建议接手后排期修）

1. **`utils/nav.ts` 的 tab 白名单** 与 `app.config.ts` 的 tabBar **不一致**：`TAB_PAGES` 含 `/pages/finance/index`，而 `app.config.ts` 的 tab 第三项是 **`pages/growth/index`**。后果：`safeGo('/pages/growth/index')` 可能无法 `switchTab`。修复：与 `tabBar.list` 四条完全一致。  
2. **`pages/finance/index.tsx` 管理员判断**：`currentUser?.role === 'admin'`（小写）与登录映射的 `'ADMIN'` **可能永远不匹配**。  
3. **`dataService` 与 `cloudSyncService`**：两套 PostgREST 调用封装并存；若永久走腾讯云，可收敛为单一数据层并删除死代码。  
4. **`src/config/index.ts`**：若生产不用 PostgREST，**删除或清空**其中的 url/anonKey，避免仓库携带无效第三方凭证；敏感项建议改为 CI 注入。

---

## 八、建议的接手后第一件事

1. 确认 **`QIDE_API_CONFIG`** 指向当前环境的微信云托管地址，`brandId` 正确。  
2. 确认 **已清空 PostgREST 配置**（或团队明确要启用时的表与 RLS），与「全腾讯云端」口径一致。  
3. 用测试账号跑通：**登录 → 同步 → 学生列表 → 考勤一天 → 缴费一条 → 成长评价一条**；需要时在**云托管日志 / 网站后台**核对数据。  
4. 修 **tab 白名单 + 财务角色判断** 两个小坑。

---

## 九、文档维护约定

- 大改数据层或登录方式时，**同步更新本节与第三节表格**。  
- 若公共读 JSON 从 OSS 迁到 **腾讯云 COS**，必须更新第四节示意图与 `aliyunOssService.ts` 说明。

---

*本文档按「线上一律腾讯云端、不使用 Supabase」业务口径维护；仓库内 PostgREST 相关文件为历史兼容，以 `isSupabaseConfigured` 是否开启为准。*
