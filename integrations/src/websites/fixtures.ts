/**
 * ============================================================================
 * TEST / DEVELOPMENT DATA — NOT REAL BUSINESSES OR REAL WEBSITE CONTENT.
 * ============================================================================
 * Fabricated homepage HTML for fictional local-service businesses, used
 * only by the Website Agent's automated tests (Phase 7 master spec section
 * 12) via a stubbed `fetch` — no real network request is ever made against
 * any of these. Every company name, phone number, address, and testimonial
 * below is invented for testing purposes only and must never be presented
 * as a real business or real customer feedback.
 *
 * Covers the six scenarios the master spec requires, each isolating a
 * different combination of conversion/SEO strength so the Website Agent's
 * deterministic checks (agents/src/website/checks.ts) and the SEO Agent's
 * checks (agents/src/seo/checks.ts) can be exercised against realistic,
 * varied pages rather than one artificial "everything is broken" fixture.
 */

/** #1 — Strong conversion: clear CTA repeated, click-to-call, a contact form, trust signals, FAQs, and a "what happens next" explanation. */
export const STRONG_CONVERSION_HTML = `<!doctype html>
<html>
<head>
  <title>Emergency Plumbing Repair in Rivertown | Rivertown Plumbing Pros</title>
  <meta name="description" content="Rivertown Plumbing Pros offers 24/7 emergency plumbing repair serving Rivertown, ST. Licensed, insured, and guaranteed. Call now for a free estimate.">
  <link rel="canonical" href="https://rivertown-plumbing.example/">
  <meta name="robots" content="index, follow">
</head>
<body>
  <h1>Rivertown Plumbing Pros — Emergency Plumbing Repair in Rivertown</h1>
  <p>Fast, reliable plumbing repair for Rivertown homeowners so you can stop worrying about the leak and get back to your day.</p>
  <a href="tel:+12085550100">Call (208) 555-0100 Now</a>
  <a href="/quote">Get a Free Quote — No Obligation</a>
  <h2>Why Choose Us</h2>
  <p>We are licensed, insured, and offer a satisfaction guarantee on every job. With 15 years of experience serving Rivertown, our 5 star reviews speak for themselves.</p>
  <h2>What Happens Next</h2>
  <p>Step 1: Call or submit the form. Step 2: We schedule a same-day visit. Step 3: You get an upfront quote before any work begins.</p>
  <h2>Frequently Asked Questions</h2>
  <p>Do you offer financing? Yes — we accept all major credit cards and offer flexible payment plans.</p>
  <form action="/quote"><input name="name" placeholder="Your name"><input name="phone" placeholder="Phone"></form>
  <a href="/quote">Request Your Free Estimate</a>
  <a href="mailto:hello@rivertown-plumbing.example">Email Us</a>
</body>
</html>`;

/** #2 — Weak conversion: phone is only plain text (no tel: link), no form, no trust signals, vague next steps. */
export const WEAK_CONVERSION_HTML = `<!doctype html>
<html>
<head>
  <title>Plumbing Services | Blue Ridge Plumbing</title>
  <meta name="description" content="Blue Ridge Plumbing provides plumbing services in the Blue Ridge area.">
</head>
<body>
  <h1>Plumbing Services</h1>
  <p>Blue Ridge Plumbing offers a range of plumbing services including pipe repair, drain cleaning, and water heater installation.
  You can reach us at 208-555-0177 during business hours.</p>
  <h2>Our Services</h2>
  <p>Pipe repair. Drain cleaning. Water heater installation. Fixture replacement.</p>
</body>
</html>`;

/** #3 — Missing CTA: no call-to-action phrase, no phone, no form, no click-to-call — an informational page with no way to act. */
export const MISSING_CTA_HTML = `<!doctype html>
<html>
<head>
  <title>About Summit Electrical</title>
  <meta name="description" content="Information about Summit Electrical, an electrical contractor.">
</head>
<body>
  <h1>About Summit Electrical</h1>
  <p>Summit Electrical has been serving the region for many years. We work on residential and commercial electrical projects.
  Our team has experience with a variety of electrical systems and wiring configurations.</p>
  <h2>Our History</h2>
  <p>Founded by two electricians, the company has grown over time to serve more customers across the area.</p>
</body>
</html>`;

/** #4 — Weak service messaging: vague, generic copy that never clearly states what services are offered or who they're for. */
export const WEAK_SERVICE_MESSAGING_HTML = `<!doctype html>
<html>
<head>
  <title>Welcome | Golden Gate Home Services</title>
  <meta name="description" content="Golden Gate Home Services — quality you can trust.">
</head>
<body>
  <h1>Welcome to Golden Gate Home Services</h1>
  <p>We are dedicated to excellence and customer satisfaction. Our team works hard every day to bring you the best possible experience.
  Quality is our promise, and we stand behind everything we do.</p>
  <a href="/contact">Contact Us</a>
  <p>Call (208) 555-0133 to learn more about what we can do for you.</p>
</body>
</html>`;

/** #5 — Strong SEO, weak conversion: keyword-dense, well-structured for search, but no CTA, no phone, no form, no trust signals. */
export const STRONG_SEO_WEAK_CONVERSION_HTML = `<!doctype html>
<html>
<head>
  <title>Roof Repair &amp; Roof Replacement in Cedar Falls | Cedar Falls Roofing Experts</title>
  <meta name="description" content="Cedar Falls Roofing Experts provides roof repair and roof replacement services in Cedar Falls, ST and surrounding areas. Learn about our roofing process.">
  <link rel="canonical" href="https://cedar-falls-roofing.example/">
  <meta name="robots" content="index, follow">
</head>
<body>
  <h1>Roof Repair and Roof Replacement in Cedar Falls</h1>
  <h2>Roof Repair Services in Cedar Falls</h2>
  <p>Cedar Falls Roofing Experts specializes in roof repair for homes throughout Cedar Falls, ST. Common roof repair needs include
  shingle replacement, flashing repair, and leak diagnosis. Our roof repair process starts with a thorough inspection.</p>
  <h2>Roof Replacement Services in Cedar Falls</h2>
  <p>When roof repair is no longer sufficient, roof replacement may be the right choice. Cedar Falls Roofing Experts installs
  asphalt shingle, metal, and tile roofing systems for Cedar Falls homeowners.</p>
  <h2>Serving Cedar Falls and Nearby Communities</h2>
  <p>We serve Cedar Falls, Maple Heights, and Pinewood — all within our Cedar Falls service area.</p>
  <a href="/roof-repair">Learn More About Roof Repair</a>
  <a href="/roof-replacement">Learn More About Roof Replacement</a>
  <a href="/service-area">View Our Service Area</a>
</body>
</html>`;

/** #6 — Strong conversion, weak SEO: no title tag, no meta description, no H1 — but a conversion-focused landing page with phone/CTA/trust signals front and center. */
export const STRONG_CONVERSION_WEAK_SEO_HTML = `<!doctype html>
<html>
<head>
</head>
<body>
  <div>Piney Woods Pest Control</div>
  <p>Bugs gone today, guaranteed — or your money back.</p>
  <a href="tel:+12085550188">Call (208) 555-0188 Now</a>
  <a href="/quote">Get a Free Quote</a>
  <p>Licensed and insured. 5 star reviews from over 200 happy customers. Call now for same-day service.</p>
  <a href="tel:+12085550188">Tap to Call</a>
  <form action="/quote"><input name="name"></form>
</body>
</html>`;
