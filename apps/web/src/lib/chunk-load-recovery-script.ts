/** Inline early-boot script — reload once when a post-deploy chunk hash 404s. */
export const CHUNK_LOAD_RECOVERY_SCRIPT = `
(function () {
  var storageKey = "pump-chunk-reload-v1";
  function isChunkFailure(message) {
    if (!message) return false;
    return /ChunkLoadError|Loading chunk|Failed to load chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
      String(message)
    );
  }
  function reloadOnce() {
    try {
      if (sessionStorage.getItem(storageKey) === "1") return;
      sessionStorage.setItem(storageKey, "1");
    } catch (error) {
      return;
    }
    var url = new URL(window.location.href);
    url.searchParams.set("_chunk_reload", String(Date.now()));
    window.location.replace(url.toString());
  }
  window.addEventListener("error", function (event) {
    var target = event.target;
    if (target && target.tagName === "SCRIPT" && target.src && target.src.indexOf("/_next/static/") !== -1) {
      reloadOnce();
      return;
    }
    if (isChunkFailure(event.message)) reloadOnce();
  });
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    var message = reason && (reason.message || reason.name || String(reason));
    if (isChunkFailure(message)) reloadOnce();
  });
})();
`.trim();
