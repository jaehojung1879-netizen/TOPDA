import tempfile
import unittest
from pathlib import Path
from build_editorial import SITE, load_posts, render


class EditorialTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.site = Path(self.temp.name)
        (self.site / 'posts').mkdir()
        self.home = '<!-- editorial:home:start --><!-- editorial:home:end -->'
        self.hub = '<!-- editorial:hub:start --><!-- editorial:hub:end -->\n<div class="cards-grid" id="postGrid">{cards}\n  </div>'

    def article(self, slug, published='2026-09-01', meta=''):
        (self.site / 'posts' / slug).write_text(
            f'<meta name="description" content="설명">{meta}'
            f'<script type="application/ld+json">{{"datePublished":"{published}","dateModified":"2099-01-01"}}</script>',
            encoding='utf-8')
        return f'<a class="card" data-cat="매매" href="{slug}"><h3>제목 &amp; 질문</h3><p>요약</p></a>'

    def test_existing_inventory_and_idempotence(self):
        before = [(SITE / f).read_text(encoding='utf-8') for f in ('index.html', 'posts/index.html')]
        first = render(*before)
        self.assertEqual(first, render(*first))
        self.assertEqual(len(load_posts(before[1])), len(load_posts(first[1])))
        self.assertIn('href="posts/index.html" class="cat-tile cat-tile-editorial"', first[0])
        self.assertLess(first[0].index('cat-tile-editorial'), first[0].index('categories/sale.html'))
        self.assertIn('<h3>매거진</h3>', first[0])
        home_block = first[0].split('<!-- editorial:home:start -->', 1)[1].split('<!-- editorial:home:end -->', 1)[0]
        self.assertEqual(home_block.count('<a class="editorial-story"'), 1)
        self.assertEqual(home_block.count('class="editorial-weekly-brief"'), 1)
        self.assertIn('새로 나온 포스트', home_block)
        self.assertLess(first[0].index('editorial:home:start'), first[0].index('<!-- ===== Tools: calculators'))

    def test_publication_not_modification_order(self):
        cards = self.article('old.html') + self.article('new.html', '2026-09-10')
        posts = load_posts(self.hub.format(cards=cards), self.site)
        self.assertEqual([p['href'] for p in posts], ['new.html', 'old.html'])

    def test_same_date_ties_are_deterministic(self):
        a, b = self.article('a.html'), self.article('b.html')
        self.assertEqual(load_posts(self.hub.format(cards=a+b), self.site), load_posts(self.hub.format(cards=b+a), self.site))

    def test_weekly_series_appears_automatically(self):
        card = self.article('weekly.html', meta='<meta name="topda-series" content="market"><meta name="topda-period" content="2026.09.01~09.06">')
        home, hub = render(self.home, self.hub.format(cards=card), self.site)
        self.assertIn('data-series="market"', hub)
        self.assertIn('2026.09.01~09.06', home)
        self.assertNotIn('첫 분석 글을 준비', home)
        self.assertIn('href="posts/weekly.html"', home)
        self.assertIn('주간 브리핑', home)

    def test_market_category_does_not_imply_weekly_series(self):
        card = self.article('guide.html').replace('data-cat="매매"', 'data-cat="시장·투자"')
        self.assertEqual(load_posts(self.hub.format(cards=card), self.site)[0]['series'], 'guide')

    def test_weekly_requires_period(self):
        card = self.article('weekly.html', meta='<meta name="topda-series" content="market">')
        with self.assertRaisesRegex(ValueError, 'requires'):
            load_posts(self.hub.format(cards=card), self.site)

    def test_invalid_series_rejected(self):
        card = self.article('invalid.html', meta='<meta name="topda-series" content="typo">')
        with self.assertRaisesRegex(ValueError, 'unknown'):
            load_posts(self.hub.format(cards=card), self.site)

    def test_noindex_excluded(self):
        cards = self.article('hidden.html', meta='<meta name="robots" content="noindex">') + self.article('visible.html')
        self.assertEqual(len(load_posts(self.hub.format(cards=cards), self.site)), 1)

    def test_duplicate_rejected(self):
        card = self.article('duplicate.html')
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            load_posts(self.hub.format(cards=card+card), self.site)

    def test_missing_target_rejected(self):
        card = '<a class="card" href="missing.html"><h3>없음</h3><p>요약</p></a>'
        with self.assertRaises(FileNotFoundError):
            load_posts(self.hub.format(cards=card), self.site)

    def test_escaping_and_no_weekly_placeholder_article(self):
        card = self.article('guide.html')
        home, hub = render(self.home, self.hub.format(cards=card), self.site)
        self.assertIn('제목 &amp; 질문', home)
        self.assertIn('첫 브리핑을 준비하고 있습니다', home)
        self.assertNotIn('data-series="market"', hub)
        self.assertEqual(len(load_posts(hub, self.site)), 1)


if __name__ == '__main__':
    unittest.main()
