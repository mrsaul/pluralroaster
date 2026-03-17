import { useState, useCallback } from "react";
import { useCart, MOCK_ORDERS, type Order } from "@/lib/store";
import LoginPage from "./LoginPage";
import CatalogPage from "./CatalogPage";
import CheckoutPage from "./CheckoutPage";
import OrderHistoryPage from "./OrderHistoryPage";
import AdminDashboard from "./AdminDashboard";
import { format } from "date-fns";

type View = "login" | "catalog" | "checkout" | "orders" | "admin";

const Index = () => {
  const [view, setView] = useState<View>("login");
  const [role, setRole] = useState<"client" | "admin">("client");
  const [orders, setOrders] = useState<Order[]>([]);
  const cart = useCart();

  const handleLogin = useCallback((r: "client" | "admin") => {
    setRole(r);
    setView(r === "admin" ? "admin" : "catalog");
  }, []);

  const handleLogout = useCallback(() => {
    setView("login");
    cart.clearCart();
  }, [cart]);

  const handleConfirmOrder = useCallback((deliveryDate: string) => {
    const newOrder: Order = {
      id: `ORD-${String(MOCK_ORDERS.length + orders.length + 1).padStart(3, "0")}`,
      items: cart.items,
      totalKg: cart.totalKg,
      totalPrice: cart.totalPrice,
      deliveryDate,
      status: "synced",
      sellsyId: `SY-${Math.floor(10000 + Math.random() * 90000)}`,
      createdAt: format(new Date(), "yyyy-MM-dd"),
    };
    setOrders((prev) => [newOrder, ...prev]);
    cart.clearCart();
    setView("catalog");
  }, [cart, orders.length]);

  switch (view) {
    case "login":
      return <LoginPage onLogin={handleLogin} />;
    case "catalog":
      return (
        <CatalogPage
          cart={cart}
          onCheckout={() => setView("checkout")}
          onViewOrders={() => setView("orders")}
          onLogout={handleLogout}
        />
      );
    case "checkout":
      return (
        <CheckoutPage
          items={cart.items}
          totalKg={cart.totalKg}
          totalPrice={cart.totalPrice}
          onBack={() => setView("catalog")}
          onConfirm={handleConfirmOrder}
        />
      );
    case "orders":
      return (
        <OrderHistoryPage
          orders={[...orders, ...MOCK_ORDERS]}
          onBack={() => setView("catalog")}
        />
      );
    case "admin":
      return <AdminDashboard orders={orders} onLogout={handleLogout} />;
    default:
      return null;
  }
};

export default Index;
