/* Android bridge: makes browser-style file exports work inside the Capacitor WebView.
 * Intercepts <a download> clicks on blob:/data: URLs and showSaveFilePicker(),
 * writes the file to the app cache, then opens Android's share sheet so you can
 * save it to Files / Drive / etc. */
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var P = C.Plugins || {};
  if (!P.Filesystem || !P.Share) {
    console.warn("[android-bridge] Filesystem/Share plugins missing");
    return;
  }

  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1] || ""); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function safeName(n) {
    return String(n || "download").replace(/[^\w.\- ]+/g, "_");
  }

  async function saveBlob(blob, name) {
    try {
      var path = safeName(name);
      var data = await toBase64(blob);
      await P.Filesystem.writeFile({ path: path, data: data, directory: "CACHE" });
      var u = await P.Filesystem.getUri({ path: path, directory: "CACHE" });
      await P.Share.share({ title: path, files: [u.uri], dialogTitle: "Save " + path });
    } catch (e) {
      var msg = (e && e.message) || String(e);
      if (/cancel/i.test(msg)) return; // user closed the share sheet
      alert("Export failed: " + msg);
    }
  }

  function interceptAnchor(a) {
    var name = a.getAttribute("download") || "download";
    fetch(a.href)
      .then(function (r) { return r.blob(); })
      .then(function (b) { return saveBlob(b, name); })
      .catch(function (e) { alert("Export failed: " + ((e && e.message) || e)); });
  }

  function isExportAnchor(a) {
    return a && a.hasAttribute && a.hasAttribute("download") && /^(blob:|data:)/.test(a.href);
  }

  // Anchors clicked programmatically (the usual download trick)
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (isExportAnchor(this)) { interceptAnchor(this); return; }
    return origClick.apply(this, arguments);
  };

  // Anchors clicked by the user while attached to the page
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a[download]");
    if (isExportAnchor(a)) { e.preventDefault(); e.stopPropagation(); interceptAnchor(a); }
  }, true);

  // File System Access API
  window.showSaveFilePicker = async function (opts) {
    var name = (opts && opts.suggestedName) || "save.json";
    var chunks = [];
    return {
      name: name,
      createWritable: async function () {
        return {
          write: async function (d) {
            chunks.push(d && typeof d === "object" && "data" in d ? d.data : d);
          },
          close: async function () { await saveBlob(new Blob(chunks), name); },
          abort: async function () { chunks = []; }
        };
      }
    };
  };

  console.log("[android-bridge] active");
})();
