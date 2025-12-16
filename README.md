# 🤖 Open NOF1.ai - AI 驱动的加密货币交易系统

一个基于人工智能的自动化加密货币期货交易系统，使用 Next.js 构建，集成币安期货 API 和 DeepSeek AI 模型。

## ✨ 核心特性

### 🎯 AI 交易决策
- **多模型支持**：集成 DeepSeek Chat 模型进行市场分析
- **技术指标分析**：RSI、MACD、EMA、成交量等多维度分析
- **风险管理**：自动止损止盈、动态杠杆调整
- **学习反馈**：从历史交易中总结经验，持续优化策略

### 💼 交易功能
- **自动化交易**：支持多币种同时交易（BTC、ETH、SOL、BNB、DOGE）
- **止盈止损**：自动设置和管理止损止盈订单
- **持仓管理**：实时监控持仓状态和盈亏
- **风险控制**：多层风险保护机制

### 📊 数据可视化
- **实时图表**：账户余额、收益率等关键指标
- **交易历史**：完整的交易记录和 AI 决策日志
- **性能分析**：胜率、平均盈亏、最大回撤等统计

### 🛡️ 安全特性
- **模拟交易**：支持虚拟盘测试（demo-fapi.binance.com）
- **实盘模式**：可切换到真实交易
- **API 密钥加密**：敏感信息环境变量管理
- **代理支持**：支持通过代理访问币安 API

---

## 📋 系统要求

在开始之前，请确保你的系统满足以下要求：

### 必需软件
- **Node.js** 18.0 或更高版本
- **npm** 或 **yarn** 包管理器
- **PostgreSQL** 14.0 或更高版本
- **Git** （用于克隆项目）

### 可选软件
- **代理工具**（如 Clash、V2Ray）用于访问币安 API
- **VSCode** 或其他代码编辑器

### 账户要求
- **币安账户**：需要注册并创建 API 密钥
- **DeepSeek API 密钥**：用于 AI 功能（可选，也可使用 OpenRouter）

---

## 🚀 完整安装指南

### 第 1 步：安装 Node.js

#### Windows 用户：
1. 访问 [Node.js 官网](https://nodejs.org/)
2. 下载 LTS 版本（推荐 18.x 或更高）
3. 运行安装程序，按默认选项安装
4. 打开命令提示符，验证安装：
```bash
node --version
npm --version
```

#### macOS 用户：
使用 Homebrew 安装：
```bash
brew install node@18
```

#### Linux 用户：
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

### 第 2 步：安装 PostgreSQL 数据库

#### Windows 用户：

1. **下载安装包**
   - 访问 [PostgreSQL 官网](https://www.postgresql.org/download/windows/)
   - 下载最新版本的安装程序（14.x 或更高）

2. **运行安装程序**
   - 双击安装文件
   - 选择安装路径（默认即可）
   - 设置超级用户（postgres）密码 **（请牢记此密码！）**
   - 端口号使用默认 5432
   - 选择默认语言环境

3. **验证安装**
   ```bash
   # 打开命令提示符
   psql --version
   ```

4. **配置环境变量**（如果 psql 命令不可用）
   - 右键"此电脑" → 属性 → 高级系统设置 → 环境变量
   - 在系统变量的 Path 中添加：`C:\Program Files\PostgreSQL\14\bin`

#### macOS 用户：

1. **使用 Homebrew 安装**
   ```bash
   brew install postgresql@14
   brew services start postgresql@14
   ```

2. **验证安装**
   ```bash
   psql --version
   ```

#### Linux 用户：

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# 启动服务
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 验证安装
psql --version
```

### 第 3 步：创建数据库

1. **连接到 PostgreSQL**

   **Windows:**
   ```bash
   # 打开命令提示符，输入：
   psql -U postgres
   # 输入你在安装时设置的密码
   ```

   **macOS/Linux:**
   ```bash
   sudo -u postgres psql
   ```

2. **创建数据库和用户**
   ```sql
   -- 创建数据库
   CREATE DATABASE trading_db;

   -- 创建用户（可选，建议使用）
   CREATE USER trading_user WITH PASSWORD 'your_secure_password';

   -- 授予权限
   GRANT ALL PRIVILEGES ON DATABASE trading_db TO trading_user;

   -- 退出 psql
   \q
   ```

3. **记录数据库连接信息**
   - 数据库名：`trading_db`
   - 用户名：`trading_user`（或 `postgres`）
   - 密码：你设置的密码
   - 主机：`localhost`
   - 端口：`5432`

### 第 4 步：获取币安 API 密钥

#### 虚拟盘（推荐新手先使用）：

1. 访问 [币安虚拟盘](https://testnet.binancefuture.com/)
2. 使用 GitHub 账号登录
3. 点击右上角头像 → API Key
4. 创建新的 API Key
5. 保存 API Key 和 Secret Key

#### 实盘：

⚠️ **警告：实盘涉及真实资金，请谨慎操作！**

1. 登录 [币安官网](https://www.binance.com/)
2. 账户 → API 管理
3. 创建 API Key
4. **重要：配置 API 权限**
   - ✅ 启用现货和杠杆交易
   - ✅ 启用期货交易
   - ✅ 启用读取权限
5. **配置 IP 白名单**(不然无法交易)
6. 保存 API Key 和 Secret Key

### 第 5 步：获取 AI API 密钥（可选）

#### 方案 A：DeepSeek（推荐）

1. 访问 [DeepSeek 官网](https://platform.deepseek.com/)
2. 注册账号并登录
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 保存 API Key
（最好使用deepseek,openrouter可以不配置）
#### 方案 B：OpenRouter

1. 访问 [OpenRouter](https://openrouter.ai/)
2. 注册账号并登录
3. 创建 API Key
4. 保存 API Key

### 第 6 步：克隆项目

```bash
# 克隆仓库
git clone https://github.com/your-repo/open-nof1.ai.git

# 进入项目目录
cd open-nof1.ai
```

### 第 7 步：安装项目依赖

```bash
# 使用 npm
npm install

# 或使用 yarn
yarn install

# 或使用 pnpm（推荐，速度更快）
npm install -g pnpm
pnpm install
```

**安装时间**：根据网络速度，可能需要 5-15 分钟

**如果遇到网络问题**：
```bash
# 使用国内镜像
npm config set registry https://registry.npmmirror.com
npm install
```

### 第 8 步：配置环境变量

1. **复制环境变量模板**
   ```bash
   # Windows
   copy .env.example .env

   # macOS/Linux
   cp .env.example .env
   ```

2. **编辑 `.env` 文件**

   使用任意文本编辑器打开 `.env` 文件，填写以下配置：

   ```env
  
     DATABASE_URL="postgresql://postgres:#@localhost:5432/nof1"
   #（上方的URL用你的密码替换#即可，nof1是数据库名称，如果你的数据库不叫nof1，要修改成真实名称）
   
   # ============================================
   # 代理配置 / Proxy Configuration
   # ============================================
   # 如果你在中国大陆,需要配置代理才能访问 Binance API，需要注意必须是非中非美ip（如日本新加坡）
   # 常见代理端口: Clash: 7890, V2Ray: 10809
   HTTP_PROXY="http://127.0.0.1:7890"
   BINANCE_HTTP_PROXY="http://127.0.0.1:7890"
   #此处如果用V2Ray需要自行修改
   
   # ============================================
   # 币安 API 配置 / Binance API Configuration
   # ============================================
   
   # 虚拟盘 API 配置 / Testnet API Configuration
   # 获取地址: https://testnet.binancefuture.com/
   BINANCE_TESTNET_API_KEY="your-testnet-api-key-here"
   BINANCE_TESTNET_API_SECRET="your-testnet-api-secret-here"
   BINANCE_TESTNET_BASE_URL="https://demo-fapi.binance.com"
   
   # 实盘 API 配置 / Live Trading API Configuration
   # ⚠️ 警告：实盘涉及真实资金，请谨慎配置！
   # 获取地址: https://www.binance.com/zh-CN/my/settings/api-management
   BINANCE_LIVE_API_KEY="your-live-api-key-here"
   BINANCE_LIVE_API_SECRET="your-live-api-secret-here"
   BINANCE_LIVE_BASE_URL="https://fapi.binance.com"
   
   # API 请求超时时间
   BINANCE_FETCH_TIMEOUT_MS="25000"
   
   
   # ⚠️ 重要: 只需修改这一个参数即可切换模式，无需修改其他配置
   #    IMPORTANT: Just change this parameter to switch modes, no need to change other configs
   TRADING_MODE="dry-run"
   #目前是dry-run模式,可以修改为live模式，但请谨慎操作
   
   # Risk Control Parameters (适用于虚拟盘和实盘 / Apply to both virtual and live trading)
   MAX_POSITION_SIZE_USDT=5000  # 最大持仓Maximum position size in USDT (increased for aggressive strategy)
   MAX_LEVERAGE=30  # 最大杠杆Maximum allowed leverage (increased to 30x for high-yield strategy)
   DAILY_LOSS_LIMIT_PERCENT=20  # 最大日损失限制Daily loss limit as percentage of capital (20% for aggressive trading)
   
   # ============================================
   # AI 模型配置 / AI Model Configuration
   # ============================================
   
   # DeepSeek（技术分析师 / Technical Analyst）
   DEEPSEEK_API_KEY="your-deepseek-api-key-here"
   
   # Google Gemini 2.5 Pro（基本面分析师 / Fundamental Analyst）
   # 获取地址: https://aistudio.google.com/app/apikey
   GOOGLE_API_KEY="AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   
   # Qwen Plus（情绪分析师 / Sentiment Analyst）
   # 获取地址: https://dashscope.console.aliyun.com/apiKey
   QWEN_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   
   # Kimi k2（最终决策者 / Decision Maker）
   # 获取地址: https://platform.moonshot.cn/console/api-keys
   KIMI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   
   # OpenRouter API Key（可选，作为备用，一般不用就行）
   # OPENROUTER_API_KEY="sk-167c49fa9eb949a2bfc6a542897d02df"
   
   # ============================================
   # 多Agent系统配置 / Multi-Agent System Config
   # ============================================
   
   # PDF文档路径（分析数据源）
   MARKET_ANALYSIS_PDF="app/pdf/market-analyse.pdf"
   MOOD_ANALYSIS_PDF="app/pdf/mood-analyse.pdf"
   
   # 性能与超时配置（已优化平衡速度与可靠性）
   # Performance and Timeout Configuration (Optimized for balance)
   AGENT_TIMEOUT=18000             # 单个Agent响应超时（毫秒）- 18秒给LLM足够处理时间
   DEEPSEEK_TIMEOUT=18000          # DeepSeek专用超时（可选，默认使用AGENT_TIMEOUT）
   GEMINI_TIMEOUT=18000            # Gemini专用超时（可选，默认使用AGENT_TIMEOUT）
   QWEN_TIMEOUT=18000              # Qwen专用超时（可选，默认使用AGENT_TIMEOUT）
   KIMI_TIMEOUT=20000              # Kimi决策者超时（稍长，因为需要综合分析）
   
   FORUM_TIMEOUT=60000             # 整个论坛讨论超时（毫秒）
   MAX_HISTORY_LESSONS=20          # 每个Agent加载的历史教训数量
   MAX_FORUM_ROUNDS=3              # 最大讨论轮次
   CONSENSUS_THRESHOLD=0.66        # 共识阈值（0.66 = 2/3一致）
   
   # ============================================
   # 应用配置 / Application Configuration
   # ============================================
   NEXT_PUBLIC_URL="http://localhost:3000"
   CRON_SECRET_KEY="secretkey_change_this_in_production"
   
   NODE_ENV="development"

### 第 9 步：初始化数据库

```bash
# 生成 Prisma 客户端
npx prisma generate

# 创建数据库表结构
npx prisma db push

# （可选）查看数据库
npx prisma studio
```

**如果遇到数据库连接错误**：
- 检查 DATABASE_URL 是否正确
- 确认 PostgreSQL 服务是否运行
- 验证数据库密码是否正确

### 第 10 步：启动项目

```bash
# 开发模式启动
npm run dev：all

```

**启动成功后**：
- 访问 http://localhost:3000 查看前端界面
- 系统会自动开始执行 AI 交易决策（每 3 分钟一次）
- 日志会显示：`🎮 Trading Mode: DRY-RUN (Virtual Trading)`

**关于 CRON_SECRET_KEY**：
- ✅ **必需配置**：用于保护定时任务 API 端点
- 🔐 默认值：`abc123secretkey_change_this_in_production`
- ⚠️ 生产环境请更换为强密码（至少 32 个字符）
- 💡 作用：防止未授权访问 `/api/cron/*` 端点

---

## 📖 详细使用指南

### 🎯 交易模式快速切换（重要更新！）

系统现在支持一键切换交易模式，无需手动修改多个配置！

#### 配置说明：

**准备工作**：在 `.env` 中配置两套 API 密钥
```env
# 虚拟盘 API（测试用）
BINANCE_TESTNET_API_KEY="虚拟盘密钥"
BINANCE_TESTNET_API_SECRET="虚拟盘Secret"

# 实盘 API（真实交易）
BINANCE_LIVE_API_KEY="实盘密钥"
BINANCE_LIVE_API_SECRET="实盘Secret"
```

#### 切换模式：只需修改一个参数！

**虚拟盘模式（推荐新手）**：
```env
TRADING_MODE="dry-run"
```
- ✅ 自动使用 `BINANCE_TESTNET_*` 配置
- ✅ 自动连接 `https://demo-fapi.binance.com`
- ✅ 使用虚拟资金，安全测试
- ✅ 日志显示：`🎮 Trading Mode: DRY-RUN (Virtual Trading)`

**实盘模式（谨慎使用）**：
```env
TRADING_MODE="live"
```
- ⚠️ 自动使用 `BINANCE_LIVE_*` 配置
- ⚠️ 自动连接 `https://fapi.binance.com`
- ⚠️ 涉及真实资金，请充分测试后使用
- ⚠️ 日志显示：`⚠️ Trading Mode: LIVE (Real Money Trading)`

**切换后记得重启应用**：
```bash
# 停止当前运行（Ctrl+C）
# 重新启动
npm run dev
```

### 模拟交易（推荐新手）

模拟交易使用虚拟资金，不会有任何真实损失，非常适合测试策略。

#### 配置步骤：

1. **确认 `.env` 配置**
   ```env
   TRADING_MODE="dry-run"
   BINANCE_TESTNET_API_KEY="虚拟盘的API密钥"
   BINANCE_TESTNET_API_SECRET="虚拟盘的API密钥Secret"
   ```

2. **启动应用**
   ```bash
   npm run dev
   ```

3. **观察日志**
   ```
   🎮 Trading Mode: DRY-RUN (Virtual Trading)
   - Using Testnet API: https://demo-fapi.binance.com
   🤖 Mode: 🎮 VIRTUAL
   💰 Starting with virtual balance: $10,000
   ```

4. **查看交易**
   - 打开浏览器访问 http://localhost:3000
   - 查看"已完成交易"标签页
   - 监控账户余额变化

### 实盘交易

⚠️ **重要警告**：
- 实盘交易涉及真实资金，可能造成损失
- 强烈建议先在虚拟盘充分测试
- 建议从小额资金开始（如 $100-$500）
- 定期监控系统运行状态

#### 切换步骤：

1. **修改 `.env` 配置**
   ```env
   TRADING_MODE="live"
   BINANCE_LIVE_API_KEY="实盘API密钥"
   BINANCE_LIVE_API_SECRET="实盘API密钥Secret"
   ```

2. **验证 API 权限**
   - 确认 API Key 已启用期货交易权限
   - 建议设置 IP 白名单
   - 不要启用提现权限

3. **重启应用**
   ```bash
   # 停止当前运行（Ctrl+C）
   # 重新启动
   npm run dev
   ```

4. **确认模式**
   ```
   ⚠️  Trading Mode: LIVE (Real Money Trading)
   - Using Live API: https://fapi.binance.com
   💰 Current balance: $XXX.XX
- 建议从小额资金开始（如 $100-$500）
- 定期监控系统运行状态

#### 切换步骤：

1. **修改 `.env` 配置**
   ```env
   TRADING_MODE=live
   BINANCE_FAPI_BASE_URL=https://fapi.binance.com
   BINANCE_API_KEY=实盘API密钥
   BINANCE_API_SECRET=实盘API密钥Secret
   ```

2. **验证 API 权限**
   - 确认 API Key 已启用期货交易权限
   - 建议设置 IP 白名单
   - 不要启用提现权限

3. **重启应用**
   ```bash
   # 停止当前运行（Ctrl+C）
   # 重新启动
   npm run dev
   ```

4. **确认模式**
   ```
   🤖 Mode: ⚠️ LIVE (REAL MONEY)
   💰 Current balance: $XXX.XX
   ```

### 自定义交易策略

编辑 `trading-style-config.json` 文件：

```json
{
  "riskTolerance": "aggressive",  // 风险容忍度: conservative, moderate, aggressive
  "positionSizing": {
    "maxPercentPerTrade": 25,     // 单笔最大仓位: 5-30%
    "scaleWithWinRate": true      // 根据胜率动态调整
  },
  "leveragePreference": {
    "maxLeverage": 30,             // 最大杠杆: 1-30
    "preferredLeverage": 12        // 偏好杠杆: 5-20
  },
  "exitStrategy": {
    "profitTarget": 20,            // 止盈目标: 10-50%
    "stopLoss": 3.5,               // 止损: 2-10%
    "timeHorizon": "short-term"    // 时间范围: short-term, medium-term, long-term
  },
  "technicalIndicators": ["RSI", "MACD", "EMA", "Volume"],
  "userInstruction": "高风险高收益策略，严格止损"
}
```

### 监控和管理

#### 查看实时数据
- **首页**：实时价格、账户余额、收益率
- **图表**：历史收益曲线
- **交易记录**：查看所有交易历史
- **AI 对话**：查看 AI 决策过程

#### 手动管理持仓
```bash
# 查看当前持仓
npm run check:positions

# 手动设置止盈止损
npm run manage:sltp
```

#### 查看日志
```bash
# 查看运行日志
# 日志会显示所有交易决策和执行情况
```

---

## 🔧 高级配置

### 代理配置

如果你在中国大陆，可能需要配置代理访问币安 API。

#### 使用 Clash/V2Ray：

1. 启动代理软件
2. 查看本地代理端口（通常是 7890）
3. 配置 `.env`：
   ```env
   BINANCE_HTTP_PROXY=http://127.0.0.1:7890
   ```

#### 禁用代理：
```env
BINANCE_DISABLE_PROXY=true
```

### 定时任务配置

系统默认每 3 分钟执行一次交易决策。

#### CRON_SECRET_KEY 说明

**什么是 CRON_SECRET_KEY？**
- 🔐 用于保护定时任务 API 端点（`/api/cron/*`）
- 🛡️ 防止未授权访问和恶意触发交易
- ✅ 开发模式和生产模式都必须设置

**配置方法：**
```env
# .env 文件
CRON_SECRET_KEY="abc123secretkey_change_this_in_production"
```

**安全建议：**
- ⚠️ 生产环境请使用强密码（至少 32 个字符）
- 🔄 定期更换密钥
- 🚫 不要将密钥提交到代码仓库
- 💡 生成强密码：`openssl rand -base64 32`

**如何工作：**
1. `cron.ts` 使用密钥生成 JWT 令牌
2. 定时任务调用 API 时携带令牌
3. API 端点验证令牌有效性
4. 验证通过后执行交易逻辑

#### 修改执行频率：

编辑 `cron.ts` 中修改：
```typescript
// 交易决策（每 3 分钟）
cron.schedule('*/3 * * * *', async () => {
  await runChatInterval();
});

// 指标收集（每 30 秒）
cron.schedule('*/30 * * * * *', async () => {
  await runMetricsInterval();
});

// 其他示例：
// '*/5 * * * *'  - 每 5 分钟
// '*/10 * * * *' - 每 10 分钟
// '0 * * * *'    - 每小时
// '0 0 * * *'    - 每天凌晨
```

**Cron 表达式格式：**
```
┌────────────── 秒（可选，0-59）
│ ┌──────────── 分钟（0-59）
│ │ ┌────────── 小时（0-23）
│ │ │ ┌──────── 日期（1-31）
│ │ │ │ ┌────── 月份（1-12）
│ │ │ │ │ ┌──── 星期（0-7，0 和 7 都表示周日）
│ │ │ │ │ │
* * * * * *
```

### 风险控制参数

在 `lib/ai/prompt.ts` 中调整核心风险参数：

```typescript
// 最大杠杆
const MAX_LEVERAGE = 30;

// 单笔最大风险
const MAX_RISK_PER_TRADE = 0.015; // 1.5%

// 单一币种最大仓位
const MAX_EXPOSURE_PER_SYMBOL = 0.40; // 40%
```

### 数据库管理

#### 查看数据库：
```bash
npx prisma studio
```
浏览器会自动打开 http://localhost:5555

#### 备份数据库：
```bash
# Windows
pg_dump -U trading_user -d trading_db > backup.sql

# macOS/Linux
sudo -u postgres pg_dump trading_db > backup.sql
```

#### 恢复数据库：
```bash
# Windows
psql -U trading_user -d trading_db < backup.sql

# macOS/Linux
sudo -u postgres psql trading_db < backup.sql
```

#### 清空数据（重新开始）：
```bash
npx prisma db push --force-reset
```

---

## 🏗️ 项目结构详解

```
open-nof1.ai/
├── app/                          # Next.js App Router
│   ├── api/                      # API 路由
│   │   ├── account/              # 账户相关 API
│   │   │   └── diagnose/         # 诊断接口
│   │   ├── activity/             # 交易活动数据
│   │   │   └── route.ts          # 获取交易记录和持仓
│   │   ├── ai-chat/              # AI 聊天接口
│   │   │   └── route.ts          # 与 AI 对话
│   │   ├── cron/                 # 定时任务
│   │   │   ├── 3-minutes-run-interval/  # 3 分钟执行一次
│   │   │   └── dev-seed/         # 开发数据生成
│   │   ├── metrics/              # 性能指标
│   │   │   └── route.ts          # 获取图表数据
│   │   └── pricing/              # 市场价格数据
│   │       └── route.ts          # 获取实时价格
│   ├── globals.css               # 全局样式
│   ├── layout.tsx                # 应用布局
│   └── page.tsx                  # 主页面
│
├── components/                   # React 组件
│   ├── ui/                       # UI 基础组件
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── tabs.tsx
│   │   └── ...
│   ├── ai-chat.tsx               # AI 聊天组件
│   ├── animated-number.tsx       # 数字动画组件
│   ├── chart.tsx                 # 图表组件
│   ├── crypto-card.tsx           # 加密货币卡片
│   ├── goal-progress-panel.tsx   # 目标进度面板
│   ├── metrics-chart.tsx         # 指标图表
│   └── models-view.tsx           # 模型视图
│
├── lib/                          # 核心业务逻辑
│   ├── ai/                       # AI 相关
│   │   ├── model.ts              # AI 模型配置
│   │   ├── prompt.ts             # 提示词生成
│   │   ├── run.ts                # AI 执行逻辑
│   │   └── learning-feedback.ts  # 学习反馈机制
│   │
│   ├── trading/                  # 交易核心逻辑
│   │   ├── binance-official.ts   # 币安官方 SDK 封装
│   │   ├── buy.ts                # 买入逻辑
│   │   ├── sell.ts               # 卖出逻辑
│   │   ├── stop-loss-take-profit-official.ts  # 止盈止损管理
│   │   ├── current-market-state.ts  # 市场状态获取
│   │   ├── account-information-and-performance.ts  # 账户信息
│   │   └── types.ts              # 交易相关类型定义
│   │
│   ├── types/                    # 全局类型定义
│   │   ├── metrics.ts            # 指标类型
│   │   └── position.ts           # 持仓类型
│   │
│   ├── prisma.ts                 # Prisma 数据库客户端
│   └── utils.ts                  # 工具函数
│
├── prisma/                       # Prisma ORM 配置
│   └── schema.prisma             # 数据库模型定义
│
├── public/                       # 静态资源
│   ├── images/
│   └── ...
│
├── .env                          # 环境变量（不提交到 Git）
├── .env.example                  # 环境变量模板
├── .gitignore                    # Git 忽略文件
├── eslint.config.mjs             # ESLint 配置
├── next.config.ts                # Next.js 配置
├── package.json                  # 项目依赖和脚本
├── postcss.config.mjs            # PostCSS 配置
├── README.md                     # 项目文档
├── tailwind.config.ts            # Tailwind CSS 配置
├── trading-style-config.json     # 交易策略配置
└── tsconfig.json                 # TypeScript 配置
```

---

## 📊 数据库模型详解

### Chat 表（AI 决策记录）
```prisma
model Chat {
  id          String    @id @default(cuid())
  model       String    // AI 模型名称
  chat        String    @db.Text  // AI 分析内容
  reasoning   String?   @db.Text  // 推理过程
  userPrompt  String    @db.Text  // 用户提示词
  tradings    Trading[] // 关联的交易
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

### Trading 表（交易记录）
```prisma
model Trading {
  id              String    @id @default(cuid())
  symbol          String    // 交易对，如 BTC
  operation       String    // 操作: Buy/Sell/Hold
  pricing         Float?    // 价格
  amount          Float?    // 数量
  leverage        Int?      // 杠杆倍数
  stopLossPercent Float?    // 止损百分比
  takeProfitPercent Float?  // 止盈百分比
  orderId         String?   // 订单 ID
  status          String    @default("pending")  // 状态
  pnl             Float?    // 盈亏
  exitReason      String?   // 退出原因
  chat            Chat      @relation(...)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

### Metrics 表（性能指标）
```prisma
model Metrics {
  id        String   @id @default(cuid())
  name      String   // 指标名称
  model     String   // 模型版本
  data      Json     // 指标数据（JSON 格式）
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### LessonLearned 表（学习反馈）
```prisma
model LessonLearned {
  id         String   @id @default(cuid())
  tradeId    String   // 关联的交易 ID
  symbol     String   // 交易对
  outcome    String   // 结果: profit/loss
  pnl        Float    // 盈亏金额
  lesson     String   @db.Text  // 学到的教训
  indicators Json     // 技术指标快照
  createdAt  DateTime @default(now())
}
```

---

## 🛠️ 常见问题解决

### 1. 数据库连接失败

**错误信息**：
```
Error: P1001: Can't reach database server
```

**解决方案**：
```bash
# 检查 PostgreSQL 是否运行
# Windows
services.msc  # 查找 postgresql 服务

# macOS
brew services list

# Linux
sudo systemctl status postgresql

# 如果未运行，启动服务
# Windows: 在服务管理器中启动
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

### 2. API 连接超时

**错误信息**：
```
Error: connect ETIMEDOUT
```

**解决方案**：
1. 检查代理配置是否正确
2. 确认代理软件是否运行
3. 尝试更换代理端口
4. 测试网络连接：
   ```bash
   curl https://demo-fapi.binance.com/fapi/v1/ping
   ```

### 3. 依赖安装失败

**错误信息**：
```
npm ERR! code ERESOLVE
```

**解决方案**：
```bash
# 清除缓存
npm cache clean --force

# 删除 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# 使用 legacy peer deps
npm install --legacy-peer-deps
```

### 4. 端口已被占用

**错误信息汇总**：
```
Error: listen EADDRINUSE: address already in use :::3000
```

**解决方案**：
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID号> /F

# macOS/Linux
lsof -ti:3000 | xargs kill -9

# 或使用其他端口
PORT=3001 npm run dev
```

### 5. Prisma 客户端未生成

**错误信息**：
```
Error: @prisma/client did not initialize yet
```

**解决方案**：
```bash
npx prisma generate
```

### 6. CRON_SECRET_KEY 错误

**错误信息**：
```
error: secretOrPrivateKey must have a value
```

**原因**：
- `.env` 文件中缺少 `CRON_SECRET_KEY` 配置
- 定时任务需要此密钥生成 JWT 令牌

**解决方案**：
```bash
# 在 .env 文件中添加
CRON_SECRET_KEY="abc123secretkey_change_this_in_production"

# 或生成强密码
openssl rand -base64 32
```

### 7. 交易模式切换不生效

**现象**：
- 修改了 `TRADING_MODE` 但仍使用旧配置
- 日志显示的 API 地址不正确

**解决方案**：
```bash
# 1. 确认 .env 文件已保存
# 2. 停止应用（Ctrl+C）
# 3. 重新启动
npm run dev

# 4. 查看日志确认
# 虚拟盘应显示: 🎮 Trading Mode: DRY-RUN (Virtual Trading)
# 实盘应显示: ⚠️ Trading Mode: LIVE (Real Money Trading)
```

### 8. 找不到 getBinanceBaseUrl

**错误信息**：
```
找不到导出的成员 'getBinanceBaseUrl'
```

**解决方案**：
```bash
# 确保已更新 binance-official.ts 文件
# 如果仍有问题，重新安装依赖
rm -rf node_modules package-lock.json
npm install
```



## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发流程
1. Fork 本项目
2. 创建功能分支：`git checkout -b feature/AmazingFeature`
3. 提交更改：`git commit -m 'Add some AmazingFeature'`
4. 推送到分支：`git push origin feature/AmazingFeature`
5. 提交 Pull Request


## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

### 联系方式
添加issue
email——2731468336@qq.com

**免责声明**：本项目仅供学习和研究使用，不构成任何投资建议。加密货币交易具有高风险，可能导致部分或全部本金损失。使用本系统进行实盘交易的所有风险由用户自行承担。开发者不对任何交易损失负责。

**风险提示**：
- 📉 加密货币市场波动极大，可能在短时间内造成重大损失
- 🤖 AI 系统不能保证盈利，过去的表现不代表未来结果
- 💰 只投入你能承受损失的资金
- 📚 在投资前请充分了解相关风险

---

**版本**：v1.0.0  
**最后更新**：2025年1月  
**维护状态**：🟢 活跃维护中
