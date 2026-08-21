export type Product = {
  id: string;
  slug: string;
  name: string;
  category: "Hair Care" | "Skin Care" | "Wellness";
  price: number;
  compareAt?: number;
  image: string;
  short: string;
  description: string;
  benefits: string[];
  sizes: string[];
  featured?: boolean;
};

export const products: Product[] = [
  {
    id: "NB-HR-101",
    slug: "hibiscus-growth-oil",
    name: "Hibiscus Growth Oil",
    category: "Hair Care",
    price: 399,
    compareAt: 499,
    image: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85",
    short: "Cold-infused hibiscus, bhringraj and curry leaf oil.",
    description: "A lightweight weekly scalp ritual made with botanical oils traditionally used to nourish roots and soften dry lengths.",
    benefits: ["Nourishes dry scalp", "Adds natural shine", "Suitable for weekly use"],
    sizes: ["100 ml", "200 ml"],
    featured: true
  },
  {
    id: "NB-HR-102",
    slug: "rosemary-scalp-mist",
    name: "Rosemary Scalp Mist",
    category: "Hair Care",
    price: 299,
    compareAt: 349,
    image: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=900&q=85",
    short: "A refreshing, non-sticky rosemary and mint mist.",
    description: "An easy daily mist for refreshed roots between wash days. The fine spray feels light and leaves no oily residue.",
    benefits: ["Non-sticky finish", "Cooling scalp feel", "Easy daily routine"],
    sizes: ["100 ml"],
    featured: true
  },
  {
    id: "NB-SK-201",
    slug: "saffron-glow-serum",
    name: "Saffron Glow Serum",
    category: "Skin Care",
    price: 449,
    compareAt: 549,
    image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=900&q=85",
    short: "A silky saffron and rosehip evening serum.",
    description: "A balanced facial serum designed to seal in moisture and support a soft, luminous-looking complexion.",
    benefits: ["Supports skin barrier", "Soft dewy finish", "Small-batch botanical blend"],
    sizes: ["30 ml"],
    featured: true
  },
  {
    id: "NB-SK-202",
    slug: "turmeric-cloud-cleanser",
    name: "Turmeric Cloud Cleanser",
    category: "Skin Care",
    price: 279,
    image: "https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=900&q=85",
    short: "Low-foam cleanser with turmeric and oat extract.",
    description: "A gentle everyday cleanser that removes daily buildup without leaving skin feeling tight or stripped.",
    benefits: ["Low-foam formula", "Gentle daily cleanse", "Comfortable after-rinse feel"],
    sizes: ["100 ml"],
    featured: true
  },
  {
    id: "NB-WL-301",
    slug: "moringa-daily-blend",
    name: "Moringa Daily Blend",
    category: "Wellness",
    price: 349,
    compareAt: 399,
    image: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=900&q=85",
    short: "Pure moringa leaf powder for everyday recipes.",
    description: "Finely milled moringa leaf powder with no added flavours. Mix into smoothies or meals as part of a balanced diet.",
    benefits: ["Single ingredient", "No added sugar", "Resealable pouch"],
    sizes: ["150 g"],
    featured: true
  },
  {
    id: "NB-SK-203",
    slug: "rose-water-toner",
    name: "Rose Water Toner",
    category: "Skin Care",
    price: 229,
    image: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=900&q=85",
    short: "Steam-distilled rose water in a fine facial mist.",
    description: "A simple rose water mist that refreshes the face after cleansing and throughout warm days.",
    benefits: ["Alcohol-free", "Fine facial mist", "Travel-friendly bottle"],
    sizes: ["100 ml"]
  }
];

export const categories = [
  { name: "Hair Care", copy: "Rooted in time-tested herbs.", accent: "#c9a86a" },
  { name: "Skin Care", copy: "Soft rituals for everyday glow.", accent: "#d98f70" },
  { name: "Wellness", copy: "Simple blends for daily balance.", accent: "#8da478" }
];
