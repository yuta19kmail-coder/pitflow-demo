/* ========================================
   holidays.js  -  日本の祝日（PitFlow v0.3.0）
   ----------------------------------------
   出典：holidays-jp（https://holidays-jp.github.io/api/v1/date.json）
     ・APIキー不要・CORS許可・{"2026-01-01":"元日", ...} 形式。
   ・取得結果は localStorage にキャッシュ（7日で再取得）。
   ・取得できたら表示中ビューを再描画して祝日を反映。
   ・使い方：Holidays.name('2026-01-01') → "元日"（無ければ null）。
   ======================================== */
(function () {
  const LS  = 'pitflow_holidays_v1';
  const URL = 'https://holidays-jp.github.io/api/v1/date.json';
  const MAX_AGE = 7 * 24 * 60 * 60 * 1000;   // 7日

  const H = {
    map: {},
    loaded: false,
    name: function (ymdStr) { return H.map[ymdStr] || null; },
    is:   function (ymdStr) { return !!H.map[ymdStr]; },
  };

  function fromCache () {
    try {
      const o = JSON.parse(localStorage.getItem(LS) || 'null');
      if (o && o.map) { H.map = o.map; H.loaded = true; return o.at || 0; }
    } catch (e) {}
    return 0;
  }

  function rerender () {
    if (window.state && state.currentView && typeof showView === 'function') {
      try { showView(state.currentView); } catch (e) {}
    }
  }

  async function refresh () {
    try {
      const res = await fetch(URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('status ' + res.status);
      const data = await res.json();
      H.map = data; H.loaded = true;
      try { localStorage.setItem(LS, JSON.stringify({ at: Date.now(), map: data })); } catch (e) {}
      rerender();
      console.log('[Holidays] 取得 ' + Object.keys(data).length + ' 件');
    } catch (e) {
      console.warn('[Holidays] 取得失敗・キャッシュで継続', e);
    }
  }

  const at = fromCache();          // キャッシュは即利用
  if (Date.now() - at > MAX_AGE) refresh();   // 古ければ裏で更新

  window.Holidays = H;
})();
