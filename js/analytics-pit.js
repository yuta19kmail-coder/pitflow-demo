/* ================================================================================
   analytics-pit.js  -  📊 分析用の書き出し（Claude が読む表）  PitFlow v2.143.0（v2.177.0 受付の列・車検の表／v2.187.2 在るのに出していなかった物＝操作ログ・車・代車・工程・目標）
   ================================================================================
   ◎ゆうた指定（2026-10-05）
     🗣「ありとあらゆるデータをあなたに渡すってのがイメージの全容」
     🗣「ビッグデータを持てば、あなたが統合的に判断して、外部取締役ぐらいの感じになれるかな」
     決まりの本体＝`..\..\_記録\仕様\分析用の書き出し_全アプリ共通の決まり.md`（全アプリ共通）
     モック＝`..\_資料\01_モック\いま使っているもの\モック_分析用の書き出し_2026-10-05.html`

   ◎これは何
     入庫カード1枚＝1行の表（CSV）と、その列の説明書（辞書）を作る。
     🔴 **画面は持たない。** 毎晩サーバー（`_サーバー\functions\analytics.js`）が
        **本番のこのファイルをそのまま読み込んで**呼ぶ＝画面と表の数え方が必ず同じ。
     🔴 **数え方はここで作らない。** 実績・金額・課・フロント＝売上画面の `pitSalesMonthCollect`、
        実績日＝`pitSalesCountDate`、売上日＝`pitSalesDate`、作業タイプ＝`pitCardWorkTypes` …を借りるだけ。
        ここで足したのは「MINI のまとめ方」と「伝票の原価の引き方」の2つだけで、
        それも AIレポート（sales-ai.js）の中にあったものを**ここへ移して、向こうが借りる**形にした（写しを作らない）。

   ◎出さないもの（決まり §6）
     🔴 名前（フル）・電話・住所・ナンバー・メール・LINE の番号は**どの列にも入れない**。
     お客様は「苗字＋車種」の呼び名だけ（ゆうた指定）。苗字が切り出せない時は「（苗字不明）」＝下の名前を出さないため。

   ◎ここが返すもの
     pitCardMaker(c)        … メーカー（BMW の MINI と MINI は「MINI」）
     pitCardCost(c)         … その入庫の伝票の原価・部品・工賃（伝票が無ければ null）
     pitAnalyticsTable(opt) … { cols:[…], rows:[[…]], csv:'…', dict:'…（Markdown）', count:{…} }
     pitAnalyticsShakenTable(opt) … pitflow.車検
     pitAnalyticsMoreTables(opt)  … [{ name, csv, dict, count }]（v3・操作ログ／車／代車／代車の車／工程／目標）
     PIT_ANALYTICS_MORE_COLS      … サーバーが追加で読む入れ物（state の名前 → 入れ物。操作ログ）
   ⚠ 読み込みは pit-share / state / customers / sales-count / sales-date / insurance-pit / intern-pit /
      mech-pick / sales.js より**後ろ**、sales-ai.js より**前**（sales-ai が pitCardMaker / pitCardCost を借りる）。
   ================================================================================ */
(function (w) {
  'use strict';

  var VERSION = '3';   /* 🔴 列を足す・意味を変えたら上げる（辞書の頭に出る）
                          v2（2026-10-12）予約受付日・受付から入庫まで・予約担当・代車・取消の種類・取消日・取消理由を**後ろに**足した
                          ＋ 2枚目の表 pitflow.車検（1行＝1回の陸運局行き）
                          v3（2026-10-15・棚卸し A-70「可能なだけデータは取って」）pitflow.csv の**後ろに**
                          車台番号・完TEL日・受注日・売上なしにした日・お礼LINE を足した
                          ＋ 表を6枚（pitflow.操作ログ／車／代車／代車の車／工程／目標）＝ pitAnalyticsMoreTables */

  function s(v){ return v == null ? '' : String(v); }
  function t(v){ return s(v).trim(); }
  function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
  function S(){ return w.state || {}; }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function day(v){ var m = /^(\d{4}-\d{2}-\d{2})/.exec(t(v)); return m ? m[1] : ''; }
  function days(a, b){
    a = day(a); b = day(b); if (!a || !b) return null;
    var p = a.split('-'), q = b.split('-');
    return Math.round((new Date(+q[0], q[1] - 1, +q[2]) - new Date(+p[0], p[1] - 1, +p[2])) / 864e5);
  }
  function safe(fn, dflt){ try { var v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } }

  /* 🆕 v3 時刻 → ミリ秒。数字（ミリ秒）・年つきの文字・Firestore の時刻（サーバーでは JSON で {_seconds} になる）だけ読む。
     🔴 年の無い 'M/D HH:MM'（古い timeStr・atTxt）は**読まない＝空**。今年として読むと去年の記録が未来になる（棚卸し A-08） */
  function tsMs(v){
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) && v > 0 ? v : null;
    if (typeof v === 'object'){
      if (typeof v.toMillis === 'function') return safe(function () { return v.toMillis(); }, null);
      var sec = v._seconds != null ? v._seconds : v.seconds;
      if (sec != null && isFinite(+sec)) return (+sec) * 1000 + Math.floor((+(v._nanoseconds != null ? v._nanoseconds : v.nanoseconds) || 0) / 1e6);
      return null;
    }
    var x = t(v);
    if (/^\d{10,}$/.test(x)) return +x;
    if (!/^\d{4}-\d{2}-\d{2}/.test(x)) return null;
    var ms = new Date(x.length === 10 ? x + 'T00:00:00' : x).getTime();
    return isNaN(ms) ? null : ms;
  }
  /* 'YYYY-MM-DD HH:MM'（端末の時刻＝サーバーは日本時間で動く） */
  function hm(ms){ if (ms == null) return ''; var d = new Date(ms); return ymd(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  /* 日付だけ。'YYYY-MM-DD…' の文字はそのまま頭10文字、ミリ秒・時刻は端末の日付に */
  function dayOf(v){
    var a = day(v); if (a) return a;
    var ms = tsMs(v); return ms == null ? '' : ymd(new Date(ms));
  }

  /* ================================================================
     🔒 自由記述の伏せ字（v3・操作ログの「内容」・代車の用途）
     ⚠ 正規表現は CoreTemplate／CoreBoard の書き出しと同じ物（アプリをまたいで読み込めないので、ここに置いた）
       電話・メール・口座・郵便番号・住所・ナンバー・車台番号・読みがなの括弧・「〇〇様」の名前
     ================================================================ */
  var RE_MAIL = /[A-Za-z0-9._%+\-]+[@＠][A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
  var RE_TEL = /(^|[^0-9０-９+])((?:\+81[\s\-－‐ー−]?|[0０])[0-9０-９](?:[\s\-－‐ー−()（）]{0,2}[0-9０-９]){8,9})(?![0-9０-９])/g;
  var NM = '[一-龯々〆ヵヶァ-ヴーぁ-んA-Za-zＡ-Ｚａ-ｚ]';
  var NC = '(?:(?!様|さま|さん|殿|ちゃん|くん)' + NM + ')';
  var RE_SAMA = new RegExp('(' + NC + '{1,8}(?:[\\s　]' + NC + '{1,6})?)[\\s　]?(様|さま|殿)', 'g');
  var KEEP_SAMA = /^(お客|皆|みな|各位|担当|担当者|奥|旦那|ご主人|お子|ご家族|お父|お母|運転手|オーナー|先方|業者|ディーラー|保険屋|整備士|スタッフ|社長|専務|チーフ|メカ)$/;
  var RE_PLATE = /[一-龯ぁ-んァ-ヶ]{1,4}[\s　]?[0-9０-９]{2,3}[\s　]?[ぁ-ん][\s　]?[0-9０-９]{1,2}[-－ー‐・][0-9０-９]{2}|[ぁ-ん][\s　]?[0-9０-９]{1,2}[-－ー‐・][0-9０-９]{2}(?![0-9０-９])/g;
  var RE_PLATE2 = /[一-龯]{1,4}[\s　]?[0-9０-９]{2,3}[\s　]?[ぁ-ん][\s　]*[0-9０-９・･]{1,5}/g;
  var RE_ZIP = /〒?[\s　]?[0-9０-９]{3}[-－ー‐][0-9０-９]{4}(?![0-9０-９])/g;
  var RE_ADDR = /(北海道|東京都|京都府|大阪府|[一-龯]{2,3}県)?[一-龯ぁ-んァ-ヶ]{1,8}[市区町村郡][一-龯ぁ-んァ-ヶ]{0,12}[0-9０-９一二三四五六七八九十]+(?:[-－ー‐丁目番地号の][0-9０-９]*)*/g;
  var RE_VIN = /[A-Z0-9]{2,8}[-－][0-9]{5,8}/g;
  var RE_BANK = /(普通|当座|口座番号?|口座)[\s　:：]*[0-9０-９]{6,8}/g;
  var RE_VINLABEL = /(車体番号|車台番号|フレーム番号)[\s　:：]*[A-Za-z0-9Ａ-Ｚａ-ｚ０-９\-－]{5,}/g;
  var RE_KANA_PAREN = /[（(][\s　]*[ァ-ヴー]+(?:[\s　]+[ァ-ヴー]+)?[\s　]*[）)]/g;
  /* 予約の編集の記録（「お客様名（漢字） A → B」「TEL … → …」）＝個人の欄は前も後も丸ごと伏せる。
     欄の名前は pit-share.js の _DIFF_EXTRA／inspect-fix.js の FIELDS の言葉 */
  var RE_PFIELD = /(^|、|\/ |「|：|\s)(お客様名（漢字）|お客様名|お名前|カナ|TEL|電話|携帯|ナンバー|姓（カナ）|名（カナ）|姓|名|連絡先|住所|メール|Lステップ|車体番号|車台番号|郵便番号)( [^、」]*)/g;
  function maskFree(v){
    var x = s(v).replace(/[\r\n\t]+/g, ' ');
    x = x.replace(RE_PFIELD, function (all, head, label) { return head + label + ' ［伏せた］'; });
    x = x.replace(RE_MAIL, '［メール］').replace(RE_TEL, '$1［電話］');
    x = x.replace(RE_BANK, '$1［口座番号］').replace(RE_VINLABEL, '$1［車台番号］');
    x = x.replace(RE_ZIP, '［郵便番号］').replace(RE_ADDR, '［住所］').replace(RE_PLATE, '［ナンバー］').replace(RE_PLATE2, '［ナンバー］').replace(RE_VIN, '［車台番号］');
    x = x.replace(RE_KANA_PAREN, '（〇〇）');
    x = x.replace(RE_SAMA, function (all, name, tail) { return KEEP_SAMA.test(name) ? all : '〇〇 ' + tail; });
    return x;
  }
  function clip(x, max){ return x.length <= max ? x : x.slice(0, max) + '…［以下略・全' + x.length + '文字］'; }

  /* ================================================================
     🚗 メーカー（AIレポートから移した・物差しはここ1本）
     ⑧ BMW の MINI と MINI は「MINI」。メーカー欄だけでなく車種名で見る（いまのカードは BMW のミニが多い）
     ================================================================ */
  function isMini(c){
    var x = s(c && c.car) + ' ' + s(c && c.maker);
    return /ミニ|MINI|ﾐﾆ/i.test(x) && !/ミニカ|ミニキャブ|ミニバン/.test(s(c && c.car));
  }
  function pitCardMaker(c){ return isMini(c) ? 'MINI' : (t(c && c.maker) || 'メーカー未入力'); }

  /* ================================================================
     💰 伝票の原価（AIレポートから移した・物差しはここ1本）
     ◎出どころ＝クォーターチェックで車に書き込んだ伝票（予約番号でカードと結ぶ）
     ⚠ 工賃（作業）の原価は伝票上ほぼ0＝粗利は「部品の利益＋工賃」。人件費は入っていない
     ⚠ 伝票が無い車は null（＝分からない。0 にしない）
     ================================================================ */
  function pitCardCost(c){
    try {
      var h = w.pitVehByPlate ? w.pitVehByPlate(c.plate) : null;
      var d = h && h.veh && (h.veh.伝票 || []).filter(function (x) { return x && t(x.予約番号) && t(x.予約番号) === t(c.resNo); })[0];
      if (!d) return null;
      var o = { 原価: num(d.原価), 工賃: 0, 工賃原価: 0, 部品: 0, 部品原価: 0, 伝票: t(d.伝票) };
      (d.明細 || []).forEach(function (m) {
        if (!m) return;
        if (m.種 === '部品'){ o.部品 += num(m.金額); o.部品原価 += num(m.原価); }
        else if (m.種 === '作業'){ o.工賃 += num(m.金額); o.工賃原価 += num(m.原価); }
      });
      return o;
    } catch (e) { return null; }
  }

  /* ================================================================
     👤 呼び名＝苗字＋車種（決まり §6・ゆうた指定）
     🔴 下の名前を出さない。苗字が切り出せない時は「（苗字不明）」。
       ・姓の欄（sei）があればそれ → 無ければカナの姓（seiKana）
       ・それも無ければ pitCustSurname（姓と名のあいだに空白がある・法人の時だけ。空白が無い個人名は丸ごとになるので使わない）
     ================================================================ */
  /* 空白で姓と名が分かれている名前から姓を取る（法人はフル）。分かれていなければ ''（＝決めつけない） */
  function surOfFull(full){
    full = t(full); if (!full) return '';
    var sur = w.pitSurname ? t(w.pitSurname(full)) : '';
    if (/[㈱㈲]|\(同\)|会社|組合|法人/.test(sur)) return sur;
    return (/[\s　]/.test(full) && sur && sur !== full) ? sur : '';
  }
  var _custById = null, _vehById = null;
  /* 🆕 v3 顧客台帳の車（vehId → 車）。表を作るたびに作り直す */
  function vehMap(){
    if (!_vehById){
      _vehById = {};
      (S().customers || []).forEach(function (cu) {
        (cu && Array.isArray(cu.vehicles) ? cu.vehicles : []).forEach(function (v) { if (v && v.id) _vehById[v.id] = { veh: v, cust: cu }; });
      });
    }
    return _vehById;
  }
  /* 🆕 v3 カードの車台番号＝車両番号の車 → 無ければナンバーから（customers.js pitVehVin） */
  function vinOfCard(c){
    var h = c && c.vehId ? vehMap()[t(c.vehId)] : null;
    if (h) return t(h.veh.vin);
    return t(safe(function () { return w.pitVehVin(c.plate); }, ''));
  }
  function custOf(c){
    if (!_custById){ _custById = {}; (S().customers || []).forEach(function (x) { if (x && x.id) _custById[x.id] = x; }); }
    return _custById[t(c.customerId)] || null;
  }
  function surnameOf(c){
    var a = t(c.sei) || t(c.seiKana);
    /* 🔴 v2.143.1 姓の欄にフルネームが空白区切りで丸ごと入っているカードがあった（本番で1件・2026-10-05）。
       会社名でなければ、最初の区切りまでだけ使う＝下の名前を出さない */
    if (a) return /[㈱㈲]|\(同\)|[（(][株有同][)）]|会社|組合|法人/.test(a) ? a : a.split(/[\s　]+/)[0];
    var full = w.pitCustName ? t(w.pitCustName(c)) : t(c.customer);
    var sur = surOfFull(full);
    if (sur) return sur;
    var cu = custOf(c);
    sur = cu ? (t(cu.sei) || surOfFull(cu.name)) : '';
    if (sur) return sur;
    return full ? '（苗字不明）' : '';
  }
  function callName(c){
    var a = surnameOf(c), car = t(c.car);
    return (a || '（名前なし）') + (car ? ' ' + car : '');
  }

  /* ラベル（設定の表から引く。直書きしない） */
  function labelIn(list, id){ var r = (list || []).filter(function (x) { return x && x.id === id; })[0]; return r ? t(r.label || r.name) : t(id); }
  function divOf(c){ if (c.division === 'div1' || c.division === 'div2' || c.division === 'recept') return c.division; return c.boardId === 'import' ? 'div2' : 'div1'; }

  /* 担当者：名前を「・」でつなぐ。「なし」と「未入力」は分ける（決まり §4） */
  function staffCol(c, role, noneKey){
    var a = Array.isArray(c[role]) ? c[role].map(t).filter(Boolean) : [];
    var seen = {}, out = [];
    a.forEach(function (n) { if (!seen[n]){ seen[n] = 1; out.push(n); } });
    if (out.length) return out.join('・');
    if (c[noneKey]) return 'なし';
    return '';   /* 空＝未入力 */
  }

  /* 🆕 v2 取り消しの種類。⚠ 人が押した予約キャンセル（cancelled）と、来なかった（noShow）は別物（card-view.js / today.js / overdue-pit.js） */
  function cancelKind(c){
    if (!c || c.status !== 'cancelled') return '';
    if (c.noShow && !c.cancelled) return '来店なし';
    return 'キャンセル';
  }

  /* CSV の1マス */
  function cell(v){
    if (v == null) return '';
    var x = (typeof v === 'number') ? String(v) : s(v);
    return /[",\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
  }

  /* ================================================================
     📊 表を作る
     opt.today … 書き出した日（省略＝今日）
     ================================================================ */
  var COLS = [
    ['アプリ', '常に pitflow'],
    ['ID', 'カードの番号。PitFlow で `?card=<ID>` を開くと予約詳細'],
    ['書き出した日', 'この表を作った日'],
    ['予約番号', 'カードの予約番号（伝票と結ぶ鍵）'],
    ['お客様番号', 'PitFlow の顧客台帳の番号（customerId）。空＝台帳と結んでいない'],
    ['車両番号', 'PitFlow の車両の番号（vehId）'],
    ['呼び名', '苗字＋車種。読む用で、数える・結ぶ鍵にはしない（同じ呼び名の別人がいる）。苗字が切り出せない時は（苗字不明）'],
    ['課', '1課（国産）／2課（輸入）／受付。カードの課（無ければ盤面から）'],
    ['状態', '予約・点検待ち…返車完了・キャンセル（画面の札と同じ言葉）'],
    ['売上の区分', '売上画面の6区分（実績／実績待／確定／予定／見込／予測）。キャンセル・売上なし・社内車両は空'],
    ['入庫日', '予約の入庫日（reserveDate）'],
    ['実際に入った日', '実入庫日（actualInAt）。まだ入っていなければ空'],
    ['返車日', '確定返車日（無ければ返車予定日）'],
    ['実績日', '実績に数える日（pitSalesCountDate）。保険は入金日。まだ実績でなければ空'],
    ['売上日', '伝票の日付（pitSalesDate）。無ければ完TEL日を借りる'],
    ['預かり日数', '実際に入った日 → 返車日（0＝当日返し）。どちらかが空なら空'],
    ['初回リピーター', 'カードの「初回／リピーター」'],
    ['何回目', '同じお客様番号のカードを入庫日順に数えた何回目か（キャンセルは数えない）。お客様番号が無ければ空'],
    ['受付タイプ', '待／当／預'],
    ['作業タイプ', '作業タイプ（基本＋併用）を「・」でつなぐ'],
    ['板金', '作業タイプに B.P があれば 1。AIレポートは板金を預かり日数の数字から外している'],
    ['付加', '保証／保険／社員 を「・」でつなぐ'],
    ['社内車両', '中古・代車・内部 のどれか（売上に数えない）'],
    ['売上なし', '売上なしアーカイブなら 1'],
    ['メーカー', 'BMW の MINI と MINI はまとめて MINI'],
    ['車種', 'カードの車種'],
    ['フロント担当', '売上画面と同じ拾い方'],
    ['点検担当', '名前を「・」でつなぐ。「なし」＝居ないと決めた。空＝未入力'],
    ['整備担当', '同上'],
    ['チェック担当', '同上（導入前のカードは空が正常）'],
    ['金額', '税抜・円。売上画面と同じ金額（確定 → 受注 → 見積 → 概算の順に拾う）'],
    ['伝票番号', 'クォーターチェックで結びついた伝票。空＝結びついていない'],
    ['原価', '伝票の原価（税抜）。空＝伝票が無い＝分からない（0 ではない）'],
    ['部品売上', '伝票の明細のうち部品の金額'],
    ['部品原価', '伝票の明細のうち部品の原価'],
    ['工賃', '伝票の明細のうち作業の金額（工賃の原価は伝票上ほぼ0）'],
    ['粗利', '金額 − 原価。原価が空なら空。人件費は入っていない'],
    ['粗利率', '粗利 ÷ 金額（%・小数1桁）'],
    ['1日あたり粗利', '粗利 ÷ 預かり日数（0日は1日として割る＝AIレポートと同じ）'],
    ['売掛', '入金日を分ける（売掛）なら 1'],
    ['入金日', '売掛・保険の入金日'],
    /* 🆕 v2（2026-10-12・ゆうた「受付部分の追加」）**後ろに足した**＝前の列の並びは変えない */
    ['予約受付日', '予約を受けた日（予約詳細の「予約受付日」bookedAt）。空＝入っていない（古いカード・入庫のあと入力など）'],
    ['受付から入庫まで', '予約受付日 → 入庫日の日数（0＝当日の予約）。どちらかが空なら空'],
    ['予約担当', '予約を受けた人（reserveStaff）。フロント担当とは別の人のことがある。空＝未入力'],
    ['代車', '代車「必要」なら 1'],
    ['取消の種類', 'キャンセル＝人が押した予約キャンセル／来店なし＝入庫日を過ぎても来なかった（自動・当日ビューの「来なかった」）。取り消していなければ空'],
    ['取消日', 'キャンセル・来店なしになった日（cancelledAt）'],
    ['取消理由', 'キャンセルの窓に書いた1行（任意・自由文）。来店なしは空'],
    /* 🆕 v3（2026-10-15・棚卸し A-70）**後ろに足した**＝前の列の並びは変えない */
    ['車台番号', '🚗 アプリをまたぐ車の鍵（決まり §7）。顧客台帳の車（車両番号）の車台番号。車両番号が無いカードはナンバーから引く（pitVehVin）。空＝入っていない'],
    ['完TEL日', 'お客様に完了の電話をした日（completeCallAt・記録）。売上日とは別の事実（売上日が無い時だけ売上日が借りる）。空＝まだ／入っていない'],
    ['受注日', '受注した日＝工程が「パーツ待ち」に入った最初の記録（無ければ orderedAt）。売上画面のフロントの数え方と同じ（pitOrderDateMs）。空＝受注の記録が無い'],
    ['売上なしにした日', '売上なしでアーカイブした日（noSaleAt）'],
    ['お礼LINE', '送った／不要（「お礼LINE 不要」の印）。空＝まだ・印なし']
  ];

  function pitAnalyticsTable(opt){
    opt = opt || {};
    var today = opt.today || ymd(new Date());
    _custById = null; _vehById = null;   /* 顧客台帳の引き当ては毎回作り直す（前回の中身を使わない） */
    var st = S(), cards = (st.cards || []).filter(function (c) { return c && c.id; });

    /* 売上画面の集め方を借りる（区分・金額・課・フロント）。範囲は全部 */
    var byId = {};
    safe(function () {
      var C = w.pitSalesMonthCollect('2000-01-01', '2099-12-31');
      (C.rows || []).forEach(function (r) { if (r && r.c && r.c.id) byId[r.c.id] = r; });
      return 1;
    }, 0);
    var tierName = {};
    (w.PIT_SALES_TIERS || []).forEach(function (x) { tierName[x.id] = x.label; });

    /* 何回目＝同じお客様番号を入庫日順に（キャンセルは数えない） */
    var nth = {};
    var byCust = {};
    cards.forEach(function (c) {
      var k = t(c.customerId); if (!k || c.status === 'cancelled') return;
      (byCust[k] = byCust[k] || []).push(c);
    });
    Object.keys(byCust).forEach(function (k) {
      byCust[k].sort(function (a, b) { return (day(a.actualInAt) || day(a.reserveDate)).localeCompare(day(b.actualInAt) || day(b.reserveDate)); })
               .forEach(function (c, i) { nth[c.id] = i + 1; });
    });

    var specials = w.PIT_WORK_SPECIALS || [];
    var count = { 行: 0, 伝票あり: 0, 実績: 0 };
    var rows = cards.map(function (c) {
      var r = byId[c.id] || null;
      var ret = day(c.returnDateFinal) || day(c.returnDate);
      var inAt = day(c.actualInAt);
      var stay = days(inAt, ret);
      var amt = r ? num(r.amt) : num(safe(function () { return w.pitFinalAmountOf(c); }, 0));
      var co = pitCardCost(c);
      var gross = co ? amt - co.原価 : null;
      var wts = safe(function () { return w.pitCardWorkTypes(c); }, []).map(function (x) { return t(x && (x.label || x.name || x.id)); }).filter(Boolean);
      var bp = safe(function () { return w.pitCardWorkIds(c); }, []).indexOf('bp') >= 0;
      var sp = (Array.isArray(c.workSpecials) ? c.workSpecials : []).map(function (id) { return labelIn(specials, id); });
      var tier = r ? t(r.tier) : '';
      count.行++; if (co) count.伝票あり++; if (tier === 'actual') count.実績++;
      return [
        'pitflow', c.id, today, t(c.resNo), t(c.customerId), t(c.vehId), callName(c),
        labelIn(st.divisions, divOf(c)),
        safe(function () { return w.pitCardStatusText(c); }, t(c.status)),
        tier ? (tierName[tier] || tier) : '',
        day(c.reserveDate), inAt, ret,
        day(safe(function () { return w.pitSalesCountDate(c); }, '')),
        day(safe(function () { return w.pitSalesDate(c); }, '')),
        stay,
        c.repeat ? labelIn(st.repeatTypes, c.repeat) : '',
        nth[c.id] || '',
        [c.dropType, c.dropType2].filter(Boolean).map(function (id) { return labelIn(st.dropTypes, id); }).join('・'),
        wts.join('・'),
        bp ? 1 : '',
        sp.join('・'),
        safe(function () { return w.pitInternLabel(c); }, ''),
        safe(function () { return w.pitCardNoSale(c); }, false) ? 1 : '',
        pitCardMaker(c), t(c.car),
        r ? t(r.front) : t(c.frontStaff),
        staffCol(c, 'inspectors', 'inspectorsNone'),
        staffCol(c, 'mechanics', 'mechanicsNone'),
        staffCol(c, 'checkers', 'checkersNone'),
        amt,
        co ? co.伝票 : '',
        co ? co.原価 : '',
        co ? co.部品 : '', co ? co.部品原価 : '', co ? co.工賃 : '',
        gross == null ? '' : gross,
        (gross == null || !amt) ? '' : Math.round(gross / amt * 1000) / 10,
        (gross == null || stay == null) ? '' : Math.round(gross / Math.max(1, stay)),
        c.paymentSeparate ? 1 : '',
        day(c.paymentDate),
        /* 🆕 v2 受付 */
        day(c.bookedAt),
        days(c.bookedAt, c.reserveDate),
        t(c.reserveStaff),
        c.needLoaner ? 1 : '',
        cancelKind(c),
        cancelKind(c) ? day(c.cancelledAt) : '',
        (cancelKind(c) === 'キャンセル') ? t(c.cancelReason).replace(/[\r\n\t]+/g, ' ') : '',
        /* 🆕 v3 */
        vinOfCard(c),
        dayOf(c.completeCallAt),
        dayOf(safe(function () { return w.pitOrderDateMs(c); }, '')),
        dayOf(c.noSaleAt),
        c.thanksLineSent ? '送った' : (c.noThanksLine ? '不要' : '')
      ];
    });

    var head = COLS.map(function (x) { return x[0]; });
    var csv = '﻿' + [head].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
    return { cols: head, rows: rows, csv: csv, dict: dict(today, count), count: count };
  }

  /* ================================================================
     📖 辞書（表と必ず一緒に置く・決まり §5）
     ================================================================ */
  function dict(today, count){
    var L = [];
    L.push('# pitflow.csv の辞書（版 ' + VERSION + '）');
    L.push('');
    L.push('- 書き出した日：' + today + '（PitFlow ' + t(w.PIT_APP_VERSION || '') + '）');
    L.push('- 1行＝入庫カード1枚。全部のカード（予約・キャンセル・売上なしも含む）。');
    L.push('- 行数：' + (count ? count.行 : '') + '／うち実績 ' + (count ? count.実績 : '') + '／伝票と結びついた ' + (count ? count.伝票あり : ''));
    L.push('- 数え方は PitFlow の画面と同じ部品を借りている（売上画面・AIレポートと数字が一致する）。');
    L.push('- 決まり＝`CoreFlowアプリ\\_記録\\仕様\\分析用の書き出し_全アプリ共通の決まり.md`');
    L.push('');
    L.push('## 読むときの注意');
    L.push('- 🔴 空と0は別。空＝分からない／入っていない。');
    L.push('- 🔴 原価・粗利は伝票と結びついた車だけ（クォーターチェックで伝票を書き込んだ車）。比べる時は「何台中何台か」を必ず添える。');
    L.push('- 保険は入金日で実績（実績日＝入金日）。売上の頑張りとは分けて見る（AIレポートの決まり）。');
    L.push('- 社内車両（中古・代車・内部）・売上なしは売上に数えない。売上の区分も空。');
    L.push('- 板金（B.P）は預かりが長くなるのが普通。預かり日数・1日あたりの比較からは外して見る。');
    L.push('- 2026-03 より前は伝票（原価）が無い。PitFlow を使い始めた頃のカードは入庫日・工程の記録がばらつく。');
    L.push('- 呼び名は読む用。数える・結ぶのはお客様番号・車両番号。');
    L.push('- 出す時の段：ゆうた宛ては全部言ってよい。社員が見る物では個人の比較・評価を出さない（決まり §6.5）。');
    L.push('');
    L.push('## 列');
    L.push('');
    L.push('| 列 | 中身 |');
    L.push('|---|---|');
    COLS.forEach(function (x) { L.push('| ' + x[0] + ' | ' + x[1].replace(/\|/g, '／') + ' |'); });
    L.push('');
    return L.join('\n');
  }

  /* ================================================================
     🚗 2枚目の表：車検（v2・2026-10-12・ゆうた「車検の追加」）
     ----------------------------------------------------------------
     1行＝**1回の陸運局行き**（合格も不合格も）。カード1枚に何行も付く（不合格 → 再検 → 合格）。
     ◎どこから
       ・不合格（とマスター入力で足した合格の行）… inspSchedule.history[]
       ・最後の合格 ……………………………………… inspSchedule.result === 'done'（resultDate 等）
       ⚠ マスター入力は合格も history に行として持つことがある＝同じ日の合格が両方にあれば1行にする
     ◎結果の言葉は車検予定の窓と同じ（pit-share.js pitShakenChoices の分かれ道）
       一発合格／再検合格（その場で直した）／再検で合格（不合格のあと）／不合格
     🔴 理由は pit-share.js pitShakenHistNote 1本（note／古い why）。回送担当は記録のまま（フルネーム）。
     ================================================================ */
  var SHK_COLS = [
    ['アプリ', '常に pitflow'],
    ['ID', 'カードの番号＝pitflow.csv の ID と同じ（カード1枚に何行も付く）。PitFlow で `?card=<ID>` を開くと予約詳細'],
    ['書き出した日', 'この表を作った日'],
    ['予約番号', 'カードの予約番号'],
    ['お客様番号', 'customerId'],
    ['車両番号', 'vehId'],
    ['呼び名', '苗字＋車種（pitflow.csv と同じ）'],
    ['課', '1課（国産）／2課（輸入）／受付'],
    ['メーカー', 'BMW の MINI と MINI はまとめて MINI'],
    ['車種', 'カードの車種'],
    ['社内車両', '中古・代車・内部 のどれか（代車・社用車の車検）。空＝お客様の車'],
    ['何回目の行き', 'このカードで陸運局へ行った何回目か（日付順）'],
    ['行った日', '陸運局へ行った日'],
    ['時間帯', 'AM／PM'],
    ['結果', '一発合格／再検合格（その場で直した）／再検で合格（不合格のあと）／不合格'],
    ['それまでの不合格', 'この行より前の不合格の回数（0＝初回）'],
    ['回送担当', '陸運局へ行った人（1人目・記録のままの名前）。担当別の数はこの人で数える。空＝未入力'],
    ['2人目', '一緒に行った2人目（数えない・見せるだけ）'],
    ['2人目の理由', '2人目がいる理由（研修・同乗 など）'],
    ['落ちた理由', '不合格・再検合格の時の1行（光軸・サイドスリップ など）。合格は空'],
    ['陸運局', '行った陸運局（名前）'],
    ['R', 'ラウンド（1〜4）。空＝未定'],
    ['入庫日', 'カードの入庫日'],
    ['カードの状態', '画面の札と同じ言葉（返車完了 など）']
  ];
  function shkReLabel(prevFails, kind){
    if (kind === 'fail') return '不合格';
    if (prevFails > 0) return '再検で合格';
    return kind === 'repass' ? '再検合格（その場で直した）' : '一発合格';
  }
  function pitAnalyticsShakenTable(opt){
    opt = opt || {};
    var today = opt.today || ymd(new Date());
    _custById = null;
    var st = S(), cards = (st.cards || []).filter(function (c) { return c && c.id && !c._draft; });
    var hn = function (h) { return w.pitShakenHistNote ? w.pitShakenHistNote(h) : t(h && (h.note || h.why)); };
    var count = { 行: 0, 台: 0, 不合格: 0 };
    var rows = [];
    cards.forEach(function (c) {
      var sc = c.inspSchedule;
      if (!sc || typeof sc !== 'object') return;
      if (!safe(function () { return w.pitIsShaken(c); }, false)) return;
      var trips = [];
      (Array.isArray(sc.history) ? sc.history : []).forEach(function (h) {
        if (!h || !day(h.date)) return;
        var kind = (h.result === 'pass') ? 'pass' : (h.result === 'repass') ? 'repass' : 'fail';
        trips.push({ d: day(h.date), slot: h.slot === 'pm' ? 'PM' : 'AM', kind: kind, staff: t(h.staff), staff2: t(h.staff2), note2: t(h.staff2Note),
                     why: (kind === 'pass') ? '' : hn(h), office: t(h.officeName), round: num(h.round) || '' });
      });
      var dd = day(sc.resultDate || sc.decided);
      if (sc.result === 'done' && dd){
        var dup = trips.some(function (x) { return x.kind !== 'fail' && x.d === dd; });
        if (!dup) trips.push({ d: dd, slot: (sc.resultSlot || sc.decidedSlot) === 'pm' ? 'PM' : 'AM', kind: sc.repass ? 'repass' : 'pass',
                               staff: t(sc.resultStaff), staff2: (t(sc.resultStaff2) !== t(sc.resultStaff)) ? t(sc.resultStaff2) : '', note2: t(sc.resultStaff2Note),
                               why: sc.repass ? t(sc.repassNote) : '', office: t(sc.officeName), round: num(sc.round) || '' });
      }
      if (!trips.length) return;
      trips.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0); });
      count.台++;
      var fails = 0;
      trips.forEach(function (x, i) {
        rows.push([
          'pitflow', c.id, today, t(c.resNo), t(c.customerId), t(c.vehId), callName(c),
          labelIn(st.divisions, divOf(c)), pitCardMaker(c), t(c.car),
          safe(function () { return w.pitInternLabel(c); }, ''),
          i + 1, x.d, x.slot, shkReLabel(fails, x.kind), fails,
          x.staff, x.staff2, x.staff2 ? x.note2 : '', x.why.replace(/[\r\n\t]+/g, ' '), x.office, x.round,
          day(c.reserveDate), safe(function () { return w.pitCardStatusText(c); }, t(c.status))
        ]);
        count.行++;
        if (x.kind === 'fail'){ fails++; count.不合格++; }
      });
    });
    var head = SHK_COLS.map(function (x) { return x[0]; });
    var csv = '﻿' + [head].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
    return { name: 'pitflow.車検', cols: head, rows: rows, csv: csv, dict: shkDict(today, count), count: count };
  }
  function shkDict(today, count){
    var L = [];
    L.push('# pitflow.車検.csv の辞書（版 ' + VERSION + '）');
    L.push('');
    L.push('- 書き出した日：' + today + '（PitFlow ' + t(w.PIT_APP_VERSION || '') + '）');
    L.push('- 1行＝**1回の陸運局行き**（合格・不合格とも）。カード1枚に何行も付く。カードの中身（金額など）は pitflow.csv を ID で引く。');
    L.push('- 行数：' + count.行 + '（' + count.台 + '台ぶん）／うち不合格 ' + count.不合格);
    L.push('- 決まり＝`CoreFlowアプリ\\_記録\\仕様\\分析用の書き出し_全アプリ共通の決まり.md`');
    L.push('');
    L.push('## 読むときの注意');
    L.push('- 🔴 **台数は「結果が合格の行」を数える**（不合格の行は同じ車の途中の記録）。不合格の率は「不合格の行 ÷ 行った回数」か「不合格が1回以上あった台 ÷ 台」かを必ず言い分ける。');
    L.push('- 再検合格（その場で直した）は**1回の行き**（その場で直して受かった）。再検で合格は不合格で持ち帰ったあとの回。');
    L.push('- 担当別の数は回送担当（1人目）で数える（PitFlow の車検履歴と同じ）。2人目は数えない。');
    L.push('- 記録の抜け（担当・理由が空）はデータチェックの S09〜S14 で直している最中。空は「分からない」。');
    L.push('- まだ行っていない予定は入れていない（行った記録だけ）。');
    L.push('- 出す時の段：ゆうた宛ては全部言ってよい。社員が見る物では個人の比較・評価を出さない（決まり §6.5）。');
    L.push('');
    L.push('## 列');
    L.push('');
    L.push('| 列 | 中身 |');
    L.push('|---|---|');
    SHK_COLS.forEach(function (x) { L.push('| ' + x[0] + ' | ' + x[1].replace(/\|/g, '／') + ' |'); });
    L.push('');
    return L.join('\n');
  }

  /* ================================================================
     🆕 v3（2026-10-15・棚卸し A-70・ゆうた「ものすごい金額とデータ量にならないのであれば、可能なだけデータは取って」）
     ----------------------------------------------------------------
     **PitFlow の中にもう在るのに、まだ表にしていなかった物**を6枚。🔴 アプリに無い欄は作らない（在る物だけ）。
       pitflow.操作ログ … pitAuditLogs 1件1行（全部・追記だけの記録＝消えない）
       pitflow.車       … 顧客台帳の車1台1行（車台番号＝アプリをまたぐ車の鍵・決まり §7）
       pitflow.代車     … 代車の札（pitLoanerAssigns）1枚1行（貸出・緊急・予約以外・仮押さえ）
       pitflow.代車の車 … 代車・社用車1台1行（pitLoaners・pitCompanyCars）
       pitflow.工程     … カードのフローの「工程が動いた記録」（log の type:'phase'）1件1行
       pitflow.目標     … 売上の月目標（pitSettings/main の settings.target）全体・1課・2課
     ◎サーバーが読む入れ物＝ PIT_ANALYTICS_MORE_COLS（state の名前 → 入れ物）。
       🔴 操作ログは**画面では読まない入れ物**（PitDB._COLS に入れると開くたびに全件読む）＝ここにだけ書く。
       サーバー（_サーバー\functions\analytics.js の fillPit）がこれを見て読み、state に入れる。
     ◎表は pitAnalyticsMoreTables(opt) が配列で返す（{ name, csv, dict, count }）。表を増やす時はここに足すだけ＝サーバーは触らない。
     ================================================================ */
  var MORE_COLS = { _anAuditLogs: 'pitAuditLogs' };

  function toCsv(cols, rows){
    var head = cols.map(function (x) { return x[0]; });
    return '﻿' + [head].concat(rows).map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n';
  }
  function dictOf(name, today, lines, notes, cols){
    var L = ['# ' + name + '.csv の辞書（版 ' + VERSION + '）', '',
             '- 書き出した日：' + today + '（PitFlow ' + t(w.PIT_APP_VERSION || '') + '）'];
    lines.forEach(function (x) { L.push('- ' + x); });
    L.push('- 決まり＝`CoreFlowアプリ\\_記録\\仕様\\分析用の書き出し_全アプリ共通の決まり.md`', '', '## 読むときの注意');
    notes.concat(['🔴 空と0は別。空＝分からない／入っていない。',
                  '出す時の段：ゆうた宛ては全部言ってよい。社員が見る物では個人の比較・評価を出さない（決まり §6.5）。'])
         .forEach(function (x) { L.push('- ' + x); });
    L.push('', '## 列', '', '| 列 | 中身 |', '|---|---|');
    cols.forEach(function (x) { L.push('| ' + x[0] + ' | ' + x[1].replace(/\|/g, '／') + ' |'); });
    L.push('');
    return L.join('\n');
  }
  function cardMap(){ var m = {}; (S().cards || []).forEach(function (c) { if (c && c.id) m[c.id] = c; }); return m; }
  function fleetMap(){ var m = {}; (S().loaners || []).concat(S().companyCars || []).forEach(function (v) { if (v && v.id) m[v.id] = v; }); return m; }
  function ymdNum(ms){ return ms == null ? '' : ymd(new Date(ms)); }

  /* ---------- 📝 操作ログ ---------- */
  var OPS_COLS = [
    ['アプリ', '常に pitflow'],
    ['ID', '操作ログ1件の番号（pitAuditLogs の書類の番号）'],
    ['書き出した日', 'この表を作った日'],
    ['日時', '記録した時刻（サーバーの時刻・日本時間 YYYY-MM-DD HH:MM）。空＝時刻が読めない（年の無い古い書き方は読まない）'],
    ['社員番号', 'ログインした人の番号（uid）。CoreFlow の名簿（portalMembers）の番号はふつうこれと同じ。自動の行・番号の無い古い行は空'],
    ['社員', '記録した人（画面に出ていた名前のまま）。「自動」＝アプリが自分でやった（人の名前を押さない決まり・v2.22.0）'],
    ['操作', '何をしたか（「フェーズ移動 点検待ち → 作業待ち」など）。よそのアプリから書いた印（（CarFlow）など）は外して「どこから」へ'],
    ['対象の種類', 'カード／顧客／代車／メンバー。空＝それ以外（設定・データチェックなど）'],
    ['対象ID', 'カードの番号（pitflow.csv の ID）。カード以外は空'],
    ['内容', '記録の中身（自由記述・最大300文字）。🔴 引用しない。お客様の名前は苗字に、電話・メール・ナンバー・車台番号・住所・「〇〇様」は伏せ字。顧客台帳の記録（区分 customer）は名前とナンバーが主なので［伏せた］'],
    ['どこから', 'PitFlow／CarFlow／MHS Todayボード／FlowDesk／FlowGo／ダッシュボード など。自動の行は「自動（〇〇 の端末）」＝その時に画面を開いていた端末'],
    ['区分', 'アプリの中の区分（kind）。phase＝工程移動／edit＝予約の編集／flow＝フローの直し／result＝実績・売上日／out＝完了・売上なし／delete＝取消・消去／in＝入庫／approval＝承認／loaner＝代車／customer＝顧客台帳／shaken＝車検／inspect＝データチェック／bay＝PIT配置／today＝当日ビュー（MHS・見る所）／note＝付箋／save＝送れなかった直し／member＝メンバー設定／auto＝自動／sales＝車販作業'],
    ['自動', 'アプリが自分でやった記録なら 1']
  ];
  var RE_FROM = /[（(](CarFlow|MHS[^（）()]*|FlowDesk|FlowGo|ダッシュボード|CoreFlow[^（）()]*)[）)]\s*$/;
  /* カードに結びつく記録は、そのカードのお客様の名前（フル・カナ・下の名前）を苗字に置き換えてから伏せ字にかける */
  function maskForCard(x, c){
    var sur = c ? (surnameOf(c) || '〇〇') : '';
    if (c){
      var cu = custOf(c);
      var names = [safe(function () { return w.pitCustName(c); }, ''), c.customer, c.kana,
                   t(c.sei) + t(c.mei), t(c.sei) + ' ' + t(c.mei), t(c.sei) + '　' + t(c.mei), c.mei, c.meiKana,
                   t(c.seiKana) + t(c.meiKana), t(c.seiKana) + ' ' + t(c.meiKana), cu && cu.name, cu && cu.kana]
        .map(t).filter(function (n) { return n.length >= 2; });
      names = names.filter(function (n, i) { return names.indexOf(n) === i; }).sort(function (a, b) { return b.length - a.length; });
      names.forEach(function (n) { x = x.split(n).join('\u0001'); });
    }
    return maskFree(x).replace(/\u0001/g, sur);
  }
  function pitAnalyticsOpsTable(today){
    _custById = null;
    var cards = cardMap();
    var list = (S()._anAuditLogs || []).filter(function (o) { return o && o.id; });
    var read = Array.isArray(S()._anAuditLogs);
    var count = { 行: 0, 自動: 0, 時刻なし: 0 };
    var rows = list.map(function (o) {
      var ms = tsMs(o.time);
      if (ms == null) ms = tsMs(o.at);
      var auto = !!o.auto || t(o.userName) === '自動';
      var act = t(o.action), from = '';
      var m = RE_FROM.exec(act);
      if (m){ from = m[1]; act = act.slice(0, m.index).trim(); }
      if (!from) from = auto ? ('自動' + (t(o.dev) ? '（' + t(o.dev) + ' の端末）' : '')) : 'PitFlow';
      var kind = t(o.kind), cid = t(o.cardId), c = cid ? cards[cid] : null;
      var what = cid ? 'カード' : kind === 'customer' ? '顧客' : kind === 'loaner' ? '代車' : kind === 'member' ? 'メンバー' : '';
      var body = kind === 'customer' ? (t(o.label) ? '［伏せた］' : '') : clip(maskForCard(t(o.label), c), 300);
      var uid = t(o.uid); if (/@|＠/.test(uid)) uid = '';   /* 万一メールが番号になっていたら出さない */
      count.行++; if (auto) count.自動++; if (ms == null) count.時刻なし++;
      return { ms: ms, r: ['pitflow', o.id, today, hm(ms), uid, auto ? '自動' : t(o.userName), maskFree(act), what, cid, body, from, kind, auto ? 1 : ''] };
    });
    rows.sort(function (a, b) { return (a.ms == null ? Infinity : a.ms) - (b.ms == null ? Infinity : b.ms) || (a.r[1] < b.r[1] ? -1 : 1); });
    rows = rows.map(function (x) { return x.r; });
    return { name: 'pitflow.操作ログ', csv: toCsv(OPS_COLS, rows), count: count,
      dict: dictOf('pitflow.操作ログ', today, [
        '1行＝操作ログ1件（pitAuditLogs）。**全部**（画面の操作ログは直近1000件だけ見せるが、表は全部）。古い順。',
        '行数：' + count.行 + '／うち自動 ' + count.自動 + '／時刻が読めない ' + count.時刻なし + (read ? '' : '（⚠ 操作ログを読めなかった＝空の表。サーバーが pitAuditLogs を読んでいない）')
      ], [
        '🔒 操作ログは誰も消せない・書き換えられない（v2.187.1）。追記だけ＝前の晩の表より行が減ることは無い。',
        '🔴 「内容」は自由記述。**引用しない**（伏せ字をかけても、言い回しから人が分かることがある）。数える・並べるのは「操作」「区分」「社員」で。',
        'カードの中身（金額・状態など）は pitflow.csv を 対象ID＝ID で引く。',
        'PitFlow 以外（CarFlow・MHS・FlowDesk など）から PitFlow のカードを動かした記録もここに入る（どこから で分かる）。',
        '社員の名前は記録した時に画面に出ていた名前のまま（表示名が多い・古い行やよそのアプリの行はフルネームのことがある）。結ぶのは社員番号で。',
        'v2.185.0（2026-10-15）より前は顧客台帳の記録（区分 customer）が入っていない（記録する関数が無かった）。'
      ], OPS_COLS) };
  }

  /* ---------- 🚗 車（顧客台帳の車） ---------- */
  var VEH_COLS = [
    ['アプリ', '常に pitflow'],
    ['ID', '車両番号（vehId）＝pitflow.csv の 車両番号'],
    ['書き出した日', 'この表を作った日'],
    ['お客様番号', 'その車を持っている顧客台帳の番号＝pitflow.csv の お客様番号'],
    ['車台番号', '🚗 アプリをまたぐ車の鍵（決まり §7）。空＝入っていない（伝票の取り込み・顧客の画面で入る）'],
    ['メーカー', 'BMW の MINI と MINI はまとめて MINI（pitflow.csv と同じ）'],
    ['車種', '車の車種'],
    ['カルテ番号', '整備ソフトのカルテ番号（karteNo）'],
    ['課', '1課（国産）／2課（輸入）／受付。空＝入っていない'],
    ['フロント担当', 'その車の担当フロント（名前のまま）'],
    ['車両注意', '左ハンドル・M/T・車高・土禁 などを「・」でつなぐ'],
    ['伝票の数', 'クォーターチェックで書き込んだ伝票の数（0＝無い）'],
    ['アーカイブ', '車を消した（アーカイブで残した）なら 1'],
    ['アーカイブ日', '消した日'],
    ['統合先', '車両の統合で寄せた先の車両番号（mergedInto）。空＝統合されていない']
  ];
  function pitAnalyticsVehTable(today){
    var st = S(), rows = [], count = { 行: 0, 車台番号あり: 0 };
    (st.customers || []).forEach(function (cu) {
      (cu && Array.isArray(cu.vehicles) ? cu.vehicles : []).forEach(function (v) {
        if (!v || !v.id) return;
        var vin = t(v.vin);
        count.行++; if (vin) count.車台番号あり++;
        rows.push(['pitflow', v.id, today, t(cu.id), vin, (t(v.car) || t(v.maker)) ? pitCardMaker(v) : '', t(v.car), t(v.karteNo),
          v.division ? labelIn(st.divisions, v.division) : '', t(v.frontStaff),
          (Array.isArray(v.drive) ? v.drive : []).map(t).filter(Boolean).join('・'),
          Array.isArray(v.伝票) ? v.伝票.length : 0,
          v.archived ? 1 : '', dayOf(v.archivedAt), t(v.mergedInto)]);
      });
    });
    return { name: 'pitflow.車', csv: toCsv(VEH_COLS, rows), count: count,
      dict: dictOf('pitflow.車', today, ['1行＝顧客台帳の車1台（お客様1人に何台も付く）。', '行数：' + count.行 + '／うち車台番号あり ' + count.車台番号あり], [
        '🔴 車は車台番号でつなぐ（ナンバーは変わる・名前は同じ人がいる）。車台番号が空の車は**結ばずに空のまま**（決まり §7）。',
        '🔴 ナンバー・お客様の名前・電話は出さない（決まり §6）。お客様は pitflow.csv の呼び名を お客様番号 で引く。',
        '入庫は pitflow.csv の 車両番号＝この ID で引く。'
      ], VEH_COLS) };
  }

  /* ---------- 🚙 代車の札 ---------- */
  var LOAN_COLS = [
    ['アプリ', '常に pitflow'],
    ['ID', '札の番号（pitLoanerAssigns）'],
    ['書き出した日', 'この表を作った日'],
    ['種類', '貸出（予約）＝予約カードの代車／貸出（予約以外）＝代車カレンダーから手で入れた／緊急＝緊急の代車／仮押さえ＝🅿 押さえただけ（貸していない）'],
    ['代車番号', '代車の番号＝pitflow.代車の車 の ID'],
    ['代車の名前', '代車の名前（代車1 など）'],
    ['代車の車種', '代車の車種'],
    ['カードID', '予約カードの番号＝pitflow.csv の ID。予約以外・仮押さえは空'],
    ['予約番号', 'カードの予約番号'],
    ['お客様番号', 'カードの顧客台帳の番号'],
    ['呼び名', '苗字＋車種（カードから・pitflow.csv と同じ）。予約以外・緊急・仮押さえは空（手で打った名前は出さない）'],
    ['貸出日', '貸す日（fromDate）'],
    ['返却予定日', '返す日（toDate）。⚠ 返却済みになると実際の返却日に縮める（元の予定は次の列）'],
    ['元の返却予定日', '自動で返却済みにした時に控えた元の予定（toDateBefore）。空＝縮めていない'],
    ['返却済み', '返ってきたなら 1'],
    ['返却日', '返ってきた日（returnedAt）'],
    ['返却の付け方', '自動（車の返車に合わせた）／手で確定。空＝まだ'],
    ['洗車済み', '今の代車を洗った印があれば 1（代車を差し替えたら外れる）'],
    ['用途・メモ', '予約以外の用途・仮押さえのメモ（自由記述・最大200文字・伏せ字）。🔴 引用しない'],
    ['作った日時', '札を作った時刻（createdAt）。古い札・予約から作った札は入っていない＝空']
  ];
  function pitAnalyticsLoanerTable(today){
    _custById = null;
    var cards = cardMap(), fl = fleetMap(), rows = [], count = { 行: 0, 貸出: 0, 仮押さえ: 0 };
    (S().loanerAssigns || []).forEach(function (a) {
      if (!a || !a.id) return;
      var c = a.cardId ? cards[a.cardId] : null, v = fl[a.loanerId] || {};
      var kind = a.hold ? '仮押さえ' : a.emergency ? '緊急' : a.cardId ? '貸出（予約）' : '貸出（予約以外）';
      count.行++; if (a.hold) count.仮押さえ++; else count.貸出++;
      rows.push(['pitflow', a.id, today, kind, t(a.loanerId), t(v.name), t(v.model), t(a.cardId),
        c ? t(c.resNo) : '', c ? t(c.customerId) : '', c ? callName(c) : '',
        dayOf(a.fromDate), dayOf(a.toDate), dayOf(a.toDateBefore),
        a.returned ? 1 : '', a.returned ? dayOf(a.returnedAt) : '',
        a.returned ? (a.autoReturned ? '自動（車の返車に合わせた）' : '手で確定') : '',
        (a.washDone && a.washDone === a.loanerId) ? 1 : '',
        clip(maskForCard(t(a.hold ? (a.memo || a.purpose) : a.purpose), c), 200),
        hm(tsMs(a.createdAt))]);
    });
    return { name: 'pitflow.代車', csv: toCsv(LOAN_COLS, rows), count: count,
      dict: dictOf('pitflow.代車', today, ['1行＝代車の札1枚（代車カレンダーの1本）。', '行数：' + count.行 + '／うち貸出 ' + count.貸出 + '／仮押さえ ' + count.仮押さえ], [
        '🔴 稼働（何日貸したか）を数える時は仮押さえを外す（貸していない）。',
        '予約カードの代車は、カードの代車の欄から作られる（予約を直すと札も動く）。',
        '代車の作業予定（車検・点検の枠）は札ではなくカード（pitflow.csv の 社内車両＝代車）にある。'
      ], LOAN_COLS) };
  }

  /* ---------- 🚙 代車・社用車 ---------- */
  var FLEET_COLS = [
    ['アプリ', '常に pitflow'],
    ['ID', '車の番号＝pitflow.代車 の 代車番号'],
    ['書き出した日', 'この表を作った日'],
    ['区分', '代車／社用車'],
    ['番号', '代車の番号（number）'],
    ['名前', '名前（代車1 など）'],
    ['メーカー', 'メーカー'],
    ['車種', '車種（model）'],
    ['車の種類', '軽自動車／普通車／輸入車／商用車'],
    ['緊急', '緊急用に足した車なら 1'],
    ['リース', 'リース車両なら 1'],
    ['リースアップ日（確定）', '確定したリースアップ日'],
    ['リースアップ（暫定）', '暫定のリースアップ（入っている形のまま・年月のことがある）'],
    ['車検満了日', '車検の満了日（shakenDate）'],
    ['入替予定日', '入れ替える予定の日（replaceDate）'],
    ['引退', '引退した車なら 1'],
    ['引退日', '引退した日'],
    ['車両番号', '顧客台帳の車（custVehId）＝pitflow.車 の ID。整備の入庫はこの車両番号で pitflow.csv に出る'],
    ['車台番号', '顧客台帳の車の車台番号（custVehId から）']
  ];
  function pitAnalyticsFleetTable(today){
    var vm = vehMap(), rows = [], count = { 行: 0, 代車: 0, 社用車: 0 };
    var CAT = { kei: '軽自動車', normal: '普通車', import: '輸入車', commercial: '商用車' };
    [['代車', S().loaners], ['社用車', S().companyCars]].forEach(function (g) {
      (g[1] || []).forEach(function (v) {
        if (!v || !v.id) return;
        var h = v.custVehId ? vm[t(v.custVehId)] : null;
        count.行++; count[g[0]]++;
        rows.push(['pitflow', v.id, today, g[0], t(v.number), t(v.name), t(v.maker), t(v.model), CAT[v.category] || t(v.category),
          v.emergency ? 1 : '', v.lease ? 1 : '', dayOf(v.leaseUpFixed), t(v.leaseUp), dayOf(v.shakenDate), dayOf(v.replaceDate),
          v.retired ? 1 : '', dayOf(v.retiredAt), t(v.custVehId), h ? t(h.veh.vin) : '']);
      });
    });
    return { name: 'pitflow.代車の車', csv: toCsv(FLEET_COLS, rows), count: count,
      dict: dictOf('pitflow.代車の車', today, ['1行＝代車・社用車1台（引退した車も残す）。', '行数：' + count.行 + '／うち代車 ' + count.代車 + '／社用車 ' + count.社用車], [
        '🔴 ナンバーは出さない（決まり §6）。結ぶのは ID・車両番号・車台番号。',
        'リースアップ日は「確定 → 無ければ暫定の月」（PitFlow の pitLeaseEnd と同じ考え）。暫定は年月のまま出している。'
      ], FLEET_COLS) };
  }

  /* ---------- 🔁 工程（フローの「工程が動いた」記録） ---------- */
  var PH_COLS = [
    ['アプリ', '常に pitflow'],
    ['ID', 'カードの番号＝pitflow.csv の ID（カード1枚に何行も付く）'],
    ['書き出した日', 'この表を作った日'],
    ['予約番号', 'カードの予約番号'],
    ['何回目の移動', 'そのカードで工程が動いた何回目か（フローの並び順）'],
    ['日時', '動いた時刻（YYYY-MM-DD HH:MM）。フローで日時を直したら直した後の時刻（v1.58.0 から「直した時刻が本物」）。空＝年の無い古い書き方で読めない'],
    ['前の工程', '動く前の工程（画面の言葉）'],
    ['次の工程', '動いた先の工程（画面の言葉）'],
    ['動かした人', '動かした人の呼び名（記録のまま）。空＝v1.55.0 より前の記録（担当が残っていなかった）'],
    ['金額', 'その時に入っていた金額（税抜・円）。連絡中へ＝見積／パーツ待ちへ＝受注／作業完了へ＝確定。空＝入っていない'],
    ['金額の種類', '見積／受注／確定'],
    ['クイック受注', 'パーツ待ちを飛ばして受注した移動なら 1']
  ];
  function pitAnalyticsPhaseTable(today){
    var st = S(), rows = [], count = { 行: 0, 台: 0, 時刻なし: 0 };
    var lab = function (x) { return safe(function () { return w.pitStatusJa(x); }, t(x)); };
    (st.cards || []).forEach(function (c) {
      if (!c || !c.id || c._draft || !Array.isArray(c.log)) return;
      var n = 0;
      c.log.forEach(function (e) {
        if (!e || e.type !== 'phase') return;
        var ms = tsMs(e.at); if (ms == null) ms = tsMs(e.atTxt);
        n++; count.行++; if (ms == null) count.時刻なし++;
        var amt = (e.amount == null || e.amount === '') ? '' : num(e.amount);
        rows.push(['pitflow', c.id, today, t(c.resNo), n, hm(ms), lab(e.from), lab(e.to), t(e.by), amt, amt === '' ? '' : t(e.amountKind), e.quick ? 1 : '']);
      });
      if (n) count.台++;
    });
    return { name: 'pitflow.工程', csv: toCsv(PH_COLS, rows), count: count,
      dict: dictOf('pitflow.工程', today, ['1行＝工程が動いた記録1件（カードのフローのうち type:\'phase\'）。', '行数：' + count.行 + '（' + count.台 + '台ぶん）／時刻が読めない ' + count.時刻なし], [
        '「その工程に何日いたか」は、同じカードの次の行の日時との差。最後の行の工程は今の工程（pitflow.csv の 状態）。',
        '何度も行き来したカードは同じ工程が何度も出る（PitFlow の日数の数え方は「最後に入った時」から）。',
        'PitFlow を使い始めた頃のカードは工程の記録がばらつく（記録より前に動いた分は無い）。完TEL日・受注日は pitflow.csv にもある。'
      ], PH_COLS) };
  }

  /* ---------- 🎯 売上の月目標 ---------- */
  var GOAL_COLS = [
    ['アプリ', '常に pitflow'],
    ['ID', 'all＝全体／div1＝1課／div2＝2課'],
    ['書き出した日', 'この表を作った日'],
    ['範囲', '全体／1課（国産）／2課（輸入）'],
    ['最低目標', '月の最低目標（税抜・円）。売上画面と同じ（pitSalesTarget・課は pitSalesDivTarget）'],
    ['上の目標', '月の上の目標（税抜・円）'],
    ['国産の割合', '課に分ける時の国産の％（ルール画面の ratioD・既定50）。課の目標＝月目標×この％、輸入＝全体−国産'],
    ['設定', '設定あり＝ルール画面で入れた値／既定値＝入れていない（アプリの既定 最低1,500万・上2,000万を使っている）']
  ];
  function pitAnalyticsGoalTable(today){
    var tg = (S().settings && S().settings.target) || {};
    var set = !!(Number(tg.monthMin) || Number(tg.monthMax));
    var all = safe(function () { return w.pitSalesTarget(); }, null);
    var rows = [];
    if (all){
      var r = Number(tg.ratioD); r = (tg.ratioD != null && isFinite(r)) ? r : 50;
      rows.push(['pitflow', 'all', today, '全体', all.min, all.max, r, set ? '設定あり' : '既定値']);
      [['div1', '1課（国産）'], ['div2', '2課（輸入）']].forEach(function (k) {
        var d = safe(function () { return w.pitSalesDivTarget(k[0]); }, null);
        if (d) rows.push(['pitflow', k[0], today, k[1], d.min, d.max, r, set ? '設定あり' : '既定値']);
      });
    }
    return { name: 'pitflow.目標', csv: toCsv(GOAL_COLS, rows), count: { 行: rows.length },
      dict: dictOf('pitflow.目標', today, ['1行＝目標1つ（全体・1課・2課）。', '行数：' + rows.length + (all ? '' : '（⚠ 売上画面の目標を読めなかった）')], [
        '🔴 **今の設定だけ**。過去の月の目標はアプリに残っていない＝その月の目標は月末の控え（monthly/YYYY-MM/）の pitflow.目標 を読む。',
        'クォーターの目標は月目標を4等分（売上画面と同じ）。実績は pitflow.csv の 売上の区分＝実績・実績日 で数える。'
      ], GOAL_COLS) };
  }

  function pitAnalyticsMoreTables(opt){
    opt = opt || {};
    var today = opt.today || ymd(new Date());
    _custById = null; _vehById = null;
    return [pitAnalyticsOpsTable(today), pitAnalyticsVehTable(today), pitAnalyticsLoanerTable(today),
            pitAnalyticsFleetTable(today), pitAnalyticsPhaseTable(today), pitAnalyticsGoalTable(today)];
  }
  w.pitAnalyticsMoreTables = pitAnalyticsMoreTables;
  w.PIT_ANALYTICS_MORE_COLS = MORE_COLS;

  w.pitAnalyticsShakenTable = pitAnalyticsShakenTable;
  w.pitCardMaker = pitCardMaker;
  w.pitCardCost = pitCardCost;
  w.pitAnalyticsTable = pitAnalyticsTable;
  w.PIT_ANALYTICS_VERSION = VERSION;
})(window);
