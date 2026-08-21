export const catalog = new Map([
  ["NB-HR-101", { name: "Hibiscus Growth Oil", price: 399 }],
  ["NB-HR-102", { name: "Rosemary Scalp Mist", price: 299 }],
  ["NB-SK-201", { name: "Saffron Glow Serum", price: 449 }],
  ["NB-SK-202", { name: "Turmeric Cloud Cleanser", price: 279 }],
  ["NB-WL-301", { name: "Moringa Daily Blend", price: 349 }],
  ["NB-SK-203", { name: "Rose Water Toner", price: 229 }]
]);

export function priceItems(submittedItems) {
  return submittedItems.map(item => {
    const product = catalog.get(String(item.id));
    if (!product) throw new Error(`Unknown product: ${item.id}`);
    return { id: String(item.id), name: product.name, price: product.price, quantity: Number(item.quantity) };
  });
}
