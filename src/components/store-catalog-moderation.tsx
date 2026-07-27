"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Ban, RefreshCw, Search, Store, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";
import { humanizeAdminError } from "@/lib/admin/messages";

type StoreRow = {
  id: string;
  store_name: string;
  owner_name: string | null;
  contact_mobile: string | null;
  category_name_ar: string | null;
  category_name_en: string | null;
  approval_status: string;
  approval_status_ar: string | null;
  approval_status_en: string | null;
  founder_badge_enabled: boolean | null;
  trusted_badge_enabled: boolean | null;
  manually_suspended_at: string | null;
  suspension_reason: string | null;
  store_front_image_url: string | null;
  store_front_bucket: string | null;
  owner_id_image_url: string | null;
  commercial_register_url: string | null;
  created_at: string;
};

type ProductRow = {
  id: string;
  merchant_id: string;
  free_name: string;
  price: number;
  unit: string;
  quantity: number;
  brand: string | null;
  size: string | null;
  color: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ProductCount = {
  total: number;
  active: number;
};

export function StoreCatalogModeration({ lang }: { lang: Lang }) {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selectedStore, setSelectedStore] = useState<StoreRow | null>(null);
  const [storeImages, setStoreImages] = useState<Record<string, string | null>>({});
  const [productImages, setProductImages] = useState<Record<string, string[]>>({});
  const [productCounts, setProductCounts] = useState<Record<string, ProductCount>>({});
  const [query, setQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const productAreaRef = useRef<HTMLElement | null>(null);

  const filteredStores = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return stores;
    return stores.filter((store) =>
      [store.store_name, store.owner_name, store.contact_mobile, store.category_name_ar, store.category_name_en, store.approval_status_ar, store.approval_status_en]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [query, stores]);

  const filteredProducts = useMemo(() => {
    const needle = productQuery.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) =>
      [product.free_name, product.brand, product.size, product.color, product.unit]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [productQuery, products]);

  async function accessToken() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("auth_required");
    return token;
  }

  async function resolveImageUrl(
    value: string | null | undefined,
    bucket: string,
    fallbackBucket = bucket,
  ) {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    const token = await accessToken();
    const response = await fetch("/api/admin/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "signed_admin_file",
        payload: { bucket, path: trimmed, fallback_bucket: fallbackBucket },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      data?: { url?: string };
    };
    return response.ok ? payload.data?.url ?? null : null;
  }

  function productImageValues(product: ProductRow) {
    return Array.from(new Set([...(product.image_urls ?? []), product.image_url].filter(Boolean) as string[]));
  }

  async function loadStores() {
    setLoading(true);
    setError(null);
    try {
      const token = await accessToken();
      const response = await fetch("/api/admin/action?catalog=1", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { stores?: StoreRow[]; productRows?: Array<{ merchant_id: string; is_active: boolean }> };
        error?: string;
      };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "catalog_load_failed");

      const nextStores = payload.data.stores ?? [];
      const counts: Record<string, ProductCount> = {};
      for (const row of payload.data.productRows ?? []) {
        counts[row.merchant_id] ??= { total: 0, active: 0 };
        counts[row.merchant_id].total += 1;
        if (row.is_active) counts[row.merchant_id].active += 1;
      }

      setStores(nextStores);
      setProductCounts(counts);
      setSelectedStore((current) => {
        if (current) return nextStores.find((store) => store.id === current.id) ?? nextStores[0] ?? null;
        return nextStores[0] ?? null;
      });

      const imageEntries = await Promise.all(
        nextStores.map(async (store) => [
          store.id,
          await resolveImageUrl(
            store.store_front_image_url,
            store.store_front_bucket ?? "storefront-photos",
            "storefront-photos",
          ),
        ] as const),
      );
      setStoreImages(Object.fromEntries(imageEntries));
    } catch (loadError) {
      setError(humanizeAdminError(loadError, lang));
    } finally {
      setLoading(false);
    }
  }

  async function loadProducts(storeId: string) {
    setLoadingProducts(true);
    setError(null);
    try {
      const token = await accessToken();
      const response = await fetch(`/api/admin/action?catalog=1&merchant_id=${encodeURIComponent(storeId)}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { products?: ProductRow[] };
        error?: string;
      };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "products_load_failed");
      const nextProducts = payload.data.products ?? [];
      setProducts(nextProducts);

      const entries = await Promise.all(
        nextProducts.map(async (product) => {
          const urls = await Promise.all(
            productImageValues(product).map((image) => resolveImageUrl(image, "product-images")),
          );
          return [product.id, urls.filter(Boolean) as string[]] as const;
        }),
      );
      setProductImages(Object.fromEntries(entries));
    } catch (loadError) {
      setError(humanizeAdminError(loadError, lang));
    } finally {
      setLoadingProducts(false);
    }
  }

  async function postAdminAction(body: Record<string, unknown>) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("auth_required");

    const response = await fetch("/api/admin/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "action_failed");
  }

  async function deactivateProduct(product: ProductRow) {
    if (!window.confirm(lang === "ar" ? `تعطيل المنتج "${product.free_name}"؟` : `Deactivate "${product.free_name}"?`)) return;
    await runAction({ action: "deactivate_product", id: product.id });
  }

  async function activateProduct(product: ProductRow) {
    await runAction({ action: "activate_product", id: product.id });
  }

  async function deleteProduct(product: ProductRow) {
    const ok = window.confirm(
      lang === "ar"
        ? `هل تريد حذف "${product.free_name}" نهائياً؟`
        : `Permanently delete "${product.free_name}"?`
    );
    if (!ok) return;
    await runAction({ action: "delete_product", id: product.id });
  }

  async function suspendStore(store: StoreRow) {
    const reason = window.prompt(lang === "ar" ? "اكتب سبب إيقاف المتجر" : "Write store suspension reason", "مخالفة واضحة");
    if (!reason) return;
    await runAction({ action: "suspend_merchant", id: store.id, payload: { reason } });
  }

  async function restoreStore(store: StoreRow) {
    await runAction({
      action: "restore_merchant",
      id: store.id,
      payload: { reason: lang === "ar" ? "إعادة تشغيل المتجر من لوحة الإدارة" : "Store restored from Admin Web" },
    });
  }

  async function deleteStore(store: StoreRow) {
    const typed = window.prompt(
      lang === "ar"
        ? `سيتم حذف هذا المتجر نهائياً وقد يفشل الحذف لو عليه طلبات مرتبطة. اكتب اسم المتجر للتأكيد: ${store.store_name}`
        : `This permanently deletes the store and may fail if it has restricted orders. Type the store name: ${store.store_name}`
    );
    if (typed !== store.store_name) return;
    await runAction({
      action: "delete_merchant",
      id: store.id,
      payload: { reason: lang === "ar" ? "حذف مؤكد من لوحة الإدارة" : "Confirmed deletion from Admin Web" },
    });
  }

  async function runAction(body: Record<string, unknown>) {
    const actionName = String(body.action ?? "action");
    try {
      setBusy(actionName);
      setError(null);
      setMessage(null);
      await postAdminAction(body);
      if (actionName === "delete_merchant") {
        setSelectedStore(null);
        setProducts([]);
      }
      await loadStores();
      setMessage(
        lang === "ar"
          ? actionName === "delete_merchant"
            ? "تم حذف المتجر بنجاح."
            : actionName === "restore_merchant"
              ? "تمت إعادة تشغيل المتجر بنجاح."
              : actionName === "suspend_merchant"
                ? "تم إيقاف المتجر بنجاح."
                : "تم حفظ التحديث بنجاح."
          : actionName === "delete_merchant"
            ? "Store deleted successfully."
            : actionName === "restore_merchant"
              ? "Store restored successfully."
              : actionName === "suspend_merchant"
                ? "Store suspended successfully."
                : "Update saved successfully.",
      );
    } catch (actionError) {
      setError(humanizeAdminError(actionError, lang));
    } finally {
      setBusy(null);
    }
  }

  function selectStore(store: StoreRow) {
    setSelectedStore(store);
    setProductQuery("");
    if (window.matchMedia("(max-width: 820px)").matches) {
      window.setTimeout(() => {
        productAreaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }

  useEffect(() => {
    void loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedStore) {
      void loadProducts(selectedStore.id);
    }
  }, [selectedStore?.id]);

  return (
    <section className="content-panel catalog-panel">
      <div className="section-head">
        <div>
          <span className="eyebrow">{lang === "ar" ? "المراقبة البصرية" : "Visual moderation"}</span>
          <h1>{lang === "ar" ? "مراقبة المتاجر والمنتجات" : "Store and product moderation"}</h1>
          <p>
            {lang === "ar"
              ? "افتح أي متجر وراجع الصور والأسماء والأسعار. احذف المخالفات فوراً عند الحاجة."
              : "Open any store and review images, names, and prices. Remove violations immediately."}
          </p>
        </div>
        <button className="soft-button" onClick={loadStores}>
          <RefreshCw size={17} />
          {t("refresh", lang)}
        </button>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}

      <div className="catalog-layout">
        <aside className="store-gallery">
          <label className="search-box">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={lang === "ar" ? "البحث في المتاجر" : "Search stores"} />
          </label>
          {loading ? <div className="empty-state">{t("loading", lang)}</div> : null}
          <div className="store-card-grid">
            {filteredStores.map((store) => {
              const counts = productCounts[store.id] ?? { total: 0, active: 0 };
              return (
                <button
                  className={selectedStore?.id === store.id ? "visual-store-card active" : "visual-store-card"}
                  key={store.id}
                  onClick={() => selectStore(store)}
                >
                  {storeImages[store.id] ? (
                    <img src={storeImages[store.id] ?? ""} alt={store.store_name} />
                  ) : (
                    <div className="image-placeholder branded-image-placeholder">
                      <Store size={28} />
                      <span>{lang === "ar" ? "لا تتوفر صورة" : "No image available"}</span>
                    </div>
                  )}
                  <strong>{store.store_name}</strong>
                  <span>{(lang === "ar" ? store.category_name_ar : store.category_name_en) || (lang === "ar" ? store.approval_status_ar : store.approval_status_en) || "-"}</span>
                  {store.manually_suspended_at ? (
                    <small className="status-pill danger">{lang === "ar" ? "متوقف" : "Suspended"}</small>
                  ) : null}
                  {store.founder_badge_enabled || store.trusted_badge_enabled ? (
                    <div className="store-badge-row">
                      {store.founder_badge_enabled ? <small className="brand-badge founder">{lang === "ar" ? "متجر مؤسس" : "Founding store"}</small> : null}
                      {store.trusted_badge_enabled ? <small className="brand-badge trusted">{lang === "ar" ? "متجر موثوق" : "Trusted store"}</small> : null}
                    </div>
                  ) : null}
                  <small>
                    {lang === "ar"
                      ? `${counts.active} ظاهر / ${counts.total} منتج`
                      : `${counts.active} active / ${counts.total} products`}
                  </small>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="product-moderation-area" ref={productAreaRef}>
          {selectedStore ? (
            <>
              <div className="selected-store-head">
                <div>
                  <h2>{selectedStore.store_name}</h2>
                  <p>{selectedStore.owner_name || "-"} | {selectedStore.contact_mobile || "-"}</p>
                </div>
                <div className="row-actions">
                  {selectedStore.manually_suspended_at ? (
                    <button className="tiny-button success" onClick={() => void restoreStore(selectedStore)} disabled={busy !== null}>
                      <RefreshCw size={15} />
                      {lang === "ar" ? "إعادة تشغيل المتجر" : "Restore store"}
                    </button>
                  ) : (
                    <button className="tiny-button danger" onClick={() => void suspendStore(selectedStore)} disabled={busy !== null}>
                      <Ban size={15} />
                      {lang === "ar" ? "إيقاف المتجر" : "Suspend store"}
                    </button>
                  )}
                  <button className="tiny-button danger" onClick={() => void deleteStore(selectedStore)} disabled={busy !== null}>
                    <Trash2 size={15} />
                    {lang === "ar" ? "حذف المتجر" : "Delete store"}
                  </button>
                </div>
              </div>
              <div className="mobile-products-hint">
                {lang === "ar" ? "\u0645\u0646\u062a\u062c\u0627\u062a \u0627\u0644\u0645\u062a\u062c\u0631 \u0627\u0644\u0645\u062e\u062a\u0627\u0631 \u0638\u0647\u0631\u062a \u0647\u0646\u0627." : "The selected store products are shown here."}
              </div>

              <label className="search-box">
                <Search size={18} />
                <input
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  placeholder={lang === "ar" ? "البحث في منتجات المتجر" : "Search store products"}
                />
              </label>

              {loadingProducts ? <div className="empty-state">{t("loading", lang)}</div> : null}
              {!loadingProducts && filteredProducts.length === 0 ? <div className="empty-state">{t("noRows", lang)}</div> : null}

              <div className="product-card-grid">
                {filteredProducts.map((product) => {
                  const images = productImages[product.id] ?? [];
                  return (
                    <article className="moderation-product-card" key={product.id}>
                      {images[0] ? (
                        <img src={images[0]} alt={product.free_name} />
                      ) : (
                        <div className="image-placeholder branded-image-placeholder">
                          <AlertTriangle size={28} />
                          <span>{lang === "ar" ? "لا تتوفر صورة" : "No image available"}</span>
                        </div>
                      )}
                      {images.length > 1 ? (
                        <div className="thumb-row">
                          {images.slice(1).map((image) => (
                            <img src={image} alt={product.free_name} key={image} />
                          ))}
                        </div>
                      ) : null}
                      <div className="product-card-body">
                        <div>
                          <strong>{product.free_name}</strong>
                          <span>{[product.brand, product.size, product.color].filter(Boolean).join(" | ") || product.unit}</span>
                        </div>
                        <div className="price-line">
                          <b>{Number(product.price).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")} {lang === "ar" ? "ج.م" : "EGP"}</b>
                          <span>{product.quantity} {product.unit}</span>
                        </div>
                        <span className={product.is_active ? "status-pill active" : "status-pill muted"}>
                          {product.is_active ? (lang === "ar" ? "ظاهر" : "Visible") : lang === "ar" ? "مخفي" : "Hidden"}
                        </span>
                      </div>
                      <div className="moderation-actions">
                        {product.is_active ? (
                          <button className="tiny-button" onClick={() => void deactivateProduct(product)}>
                            <Ban size={15} />
                            {lang === "ar" ? "تعطيل" : "Deactivate"}
                          </button>
                        ) : (
                          <button className="tiny-button" onClick={() => void activateProduct(product)}>
                            <RefreshCw size={15} />
                            {lang === "ar" ? "\u0625\u0639\u0627\u062f\u0629 \u062a\u0634\u063a\u064a\u0644" : "Reactivate"}
                          </button>
                        )}
                        <button className="tiny-button danger" onClick={() => void deleteProduct(product)}>
                          <Trash2 size={15} />
                          {lang === "ar" ? "حذف" : "Delete"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty-state">{lang === "ar" ? "اختر متجراً لمراجعته" : "Choose a store to review"}</div>
          )}
        </main>
      </div>
    </section>
  );
}
