/**
 * Abu Twins Invent barcode / IMEI scanner — camera (BarcodeDetector + html5-qrcode) and USB wedge.
 * Optimised for fast open, continuous focus, and quick IMEI/barcode lock.
 */
(() => {
  let scanTarget = null;
  let scanStream = null;
  let scanTimer = 0;
  let html5Qr = null;
  let onScanCallback = null;
  let detectBusy = false;
  let lastCandidate = '';
  let lastCandidateHits = 0;
  let finishing = false;
  let torchTrack = null;

  const CAMERA_PREF_KEY = 'atoms_scan_camera_id';
  const DETECT_MS = 40;
  const CONFIRM_HITS = 2;

  function normalizeScanValue(raw, minLen = 6) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 15 || digits.length === 14) return digits;
    if (digits.length > 15 && digits.length <= 17) return digits.slice(0, 15);
    if (digits.length >= 14) return digits;
    const alnum = String(raw || '').trim();
    if (alnum.length >= minLen) return alnum;
    return digits.length >= minLen ? digits : alnum;
  }

  function isStrongImei(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length === 15 || digits.length === 14;
  }

  function ensureScanner() {
    if (document.getElementById('atoms-scanner')) return;
    const el = document.createElement('div');
    el.id = 'atoms-scanner';
    el.className = 'atoms-scanner hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Scan barcode or IMEI');
    el.innerHTML = `
      <div class="atoms-scanner-card">
        <div class="atoms-scanner-head">
          <strong>Scan barcode or IMEI</strong>
          <p class="atoms-muted">Hold steady — the code locks as soon as it is sharp in the frame.</p>
        </div>
        <div class="atoms-scan-stage">
          <div id="atoms-scan-reader" class="atoms-scan-reader"></div>
          <video id="atoms-scan-video" class="atoms-scan-video-fallback" playsinline autoplay muted hidden></video>
          <div class="atoms-scan-reticle" aria-hidden="true">
            <span class="atoms-scan-corner tl"></span>
            <span class="atoms-scan-corner tr"></span>
            <span class="atoms-scan-corner bl"></span>
            <span class="atoms-scan-corner br"></span>
            <span class="atoms-scan-laser"></span>
          </div>
        </div>
        <p id="atoms-scan-status" class="atoms-scan-status atoms-muted">Starting camera…</p>
        <div class="atoms-actions atoms-scanner-actions">
          <button type="button" class="atoms-btn ghost" id="atoms-scan-torch" hidden>
            <span class="material-symbols-outlined">flashlight_on</span> Torch
          </button>
          <button type="button" class="atoms-btn ghost" id="atoms-scan-manual">Type</button>
          <button type="button" class="atoms-btn primary" id="atoms-scan-close">Close</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    document.getElementById('atoms-scan-close').addEventListener('click', stopScan);
    document.getElementById('atoms-scan-manual').addEventListener('click', () => {
      const typed = window.prompt('Enter IMEI or barcode:', '');
      if (typed) finishScan(typed);
    });
    document.getElementById('atoms-scan-torch')?.addEventListener('click', toggleTorch);
    el.addEventListener('click', (e) => {
      if (e.target === el) stopScan();
    });
  }

  function setStatus(msg, tone = '') {
    const el = document.getElementById('atoms-scan-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'atoms-scan-status' + (tone ? ` is-${tone}` : ' atoms-muted');
  }

  function flashSuccess() {
    document.getElementById('atoms-scanner')?.classList.add('is-locked');
    try {
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (_) { /* ignore */ }
  }

  function finishScan(raw) {
    if (finishing) return;
    const value = normalizeScanValue(raw);
    if (!value || value.length < 6) {
      setStatus('Could not read a valid code — hold closer or type manually.', 'warn');
      return;
    }
    finishing = true;
    flashSuccess();
    setStatus(`Locked · ${value}`, 'ok');
    const target = scanTarget;
    const cb = onScanCallback;
    window.setTimeout(() => {
      stopScan();
      if (typeof cb === 'function') cb(value, target);
    }, 120);
  }

  function considerCandidate(raw) {
    const value = normalizeScanValue(raw);
    if (!value || value.length < 6) return;
    if (isStrongImei(value)) {
      finishScan(value);
      return;
    }
    if (value === lastCandidate) {
      lastCandidateHits += 1;
    } else {
      lastCandidate = value;
      lastCandidateHits = 1;
      setStatus(`Reading… ${value.slice(0, 18)}${value.length > 18 ? '…' : ''}`);
    }
    if (lastCandidateHits >= CONFIRM_HITS) {
      finishScan(value);
    }
  }

  async function applyFocusConstraints(track) {
    if (!track || typeof track.getCapabilities !== 'function') return;
    try {
      const caps = track.getCapabilities() || {};
      const advanced = [];
      if (caps.focusMode && caps.focusMode.includes('continuous')) {
        advanced.push({ focusMode: 'continuous' });
      }
      if (caps.exposureMode && caps.exposureMode.includes('continuous')) {
        advanced.push({ exposureMode: 'continuous' });
      }
      const next = { advanced };
      if (caps.width && caps.height) {
        next.width = { ideal: Math.min(1920, caps.width.max || 1920) };
        next.height = { ideal: Math.min(1080, caps.height.max || 1080) };
      }
      if (caps.frameRate) {
        next.frameRate = { ideal: Math.min(30, caps.frameRate.max || 30) };
      }
      await track.applyConstraints(next);
    } catch (_) { /* browser may reject advanced constraints */ }
  }

  function wireTorchButton(track) {
    torchTrack = track || null;
    const btn = document.getElementById('atoms-scan-torch');
    if (!btn) return;
    let supported = false;
    try {
      const caps = track?.getCapabilities?.() || {};
      supported = !!caps.torch;
    } catch (_) {
      supported = false;
    }
    btn.hidden = !supported;
    btn.classList.toggle('is-on', false);
  }

  async function toggleTorch() {
    if (!torchTrack) return;
    const btn = document.getElementById('atoms-scan-torch');
    const on = !btn?.classList.contains('is-on');
    try {
      await torchTrack.applyConstraints({ advanced: [{ torch: on }] });
      btn?.classList.toggle('is-on', on);
      setStatus(on ? 'Torch on — aim at the label.' : 'Torch off.');
    } catch (_) {
      setStatus('Torch not available on this camera.', 'warn');
    }
  }

  function cameraConstraints() {
    return {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, min: 15 },
      },
    };
  }

  async function startBarcodeDetectorLoop(video) {
    if (!('BarcodeDetector' in window)) return false;
    let formats = ['code_128', 'ean_13', 'ean_8', 'code_39', 'itf', 'upc_a', 'upc_e', 'qr_code', 'data_matrix'];
    try {
      if (typeof BarcodeDetector.getSupportedFormats === 'function') {
        const supported = await BarcodeDetector.getSupportedFormats();
        formats = formats.filter((f) => supported.includes(f));
      }
    } catch (_) { /* use defaults */ }
    if (!formats.length) return false;

    let det;
    try {
      det = new BarcodeDetector({ formats });
    } catch (_) {
      return false;
    }

    const tick = async () => {
      if (!scanStream || finishing) return;
      if (!detectBusy && video.readyState >= 2) {
        detectBusy = true;
        try {
          const codes = await det.detect(video);
          const raw = codes[0]?.rawValue;
          if (raw) considerCandidate(raw);
        } catch (_) { /* keep scanning */ }
        detectBusy = false;
      }
      scanTimer = window.setTimeout(tick, DETECT_MS);
    };
    scanTimer = window.setTimeout(tick, DETECT_MS);
    setStatus('Camera ready — centre the barcode in the box.');
    return true;
  }

  async function pickCameraId() {
    if (typeof Html5Qrcode === 'undefined') return { facingMode: 'environment' };
    const cameras = await Html5Qrcode.getCameras().catch(() => []);
    if (!cameras.length) return { facingMode: 'environment' };
    const preferred = localStorage.getItem(CAMERA_PREF_KEY);
    if (preferred && cameras.some((c) => c.id === preferred)) return preferred;
    const back = cameras.find((c) => /back|rear|environment/i.test(c.label || ''));
    const chosen = back || cameras[cameras.length - 1];
    try {
      localStorage.setItem(CAMERA_PREF_KEY, chosen.id);
    } catch (_) { /* ignore */ }
    return chosen.id;
  }

  async function startHtml5Qrcode() {
    if (typeof Html5Qrcode === 'undefined') return false;
    const readerId = 'atoms-scan-reader';
    const readerEl = document.getElementById(readerId);
    const video = document.getElementById('atoms-scan-video');
    if (!readerEl) return false;
    readerEl.hidden = false;
    if (video) video.hidden = true;
    html5Qr = new Html5Qrcode(readerId, {
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false,
    });
    const config = {
      fps: 30,
      qrbox(viewfinderWidth, viewfinderHeight) {
        const w = Math.floor(Math.min(viewfinderWidth * 0.92, 360));
        const h = Math.floor(Math.min(viewfinderHeight * 0.32, 140));
        return { width: Math.max(220, w), height: Math.max(90, h) };
      },
      aspectRatio: 1.777778,
      disableFlip: false,
      rememberLastUsedCamera: true,
    };
    const camId = await pickCameraId();
    await html5Qr.start(
      camId,
      config,
      (text) => considerCandidate(text),
      () => {}
    );
    // Try continuous focus on the live track html5-qrcode created.
    window.setTimeout(() => {
      const live = document.querySelector('#atoms-scan-reader video');
      const track = live?.srcObject?.getVideoTracks?.()?.[0];
      if (track) {
        applyFocusConstraints(track);
        wireTorchButton(track);
      }
    }, 250);
    setStatus('Camera ready — centre the barcode in the box.');
    return true;
  }

  async function startNativeCameraPath() {
    const video = document.getElementById('atoms-scan-video');
    const readerEl = document.getElementById('atoms-scan-reader');
    if (!video || !navigator.mediaDevices?.getUserMedia) return false;
    if (!('BarcodeDetector' in window)) return false;

    if (readerEl) readerEl.hidden = true;
    video.hidden = false;

    scanStream = await navigator.mediaDevices.getUserMedia(cameraConstraints());
    const track = scanStream.getVideoTracks()[0];
    await applyFocusConstraints(track);
    wireTorchButton(track);
    video.srcObject = scanStream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    await video.play();
    // Wait briefly for first frame so detection starts sharp.
    await new Promise((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.addEventListener('loadeddata', resolve, { once: true });
    });
    return startBarcodeDetectorLoop(video);
  }

  async function startScan(targetId, callback) {
    ensureScanner();
    stopScan(true);
    scanTarget = targetId;
    onScanCallback = callback;
    finishing = false;
    lastCandidate = '';
    lastCandidateHits = 0;
    detectBusy = false;
    const overlay = document.getElementById('atoms-scanner');
    overlay.classList.remove('hidden', 'is-locked');
    setStatus('Opening camera…');
    const readerEl = document.getElementById('atoms-scan-reader');
    const video = document.getElementById('atoms-scan-video');
    if (readerEl) {
      readerEl.innerHTML = '';
      readerEl.hidden = true;
    }
    if (video) {
      video.hidden = false;
      video.srcObject = null;
    }

    try {
      // Prefer native BarcodeDetector (fastest). Fall back to html5-qrcode without double-opening when possible.
      let nativeOk = false;
      if ('BarcodeDetector' in window) {
        try {
          nativeOk = await startNativeCameraPath();
        } catch (_) {
          nativeOk = false;
          if (scanStream) {
            scanStream.getTracks().forEach((t) => t.stop());
            scanStream = null;
          }
        }
      }
      if (!nativeOk) {
        if (video) {
          video.hidden = true;
          video.srcObject = null;
        }
        await startHtml5Qrcode();
      }
    } catch (err) {
      if (typeof Html5Qrcode !== 'undefined') {
        try {
          await startHtml5Qrcode();
          return;
        } catch (_) { /* fall through */ }
      }
      overlay.classList.add('hidden');
      const typed = window.prompt(`Camera unavailable (${err.message || 'permission denied'}). Enter IMEI or barcode:`, '');
      if (typed) finishScan(typed);
      else stopScan();
    }
  }

  function stopScan(soft = false) {
    finishing = false;
    lastCandidate = '';
    lastCandidateHits = 0;
    detectBusy = false;
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = 0;
    }
    if (html5Qr) {
      const instance = html5Qr;
      html5Qr = null;
      instance.stop().catch(() => {}).finally(() => {
        instance.clear().catch(() => {});
      });
    }
    if (scanStream) {
      scanStream.getTracks().forEach((t) => t.stop());
      scanStream = null;
    }
    torchTrack = null;
    const torchBtn = document.getElementById('atoms-scan-torch');
    if (torchBtn) {
      torchBtn.hidden = true;
      torchBtn.classList.remove('is-on');
    }
    const video = document.getElementById('atoms-scan-video');
    if (video) video.srcObject = null;
    if (!soft) {
      document.getElementById('atoms-scanner')?.classList.remove('is-locked');
      document.getElementById('atoms-scanner')?.classList.add('hidden');
      scanTarget = null;
      onScanCallback = null;
    }
  }

  /** USB / Bluetooth barcode wedge: rapid keystrokes ending with Enter. */
  function bindWedge(root = document) {
    const MIN_LEN = 6;
    const GAP_MS = 80;
    const buffers = new WeakMap();

    root.querySelectorAll('[data-atoms-scan-input]').forEach((input) => {
      if (input.dataset.atomsWedgeBound) return;
      input.dataset.atomsWedgeBound = '1';
      input.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const state = buffers.get(input) || { buf: '', t: 0 };
        const now = Date.now();
        if (now - state.t > GAP_MS) state.buf = '';
        state.t = now;
        if (e.key === 'Enter') {
          const code = state.buf.trim();
          state.buf = '';
          buffers.set(input, state);
          if (code.length >= MIN_LEN) {
            e.preventDefault();
            input.value = code.replace(/\s+/g, '');
            input.dispatchEvent(new CustomEvent('atoms-filled', { bubbles: true }));
          }
          return;
        }
        if (e.key.length === 1) {
          state.buf += e.key;
          buffers.set(input, state);
        }
      });
    });
  }

  window.AtomsScanner = { startScan, stopScan, bindWedge, normalizeScanValue };
})();
