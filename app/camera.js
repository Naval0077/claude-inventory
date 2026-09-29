// Live camera scanning: a full-screen viewfinder that reads barcodes from the video stream.
// Uses the browser's BarcodeDetector where it exists (Android Chrome) and ZXing C++ (WebAssembly)
// elsewhere (iPhone, desktop). Stays open so many serial numbers can be scanned in a row.
(function () {
  const FORMATS_NATIVE = ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39", "code_93", "itf", "codabar", "qr_code", "data_matrix"];
  const FORMATS_ZX = ["Code128", "EAN-13", "EAN-8", "UPC-A", "UPC-E", "Code39", "Code93", "ITF", "Codabar", "QRCode", "DataMatrix"];
  const WEAK = new Set(["ean_13", "ean_8", "upc_a", "upc_e", "itf", "codabar", "code_39", "EAN-13", "EAN-8", "UPC-A", "UPC-E", "ITF", "Codabar", "Code39"]);

  let el = null, stream = null, timer = 0, running = false, detector = null, onCode = null, getStatus = null;
  let lastText = "", lastAt = 0, pending = { text: "", n: 0 };
  const canvas = document.createElement("canvas");

  const available = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;

  function build() {
    el = document.createElement("div");
    el.className = "cam";
    el.innerHTML = `
      <video playsinline muted autoplay></video>
      <div class="cam-frame" aria-hidden="true"><span></span></div>
      <div class="cam-top">
        <span class="cam-title">Point at a barcode</span>
        <button type="button" class="cam-btn" data-torch hidden>Light</button>
        <button type="button" class="cam-btn" data-close>Done</button>
      </div>
      <div class="cam-status" role="status" aria-live="polite">Starting camera…</div>`;
    document.body.appendChild(el);
    el.querySelector("[data-close]").onclick = close;
    el.querySelector("[data-torch]").onclick = toggleTorch;
  }
  function say(text, kind) { const s = el.querySelector(".cam-status"); s.textContent = text; s.className = "cam-status" + (kind ? " " + kind : ""); }

  async function open(handler, statusFn, title) {
    if (!available()) throw new Error("This browser can't use the camera here. Use Scan from photo instead.");
    if (!el) build();
    onCode = handler; getStatus = statusFn;
    el.querySelector(".cam-title").textContent = title || "Point at a barcode";
    el.hidden = false; document.body.classList.add("cam-open");
    say("Starting camera…");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    } catch (e) {
      close();
      throw new Error(e && e.name === "NotAllowedError" ? "Camera permission was refused. Allow the camera for this site in your browser settings, then try again." : "Couldn't start the camera: " + ((e && e.message) || e));
    }
    const v = el.querySelector("video");
    v.srcObject = stream;
    await v.play().catch(() => {});
    const track = stream.getVideoTracks()[0], caps = track.getCapabilities ? track.getCapabilities() : {};
    el.querySelector("[data-torch]").hidden = !caps.torch;
    if (caps.focusMode && caps.focusMode.includes("continuous")) track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
    detector = null;
    if ("BarcodeDetector" in window) { try { const ok = await window.BarcodeDetector.getSupportedFormats(); detector = new window.BarcodeDetector({ formats: FORMATS_NATIVE.filter((f) => ok.includes(f)) }); } catch (e) { detector = null; } }
    if (!detector) { try { await window.StockScan.ready(); } catch (e) { say("Barcode reader couldn't load. Check your connection.", "err"); return; } }
    say("Hold steady, about a hand's length from the label");
    running = true; loop();
  }

  async function toggleTorch() {
    const track = stream && stream.getVideoTracks()[0]; if (!track) return;
    const on = !track._torch;
    try { await track.applyConstraints({ advanced: [{ torch: on }] }); track._torch = on; el.querySelector("[data-torch]").classList.toggle("on", on); } catch (e) {}
  }

  async function readFrame(v) {
    const vw = v.videoWidth, vh = v.videoHeight; if (!vw || !vh) return [];
    // Read the middle of the picture, where the guide box is, at a size decoders like.
    const cw = vw * 0.9, ch = vh * 0.6, k = Math.min(1, 1600 / cw);
    canvas.width = Math.round(cw * k); canvas.height = Math.round(ch * k);
    const g = canvas.getContext("2d", { willReadFrequently: true });
    g.drawImage(v, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
    if (detector) return (await detector.detect(canvas)).map((r) => ({ text: r.rawValue, format: r.format }));
    const res = await window.ZXingWASM.readBarcodes(g.getImageData(0, 0, canvas.width, canvas.height), { formats: FORMATS_ZX, tryHarder: true, tryRotate: true, tryInvert: false, tryDownscale: true, maxNumberOfSymbols: 2 });
    return res.filter((x) => x.isValid && x.text).map((x) => ({ text: x.text, format: x.format }));
  }

  async function loop() {
    if (!running) return;
    const v = el.querySelector("video");
    try {
      const found = await readFrame(v);
      for (const r of found) {
        // Retail codes must be seen in two frames in a row before they count.
        if (WEAK.has(r.format)) { if (pending.text !== r.text) { pending = { text: r.text, n: 1 }; continue; } if (++pending.n < 2) continue; }
        const now = Date.now();
        if (r.text === lastText && now - lastAt < 2500) continue;
        lastText = r.text; lastAt = now;
        if (navigator.vibrate) navigator.vibrate(40);
        onCode(r.text);
        const st = getStatus ? getStatus() : null;
        say(st ? st.text : "Read " + r.text, st ? st.kind : "ok");
      }
    } catch (e) { /* a bad frame; keep going */ }
    timer = setTimeout(loop, detector ? 120 : 200);
  }

  function close() {
    running = false; clearTimeout(timer);
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (el) { el.hidden = true; const v = el.querySelector("video"); if (v) v.srcObject = null; }
    document.body.classList.remove("cam-open");
    canvas.width = canvas.height = 0;
    lastText = ""; pending = { text: "", n: 0 };
  }

  window.StockCamera = { available, open, close };
})();
