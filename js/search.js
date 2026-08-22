/* ========================================
   search.js  -  マスター検索（PitFlow v0.65.0）
   ----------------------------------------
   ダッシュボード最上部の「検索」BOX。手元の小さな手がかり（名前・カナ・車・
   メーカー・ナンバー・予約番号・代車・日付・担当・メモ・電話）から全カードを
   横断検索し、ヒットしたカードをクリックで開く。
   ・スペース区切りで複数語＝すべて含む（AND）。例「6/13 アクア」
   ・日付は 2026-06-13 / 6/13 / 0613 / 20260613 などの表記でも当たる
   ・代車は「代車3」「L03」やナンバーでも、その代車を使っているカードに当たる
   ======================================== */
(function () {
  'use strict';

  // 表示先（ダッシュボード / マイダッシュボード で入力欄・結果欄が別idのため差替え可能に）。
  // 既定は従来のダッシュボード。各入力欄の onfocus で pitSearchBind() を呼んで切り替える。
  var ST = { wrap: 'pit-search-wrap', input: 'pit-search-input', results: 'pit-search-results' };
  window.pitSearchBind = function (wrap, input, results) {
    ST = { wrap: wrap || ST.wrap, input: input || ST.input, results: results || ST.results };
  };

  // 正規化：空白除去・全角英数→半角・カタカナ→ひらがな・小文字化
  function norm(s) {
    return (s == null ? '' : String(s))
      .replace(/\s+/g, '')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .toLowerCase();
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 🔴 v1.102.0（ゆうた報告「新規予約での検索の結果が薄い」）
     **探し方（文字のならし方・スペース区切りのAND）をここから配る。**
     ＝新規予約の「呼び出し」（customers.js の custSuggest）が**同じ規則**で探せるようにする。
     ⚠ 向こうに書き写さないこと。写した瞬間、片方だけ直して「マスター検索では出るのに呼び出しでは出ない」が戻る。
       ・pitSearchNorm(s)   … 空白を消す／全角英数→半角／カタカナ→ひらがな／小文字
       ・pitSearchWords(q)  … スペースで区切って語にする（全部含む＝AND） */
  window.pitSearchNorm = norm;
  window.pitSearchWords = function (qStr) {
    const raw = String(qStr || '').trim();
    return raw ? raw.split(/\s+/).map(norm).filter(Boolean) : [];
  };
  /* ================================================================
     🔴🔴 v1.176.0（ゆうた指定 2026-08-22）**当たった所を塗る。**
     🗣「検索がヒットした時に**どこが当たってるのか**ハイライト表示。
     　　例えばナンバーで **920** で検索した時に **9/20** とかでヒットして
     　　？？？って迷って意外とはかどらない」
     ◎なにが困っていたか
       探し方は**全部つなげた1本の文字列**（`cardBlob`）に対する当たり判定なので、
       **どの欄で当たったのかが画面に一切出ていなかった**。
       ナンバーのつもりで打った数字が**日付**に当たっても、行を見ても分からない。
     🔴 **拾う範囲（何がヒットするか）は1文字も変えない。** 見えるようにするだけ。
     ================================================================ */

  /* ならし（norm）と同じことを1文字ずつやって、**元の文字の位置**を覚えておく。
     ⚠ norm は空白を消すので、そのままだと「ならした後の位置」から元の位置に戻れない。 */
  function normIndex(s) {
    var raw = (s == null ? '' : String(s));
    var out = '', idx = [];
    for (var i = 0; i < raw.length; i++) {
      var ch = raw[i];
      if (/\s/.test(ch)) continue;                      /* 空白は消す（norm と同じ） */
      ch = ch.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
             .replace(/[ァ-ヶ]/g,        function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
             .toLowerCase();
      for (var k = 0; k < ch.length; k++) { out += ch[k]; idx.push(i); }   /* 1文字が2文字になる字もある */
    }
    return { n: out, idx: idx, raw: raw };
  }

  /* 当たった所を <mark> で塗った HTML を返す（当たらなければ、ただの esc と同じ）。
     🔴 **塗るのは元の字**（ならした字ではない）＝画面の見た目は変わらない。 */
  function markHits(raw, words) {
    var text = (raw == null ? '' : String(raw));
    if (!text || !words || !words.length) return esc(text);
    var M = normIndex(text);
    if (!M.n) return esc(text);
    var hit = [];                                       /* 塗る場所（元の字の位置） */
    words.forEach(function (w) {
      if (!w) return;
      var from = 0, at;
      while ((at = M.n.indexOf(w, from)) >= 0) {
        var s0 = M.idx[at], e0 = M.idx[at + w.length - 1];
        if (s0 != null && e0 != null) hit.push([s0, e0 + 1]);
        from = at + 1;                                  /* 重なりも拾う */
      }
    });
    if (!hit.length) return esc(text);
    hit.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];                                    /* 重なった塗りはつなげる */
    hit.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) { if (r[1] > last[1]) last[1] = r[1]; }
      else merged.push([r[0], r[1]]);
    });
    var html = '', pos = 0;
    merged.forEach(function (r) {
      html += esc(text.slice(pos, r[0])) + '<mark class="psr-hit">' + esc(text.slice(r[0], r[1])) + '</mark>';
      pos = r[1];
    });
    return html + esc(text.slice(pos));
  }

  /* どの欄で当たったか（欄の名前を、出てきた順で重複なしに）。
     🔴 欄の表は `cardFields` / `custFields` の1本。**画面で組み立てない。**
     🔴🔴 日付は「9/20」「0920」のような**別の書き方でも当たる**作りなので、
        当たった書き方（`as`）も一緒に返す。＝ **920 でナンバーのつもりが 9/20 に当たった**時に、
        画面の「2026-09-20」を見ても分からない、というのが今回の困りごとそのもの。 */
  function whereHits(fields, words) {
    var out = [], seen = {};
    (fields || []).forEach(function (f) {
      var n = norm(f.text);
      if (!n) return;
      var any = (words || []).some(function (w) { return w && n.indexOf(w) >= 0; });
      if (!any) return;
      if (seen[f.label]) return;
      seen[f.label] = 1; out.push({ label: f.label, as: f.as || '' });
    });
    return out;
  }

  /* 🔴 v1.176.0 新規予約の「呼び出し」からも同じものを使う（あちらに書き写さない） */
  window.pitSearchMark  = markHits;
  window.pitSearchWhere = whereHits;

  // N日前の日付文字列（YYYY-MM-DD）＝返車済みの「直近1か月」判定に使う
  function _daysAgoStr(n) {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // ステータスの日本語ラベル
  function statusLabel(c) {
    if (c.status === 'reserved') return '予約';
    /* 🔴 v1.101.0 キャンセル＝人が決めたもの／未入庫＝来なかっただけ。**別物なので言い分ける。**
       🔴 v1.164.0 言葉は pit-share.js の `pitCancelText` から借りる（ここで綴らない）。
          ⚠ 直す前はここだけ「キャンセル」で、カード詳細の札は「予約キャンセル」だった。 */
    if (c.status === 'cancelled') return window.pitCancelText ? pitCancelText(c) : (c.cancelled ? '予約キャンセル' : '未入庫');
    /* 🔴 v1.99.0 売上なしでアーカイブした車は、探した人が取り違えないよう「売上なし」と言い切る */
    if (window.pitCardNoSale && pitCardNoSale(c)) return '売上なし';
    if (c.status === 'returned') return '返車済み';
    const board = (state.boards || []).find(b => b.id === c.boardId) || (state.boards || [])[0];
    const col = board && (board.cols || []).find(x => x.id === c.status);
    return col ? col.name : (c.status || '');
  }
  function teamLabel(c) { return c.boardId === 'import' ? '輸入車' : (c.boardId === 'default' ? '国産車' : ''); }

  // 日付を複数表記で検索対象に（2026-06-13 / 6/13 / 06/13 / 0613 / 20260613）
  function dateForms(d) {
    if (!d) return [];
    const p = String(d).split('-');
    if (p.length !== 3) return [d];
    const y = p[0], m = p[1], day = p[2];
    return [d, m + '/' + day, (+m) + '/' + (+day), m + day, y + m + day];
  }

  /* 🔴🔴 v1.176.0 **カード1枚の「検索の材料」を、欄の名前つきの表にした。**
     ＝ 探すのに使う文字と、「どの欄で当たったか」を出す元が**同じ1本**になる。
     ⚠ 中身（拾う範囲）は**1文字も変えていない**。名前を付けて並べ替えただけ。
     　 ここに欄を足す＝検索に当たる範囲が広がる、ということ。 */
  function cardFields(c) {
    const F = [];
    const add = (label, v) => { if (v) F.push({ label: label, text: String(v) }); };
    add('予約番号', c.resNo); add('お名前', c.customer); add('カナ', c.kana);
    add('車種', c.car); add('メーカー', c.maker); add('ナンバー', c.plate);
    add('TEL', c.tel); add('作業内容', c.menu);
    add('担当', c.frontStaff); add('担当', c.staff);
    add('メモ', c.memo); add('事務', c.office);
    add('状態', statusLabel(c)); add('国産／輸入', teamLabel(c));
    (c.contacts || []).forEach(ct => { add('TEL', ct.tel); add('TEL', ct.label); });
    /* 🔴🔴 v1.176.0 日付は**別の書き方でも当たる**（2026-09-20 / 09/20 / 9/20 / 0920 / 20260920）。
       ＝ 「920」でナンバーのつもりが**日付に当たる**のは、この 0920 のせい。
       🔴 どの書き方で当たっても、行には**人が読む形（9/20）**を添える。
          ⚠ 当たった生の形（0920）をそのまま出しても、読んだ人はやっぱり分からない。 */
    const nice = (d) => { const q = String(d || '').split('-'); return q.length === 3 ? ((+q[1]) + '/' + (+q[2])) : ''; };
    dateForms(c.reserveDate).forEach(x => { if (x) F.push({ label:'入庫日', text:String(x), as: nice(c.reserveDate) }); });
    dateForms(c.returnDate).forEach(x => { if (x) F.push({ label:'返車日', text:String(x), as: nice(c.returnDate) }); });
    if (c.loanerId) {
      const l = (state.loaners || []).find(x => x.id === c.loanerId);
      if (l) { add('代車', l.name); add('代車', l.model); add('代車', l.plate); }
      add('代車', c.loanerId); add('代車', '代車');
    }
    return F;
  }
  // カード1枚の検索用テキスト（全部つなげて正規化）
  function cardBlob(c) {
    return norm(cardFields(c).map(f => f.text).join(' '));
  }

  // 顧客台帳（人＋車両）の検索用テキスト
  function custPrimaryTel(cust) {
    const cs = (cust && cust.contacts) || [];
    const p = cs.find(x => x.primary) || cs[0];
    return p ? (p.tel || '') : '';
  }
  /* 🔴 v1.176.0 顧客も同じく「欄の名前つきの表」から（拾う範囲は変えていない） */
  function custFields(cust) {
    const F = [];
    const add = (label, v) => { if (v) F.push({ label: label, text: String(v) }); };
    add('お名前', cust.name); add('カナ', cust.kana);
    (cust.contacts || []).forEach(ct => { add('TEL', ct.tel); add('TEL', ct.label); });
    /* 🔴 v1.49.0 アーカイブした車のナンバー・車種では、その顧客を検索に出さない。
       ⚠ ここを外すと「片付けたはずの車のナンバー」で顧客が引っかかる。 */
    (cust.vehicles || [])
      .filter(v => (window.PitArchive ? !PitArchive.vehArchived(cust, v) : true))
      .forEach(v => { add('ナンバー', v.plate); add('メーカー', v.maker); add('車種', v.car); });
    return F;
  }
  function custBlob(cust) {
    return norm(custFields(cust).map(f => f.text).join(' '));
  }
  function searchCustomers(words) {
    /* 🔴 v1.49.0 アーカイブした顧客は検索に出さない（archive-pit.js が判定）。
       ⚠ 消してはいない＝顧客画面の「アーカイブ済みを見る」から探せる。 */
    const list = (state.customers || []).filter(c => (window.PitArchive ? PitArchive.custVisible(c) : true));
    const hits = [];
    for (let i = 0; i < list.length; i++) {
      const blob = custBlob(list[i]);
      if (words.every(w => blob.indexOf(w) >= 0)) hits.push(list[i]);
    }
    hits.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return hits;
  }

  // 検索本体：全語(AND)を含むカードを新しい順で返す
  function search(qStr) {
    // norm は空白を消すので、入力時のスペースで先に語分割してから各語を正規化
    const raw = String(qStr || '').trim();
    const words = raw ? raw.split(/\s+/).map(norm).filter(Boolean) : [];
    if (!words.length) return [];
    /* 🔴 v1.49.0 アーカイブした顧客・車両の入庫カードも検索に出さない（ゆうた指定）。
       ⚠ **実績ビュー・売上などの集計はここを通していない＝今までどおりの数字**。 */
    const cards = (state.cards || []).filter(c => (window.PitArchive ? PitArchive.cardVisible(c) : true));
    const hits = [];
    for (let i = 0; i < cards.length; i++) {
      const blob = cardBlob(cards[i]);
      if (words.every(w => blob.indexOf(w) >= 0)) hits.push(cards[i]);
    }
    hits.sort((a, b) => (b.reserveDate || '').localeCompare(a.reserveDate || ''));
    return hits;
  }

  function actBtn(label, onclick) {
    return '<button class="psr-act" onclick="event.stopPropagation();' + onclick + '">' + label + '</button>';
  }
  // 工程（車検等）・代車・当/待のバッジ（顧客情報の横に素直に並べる）
  function rowBadges(c) {
    let b = '';
    const wt = (state.workTypes || []).find(w => w.id === c.workType);
    if (wt) b += '<span class="psr-b" style="background:' + wt.color + '22;color:' + wt.color + ';border-color:' + wt.color + '66">' + esc(wt.label) + '</span>';
    if (c.loanerId || c.needLoaner) b += '<span class="psr-b psr-b-loaner">代車</span>';
    if (c.dropType === 'wait' || c.dropType === 'sameDay') {
      const dt = (state.dropTypes || []).find(d => d.id === c.dropType);
      b += '<span class="psr-b psr-b-drop">' + esc(dt ? dt.label : '') + '</span>';
    }
    return b ? ('<span class="psr-bs">' + b + '</span>') : '';
  }
  /* 🔴 v1.176.0 いま探している語（画面を描くたびに入れ替える）。
     ⚠ 行を作る関数の引数を増やすと `list.map(resultRow)` が全部壊れるので、
        **描く直前にここへ置いて、描き終わったら空にする**（画面の中だけの持ち物）。 */
  var WORDS = [];
  /* 当たった所の1行（どの欄で当たったか）。⚠ 1つも当たっていなければ何も出さない。 */
  function hitLine(fields) {
    const w = whereHits(fields, WORDS);
    if (!w.length) return '';
    return '<div class="psr-where"><i data-ic=search data-ics=14></i>'
         + w.map(function (x) {
             return '<span>' + esc(x.label) + (x.as ? '<em>' + esc(x.as) + '</em>' : '') + '</span>';
           }).join('')
         + 'に一致</div>';
  }
  function resultRow(c) {
    const id = esc(c.id);
    const no = c.resNo ? '<span class="psr-no">' + markHits(c.resNo, WORDS) + '</span>' : '';
    const st = statusLabel(c);
    const team = c.boardId === 'import' ? '#ec4899' : '#1db97a';
    // ステータスバッジは左（予約番号の下）
    const stBadge = '<span class="psr-st" style="border-color:' + team + ';color:' + team + '">' + esc(st) + '</span>';
    // 日時：返車済み＝完了日(＋金額)、それ以外＝予約日(＋時刻・期間)
    let dstr;
    if (window.pitCardNoSale && pitCardNoSale(c)) {
      /* 🔴 v1.99.0 売上なし＝金額を出さない。来た日（入庫日）と「売上なし」だけ */
      dstr = (c.reserveDate || c.returnDate || '') + ' 来店　売上なし';
    } else if (c.status === 'returned') {
      const amt = (c.amountFinal != null && c.amountFinal !== '') ? Number(c.amountFinal) : null;
      dstr = (c.returnDate || '') + ' 完了' + ((amt != null && isFinite(amt)) ? ('　¥' + amt.toLocaleString('ja-JP')) : '');
    } else {
      dstr = (c.reserveDate || '') + (c.reserveTime ? (' ' + c.reserveTime) : '') + (c.returnDate && c.returnDate !== c.reserveDate ? ('〜' + c.returnDate) : '');
    }
    const tel = c.tel || ((c.contacts || []).find(x => x.primary) || {}).tel || '';
    // 右に操作ボタン：入庫前(予約)＝予約詳細/予約カレンダー/顧客情報/新規予約
    const rd = esc(c.reserveDate || '');
    let acts;
    if (c.status === 'reserved') {
      acts = actBtn('予約詳細', "pitOpenCardDetail('" + id + "')")
           + actBtn('予約カレンダー', "pitGotoReserveDate('" + rd + "')")
           + actBtn('顧客情報', "custOpenForCard('" + id + "')")
           + actBtn('新規予約', "custNewReserveForCardId('" + id + "')");
    } else if (c.status === 'returned') {
      acts = actBtn('予約詳細', "pitOpenCardDetail('" + id + "')")
           + actBtn('実績カレンダー', "pitGotoResultMonth('" + esc(c.returnDate || c.reserveDate || '') + "')")
           + actBtn('顧客情報', "custOpenForCard('" + id + "')");
    } else {
      acts = actBtn('予約詳細', "pitOpenCardDetail('" + id + "')")
           + actBtn('顧客情報', "custOpenForCard('" + id + "')");
    }
    return '<div class="psr-row">'
      + '<div class="psr-lead">' + no + stBadge + '</div>'
      + '<div class="psr-main">'
      + '<div class="psr-l1"><b class="psr-name">' + markHits((window.pitCustName?pitCustName(c):c.customer) || '（未入力）', WORDS) + ' 様</b>'
      + (c.car ? '<span class="psr-car">' + markHits(c.car, WORDS) + '</span>' : '')
      + (c.plate ? '<span class="psr-plate">' + markHits(c.plate, WORDS) + '</span>' : '')
      + rowBadges(c)
      + '</div>'
      + '<div class="psr-l2">' + (tel ? ('<i data-ic=phone data-ics=16></i> ' + markHits(tel, WORDS)) : '') + (dstr ? ((tel ? '　・　' : '') + '<i data-ic=calendar data-ics=16></i> ' + markHits(dstr, WORDS)) : '') + '</div>'
      + hitLine(cardFields(c))
      + '</div>'
      + '<div class="psr-acts">' + acts + '</div>'
      + '</div>';
  }

  function custLastVisit(cust) {
    let last = cust.updatedAt || 0;
    (cust.vehicles || []).forEach(v => { if ((v.updatedAt || 0) > last) last = v.updatedAt || 0; });
    if (!last) return '';
    const d = new Date(last);
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }
  // 顧客（人）1件の結果行：上＝名前・車種・ナンバー／下＝電話・最終入庫。右に操作ボタン
  function custRow(cust) {
    const tel = custPrimaryTel(cust);
    const vs = cust.vehicles || [];
    const v0 = vs[0] || {};
    const car = v0.car ? '<span class="psr-car">' + markHits(v0.car, WORDS) + '</span>' : '';
    const plate = v0.plate ? '<span class="psr-plate">' + markHits(v0.plate, WORDS) + '</span>' : '';
    const more = vs.length > 1 ? '<span class="psr-more">ほか' + (vs.length - 1) + '台</span>' : '';
    const last = custLastVisit(cust);
    return '<div class="psr-row">'
      + '<div class="psr-lead"><span class="psr-cust-tag"><i data-ic=user data-ics=16></i></span></div>'
      + '<div class="psr-main">'
      + '<div class="psr-l1"><b class="psr-name">' + markHits(cust.name || '（無名）', WORDS) + ' 様</b>' + car + plate + more + '</div>'
      + '<div class="psr-l2">' + (tel ? ('<i data-ic=phone data-ics=16></i> ' + markHits(tel, WORDS)) : '') + (last ? ((tel ? '　・　' : '') + '最終入庫 ' + esc(last)) : '') + '</div>'
      + hitLine(custFields(cust))
      + '</div>'
      + '<div class="psr-acts">'
      + actBtn('顧客情報', "pitSearchOpenCust('" + esc(cust.id) + "')")
      + actBtn('新規予約', "pitSearchClose();custNewReserveFor('" + esc(cust.id) + "','" + esc(v0.id || '') + "')")
      + '</div>'
      + '</div>';
  }

  // 入力ハンドラ
  window.pitSearchInput = function (q) {
    const box = document.getElementById(ST.results);
    if (!box) return;
    const raw = String(q || '').trim();
    if (!raw) { box.classList.remove('open'); box.innerHTML = ''; return; }
    const words = raw.split(/\s+/).map(norm).filter(Boolean);
    WORDS = words;                         /* 🔴 v1.176.0 この描き直しのあいだだけ、当たった所を塗る */
    const cardHits = search(q);
    const custHits = searchCustomers(words);
    if (!cardHits.length && !custHits.length) {
      box.innerHTML = '<div class="psr-empty">「' + esc(raw) + '」に当てはまるものはありません</div>';
      box.classList.add('open');
      return;
    }
    // 返車済みは溜まる一方なので「直近1か月」だけ🗂カードに、それより前は📦過去入庫へ分離
    const cut = _daysAgoStr(31);
    const recent = [], past = [];
    cardHits.forEach(function (c) {
      const isPast = (c.status === 'returned') && ((c.returnDate || c.reserveDate || '') < cut);
      (isPast ? past : recent).push(c);
    });
    const MAX = 30;
    const sec = function (icon, name, list, note) {
      if (!list.length) return '';
      return '<div class="psr-head">' + icon + ' ' + name + ' ' + list.length + '件'
        + (list.length > MAX ? '（上位' + MAX + '件）' : '') + (note ? '　' + note : '') + '</div>'
        + list.slice(0, MAX).map(resultRow).join('');
    };
    let html = '';
    html += sec('<i data-ic=folder data-ics=16></i>', 'カード', recent, '');                       // 予約・作業中・直近1か月の返車済み
    /* 🔴 v1.102.1（ゆうた指定）**顧客は上限なし＝全件出す。**
       ⚠ カード（入庫予約・過去入庫）は今までどおり上位30件。
          あちらは「探して開く」もので、多すぎると逆に見つからない。顧客は台帳なので全部見せる。
       ⚠ 数が多い時は、何件出しているかを出したうえで「もう1語足すと絞れる」と添える（黙って切らない）。 */
    if (custHits.length) {
      html += '<div class="psr-head"><i data-ic=user data-ics=16></i> 顧客 ' + custHits.length + '件'
            + (custHits.length > MAX ? '<span style="color:var(--text3)">　全部出しています。スペースで区切ってもう1語足すと絞れます</span>' : '')
            + '</div>';
      html += custHits.map(custRow).join('');
    }
    html += sec('<i data-ic=box data-ics=16></i>', '過去入庫', past, '<span style="color:var(--text3)">（1か月より前の返車済み）</span>');
    box.innerHTML = html;
    WORDS = [];                            /* 描き終わったら空に戻す（次の描き直しで入れ直す） */
    if (window.pitIcons) { try { pitIcons(box); } catch (e) {} }
    box.classList.add('open');
  };

  // 顧客の結果クリック＝顧客詳細を直接開く（戻れるようにワードは残す）
  window.pitSearchOpenCust = function (custId) {
    window._pitReturnToSearch = true;
    if (window.pitSearchHide) pitSearchHide();
    if (window.custOpen) custOpen(custId);
  };

  // 結果クリック＝カードを開く
  window.pitSearchOpen = function (id) {
    pitSearchClose();
    if (window.openDetail) openDetail(id);
  };

  window.pitSearchClose = function () {
    const box = document.getElementById(ST.results);
    const inp = document.getElementById(ST.input);
    if (box) { box.classList.remove('open'); box.innerHTML = ''; }
    if (inp) inp.value = '';
  };
  // パネルだけ隠す（入力ワードは残す＝あとで戻れる）
  window.pitSearchHide = function () {
    const box = document.getElementById(ST.results);
    if (box) box.classList.remove('open');
  };
  // 直前の検索ワードで結果を出し直す（顧客情報を見て戻る用）
  // ※クリックで閉じた直後の「枠外クリックで閉じる」処理に巻き込まれないよう、次の周期で復元
  window.pitSearchReopen = function () {
    setTimeout(function () {
      const inp = document.getElementById(ST.input);
      if (inp && inp.value.trim()) window.pitSearchInput(inp.value);
    }, 0);
  };

  // 外側クリックで結果を閉じる（入力は残す）
  document.addEventListener('click', function (e) {
    const wrap = document.getElementById(ST.wrap);
    const box = document.getElementById(ST.results);
    if (!wrap || !box) return;
    if (!wrap.contains(e.target)) box.classList.remove('open');
  });
  // 入力にフォーカスが戻ったら、語があれば再表示（どちらの検索欄でも）
  document.addEventListener('focusin', function (e) {
    if (e.target && (e.target.id === 'pit-search-input' || e.target.id === 'mydash-search-input') && e.target.value.trim()) {
      window.pitSearchInput(e.target.value);
    }
  });

  console.log('[search] ready');
})();
