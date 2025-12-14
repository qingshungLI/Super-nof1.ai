#!/usr/bin/env python3
"""
Reddit 加密货币情感分析爬虫
使用 PRAW (Python Reddit API Wrapper) - 官方推荐方式
每 30 分钟运行一次

使用前需要创建 Reddit 应用获取凭证：
1. 访问 https://www.reddit.com/prefs/apps
2. 创建 "script" 类型应用
3. 获取 client_id 和 client_secret

使用方法:
    python reddit_scraper.py              # 单次运行
    python reddit_scraper.py --daemon     # 后台守护进程模式（每30分钟）
"""

import json
import time
import os
import sys
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import csv

# 第三方库
try:
    import praw
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
except ImportError as e:
    print(f"❌ 缺少依赖: {e}")
    print("请运行: pip install praw vaderSentiment")
    sys.exit(1)

# 可选: Google Gemini AI 分析
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("⚠️ google-generativeai 未安装，将跳过 AI 分析")


class RedditCryptoScraper:
    """Reddit 加密货币情感爬虫 (使用 PRAW)"""

    # 加密货币相关 Subreddit 配置
    CRYPTO_SUBREDDITS = {
        'bitcoin': {
            'name': 'Bitcoin',
            'symbol': 'BTC',
            'keywords': ['btc', 'bitcoin', 'satoshi', 'sats']
        },
        'ethereum': {
            'name': 'Ethereum',
            'symbol': 'ETH',
            'keywords': ['eth', 'ethereum', 'vitalik', 'layer2', 'l2']
        },
        'solana': {
            'name': 'Solana',
            'symbol': 'SOL',
            'keywords': ['sol', 'solana']
        },
        'binance': {
            'name': 'Binance',
            'symbol': 'BNB',
            'keywords': ['bnb', 'binance', 'cz']
        },
        'dogecoin': {
            'name': 'Dogecoin',
            'symbol': 'DOGE',
            'keywords': ['doge', 'dogecoin', 'shiba']
        },
        'CryptoCurrency': {
            'name': 'Crypto General',
            'symbol': 'CRYPTO',
            'keywords': ['crypto', 'altcoin', 'defi', 'nft']
        }
    }

    # 速率限制配置
    MAX_POSTS_PER_SUB = 50  # 每个 subreddit 最多抓取帖子数
    MAX_COMMENTS_PER_POST = 20  # 每个帖子最多抓取评论数

    def __init__(self, output_dir: str = "output",
                 client_id: Optional[str] = None,
                 client_secret: Optional[str] = None,
                 user_agent: str = "CryptoSentimentBot/1.0"):
        """
        初始化爬虫

        Args:
            output_dir: 输出目录
            client_id: Reddit API client_id
            client_secret: Reddit API client_secret
            user_agent: User-Agent 字符串
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # 获取 Reddit API 凭证
        self.client_id = client_id or os.getenv('REDDIT_CLIENT_ID')
        self.client_secret = client_secret or os.getenv('REDDIT_CLIENT_SECRET')
        self.user_agent = user_agent or os.getenv(
            'REDDIT_USER_AGENT', 'CryptoSentimentBot/1.0')

        if not self.client_id or not self.client_secret:
            print("❌ 缺少 Reddit API 凭证!")
            print("请设置环境变量 REDDIT_CLIENT_ID 和 REDDIT_CLIENT_SECRET")
            print("或在 https://www.reddit.com/prefs/apps 创建应用获取")
            sys.exit(1)

        # 初始化 PRAW Reddit 客户端（只读模式）
        self.reddit = praw.Reddit(
            client_id=self.client_id,
            client_secret=self.client_secret,
            user_agent=self.user_agent
        )

        print(f"✅ Reddit API 已连接 (只读模式)")

        # 初始化情感分析器
        self.sentiment_analyzer = SentimentIntensityAnalyzer()

        # 初始化 Gemini (如果可用)
        self.gemini_model = None
        if GEMINI_AVAILABLE:
            api_key = os.getenv('GOOGLE_API_KEY')
            if api_key:
                try:
                    genai.configure(api_key=api_key)
                    self.gemini_model = genai.GenerativeModel(
                        'gemini-1.5-flash')
                    print("✅ Gemini AI 已初始化")
                except Exception as e:
                    print(f"⚠️ Gemini 初始化失败: {e}")

        # 统计数据
        self.stats = {
            'total_posts': 0,
            'total_comments': 0,
            'requests_made': 0,
            'errors': 0
        }

    def _get_sentiment_label(self, score: float) -> str:
        """将情感分数转换为标签"""
        if score >= 0.05:
            return 'positive'
        elif score <= -0.05:
            return 'negative'
        else:
            return 'neutral'

    def fetch_subreddit_posts(self, subreddit_name: str, limit: int = 50, sort: str = 'new') -> list:
        """
        获取 subreddit 的帖子列表

        Args:
            subreddit_name: subreddit 名称
            limit: 获取数量
            sort: 排序方式 (new, hot, top, rising)

        Returns:
            帖子列表
        """
        print(f"📥 抓取 r/{subreddit_name} ({sort})...")

        try:
            subreddit = self.reddit.subreddit(subreddit_name)

            # 根据排序方式获取帖子
            if sort == 'new':
                submissions = subreddit.new(limit=limit)
            elif sort == 'hot':
                submissions = subreddit.hot(limit=limit)
            elif sort == 'top':
                submissions = subreddit.top(limit=limit, time_filter='day')
            elif sort == 'rising':
                submissions = subreddit.rising(limit=limit)
            else:
                submissions = subreddit.new(limit=limit)

            posts = []
            for submission in submissions:
                self.stats['requests_made'] += 1

                # 提取帖子信息
                post = {
                    'id': submission.id,
                    'subreddit': subreddit_name,
                    'title': submission.title,
                    'selftext': submission.selftext or '',
                    'score': submission.score,
                    'upvote_ratio': submission.upvote_ratio,
                    'num_comments': submission.num_comments,
                    'created_utc': submission.created_utc,
                    'author': str(submission.author) if submission.author else '[deleted]',
                    'permalink': submission.permalink,
                    'url': submission.url,
                    'is_self': submission.is_self,
                    'flair': submission.link_flair_text or '',
                }

                # 计算情感得分
                text = f"{post['title']} {post['selftext']}"
                sentiment = self.sentiment_analyzer.polarity_scores(text)
                post['sentiment_score'] = sentiment['compound']
                post['sentiment_label'] = self._get_sentiment_label(
                    sentiment['compound'])

                posts.append(post)

            self.stats['total_posts'] += len(posts)
            print(f"   ✅ 获取 {len(posts)} 条帖子")

            return posts

        except Exception as e:
            print(f"   ❌ 抓取失败: {e}")
            self.stats['errors'] += 1
            return []

    def fetch_post_comments(self, subreddit_name: str, post_id: str, limit: int = 20) -> list:
        """
        获取帖子的评论

        Args:
            subreddit_name: subreddit 名称
            post_id: 帖子 ID
            limit: 获取评论数量

        Returns:
            评论列表
        """
        try:
            submission = self.reddit.submission(id=post_id)
            submission.comments.replace_more(limit=0)  # 移除 "more comments" 链接

            comments = []
            for comment in submission.comments[:limit]:
                self.stats['requests_made'] += 1

                if not hasattr(comment, 'body') or not comment.body:
                    continue

                if comment.body == '[deleted]' or comment.body == '[removed]':
                    continue

                comment_data = {
                    'id': comment.id,
                    'post_id': post_id,
                    'subreddit': subreddit_name,
                    'body': comment.body,
                    'score': comment.score,
                    'created_utc': comment.created_utc,
                    'author': str(comment.author) if comment.author else '[deleted]',
                }

                # 计算情感得分
                sentiment = self.sentiment_analyzer.polarity_scores(
                    comment.body)
                comment_data['sentiment_score'] = sentiment['compound']
                comment_data['sentiment_label'] = self._get_sentiment_label(
                    sentiment['compound'])

                comments.append(comment_data)

            self.stats['total_comments'] += len(comments)
            return comments

        except Exception as e:
            print(f"   ⚠️ 评论抓取失败: {e}")
            return []

    def scrape_all(self, include_comments: bool = True) -> dict:
        """
        抓取所有配置的 subreddit

        Args:
            include_comments: 是否抓取评论

        Returns:
            完整的抓取结果
        """
        start_time = datetime.now(timezone.utc)
        print(f"\n{'='*60}")
        print(f"🚀 Reddit 加密货币情感分析开始")
        print(f"⏰ 开始时间: {start_time.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print(f"📊 目标: {len(self.CRYPTO_SUBREDDITS)} 个 subreddit")
        print(f"{'='*60}\n")

        results = {
            'metadata': {
                'scrape_time': start_time.isoformat(),
                'subreddits': list(self.CRYPTO_SUBREDDITS.keys()),
                'include_comments': include_comments,
            },
            'subreddits': {},
            'all_posts': [],
            'all_comments': [],
        }

        for subreddit, config in self.CRYPTO_SUBREDDITS.items():
            print(f"\n📌 处理 r/{subreddit} ({config['name']})...")

            sub_result = {
                'name': config['name'],
                'symbol': config['symbol'],
                'posts': [],
                'comments': [],
                'sentiment_summary': {}
            }

            # 抓取帖子 (new + hot)
            new_posts = self.fetch_subreddit_posts(
                subreddit, limit=self.MAX_POSTS_PER_SUB, sort='new')
            hot_posts = self.fetch_subreddit_posts(
                subreddit, limit=25, sort='hot')

            # 合并并去重
            seen_ids = set()
            all_posts = []
            for post in new_posts + hot_posts:
                if post['id'] not in seen_ids:
                    seen_ids.add(post['id'])
                    all_posts.append(post)

            sub_result['posts'] = all_posts
            results['all_posts'].extend(all_posts)

            # 抓取热门帖子的评论
            if include_comments:
                # 只抓取 score 最高的前 5 个帖子的评论
                top_posts = sorted(
                    all_posts, key=lambda x: x['score'], reverse=True)[:5]

                for post in top_posts:
                    comments = self.fetch_post_comments(
                        subreddit, post['id'], self.MAX_COMMENTS_PER_POST)
                    sub_result['comments'].extend(comments)
                    results['all_comments'].extend(comments)
                    time.sleep(1)  # 遵守速率限制

            # 计算该 subreddit 的情感摘要
            all_sentiments = [p['sentiment_score'] for p in all_posts]
            if include_comments:
                all_sentiments.extend([c['sentiment_score']
                                      for c in sub_result['comments']])

            if all_sentiments:
                sub_result['sentiment_summary'] = {
                    'average': sum(all_sentiments) / len(all_sentiments),
                    'positive_ratio': len([s for s in all_sentiments if s > 0.05]) / len(all_sentiments),
                    'negative_ratio': len([s for s in all_sentiments if s < -0.05]) / len(all_sentiments),
                    'neutral_ratio': len([s for s in all_sentiments if -0.05 <= s <= 0.05]) / len(all_sentiments),
                    'total_items': len(all_sentiments),
                }

            results['subreddits'][subreddit] = sub_result

            if sub_result['sentiment_summary']:
                print(f"   📊 情感: 正面 {sub_result['sentiment_summary'].get('positive_ratio', 0)*100:.1f}% | "
                      f"负面 {sub_result['sentiment_summary'].get('negative_ratio', 0)*100:.1f}%")

            # subreddit 之间休息一下
            time.sleep(2)

        # 计算全局统计
        end_time = datetime.now(timezone.utc)
        duration = (end_time - start_time).total_seconds()

        results['metadata']['end_time'] = end_time.isoformat()
        results['metadata']['duration_seconds'] = duration
        results['metadata']['stats'] = self.stats

        # 计算全局情感
        all_sentiments = [p['sentiment_score'] for p in results['all_posts']]
        all_sentiments.extend([c['sentiment_score']
                              for c in results['all_comments']])

        if all_sentiments:
            results['global_sentiment'] = {
                'average': sum(all_sentiments) / len(all_sentiments),
                'positive_ratio': len([s for s in all_sentiments if s > 0.05]) / len(all_sentiments),
                'negative_ratio': len([s for s in all_sentiments if s < -0.05]) / len(all_sentiments),
                'neutral_ratio': len([s for s in all_sentiments if -0.05 <= s <= 0.05]) / len(all_sentiments),
                'total_items': len(all_sentiments),
            }

        print(f"\n{'='*60}")
        print(f"✅ 抓取完成!")
        print(f"⏱️  耗时: {duration:.1f} 秒")
        print(f"📝 帖子: {self.stats['total_posts']} 条")
        print(f"💬 评论: {self.stats['total_comments']} 条")
        print(f"🌐 请求: {self.stats['requests_made']} 次")
        print(f"❌ 错误: {self.stats['errors']} 次")
        print(f"{'='*60}\n")

        return results

    def generate_ai_analysis(self, results: dict) -> Optional[str]:
        """
        使用 Gemini 生成 AI 分析报告

        Args:
            results: 抓取结果

        Returns:
            AI 分析文本
        """
        if not self.gemini_model:
            return None

        print("🤖 生成 AI 分析报告...")

        # 构建摘要数据
        summary_parts = []
        for subreddit, data in results['subreddits'].items():
            sentiment = data.get('sentiment_summary', {})
            top_posts = sorted(
                data['posts'], key=lambda x: x['score'], reverse=True)[:3]

            summary_parts.append(f"""
### r/{subreddit} ({data['symbol']})
- 帖子数: {len(data['posts'])}
- 情感: 正面 {sentiment.get('positive_ratio', 0)*100:.1f}% | 负面 {sentiment.get('negative_ratio', 0)*100:.1f}%
- 热门话题:
{chr(10).join([f'  - {p["title"][:80]}... (👍{p["score"]})' for p in top_posts])}
""")

        prompt = f"""作为加密货币市场分析师，请根据以下 Reddit 社区数据分析当前市场情绪：

抓取时间: {results['metadata']['scrape_time']}
总帖子数: {results['metadata']['stats']['total_posts']}
总评论数: {results['metadata']['stats']['total_comments']}

全局情感指标:
- 平均情感分数: {results.get('global_sentiment', {}).get('average', 0):.3f}
- 正面比例: {results.get('global_sentiment', {}).get('positive_ratio', 0)*100:.1f}%
- 负面比例: {results.get('global_sentiment', {}).get('negative_ratio', 0)*100:.1f}%

各社区详情:
{''.join(summary_parts)}

请提供:
1. **整体市场情绪评估** (看涨/看跌/中性)
2. **各币种情绪分析** (BTC, ETH, SOL, BNB, DOGE)
3. **社区热点话题**
4. **潜在风险信号**
5. **交易建议** (保守/激进)

请用中文回答，格式清晰。"""

        try:
            response = self.gemini_model.generate_content(prompt)
            return response.text
        except Exception as e:
            print(f"❌ AI 分析生成失败: {e}")
            return None

    def save_results(self, results: dict, ai_analysis: Optional[str] = None) -> dict:
        """
        保存结果到文件

        Args:
            results: 抓取结果
            ai_analysis: AI 分析文本

        Returns:
            保存的文件路径
        """
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        saved_files = {}

        # 1. 保存完整 JSON
        json_path = self.output_dir / f"reddit_crypto_{timestamp}.json"
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        saved_files['json'] = str(json_path)
        print(f"💾 JSON 已保存: {json_path}")

        # 2. 保存帖子 CSV
        posts_csv_path = self.output_dir / f"reddit_posts_{timestamp}.csv"
        if results['all_posts']:
            with open(posts_csv_path, 'w', encoding='utf-8', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=[
                    'id', 'subreddit', 'title', 'score', 'num_comments',
                    'sentiment_score', 'sentiment_label', 'created_utc', 'author'
                ])
                writer.writeheader()
                for post in results['all_posts']:
                    writer.writerow({k: post.get(k, '')
                                    for k in writer.fieldnames})
            saved_files['posts_csv'] = str(posts_csv_path)
            print(f"💾 帖子 CSV 已保存: {posts_csv_path}")

        # 3. 保存 Markdown 报告
        report_path = self.output_dir / f"reddit_report_{timestamp}.md"
        report = self._generate_markdown_report(results, ai_analysis)
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(report)
        saved_files['report'] = str(report_path)
        print(f"💾 报告已保存: {report_path}")

        return saved_files

    def _generate_markdown_report(self, results: dict, ai_analysis: Optional[str] = None) -> str:
        """生成 Markdown 格式报告"""

        global_sentiment = results.get('global_sentiment', {})

        report = f"""# Reddit 加密货币情感分析报告

## 📊 报告概览

- **抓取时间**: {results['metadata']['scrape_time']}
- **分析社区**: {', '.join(results['metadata']['subreddits'])}
- **总帖子数**: {results['metadata']['stats']['total_posts']}
- **总评论数**: {results['metadata']['stats']['total_comments']}
- **耗时**: {results['metadata'].get('duration_seconds', 0):.1f} 秒

## 🎯 全局情感指标

| 指标 | 数值 |
|------|------|
| 平均情感分数 | {global_sentiment.get('average', 0):.3f} |
| 正面比例 | {global_sentiment.get('positive_ratio', 0)*100:.1f}% |
| 负面比例 | {global_sentiment.get('negative_ratio', 0)*100:.1f}% |
| 中性比例 | {global_sentiment.get('neutral_ratio', 0)*100:.1f}% |

## 📈 各社区分析

"""

        for subreddit, data in results['subreddits'].items():
            sentiment = data.get('sentiment_summary', {})

            # 获取热门帖子
            top_posts = sorted(
                data['posts'], key=lambda x: x['score'], reverse=True)[:5]

            report += f"""### r/{subreddit} ({data['symbol']})

| 指标 | 数值 |
|------|------|
| 帖子数 | {len(data['posts'])} |
| 评论数 | {len(data['comments'])} |
| 平均情感 | {sentiment.get('average', 0):.3f} |
| 正面比例 | {sentiment.get('positive_ratio', 0)*100:.1f}% |

**热门帖子:**

| 标题 | 评分 | 情感 |
|------|------|------|
"""
            for post in top_posts:
                title = post['title'][:50] + \
                    '...' if len(post['title']) > 50 else post['title']
                title = title.replace('|', '\\|')  # 转义表格分隔符
                report += f"| {title} | {post['score']} | {post['sentiment_label']} |\n"

            report += "\n"

        # 添加 AI 分析
        if ai_analysis:
            report += f"""## 🤖 AI 综合分析

{ai_analysis}
"""

        report += f"""
---

*报告由 Super-nof1.ai Reddit Sentiment Scraper 生成*
*生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*
"""

        return report


def run_once(output_dir: str = "output"):
    """单次运行"""
    scraper = RedditCryptoScraper(output_dir=output_dir)
    results = scraper.scrape_all(include_comments=True)
    ai_analysis = scraper.generate_ai_analysis(results)
    saved_files = scraper.save_results(results, ai_analysis)
    return saved_files


def run_daemon(output_dir: str = "output", interval_minutes: int = 30):
    """守护进程模式，定期运行"""
    print(f"🔄 守护进程模式启动，每 {interval_minutes} 分钟运行一次")
    print("   按 Ctrl+C 停止\n")

    run_count = 0

    while True:
        try:
            run_count += 1
            print(f"\n{'#'*60}")
            print(f"# 第 {run_count} 次运行")
            print(f"{'#'*60}")

            run_once(output_dir=output_dir)

            print(f"\n⏰ 下次运行: {interval_minutes} 分钟后")
            print(
                f"   ({datetime.now().strftime('%H:%M:%S')} + {interval_minutes}min)")

            # 等待指定时间
            time.sleep(interval_minutes * 60)

        except KeyboardInterrupt:
            print("\n\n👋 收到停止信号，正在退出...")
            break
        except Exception as e:
            print(f"\n❌ 运行出错: {e}")
            print(f"⏰ {interval_minutes} 分钟后重试...")
            time.sleep(interval_minutes * 60)


def main():
    """主入口"""
    parser = argparse.ArgumentParser(
        description='Reddit 加密货币情感分析爬虫 (使用 PRAW)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
环境变量:
  REDDIT_CLIENT_ID     Reddit API client_id (必需)
  REDDIT_CLIENT_SECRET Reddit API client_secret (必需)
  REDDIT_USER_AGENT    User-Agent 字符串 (可选)
  GOOGLE_API_KEY       Gemini API Key (可选，用于 AI 分析)

获取 Reddit API 凭证:
  1. 访问 https://www.reddit.com/prefs/apps
  2. 创建 "script" 类型应用
  3. client_id 在应用名称下方
  4. client_secret 是 "secret" 字段

示例:
  # 设置环境变量
  set REDDIT_CLIENT_ID=your_client_id
  set REDDIT_CLIENT_SECRET=your_client_secret
  
  # 单次运行
  python reddit_scraper.py
  
  # 守护进程模式 (每30分钟)
  python reddit_scraper.py --daemon
  
  # 每60分钟运行
  python reddit_scraper.py --daemon --interval 60
        """
    )

    parser.add_argument('--daemon', '-d', action='store_true',
                        help='守护进程模式，定期运行')
    parser.add_argument('--interval', '-i', type=int, default=30,
                        help='运行间隔（分钟），默认 30')
    parser.add_argument('--output', '-o', type=str, default='output',
                        help='输出目录，默认 output')

    args = parser.parse_args()

    if args.daemon:
        run_daemon(output_dir=args.output, interval_minutes=args.interval)
    else:
        run_once(output_dir=args.output)


if __name__ == '__main__':
    main()
