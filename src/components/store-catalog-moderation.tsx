"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, RefreshCw, Search, Store, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { Lang } from "@/lib/admin/i18n";
import { t } from "@/lib/admin/i18n";

type StoreRow = {
  id: string;
  store_name: string;
  owner_name: string | null;
  contact_mobile: string | null;
  category_name_ar: string | null;
  approval_status: string;
  approval_status_ar: string | null;
  store_front_image_url: string | null;
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
  const [error, setError] = useState<string | null>(null);

  const filteredStores = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return stores;
    return stores.filter((store) =>
      [store.store_name, store.owner_name, store.contact_mobile, store.category_name_ar, store.approval_status_ar]
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

  async function resolveImageUrl(value: string | null | undefined, bucket: string) {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    const path = trimmed.startsWith("storage://")
      ? trimmed.replace("storage://", "").split("/").slice(1).join("/")
      : trimmed.replace(/^\/+/, "");

    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  }

  function productImageValues(product: ProductRow) {
    return Array.from(new Set([...(product.image_urls ?? []), product.image_url].filter(Boolean) as string[]));
  }

  async function loadStores() {
    setLoading(true);
    setError(null);
    const { data, error: storesError } = await supabase
      .from("admin_merchants_readable")
      .select(
        "id, store_name, owner_name, contact_mobile, category_name_ar, approval_status, approval_status_ar, store_front_image_url, owner_id_image_url, commercial_register_url, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(160);

    const { data: productRows } = await supabase
      .from("products")
      .select("merchant_id, is_active")
      .limit(5000);

    const counts: Record<string, ProductCount> = {};
    for (const row of (productRows ?? []) as Array<{ merchant_id: string; is_active: boolean }>) {
      counts[row.merchant_id] ??= { total: 0, active: 0 };
      counts[row.merchant_id].total += 1;
      if (row.is_active) counts[row.merchant_id].active += 1;
    }

    const nextStores = (data ?? []) as StoreRow[];
    setStores(nextStores);
    setProductCounts(counts);
    setError(storesError?.message ?? null);
    setLoading(false);

    const imageEntries = await Promise.all(
      nextStores.map(async (store) => [store.id, await resolveImageUrl(store.store_front_image_url, "storefront-photos")] as const)
    );
    setStoreImages(Object.fromEntries(imageEntries));

    if (!selectedStore && nextStores.length > 0) {
      setSelectedStore(nextStores[0]);
    }
  }

  async function loadProducts(storeId: string) {
    setLoadingProducts(true);
    setError(null);
    const { data, error: productsError } = await supabase
      .from("products")
      .select("id, merchant_id, free_name, price, unit, quantity, brand, size, color, image_url, image_urls, is_active, created_at, updated_at")
      .eq("merchant_id", storeId)
      .order("created_at", { ascending: false })
      .limit(400);

    const nextProducts = (data ?? []) as ProductRow[];
    setProducts(nextProducts);
    setError(productsError?.message ?? null);
    setLoadingProducts(false);

    const entries = await Promise.all(
      nextProducts.map(async (product) => {
        const urls = await Promise.all(productImageValues(product).map((image) => resolveImageUrl(image, "product-images")));
        return [product.id, urls.filter(Boolean) as string[]] as const;
      })
    );
    setProductImages(Object.fromEntries(entries));
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
    if (!window.confirm(lang === "ar" ? `إيقاف المنتج "${product.free_name}"؟` : `Deactivate "${product.free_name}"?`)) return;
    await runAction({ action: "deactivate_product", id: product.id });
  }

  async function deleteProduct(product: ProductRow) {
    const ok = window.confirm(
      lang === "ar"
        ? `حذف المنتج "${product.free_name}" نهائيًا؟`
        : `Permanently delete "${product.free_name}"?`
    );
    if (!ok) return;
    await runAction({ action: "delete_product", id: product.id });
  }

  async function suspendStore(store: StoreRow) {
    const reason = window.prompt(lang === "ar" ? "اكتب سبب إيقاف/رفض المتجر" : "Write store suspension reason", "محتوى مخالف");
    if (!reason) return;
    await runAction({ action: "suspend_merchant", id: store.id, payload: { reason } });
  }

  async function deleteStore(store: StoreRow) {
    const typed = window.prompt(
      lang === "ar"
        ? `ده حذف نهائي للمتجر وقد يفشل لو عليه طلبات. اكتب اسم المتجر للتأكيد: ${store.store_name}`
        : `This permanently deletes the store and may fail if it has restricted orders. Type the store name: ${store.store_name}`
    );
    if (typed !== store.store_name) return;
    await runAction({ action: "delete_merchant", id: store.id });
  }

  async function runAction(body: Record<string, unknown>) {
    try {
      setError(null);
      await postAdminAction(body);
      await loadStores();
      if (selectedStore) await loadProducts(selectedStore.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
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
          <span className="eyebrow">{lang === "ar" ? "رقابة بصرية" : "Visual moderation"}</span>
          <h1>{lang === "ar" ? "رقابة المتاجر والمنتجات" : "Store and product moderation"}</h1>
          <p>
            {lang === "ar"
              ? "افتح أي متجر وراجع الصور والأسماء والأسعار. أي محتوى مخالف تقدر توقفه أو تحذفه فورًا."
              : "Open any store and review images, names, and prices. Remove violations immediately."}
          </p>
        </div>
        <button className="soft-button" onClick={loadStores}>
          <RefreshCw size={17} />
          {t("refresh", lang)}
        </button>
      </div>

      {error ? <div className="alert">{error === "service_role_key_missing" ? t("serviceKeyMissing", lang) : error}</div> : null}

      <div className="catalog-layout">
        <aside className="store-gallery">
          <label className="search-box">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={lang === "ar" ? "ابحث عن متجر" : "Search stores"} />
          </label>
          {loading ? <div className="empty-state">{t("loading", lang)}</div> : null}
          <div className="store-card-grid">
            {filteredStores.map((store) => {
              const counts = productCounts[store.id] ?? { total: 0, active: 0 };
              return (
                <button
                  className={selectedStore?.id === store.id ? "visual-store-card active" : "visual-store-card"}
                  key={store.id}
                  onClick={() => setSelectedStore(store)}
                >
                  {storeImages[store.id] ? (
                    <img src={storeImages[store.id] ?? ""} alt={store.store_name} />
                  ) : (
                    <div className="image-placeholder">
                      <Store size={28} />
                    </div>
                  )}
                  <strong>{store.store_name}</strong>
                  <span>{store.category_name_ar || store.approval_status_ar || "-"}</span>
                  <small>
                    {lang === "ar"
                      ? `${counts.active} نشط / ${counts.total} منتج`
                      : `${counts.active} active / ${counts.total} products`}
                  </small>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="product-moderation-area">
          {selectedStore ? (
            <>
              <div className="selected-store-head">
                <div>
                  <h2>{selectedStore.store_name}</h2>
                  <p>{selectedStore.owner_name || "-"} | {selectedStore.contact_mobile || "-"}</p>
                </div>
                <div className="row-actions">
                  <button className="tiny-button danger" onClick={() => void suspendStore(selectedStore)}>
                    <Ban size={15} />
                    {lang === "ar" ? "إيقاف المتجر" : "Suspend store"}
                  </button>
                  <button className="tiny-button danger" onClick={() => void deleteStore(selectedStore)}>
                    <Trash2 size={15} />
                    {lang === "ar" ? "حذف المتجر" : "Delete store"}
                  </button>
                </div>
              </div>

              <label className="search-box">
                <Search size={18} />
                <input
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  placeholder={lang === "ar" ? "ابحث في منتجات المتجر" : "Search store products"}
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
                        <div className="image-placeholder">
                          <AlertTriangle size={28} />
                          <span>{lang === "ar" ? "بدون صورة" : "No image"}</span>
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
                          <b>{Number(product.price).toLocaleString("ar-EG")} ج.م</b>
                          <span>{product.quantity} {product.unit}</span>
                        </div>
                        <span className={product.is_active ? "status-pill active" : "status-pill muted"}>
                          {product.is_active ? (lang === "ar" ? "ظاهر في التطبيق" : "Visible") : lang === "ar" ? "متوقف" : "Hidden"}
                        </span>
                      </div>
                      <div className="moderation-actions">
                        {product.is_active ? (
                          <button className="tiny-button" onClick={() => void deactivateProduct(product)}>
                            <Ban size={15} />
                            {lang === "ar" ? "إيقاف" : "Deactivate"}
                          </button>
                        ) : null}
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
            <div className="empty-state">{lang === "ar" ? "اختار متجر للمراجعة" : "Choose a store to review"}</div>
          )}
        </main>
      </div>
    </section>
  );
}

