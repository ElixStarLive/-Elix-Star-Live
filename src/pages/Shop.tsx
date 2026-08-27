import { useEffect, useState } from 'react';
import { ShoppingBag, ShoppingCart } from 'lucide-react';
import { createOrder, fetchProducts, type Product } from '../features/shop/shopApi';

export default function Shop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProducts().then(({ data }) => {
      if (cancelled) return;
      if (data) setProducts(data.products);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onBuy = async (product: Product) => {
    setBuying(product.id);
    setMessage(null);
    const { data, error } = await createOrder(product.id, 1);
    setBuying(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(`Order #${data?.id.slice(0, 8)} created for ${product.name}. Stripe checkout will be added next.`);
  };

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center gap-2">
        <ShoppingCart className="h-6 w-6" />
        <h1 className="text-fluid-xl font-bold">Shop</h1>
      </header>

      {message && (
        <p className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 text-fluid-sm text-center text-white/80">
          {message}
        </p>
      )}

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShoppingBag className="mb-4 h-12 w-12 text-white/30" />
          <p className="text-fluid-sm text-white/60">No products yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {products.map((product) => (
            <div key={product.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt="" className="mb-3 aspect-square w-full rounded-xl object-cover" />
              ) : (
                <div className="mb-3 flex aspect-square w-full items-center justify-center rounded-xl bg-white/10">
                  <ShoppingBag className="h-12 w-12 text-white/30" />
                </div>
              )}
              <h2 className="text-fluid-base font-bold">{product.name}</h2>
              <p className="text-fluid-sm text-white/60">{product.description}</p>
              <p className="mt-2 text-fluid-lg font-bold">£{product.priceGbp.toFixed(2)}</p>
              <p className="text-fluid-xs text-white/40">{product.stock} in stock</p>
              <button
                type="button"
                onClick={() => onBuy(product)}
                disabled={buying === product.id || product.stock <= 0}
                className="mt-3 w-full rounded-xl border border-white/40 bg-transparent py-2 text-fluid-sm font-bold disabled:opacity-60"
              >
                {buying === product.id ? '…' : product.stock > 0 ? 'Buy' : 'Out of stock'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
