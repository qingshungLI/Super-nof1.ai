# Reddit 加密货币情感分析爬虫

## 功能介绍

使用 Reddit 公开 JSON API 抓取加密货币社区数据，无需 API 凭证，每 30 分钟运行一次。

### 主要功能

1. **无需 API 凭证** - 使用 Reddit 公开 JSON 接口 (`/r/<subreddit>/new.json`)
2. **情感分析** - 使用 VADER 进行情感分析
3. **AI 分析报告** - 可选集成 Google Gemini 生成综合分析
4. **守护进程模式** - 支持每 30 分钟自动运行
5. **遵守速率限制** - 每次请求间隔 2 秒，避免被封禁

### 目标 Subreddits

| Subreddit | 币种 | 说明 |
|-----------|------|------|
| r/bitcoin | BTC | 比特币讨论 |
| r/ethereum | ETH | 以太坊讨论 |
| r/solana | SOL | Solana 讨论 |
| r/binance | BNB | 币安交易所讨论 |
| r/dogecoin | DOGE | 狗狗币讨论 |
| r/CryptoCurrency | CRYPTO | 综合加密货币讨论 |

## 安装步骤

### 1. 安装依赖

```bash
cd scripts/reddit-sentiment
pip install -r requirements.txt
```

### 2. 配置环境变量（可选）

如需 AI 分析功能，设置 Google API Key：

```bash
# Windows PowerShell
$env:GOOGLE_API_KEY="your_api_key"

# 或在 .env 文件中设置
GOOGLE_API_KEY=your_api_key
```

如需代理：

```bash
$env:HTTP_PROXY="http://127.0.0.1:7890"
```

## 使用方法

### 单次运行

```bash
python reddit_scraper.py
```

### 守护进程模式（每 30 分钟）

```bash
python reddit_scraper.py --daemon
```

### 自定义间隔（每 60 分钟）

```bash
python reddit_scraper.py --daemon --interval 60
```

### 使用代理

```bash
python reddit_scraper.py --proxy http://127.0.0.1:7890
```

### 完整参数

```bash
python reddit_scraper.py --help

用法:
  python reddit_scraper.py                    # 单次运行
  python reddit_scraper.py --daemon           # 守护进程模式 (每30分钟)
  python reddit_scraper.py --daemon --interval 60  # 每60分钟运行
  python reddit_scraper.py --proxy http://127.0.0.1:7890  # 使用代理
```

## 输出文件

运行后会在 `output/` 目录下生成：

| 文件 | 说明 |
|------|------|
| `reddit_crypto_YYYYMMDD_HHMMSS.json` | 完整数据 JSON |
| `reddit_posts_YYYYMMDD_HHMMSS.csv` | 帖子数据 CSV |
| `reddit_report_YYYYMMDD_HHMMSS.md` | Markdown 分析报告 |

## 技术细节

### API 端点

使用 Reddit 公开 JSON 接口：
- 新帖: `https://www.reddit.com/r/<subreddit>/new.json?limit=50`
- 热帖: `https://www.reddit.com/r/<subreddit>/hot.json?limit=25`
- 评论: `https://www.reddit.com/r/<subreddit>/comments/<post_id>.json`

### 速率限制

- 每次请求间隔: 2 秒
- 每个 subreddit 最多: 50 条新帖 + 25 条热帖
- 每个帖子最多: 20 条评论
- 被限速时自动等待重试

### 情感分析

使用 VADER (Valence Aware Dictionary and sEntiment Reasoner)：
- 分数范围: -1 (极负面) 到 +1 (极正面)
- 正面: score > 0.05
- 负面: score < -0.05
- 中性: -0.05 ≤ score ≤ 0.05

## 注意事项

1. **无需注册** - 不需要 Reddit API 凭证
2. **遵守规则** - 请勿过于频繁调用，建议间隔 ≥30 分钟
3. **代理支持** - 中国大陆用户建议配置代理
4. **仅供研究** - 数据仅供研究分析，请遵守 Reddit 使用条款

## 许可证

MIT License
