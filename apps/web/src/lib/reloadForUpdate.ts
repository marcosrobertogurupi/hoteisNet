// Recarrega a aba para adotar a versão publicada mais recente. Antes do reload, tenta descartar
// qualquer service worker e cache do navegador (os apps satélite /contagem e /housekeeping
// registram um SW mínimo — ver components/PwaRegister.tsx) para o próximo carregamento vir
// inteiramente da rede, sem chunk antigo preso em cache.
export async function reloadForUpdate(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
  } catch {
    // segue para o reload de qualquer forma
  }
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
  } catch {
    // idem
  }
  window.location.reload();
}
