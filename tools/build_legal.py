"""Builds the website's legal pages (privacy.html, terms.html) from one template so they share
the main site's header, footer, fonts and brand styles (style.css). Edit the SECTIONS below and
re-run:  python3 tools/build_legal.py"""
import re, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSS_VERSION = re.search(r'style\.css\?v=([0-9a-z]+)', (ROOT / 'index.html').read_text()).group(1)
WA = '919544146751'

PAGES = {
  'privacy.html': {
    'title': 'Privacy Policy',
    'desc': 'You & Me Privacy Policy — what we collect, why, and how it is protected.',
    'updated': '4 September 2026',
    'intro': 'You &amp; Me (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates officialyouandme.in. This policy explains what personal information we collect when you use the site, why we collect it, and how it&rsquo;s handled.',
    'sections': [
      ('collect', 'Information we collect', '''<ul>
<li><strong>Account &amp; order details</strong> &mdash; name, phone number, email, and delivery address you provide when creating an account, checking out, or contacting us.</li>
<li><strong>Order history</strong> &mdash; items purchased, order status, and delivery tracking events, so you can view your orders and we can fulfil them.</li>
<li><strong>Payment</strong> &mdash; payments are processed by our payment partner, <a href="https://www.cashfree.com" target="_blank" rel="noopener">Cashfree Payments</a>. We do not receive or store your card, UPI, or netbanking credentials &mdash; only the payment status and a transaction reference are shared back to us.</li>
<li><strong>Delivery</strong> &mdash; your name, phone number, and address are shared with our courier partners (Delhivery, Shiprocket) solely to deliver your order, and with the courier&rsquo;s delivery executive as needed for that specific delivery.</li>
<li><strong>Usage data</strong> &mdash; basic technical data (browser type, pages visited) collected automatically to keep the site working correctly and secure.</li>
</ul>'''),
      ('use', 'How we use your information', '''<ul>
<li>To process and deliver your orders, and to keep you updated on their status.</li>
<li>To respond to support requests (including via WhatsApp).</li>
<li>To send order-related communications, and &mdash; only if you subscribe &mdash; occasional newsletter emails, which you can unsubscribe from at any time via the link in every email.</li>
<li>To detect and prevent fraud or abuse of the site.</li>
</ul>'''),
      ('share', 'Who we share it with', '<p>We do not sell your personal information. We share it only with the service providers needed to run the store: Supabase (database &amp; account hosting), Cashfree (payments), and our courier partners (delivery). Each is contractually/technically limited to using your data only to provide that service to us.</p>'),
      ('choices', 'Your choices', '''<ul>
<li>You can view and update your saved addresses and account details from My Account.</li>
<li>You can unsubscribe from newsletter emails at any time using the link at the bottom of any newsletter email.</li>
<li>To request deletion of your account or data, contact us using the details below.</li>
</ul>'''),
      ('security', 'Data security', '<p>Your data is stored with access controls (row-level security) restricting it to your own account and to store staff who need it to fulfil orders. Payment details are never stored on our servers &mdash; that is handled entirely by Cashfree.</p>'),
      ('children', 'Children&rsquo;s products', None),  # filled from the existing page below
      ('changes', 'Changes to this policy', '<p>We may update this policy as the site evolves. The &ldquo;Last updated&rdquo; date above will reflect the latest revision.</p>'),
    ],
  },
  'terms.html': {
    'title': 'Terms &amp; Conditions',
    'desc': 'You & Me Terms & Conditions — orders, payment, shipping and our no-returns policy.',
    'updated': '28 September 2026',
    'intro': 'These terms apply to orders placed on officialyouandme.in. By placing an order, you agree to them.',
    'sections': [
      ('orders', 'Orders &amp; payment', '<p>Orders placed through this site are confirmed automatically once payment succeeds. Payments are processed securely by our payment partner, Cashfree &mdash; we accept UPI, credit/debit cards, netbanking and more.</p>'),
      ('pricing', 'Pricing, stock &amp; delivery charges', '<p>Pricing, stock, and delivery charges are calculated at checkout and are final at that point. Orders over &#8377;999 ship free; any delivery charge on smaller orders is shown before you pay.</p>'),
      ('shipping', 'Shipping', '<p>We ship across India through our courier partners. You can check delivery to your PIN code before ordering, and track your order from My Orders once it ships. <a href="/#home?info=shipping">Shipping information</a></p>'),
      ('returns', 'Returns, exchanges &amp; refunds', '<p><strong>We do not currently accept returns or exchanges, and all sales are final.</strong> Please check each product&rsquo;s Size Guide before ordering. If there&rsquo;s a problem with your order, message us on WhatsApp with your Order ID.</p>'),
      ('products', 'Product colours', '<p>Product colours may vary slightly from what you see on screen.</p>'),
      ('privacy', 'Your privacy', '<p>How we handle your personal information is described in our <a href="privacy.html">Privacy Policy</a>.</p>'),
    ],
  },
}

# Keep the existing, already-published "Children's products" paragraph verbatim.
old = (ROOT / 'privacy.html').read_text()
m = re.search(r"<h2>Children's products</h2>\s*(<p>.*?</p>)", old, re.S)
children = m.group(1) if m else None
for i, sec in enumerate(PAGES['privacy.html']['sections']):
    if sec[0] == 'children':
        if children: PAGES['privacy.html']['sections'][i] = (sec[0], sec[1], children)
        elif (ROOT / 'privacy.html').exists() and 'legal-article' in old:
            m2 = re.search(r'id="children".*?</h2>\s*(<p>.*?</p>)', old, re.S)
            PAGES['privacy.html']['sections'][i] = (sec[0], sec[1], m2.group(1))

NAV = [('kids', 'Kids Wear'), ('new-arrivals', 'New Arrivals'), ('family', 'Family Wear'), ('couples', 'Couple Sets'), ('about', 'About Us'), ('contact', 'Contact Us')]

def page(filename, p):
    toc = ''.join('<li><a href="#%s">%s</a></li>' % (sid, t) for sid, t, _ in p['sections'])
    body = ''.join('<section class="legal-section" id="%s"><h2>%s</h2>%s</section>' % (sid, t, c) for sid, t, c in p['sections'])
    other = 'terms.html' if filename == 'privacy.html' else 'privacy.html'
    other_t = 'Terms &amp; Conditions' if filename == 'privacy.html' else 'Privacy Policy'
    plain_title = html.unescape(p['title'])
    return f'''<!DOCTYPE html>
<!-- Generated by tools/build_legal.py — edit that file, not this one. -->
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{p['title']} | You &amp; Me</title>
<meta name="description" content="{html.escape(p['desc'])}">
<link rel="canonical" href="https://officialyouandme.in/{filename}">
<meta name="theme-color" content="#FDF6EF">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css?v={CSS_VERSION}">
</head>
<body class="legal-page" data-view="legal">
<div class="announcement-bar"><p>&#10084; FREE SHIPPING on orders over &#8377;999</p></div>
<header class="site-header" id="siteHeader">
  <div class="header-inner">
    <a href="/" class="navbar-brand"><img src="/images/logo.png" alt="You &amp; Me" class="navbar-brand-logo" width="168" height="56"></a>
    <nav class="main-nav" id="mainNav" aria-label="Primary"><ul>
      <li><a href="/">Home</a></li>
      {''.join('<li><a href="/#%s">%s</a></li>' % (r, t) for r, t in NAV)}
    </ul></nav>
    <div class="header-icons">
      <a class="btn btn-primary btn-sm legal-shop-btn" href="/#all">Shop now</a>
      <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation" aria-expanded="false"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>

<main class="legal-main">
  <div class="legal-hero">
    <div class="legal-inner">
      <nav class="breadcrumb legal-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">&#8250;</span><span>Legal</span><span aria-hidden="true">&#8250;</span><span>{p['title']}</span></nav>
      <span class="eyebrow">Legal</span>
      <h1>{p['title']}</h1>
      <p class="legal-updated">Last updated: {p['updated']}</p>
    </div>
  </div>
  <div class="legal-inner legal-layout">
    <aside class="legal-toc" aria-label="On this page">
      <p class="legal-toc-title">On this page</p>
      <ol>{toc}</ol>
      <div class="legal-toc-other"><a href="{other}">{other_t} &#8594;</a></div>
    </aside>
    <article class="legal-article">
      <p class="legal-intro">{p['intro']}</p>
      {body}
      <div class="legal-contact">
        <div><strong>Questions?</strong><span>We&rsquo;re happy to help &mdash; message us any time.</span></div>
        <a class="btn btn-primary" href="https://wa.me/{WA}" target="_blank" rel="noopener">Chat on WhatsApp</a>
      </div>
    </article>
  </div>
</main>

<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-columns">
      <div class="footer-col footer-brand">
        <a href="/" class="footer-logo-link"><img class="footer-logo" src="/images/logo.png" alt="You &amp; Me"></a>
        <p class="footer-tagline">Together in every style</p>
        <p class="footer-brandline"><span class="c-blue">Kids</span> &bull; <span class="c-beige">Family</span> &bull; <span class="c-coral">Couples</span></p>
      </div>
      <div class="footer-col"><h4>Shop</h4><ul>
        <li><a href="/#kids">Kids Wear</a></li><li><a href="/#new-arrivals">New Arrivals</a></li><li><a href="/#family">Family Wear</a></li><li><a href="/#couples">Couple Sets</a></li><li><a href="/#all">View All Products</a></li>
      </ul></div>
      <div class="footer-col"><h4>Help</h4><ul>
        <li><a href="https://wa.me/{WA}" target="_blank" rel="noopener">WhatsApp Us</a></li>
        <li><a href="/#home?info=shipping">Shipping Information</a></li><li><a href="/#home?info=returns">Return Policy</a></li>
        <li><a href="/#home?info=sizeGuide">Size Guide</a></li><li><a href="/#home?info=faq">FAQ</a></li><li><a href="/#home?info=orderHelp">Order Help</a></li>
      </ul></div>
      <div class="footer-col"><h4>About You &amp; Me</h4><ul>
        <li><a href="/#about">Our Story</a></li><li><a href="/privacy.html">Privacy Policy</a></li><li><a href="/terms.html">Terms &amp; Conditions</a></li>
      </ul></div>
      <div class="footer-col footer-connect"><h4>Stay Connected</h4>
        <div class="footer-social"><a class="footer-whatsapp" href="https://wa.me/{WA}" target="_blank" rel="noopener"><span>Chat on WhatsApp</span></a></div>
      </div>
    </div>
    <div class="footer-bottom"><p>&copy; 2026 You &amp; Me. All Rights Reserved.</p></div>
  </div>
</footer>
<script>
  (function () {{
    var t = document.getElementById('navToggle'), n = document.getElementById('mainNav');
    t.addEventListener('click', function () {{ var o = n.classList.toggle('open'); t.setAttribute('aria-expanded', o); }});
    var links = document.querySelectorAll('.legal-toc a[href^="#"]');
    var io = 'IntersectionObserver' in window && new IntersectionObserver(function (es) {{
      es.forEach(function (e) {{ if (e.isIntersecting) links.forEach(function (a) {{ a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id); }}); }});
    }}, {{ rootMargin: '-30% 0px -60% 0px' }});
    if (io) document.querySelectorAll('.legal-section').forEach(function (s) {{ io.observe(s); }});
  }})();
</script>
</body>
</html>
'''

for fn, p in PAGES.items():
    assert all(c for _, _, c in p['sections']), fn + ': missing section content'
    (ROOT / fn).write_text(page(fn, p))
    print('wrote', fn)
