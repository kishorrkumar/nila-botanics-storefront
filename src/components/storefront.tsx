"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import type { Product } from "@/lib/products";

type Category = { name: string; copy: string; accent: string };
type CartItem = Product & { quantity: number };

const faqs = [
  ["How quickly do you dispatch orders?", "Orders are normally packed within one to two business days. Delivery across India generally takes three to seven business days after dispatch."],
  ["Are Nila Botanics products natural?", "We prioritise botanical ingredients and clearly disclose every formula. Always review the ingredient label and patch test a new topical product."],
  ["How do I choose the right routine?", "Use the routine finder below or contact our care team. We will ask about your goal, preferences and sensitivities before suggesting a simple routine."],
  ["Can I return an item?", "Damaged or incorrect items are eligible for support when reported within forty-eight hours with an unboxing video and order details."],
  ["Where can I track my order?", "Your dispatch message includes a tracking link. The future SnapServe assistant can also retrieve order status through the prepared API endpoint."]
];

export default function Storefront({ products, categories }: { products: Product[]; categories: Category[] }) {
  const [active, setActive] = useState("All");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [leadState, setLeadState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const visibleProducts = useMemo(() => products.filter(product => {
    const categoryMatch = active === "All" || product.category === active;
    const searchMatch = product.name.toLowerCase().includes(query.toLowerCase());
    return categoryMatch && searchMatch;
  }), [active, products, query]);

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  function addToCart(product: Product) {
    setCart(current => {
      const existing = current.find(item => item.id === product.id);
      return existing
        ? current.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { ...product, quantity: 1 }];
    });
    setCartOpen(true);
  }

  function updateQuantity(id: string, change: number) {
    setCart(current => current
      .map(item => item.id === id ? { ...item, quantity: item.quantity + change } : item)
      .filter(item => item.quantity > 0));
  }

  async function submitRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeadState("loading");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/mcp/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, source: "routine-finder" })
      });
      if (!response.ok) throw new Error("Unable to submit");
      setLeadState("done");
      event.currentTarget.reset();
    } catch {
      setLeadState("error");
    }
  }

  return (
    <main>
      <div className="announcement">Free delivery above ₹799 · Small-batch care · Made in India</div>
      <header className="header shell">
        <button className="icon-button mobile-only" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu">☰</button>
        <Link href="/" className="brand" aria-label="Nila Botanics home">
          <span className="brand-mark">N</span>
          <span>NILA <small>BOTANICS</small></span>
        </Link>
        <nav className={menuOpen ? "nav open" : "nav"}>
          <a href="#shop">Shop</a><a href="#collections">Collections</a><a href="#story">Our story</a><a href="#faq">FAQs</a><a href="#contact">Contact</a>
        </nav>
        <div className="header-actions">
          <label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" aria-label="Search products" /></label>
          <button className="cart-button" onClick={() => setCartOpen(true)}>Bag <span>{itemCount}</span></button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy shell">
          <p className="eyebrow">Botanical care, thoughtfully made</p>
          <h1>Rooted in nature.<br /><em>Made for your rhythm.</em></h1>
          <p>Simple hair, skin and wellness rituals inspired by South Indian botanicals and made for modern everyday life.</p>
          <a className="primary-button" href="#shop">Explore bestsellers <span>→</span></a>
        </div>
        <div className="hero-image" role="img" aria-label="Botanical skincare bottles and leaves" />
        <div className="hero-note"><b>01</b><span>Small batches<br />Freshly prepared</span></div>
      </section>

      <section className="promise-grid shell" aria-label="Brand promises">
        <div><b>✦</b><span><strong>Ingredient conscious</strong>Thoughtful, clearly labelled formulas</span></div>
        <div><b>◌</b><span><strong>Routine friendly</strong>Simple care that fits real life</span></div>
        <div><b>♧</b><span><strong>Made in India</strong>Small batches, locally crafted</span></div>
        <div><b>↺</b><span><strong>Here to help</strong>Human care before and after purchase</span></div>
      </section>

      <section className="shop-section shell" id="shop">
        <div className="section-heading">
          <div><p className="eyebrow">Customer favourites</p><h2>Everyday essentials</h2></div>
          <div className="filter-row">
            {["All", "Hair Care", "Skin Care", "Wellness"].map(category => <button className={active === category ? "active" : ""} key={category} onClick={() => setActive(category)}>{category}</button>)}
          </div>
        </div>
        <div className="product-grid">
          {visibleProducts.map(product => (
            <article className="product-card" key={product.id}>
              <Link href={`/products/${product.slug}`} className="product-image-wrap">
                {product.compareAt && <span className="sale">SAVE {Math.round((1 - product.price / product.compareAt) * 100)}%</span>}
                <img src={product.image} alt={product.name} loading="lazy" />
                <span className="view-product">View details</span>
              </Link>
              <p className="product-category">{product.category}</p>
              <h3><Link href={`/products/${product.slug}`}>{product.name}</Link></h3>
              <p className="product-description">{product.short}</p>
              <div className="product-buy"><p><strong>₹{product.price}</strong>{product.compareAt && <s>₹{product.compareAt}</s>}</p><button onClick={() => addToCart(product)} aria-label={`Add ${product.name} to bag`}>+</button></div>
            </article>
          ))}
        </div>
        {visibleProducts.length === 0 && <p className="empty-state">No products found. Try a different search.</p>}
      </section>

      <section className="collections shell" id="collections">
        <div className="section-heading"><div><p className="eyebrow">Build your ritual</p><h2>Shop by collection</h2></div></div>
        <div className="collection-grid">
          {categories.map((category, index) => <button key={category.name} onClick={() => { setActive(category.name); document.querySelector("#shop")?.scrollIntoView({ behavior: "smooth" }); }} style={{ "--accent": category.accent } as React.CSSProperties}>
            <span>0{index + 1}</span><div><h3>{category.name}</h3><p>{category.copy}</p></div><b>↗</b>
          </button>)}
        </div>
      </section>

      <section className="story" id="story">
        <div className="story-image" role="img" aria-label="Fresh herbs prepared for botanical care" />
        <div className="story-copy">
          <p className="eyebrow">Why Nila</p>
          <h2>Old wisdom,<br />clear modern care.</h2>
          <p>Nila means moon in Tamil—a reminder that good routines are gentle, consistent and unhurried. We translate familiar botanicals into uncomplicated products with transparent usage guidance.</p>
          <div className="story-stats"><span><strong>6</strong>starter rituals</span><span><strong>3</strong>care collections</span><span><strong>100%</strong>clear labels</span></div>
        </div>
      </section>

      <section className="routine shell" id="contact">
        <div>
          <p className="eyebrow">Personal routine help</p>
          <h2>Not sure where to begin?</h2>
          <p>Tell us your primary goal. Today our care team receives the request; later, your SnapServe voice agent can continue the same flow instantly.</p>
        </div>
        <form onSubmit={submitRoutine}>
          <label>Name<input name="name" required placeholder="Your name" /></label>
          <label>Phone<input name="phone" required inputMode="tel" placeholder="Your phone number" /></label>
          <label>Primary goal<select name="goal" required defaultValue=""><option value="" disabled>Choose one</option><option>Hair care</option><option>Skin care</option><option>Everyday wellness</option><option>Order support</option></select></label>
          <button className="primary-button" disabled={leadState === "loading"}>{leadState === "loading" ? "Sending…" : "Request routine help →"}</button>
          {leadState === "done" && <p className="form-success">Thank you—your request has been received.</p>}
          {leadState === "error" && <p className="form-error">Something went wrong. Please try again.</p>}
        </form>
      </section>

      <section className="testimonials shell">
        <p className="eyebrow">Community notes</p><h2>Kind words, real routines</h2>
        <div className="quote-grid"><blockquote>“The routine feels simple enough to actually follow. The mist is light, and I like that the directions are clear.”<cite>— Meera, Chennai</cite></blockquote><blockquote>“Beautiful packaging and genuinely helpful support when I wasn’t sure which product to start with.”<cite>— Aarthi, Coimbatore</cite></blockquote><blockquote>“The hair oil is now part of my Sunday routine. It washes out easily and leaves my lengths soft.”<cite>— Nandhini, Bengaluru</cite></blockquote></div>
      </section>

      <section className="faq shell" id="faq"><div><p className="eyebrow">Good to know</p><h2>Frequently asked questions</h2><p>Need something else? Email us and our care team will help.</p></div><div>{faqs.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></section>

      <footer><div className="footer-main shell"><div><Link href="/" className="brand brand-light"><span className="brand-mark">N</span><span>NILA <small>BOTANICS</small></span></Link><p>Gentle botanical rituals made in India.</p></div><div><h3>Explore</h3><a href="#shop">Shop</a><a href="#collections">Collections</a><a href="#story">Our story</a></div><div><h3>Help</h3><a href="#faq">FAQs</a><a href="#contact">Routine help</a><a href="mailto:hello@nilabotanics.in">Contact</a></div><div><h3>Follow the journey</h3><p>New rituals, ingredient stories and care notes.</p><div className="socials"><a href="#" aria-label="Instagram">ig</a><a href="#" aria-label="YouTube">yt</a><a href="#" aria-label="Facebook">fb</a></div></div></div><div className="footer-bottom shell"><span>© 2026 Nila Botanics</span><span>Privacy · Terms · Shipping · Returns</span></div></footer>

      <aside className={cartOpen ? "cart-drawer open" : "cart-drawer"} aria-hidden={!cartOpen}>
        <div className="cart-title"><h2>Your bag</h2><button onClick={() => setCartOpen(false)}>×</button></div>
        <div className="cart-items">{cart.length === 0 ? <div className="empty-cart"><span>♧</span><p>Your bag is waiting for a ritual.</p><button onClick={() => setCartOpen(false)}>Continue shopping</button></div> : cart.map(item => <div className="cart-item" key={item.id}><img src={item.image} alt="" /><div><h3>{item.name}</h3><p>₹{item.price}</p><div className="quantity"><button onClick={() => updateQuantity(item.id, -1)}>−</button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.id, 1)}>+</button></div></div></div>)}</div>
        {cart.length > 0 && <div className="cart-footer"><div><span>Subtotal</span><strong>₹{subtotal}</strong></div><p>Shipping and taxes calculated at checkout.</p><button className="primary-button">Proceed to checkout</button></div>}
      </aside>
      {cartOpen && <button className="overlay" onClick={() => setCartOpen(false)} aria-label="Close bag" />}
    </main>
  );
}
