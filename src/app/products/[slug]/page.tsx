import Link from "next/link";
import { notFound } from "next/navigation";
import { products } from "@/lib/products";

export function generateStaticParams() { return products.map(product => ({ slug: product.slug })); }

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = products.find(item => item.slug === slug);
  if (!product) notFound();
  return <main className="product-page"><div className="product-page-nav shell"><Link href="/">← Back to shop</Link><Link href="/" className="brand"><span className="brand-mark">N</span><span>NILA <small>BOTANICS</small></span></Link><span>{product.id}</span></div><div className="product-detail shell"><div className="product-detail-image"><img src={product.image} alt={product.name} /></div><div className="product-detail-copy"><p className="eyebrow">{product.category}</p><h1>{product.name}</h1><p className="product-detail-price">₹{product.price} {product.compareAt && <s>₹{product.compareAt}</s>}</p><p>{product.description}</p><ul>{product.benefits.map(benefit => <li key={benefit}>✓ {benefit}</li>)}</ul><label>Size<select>{product.sizes.map(size => <option key={size}>{size}</option>)}</select></label><button className="primary-button">Add to bag →</button><div className="product-note"><strong>Care note</strong><p>Patch test topical products before first use. Product descriptions are not medical advice.</p></div></div></div></main>;
}
