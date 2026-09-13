#!/usr/bin/env python3
"""Build magazine surfaces from the existing post cards and article metadata.

No second post registry: continue adding cards to posts/index.html as before.
Weekly articles explicitly opt in with topda-series=market and topda-period.
Run after content changes; deployment also rebuilds so old publishing routines work.
"""
import argparse
from datetime import date
from html import escape, unescape
from html.parser import HTMLParser
from pathlib import Path
import re

SITE = Path(__file__).resolve().parents[1] / 'site'
GRID = re.compile(r'(<div class="cards-grid" id="postGrid">)(.*?)(\n  </div>)', re.S)
CARDS = re.compile(r'<a\b[^>]*class="card"[^>]*>.*?</a>', re.S)


class Metadata(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.meta = {}
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta':
            self.meta[attrs.get('name', attrs.get('property', ''))] = attrs.get('content', '')


def attr(source, key, default=''):
    match = re.search(r'\b' + re.escape(key) + r'="([^"]*)"', source)
    return unescape(match[1]) if match else default


def text(source, tag):
    match = re.search(fr'<{tag}\b[^>]*>(.*?)</{tag}>', source, re.S)
    return unescape(re.sub('<[^>]+>', '', match[1])).strip() if match else ''


def load_posts(hub, site=SITE):
    grid = GRID.search(hub)
    if not grid:
        raise ValueError('postGrid not found')
    posts, seen = [], set()
    for card in CARDS.findall(grid[2]):
        href = attr(card.split('>')[0], 'href')
        if not re.fullmatch(r'[a-z0-9-]+\.html', href) or href == 'index.html' or href in seen:
            raise ValueError(f'Invalid or duplicate post URL: {href}')
        seen.add(href)
        source = (site / 'posts' / href).read_text(encoding='utf-8')
        meta = Metadata(source).meta
        if 'noindex' in meta.get('robots', '').lower():
            continue
        series = meta.get('topda-series', 'guide')
        if series not in ('guide', 'market'):
            raise ValueError(f'{href}: unknown topda-series {series}')
        # Publication, not modification: editing an old article must not make it "new".
        published = re.search(r'"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})', source)
        if not published:
            published = re.search(r'게시\s*<time datetime="(\d{4}-\d{2}-\d{2})', source)
        published = published[1] if published else ''
        if published:
            date.fromisoformat(published)
        period = meta.get('topda-period', '').strip()
        if series == 'market' and (not period or not published):
            raise ValueError(f'{href}: weekly analysis requires publication date and topda-period')
        title, description = text(card, 'h3'), text(card, 'p')
        if not title or not description:
            raise ValueError(f'{href}: missing card title/description')
        image = meta.get('og:image', '').strip()
        if image.startswith('https://topda.kr/'):
            image = image.removeprefix('https://topda.kr/')
        else:
            image = ''
        posts.append(dict(href=href, title=title, description=description,
                          category=attr(card.split('>')[0], 'data-cat'), series=series,
                          published=published, period=period, image=image, card=card))
    # Stable same-day tie break, independent of file modification time or card insertion.
    return sorted(posts, key=lambda p: (-int(p['published'].replace('-', '') or '0'), p['href']))


def stamp(post):
    if not post['published']:
        return ''
    return f'<time class="editorial-date" datetime="{post["published"]}">발행 {post["published"]}</time>'


def story(post, prefix, root, featured=False):
    label = '주간 리포트' if post['series'] == 'market' else '실용 포스트'
    media = ''
    if featured and post['image']:
        media = (f'<span class="editorial-story-media"><img src="{root}{escape(post["image"])}" '
                 f'alt="" width="1200" height="630" loading="lazy"></span>')
    return (f'<a class="editorial-story{" editorial-story-featured" if featured else ""}" href="{prefix}{post["href"]}">'
            f'{media}<span class="editorial-story-body"><span class="editorial-label">{label} · {escape(post["category"])}</span>'
            f'<h3>{escape(post["title"])}</h3><p>{escape(post["description"])}</p>{stamp(post)}</span></a>')


def market_panel(posts, prefix, root):
    markets = [p for p in posts if p['series'] == 'market']
    content = ('<p class="editorial-market-intro">가격·거래·전세를 한 흐름으로 읽고, 다음 주에 확인할 지표까지 짚습니다.</p>')
    if markets:
        post = markets[0]
        content = (f'<p class="editorial-market-period">분석 기간 {escape(post["period"])}</p>'
                   f'<h3><a href="{prefix}{post["href"]}">{escape(post["title"])}</a></h3>'
                   f'<p>{escape(post["description"])}</p>{stamp(post)}'
                   f'<a class="editorial-market-primary" href="{prefix}index.html?series=market#archiveHeading">리포트 모아보기 →</a>')
    return ('<aside class="editorial-market" aria-label="주간 시장 리포트">'
            '<div><p class="editorial-eyebrow">WEEKLY MARKET</p><h2>주간 시장 리포트</h2>' + content + '</div>'
            '<div class="editorial-market-tools">'
            f'<a href="{root}calculators/market-trends.html"><span>PRICE</span> 지역 시세</a>'
            f'<a href="{root}calculators/transactions.html"><span>DEALS</span> 실거래가</a>'
            '</div>' + ('' if markets else '<p class="editorial-status">첫 리포트를 준비하고 있습니다.</p>') + '</aside>')


def magazine_shell(posts, prefix, root):
    guides = [post for post in posts if post['series'] == 'guide'][:3]
    latest = ''.join(story(post, prefix, root, index == 0)
                     for index, post in enumerate(guides))
    return ('<div class="editorial-shell"><div class="editorial-layout">'
            '<div class="editorial-stories" aria-label="최신 실용 포스트">' + latest + '</div>' +
            market_panel(posts, prefix, root) + '</div></div>')


def replace_block(source, name, content):
    start, end = f'<!-- editorial:{name}:start -->', f'<!-- editorial:{name}:end -->'
    if source.count(start) != 1 or source.count(end) != 1:
        raise ValueError(f'Expected one {name} marker pair')
    return re.sub(re.escape(start) + r'.*?' + re.escape(end),
                  lambda _: start + '\n' + content + '\n' + end, source, flags=re.S)


def render(home, hub, site=SITE):
    posts = load_posts(hub, site)
    if not posts:
        raise ValueError('Reading hub requires at least one published post')
    cards = []
    for post in posts:
        card = re.sub(r' data-(?:series|published)="[^"]*"', '', post['card'])
        card = re.sub(r'\s*<time\b[^>]*>.*?</time>', '', card, flags=re.S)
        card = card.replace('class="card"', f'class="card" data-series="{post["series"]}" data-published="{post["published"]}"', 1)
        card = card.replace('</a>', stamp(post) + '\n    </a>')
        cards.append(card)
    hub = GRID.sub(lambda m: m[1] + '\n    ' + '\n    '.join(cards) + m[3], hub)
    for name, prefix, root in [('home', 'posts/', ''), ('hub', '', '../')]:
        content = magazine_shell(posts, prefix, root)
        if name == 'home':
            content = ('<section class="editorial-section" aria-labelledby="homeReadingTitle"><div class="container">'
                       '<header class="editorial-masthead"><div><p class="editorial-eyebrow">TOPDA MAGAZINE</p>'
                       '<h2 id="homeReadingTitle">톺다 매거진</h2></div>'
                       '<p>생활의 질문은 구체적으로, 시장의 변화는 차분하게.</p>'
                       '<a href="posts/index.html">모든 포스트 →</a></header>' + content + '</div></section>')
            home = replace_block(home, name, content)
        else:
            hub = replace_block(hub, name, '<section aria-label="이번 호">' + content + '</section>')
    return home, hub


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    paths = [SITE / 'index.html', SITE / 'posts/index.html']
    before = [p.read_text(encoding='utf-8') for p in paths]
    after = render(*before)
    changed = [p for p, old, new in zip(paths, before, after) if old != new]
    if args.check and changed:
        raise SystemExit('Stale reading surfaces: run python _meta/build_editorial.py')
    if not args.check:
        for path, output in zip(paths, after):
            path.write_text(output, encoding='utf-8')
    print(f'Editorial surfaces OK ({len(load_posts(after[1]))} posts; {len(changed)} changed files)')


if __name__ == '__main__':
    main()
