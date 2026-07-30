"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { downloadExcel } from "@/lib/admin/excel";
import { adminValueLabel, formatCell } from "@/lib/admin/format";
import { humanizeAdminError } from "@/lib/admin/messages";
import type { Lang } from "@/lib/admin/i18n";

type Row = Record<string, unknown>;
type SortMode = "newest" | "oldest" | "highest" | "lowest";

type OrderBreakdown = {
  items: Row[];
  subtotal: number | null;
  subtotalDerived: boolean;
  shipping: number | null;
  discount: number | null;
  fees: number | null;
  finalTotal: number | null;
  deliveryMethod: string;
  deliveryWeight: number | null;
  location: string;
};

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(source: Row, keys: string[]): number | null {
  for (const key of keys) {
    const value = finite(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function orderBreakdown(order: Row): OrderBreakdown {
  const snapshot = record(order.accepted_offer_snapshot);
  const offer = record(snapshot.offer);
  const items = rows(snapshot.items);
  const deliveryRows = rows(snapshot.delivery);
  const deliveryPricing = deliveryRows.map((item) => record(item.pricing_table));

  const storedSubtotal = finite(order.selected_subtotal_snapshot);
  const itemSubtotal = items.reduce((total, item) => total + (finite(item.line_total_snapshot) ?? 0), 0);
  const offerSubtotal = firstNumber(offer, ["total_price_snapshot", "subtotal", "items_total"]);
  const subtotal = storedSubtotal ?? (itemSubtotal > 0 ? itemSubtotal : offerSubtotal);

  const shippingValues = deliveryPricing
    .map((pricing) => firstNumber(pricing, ["delivery_cost", "shipping_cost", "price"]))
    .filter((value): value is number => value !== null);
  const shipping = shippingValues.length ? shippingValues.reduce((sum, value) => sum + value, 0) : firstNumber(snapshot, ["shipping_amount", "delivery_cost"]);
  const discount = firstNumber(snapshot, ["discount_amount", "discount_total"]) ?? firstNumber(offer, ["discount_amount", "discount_total"]);
  const fees = firstNumber(snapshot, ["fees_amount", "service_fee", "platform_fee"]) ?? firstNumber(offer, ["fees_amount", "service_fee", "platform_fee"]);
  const explicitFinal = firstNumber(snapshot, ["final_total", "grand_total", "total_after_discount"]) ?? firstNumber(offer, ["final_total", "grand_total", "total_after_discount"]);
  const finalTotal = explicitFinal ?? (subtotal !== null && shipping !== null ? subtotal + shipping - (discount ?? 0) + (fees ?? 0) : null);

  const firstPricing = deliveryPricing[0] ?? {};
  const firstDelivery = deliveryRows[0] ?? {};
  const rankingReason = record(offer.ranking_reason);

  return {
    items,
    subtotal,
    subtotalDerived: storedSubtotal === null && subtotal !== null,
    shipping,
    discount,
    fees,
    finalTotal,
    deliveryMethod: text(firstPricing.delivery_method ?? firstDelivery.pricing_method ?? rankingReason.delivery_method),
    deliveryWeight: finite(firstPricing.delivery_weight_kg ?? rankingReason.delivery_weight_kg),
    location: text(rankingReason.location_label ?? rankingReason.area ?? rankingReason.governorate ?? rankingReason.city),
  };
}

function displayText(value: unknown, lang: Lang, fallback?: string) {
  const normalized = text(value);
  return normalized || fallback || (lang === "ar" ? "غير مسجل" : "Not recorded");
}

function money(value: number | null, lang: Lang) {
  if (value === null) return lang === "ar" ? "غير مسجل" : "Not recorded";
  return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function dateValue(value: unknown, lang: Lang) {
  return value ? String(formatCell(value, "date", lang)) : lang === "ar" ? "غير مسجل" : "Not recorded";
}

export function OrdersConsole({ lang }: { lang: Lang }) {
  const [orders, setOrders] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [store, setStore] = useState("");
  const [buyer, setBuyer] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const [selected, setSelected] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("auth_required");
      const response = await fetch("/api/admin/action?section=orders", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: Row[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "load_failed");
      setOrders(payload.data ?? []);
    } catch (loadError) {
      setError(humanizeAdminError(loadError, lang));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const statuses = useMemo(() => Array.from(new Set(orders.map((order) => text(order.status)).filter(Boolean))).sort(), [orders]);
  const paymentStatuses = useMemo(() => Array.from(new Set(orders.map((order) => text(order.payment_status)).filter(Boolean))).sort(), [orders]);
  const stores = useMemo(() => Array.from(new Set(orders.map((order) => text(order.store_name)).filter(Boolean))).sort(), [orders]);
  const buyers = useMemo(() => Array.from(new Set(orders.map((order) => text(order.buyer_name)).filter(Boolean))).sort(), [orders]);

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    const result = orders.filter((order) => {
      const createdTime = new Date(text(order.created_at)).getTime();
      if (status && text(order.status) !== status) return false;
      if (paymentStatus && text(order.payment_status) !== paymentStatus) return false;
      if (store && text(order.store_name) !== store) return false;
      if (buyer && text(order.buyer_name) !== buyer) return false;
      if (fromTime !== null && (!Number.isFinite(createdTime) || createdTime < fromTime)) return false;
      if (toTime !== null && (!Number.isFinite(createdTime) || createdTime > toTime)) return false;
      if (!needle) return true;
      return [order.id, order.buyer_name, order.buyer_mobile, order.store_name, order.status, order.status_ar, order.status_en, order.payment_status]
        .some((value) => text(value).toLowerCase().includes(needle));
    });

    return result.sort((left, right) => {
      if (sort === "newest" || sort === "oldest") {
        const delta = new Date(text(right.created_at)).getTime() - new Date(text(left.created_at)).getTime();
        return sort === "newest" ? delta : -delta;
      }
      const leftValue = orderBreakdown(left).finalTotal ?? orderBreakdown(left).subtotal ?? 0;
      const rightValue = orderBreakdown(right).finalTotal ?? orderBreakdown(right).subtotal ?? 0;
      return sort === "highest" ? rightValue - leftValue : leftValue - rightValue;
    });
  }, [buyer, from, orders, paymentStatus, query, sort, status, store, to]);

  function resetFilters() {
    setQuery("");
    setStatus("");
    setPaymentStatus("");
    setStore("");
    setBuyer("");
    setFrom("");
    setTo("");
    setSort("newest");
  }

  function exportOrders() {
    const exportRows = filteredOrders.map((order) => {
      const breakdown = orderBreakdown(order);
      return {
        order_id: order.id,
        buyer: order.buyer_name,
        buyer_mobile: order.buyer_mobile,
        store: order.store_name,
        status: adminValueLabel(order.status, lang),
        payment_status: adminValueLabel(order.payment_status, lang),
        selected_products_value: breakdown.subtotal,
        shipping: breakdown.shipping,
        discount: breakdown.discount,
        fees: breakdown.fees,
        final_total: breakdown.finalTotal,
        created_at: order.created_at,
        updated_at: order.updated_at,
      };
    });
    const labels = lang === "ar"
      ? {
          order_id: "رقم الطلب", buyer: "المشتري", buyer_mobile: "هاتف المشتري", store: "المتجر",
          status: "حالة الطلب", payment_status: "حالة الدفع داخل التطبيق", selected_products_value: "قيمة المنتجات المختارة",
          shipping: "الشحن", discount: "الخصومات", fees: "المصاريف والرسوم", final_total: "الإجمالي النهائي",
          created_at: "تاريخ الطلب", updated_at: "آخر تحديث",
        }
      : {
          order_id: "Order ID", buyer: "Buyer", buyer_mobile: "Buyer mobile", store: "Store",
          status: "Order status", payment_status: "In-app payment status", selected_products_value: "Selected products value",
          shipping: "Shipping", discount: "Discounts", fees: "Fees", final_total: "Final total",
          created_at: "Created", updated_at: "Last updated",
        };
    downloadExcel({
      filename: lang === "ar" ? "طلبات-سعرلي.xlsx" : "saarly-orders.xlsx",
      sheetName: lang === "ar" ? "الطلبات" : "Orders",
      rtl: lang === "ar",
      rows: exportRows,
      columns: Object.entries(labels).map(([key, label]) => ({ key, label })),
    });
  }

  return (
    <section className="content-panel orders-console">
      <div className="section-head">
        <div>
          <h1>{lang === "ar" ? "الطلبات" : "Orders"}</h1>
          <p>{lang === "ar" ? "راجع الطلب بالكامل من المنتجات والتوصيل والدفع، واستخدم المرشحات للوصول لأي طلب بسرعة." : "Review products, delivery, and payment details, and use filters to find any order quickly."}</p>
        </div>
        <div className="section-actions">
          <button className="soft-button" onClick={exportOrders} disabled={filteredOrders.length === 0}>
            <Download size={17} />
            {lang === "ar" ? "تصدير" : "Export"}
          </button>
          <button className="soft-button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={17} />
            {lang === "ar" ? "تحديث" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="orders-filter-panel">
        <label className="search-box orders-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={lang === "ar" ? "ابحث بالعميل أو المتجر أو رقم الطلب" : "Search buyer, store, or order ID"} />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={lang === "ar" ? "حالة الطلب" : "Order status"}>
          <option value="">{lang === "ar" ? "كل حالات الطلب" : "All order statuses"}</option>
          {statuses.map((value) => <option value={value} key={value}>{adminValueLabel(value, lang)}</option>)}
        </select>
        <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} aria-label={lang === "ar" ? "حالة الدفع" : "Payment status"}>
          <option value="">{lang === "ar" ? "كل حالات الدفع" : "All payment statuses"}</option>
          {paymentStatuses.map((value) => <option value={value} key={value}>{adminValueLabel(value, lang)}</option>)}
        </select>
        <select value={store} onChange={(event) => setStore(event.target.value)} aria-label={lang === "ar" ? "المتجر" : "Store"}>
          <option value="">{lang === "ar" ? "كل المتاجر" : "All stores"}</option>
          {stores.map((value) => <option value={value} key={value}>{value}</option>)}
        </select>
        <select value={buyer} onChange={(event) => setBuyer(event.target.value)} aria-label={lang === "ar" ? "المشتري" : "Buyer"}>
          <option value="">{lang === "ar" ? "كل المشترين" : "All buyers"}</option>
          {buyers.map((value) => <option value={value} key={value}>{value}</option>)}
        </select>
        <label className="compact-field"><span>{lang === "ar" ? "من" : "From"}</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="compact-field"><span>{lang === "ar" ? "إلى" : "To"}</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} aria-label={lang === "ar" ? "ترتيب النتائج" : "Sort results"}>
          <option value="newest">{lang === "ar" ? "الأحدث أولًا" : "Newest first"}</option>
          <option value="oldest">{lang === "ar" ? "الأقدم أولًا" : "Oldest first"}</option>
          <option value="highest">{lang === "ar" ? "الأعلى قيمة" : "Highest value"}</option>
          <option value="lowest">{lang === "ar" ? "الأقل قيمة" : "Lowest value"}</option>
        </select>
        <button type="button" className="soft-button compact" onClick={resetFilters}>{lang === "ar" ? "مسح المرشحات" : "Clear filters"}</button>
        <span className="toolbar-count"><SlidersHorizontal size={16} />{filteredOrders.length} / {orders.length}</span>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {loading ? <div className="empty-state">{lang === "ar" ? "جار تحميل الطلبات..." : "Loading orders..."}</div> : null}
      {!loading && filteredOrders.length === 0 ? <div className="empty-state">{lang === "ar" ? "لا توجد طلبات مطابقة." : "No matching orders."}</div> : null}

      {!loading && filteredOrders.length > 0 ? (
        <div className="data-table-wrap">
          <table className="data-table orders-table">
            <thead><tr>
              <th>{lang === "ar" ? "المشتري" : "Buyer"}</th>
              <th>{lang === "ar" ? "المتجر" : "Store"}</th>
              <th>{lang === "ar" ? "الحالة" : "Status"}</th>
              <th>{lang === "ar" ? "حالة الدفع" : "Payment"}</th>
              <th>{lang === "ar" ? "قيمة المنتجات" : "Products value"}</th>
              <th>{lang === "ar" ? "التاريخ" : "Date"}</th>
              <th>{lang === "ar" ? "الإجراءات" : "Actions"}</th>
            </tr></thead>
            <tbody>{filteredOrders.map((order) => {
              const breakdown = orderBreakdown(order);
              return (
                <tr key={text(order.id)} className="clickable-row" onDoubleClick={() => setSelected(order)}>
                  <td data-label={lang === "ar" ? "المشتري" : "Buyer"}>{displayText(order.buyer_name, lang)}</td>
                  <td data-label={lang === "ar" ? "المتجر" : "Store"}>{displayText(order.store_name, lang)}</td>
                  <td data-label={lang === "ar" ? "الحالة" : "Status"}><span className="status-pill active">{adminValueLabel(order.status, lang)}</span></td>
                  <td data-label={lang === "ar" ? "حالة الدفع" : "Payment"}><span className="status-pill">{adminValueLabel(order.payment_status, lang)}</span></td>
                  <td data-label={lang === "ar" ? "قيمة المنتجات" : "Products value"}>{money(breakdown.subtotal, lang)}</td>
                  <td data-label={lang === "ar" ? "التاريخ" : "Date"}>{dateValue(order.created_at, lang)}</td>
                  <td data-label={lang === "ar" ? "الإجراءات" : "Actions"} className="mobile-actions-cell">
                    <button type="button" className="tiny-button" onClick={() => setSelected(order)}><Eye size={15} />{lang === "ar" ? "عرض التفاصيل" : "View details"}</button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      ) : null}

      {selected ? <OrderDetailsModal order={selected} lang={lang} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}

function OrderDetailsModal({ order, lang, onClose }: { order: Row; lang: Lang; onClose: () => void }) {
  const breakdown = orderBreakdown(order);
  const offerSnapshot = record(order.accepted_offer_snapshot);
  const offer = record(offerSnapshot.offer);
  const paymentReference = text(order.payment_reference ?? order.transaction_reference ?? offerSnapshot.payment_reference);
  const info = [
    [lang === "ar" ? "رقم الطلب" : "Order ID", displayText(order.id, lang)],
    [lang === "ar" ? "المشتري" : "Buyer", displayText(order.buyer_name, lang)],
    [lang === "ar" ? "رقم المشتري" : "Buyer mobile", displayText(order.buyer_mobile, lang)],
    [lang === "ar" ? "المتجر" : "Store", displayText(order.store_name, lang)],
    [lang === "ar" ? "حالة الطلب" : "Order status", adminValueLabel(order.status, lang)],
    [lang === "ar" ? "تقدم التأكيد" : "Confirmation progress", adminValueLabel(order.confirmation_progress, lang)],
    [lang === "ar" ? "حالة الدفع داخل التطبيق" : "In-app payment status", adminValueLabel(order.payment_status, lang)],
    [lang === "ar" ? "مرجع الدفع" : "Payment reference", paymentReference || (lang === "ar" ? "لا يوجد" : "None")],
    [lang === "ar" ? "تاريخ الطلب" : "Created", dateValue(order.created_at, lang)],
    [lang === "ar" ? "آخر تحديث" : "Last updated", dateValue(order.updated_at, lang)],
    [lang === "ar" ? "تاريخ القبول" : "Accepted", dateValue(order.accepted_at, lang)],
    [lang === "ar" ? "آخر موعد للتأكيد" : "Confirmation deadline", dateValue(order.confirmation_deadline, lang)],
    [lang === "ar" ? "تاريخ التأكيد" : "Confirmed", dateValue(order.confirmed_at, lang)],
    [lang === "ar" ? "إتمام الشراء" : "Purchase finalized", dateValue(order.purchase_finalized_at, lang)],
  ];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card order-details-modal" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close-button" onClick={onClose} aria-label={lang === "ar" ? "إغلاق" : "Close"}><X size={20} /></button>
        <h2>{lang === "ar" ? "تفاصيل الطلب" : "Order details"}</h2>
        <div className="review-details-grid">
          {info.map(([label, value]) => <div className="review-detail-item" key={label}><strong>{label}</strong><span>{value}</span></div>)}
        </div>

        <h3>{lang === "ar" ? "المنتجات المختارة" : "Selected products"}</h3>
        {breakdown.items.length ? (
          <div className="data-table-wrap compact-table-wrap">
            <table className="data-table"><thead><tr>
              <th>{lang === "ar" ? "المنتج" : "Product"}</th><th>{lang === "ar" ? "الكمية" : "Quantity"}</th><th>{lang === "ar" ? "سعر الوحدة" : "Unit price"}</th><th>{lang === "ar" ? "إجمالي المنتج" : "Line total"}</th><th>{lang === "ar" ? "الوحدة" : "Unit"}</th>
            </tr></thead><tbody>
              {breakdown.items.map((item, index) => <tr key={text(item.id) || String(index)}>
                <td data-label={lang === "ar" ? "المنتج" : "Product"}>{displayText(item.matched_name_snapshot ?? item.product_name ?? item.requested_name, lang)}</td>
                <td data-label={lang === "ar" ? "الكمية" : "Quantity"}>{displayText(item.requested_quantity_snapshot ?? item.quantity, lang)}</td>
                <td data-label={lang === "ar" ? "سعر الوحدة" : "Unit price"}>{money(finite(item.unit_price_snapshot), lang)}</td>
                <td data-label={lang === "ar" ? "إجمالي المنتج" : "Line total"}>{money(finite(item.line_total_snapshot), lang)}</td>
                <td data-label={lang === "ar" ? "الوحدة" : "Unit"}>{displayText(item.unit_snapshot, lang)}</td>
              </tr>)}
            </tbody></table>
          </div>
        ) : <div className="empty-state compact">{lang === "ar" ? "تفاصيل العناصر غير محفوظة في هذا الطلب القديم." : "Item details were not saved for this older order."}</div>}

        <div className="order-totals-grid">
          <div><span>{lang === "ar" ? "قيمة المنتجات المختارة" : "Selected products value"}</span><strong>{money(breakdown.subtotal, lang)}</strong><small>{breakdown.subtotalDerived ? (lang === "ar" ? "محسوبة من العناصر المحفوظة" : "Calculated from saved items") : (lang === "ar" ? "القيمة المحفوظة وقت الاختيار" : "Saved at selection time")}</small></div>
          <div><span>{lang === "ar" ? "الشحن" : "Shipping"}</span><strong>{money(breakdown.shipping, lang)}</strong><small>{breakdown.deliveryMethod ? adminValueLabel(breakdown.deliveryMethod, lang) : lang === "ar" ? "طريقة الشحن غير مسجلة" : "Shipping method not recorded"}</small></div>
          <div><span>{lang === "ar" ? "الخصومات" : "Discounts"}</span><strong>{money(breakdown.discount, lang)}</strong></div>
          <div><span>{lang === "ar" ? "المصاريف والرسوم" : "Fees"}</span><strong>{money(breakdown.fees, lang)}</strong></div>
          <div className="final-total"><span>{lang === "ar" ? "الإجمالي النهائي" : "Final total"}</span><strong>{money(breakdown.finalTotal, lang)}</strong><small>{breakdown.finalTotal === null ? (lang === "ar" ? "غير محفوظ ولا يمكن حسابه من البيانات المتاحة" : "Not saved and cannot be calculated from available data") : (lang === "ar" ? "يشمل القيم المتاحة أعلاه" : "Includes the available values above")}</small></div>
        </div>

        <div className="review-details-grid secondary-details">
          <div className="review-detail-item"><strong>{lang === "ar" ? "مكان التوصيل" : "Delivery location"}</strong><span>{breakdown.location || (lang === "ar" ? "غير مسجل" : "Not recorded")}</span></div>
          <div className="review-detail-item"><strong>{lang === "ar" ? "وزن الشحنة" : "Delivery weight"}</strong><span>{breakdown.deliveryWeight === null ? (lang === "ar" ? "غير مسجل" : "Not recorded") : `${breakdown.deliveryWeight} ${lang === "ar" ? "كجم" : "kg"}`}</span></div>
          <div className="review-detail-item"><strong>{lang === "ar" ? "رقم العرض" : "Offer ID"}</strong><span>{displayText(order.offer_id ?? offer.id, lang)}</span></div>
          <div className="review-detail-item"><strong>{lang === "ar" ? "العمولة" : "Commission"}</strong><span>{money(finite(order.commission_amount), lang)}</span></div>
        </div>
      </div>
    </div>
  );
}
