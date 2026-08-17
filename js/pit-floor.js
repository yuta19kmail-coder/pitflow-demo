/* ========================================
   pit-floor.js  -  PIT配置図エディタ v3（v0.48.0 / 第1段v3）
   ----------------------------------------
   ・縮尺＝「横のマス数」（マスの細かさ）。細かくするほど工場の横幅により多くの
     PIT＋通路が収まる。1マス＝カード1枚＝PIT1枠（1台）の基準。PiPの基準倍率にもなる。
   ・新規PITは「1台ぶん（1マス）」。必要な時だけリサイズで広げられる。
   ・ドア／シャッターは“壁の線の上”に乗る（縦の壁・横の壁どちらにも・線に沿う）。
   ・重ね順（最前面/最背面）＋ノードのロック（固定して下のものを触れるように）。
   データ：state.bays（PIT枠）＋state.floorPlan{cols,rows,shapes[]}
     枠   : {id,name,icon,kind,division,gx,gy,gw,gh,locked}
     建物 : {type:'building',gx,gy,gw,gh,locked}
     壁   : {type:'wall',x1,y1,x2,y2,locked}
     扉   : {type:'door'|'shutter', wallId, t, locked}   ※壁に付属（tは0〜1の位置）
   ======================================== */
(function () {
  'use strict';

  var ICONS = [
    /* v＝保存する値（絵文字のまま持つ）。画面には icoE() で線画アイコンにして出す。
       lb＝プルダウンに出す文字（<option> の中はSVGを出せないので文字だけ） */
    { v: '', lb: 'アイコンなし' }, { v: '🔧', lb: '整備' }, { v: '🛞', lb: 'タイヤ' },
    { v: '🎨', lb: '板金・塗装' }, { v: '🔍', lb: '点検' }, { v: '⚡', lb: '電装' },
    { v: '🧰', lb: '一般' }, { v: '🚗', lb: '一時置き' }
  ];
  var TOOLS = [
    { id: 'select', lb: '選択・移動' }, { id: 'flat', lb: '平PIT' }, { id: 'lift', lb: 'リフトPIT' },
    { id: 'building', lb: '建物' }, { id: 'door', lb: 'ドア' }, { id: 'shutter', lb: 'シャッター' }, { id: 'wall', lb: '壁・通路' }
  ];

  var cell = 30;
  var slotMaxFont = 13;   // カード文字の最大px（PiPは小さめを渡せる）。renderStaticでopts.maxFontから設定
  var slotAbbr = false;   // （旧）先頭1文字略・現在未使用
  var slotZoom = false;   // クリックで拡大カード→詳細にするか（PiP=true）。renderStaticでopts.zoomから
  var tool = 'select';
  var sel = null;       // { kind:'bay'|'shape', id }
  var drag = null;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function uid(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1000); }
  function save() { if (window.PitDB) PitDB.save(true); }
  function divColor(d) { return d === 'div1' ? '#1db97a' : (d === 'div2' ? '#ec4899' : '#7b8794'); }

  function fp() {
    if (!state.floorPlan || typeof state.floorPlan !== 'object') state.floorPlan = {};
    var f = state.floorPlan;
    if (typeof f.cols !== 'number') f.cols = 16;
    if (typeof f.rows !== 'number') f.rows = Math.max(4, Math.round(f.cols / 1.7));
    if (!Array.isArray(f.shapes)) f.shapes = [];
    return f;
  }
  function bays() { if (!Array.isArray(state.bays)) state.bays = []; return state.bays; }
  function shapes() { return fp().shapes; }
  function walls() { return shapes().filter(function (s) { return s.type === 'wall'; }); }
  function getBay(id) { return bays().find(function (b) { return b.id === id; }); }
  function getShape(id) { return shapes().find(function (s) { return s.id === id; }); }
  function isSel(kind, id) { return sel && sel.kind === kind && sel.id === id; }
  function selObj() { return sel ? (sel.kind === 'bay' ? getBay(sel.id) : getShape(sel.id)) : null; }

  function ensureModel() {
    var f = fp(), C = f.cols, R = f.rows;
    // ドア/シャッターの旧データ移行（壁付き wallId → 共通の host 表現）＋既定値
    f.shapes = f.shapes.filter(function (s) { return !((s.type === 'door' || s.type === 'shutter') && !s.wallId && !s.hostId); });
    f.shapes.forEach(function (s) {
      if ((s.type === 'door' || s.type === 'shutter') && s.wallId && !s.hostKind) { s.hostKind = 'wall'; s.hostId = s.wallId; }
      if (s.type === 'door' && !s.doorDir) s.doorDir = 'in';
      if (s.type === 'door' && !s.doorSide) s.doorSide = 'l';
      if (s.type === 'shutter' && s.len == null) s.len = 1.6;
    });
    bays().forEach(function (b, i) {
      if (typeof b.gx !== 'number') {
        if (typeof b.x === 'number') {
          b.gx = clamp(Math.round(b.x / 100 * C), 0, C - 1); b.gy = clamp(Math.round(b.y / 100 * R), 0, R - 1);
          b.gw = 1; b.gh = 1;
        } else { b.gx = i % C; b.gy = 0; b.gw = 1; b.gh = 1; }
      }
      if (!b.kind) b.kind = /リフト|lift/i.test(b.name || '') ? 'lift' : 'flat';
      if (b.division == null) b.division = '';
      if (b.icon == null) b.icon = '';
      if (!b.dir) b.dir = b.liftDir || 'v';                 // 向き（縦/横）。旧 liftDir から移行
      if (!b.ncol) b.ncol = (b.dir === 'h') ? 2 : 1;        // 列数（縦＝1列／横＝既定2列）
      if (!b.rows) b.rows = (b.dir === 'h') ? 2 : 5;        // 行数（縦＝5／横＝2）
      clampBox(b);
    });
    f.shapes.forEach(function (s) { if (s.gx != null) clampBox(s); });
  }
  function clampBox(o) {
    var f = fp();
    if (o.kind) { o.gx = clamp(o.gx, 0, Math.max(0, f.cols - 2)); o.gy = clamp(o.gy, 0, Math.max(0, f.rows - 2)); return; } // PITは固定カードサイズ＝位置だけ緩く制限
    o.gw = clamp(o.gw || 1, 1, f.cols); o.gh = clamp(o.gh || 1, 1, f.rows);
    o.gx = clamp(o.gx, 0, f.cols - o.gw); o.gy = clamp(o.gy, 0, f.rows - o.gh);
  }

  // ===== 開閉 =====
  function open() {
    ensureModel();
    var ov = document.getElementById('pf-overlay');
    if (!ov) { ov = document.createElement('div'); ov.id = 'pf-overlay'; document.body.appendChild(ov); }
    ov.className = 'pf-overlay'; ov.innerHTML = buildChrome(); ov.style.display = 'flex';
    document.getElementById('pf-stage').addEventListener('pointerdown', onPointerDown);
    var sc = document.getElementById('pf-scale');
    if (sc) sc.addEventListener('input', function () { setScale(parseInt(sc.value, 10)); });
    if (window.__appBusy !== undefined) window.__appBusy = true;
    render(); paintProps();
  }
  function close() {
    var ov = document.getElementById('pf-overlay'); if (ov) ov.style.display = 'none';
    save();
    if (window.__appBusy !== undefined) window.__appBusy = false;
    if (typeof renderSettings === 'function' && state.currentView === 'settings') renderSettings();
  }
  function setScale(cols) {
    var f = fp();
    f.cols = clamp(cols, 8, 30);
    f.rows = Math.max(4, Math.round(f.cols / 1.7));
    bays().forEach(clampBox); shapes().forEach(function (s) { if (s.gx != null) clampBox(s); });
    var lb = document.getElementById('pf-scale-lb'); if (lb) lb.textContent = '横' + f.cols + 'マス';
    save(); render(); paintProps();
  }

  function buildChrome() {
    var f = fp(), h = '';
    h += '<div class="pf-bar"><span class="pf-bar-title"><i data-ic=factory data-ics=16></i> PIT配置図</span><div class="pf-tools">';
    TOOLS.forEach(function (t) { h += '<button class="pf-tool' + (tool === t.id ? ' on' : '') + '" data-tool="' + t.id + '" onclick="PitFloorEditor.setTool(\'' + t.id + '\')">' + t.lb + '</button>'; });
    h += '</div>';
    h += '<span class="pf-scale-wrap">縮尺<input type="range" id="pf-scale" min="8" max="30" step="1" value="' + f.cols + '"><span id="pf-scale-lb">横' + f.cols + 'マス</span></span>';
    h += '<button class="pf-sample" onclick="PitFloorEditor.exportPlan()"><i data-ic=save data-ics=16></i> 書き出し</button>';
    h += '<button class="pf-sample" onclick="PitFloorEditor.importPlan()"><i data-ic=folderOpen data-ics=16></i> 読み込み</button>';
    h += '<button class="pf-sample" onclick="PitFloorEditor.loadSample()"><i data-ic=factory data-ics=16></i> サンプル</button>';
    h += '<button class="pf-done" onclick="PitFloorEditor.close()">完了して閉じる</button></div>';
    h += '<div class="pf-hint" id="pf-hint">' + toolHint() + '</div>';
    h += '<div class="pf-stage" id="pf-stage"><div class="pf-grid" id="pf-grid"></div></div>';
    h += '<div class="pf-props" id="pf-props"></div>';
    return h;
  }
  function toolHint() {
    if (tool === 'select') return '枠＝ドラッグで移動・右下で大きさ変更。クリックで選択して下で編集（重ね順・ロックもここ）。鍵マークで固定／解除。';
    if (tool === 'wall') return '壁・通路：ドラッグで線を引く（角度15°刻み）。';
    if (tool === 'door' || tool === 'shutter') return (tool === 'door' ? 'ドア' : 'シャッター') + 'は「壁の線」か「建物の縁」の上をクリックして付けます（縦横どちらにも乗ります）。';
    return '置きたい場所をクリックで「' + (TOOLS.filter(function (t) { return t.id === tool; })[0] || {}).lb + '」を配置。平PIT/リフトは1マス（1台）から。';
  }
  function setTool(t) {
    tool = t; sel = null;
    document.querySelectorAll('.pf-tool').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tool') === t); });
    var hn = document.getElementById('pf-hint'); if (hn) hn.textContent = toolHint();
    render(); paintProps();
  }

  // ===== 描画 =====
  function render() {
    var grid = document.getElementById('pf-grid'), stage = document.getElementById('pf-stage');
    if (!grid || !stage) return;
    var f = fp();
    var sw = (stage.clientWidth || 900) - 40;
    // カードが読める最低サイズ(46px)を下限に。これより詰めたい時は幅いっぱい＝横スクロール（縮小はしない）
    cell = Math.max(46, Math.floor(sw / f.cols));
    var W = f.cols * cell, H = f.rows * cell;
    grid.style.width = W + 'px'; grid.style.height = H + 'px';
    grid.style.backgroundSize = cell + 'px ' + cell + 'px';

    // 第1 SVG：壁＋リフト飾り（建物より後ろ）
    var s = '<svg class="pf-walls" width="' + W + '" height="' + H + '">';
    walls().forEach(function (w) {
      var on = isSel('shape', w.id), col = on ? '#f59e0b' : '#94a3b8';
      s += '<line x1="' + (w.x1 * cell) + '" y1="' + (w.y1 * cell) + '" x2="' + (w.x2 * cell) + '" y2="' + (w.y2 * cell) + '" stroke="' + col + '" stroke-width="6" stroke-linecap="round"' + (w.locked ? '' : ' data-wall="' + w.id + '"') + '/>';
      if (!w.locked) {
        s += '<circle cx="' + (w.x1 * cell) + '" cy="' + (w.y1 * cell) + '" r="6" fill="#fff" stroke="' + col + '" stroke-width="2" data-wpt="' + w.id + '|1"/>';
        s += '<circle cx="' + (w.x2 * cell) + '" cy="' + (w.y2 * cell) + '" r="6" fill="#fff" stroke="' + col + '" stroke-width="2" data-wpt="' + w.id + '|2"/>';
      }
    });
    bays().forEach(function (b) { if (b.kind === 'lift') s += liftDeco(b); }); // リフト飾りは枠の外
    s += '</svg>';
    grid.innerHTML = s;

    // 建物（DOM）
    shapes().filter(function (x) { return x.type === 'building'; }).forEach(function (b) { grid.appendChild(makeBuildingEl(b)); });

    // 第2 SVG：ドア/シャッター（建物より手前＝壁/建物の点線をその区間だけ消せる）
    var s2 = '<svg class="pf-walls" width="' + W + '" height="' + H + '">';
    shapes().filter(function (x) { return x.type === 'door' || x.type === 'shutter'; }).forEach(function (a) { s2 += attachMarker(a); });
    s2 += '</svg>';
    grid.insertAdjacentHTML('beforeend', s2);

    // PIT（DOM・最前面）
    bays().forEach(function (b) { grid.appendChild(makeBayEl(b)); });
  }

  function attachMarker(a) {
    var e = edgeOf(a); if (!e) return '';
    var px = (e.x1 + (e.x2 - e.x1) * a.t) * cell, py = (e.y1 + (e.y2 - e.y1) * a.t) * cell;
    var deg = Math.atan2(e.y2 - e.y1, e.x2 - e.x1) * 180 / Math.PI;
    var on = isSel('shape', a.id), col = on ? '#f59e0b' : (a.type === 'door' ? '#3b82f6' : '#b45309');
    var attr = a.locked ? '' : ' data-attach="' + a.id + '"';
    var g = '<g transform="translate(' + px + ',' + py + ') rotate(' + deg + ')" style="cursor:pointer"' + attr + '>';
    if (a.type === 'door') {
      var H = cell * 0.5, L = cell * 0.82, dir = (a.doorDir === 'out') ? 1 : -1, hs = (a.doorSide === 'r') ? 1 : -1;
      var hx = hs * H, ox = -hs * H, sweep = (hs < 0) ? (dir < 0 ? 1 : 0) : (dir < 0 ? 0 : 1); // hx=蝶番側ジャム
      g += '<rect x="' + (-H) + '" y="-7" width="' + cell + '" height="14" fill="var(--bg2)"/>';
      g += '<line x1="' + (-H) + '" y1="-5" x2="' + (-H) + '" y2="5" stroke="' + col + '" stroke-width="3"/>';
      g += '<line x1="' + H + '" y1="-5" x2="' + H + '" y2="5" stroke="' + col + '" stroke-width="3"/>';
      g += '<line x1="' + hx + '" y1="0" x2="' + hx + '" y2="' + (dir * L) + '" stroke="' + col + '" stroke-width="2.5"/>';
      g += '<path d="M ' + hx + ' ' + (dir * L) + ' A ' + L + ' ' + L + ' 0 0 ' + sweep + ' ' + ox + ' 0" fill="none" stroke="' + col + '" stroke-width="1.5" stroke-dasharray="3 3"/>';
    } else {
      var len = (a.len || 1.6) * cell, hw = len / 2;
      g += '<rect x="' + (-hw) + '" y="-7" width="' + len + '" height="14" fill="var(--bg2)"/>';
      g += '<rect x="' + (-hw) + '" y="-6" width="' + len + '" height="12" rx="2" fill="' + col + '" fill-opacity="0.18" stroke="' + col + '" stroke-width="2"/>';
      var n = Math.max(2, Math.round(len / (cell * 0.3)));
      for (var k = 0; k <= n; k++) { var xx = -hw + (len / n) * k; g += '<line x1="' + xx + '" y1="-5" x2="' + xx + '" y2="5" stroke="' + col + '" stroke-width="1.4"/>'; }
    }
    g += '</g>';
    return g;
  }

  function pos(el, o) { el.style.left = (o.gx * cell) + 'px'; el.style.top = (o.gy * cell) + 'px'; el.style.width = (o.gw * cell) + 'px'; el.style.height = (o.gh * cell) + 'px'; }
  function lockChip(kind, o) { return '<span class="pf-lock' + (o.locked ? ' on' : '') + '" data-lock="' + kind + '|' + o.id + '" title="' + (o.locked ? 'ロック中（クリックで解除）' : 'ロックする') + '">' + (o.locked ? '<i data-ic=lock data-ics=16></i>' : '<i data-ic=unlock data-ics=16></i>') + '</span>'; }
  // リフトの飾り（枠の外＝SVG層に描く）。柱＋直線足＋正方形パッド＋内側ブラケット＋外側ピンク出っ張り。
  // 着地状態で外側にはねる。色は課（divisionColor）。
  function liftDeco(b) {
    var c = cell, mm = bayMetrics(b);
    var bx = b.gx * c, by = b.gy * c, bw = mm.w, bh = mm.h;
    var cxc = bx + bw / 2, cyc = by + bh / 2, col = divColor(b.division);
    // 飾りは“セル基準の一定サイズ”＝箱を大きくしてもデカくならない（控えめに添える）
    // 承認サンプルの寸法比に合わせた控えめサイズ（柱≒1.1セル・足は縦寄り浅め・正方形パッド・外側ピンク出っ張り）
    var pw = Math.max(4, c * 0.16), gap = c * 0.1;
    var armDX = c * 0.22, armDY = c * 0.6, ps = Math.max(5, c * 0.18);
    var aw = Math.max(2, c * 0.065), pkw = Math.max(1.4, c * 0.045), protW = c * 0.2, brkT = c * 0.12;
    var horiz = (b.dir === 'h' || b.liftDir === 'h');
    var pl = c * 1.1; // 柱の長さ＝一定（控えめ・箱を大きくしてもデカくならない）
    var protB = c * 0.42, brkH = c * 0.12;                                    // 出っ張り/ブラケットの幅
    var pad = function (cx, cy2) { return '<rect x="' + (cx - ps / 2) + '" y="' + (cy2 - ps / 2) + '" width="' + ps + '" height="' + ps + '" rx="1.5" fill="' + col + '"/>'; };
    var arm = function (x1, y1, x2, y2) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + col + '" stroke-width="' + aw + '" stroke-linecap="round"/>' + pad(x2, y2); };
    var g = '';
    if (!horiz) {
      [-1, 1].forEach(function (s) {
        var edge = (s < 0) ? bx : (bx + bw);
        var px = (s < 0) ? (edge - gap - pw) : (edge + gap), pcx = px + pw / 2;
        var ptop = cyc - pl / 2, pbot = cyc + pl / 2;
        var innerX = (s < 0) ? (px + pw) : px, outerX = (s < 0) ? px : (px + pw), tickDir = -s, tipX = pcx + s * armDX;
        var protX = (s < 0) ? (outerX - protW) : outerX;
        g += '<rect x="' + px + '" y="' + ptop + '" width="' + pw + '" height="' + pl + '" rx="2" fill="' + col + '" fill-opacity="0.18" stroke="' + col + '" stroke-width="' + pkw + '"/>';
        g += '<path d="M' + (innerX + tickDir * brkT) + ' ' + (cyc - brkH) + ' L' + innerX + ' ' + (cyc - brkH) + ' L' + innerX + ' ' + (cyc + brkH) + ' L' + (innerX + tickDir * brkT) + ' ' + (cyc + brkH) + '" fill="none" stroke="' + col + '" stroke-width="' + pkw + '" stroke-linejoin="round"/>';
        g += '<rect x="' + protX + '" y="' + (cyc - protB / 2) + '" width="' + protW + '" height="' + protB + '" rx="2" fill="' + col + '"/>';
        g += arm(pcx, ptop, tipX, ptop - armDY) + arm(pcx, pbot, tipX, pbot + armDY);
      });
    } else {
      [-1, 1].forEach(function (s) {
        var edge = (s < 0) ? by : (by + bh);
        var py = (s < 0) ? (edge - gap - pw) : (edge + gap), pcy = py + pw / 2;
        var pleft = cxc - pl / 2, pright = cxc + pl / 2;
        var innerY = (s < 0) ? (py + pw) : py, outerY = (s < 0) ? py : (py + pw), tickDir = -s;
        var protY = (s < 0) ? (outerY - protW) : outerY;
        g += '<rect x="' + pleft + '" y="' + py + '" width="' + pl + '" height="' + pw + '" rx="2" fill="' + col + '" fill-opacity="0.18" stroke="' + col + '" stroke-width="' + pkw + '"/>';
        g += '<path d="M' + (cxc - brkH) + ' ' + (innerY + tickDir * brkT) + ' L' + (cxc - brkH) + ' ' + innerY + ' L' + (cxc + brkH) + ' ' + innerY + ' L' + (cxc + brkH) + ' ' + (innerY + tickDir * brkT) + '" fill="none" stroke="' + col + '" stroke-width="' + pkw + '" stroke-linejoin="round"/>';
        g += '<rect x="' + (cxc - protB / 2) + '" y="' + protY + '" width="' + protB + '" height="' + protW + '" rx="2" fill="' + col + '"/>';
        // 横向きは“長い方向”を左右に（縦向きを90°回した形）：左右へ長く・上下へ浅くはねる
        g += arm(pleft, pcy, pleft - armDY, pcy + s * armDX) + arm(pright, pcy, pright + armDY, pcy + s * armDX);
      });
    }
    return '<g style="pointer-events:none">' + g + '</g>';
  }
  // カードは“固定サイズ”。箱はカード数（縦の行数×横の列数）にぴったり合わせて作る＝伸縮しない。
  // 縦向き＝1列×5行／横向き＝既定2列×3行。列数は ncol、行数は向きで決まる。
  function bayMetrics(b) {
    var dir = b.dir || b.liftDir || 'v';
    var rows = Math.max(1, b.rows || (dir === 'h' ? 2 : 5));   // 行数（既定 縦5/横2）・リサイズで増減可
    var ncol = Math.max(1, b.ncol || (dir === 'h' ? 2 : 1));   // 列数（既定 縦1/横2）
    var cardW = Math.max(40, Math.round(cell * 2.6));   // ← カード1枚の固定サイズ（縦横どちらも同じ）。やや幅広め
    var cardH = Math.max(13, Math.round(cell * 0.92));
    var gap = 5, pad = 6, headH = Math.max(16, Math.round(cell * 0.5)), bd = 5; // bd=枠線2.5px×2 のborder-box補正
    var w = pad * 2 + ncol * cardW + (ncol - 1) * gap + bd;
    var h = headH + pad * 2 + rows * cardH + (rows - 1) * gap + bd;
    return { dir: dir, rows: rows, ncol: ncol, cardW: cardW, cardH: cardH, gap: gap, pad: pad, headH: headH, w: w, h: h };
  }
  function makeBayEl(b) {
    var m = bayMetrics(b);
    var d = document.createElement('div');
    d.className = 'pf-box pf-pit pf-' + b.kind + (isSel('bay', b.id) ? ' sel' : '') + (b.locked ? ' locked' : '');
    d.style.left = (b.gx * cell) + 'px'; d.style.top = (b.gy * cell) + 'px';
    d.style.width = m.w + 'px'; d.style.height = m.h + 'px';
    d.style.borderColor = divColor(b.division); d.style.color = divColor(b.division);
    d.setAttribute('data-bay', b.id);
    var cap = m.ncol * m.rows;
    var h = '<div class="pf-box-hd" style="height:' + m.headH + 'px"><span class="pf-box-nm">' + (b.icon ? icoE(b.icon) + ' ' : '') + esc(b.name || '') + '</span>' + lockChip('bay', b) + '</div>';
    h += '<div class="pf-cards" style="gap:' + m.gap + 'px;padding:' + m.pad + 'px">';
    for (var col = 0; col < m.ncol; col++) {
      h += '<div class="pf-cardcol" style="gap:' + m.gap + 'px">';
      for (var r = 0; r < m.rows; r++) h += '<span class="pf-cardbar" style="width:' + m.cardW + 'px;height:' + m.cardH + 'px"></span>';
      h += '</div>';
    }
    h += '</div>';
    h += '<span class="pf-cap" style="background:' + divColor(b.division) + '">' + cap + '枚</span>';
    if (!b.locked) h += '<span class="pf-resize" data-rz="' + b.id + '"></span>';
    d.innerHTML = h; return d;
  }
  function makeBuildingEl(s) {
    var d = document.createElement('div');
    d.className = 'pf-box pf-building' + (isSel('shape', s.id) ? ' sel' : '') + (s.locked ? ' locked' : '');
    pos(d, s); d.setAttribute('data-shape', s.id);
    d.innerHTML = '<span class="pf-box-tag">建物</span>' + lockChip('shape', s) + (s.locked ? '' : '<span class="pf-resize" data-rzs="' + s.id + '"></span>');
    return d;
  }

  // ===== 編集パネル =====
  function paintProps() {
    var p = document.getElementById('pf-props'); if (!p) return;
    var o = selObj();
    if (sel && sel.kind === 'bay' && o) {
      var icons = ICONS.map(function (x) { return '<option value="' + x.v + '"' + (o.icon === x.v ? ' selected' : '') + '>' + x.lb + '</option>'; }).join('');
      var dop = function (v, l) { return '<option value="' + v + '"' + (o.division === v ? ' selected' : '') + '>' + l + '</option>'; };
      p.innerHTML = '<span class="pf-prop-t">PIT枠</span>'
        + '<input class="pf-in pf-in-name" value="' + esc(o.name || '') + '" placeholder="名前" onchange="PitFloorEditor.edit(\'name\',this.value)">'
        + '<select class="pf-in" onchange="PitFloorEditor.edit(\'icon\',this.value)">' + icons + '</select>'
        + '<select class="pf-in" onchange="PitFloorEditor.edit(\'kind\',this.value)"><option value="flat"' + (o.kind === 'flat' ? ' selected' : '') + '>平PIT</option><option value="lift"' + (o.kind === 'lift' ? ' selected' : '') + '>リフトPIT</option></select>'
        + '<select class="pf-in" onchange="PitFloorEditor.edit(\'division\',this.value)">' + dop('', '共通') + dop('div1', '1課') + dop('div2', '2課') + '</select>'
        + '<select class="pf-in" onchange="PitFloorEditor.edit(\'dir\',this.value)"><option value="v"' + ((o.dir || 'v') === 'v' ? ' selected' : '') + '>縦向き</option><option value="h"' + (o.dir === 'h' ? ' selected' : '') + '>横向き</option></select>'
        + (function () { var nc = Math.max(1, o.ncol || 1), nr = Math.max(1, o.rows || (o.dir === 'h' ? 2 : 5)); return '<span class="pf-cap-note">' + nc + '列×' + nr + '行＝' + (nc * nr) + '枚（右下で増減）</span>'; })()
        + zlockBtns() + '<button class="pf-del" onclick="PitFloorEditor.removeSel()"><i data-ic=trash data-ics=16></i> 削除</button>';
    } else if (sel && sel.kind === 'shape' && o) {
      var nm = o.type === 'building' ? '建物' : (o.type === 'door' ? 'ドア' : (o.type === 'shutter' ? 'シャッター' : '壁・通路'));
      var ex = '';
      if (o.type === 'door') ex = '<button class="pf-zbtn' + (o.doorDir === 'out' ? ' on' : '') + '" onclick="PitFloorEditor.toggleDoor()">↕ ' + (o.doorDir === 'out' ? '外開き' : '内開き') + '</button>'
        + '<button class="pf-zbtn" onclick="PitFloorEditor.toggleDoorSide()">↔ ' + (o.doorSide === 'r' ? '右開き' : '左開き') + '</button>';
      else if (o.type === 'shutter') ex = '<button class="pf-zbtn" onclick="PitFloorEditor.shutterLen(-1)">－短く</button><button class="pf-zbtn" onclick="PitFloorEditor.shutterLen(1)">＋長く</button>';
      p.innerHTML = '<span class="pf-prop-t">' + nm + '</span>' + ex
        + '<span class="pf-cap-note">' + (o.type === 'wall' ? '両端の●をドラッグ（15°刻み）' : (o.type === 'building' ? 'ドラッグで移動・右下で大きさ' : '壁/建物の縁に沿ってドラッグで位置調整')) + '</span>'
        + zlockBtns() + '<button class="pf-del" onclick="PitFloorEditor.removeSel()"><i data-ic=trash data-ics=16></i> 削除</button>';
    } else {
      p.innerHTML = '<span class="pf-prop-empty">枠・建物・線をクリックすると、ここで編集（名前／課／種類／重ね順／ロック／削除）できます。</span>';
    }
  }
  function zlockBtns() {
    var o = selObj(); var locked = o && o.locked;
    return '<button class="pf-zbtn" onclick="PitFloorEditor.toFront()" title="最前面へ"><i data-ic=up data-ics=15></i> 前面</button>'
      + '<button class="pf-zbtn" onclick="PitFloorEditor.toBack()" title="最背面へ"><i data-ic=down data-ics=15></i> 背面</button>'
      + '<button class="pf-zbtn' + (locked ? ' on' : '') + '" onclick="PitFloorEditor.toggleLock()">' + (locked ? '<i data-ic=lock data-ics=16></i> 解除' : '<i data-ic=unlock data-ics=16></i> ロック') + '</button>';
  }

  // ===== 追加・編集・並び =====
  function placeAt(cx, cy) {
    var f = fp(), gx = clamp(Math.floor(cx), 0, f.cols - 1), gy = clamp(Math.floor(cy), 0, f.rows - 1);
    if (tool === 'flat' || tool === 'lift') {
      // 既定は縦向き＝1列5枚。箱はカード数にぴったり（固定カードサイズ）。横向きは後から切替で 2列×3行。
      var b = { id: uid('bay'), name: tool === 'lift' ? 'リフト' : 'PIT ' + (bays().length + 1), icon: '', kind: tool, division: '', dir: 'v', ncol: 1, rows: 5, gx: gx, gy: gy };
      bays().push(b); sel = { kind: 'bay', id: b.id };
    } else if (tool === 'building') {
      var bw = Math.min(4, f.cols - gx), bh = Math.min(3, f.rows - gy);
      var s = { id: uid('sh'), type: 'building', gx: gx, gy: gy, gw: bw, gh: bh };
      shapes().push(s); sel = { kind: 'shape', id: s.id };
    }
    save(); setTool('select');
  }
  function placeAttach(type, cx, cy) {
    var nw = nearestEdge(cx, cy);
    if (!nw || nw.d > 0.9) { flashHint('壁の線、または建物の縁の上をクリックしてください'); return; }
    var a = { id: uid('sh'), type: type, t: nw.t, hostKind: nw.e.ref.hostKind, hostId: nw.e.ref.hostId };
    if (nw.e.ref.edge != null) a.edge = nw.e.ref.edge;
    if (type === 'door') { a.doorDir = 'in'; a.doorSide = 'l'; }
    if (type === 'shutter') a.len = 1.6;
    shapes().push(a); sel = { kind: 'shape', id: a.id };
    save(); setTool('select');
  }
  function toggleDoor() { var o = selObj(); if (!o || o.type !== 'door') return; o.doorDir = (o.doorDir === 'out') ? 'in' : 'out'; save(); render(); paintProps(); }
  function toggleDoorSide() { var o = selObj(); if (!o || o.type !== 'door') return; o.doorSide = (o.doorSide === 'r') ? 'l' : 'r'; save(); render(); paintProps(); }
  function shutterLen(d) { var o = selObj(); if (!o || o.type !== 'shutter') return; o.len = clamp((o.len || 1.6) + d * 0.4, 0.8, 8); save(); render(); paintProps(); }
  function flashHint(msg) { var hn = document.getElementById('pf-hint'); if (hn) { hn.textContent = msg; setTimeout(function () { hn.textContent = toolHint(); }, 1800); } }
  function edit(field, val) {
    if (!sel || sel.kind !== 'bay') return; var b = getBay(sel.id); if (!b) return;
    b[field] = val;
    if (field === 'dir') { b.ncol = (val === 'h') ? 2 : 1; b.rows = (val === 'h') ? 2 : 5; clampBox(b); } // 向き切替で列数・行数を既定に
    save(); render(); paintProps();
  }
  function removeSel() {
    if (!sel) return;
    if (sel.kind === 'bay') { var i = bays().findIndex(function (b) { return b.id === sel.id; }); if (i >= 0) bays().splice(i, 1); }
    else {
      var id = sel.id; var j = shapes().findIndex(function (s) { return s.id === id; }); if (j >= 0) shapes().splice(j, 1);
      // 壁/建物を消したら、それに付いたドア/シャッターも消す
      state.floorPlan.shapes = shapes().filter(function (s) { return !(s.wallId === id || s.hostId === id); });
    }
    sel = null; save(); render(); paintProps();
  }
  function moveZ(dir) {
    var arr = sel && sel.kind === 'bay' ? bays() : shapes(); if (!sel) return;
    var i = arr.findIndex(function (x) { return x.id === sel.id; }); if (i < 0) return;
    var it = arr.splice(i, 1)[0]; if (dir > 0) arr.push(it); else arr.unshift(it);
    save(); render(); paintProps();
  }
  function toggleLock() { var o = selObj(); if (!o) return; o.locked = !o.locked; save(); render(); paintProps(); }

  // ===== 幾何 =====
  function nearestWall(cx, cy) {
    var best = null;
    walls().forEach(function (w) {
      var dx = w.x2 - w.x1, dy = w.y2 - w.y1, len2 = dx * dx + dy * dy;
      var t = len2 ? (((cx - w.x1) * dx + (cy - w.y1) * dy) / len2) : 0; t = clamp(t, 0, 1);
      var px = w.x1 + dx * t, py = w.y1 + dy * t, d = Math.hypot(cx - px, cy - py);
      if (!best || d < best.d) best = { w: w, t: t, d: d };
    });
    return best;
  }
  // ドア/シャッターの取付先＝「壁の線」または「建物の縁(4辺)」を共通の“辺”として扱う
  function edgeOf(a) {
    if (a.hostKind === 'bld') {
      var bld = getShape(a.hostId); if (!bld || bld.type !== 'building') return null;
      var x = bld.gx, y = bld.gy, X = bld.gx + bld.gw, Y = bld.gy + bld.gh;
      return [{ x1: x, y1: y, x2: X, y2: y }, { x1: X, y1: y, x2: X, y2: Y }, { x1: X, y1: Y, x2: x, y2: Y }, { x1: x, y1: Y, x2: x, y2: y }][a.edge] || null;
    }
    var w = getShape(a.hostId || a.wallId);
    return (w && w.type === 'wall') ? { x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 } : null;
  }
  function edgesList() {
    var arr = [];
    walls().forEach(function (w) { arr.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, ref: { hostKind: 'wall', hostId: w.id } }); });
    shapes().filter(function (s) { return s.type === 'building'; }).forEach(function (bld) {
      var x = bld.gx, y = bld.gy, X = bld.gx + bld.gw, Y = bld.gy + bld.gh, id = bld.id;
      arr.push({ x1: x, y1: y, x2: X, y2: y, ref: { hostKind: 'bld', hostId: id, edge: 0 } });
      arr.push({ x1: X, y1: y, x2: X, y2: Y, ref: { hostKind: 'bld', hostId: id, edge: 1 } });
      arr.push({ x1: X, y1: Y, x2: x, y2: Y, ref: { hostKind: 'bld', hostId: id, edge: 2 } });
      arr.push({ x1: x, y1: Y, x2: x, y2: y, ref: { hostKind: 'bld', hostId: id, edge: 3 } });
    });
    return arr;
  }
  function nearestEdge(cx, cy) {
    var best = null;
    edgesList().forEach(function (e) {
      var dx = e.x2 - e.x1, dy = e.y2 - e.y1, len2 = dx * dx + dy * dy;
      var t = len2 ? clamp(((cx - e.x1) * dx + (cy - e.y1) * dy) / len2, 0, 1) : 0;
      var px = e.x1 + dx * t, py = e.y1 + dy * t, d = Math.hypot(cx - px, cy - py);
      if (!best || d < best.d) best = { e: e, t: t, d: d };
    });
    return best;
  }
  function snapWall(sx, sy, ex, ey) {
    var f = fp();
    sx = clamp(Math.round(sx), 0, f.cols); sy = clamp(Math.round(sy), 0, f.rows);
    var dx = Math.round(ex) - sx, dy = Math.round(ey) - sy;
    if (dx === 0 && dy === 0) return { x1: sx, y1: sy, x2: sx, y2: sy };
    var ang = Math.atan2(dy, dx), step = Math.PI / 12, sa = Math.round(ang / step) * step, len = Math.sqrt(dx * dx + dy * dy);
    return { x1: sx, y1: sy, x2: clamp(Math.round(sx + Math.cos(sa) * len), 0, f.cols), y2: clamp(Math.round(sy + Math.sin(sa) * len), 0, f.rows) };
  }
  function cellAt(e) { var g = document.getElementById('pf-grid'), r = g.getBoundingClientRect(); return { cx: (e.clientX - r.left) / cell, cy: (e.clientY - r.top) / cell }; }

  // ===== ポインタ =====
  function onPointerDown(e) {
    var t = e.target, c = cellAt(e);
    var lk = t.getAttribute && t.getAttribute('data-lock');
    if (lk) { var pr = lk.split('|'); sel = { kind: pr[0], id: pr[1] }; var o = selObj(); if (o) { o.locked = !o.locked; } save(); render(); paintProps(); e.preventDefault(); return; }

    if (tool === 'flat' || tool === 'lift' || tool === 'building') { e.preventDefault(); placeAt(c.cx, c.cy); return; }
    if (tool === 'door' || tool === 'shutter') { e.preventDefault(); placeAttach(tool, c.cx, c.cy); return; }
    if (tool === 'wall') {
      e.preventDefault();
      var w = { id: uid('sh'), type: 'wall', x1: Math.round(c.cx), y1: Math.round(c.cy), x2: Math.round(c.cx), y2: Math.round(c.cy) };
      shapes().push(w); sel = { kind: 'shape', id: w.id }; drag = { type: 'wallnew', w: w, sx: c.cx, sy: c.cy };
      bind(); render(); paintProps(); return;
    }
    // 選択ツール
    var at = t.closest && (t.closest('[data-attach]') ? t.closest('[data-attach]').getAttribute('data-attach') : null);
    if (at) { var a = getShape(at); if (a) { sel = { kind: 'shape', id: a.id }; drag = { type: 'attach', a: a }; bind(); render(); paintProps(); } e.preventDefault(); return; }
    var wpt = t.getAttribute && t.getAttribute('data-wpt');
    if (wpt) { var p2 = wpt.split('|'); var ws = getShape(p2[0]); if (ws) { sel = { kind: 'shape', id: ws.id }; drag = { type: 'wallpt', w: ws, n: p2[1] }; bind(); render(); paintProps(); } e.preventDefault(); return; }
    var wl = t.getAttribute && t.getAttribute('data-wall');
    if (wl) { sel = { kind: 'shape', id: wl }; render(); paintProps(); return; }
    var rz = t.getAttribute && t.getAttribute('data-rz');
    if (rz) { var b = getBay(rz); if (b) { sel = { kind: 'bay', id: b.id }; drag = { type: 'resize', o: b }; bind(); } e.preventDefault(); return; }
    var rzs = t.getAttribute && t.getAttribute('data-rzs');
    if (rzs) { var sb = getShape(rzs); if (sb) { sel = { kind: 'shape', id: sb.id }; drag = { type: 'resize', o: sb }; bind(); } e.preventDefault(); return; }
    var pb = t.closest && t.closest('.pf-pit');
    if (pb) { var bb = getBay(pb.getAttribute('data-bay')); if (bb && !bb.locked) { sel = { kind: 'bay', id: bb.id }; drag = { type: 'move', o: bb, ox: c.cx - bb.gx, oy: c.cy - bb.gy }; bind(); render(); paintProps(); } e.preventDefault(); return; }
    var bd = t.closest && t.closest('.pf-building');
    if (bd) { var ss = getShape(bd.getAttribute('data-shape')); if (ss && !ss.locked) { sel = { kind: 'shape', id: ss.id }; drag = { type: 'move', o: ss, ox: c.cx - ss.gx, oy: c.cy - ss.gy }; bind(); render(); paintProps(); } e.preventDefault(); return; }
    sel = null; render(); paintProps();
  }
  function bind() { window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); }
  function unbind() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
  function onMove(e) {
    if (!drag) return; var f = fp(), c = cellAt(e);
    if (drag.type === 'move') { var o = drag.o; o.gx = clamp(Math.round((c.cx - drag.ox) * 2) / 2, 0, f.cols - o.gw); o.gy = clamp(Math.round((c.cy - drag.oy) * 2) / 2, 0, f.rows - o.gh); } // 位置は0.5マス刻み＝間隔を自由に
    else if (drag.type === 'resize') { var r = drag.o; if (r.kind) { var cw = Math.max(40, Math.round(cell * 2.6)) + 5, ch = Math.max(13, Math.round(cell * 0.92)) + 5; r.ncol = clamp(Math.round(((c.cx - r.gx) * cell) / cw), 1, 8); r.rows = clamp(Math.round(((c.cy - r.gy) * cell - cell * 0.6) / ch), 1, 8); } else { r.gw = clamp(Math.round(c.cx) - r.gx, 1, f.cols - r.gx); r.gh = clamp(Math.round(c.cy) - r.gy, 1, f.rows - r.gy); } } // PIT=列数だけ・カードは固定／建物=両方
    else if (drag.type === 'attach') { var nw = nearestEdge(c.cx, c.cy); if (nw && nw.d <= 1.4) { var a = drag.a; a.t = nw.t; a.hostKind = nw.e.ref.hostKind; a.hostId = nw.e.ref.hostId; if (nw.e.ref.edge != null) a.edge = nw.e.ref.edge; else delete a.edge; delete a.wallId; } }
    else if (drag.type === 'wallpt') { var w = drag.w; var ot = (drag.n === '1') ? { x: w.x2, y: w.y2 } : { x: w.x1, y: w.y1 }; var sn = snapWall(ot.x, ot.y, c.cx, c.cy); if (drag.n === '1') { w.x1 = sn.x2; w.y1 = sn.y2; } else { w.x2 = sn.x2; w.y2 = sn.y2; } }
    else if (drag.type === 'wallnew') { var s2 = snapWall(drag.sx, drag.sy, c.cx, c.cy); drag.w.x1 = s2.x1; drag.w.y1 = s2.y1; drag.w.x2 = s2.x2; drag.w.y2 = s2.y2; }
    render();
  }
  function onUp() {
    if (drag) {
      if (drag.type === 'wallnew' && drag.w.x1 === drag.w.x2 && drag.w.y1 === drag.w.y2) { var i = shapes().findIndex(function (s) { return s.id === drag.w.id; }); if (i >= 0) shapes().splice(i, 1); }
      drag = null; save(); render(); paintProps(); if (tool === 'wall') setTool('select');
    }
    unbind();
  }

  // サンプル工場（建物の外壁＋シャッター＋PIT＝1列5枚を2列に並べる）を一発で入れる
  function loadSample() {
    /* 🔵 v1.75.0 聞くのはアプリ内ダイアログ。中身は _go に切り出して呼ぶ。 */
    pitAsk('サンプルの工場レイアウトを読み込みますか？', { danger:true, ok:'読み込む', detail:'今の配置は置き換わります。' })
      .then(function(yes){ if (yes) _go(); });
    return;
    function _go(){
    var W = 22, H = 14, m = 0.4;
    var f = fp(); f.cols = W; f.rows = H;
    f.shapes = [
      { id: 'w_top', type: 'wall', x1: m, y1: m, x2: W - m, y2: m },
      { id: 'w_bot', type: 'wall', x1: m, y1: H - m, x2: W - m, y2: H - m },
      { id: 'w_left', type: 'wall', x1: m, y1: m, x2: m, y2: H - m },
      { id: 'w_right', type: 'wall', x1: W - m, y1: m, x2: W - m, y2: H - m },
      { id: 'sh_in', type: 'shutter', wallId: 'w_bot', t: 0.46 }
    ];
    var xs = [2, 6.5, 11, 15.5];
    var list = [];
    xs.forEach(function (x, i) { list.push({ id: uid('bay'), name: (i === 3 ? 'リフト' : 'PIT ' + (i + 1)), icon: '', kind: (i === 3 ? 'lift' : 'flat'), division: 'div1', gx: x, gy: 1.5, gw: 3, gh: 5 }); });
    xs.forEach(function (x, i) { list.push({ id: uid('bay'), name: (i === 0 ? 'リフト' : 'PIT ' + (i + 4)), icon: '', kind: (i === 0 ? 'lift' : 'flat'), division: 'div2', gx: x, gy: 8, gw: 3, gh: 5 }); });
    state.bays = list; sel = null; save();
    var sc = document.getElementById('pf-scale'); if (sc) sc.value = W;
    var lb = document.getElementById('pf-scale-lb'); if (lb) lb.textContent = '横' + W + 'マス';
    render(); paintProps();
    }
  }

  // 配置図を別ファイルに書き出し（バックアップ）／読み込み（復元）
  function exportPlan() {
    var data = JSON.stringify({ _type: 'pitflow-floorplan', savedAt: new Date().toISOString(), bays: bays(), floorPlan: fp() }, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'PIT配置図_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function importPlan() {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var fl = inp.files && inp.files[0]; if (!fl) return;
      pitAsk('読み込むと今の配置は置き換わります。よろしいですか？', { danger:true, ok:'読み込む' }).then(function(yes){
      if (!yes) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var d = JSON.parse(rd.result);
          if (Array.isArray(d.bays)) state.bays = d.bays;
          if (d.floorPlan && typeof d.floorPlan === 'object') state.floorPlan = d.floorPlan;
          ensureModel(); sel = null; save();
          var sc = document.getElementById('pf-scale'); if (sc) sc.value = fp().cols;
          var lb = document.getElementById('pf-scale-lb'); if (lb) lb.textContent = '横' + fp().cols + 'マス';
          render(); paintProps();
        } catch (e) { pitAlert('読み込みに失敗しました: ' + e.message, { code:'PF-9030' }); }
      };
      rd.readAsText(fl);
      });
    };
    inp.click();
  }

  // ===== 読み取り専用レンダラ（Pitリスト／PiP共通） =====
  // エディタと同じ幾何（壁・建物・ドア/シャッター・リフト飾り・bayMetrics）をそのまま使い、
  // 空きスロットの代わりに実カード（state.cards）をPIT枠にはめ込む。編集はしない。
  // opts = { cardsByBay:{bayId:[card,...]}, stage:HTMLElement(幅計測用), cell:固定セル, minCell }
  // フルカードの中身（2行・各バッジ＋ホバー詳細）。通常スロット(フル)と拡大カードで共用。
  function cardBody(c) {
    // ※古い title（代車期限・預かり日数・担当 等のネイティブtooltip）は撤去。情報はホバー情報カード(card-hover.js)で出す。
    var wts = (Array.isArray(c.workTypes) && c.workTypes.length) ? c.workTypes : (c.workType ? [c.workType] : []);
    var wt = (wts.length && window.state && Array.isArray(state.workTypes)) ? state.workTypes.find(function (w) { return w.id === wts[0]; }) : null;
    var wtBadge = wt ? '<span class="pfv-wt" style="background:' + wt.color + '22;color:' + wt.color + ';border-color:' + wt.color + '66">' + esc(wt.label) + '</span>' : '';
    var DROPC = { wait: '#f59e0b', sameDay: '#3b82f6' };
    var dt = (window.state && Array.isArray(state.dropTypes)) ? state.dropTypes.find(function (d) { return d.id === c.dropType; }) : null;
    var _dc = DROPC[dt && dt.id] || '#64748b';
    var dropBadge = (dt && (c.dropType2 || DROPC[dt.id])) ? (window.pitDropBadges ? pitDropBadges(c, function(o){ var dc = DROPC[o.id] || '#64748b'; return '<span class="pfv-wt" style="background:' + dc + '22;color:' + dc + ';border-color:' + dc + '66">' + esc(o.label) + '</span>'; }) : '<span class="pfv-wt" style="background:' + _dc + '22;color:' + _dc + ';border-color:' + _dc + '66">' + esc(dt.label) + '</span>') : '';
    var staff = c.frontStaff || c.staff || '';
    var loanerBadge = c.needLoaner ? '<span class="pfv-loaner">代車</span>' : '';
    /* 🔴 v1.104.0 自社（小林モータース）は狭い枠だと入らないので「コバモ」（pit-share.js の1本） */
    var staffNm = (window.pitStaffShort ? pitStaffShort(staff) : (window.pitSurname ? pitSurname(staff) : staff));
    var custNm = (window.pitCustSurname ? pitCustSurname(c) : (c.customer || '')) || '（未入力）';
    var staffBadge = staff ? '<span class="pfv-staff">' + esc(staffNm) + '</span>' : '';
    return '<span class="pfv-r"><b class="pfv-cn">' + esc(custNm) + ' 様</b><span class="pfv-badges">' + loanerBadge + dropBadge + wtBadge + '</span></span>'
      + '<span class="pfv-r"><b class="pfv-cc">' + esc(c.car || '') + '</b>' + staffBadge + '</span>';
  }
  function slotCard(c, m, dropVal) {
    var team = (c.boardId === 'import') ? '#ec4899' : '#1db97a';
    var fs = Math.max(7, Math.min(slotMaxFont, Math.floor((m.cardH - 4) / 2.4)));
    // 基準より小さい(=PiPで縮小)／2行が入らない → 車種だけの簡易表示（フォントは確保）
    var reduced = (slotZoom && fs < slotMaxFont) || ((m.cardH - 4) < fs * 2.4);
    // クリックは常に予約詳細を開く（1クリック拡大→もう1クリックで詳細、の旧挙動は廃止。情報はホバー情報カードで）
    var clickJs = 'if(window.openDetail)openDetail(\'' + c.id + '\')';
    var common = 'draggable="true" data-card-id="' + c.id + '" data-drop="baycell" data-drop-val="' + dropVal + '" onclick="' + clickJs + '"';
    if (reduced) {
      var carFont = Math.min(slotMaxFont, Math.max(8, Math.floor((m.cardH - 2) / 1.35)));   // 1行なので文字を確保
      return '<span class="pfv-card pfv-1line" ' + common + ' style="width:' + m.cardW + 'px;height:' + m.cardH + 'px;border-left-color:' + team + ';font-size:' + carFont + 'px">'
        + '<b class="pfv-cc">' + esc(c.car || '（車種未入力）') + '</b></span>';
    }
    return '<span class="pfv-card" ' + common + ' style="width:' + m.cardW + 'px;height:' + m.cardH + 'px;border-left-color:' + team + ';font-size:' + fs + 'px">'
      + cardBody(c) + '</span>';
  }
  // クリック→その場で拡大（フルカード・font12）→ もう一度クリックで詳細(openDetail)。背面は暗転。
  var PitCardZoom = (function () {
    var dimEl = null, cardEl = null, curId = null;
    function close() { if (dimEl) { dimEl.remove(); dimEl = null; } if (cardEl) { cardEl.remove(); cardEl = null; } curId = null; }
    function open(id, anchor) {
      close();
      var c = (window.state && Array.isArray(state.cards)) ? state.cards.find(function (x) { return x.id === id; }) : null;
      if (!c) { if (window.openDetail) openDetail(id); return; }
      var r = anchor.getBoundingClientRect();
      var team = (c.boardId === 'import') ? '#ec4899' : '#1db97a';
      dimEl = document.createElement('div'); dimEl.className = 'pcz-dim'; dimEl.onclick = close;
      cardEl = document.createElement('div'); cardEl.className = 'pfv-card pcz-card';
      cardEl.style.borderLeftColor = team;
      cardEl.innerHTML = cardBody(c);
      curId = id;
      cardEl.onclick = function (e) { e.stopPropagation(); var cid = curId; close(); if (window.openDetail) openDetail(cid); };
      document.body.appendChild(dimEl); document.body.appendChild(cardEl);
      var cw = cardEl.offsetWidth || 158, ch = cardEl.offsetHeight || 48;
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;   // その場（カード中心）で拡大
      cardEl.style.left = Math.max(8, Math.min(cx - cw / 2, window.innerWidth - cw - 8)) + 'px';
      cardEl.style.top = Math.max(8, Math.min(cy - ch / 2, window.innerHeight - ch - 8)) + 'px';
      cardEl.style.transform = 'scale(.9)';
      requestAnimationFrame(function () { if (cardEl) cardEl.style.transform = 'scale(1)'; });
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    return { open: open, close: close };
  })();
  window.PitCardZoom = PitCardZoom;
  function makeBayElStatic(b, opts) {
    var m = bayMetrics(b), col0 = divColor(b.division);
    var d = document.createElement('div');
    d.className = 'pf-box pf-pit pf-' + b.kind + ' pfv-bay';
    d.style.left = (b.gx * cell) + 'px'; d.style.top = (b.gy * cell) + 'px';
    d.style.width = m.w + 'px'; d.style.height = m.h + 'px';
    d.style.borderColor = col0; d.style.color = col0;
    d.setAttribute('data-drop', 'bay'); d.setAttribute('data-drop-val', b.id); // ドロップ先＝この枠
    var cards = (opts.cardsByBay && opts.cardsByBay[b.id]) || [];
    // 同枠内の並び順＝baySlot（小さい順）。未設定は後ろ（追加順）。
    cards = cards.slice().sort(function (x, y) { return (x.baySlot == null ? 1e9 : x.baySlot) - (y.baySlot == null ? 1e9 : y.baySlot); });
    var cap = m.ncol * m.rows;
    var h = '<div class="pf-box-hd" style="height:' + m.headH + 'px"><span class="pf-box-nm">' + (b.icon ? icoE(b.icon) + ' ' : '') + esc(b.name || '') + '</span></div>';
    h += '<div class="pf-cards" style="gap:' + m.gap + 'px;padding:' + m.pad + 'px">';
    var idx = 0;
    for (var cc = 0; cc < m.ncol; cc++) {
      h += '<div class="pf-cardcol" style="gap:' + m.gap + 'px">';
      for (var r = 0; r < m.rows; r++) {
        var card = cards[idx], dv = b.id + '|' + idx;
        h += card ? slotCard(card, m, dv)
                  : '<span class="pf-cardbar" data-drop="baycell" data-drop-val="' + dv + '" style="width:' + m.cardW + 'px;height:' + m.cardH + 'px"></span>';
        idx++;
      }
      h += '</div>';
    }
    h += '</div>';
    var over = cards.length > cap ? ('<span class="pfv-over">+' + (cards.length - cap) + '</span>') : '';
    h += over + '<span class="pf-cap" style="background:' + col0 + '">' + cards.length + '/' + cap + '</span>';
    d.innerHTML = h; return d;
  }
  // 内容（枠・建物・壁）の占有範囲をマス単位で算出。ノードの無い余白を自動カットするのに使う。
  // pad＝範囲の外周に足す余白（リフト飾りが枠の外に出る分を含める）。
  function contentBBox(pad) {
    var f = fp(), minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
    function ext(x0, y0, x1, y1) { any = true; if (x0 < minX) minX = x0; if (y0 < minY) minY = y0; if (x1 > maxX) maxX = x1; if (y1 > maxY) maxY = y1; }
    bays().forEach(function (b) { var m = bayMetrics(b); ext(b.gx, b.gy, b.gx + m.w / cell, b.gy + m.h / cell); });
    shapes().forEach(function (s) {
      if (s.type === 'building') ext(s.gx, s.gy, s.gx + s.gw, s.gy + s.gh);
      else if (s.type === 'wall') ext(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.x1, s.x2), Math.max(s.y1, s.y2));
      // ドア/シャッターは壁・建物の縁に付くので host の範囲に含まれる
    });
    if (!any) return { minX: 0, minY: 0, maxX: f.cols, maxY: f.rows };
    var p = (pad == null) ? 0.7 : pad;
    return {
      minX: Math.max(0, minX - p), minY: Math.max(0, minY - p),
      maxX: Math.min(f.cols, maxX + p), maxY: Math.min(f.rows, maxY + p)
    };
  }
  function renderStatic(grid, opts) {
    opts = opts || {};
    if (!grid) return;
    slotMaxFont = opts.maxFont || 13;   // カード文字の最大px（PiPは一回り小さく渡せる）
    slotAbbr = !!opts.abbrSmall;        // （旧）未使用
    slotZoom = !!opts.zoom;             // クリックで拡大→詳細（PiP=true）
    ensureModel();
    var f = fp(), savedSel = sel, savedTool = tool;
    sel = null; tool = 'select';                       // 選択ハイライト・編集ハンドルを出さない
    var crop = (opts.crop !== false);
    var bb;
    if (opts.fit && opts.stage) {
      // 内容全体が領域（幅・高さ両方）に収まる縮尺を決める。
      //  minCell未満なら下限で止めスクロール許容（Pitリスト）／minCell小ならスクロール無しで縮小（PiP）。
      var availW = opts.availW || opts.stage.clientWidth || 400;
      var availH = opts.availH || opts.stage.clientHeight || 300;
      var floorCell = opts.minCell || 8;
      cell = 44; bb = contentBBox(0.7);
      for (var it = 0; it < 4; it++) {                  // 枠幅がセル依存なので数回で収束
        var cwc = Math.max(1, bb.maxX - bb.minX), chr = Math.max(1, bb.maxY - bb.minY);
        var ce = Math.floor(Math.min((availW - 16) / cwc, (availH - 16) / chr));
        cell = Math.max(floorCell, ce);
        if (opts.maxCell) cell = Math.min(cell, opts.maxCell);
        bb = contentBBox(0.7);
      }
    } else {
      var avail = opts.cell ? 0 : (opts.width || (opts.stage && opts.stage.clientWidth) || grid.clientWidth || 900);
      // セルの大きさ（＝図の縮尺）は従来どおり。図は拡大せず、ノードの無い余白だけを切る。
      cell = opts.cell || Math.max(opts.minCell || 44, Math.floor((avail - 24) / f.cols));
      bb = contentBBox(0.7);
    }
    var ox = crop ? bb.minX : 0, oy = crop ? bb.minY : 0;
    var fullW = f.cols * cell, fullH = f.rows * cell;
    var cropW = crop ? (bb.maxX - bb.minX) * cell : fullW;
    var cropH = crop ? (bb.maxY - bb.minY) * cell : fullH;
    grid.style.width = cropW + 'px'; grid.style.height = cropH + 'px';
    grid.style.overflow = 'hidden';                    // 余白の外へはみ出した分を隠す
    grid.style.backgroundSize = cell + 'px ' + cell + 'px';
    grid.style.backgroundPosition = (-ox * cell) + 'px ' + (-oy * cell) + 'px';
    grid.innerHTML = '';
    // 内側レイヤを -ox,-oy だけずらす＝座標は原寸のまま余白だけ詰める
    var inner = document.createElement('div');
    inner.className = 'pfv-inner';
    inner.style.position = 'absolute'; inner.style.left = (-ox * cell) + 'px'; inner.style.top = (-oy * cell) + 'px';
    inner.style.width = fullW + 'px'; inner.style.height = fullH + 'px';
    grid.appendChild(inner);
    // 第1層：壁＋リフト飾り
    var s = '<svg class="pf-walls" width="' + fullW + '" height="' + fullH + '">';
    walls().forEach(function (w) { s += '<line x1="' + (w.x1 * cell) + '" y1="' + (w.y1 * cell) + '" x2="' + (w.x2 * cell) + '" y2="' + (w.y2 * cell) + '" stroke="#94a3b8" stroke-width="6" stroke-linecap="round"/>'; });
    bays().forEach(function (b) { if (b.kind === 'lift') s += liftDeco(b); });
    s += '</svg>';
    inner.innerHTML = s;
    // 建物（DOM）
    shapes().filter(function (x) { return x.type === 'building'; }).forEach(function (b) {
      var e = document.createElement('div'); e.className = 'pf-box pf-building pfv-static'; pos(e, b);
      e.innerHTML = '<span class="pf-box-tag">建物</span>'; inner.appendChild(e);
    });
    // 第2層：ドア/シャッター
    var s2 = '<svg class="pf-walls" width="' + fullW + '" height="' + fullH + '">';
    shapes().filter(function (x) { return x.type === 'door' || x.type === 'shutter'; }).forEach(function (a) { s2 += attachMarker(a); });
    s2 += '</svg>';
    inner.insertAdjacentHTML('beforeend', s2);
    // PIT枠（実カードをはめる）
    bays().forEach(function (b) { inner.appendChild(makeBayElStatic(b, opts)); });
    sel = savedSel; tool = savedTool;
  }
  window.PitFloorView = { render: renderStatic };

  window.PitFloorEditor = {
    open: open, close: close, setTool: setTool, edit: edit, removeSel: removeSel,
    exportPlan: exportPlan, importPlan: importPlan,
    toFront: function () { moveZ(1); }, toBack: function () { moveZ(-1); }, toggleLock: toggleLock,
    toggleDoor: toggleDoor, toggleDoorSide: toggleDoorSide, shutterLen: shutterLen,
    loadSample: loadSample,
    countPits: function () { ensureModel(); return bays().length; }
  };
  console.log('[pit-floor] v3 ready');
})();
