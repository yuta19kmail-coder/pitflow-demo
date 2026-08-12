/* ========================================
   rules.js  -  <i data-ic=puzzle data-ics=16></i> 入庫ルール（入庫アルゴリズム設定ページ）／PitFlow v0.19.0
   ----------------------------------------
   ◎運用フロー（2026-06-04 ゆうた指示）
     閲覧モード（既定）＝現在適用中の内容を表示するだけ（誤操作で変わらない）
       → 「<i data-ic=pencil data-ics=16></i> 編集する」で編集モードへ＝現在の内容を丸っとコピー（下書き）
       → 目標・ルールをいじる → 下のプレビュー（2週間）で確認
       → 「<i data-ic=check data-ics=16></i> OKで反映」＝本番へ一括反映 ／ 「<i data-ic=close data-ics=16></i> やめる」＝捨てて元のまま
   ◎ページ構成
     ① 入庫の基本値（予約枠・売上目標・平均単価） ② 積み上げルール
     ③ 言葉の辞書（％） ④ 2週間ビジュアル（閲覧=現在適用中／編集=プレビュー）
   ◎計算仕様
     ％は合算して1回掛け。端数は減らす系=切り捨て・増やす系=切り上げ。
     「無くす」=0台。「<i data-ic=warn data-ics=16></i>注意表示」=文言のみ。理由（ルール#）を必ず表示。
   ◎保存：state.settings.reserveCap / target / unitPrice / rules / ruleDict（PitDB永続化）
     ※ ダッシュボード等が使う window.pitRulesFor / pitEffective は常に「反映済み（本番）」を読む。
       編集中の下書きはこのページのプレビューにしか影響しない。
   ======================================== */
(function () {

  /* ===== 語彙 ===== */
  const WHEN = [
    { id: 'weekend',     label: '土曜・日曜' },
    { id: 'dow6',        label: '土曜' },
    { id: 'dow0',        label: '日曜' },
    { id: 'dow1',        label: '月曜' },
    { id: 'dow2',        label: '火曜' },
    { id: 'dow3',        label: '水曜' },
    { id: 'dow4',        label: '木曜' },
    { id: 'dow5',        label: '金曜' },
    { id: 'q1',          label: '1期（1〜7日）' },
    { id: 'q2',          label: '2期（8〜15日）' },
    { id: 'q3',          label: '3期（16〜23日）' },
    { id: 'q4',          label: '4期（24〜31日）' },
    { id: 'preClosed',   label: '定休日の前日' },
    { id: 'postClosed',  label: '定休日の翌日' },
    { id: 'holiday',     label: '祝日' },
    { id: 'preHoliday',  label: '祝日の前日' },
    { id: 'postHoliday', label: '祝日の翌日' },
    { id: 'preBreak',    label: '長期休みの前1週間' },
    { id: 'postBreak',   label: '長期休み明け1週間' },
    { id: 'range',       label: '期間を指定…' },
  ];
  const TARGET = [
    { id: 'capDefault', label: '国産の予約枠' },
    { id: 'capImport',  label: '輸入の予約枠' },
    { id: 'capBoth',    label: '両チームの予約枠' },
    { id: 'drop',       label: '預かり入庫' },
    { id: 'sameDay',    label: '当日仕上げ' },
    { id: 'loanerDrop', label: '代車つき預かり' },
    { id: 'lotNormal',  label: '置き場の通常枠' },
  ];
  const ACTION = [
    { id: 'increase', label: '増やす',           grp: 'up' },
    { id: 'decrease', label: '減らす',           grp: 'down' },
    { id: 'careful',  label: '気を付ける',       grp: 'down' },
    { id: 'minimize', label: 'できる限り無くす', grp: 'down' },
    { id: 'zero',     label: '無くす（0にする）', grp: 'down' },
    { id: 'allow',    label: '許容する',         grp: 'up' },
    { id: 'warn',     label: '<i data-ic=warn data-ics=16></i> 注意表示',      grp: 'warn' },
  ];
  const DICT_LABEL = { increase: '増やす', decrease: '減らす', careful: '気を付ける', minimize: 'できる限り無くす', allow: '許容する' };
  const KEYS = ['reserveCap', 'target', 'unitPrice', 'rules', 'ruleDict', 'longBreaks', 'fuzzyRules'];

  /* ===== 下書き（編集モード） ===== */
  let _draft = null;
  function _editing() { return !!_draft; }
  function _cfg() { return _draft || state.settings; }   // このページの表示・プレビュー用

  function _mkDraft() {
    const s = state.settings;
    _draft = JSON.parse(JSON.stringify({
      reserveCap: s.reserveCap || { default: 5, import: 3 },
      target:     s.target     || { monthMin: 15000000, monthMax: 20000000 },
      unitPrice:  s.unitPrice  || { default: 83000, import: 130000 },
      rules:      s.rules      || [],
      ruleDict:   s.ruleDict   || { increase: 20, decrease: -20, careful: -15, minimize: -50, allow: 15 },
      longBreaks: s.longBreaks || [],
      fuzzyRules: s.fuzzyRules || [],
    }));
  }

  /* 🚫 v1.50.0 長期休み（お盆・年末年始）は **MHSの定休日カレンダー**（期間で入れた休み）が基準。
     PitFlow 側の longBreaks は編集できなくなった＝古いデータが残っていても見ない。 */
  function _breaks(cfg) { return (window.PitCal ? PitCal.breaks() : []); }

  /* その日が長期休み中なら該当の休みを返す */
  function _inBreak(cfg, dStr) {
    const bs = _breaks(cfg);
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.from && b.to && dStr >= b.from && dStr <= b.to) return b;
    }
    return null;
  }
  /* 長期休みの前nDays日間か（休み初日は含まない） */
  function _nearBreak(cfg, dStr, side, nDays) {
    const bs = _breaks(cfg);
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b.from || !b.to) continue;
      if (side === 'pre') {
        const from = _addDaysStr(b.from, -nDays);
        if (dStr >= from && dStr < b.from) return b;
      } else {
        const to = _addDaysStr(b.to, nDays);
        if (dStr > b.to && dStr <= to) return b;
      }
    }
    return null;
  }
  function _addDaysStr(ds, n) {
    const p = String(ds).split('-');
    const d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return _ds(d);
  }

  function _rules() {
    const c = _cfg();
    if (!c.rules) c.rules = [];
    return c.rules;
  }
  function _dict() {
    const c = _cfg();
    if (!c.ruleDict) c.ruleDict = { increase: 20, decrease: -20, careful: -15, minimize: -50, allow: 15 };
    return c.ruleDict;
  }

  /* ===== ヘルパー ===== */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function labelOf(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i].label;
    return id;
  }
  function actGrp(id) {
    for (let i = 0; i < ACTION.length; i++) if (ACTION[i].id === id) return ACTION[i].grp;
    return 'down';
  }
  function manStr(yen) {
    const v = Math.round(yen / 1000) / 10;
    return (v % 1 === 0) ? String(v) : v.toFixed(1);
  }
  function _holName(dStr) {
    return (window.Holidays && Holidays.name) ? Holidays.name(dStr) : null;
  }
  function _shift(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function _ds(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ===== 判定エンジン（cfg指定版＝内部用） ===== */

  function _match(r, d, dStr, cfg) {
    const dow = d.getDay(), day = d.getDate();
    /* 🚫 v1.50.0 「定休の前日／翌日」も MHS の営業日カレンダーで見る（臨時休業の前後も効く） */
    const closed = function (dt) { return window.PitCal ? PitCal.isClosed(_ds(dt)) : false; };
    switch (r.when) {
      case 'weekend':     return dow === 0 || dow === 6;
      case 'q1':          return day <= 7;
      case 'q2':          return day >= 8 && day <= 15;
      case 'q3':          return day >= 16 && day <= 23;
      case 'q4':          return day >= 24;
      case 'preClosed':   return closed(_shift(d, 1));
      case 'postClosed':  return closed(_shift(d, -1));
      case 'holiday':     return !!_holName(dStr);
      case 'preHoliday':  return !!_holName(_ds(_shift(d, 1)));
      case 'postHoliday': return !!_holName(_ds(_shift(d, -1)));
      case 'preBreak':    return !!_nearBreak(cfg, dStr, 'pre', 7);
      case 'postBreak':   return !!_nearBreak(cfg, dStr, 'post', 7);
      case 'range':       return !!(r.from && r.to && dStr >= r.from && dStr <= r.to);
      default:
        if (r.when && r.when.slice(0, 3) === 'dow') return dow === +r.when.slice(3);
        return false;
    }
  }

  function _rulesForC(cfg, dateStr) {
    const p = String(dateStr).split('-');
    const d = new Date(+p[0], +p[1] - 1, +p[2]);
    const dict = cfg.ruleDict || {};
    const out = { byTarget: {}, warns: [] };
    (cfg.rules || []).forEach(function (r, i) {
      if (r.on === false) return;
      if (!_match(r, d, dateStr, cfg)) return;
      if (r.action === 'warn') {
        out.warns.push({ no: i + 1, msg: r.note || '注意', target: r.target });
        return;
      }
      const tg = out.byTarget[r.target] = out.byTarget[r.target] || { pct: 0, zero: false, rules: [] };
      if (r.action === 'zero') { tg.zero = true; tg.rules.push(i + 1); return; }
      const pc = (dict[r.action] != null) ? dict[r.action] : 0;
      tg.pct += pc;
      tg.rules.push(i + 1);
    });
    return out;
  }

  function _effC(cfg, dateStr, target, base) {
    /* 入庫の枠（予約枠）は、長期休み・定休日＝営業していない日なので自動で0
       ※置き場(lotNormal)は対象外＝休み中も預かり車は置き場を使い続ける */
    if (target === 'capDefault' || target === 'capImport' || target === 'capBoth') {
      const br = _inBreak(cfg, dateStr);
      /* 🔴 v1.75.1（ゆうた報告「変な表記が出る」）**ここにアイコンのタグを混ぜない。**
         `closed` と `reason` は**文字として**使われる（確認の窓・トースト・title・表）。
         タグを入れると、そのまま `<i data-ic=parasol …>` と読めない文字で出る。
         ⚠ 飾りが要る場所は**出す側**で足すこと。中身（データ）は文字だけにする。 */
      if (br) return { value: 0, pct: -100, zero: true, rules: [], closed: (br.label || '長期休み') };
      /* 🚫 v1.50.0 休業日は MHS の定休日カレンダー（定休・祝休・臨時休業・特別営業まで込み） */
      if (window.PitCal && PitCal.isClosed(dateStr)) {
        return { value: 0, pct: -100, zero: true, rules: [], closed: PitCal.label(dateStr) || '定休日' };
      }
    }
    const rs = _rulesForC(cfg, dateStr);
    let pct = 0, zero = false, rules = [];
    function acc(x) { if (!x) return; pct += x.pct; zero = zero || x.zero; rules = rules.concat(x.rules); }
    acc(rs.byTarget[target]);
    if (target === 'capDefault' || target === 'capImport') acc(rs.byTarget.capBoth);
    if (zero) return { value: 0, pct: -100, zero: true, rules: rules };
    if (!rules.length) return { value: base, pct: 0, zero: false, rules: [] };
    let v = base * (1 + pct / 100);
    v = (pct < 0) ? Math.floor(v) : Math.ceil(v);
    if (v < 0) v = 0;
    return { value: v, pct: pct, zero: false, rules: rules };
  }

  /* 🤖 AI判定による「その日の枠」上書き（v0.25.1）
     state.aiVerdicts[日付].capD / .capI に台数が入っていれば、その日の実効枠として最優先。
     ＝本番化後、Claudeが毎朝「分母そのもの」を日々調整できる器。休（定休・連休）は上書き不可。 */
  function _aiCap(dStr, target) {
    const ai = (state.aiVerdicts || {})[dStr];
    if (!ai) return null;
    if (target === 'capDefault' && ai.capD != null) return ai.capD;
    if (target === 'capImport'  && ai.capI != null) return ai.capI;
    return null;
  }

  /* 公開版＝常に「反映済み（本番）」を読む。ダッシュボード等はこれを使う */
  window.pitRulesFor  = function (dateStr) { return _rulesForC(state.settings, dateStr); };
  window.pitEffective = function (dateStr, target, base) {
    const eff = _effC(state.settings, dateStr, target, base);
    if (eff.closed) return eff;   // 休みの日はAIでも開けない
    const ac = _aiCap(dateStr, target);
    if (ac != null) return Object.assign({}, eff, { value: ac, zero: ac <= 0, ai: true });
    return eff;
  };

  /* ===== 営業日ベースの期配分（2026-06-04 ゆうた設計）=====
     理論値は「月 − 定休日 − 長期休み」の営業日数で算出し、期（月4分割）へ営業日数比で再振り分け。
     ÷4の単純割りはしない。祝日は営業扱い（日曜営業の会社）。将来はMHS会社カレンダーに置換。
     休み直前・直後の増減は自動でやらず、別途ルールで積む（パーツが来ない等の現場事情はルール側）。 */

  function _isBizDay(cfg, dStr) {
    /* 🚫 v1.50.0 営業日かどうかは MHS の定休日カレンダーだけで決める */
    if (window.PitCal && PitCal.isClosed(dStr)) return false;
    if (_inBreak(cfg, dStr)) return false;
    return true;
  }

  function _qAllocC(cfg, y, m) {   // m=1〜12
    const tg = cfg.target || { monthMin: 15000000, monthMax: 20000000 };
    const last = new Date(y, m, 0).getDate();
    const qs = [{ f: 1, t: 7 }, { f: 8, t: 15 }, { f: 16, t: 23 }, { f: 24, t: last }];
    let total = 0;
    const out = qs.map(function (q) {
      let days = 0;
      for (let dd = q.f; dd <= q.t; dd++) {
        const ds = y + '-' + String(m).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
        if (_isBizDay(cfg, ds)) days++;
      }
      total += days;
      return { from: q.f, to: q.t, days: days };
    });
    out.forEach(function (q) {
      q.min = total ? Math.round(tg.monthMin * q.days / total) : 0;
      q.max = total ? Math.round(tg.monthMax * q.days / total) : 0;
    });
    return { total: total, q: out };
  }

  /* 公開版（本番設定で計算）：クォーター集計エンジン・ダッシュボードが使う */
  window.pitQAlloc = function (y, m) { return _qAllocC(state.settings, y, m); };

  /* ===== 📞 受付の○△×判定（v0.23.0）=====
     4層の流れ：①計算ルール層（枠・営業日）→ ②肌感ルール層（言葉＝AIの判断基準）
              → ③判定（いまは計算式の仮判定／本番化後はClaude APIが1日1回 state.aiVerdicts を更新）
              → ④人間の予約挿入（ラベルは見えるが強制しない＝従うか従わないかは受付の自由）
     AI判定（state.aiVerdicts[日付]）があればそれが優先。無ければ計算式の仮判定。 */

  function _bookCount(team, dStr) {   // その日の予約・入庫台数（返車済/廃車は除く）
    return (state.cards || []).filter(function (c) {
      return c.boardId === team && c.reserveDate === dStr && c.status !== 'returned' && c.status !== 'scrap';
    }).length;
  }

  function _verdictTeamC(cfg, dStr, team) {
    const rc = cfg.reserveCap || { default: 5, import: 3 };
    const tgt  = (team === 'import') ? 'capImport' : 'capDefault';
    const base = (team === 'import') ? (rc.import != null ? rc.import : 3) : (rc.default != null ? rc.default : 5);
    let eff = _effC(cfg, dStr, tgt, base);
    if (cfg === state.settings && !eff.closed) {   // AIの枠上書きは本番値のみ（編集プレビューには効かせない）
      const ac = _aiCap(dStr, tgt);
      if (ac != null) eff = Object.assign({}, eff, { value: ac, zero: ac <= 0 });
    }
    if (eff.closed) return { mark: '休', reason: eff.closed + '＝受付なし', cnt: 0, cap: 0, by: 'calc' };
    const cnt = _bookCount(team, dStr);
    const left = eff.value - cnt;
    let mark, reason;
    /* 🔴 v1.75.1 reason は**文字だけ**（アイコンのタグを混ぜない）。上の注記を参照。 */
    if (eff.zero)            { mark = '×'; reason = 'ルールで受付停止（' + eff.rules.map(function (n) { return '#' + n; }).join('・') + '）'; }
    else if (left <= 0)      { mark = '×'; reason = '枠が埋まりました（' + cnt + '/' + eff.value + '台）＝受付終了'; }
    else if (left === 1)     { mark = '△'; reason = '残り1台（' + cnt + '/' + eff.value + '台）'; }
    else                     { mark = '○'; reason = '空きあり（残り' + left + '台）'; }
    /* ⚠注意ルールがある日は ○ を △ に落とす（理由つき） */
    if (mark === '○') {
      const rs = _rulesForC(cfg, dStr);
      if (rs.warns.length) { mark = '△'; reason = rs.warns.map(function (w) { return w.msg; }).join('／'); }
    }
    return { mark: mark, reason: reason, cnt: cnt, cap: eff.value, by: 'calc' };
  }

  function _verdictC(cfg, dStr) {
    /* AI判定があれば優先（本番化後にClaude APIが書き込む。器＝v0.23.0） */
    const ai = (state.aiVerdicts || {})[dStr];
    const d = (ai && ai.default) ? Object.assign({ by: 'ai' }, ai.default) : _verdictTeamC(cfg, dStr, 'default');
    const i = (ai && ai.import)  ? Object.assign({ by: 'ai' }, ai.import)  : _verdictTeamC(cfg, dStr, 'import');
    /* 日全体のまとめ：両方休→休／両方×系→×／どちらかに△・×→△／それ以外→○ */
    let day;
    if (d.mark === '休' && i.mark === '休') day = '休';
    else if ((d.mark === '×' || d.mark === '休') && (i.mark === '×' || i.mark === '休')) day = '×';
    else if (d.mark !== '○' || i.mark !== '○') day = '△';
    else day = '○';
    return { default: d, import: i, day: day };
  }

  /* 公開版＝常に反映済み（本番）設定で判定。ダッシュボード・予約警告が使う */
  window.pitVerdict = function (dStr) { return _verdictC(state.settings, dStr); };

  /* ささやかなトースト（ブロックしないお知らせ） */
  window.pitToast = function (msg) {
    let el = document.getElementById('pit-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pit-toast';
      el.className = 'pit-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(window._pitToastT);
    window._pitToastT = setTimeout(function () { el.classList.remove('show'); }, 3200);
  };

  /* ===================================================================
     予約挿入ガード：×（受付終了）や 休（定休日）の日に入れようとしたら**一言聞く**（強制はしない）
     ／△＝トーストで一言だけ。
     -------------------------------------------------------------------
     🔴 v1.74.1（ゆうた報告）**ブラウザ純正の confirm を使っていた。**
        全アプリで「ブラウザ標準の confirm・prompt はやめる」と決めてある（2026-07-28）のに、
        ここだけ取り残されていた。**アプリ内ダイアログ（ui-dialog.js）に入れ替えた。**
     🔴 そのぶん**答えが返るのが後になる（非同期）**ので、形を
        「戻り値で返す」→「**決まったら done(日付) を呼ぶ**」に変えた。
        ⚠ 呼ぶ側（予約カレンダーのタップ・入庫日欄・ドラッグ）は**全部 done で受け取る**こと。
           古い書き方（戻り値を見る）だと、必ず「やめた」と同じ扱いになって日付が入らない。
     done(finalDate) … 入れてよい＝newDate／やめた＝oldDate（無ければ空）
     =================================================================== */
  window.pitIntakeGuard = function (card, newDate, oldDate, done) {
    const fin = (typeof done === 'function') ? done : function(){};
    if (!newDate || newDate === oldDate || !window.pitVerdict) { fin(newDate); return; }
    /* v1.19.0：過去の日付はそのまま通す。
       「もう入庫してしまった車をあとから記録する」ための日付なので、
       これから受け付けられるか（○△×・休業日）を聞いても意味がない。 */
    if (newDate < ymd(new Date())) { fin(newDate); return; }
    const v = pitVerdict(newDate);
    const team = (card && card.boardId === 'import') ? 'import' : 'default';
    const tv = v[team];
    const p = String(newDate).split('-');
    const dd = new Date(+p[0], +p[1] - 1, +p[2]);
    const dLabel = (dd.getMonth() + 1) + '/' + dd.getDate() + '（' + '日月火水木金土'[dd.getDay()] + '）';
    const tName = (team === 'import') ? '輸入' : '国産';
    if (tv.mark === '×' || tv.mark === '休') {
      /* 🔴 v1.75.1（ゆうた指定）**見出しは「何が起きているか」を素直な日本語で。**
         前は「8/14（金）の国産は 休業日です／理由：お盆休業＝受付なし」と、
         裏の言い回しがそのまま出ていて読みづらかった。
         ⚠ 日付・課・休みの名前は**下の小さい行**へ。見出しは1行で言い切る。 */
      const head = (tv.mark === '休')
        ? '選択した日は休業日に指定されています'
        : '選択した日は受付が終了しています';
      /* ⚠ 休みの日は見出しで「休業日」と言い切っているので、理由の末尾の「＝受付なし」は落とす
         （「お盆休業＝受付なし」と二重に言わない）。休みの**名前**だけを下の行に残す。 */
      let why  = (window.pitPlainText ? pitPlainText(tv.reason || '') : (tv.reason || ''));
      if (tv.mark === '休') why = why.replace(/＝受付なし\s*$/, '');
      why += (tv.by === 'ai' ? '（AI判定）' : '');
      const sub  = dLabel + '・' + tName + (why ? '　' + why : '');
      const msg  = 'それでも予約を入れますか？';
      if (window.pitAsk){
        pitAsk(head, { detail: sub + '\n\n' + msg + '（最終判断は人でOKです）',
                       ok: 'それでも入れる', cancel: 'やめる' })
          .then(function (ok) { fin(ok ? newDate : (oldDate || '')); });
        return;
      }
      /* 入口（ask-pit.js）が読み込めていない時だけの保険 */
      fin(window.confirm(head + '\n' + sub + '\n\n' + msg) ? newDate : (oldDate || ''));
      return;
    }
    /* ⚠ トーストも「文字だけ」の場所。念のため飾りを落としてから出す（v1.75.1）。 */
    if (tv.mark === '△') pitToast('△ ' + dLabel + ' ' + tName + '：' + (window.pitPlainText ? pitPlainText(tv.reason) : tv.reason));
    fin(newDate);
  };

  /* ===== 画面 ===== */

  window.renderRules = function () {
    const body = document.getElementById('view-rules-body');
    if (!body) return;
    const c = _cfg();
    const rc = c.reserveCap || { default: 5, import: 3 };
    const tg = c.target || { monthMin: 15000000, monthMax: 20000000 };
    const up = c.unitPrice || { default: 83000, import: 130000 };
    const rules = _rules();
    const dict = _dict();
    const ed = _editing();

    let h = '';

    /* モードバー */
    if (!ed) {
      h += '<div class="ps-bar"><span class="ps-bar-note">いま<b>適用中</b>の内容です。変更は「<i data-ic=pencil data-ics=16></i> 編集する」→ プレビュー確認 → OKで反映。</span>'
         + '<span class="ps-status" id="ps-status"></span>'
         + '<button class="vh-btn primary" onclick="pitRuleEditStart()"><i data-ic=pencil data-ics=16></i> 編集する</button></div>';
    } else {
      h += '<div class="ps-bar edit"><span class="rl-ebadge"><i data-ic=dot data-ics=12 style=color:#eab308></i> 編集中</span><span class="ps-bar-note">まだ<b>反映されていません</b>。下のプレビューで確認 → OKで全面反映／やめるで元のまま。</span>'
         + '<span class="ps-status" id="ps-status"></span>'
         + '<button class="vh-btn" onclick="pitRuleCancel()"><i data-ic=close data-ics=16></i> やめる（元に戻す）</button>'
         + '<button class="vh-btn primary" onclick="pitRuleOk()"><i data-ic=check data-ics=16></i> OKで反映</button></div>';
    }

    /* 🧮 目標 → 日の理論値（計算式カスケード・入れると下に流れて自動計算） */
    const ratioD = (tg.ratioD != null) ? tg.ratioD : 50;
    const upD0 = (up.default != null) ? up.default : 83000;
    const upI0 = (up.import != null) ? up.import : 130000;
    const rcD0 = (rc.default != null) ? rc.default : 5;
    const rcI0 = (rc.import != null) ? rc.import : 3;
    const _nowD = new Date();
    const _alloc0 = _qAllocC(c, _nowD.getFullYear(), _nowD.getMonth() + 1);
    const biz = _alloc0.total || 1;
    const dMin = tg.monthMin * ratioD / 100, dMax = tg.monthMax * ratioD / 100;
    const iMin = tg.monthMin - dMin, iMax = tg.monthMax - dMax;
    const cDmin = dMin / upD0, cDmax = dMax / upD0;
    const cImin = iMin / upI0, cImax = iMax / upI0;
    function f1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
    function man(x) { return Math.round(x / 10000); }
    function fxIn(id, val, w, step) {
      if (!ed) return '<b class="fx-v">' + val + '</b>';
      return '<input type="number" class="ps-in ps-num fx-in" id="' + id + '" value="' + val + '" style="width:' + (w || 64) + 'px"' + (step ? ' step="' + step + '"' : '') + ' onchange="pitRuleBaseApply()">';
    }

    h += '<div class="ps-card">';
    h += '<div class="ps-h"><i data-ic=calculator data-ics=16></i> 目標 → 日の理論値<span class="fx-note">固定値は年1回レベル／営業日・連休は毎月自動反映</span></div>';
    h += '<div class="fx">';
    h += '<div class="fx-row"><span class="fx-lb">売上目標（月）</span>' + fxIn('rb-tg-min', Math.round(tg.monthMin / 10000), 76) + '<span class="fx-u">万</span><span class="fx-u">〜</span>' + fxIn('rb-tg-max', Math.round(tg.monthMax / 10000), 76) + '<span class="fx-u">万</span></div>';
    h += '<div class="fx-arr">↓ 部門に分ける（国産 ' + fxIn('rb-ratio', ratioD, 56) + '<span class="fx-u">%</span><span class="fx-u">：輸入 ' + (100 - ratioD) + '%</span>）</div>';
    h += '<div class="fx-row"><span class="fx-lb">部門目標</span><span class="fx-pair"><i data-ic=car data-ics=16></i> <b>' + man(dMin) + '〜' + man(dMax) + '</b><span class="fx-u">万</span></span><span class="fx-pair"><i data-ic=globe data-ics=16></i> <b>' + man(iMin) + '〜' + man(iMax) + '</b><span class="fx-u">万</span></span></div>';
    h += '<div class="fx-arr">↓ 台単価で割る（<i data-ic=car data-ics=16></i> ' + fxIn('rb-up-d', manStr(upD0), 60, '0.1') + '<span class="fx-u">万</span>・<i data-ic=globe data-ics=16></i> ' + fxIn('rb-up-i', manStr(upI0), 60, '0.1') + '<span class="fx-u">万</span>＝実績3ヶ月平均に自動切替予定）</div>';
    h += '<div class="fx-row"><span class="fx-lb">月の入庫数</span><span class="fx-pair"><i data-ic=car data-ics=16></i> <b>' + Math.round(cDmin) + '〜' + Math.round(cDmax) + '</b><span class="fx-u">台</span></span><span class="fx-pair"><i data-ic=globe data-ics=16></i> <b>' + Math.round(cImin) + '〜' + Math.round(cImax) + '</b><span class="fx-u">台</span></span><span class="fx-pair dim">計 ' + Math.round(cDmin + cImin) + '〜' + Math.round(cDmax + cImax) + '台</span></div>';
    h += '<div class="fx-arr">↓ 営業日で割る（今月 <b>' + biz + '</b>日＝月−定休日−長期休み・自動）</div>';
    h += '<div class="fx-row fx-big"><span class="fx-lb">日の理論値</span><span class="fx-pair"><i data-ic=car data-ics=16></i> <b>' + f1(cDmin / biz) + '〜' + f1(cDmax / biz) + '</b><span class="fx-u">台/日</span></span><span class="fx-pair"><i data-ic=globe data-ics=16></i> <b>' + f1(cImin / biz) + '〜' + f1(cImax / biz) + '</b><span class="fx-u">台/日</span></span></div>';
    const okD = (rcD0 >= cDmax / biz) ? '<i data-ic=check data-ics=16></i>' : ((rcD0 >= cDmin / biz) ? '<i data-ic=dot data-ics=12 style=color:#eab308></i>' : '<i data-ic=dot data-ics=12 style=color:#ef4444></i>');
    const okI = (rcI0 >= cImax / biz) ? '<i data-ic=check data-ics=16></i>' : ((rcI0 >= cImin / biz) ? '<i data-ic=dot data-ics=12 style=color:#eab308></i>' : '<i data-ic=dot data-ics=12 style=color:#ef4444></i>');
    h += '<div class="fx-arr">↓ 予約枠（1日に受付できる上限）と比べる</div>';
    h += '<div class="fx-row"><span class="fx-lb">予約枠</span><span class="fx-pair"><i data-ic=car data-ics=16></i> ' + fxIn('rb-cap-d', rcD0, 56) + '<span class="fx-u">台</span> ' + okD + '</span><span class="fx-pair"><i data-ic=globe data-ics=16></i> ' + fxIn('rb-cap-i', rcI0, 56) + '<span class="fx-u">台</span> ' + okI + '</span><span class="fx-pair dim"><i data-ic=check data-ics=16></i>天井まで可｜<i data-ic=dot data-ics=12 style=color:#eab308></i>目標のみ｜<i data-ic=dot data-ics=12 style=color:#ef4444></i>不足</span></div>';
    h += '</div>';
    h += '</div>';

    /* 🏖 長期休み（🚫 v1.50.0 MHSの定休日カレンダーが基準＝ここでは直せない・見るだけ） */
    const brs = _breaks(c);
    h += '<div class="ps-card">';
    h += '<div class="ps-h" style="display:flex;align-items:center;gap:10px"><i data-ic=parasol data-ics=16></i> 長期休み（お盆・年末年始・GWなど）'
       + '<span class="rl-ebadge" style="margin-left:auto">MHSが基準</span></div>';
    h += '<div class="ps-desc"><b>MHSの定休日カレンダー</b>で「期間」で入れた休みがそのまま出ます。期間中＝受付自動0・営業日からも自動除外（置き場は使われたまま）。<b>直すのはMHS側</b>（管理▸定休日カレンダー）。</div>';
    h += PitCal.noticeHtml();
    if (!brs.length) {
      h += '<div class="ps-hint">登録なし。MHSの<b>管理▸定休日カレンダー</b>で「休業・期間」で入れると、ここに出ます。</div>';
    }
    brs.forEach(function (b) {
      h += '<div class="rl-row rl-vw"><span class="rl-no" style="background:#0e7490"><i data-ic=parasol data-ics=16></i></span><span class="rl-vtxt"><b>' + esc(b.label || '休み') + '</b>　' + esc(b.from || '?') + ' 〜 ' + esc(b.to || '?') + '</span></div>';
    });
    h += '<div class="ps-hint"><i data-ic=warn data-ics=16></i> 休み前週はパーツが来ない → 「長期休みの前1週間 × 預かり入庫 × 気を付ける」ルール推奨。</div>';
    h += '</div>';

    /* 📐 今月の配分（営業日ベース・自動計算）＋枠とのつじつまチェック */
    const _now = new Date();
    const _nowY = _now.getFullYear(), _nowM = _now.getMonth() + 1;
    const alloc = _qAllocC(c, _nowY, _nowM);
    const upD = (up.default != null) ? up.default : 83000;
    const upI = (up.import != null) ? up.import : 130000;
    const rcD = (rc.default != null) ? rc.default : 5;
    const rcI = (rc.import != null) ? rc.import : 3;
    function _qCapSum(q) {   // 期内の予約枠の合計台数（休み・定休・ルール適用後の実数）
      let s = 0;
      for (let dd = q.from; dd <= q.to; dd++) {
        const ds = _nowY + '-' + String(_nowM).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
        s += _effC(c, ds, 'capDefault', rcD).value + _effC(c, ds, 'capImport', rcI).value;
      }
      return s;
    }
    function _needCars(yen) {   // 目標金額→必要台数（部門比で分けて各単価で割る）
      return Math.round(yen * ratioD / 100 / upD + yen * (100 - ratioD) / 100 / upI);
    }
    h += '<div class="ps-card">';
    h += '<div class="ps-h"><i data-ic=ruler data-ics=16></i> 期への自動配分（' + _nowM + '月・営業日比' + (ed ? '＝プレビュー' : '') + '）</div>';
    h += '<table class="rl-alloc"><tr><th>期</th><th>営業日</th><th>目標</th><th>天井</th><th>入庫数</th><th>枠</th><th>判定</th></tr>';
    alloc.q.forEach(function (q, i) {
      const needMin = _needCars(q.min), needMax = _needCars(q.max);
      const capSum = _qCapSum(q);
      let judge;
      if (capSum >= needMax)      judge = '<span style="color:#1db97a"><i data-ic=check data-ics=16></i> 余裕</span>';
      else if (capSum >= needMin) judge = '<span style="color:#eab308"><i data-ic=dot data-ics=12 style=color:#eab308></i> 天井に届かない</span>';
      else                        judge = '<span style="color:#ef4444"><i data-ic=dot data-ics=12 style=color:#ef4444></i> 目標に足りない</span>';
      h += '<tr><td>' + (i + 1) + '期（' + q.from + '〜' + q.to + '日）</td><td>' + q.days + '日</td><td><b>' + Math.round(q.min / 10000) + '</b>万</td><td><b>' + Math.round(q.max / 10000) + '</b>万</td><td>' + needMin + '〜' + needMax + '台</td><td><b>' + capSum + '</b>台</td><td>' + judge + '</td></tr>';
    });
    h += '<tr><td class="dim">合計</td><td class="dim">' + alloc.total + '日</td><td class="dim">' + Math.round((c.target || {}).monthMin / 10000 || 0) + '万</td><td class="dim">' + Math.round((c.target || {}).monthMax / 10000 || 0) + '万</td><td class="dim"></td><td class="dim"></td><td class="dim"></td></tr>';
    h += '</table>';
    h += '<div class="ps-hint"><i data-ic=dot data-ics=12 style=color:#eab308></i><i data-ic=dot data-ics=12 style=color:#ef4444></i>の期＝枠が足りない → ルールで増やすか目標を調整（自動では上げない）。</div>';
    h += '</div>';

    /* ② 積み上げルール */
    h += '<div class="ps-card">';
    h += '<div class="ps-h" style="display:flex;align-items:center;gap:10px"><i data-ic=puzzle data-ics=16></i> 積み上げルール'
       + (ed ? '<button class="vh-btn primary" style="margin-left:auto" onclick="pitRuleAdd()">＋ ルールを追加</button>' : '')
       + '</div>';
    h += '<div class="ps-desc">上から全部足し算。<span style="color:#1db97a">緑＝増</span>／<span style="color:#ef4444">赤＝減</span>／<span style="color:#eab308">黄＝注意</span>。</div>';
    if (!rules.length) {
      h += '<div class="ps-hint">まだルールがありません。' + (ed ? '「＋ ルールを追加」で1つ目を積んでください。' : '「<i data-ic=pencil data-ics=16></i> 編集する」から追加できます。') + '<br>例：「土曜・日曜」は「国産の予約枠」を「増やす」／「定休日の前日」は「代車つき預かり」に「<i data-ic=warn data-ics=16></i>注意表示」。</div>';
    }
    rules.forEach(function (r, i) { h += ed ? _rowEditHtml(r, i) : _rowViewHtml(r, i); });
    h += '</div>';

    /* ③ 言葉の辞書 */
    h += '<div class="ps-card">';
    h += '<div class="ps-h"><i data-ic=book data-ics=16></i> 言葉の辞書（％）</div>';
    if (!ed) {
      h += '<div class="ps-desc">';
      h += Object.keys(DICT_LABEL).map(function (k) {
        const v = dict[k] != null ? dict[k] : 0;
        return DICT_LABEL[k] + ' <b>' + (v > 0 ? '+' : '') + v + '%</b>';
      }).join('　／　');
      h += '</div>';
    } else {
      h += '<div class="ps-grid">';
      Object.keys(DICT_LABEL).forEach(function (k) {
        h += '<label class="ps-lb">' + DICT_LABEL[k] + ' <input type="number" class="ps-in ps-num" id="rl-dict-' + k + '" value="' + (dict[k] != null ? dict[k] : 0) + '" min="-100" max="100" onchange="pitRuleDictApply()"><span class="ps-unit">%</span></label>';
      });
      h += '</div>';
      h += '<div class="ps-hint">※「無くす」は常に0台。端数は減らす系＝切り捨て・増やす系＝切り上げ。</div>';
    }
    h += '</div>';

    /* 🗣 肌感ルール（言葉のまま積む＝AIの判断基準層） */
    const fz = c.fuzzyRules || [];
    h += '<div class="ps-card">';
    h += '<div class="ps-h" style="display:flex;align-items:center;gap:10px"><i data-ic=comment data-ics=16></i> 肌感ルール（言葉のまま積む）'
       + (ed ? '<button class="vh-btn" style="margin-left:auto" onclick="pitFuzzyAdd()">＋ 肌感を追加</button>' : '')
       + '</div>';
    h += '<div class="ps-desc">計算式にできない現場の知恵を<b>そのままの言葉</b>で登録。上の<i data-ic=puzzle data-ics=16></i>ルール（数字）と違い、ここは<b>AIの判断基準</b>になる層＝％や台数に直さなくてOK。</div>';
    if (!fz.length) {
      h += '<div class="ps-hint">まだ登録なし。' + (ed ? '「＋ 肌感を追加」で1つ目を。' : '「<i data-ic=pencil data-ics=16></i> 編集する」から登録できます。') + '<br>例：「高額な作業が3台以上重なる週はメカがしんどいので控えめに」「常連の急ぎは多少無理しても受ける」</div>';
    }
    fz.forEach(function (f, i) {
      if (!ed) {
        h += '<div class="rl-row rl-vw' + (f.on === false ? ' off' : '') + '"><span class="rl-no" style="background:#7c3aed"><i data-ic=comment data-ics=16></i></span><span class="rl-vtxt">' + esc(f.text || '（未入力）') + '</span>' + (f.on === false ? '<span class="rl-offtag">停止中</span>' : '') + '</div>';
      } else {
        h += '<div class="rl-row' + (f.on === false ? ' off' : '') + '">';
        h += '<span class="rl-no" style="background:#7c3aed"><i data-ic=comment data-ics=16></i></span>';
        h += '<label class="rl-on" title="ON/OFF"><input type="checkbox"' + (f.on !== false ? ' checked' : '') + ' onchange="pitFuzzyEdit(' + i + ',\'on\',this.checked)"></label>';
        h += '<input type="text" class="ps-in rl-note" style="flex:1;min-width:240px" placeholder="現場の知恵をそのままの言葉で（例：休み前の週は重整備を控えめに）" value="' + esc(f.text || '') + '" onchange="pitFuzzyEdit(' + i + ',\'text\',this.value)">';
        h += '<button class="rl-del" title="削除" onclick="pitFuzzyDel(' + i + ')"><i data-ic=trash data-ics=16></i></button>';
        h += '</div>';
      }
    });
    h += '</div>';

    /* 🤖 AI判定（器・本番化後にClaude API接続） */
    const fzOn = fz.filter(function (f) { return f.on !== false; }).length;
    const rlOn = rules.filter(function (r) { return r.on !== false; }).length;
    const aiCnt = Object.keys(state.aiVerdicts || {}).length;
    h += '<div class="ps-card">';
    h += '<div class="ps-h" style="display:flex;align-items:center;gap:10px"><i data-ic=robot data-ics=16></i> AI判定（受付の○△×）<span class="rl-offtag" style="margin-left:auto">未接続＝本番化（Firebase）とセットで接続</span></div>';
    h += '<div class="ps-desc">流れ：<b>①計算ルール</b>（枠・営業日＝上のカード群）→ <b>②肌感ルール</b>（言葉）→ <b>③AIが1日1回、日別の○△×と理由を判定</b> → <b>④人が予約を入れる</b>（ラベルは見えるが強制しない）。</div>';
    h += '<div class="ps-hint">いまは③を<b>計算式の仮判定</b>で代用中（枠の埋まり具合から自動で○△×）。本番化後は Claude API がここの判定を毎朝更新し、肌感ルール' + fzOn + '件・<i data-ic=puzzle data-ics=16></i>ルール' + rlOn + '件・予約状況・通年達成率を読んで<b>理由つき</b>で判定します（1日1回更新＝月数百円の見込み）。AIは○△×ラベルだけでなく<b>その日の枠（分母）そのもの</b>も日々書き換えられます（例：国産5→4台。定休・連休だけはAIでも開けない）。'
       + (aiCnt ? '<br><i data-ic=robot data-ics=16></i> AI判定の保存数：' + aiCnt + '日分' : '') + '</div>';
    h += '</div>';

    /* ④ 2週間 */
    h += '<div class="ps-card">';
    h += '<div class="ps-h">' + (ed ? '<i data-ic=flask data-ics=16></i> プレビュー — OKで反映するとこうなる（2週間）' : '<i data-ic=calendar data-ics=16></i> これから2週間 — いま適用中の実効枠') + '</div>';
    h += '<div class="ps-desc">日をクリックで理由表示。<span style="color:#1db97a">緑＝増</span>／<span style="color:#f97316">橙＝減</span>／<span style="color:#ef4444">赤＝停止</span>。</div>';
    h += '<div id="rl-grid"></div>';
    h += '<div id="rl-test-out" class="rl-test-out" style="margin-top:12px"></div>';
    h += '</div>';

    body.innerHTML = h;
    pitRuleGrid();
    if (window._rlTestDate) pitRuleDay(window._rlTestDate);
  };

  /* 閲覧モードのルール行（文章で表示） */
  function _rowViewHtml(r, i) {
    let t = labelOf(WHEN, r.when);
    if (r.when === 'range') t = (r.from || '?') + '〜' + (r.to || '?');
    let h = '<div class="rl-row rl-vw act-' + actGrp(r.action) + (r.on === false ? ' off' : '') + '">';   // ※クラス名に view を使うとアプリの画面切替CSS(.view)と衝突するため rl-vw
    h += '<span class="rl-no">' + (i + 1) + '</span>';
    h += '<span class="rl-vtxt">「' + esc(t) + '」は「' + esc(labelOf(TARGET, r.target)) + '」を <b>' + esc(labelOf(ACTION, r.action)) + '</b>';
    if (r.action === 'warn' && r.note) h += '：「' + esc(r.note) + '」';
    h += '</span>';
    if (r.on === false) h += '<span class="rl-offtag">停止中</span>';
    h += '</div>';
    return h;
  }

  /* 編集モードのルール行（セレクト） */
  function _rowEditHtml(r, i) {
    let h = '<div class="rl-row act-' + actGrp(r.action) + (r.on === false ? ' off' : '') + '">';
    h += '<span class="rl-no">' + (i + 1) + '</span>';
    h += '<label class="rl-on" title="ON/OFF"><input type="checkbox"' + (r.on !== false ? ' checked' : '') + ' onchange="pitRuleEdit(' + i + ',\'on\',this.checked)"></label>';
    h += _sel(i, 'when', WHEN, r.when);
    if (r.when === 'range') {
      h += '<input type="date" class="ps-in" value="' + esc(r.from || '') + '" onchange="pitRuleEdit(' + i + ',\'from\',this.value)">';
      h += '<span class="rl-jo">〜</span>';
      h += '<input type="date" class="ps-in" value="' + esc(r.to || '') + '" onchange="pitRuleEdit(' + i + ',\'to\',this.value)">';
    }
    h += '<span class="rl-jo">は</span>';
    h += _sel(i, 'target', TARGET, r.target);
    h += '<span class="rl-jo">を</span>';
    h += _sel(i, 'action', ACTION, r.action);
    if (r.action === 'warn') {
      h += '<input type="text" class="ps-in rl-note" placeholder="受付に出す文言（例：返却が翌々日になる）" value="' + esc(r.note || '') + '" onchange="pitRuleEdit(' + i + ',\'note\',this.value)">';
    }
    h += '<button class="rl-del" title="削除" onclick="pitRuleDel(' + i + ')"><i data-ic=trash data-ics=16></i></button>';
    h += '</div>';
    return h;
  }

  function _sel(i, field, list, cur) {
    let s = '<select class="ps-in rl-sel" onchange="pitRuleEdit(' + i + ',\'' + field + '\',this.value)">';
    list.forEach(function (o) {
      s += '<option value="' + o.id + '"' + (o.id === cur ? ' selected' : '') + '>' + o.label + '</option>';
    });
    return s + '</select>';
  }

  /* ===== 編集モードの開始・確定・破棄 ===== */

  window.pitRuleEditStart = function () {
    _mkDraft();
    renderRules();
    _flash('編集モード（まだ反映されません）');
  };

  window.pitRuleOk = function () {
    if (!_draft) return;
    pitAsk('この内容で全面的に反映します。よろしいですか？', { ok:'反映する' }).then(function (yes) {
      if (!yes) return;
      KEYS.forEach(function (k) { state.settings[k] = _draft[k]; });
      _draft = null;
      if (window.PitDB) PitDB.save(true);
      renderRules();
      _flash('反映しました');
    });
  };

  window.pitRuleCancel = function () {
    if (!_draft) return;
    pitAsk('編集をやめて元に戻します。よろしいですか？', { danger:true, ok:'元に戻す', detail:'いじった内容は消えます。' }).then(function (yes) {
      if (!yes) return;
      _draft = null;
      renderRules();
      _flash('↩ 元に戻しました');
    });
  };

  /* ===== 編集ハンドラ（すべて下書きにだけ効く） ===== */

  window.pitRuleBaseApply = function () {
    if (!_draft) return;
    function rn(id, fb, min, max) {
      const el = document.getElementById(id);
      if (!el) return fb;
      let v = parseInt(el.value, 10);
      if (isNaN(v)) v = fb;
      if (v < min) v = min;
      if (v > max) v = max;
      el.value = v;
      return v;
    }
    function rf(id, fb, min, max) {
      const el = document.getElementById(id);
      if (!el) return fb;
      let v = parseFloat(el.value);
      if (isNaN(v)) v = fb;
      if (v < min) v = min;
      if (v > max) v = max;
      v = Math.round(v * 10) / 10;
      el.value = v;
      return v;
    }
    _draft.reserveCap = { default: rn('rb-cap-d', 5, 0, 99), import: rn('rb-cap-i', 3, 0, 99) };
    _draft.target = {
      monthMin: rn('rb-tg-min', 1500, 0, 99999) * 10000,
      monthMax: rn('rb-tg-max', 2000, 0, 99999) * 10000,
      ratioD:   rn('rb-ratio', 50, 1, 99),
    };
    if (_draft.target.monthMax < _draft.target.monthMin) _draft.target.monthMax = _draft.target.monthMin;
    _draft.unitPrice = { default: Math.round(rf('rb-up-d', 8.3, 0.1, 999) * 10000), import: Math.round(rf('rb-up-i', 13, 0.1, 999) * 10000) };
    renderRules();   // カスケードの自動計算を全部更新
    _flash('プレビューに反映（未確定）');
  };

  window.pitRuleAdd = function () {
    if (!_draft) return;
    _rules().push({ on: true, when: 'weekend', target: 'capDefault', action: 'increase', note: '' });
    renderRules();
    _flash('追加（未確定）');
  };

  window.pitRuleEdit = function (i, field, val) {
    if (!_draft) return;
    const r = _rules()[i];
    if (!r) return;
    if (field === 'on') r.on = !!val;
    else r[field] = val;
    renderRules();
    _flash('プレビューに反映（未確定）');
  };

  window.pitRuleDel = function (i) {
    if (!_draft) return;
    const r = _rules()[i];
    if (!r) return;
    _rules().splice(i, 1);
    renderRules();
    _flash('削除（未確定・OKで確定）');
  };

  /* 🚫 v1.50.0 長期休みは MHS の定休日カレンダーが基準になったので、ここでは編集しない。
     古い画面やブックマークから呼ばれても壊れないよう、入口だけ残して案内を出す。 */
  function _breakMoved() {
    _flash('長期休みはMHSの「管理▸定休日カレンダー」で設定します');
  }
  window.pitBreakAdd  = _breakMoved;
  window.pitBreakEdit = _breakMoved;
  window.pitBreakDel  = _breakMoved;

  /* 🗣 肌感ルールの編集（下書きにだけ効く） */
  window.pitFuzzyAdd = function () {
    if (!_draft) return;
    if (!_draft.fuzzyRules) _draft.fuzzyRules = [];
    _draft.fuzzyRules.push({ on: true, text: '' });
    renderRules();
    _flash('追加（未確定）');
  };
  window.pitFuzzyEdit = function (i, field, val) {
    if (!_draft) return;
    const f = (_draft.fuzzyRules || [])[i];
    if (!f) return;
    if (field === 'on') f.on = !!val;
    else f[field] = val;
    renderRules();
    _flash('プレビューに反映（未確定）');
  };
  window.pitFuzzyDel = function (i) {
    if (!_draft) return;
    (_draft.fuzzyRules || []).splice(i, 1);
    renderRules();
    _flash('削除（未確定・OKで確定）');
  };

  window.pitRuleDictApply = function () {
    if (!_draft) return;
    const dict = _dict();
    Object.keys(DICT_LABEL).forEach(function (k) {
      const el = document.getElementById('rl-dict-' + k);
      if (!el) return;
      let v = parseInt(el.value, 10);
      if (isNaN(v)) v = dict[k] || 0;
      if (v < -100) v = -100;
      if (v > 100) v = 100;
      el.value = v;
      dict[k] = v;
    });
    _flash('プレビューに反映（未確定）');
    pitRuleGrid();
    if (window._rlTestDate) pitRuleDay(window._rlTestDate);
  };

  /* ===== 2週間グリッド（cfg＝閲覧:本番／編集:下書き） ===== */

  window.pitRuleGrid = function () {
    const box = document.getElementById('rl-grid');
    if (!box) return;
    const c = _cfg();
    const rc = c.reserveCap || { default: 5, import: 3 };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 0; i < 14; i++) days.push(_shift(today, i));

    function cellCls(eff) {
      if (eff.zero) return ' stop';
      if (eff.pct > 0) return ' up';
      if (eff.pct < 0) return ' down';
      return '';
    }

    let g = '<div class="rl-grid" style="grid-template-columns:88px repeat(' + days.length + ',1fr)">';
    g += '<div class="rl-g-h"></div>';
    days.forEach(function (d) {
      const ds = _ds(d);
      const hol = _holName(ds);
      const closed = (window.PitCal ? PitCal.isClosed(ds) : false);
      const brk = _inBreak(c, ds);
      const cls = (d.getDay() === 0 || hol || brk) ? ' red' : (d.getDay() === 6 ? ' sat' : '');
      g += '<div class="rl-g-h' + cls + (window._rlTestDate === ds ? ' sel' : '') + '" onclick="pitRuleDay(\'' + ds + '\')">' + (d.getMonth() + 1) + '/' + d.getDate() + '<br>' + '日月火水木金土'[d.getDay()] + (brk ? '・連休' : (closed ? '・休' : '')) + '</div>';
    });
    g += '<div class="rl-g-n"><i data-ic=car data-ics=16></i> 国産枠</div>';
    days.forEach(function (d) {
      const ds = _ds(d);
      const eff = _effC(c, ds, 'capDefault', rc.default != null ? rc.default : 5);
      g += '<div class="rl-g-c' + (eff.closed ? ' closed' : cellCls(eff)) + (window._rlTestDate === ds ? ' sel' : '') + '" onclick="pitRuleDay(\'' + ds + '\')">' + (eff.closed ? '休' : (eff.zero ? '停' : eff.value)) + '</div>';
    });
    g += '<div class="rl-g-n"><i data-ic=globe data-ics=16></i> 輸入枠</div>';
    days.forEach(function (d) {
      const ds = _ds(d);
      const eff = _effC(c, ds, 'capImport', rc.import != null ? rc.import : 3);
      g += '<div class="rl-g-c' + (eff.closed ? ' closed' : cellCls(eff)) + (window._rlTestDate === ds ? ' sel' : '') + '" onclick="pitRuleDay(\'' + ds + '\')">' + (eff.closed ? '休' : (eff.zero ? '停' : eff.value)) + '</div>';
    });
    g += '<div class="rl-g-n"><i data-ic=warn data-ics=16></i> 注意</div>';
    days.forEach(function (d) {
      const ds = _ds(d);
      const rs = _rulesForC(c, ds);
      g += '<div class="rl-g-c wmark' + (window._rlTestDate === ds ? ' sel' : '') + '" onclick="pitRuleDay(\'' + ds + '\')">' + (rs.warns.length ? '<i data-ic=warn data-ics=16></i>' + (rs.warns.length > 1 ? rs.warns.length : '') : '') + '</div>';
    });
    g += '<div class="rl-g-n"><i data-ic=phone data-ics=16></i> 受付</div>';
    days.forEach(function (d) {
      const ds = _ds(d);
      const v = _verdictC(c, ds);
      const cls = (v.day === '○') ? ' vd-ok' : (v.day === '△') ? ' vd-mid' : (v.day === '×') ? ' vd-ng' : ' closed';
      g += '<div class="rl-g-c'+ cls + (window._rlTestDate === ds ? ' sel': '') + '" onclick="pitRuleDay(\''+ ds + '\')"title="'+ v.default.mark + '／'+ v.import.mark + '">'+ v.day + '</div>';
    });
    g += '</div>';
    box.innerHTML = g;
  };

  /* 日クリック → 理由つき詳細 */
  window.pitRuleDay = function (dStr) {
    window._rlTestDate = dStr;
    const out = document.getElementById('rl-test-out');
    if (!out) return;
    const c = _cfg();
    const rc = c.reserveCap || { default: 5, import: 3 };
    const lc = state.settings.lotCap || { pit: 4, yard: 12, parking: 8, extra: 4 };
    const lotNormal = (lc.pit || 0) + (lc.yard || 0) + (lc.parking || 0);
    const rs = _rulesForC(c, dStr);
    const p = dStr.split('-');
    const dd = new Date(+p[0], +p[1] - 1, +p[2]);

    function line(label, target, base, unit) {
      const e = _effC(c, dStr, target, base);
      let t = '<div class="rl-tl"><span class="rl-tl-n">' + label + '</span>';
      if (e.closed) t += '<span class="rl-tl-v stop">休（' + esc(e.closed) + '＝受付なし）</span>';
      else if (e.zero) t += '<span class="rl-tl-v stop">停止(0' + unit + ')</span>';
      else if (e.rules.length) t += '<span class="rl-tl-v">' + base + ' → <b>' + e.value + unit + '</b>(' + (e.pct > 0 ? '+' : '') + e.pct + '%)</span>';
      else t += '<span class="rl-tl-v">' + base + unit + '(基本のまま)</span>';
      if (e.rules.length) t += '<span class="rl-tl-r">ルール ' + e.rules.map(function (n) { return '#' + n; }).join('・') + ' が効いています</span>';
      return t + '</div>';
    }
    function policyLine(label, target) {
      const t = rs.byTarget[target];
      if (!t) return '';
      const txt = t.zero ? '受けない（0）' : ('方針 ' + (t.pct > 0 ? '+' : '') + t.pct + '%');
      return '<div class="rl-tl"><span class="rl-tl-n">' + label + '</span><span class="rl-tl-v">' + txt + '</span><span class="rl-tl-r">ルール ' + t.rules.map(function (n) { return '#' + n; }).join('・') + ' が効いています</span></div>';
    }

    const dayBrk = _inBreak(c, dStr);
    let h = '<div class="rl-day-t"><i data-ic=calendar data-ics=16></i> ' + (dd.getMonth() + 1) + '月' + dd.getDate() + '日（' + '日月火水木金土'[dd.getDay()] + '）' + (_holName(dStr) ? '・<i data-ic=flag data-ics=16></i>' + esc(_holName(dStr)) : '') + (dayBrk ? '・<i data-ic=parasol data-ics=16></i>' + esc(dayBrk.label || '長期休み') : '') + (_editing() ? '<span class="rl-ebadge" style="margin-left:8px">プレビュー</span>' : '') + ' の中身</div>';
    if (dayBrk) h += '<div class="ps-hint" style="margin:0 0 8px"><i data-ic=parasol data-ics=16></i> 長期休み中＝入庫受付なし。預かり中の車は置き場を使い続けます（置き場の通常枠は生きたまま）。</div>';
    h += line('予約枠（国産）', 'capDefault', rc.default != null ? rc.default : 5, '台');
    h += line('予約枠（輸入）', 'capImport', rc.import != null ? rc.import : 3, '台');
    h += line('置き場の通常枠', 'lotNormal', lotNormal, '台');
    h += policyLine('預かり入庫', 'drop');
    h += policyLine('当日仕上げ', 'sameDay');
    h += policyLine('代車つき預かり', 'loanerDrop');
    rs.warns.forEach(function (w) {
      h += '<div class="rl-tl warn"><span class="rl-tl-n"><i data-ic=warn data-ics=16></i> ' + esc(labelOf(TARGET, w.target)) + '</span><span class="rl-tl-v">' + esc(w.msg) + '</span><span class="rl-tl-r">ルール #' + w.no + '</span></div>';
    });
    /* 📞 受付の○△×（仮判定＝枠の埋まり具合。AI判定が保存されていればそちらを表示） */
    const vd = _verdictC(c, dStr);
    [{ k: 'default', n: '<i data-ic=phone data-ics=16></i> 受付（国産）' }, { k: 'import', n: '<i data-ic=phone data-ics=16></i> 受付（輸入）' }].forEach(function (t) {
      const tv = vd[t.k];
      const col = (tv.mark === '○') ? '#1db97a' : (tv.mark === '△') ? '#f97316' : '#ef4444';
      h += '<div class="rl-tl"><span class="rl-tl-n">' + t.n + '</span><span class="rl-tl-v"><b style="color:' + col + '">' + tv.mark + '</b>　' + esc(tv.reason) + '</span><span class="rl-tl-r">' + (tv.by === 'ai' ? '<i data-ic=robot data-ics=16></i> AI判定' : '計算式の仮判定（本番化後はAIが理由を書く）') + '</span></div>';
    });
    out.innerHTML = h;
    pitRuleGrid();
  };

  function _flash(msg) {
    const el = document.getElementById('ps-status');
    if (el) {
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(window._rlFlashT);
      window._rlFlashT = setTimeout(function () { el.classList.remove('show'); }, 2200);
    }
  }

})();
