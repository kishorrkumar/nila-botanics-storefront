import Storefront from "@/components/storefront";
import { products, categories } from "@/lib/products";

export default function Home() {
  return <Storefront products={products} categories={categories} />;
}
