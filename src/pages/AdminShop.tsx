import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Package, ShoppingCart } from 'lucide-react';
import { createAdminProduct, fetchAdminProducts, fetchAdminShopOrders, type AdminProduct, type AdminShopOrder } from '../features/admin/adminApi';

export default function AdminShop() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [orders, setOrders] = useState<AdminShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([fetchAdminProducts(), fetchAdminShopOrders()]).then(([p, o]) => {
      if (p.data) setProducts(p.data.products);
      if (o.data) setOrders(o.data.orders);
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const { error } = await createAdminProduct({
      name: name.trim(),
      priceGbp: Number(price),
      stock: Number(stock),
    });
    if (error) return;
    setName('');
    setPrice('');
    setStock('');
    load();
  };

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/admin" className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-fluid-xl font-bold">Admin — Shop</h1>
      </header>

      <form onSubmit={onCreate} className="mb-4 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-fluid-base font-bold">New Product</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none"
          required
        />
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price GBP"
          step="0.01"
          min="0"
          className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none"
          required
        />
        <input
          type="number"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          placeholder="Stock"
          min="0"
          className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none"
          required
        />
        <button type="submit" className="w-full rounded-xl border border-white/40 bg-transparent py-2 text-fluid-sm font-bold">
          Add Product
        </button>
      </form>

      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : (
        <>
          <h2 className="mb-2 flex items-center gap-2 text-fluid-base font-bold">
            <Package className="h-5 w-5" /> Products
          </h2>
          <div className="mb-4 space-y-2">
            {products.map((p) => (
              <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="font-semibold text-white">{p.name}</p>
                <p className="text-fluid-sm text-white/60">£{p.priceGbp.toFixed(2)} · {p.stock} in stock</p>
              </div>
            ))}
            {products.length === 0 && <p className="text-white/60">No products.</p>}
          </div>

          <h2 className="mb-2 flex items-center gap-2 text-fluid-base font-bold">
            <ShoppingCart className="h-5 w-5" /> Orders
          </h2>
          <div className="space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="font-semibold text-white">{o.productName} × {o.quantity}</p>
                <p className="text-fluid-sm text-white/60">{o.username} · {o.status}</p>
                <p className="text-fluid-xs text-white/40">{new Date(o.createdAt).toLocaleString()}</p>
              </div>
            ))}
            {orders.length === 0 && <p className="text-white/60">No orders.</p>}
          </div>
        </>
      )}
    </div>
  );
}
