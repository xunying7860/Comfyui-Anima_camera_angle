/**
 * Comfyui-Anima_camera_angle — Three.js 3D 相机控制（仿 qwenmultiangle）
 */
console.log("[AnimaCamera] Loading...");
import * as THREE from "./three.module.js";
import { app } from "../../scripts/app.js";

// ============================================================
// 0. 配置节点标签中文化
// ============================================================
const LABEL_MAP = {
  azimuth_weight: "方位权重", weight_max: "权重上限", extra_master: "总控乘数",
  elevation_extra: "高度额外", distance_extra: "距离额外", tilt_extra: "倾斜额外",
  azimuth_deadzone: "方位死区", tilt_deadzone: "倾斜死区",
  tag_front: "前方", tag_back: "后方", tag_left: "左侧", tag_right: "右侧",
  tag_bird: "极限俯视", tag_high: "俯视", tag_eye: "平视", tag_low: "仰视", tag_worm: "极限仰视",
  tag_ecu: "特写", tag_cu: "近景", tag_medium: "中景", tag_full: "全身", tag_wide: "远景",
  tag_dutch: "倾斜",
  lens_enabled: "启用镜头", lens_value: "镜头/焦距",
  dof_enabled: "启用景深", dof_value: "景深文案", dof_weight: "景深权重",
  movement_enabled: "启用运镜", movement_value: "运镜文案",
  composition_enabled: "启用构图", composition_value: "构图文案",
  style_enabled: "启用风格", style_value: "风格文案",
};

// ============================================================
// 1. 默认配置 & 工具
// ============================================================
const DC = {
  weight_min: 0.1, weight_max: 10,
  azimuth: { weight: 10, deadzone_ratio: 0.05, extra: 0, enabled: true, weight_max: 0, directions: { front: { tag: "from front" }, back: { tag: "from behind" }, left: { tag: "facing right" }, right: { tag: "facing left" } } },
  elevation: { categories: { bird: { tag: "extreme high-angle shot" }, high: { tag: "high angle" }, eye: { tag: "eye-level" }, low: { tag: "low angle" }, worm: { tag: "extreme low-angle shot" } }, enabled: true, extra: 0 },
  distance: { extra: 0, enabled: true, weight_max: 0, categories: { ecu: { tag: "extreme close-up" }, cu: { tag: "close-up" }, medium: { tag: "medium shot" }, cowboy_shot: { tag: "cowboy shot" }, full: { tag: "full body" }, wide: { tag: "wide shot" } } },
  tilt: { deadzone: 0.15, extra: 0, dutch_tag: "dutch angle", enabled: true, weight_max: 0 }, extra_master: 1,
  extras: { lens: { enabled: false, value: "85mm lens" }, dof: { enabled: false, value: "shallow depth of field", weight: 1.3 }, movement: { enabled: false, value: "handheld camera" }, composition: { enabled: false, value: "rule of thirds" }, style: { enabled: false, value: "cinematic" } },
};
function toFixed2(v) { const n = parseFloat(v); return isNaN(n) ? 0 : Math.round(n * 100) / 100; }
function clamp(v, mn, mx) { return v < mn ? mn : v > mx ? mx : v; }
function fmt(v) { const n = parseFloat(v); return isNaN(n) ? "0.00" : Math.round(n * 100) / 100 + ""; }

// ============================================================
// 2. computePrompt（与 Python 后端保持算法一致）
// ============================================================
function splitTags(tag) { return String(tag).split(",").map(t => t.trim()).filter(t => t); }
function emitWeighted(tag, w, wmin, wmax) {
  return splitTags(tag).map(t => `(${t}:${fmt(clamp(w, wmin, wmax))})`);
}
function computePrompt(px, py, pz, roll, c) {
  const p = [], wmin = parseFloat(c.weight_min) || 0.1, wmax = parseFloat(c.weight_max) || 10, dz = parseFloat(c.azimuth.deadzone_ratio) || 0.05;
  const em = parseFloat(c.extra_master) || 1;
  // 方位
  if (c.azimuth.enabled !== false) {
    const az = px * Math.PI;
    const d = { front: Math.max(0, Math.cos(az)), back: Math.max(0, -Math.cos(az)), right: Math.max(0, Math.sin(az)), left: Math.max(0, -Math.sin(az)) };
    const s = d.front + d.back + d.right + d.left; if (s > 0) { d.front /= s; d.back /= s; d.right /= s; d.left /= s; }
    const AZ_POLE = 0.9, azGate = Math.max(0, Math.min(1, (1 - Math.abs(py)) / (1 - AZ_POLE)));
    const azBudget = ((parseFloat(c.azimuth.weight) || 1) + (parseFloat(c.azimuth.extra) || 0) * em) * azGate;
    const azCap = 10 + Math.max(0, (parseFloat(c.azimuth.extra) || 0) * em);
    for (const [k, nv] of Object.entries(d)) { const w = nv * azBudget; if (nv <= 0 || w < dz) continue; p.push(...emitWeighted(c.azimuth.directions[k].tag, w, wmin, azCap)); }
  }
  // 高度
  if (c.elevation.enabled !== false) {
    const ek = py > 0.7 ? "bird" : py > 0.2 ? "high" : py >= -0.2 ? "eye" : py >= -0.7 ? "low" : "worm";
    const ei = c.elevation.categories[ek]; if (ei && ei.tag) { const elMult = {"bird":4,"worm":5,"high":10,"low":10}[ek] || 15; const ew = Math.abs(py) * elMult + em * (parseFloat(c.elevation.extra) || 0); if (ew >= dz) p.push(...emitWeighted(ei.tag, ew, wmin, wmax + Math.max(0, (parseFloat(c.elevation.extra) || 0) * em))); }
  }
  // 距离
  if (c.distance.enabled !== false) {
    const dk = pz > 0.7 ? "ecu" : pz > 0.2 ? "cu" : pz > 0.0 ? "medium" : pz > -0.35 ? "cowboy_shot" : pz >= -0.7 ? "full" : "wide";
    const di = c.distance.categories[dk]; if (di && di.tag) { const dw = 1 + em * (parseFloat(c.distance.extra) || 0); p.push(...emitWeighted(di.tag, dw, 0.1, wmax + Math.max(0, (parseFloat(c.distance.extra) || 0) * em))); }
  }
  // 倾斜
  if (c.tilt.enabled !== false && roll > 0) { const tw = 1 + em * (parseFloat(c.tilt.extra) || 0); p.push(...emitWeighted(c.tilt.dutch_tag, tw, 0.1, wmax + Math.max(0, (parseFloat(c.tilt.extra) || 0) * em))); }
  // 额外提示词
  const ex = c.extras || {}; for (const k of ["lens", "dof", "movement", "composition", "style"]) { const e = ex[k]; if (e && e.enabled && e.value && e.value.trim()) { p.push(k === "dof" ? `(${e.value.trim()}:${fmt(e.weight || 1)})` : e.value.trim()); } }
  return p.join(", ");
}

// ============================================================
// 3. CSS
// ============================================================
(function () {
  if (document.getElementById("an3-style")) return;
  const el = document.createElement("style"); el.id = "an3-style";
  el.textContent = [
    ".an3-w{display:flex;flex-direction:column;gap:4px;padding:4px;box-sizing:border-box;min-height:380px}",
    ".an3-w .an3-cw{position:relative;width:100%;flex-shrink:0;overflow:hidden;border-radius:8px}",
    ".an3-w .an3-cw canvas{display:block;width:100% !important;height:auto !important;aspect-ratio:560/500;border-radius:8px;cursor:grab;touch-action:none}",
    ".an3-w .an3-cw canvas:active{cursor:grabbing}",
    ".an3-w .an3-ol{position:absolute;left:0;right:0;top:0;padding:6px 8px;display:flex;justify-content:space-between;pointer-events:none;font-size:10px}",
    ".an3-w .an3-ol .h{color:rgba(255,255,255,0.5)}", ".an3-w .an3-ol .i{text-align:right}",
    ".an3-w .an3-ol .d{color:#ff8a4c;font-family:monospace}", ".an3-w .an3-ol .r{color:#c792ea;font-family:monospace}",
    ".an3-w .btn-r{display:flex;gap:6px;align-items:center;flex-wrap:wrap}",
    ".an3-w .btn-r button{background:#333;border:1px solid #555;color:#ddd;border-radius:4px;padding:2px 10px;cursor:pointer;font-size:10px;line-height:1.6}",
    ".an3-w .btn-r button:hover{background:#444}",
    ".an3-w .pr{width:100%;min-height:28px;max-height:60px;resize:vertical;font-size:10px;background:rgba(0,0,0,0.25);border:1px solid #444;color:#fff3b7;border-radius:4px;padding:3px 5px;font-family:monospace;box-sizing:border-box;overflow-x:hidden;word-break:break-all}",
    ".an3-w .ph{font-size:9px;color:rgba(255,255,255,0.3);text-align:center}",
    ".an3-w .ctrl-panel label{font-size:9px;color:rgba(255,255,255,0.7);white-space:nowrap}",
    ".an3-w .ctrl-panel input[type=range]{flex:1;min-width:0;height:10px}",
    ".an3-w .ctrl-panel input[type=checkbox]{accent-color:#667eea;width:14px;height:14px}",
    ".an3-w .ctrl-panel .val{width:30px;text-align:right;font-size:9px;color:rgba(255,255,255,0.5);font-family:monospace}",
  ].join("\n");
  document.head.appendChild(el);
})();

// ============================================================
// 4. Extension
// ============================================================
app.registerExtension({
  name: "ComfyUI.AnimaCameraAngle",

  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    // ---- 配置节点：标签中文化 ----
    if (["CameraWeightConfigNode", "CameraTagConfigNode", "CameraExtraConfigNode"].includes(nodeData.name)) {
      const orig = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        orig?.apply(this, arguments);
        (this.widgets || []).forEach(w => {
          if (LABEL_MAP[w.name]) w.label = LABEL_MAP[w.name];
        });
      };
      return;
    }

    // ---- 主节点：3D 场景 ----
    if (nodeData.name !== "CameraAngleNode") return;

    const orig = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      orig?.apply(this, arguments);
      const node = this;

      // 隐藏 extra_config（可选输入）
      ["extra_config"].forEach(name => {
        const w = node.widgets?.find(w => w.name === name);
        if (w) { w.type = "converted-widget"; w.computeSize = () => [0, 0]; if (w.element) w.element.style.display = "none"; }
      });
      // 隐藏 _tags_json（required STRING，不转换 type 以保留序列化，仅 DOM 层面隐藏）
      setTimeout(() => {
        const w = node.widgets?.find(w => w.name === "_tags_json");
        if (w && w.element) {
          w.computeSize = () => [0, 0];
          w.element.style.cssText = "display:none!important;height:0!important;min-height:0!important;padding:0!important;margin:0!important;border:none!important;overflow:hidden!important";
          if (w.element.parentNode) w.element.parentNode.style.display = "none";
        }
      }, 200);

      const [ow, oh] = node.size;
      node.setSize([Math.max(ow, 380), Math.max(oh, 580)]);

      const container = document.createElement("div"); container.className = "an3-w"; container.style.width = "100%";
      try { node.addDOMWidget("cam3d", "anima-cam-3d", container, { getMinHeight: () => 400, getMaxHeight: () => 800, hideOnZoom: false, serialize: false }); }
      catch (e) { console.warn("[AnimaCamera] addDOMWidget fail:", e); return; }

      // ============= Three.js 场景 =============
      let CW = Math.max(container.clientWidth || 360, 280);
      let CH = Math.round(CW * 500 / 560);
      const ro = new ResizeObserver(() => {
        const nw = Math.max(container.clientWidth || 280, 280);
        if (nw !== CW) { CW = nw; CH = Math.round(CW * 500 / 560);
          renderer.setSize(CW, CH, false); cam3d.aspect = CW / CH; cam3d.updateProjectionMatrix(); }
      });
      ro.observe(container);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0a14);
      const cam3d = new THREE.PerspectiveCamera(45, CW / CH, 0.1, 100);
      cam3d.position.set(4, 3.5, 4); cam3d.lookAt(0, 0.3, 0);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(CW, CH, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const wrap = document.createElement("div"); wrap.className = "an3-cw"; container.prepend(wrap);
      wrap.appendChild(renderer.domElement);
      const ol = document.createElement("div"); ol.className = "an3-ol";
      ol.innerHTML = '<span class="h">拖拽</span><div class="i"><div class="d">正面 · 0°</div><div class="r" style="color:#c792ea;font-family:monospace"></div><div class="m" style="cursor:pointer;font-size:11px;margin-top:2px" title="切换 UI 模式">🔄</div></div>';
      wrap.appendChild(ol);
      const hHint = ol.querySelector(".h"), hDir = ol.querySelector(".d"), hRoll = ol.querySelector(".r"), hMode = ol.querySelector(".m");

      // UI 模式切换（0=新/彩色，1=旧/精简）
      let uiMode = TAGS.ui_mode ?? 0;
      function applyUIMode(mode) {
        uiMode = mode; TAGS.ui_mode = mode; syncTagsToWidget();
        decor.forEach(d => { if (d && typeof d.visible !== 'undefined') d.visible = mode === 0; });
        hMode.textContent = mode === 0 ? '🔄' : '🎨';
        hMode.title = mode === 0 ? '切换到精简模式' : '切换到彩色模式';
      }
      hMode.onclick = () => applyUIMode(uiMode === 0 ? 1 : 0);
      applyUIMode(uiMode); // 初始化

      scene.add(new THREE.AmbientLight(0xffffff, 0.4));
      const ml = new THREE.DirectionalLight(0xffffff, 0.8); ml.position.set(5, 10, 5); scene.add(ml);
      const fl = new THREE.DirectionalLight(0xE93D82, 0.3); fl.position.set(-5, 5, -5); scene.add(fl); decor.push(fl);

      const CENTER = new THREE.Vector3(0, 0.5, 0), AZ_R = 1.8, EL_R = 1.4;
      scene.add(new THREE.GridHelper(5, 20, 0x1a1a2e, 0x12121a));
      // 装饰元素集合（旧模式可隐藏）
      const decor = [];

      const cardMat = new THREE.MeshBasicMaterial({ color: 0x3a3a4a });
      const card = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.02), cardMat);
      card.position.copy(CENTER); scene.add(card);
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.2, 1.2, 0.02)), new THREE.LineBasicMaterial({ color: 0xE93D82 }));
      frame.position.copy(CENTER); scene.add(frame); decor.push(frame);
      const gr = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.58, 64), new THREE.MeshBasicMaterial({ color: 0xE93D82, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
      gr.position.set(0, 0.01, 0); gr.rotation.x = -Math.PI / 2; scene.add(gr); decor.push(gr);

      const camCone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0xE93D82, emissive: 0xE93D82, emissiveIntensity: 0.5 }));
      scene.add(camCone);
      const camGlow = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), new THREE.MeshBasicMaterial({ color: 0xff6ba8, transparent: true, opacity: 0.8 }));
      scene.add(camGlow); decor.push(camGlow);

      const azRing = new THREE.Mesh(new THREE.TorusGeometry(AZ_R, 0.04, 16, 100), new THREE.MeshBasicMaterial({ color: 0xE93D82, transparent: true, opacity: 0.7 }));
      azRing.rotation.x = Math.PI / 2; azRing.position.y = 0.02; scene.add(azRing); decor.push(azRing);
      const azH = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 32), new THREE.MeshStandardMaterial({ color: 0xE93D82, emissive: 0xE93D82, emissiveIntensity: 0.6 }));
      scene.add(azH); decor.push(azH);
      const azG = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshBasicMaterial({ color: 0xE93D82, transparent: true, opacity: 0.2 }));
      scene.add(azG); decor.push(azG);

      const arcPts = []; for (let i = 0; i <= 32; i++) { const a = (-30 + 90 * i / 32) * Math.PI / 180; arcPts.push(new THREE.Vector3(-0.8, EL_R * Math.sin(a) + CENTER.y, EL_R * Math.cos(a))); }
      const arc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPts), 32, 0.04, 8, false), new THREE.MeshBasicMaterial({ color: 0x00FFD0, transparent: true, opacity: 0.8 }));
      scene.add(arc); decor.push(arc);
      const elH = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 32), new THREE.MeshStandardMaterial({ color: 0x00FFD0, emissive: 0x00FFD0, emissiveIntensity: 0.6 }));
      scene.add(elH); decor.push(elH);
      const elG = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00FFD0, transparent: true, opacity: 0.2 }));
      scene.add(elG); decor.push(elG);

      const distH = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 32), new THREE.MeshStandardMaterial({ color: 0xFFB800, emissive: 0xFFB800, emissiveIntensity: 0.7 }));
      scene.add(distH); decor.push(distH);
      const distG = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshBasicMaterial({ color: 0xFFB800, transparent: true, opacity: 0.25 }));
      scene.add(distG); decor.push(distG);
      const DIST_GEARS = [-0.85, -0.52, -0.17, 0.10, 0.45, 0.85];
      // 确保 UI 模式应用到已创建的装饰元素
      decor.forEach(d => { if (d && typeof d.visible !== 'undefined') d.visible = uiMode === 0; });
      function snapDist() {
        let idx = 0;
        for (let i = 1; i < DIST_GEARS.length; i++) {
          if (Math.abs(S.pz - DIST_GEARS[i]) < Math.abs(S.pz - DIST_GEARS[idx])) idx = i;
        }
        S.pz = DIST_GEARS[idx];
        S.dist = S.pz * 4.5 + 5.5;
      }
      let distTube = null;

      // ---- 参数状态 ----
      const S = { px: 0, py: 0, pz: 0, rv: 0, cfg: JSON.parse(JSON.stringify(DC)), azimuth: 0, elevation: 15, dist: 5.5, dragging: false, tgt: null, hovered: null, animId: null };

      // ---- 标签数据 TAGS（BSK 风格：每轴 extra/weight，无 panel_extra） ----
      const TAGS = {
        azimuth: { directions: { front: { tag: "from front" }, back: { tag: "from behind" }, left: { tag: "facing right" }, right: { tag: "facing left" } }, enabled: true, weight: 10, extra: 0, deadzone_ratio: 0.05 },
        elevation: { categories: { bird: { tag: "extreme high-angle shot" }, high: { tag: "high angle" }, eye: { tag: "eye-level" }, low: { tag: "low angle" }, worm: { tag: "extreme low-angle shot" } }, enabled: true, extra: 0 },
        distance: { categories: { ecu: { tag: "extreme close-up" }, cu: { tag: "close-up" }, medium: { tag: "medium shot" }, cowboy_shot: { tag: "cowboy shot" }, full: { tag: "full body" }, wide: { tag: "wide shot" } }, enabled: true, extra: 0 },
        tilt: { dutch_tag: "dutch angle", enabled: true, extra: 0, deadzone: 0.15 },
        extra_master: 1, weight_max: 10, weight_min: 0.1, ui_mode: 0,
      };
      function restoreTags() {
        const rw = gw("_tags_json");
        if (rw && rw.value && rw.value !== "{}") {
          try {
            const d = JSON.parse(rw.value);
            if (typeof d === 'object' && d) {
              // 安全合并，保留 TAGS 默认值（兼容旧工作流缺少 weight/extra 等字段）
              (function mergeSafe(t, s) {
                for (const k of Object.keys(s)) {
                  if (k === "directions" || k === "categories") { t[k] = s[k]; continue; }
                  if (typeof s[k] === 'object' && s[k] && !Array.isArray(s[k]) && typeof t[k] === 'object' && t[k] && !Array.isArray(t[k])) {
                    mergeSafe(t[k], s[k]);
                  } else if (s[k] !== undefined) {
                    t[k] = s[k];
                  }
                }
              })(TAGS, d);
            }
          } catch(_) {}
        }
        syncTagsToWidget();
        // 兜底：确保关键字段不缺失
        if (TAGS.elevation.extra === undefined || TAGS.elevation.extra === null) TAGS.elevation.extra = 0;
        if (TAGS.distance.extra === undefined || TAGS.distance.extra === null) TAGS.distance.extra = 0;
        if (TAGS.tilt.extra === undefined || TAGS.tilt.extra === null) TAGS.tilt.extra = 0;
        if (TAGS.azimuth.extra === undefined || TAGS.azimuth.extra === null) TAGS.azimuth.extra = 0;
        if (TAGS.azimuth.weight === undefined || TAGS.azimuth.weight === null) TAGS.azimuth.weight = 10;
        if (TAGS.extra_master === undefined || TAGS.extra_master === null) TAGS.extra_master = 1;
        // 恢复 UI 模式
        if (typeof hMode !== 'undefined' && hMode) applyUIMode(TAGS.ui_mode ?? 0);
        // 如果标签面板收起但节点高度异常大（来自旧保存），恢复基础高度
        if (tagPanel && tagPanel.style.display === "none" && node.size[1] > 600) {
          node.setSize([node.size[0], Math.max(580, node.size[1] - TAG_PANEL_H)]);
          if (node.graph) node.graph.setDirtyCanvas(true, true);
        }
        // 刷新标签面板所有输入框（text/checkbox/range）
        if (tagPanel) {
          tagPanel.querySelectorAll("input").forEach(inp => {
            if (inp.type === "text") {
              // 按路径查找 TAGS 值
              const path = inp._tagPath;
              if (path) { let o = TAGS; for (const p of path) { if (o && typeof o === 'object') o = o[p]; } if (typeof o === 'string') inp.value = o; }
            } else if (inp.type === "checkbox") {
              const axis = inp._tagAxis;
              if (axis && TAGS[axis]) inp.checked = TAGS[axis].enabled !== false;
            } else if (inp.type === "range") {
              const axis = inp._tagAxis;
              const key = inp._tagKey || "extra";
              if (axis && TAGS[axis]) { inp.value = TAGS[axis][key] ?? 0; const sib = inp.nextElementSibling; if (sib) sib.textContent = parseFloat(inp.value).toFixed(1); }
            }
          });
        }
      }
      function syncTagsToWidget() {
        const rw = gw("_tags_json");
        if (rw) rw.value = JSON.stringify(TAGS);
      }

      // ---- 辅助 ----
      function gw(n) { return node.widgets?.find(w => w.name === n); }
      const clampY = () => { const wy = gw("pos_y"); if (wy) wy.value = Math.max(-1, Math.min(1, wy.value || 0)); };
      clampY();
      node.onConfigure = (function(orig) { return function() { if (orig) orig.apply(this, arguments); setTimeout(clampY, 50); restoreTags(); }; })(node.onConfigure);

      // pos_z 档位切换
      (function() {
        const wz = gw("pos_z");
        if (wz && !wz._zHooked) {
          let oldVal = parseFloat(wz.value) || 0;
          const origCb = wz.callback;
          wz.callback = function(v) {
            if (origCb) origCb.call(this, v);
            const dir = parseFloat(v) > oldVal ? 1 : -1;
            let idx = DIST_GEARS.indexOf(oldVal);
            if (idx < 0) {
              let best = 0;
              for (let i = 1; i < DIST_GEARS.length; i++) {
                if (Math.abs(v - DIST_GEARS[i]) < Math.abs(v - DIST_GEARS[best])) best = i;
              }
              wz.value = DIST_GEARS[best];
            } else {
              const ni = Math.max(0, Math.min(DIST_GEARS.length - 1, idx + dir));
              wz.value = DIST_GEARS[ni];
            }
            oldVal = parseFloat(wz.value) || 0;
          };
          wz._zHooked = true;
        }
      })();

      function readW() {
        S.px = toFixed2(gw("pos_x")?.value ?? 0); S.py = toFixed2(gw("pos_y")?.value ?? 0);
        S.pz = toFixed2(gw("pos_z")?.value ?? 0); S.rv = toFixed2(gw("roll")?.value ?? 0);
        S.azimuth = (S.px * 180 + 360) % 360; S.elevation = S.py * 45 + 15; S.dist = S.pz * 4.5 + 5.5;
        snapDist();
      }
      readW(); setTimeout(readW, 200);

      function syncN() {
        const wx = gw("pos_x"); if (wx) wx.value = S.px; const wy = gw("pos_y"); if (wy) wy.value = S.py;
        const wz = gw("pos_z"); if (wz) wz.value = S.pz; const wr = gw("roll"); if (wr) wr.value = S.rv;
        if (node.graph) node.graph.setDirtyCanvas(true, true);
      }

      // ---- 更新 3D ----
      function upd() {
        S.px = toFixed2(gw("pos_x")?.value ?? 0); S.py = toFixed2(gw("pos_y")?.value ?? 0);
        S.pz = toFixed2(gw("pos_z")?.value ?? 0); S.rv = parseFloat(gw("roll")?.value ?? 0);
        S.azimuth = (S.px * 180 + 360) % 360; S.elevation = S.py * 45 + 15; S.dist = S.pz * 4.5 + 5.5;
        snapDist();
        // 从 TAGS 同步配置到预览（BSK 风格）
        S.cfg.azimuth.enabled = TAGS.azimuth.enabled;
        S.cfg.azimuth.weight = TAGS.azimuth.weight ?? 10;
        S.cfg.azimuth.extra = TAGS.azimuth.extra ?? 0;
        S.cfg.azimuth.deadzone_ratio = TAGS.azimuth.deadzone_ratio ?? 0.05;
        S.cfg.elevation.enabled = TAGS.elevation.enabled;
        S.cfg.elevation.extra = TAGS.elevation.extra ?? 0;
        S.cfg.distance.enabled = TAGS.distance.enabled;
        S.cfg.distance.extra = TAGS.distance.extra ?? 0;
        S.cfg.tilt.enabled = TAGS.tilt.enabled;
        S.cfg.tilt.extra = TAGS.tilt.extra ?? 0;
        S.cfg.extra_master = TAGS.extra_master ?? 1;
        // 同步标签文本
        if (TAGS.azimuth && TAGS.azimuth.directions) S.cfg.azimuth.directions = TAGS.azimuth.directions;
        if (TAGS.elevation && TAGS.elevation.categories) S.cfg.elevation.categories = TAGS.elevation.categories;
        if (TAGS.distance && TAGS.distance.categories) S.cfg.distance.categories = TAGS.distance.categories;
        if (TAGS.tilt && TAGS.tilt.dutch_tag) S.cfg.tilt.dutch_tag = TAGS.tilt.dutch_tag;
        const ar = S.azimuth * Math.PI / 180, er = S.elevation * Math.PI / 180, vd = 2.6 - (S.dist / 10) * 2.0;
        const cx = vd * Math.sin(ar) * Math.cos(er), cy = CENTER.y + vd * Math.sin(er), cz = vd * Math.cos(ar) * Math.cos(er);
        camCone.position.set(cx, cy, cz); camCone.lookAt(CENTER); camCone.rotateX(Math.PI / 2);
        camGlow.position.copy(camCone.position);
        const ax = AZ_R * Math.sin(ar), az = AZ_R * Math.cos(ar); azH.position.set(ax, 0.16, az); azG.position.copy(azH.position);
        const ey = CENTER.y + EL_R * Math.sin(er), ez = EL_R * Math.cos(er); elH.position.set(-0.8, ey, ez); elG.position.copy(elH.position);
        const dt = 0.15 + (10 - S.dist) / 10 * 0.7; distH.position.lerpVectors(CENTER, camCone.position, dt); distG.position.copy(distH.position);
        if (distTube) { scene.remove(distTube); distTube.geometry.dispose(); distTube.material.dispose(); }
        distTube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(CENTER.clone(), camCone.position.clone()), 1, 0.025, 8, false), new THREE.MeshBasicMaterial({ color: 0xFFB800, transparent: true, opacity: 0.8 }));
        scene.add(distTube);
        const ad = S.px * 180;
        hDir.textContent = Math.abs(S.px) > 0.85 ? "背面 · 180°" : S.px < -0.05 ? "左 " + Math.abs(ad).toFixed(0) + "°" : S.px > 0.05 ? "右 " + ad.toFixed(0) + "°" : "正面 · 0°";
        hRoll.textContent = S.rv > 0 ? "倾斜: " + (S.rv * 10).toFixed(2) : "";
        if (previewEl) previewEl.value = computePrompt(S.px, S.py, S.pz, S.rv, S.cfg);
      }

      let alive = true;

      function anim() {
        if (!alive) return;
        S.animId = requestAnimationFrame(anim);
        gr.rotation.z += 0.005;
        try { renderer.render(scene, cam3d); } catch (_) {}
        upd();
      }
      requestAnimationFrame(anim);

      // ---- 鼠标交互 ----
      const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
      const hList = [
        { m: azH, g: azG, n: "az" }, { m: elH, g: elG, n: "el" }, { m: distH, g: distG, n: "dist" },
      ];
      function setScale(h, s) { h.m.scale.setScalar(s); if (h.g) h.g.scale.setScalar(s); }
      renderer.domElement.addEventListener("pointerdown", e => {
        const r = renderer.domElement.getBoundingClientRect();
        mouse.x = (e.clientX - r.left) / r.width * 2 - 1; mouse.y = -(e.clientY - r.top) / r.height * 2 + 1;
        ray.setFromCamera(mouse, cam3d);
        for (const h of hList) { if (ray.intersectObject(h.m).length > 0) { S.dragging = true; S.tgt = h.n; setScale(h, 1.3); e.preventDefault(); return; } }
      });
      renderer.domElement.addEventListener("pointermove", e => {
        const r = renderer.domElement.getBoundingClientRect();
        mouse.x = (e.clientX - r.left) / r.width * 2 - 1; mouse.y = -(e.clientY - r.top) / r.height * 2 + 1;
        ray.setFromCamera(mouse, cam3d);
        if (!S.dragging) {
          let f = null; for (const h of hList) { if (ray.intersectObject(h.m).length > 0) { f = h; break; } }
          if (S.hovered && S.hovered !== f) setScale(S.hovered, 1.0);
          if (f) { setScale(f, 1.15); S.hovered = f; } else S.hovered = null;
          return;
        }
        const plane = new THREE.Plane(), pt = new THREE.Vector3();
        if (S.tgt === "az") {
          plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0));
          if (ray.ray.intersectPlane(plane, pt)) { let a = Math.atan2(pt.x, pt.z) * 180 / Math.PI; if (a < 0) a += 360; S.azimuth = Math.max(0, Math.min(360, a)); S.px = ((S.azimuth + 180) % 360 - 180) / 180; syncN(); }
        } else if (S.tgt === "el") {
          plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-0.8, 0, 0));
          if (ray.ray.intersectPlane(plane, pt)) { let a = Math.atan2(pt.y - CENTER.y, pt.z) * 180 / Math.PI; a = Math.max(-30, Math.min(60, a)); S.elevation = a; S.py = (a - 15) / 45; syncN(); }
        } else if (S.tgt === "dist") { S.dist = Math.max(1, Math.min(10, S.dist + (e.movementY || 0) * 0.05)); S.pz = (S.dist - 5.5) / 4.5; }
      });
      renderer.domElement.addEventListener("pointerup", () => {
        if (!S.dragging) return;
        if (S.tgt === "dist") snapDist();
        S.dragging = false; S.tgt = null; if (S.hovered) setScale(S.hovered, 1.0); syncN();
      });
      renderer.domElement.addEventListener("pointercancel", () => { S.dragging = false; S.tgt = null; });
      renderer.domElement.addEventListener("wheel", e => {
        e.preventDefault();
        let idx = DIST_GEARS.indexOf(S.pz);
        if (idx < 0) { snapDist(); idx = DIST_GEARS.indexOf(S.pz); }
        const dir = e.deltaY > 0 ? 1 : -1;
        const ni = Math.max(0, Math.min(DIST_GEARS.length - 1, (idx >= 0 ? idx : 3) + dir));
        S.pz = DIST_GEARS[ni]; S.dist = S.pz * 4.5 + 5.5; syncN();
      }, { passive: false });

      // ---- 按钮行 ----
      const bRow = document.createElement("div"); bRow.className = "btn-r"; container.appendChild(bRow);
      const rst = document.createElement("button"); rst.textContent = "归位";
      rst.onclick = () => { S.azimuth = 0; S.elevation = 15; S.dist = 5.5; S.px = S.py = S.pz = S.rv = 0; syncN(); };
      bRow.appendChild(rst);
      // ---- 标签编辑按钮 ----
      const tagBtn = document.createElement("button"); tagBtn.textContent = "🏷 标签";
      const TAG_PANEL_H = 380;
      tagBtn.onclick = function () {
        const show = tagPanel.style.display === "none";
        tagPanel.style.display = show ? "block" : "none";
        this.textContent = show ? "✕ 收起标签" : "🏷 标签";
        node.setSize([node.size[0], Math.max(580, node.size[1] + (show ? TAG_PANEL_H : -TAG_PANEL_H))]);
        if (node.graph) node.graph.setDirtyCanvas(true, true);
      };
      bRow.appendChild(tagBtn);

      // ---- 标签编辑面板 ----
      const tagPanel = document.createElement("div");
      tagPanel.style.cssText = "display:none;border:1px solid #444;border-radius:6px;padding:6px;background:rgba(0,0,0,0.3);margin-top:4px;max-height:400px;overflow-y:auto";
      container.appendChild(tagPanel);

      const tagFields = [
        ["方位", [
          ["前方", "azimuth > directions > front > tag", "from front"],
          ["后方", "azimuth > directions > back > tag", "from behind"],
          ["左侧", "azimuth > directions > left > tag", "facing right"],
          ["右侧", "azimuth > directions > right > tag", "facing left"],
        ]],
        ["高度", [
          ["极限俯视", "elevation > categories > bird > tag", "extreme high-angle shot"],
          ["俯视", "elevation > categories > high > tag", "high angle"],
          ["平视", "elevation > categories > eye > tag", "eye-level"],
          ["仰视", "elevation > categories > low > tag", "low angle"],
          ["极限仰视", "elevation > categories > worm > tag", "extreme low-angle shot"],
        ]],
        ["距离", [
          ["特写", "distance > categories > ecu > tag", "extreme close-up"],
          ["近景", "distance > categories > cu > tag", "close-up"],
          ["中景", "distance > categories > medium > tag", "medium shot"],
          ["牛仔", "distance > categories > cowboy_shot > tag", "cowboy shot"],
          ["全身", "distance > categories > full > tag", "full body"],
          ["远景", "distance > categories > wide > tag", "wide shot"],
        ]],
        ["倾斜", [["倾斜", "tilt > dutch_tag", "dutch angle"]]],
      ];
      tagFields.forEach(([group, fields]) => {
        const gl = document.createElement("div"); gl.style.cssText = "font-size:10px;color:#667eea;margin:6px 0 2px 0;font-weight:bold"; gl.textContent = group; tagPanel.appendChild(gl);
        fields.forEach(([label, path, def]) => {
          const parts = path.split(" > ");
          const row = document.createElement("div"); row.style.cssText = "display:flex;align-items:center;gap:4px;margin:1px 0";
          const lbl = document.createElement("span"); lbl.style.cssText = "width:60px;font-size:9px;color:rgba(255,255,255,0.6);flex-shrink:0"; lbl.textContent = label; row.appendChild(lbl);
          const inp = document.createElement("input"); inp.type = "text"; inp.style.cssText = "flex:1;min-width:0;font-size:9px;background:#222;border:1px solid #444;color:#ddd;border-radius:3px;padding:1px 4px";
          let val = def;
          try { let o = TAGS; for (const p of parts) { if (o && typeof o === 'object') o = o[p]; } if (typeof o === 'string') val = o; } catch(_) {}
          inp.value = val;
          inp.oninput = function () {
            let o = TAGS; for (let i = 0; i < parts.length - 1; i++) { if (!o[parts[i]]) o[parts[i]] = {}; o = o[parts[i]]; }
            o[parts[parts.length - 1]] = this.value;
            syncTagsToWidget();
          };
          inp._tagPath = parts; // 供 restoreTags 刷新用
          row.appendChild(inp); tagPanel.appendChild(row);
        });
      });

      // ---- 参数控制分组（BSK 风格） ----
      (function buildCtrlPanel() {
        const gl = document.createElement("div"); gl.style.cssText = "font-size:10px;color:#e67e22;margin:10px 0 2px 0;font-weight:bold"; gl.textContent = "参数控制"; tagPanel.appendChild(gl);
        // 额外权重总控
        const rowEm = document.createElement("div"); rowEm.style.cssText = "display:flex;align-items:center;gap:6px;margin:2px 0";
        const lblEm = document.createElement("span"); lblEm.style.cssText = "width:60px;font-size:9px;color:rgba(255,255,255,0.6)"; lblEm.textContent = "总控乘数"; rowEm.appendChild(lblEm);
        const slEm = document.createElement("input"); slEm.type = "range"; slEm.min = 0.1; slEm.max = 10; slEm.step = 0.1;
        slEm.value = TAGS.extra_master ?? 1;
        const svEm = document.createElement("span"); svEm.style.cssText = "width:28px;text-align:right;font-size:9px;color:rgba(255,255,255,0.5);font-family:monospace"; svEm.textContent = slEm.value;
        slEm.oninput = function () { const v = parseFloat(this.value); TAGS.extra_master = v; svEm.textContent = v.toFixed(1); syncTagsToWidget(); };
        rowEm.appendChild(slEm); rowEm.appendChild(svEm); tagPanel.appendChild(rowEm);

        const ctrlKeys = [
          { axis: "azimuth", label: "方位", hasExtra: true, extraRange: [-10, 10] },
          { axis: "elevation", label: "高度", hasExtra: true, extraRange: [-10, 10] },
          { axis: "distance", label: "距离", hasExtra: true, extraRange: [-10, 10] },
          { axis: "tilt", label: "倾斜", hasExtra: true, extraRange: [-10, 10] },
        ];
        ctrlKeys.forEach(({ axis, label, hasExtra, extraRange }) => {
          // 启用开关行
          const rowEn = document.createElement("div"); rowEn.style.cssText = "display:flex;align-items:center;gap:6px;margin:2px 0";
          const lblEn = document.createElement("span"); lblEn.style.cssText = "width:60px;font-size:9px;color:rgba(255,255,255,0.6)"; lblEn.textContent = label + "启用"; rowEn.appendChild(lblEn);
          const chk = document.createElement("input"); chk.type = "checkbox"; chk.checked = TAGS[axis]?.enabled !== false;
          chk.onchange = function () { TAGS[axis].enabled = this.checked; syncTagsToWidget(); };
          chk._tagAxis = axis;
          rowEn.appendChild(chk);
          tagPanel.appendChild(rowEn);
          if (hasExtra) {
            const rowEx = document.createElement("div"); rowEx.style.cssText = "display:flex;align-items:center;gap:6px;margin:2px 0";
            const lblEx = document.createElement("span"); lblEx.style.cssText = "width:60px;font-size:9px;color:rgba(255,255,255,0.6)"; lblEx.textContent = label + "额外"; rowEx.appendChild(lblEx);
            const sl = document.createElement("input"); sl.type = "range"; sl.min = extraRange[0]; sl.max = extraRange[1]; sl.step = 0.5;
            sl.value = TAGS[axis]?.extra ?? 0;
            const sv = document.createElement("span"); sv.style.cssText = "width:28px;text-align:right;font-size:9px;color:rgba(255,255,255,0.5);font-family:monospace"; sv.textContent = sl.value;
            sl.oninput = function () { const v = parseFloat(this.value); TAGS[axis].extra = v; sv.textContent = v.toFixed(1); syncTagsToWidget(); };
            sl._tagAxis = axis; sl._tagKey = "extra";
            rowEx.appendChild(sl); rowEx.appendChild(sv); tagPanel.appendChild(rowEx);
          }
        });
      })();

      // ---- 预览 ----
      const previewEl = document.createElement("textarea"); previewEl.className = "pr"; previewEl.readOnly = true; previewEl.rows = 2; container.appendChild(previewEl);
      const ph = document.createElement("div"); ph.className = "ph"; ph.textContent = "→ CLIP Text Encode"; container.appendChild(ph);

      // ---- 清理 ----
      const domWidget = node.widgets?.find(w => w.name === "cam3d");
      if (domWidget) {
        const baseRO = domWidget.onRemove;
        domWidget.onRemove = function () {
          alive = false;
          if (S.animId) cancelAnimationFrame(S.animId);
          try { renderer.dispose(); } catch (_) {}
          if (baseRO) baseRO.call(this);
        };
      }
    };
  },
});
