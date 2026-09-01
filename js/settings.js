/* ========================================
   settings.js  -  設定画面（PitFlow v0.14.0）
   ----------------------------------------
   ◎ここで変えられるもの（すべてこの端末のブラウザ内に保存＝リロードしても残る）
     ・1日の予約上限（国産／輸入）　…… ダッシュボード「予約の埋まり」の基準
     ・置ける台数（lotCapacity）　 …… 混雑度ゲージ・2週間バー・最短入庫の基準
     ・最短入庫の預かり想定日数（holdDaysDefault）
     ・概算預かり日数の初期値（作業タイプ別＝estHold表）…… 新規予約時の「予想」軸の初期値
   ◎ここでは変えられなくなったもの（v1.50.0）
     ・営業時間・定休曜日・長期休み → **MHSの定休日カレンダーが唯一の基準**。
       ここは「いま何が届いているか」を見るだけの画面になった（直すのはMHS側）。
   ◎保存は「変更した瞬間」に自動（PitDB.save 経由）。✓表示で知らせる。
   ======================================== */

(function () {


  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function numIn(id, val, min, max) {
    return '<input type="number" class="ps-in ps-num" id="' + id + '" value="' + val + '"'
      + ' min="' + min + '" max="' + max + '" onchange="pitSettingsApply()">';
  }

  function floatIn(id, val, min, max) {
    return '<input type="number" class="ps-in ps-num" id="' + id + '" value="' + val + '"'
      + ' min="' + min + '" max="' + max + '" step="0.1" onchange="pitSettingsApply()">';
  }

  function manStr(yen) { // 円 → 万円表記（小数1桁・末尾の.0は省く）
    const v = Math.round(yen / 1000) / 10;
    return (v % 1 === 0) ? String(v) : v.toFixed(1);
  }

  window.renderSettings = function () {
    const body = document.getElementById('view-settings-body');
    if (!body) return;
    const s = state.settings || {};
    const rc = s.reserveCap || { default: 5, import: 3 };
    if (window.pitNormalizeEst) pitNormalizeEst();
    const estD = (s.estHold && s.estHold.default) || {};
    const estI = (s.estHold && s.estHold.import) || {};

    let h = '';

    h += '<div class="ps-bar"><span class="ps-bar-note">変更すると<b>その場で自動保存</b>されます（この端末のブラウザ内）。</span>'
       + '<span class="ps-status" id="ps-status"></span>'
       + '<button class="vh-btn" onclick="pitSettingsReset()">↩ 初期値に戻す</button></div>';


    /* ==================================================================
       🗂 v2.50.0（ゆうた指定 2026-09-01）**設定画面をグループに分けた。**
       🗣「今みたいな単機能を機能つける時に使ったりしてるから、今後使わないであろうものも結構あるはず」
       🗣「あとサイドバーを付けた方がいいのか？」→ **要らない**（13枚では覚える手間が増えるだけ）。
          代わりに**見出しで4つに分け、下の2つはたたむ**。普段見えるのが13枚→7枚になる。
       ◎分け方は「見え方／データ」ではなく**開いた時の目的**で分けた。
         設定を開く理由は「数字を直したい」か「道具を使いたい」のどちらかで、
         「見え方かデータか」では分かれないため。
       ⚠ 順番を変えただけ。**中身は1つも触っていない**（保存する所も同じ）。
       ================================================================== */

    /* 🗑 v2.50.0（ゆうた確定 2026-09-01）**「過去の伝票を取り込む」を外した。**
       PitFlow を始める前のデータを入れる**1回きりの道具**で、もう済んでいる。
       ⚠ `js/past-import.js` は `_to_delete` へ移してある（消していない）。
          また要るようになったら、そこから戻して index.html に読み込みを足す。 */

    /* 🗑 v2.50.0（ゆうた確定）**「作業タイプ（見るだけ）」を外した。**
       ここは**見るだけの写し**で、本体は🧩ルールページにある。
       🔴 見るだけの写しが2か所にあると、**どちらが本体か分からなくなる**（この画面の一番の敵）。
       ⚠ ルールページへの案内はこの上に残してある。 */

    h += '<div class="ps-sec"><span class="ps-sec-t">① 毎日の設定</span><span class="ps-sec-n">数字とルール</span></div>';
    /* ===== 入庫まわりは🧩ルールページへ集約（2026-06-04 ゆうた指示） ===== */
    h += '<div class="ps-card" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">';
    h += '<div style="font-size:13px;color:var(--text2);line-height:1.7;flex:1;min-width:240px"><i data-ic=download data-ics=16></i> <b>入庫に関する設定（予約枠・売上目標・平均単価・曜日ルールなど）は「<i data-ic=puzzle data-ics=16></i> ルール」ページに集約</b>しました。入庫のアルゴリズムはすべてそちらで調整します。</div>';
    h += '<button class="vh-btn primary" onclick="showView(\'rules\')"><i data-ic=puzzle data-ics=16></i> ルールページを開く</button>';
    h += '</div>';

    /* ===== 置き場 ===== */
    const lc = s.lotCap || { pit: 4, yard: 12, parking: 8, extra: 4 };
    const lcSum = (lc.pit||0) + (lc.yard||0) + (lc.parking||0) + (lc.extra||0);
    h += '<div class="ps-card">';
    h += '<div class="ps-h"><i data-ic=parking data-ics=16></i> 置き場（混雑度の基準）</div>';
    h += '<div class="ps-desc">同時に預かれる台数を<b>場所ごとに分けて</b>持ちます。混雑度ゲージ・2週間バー・最短入庫は<b>4つの合計</b>で計算。「緊急＋α」は最悪ここまで使える、の上乗せ分。</div>';
    h += '<div class="ps-grid">';
    h += '<label class="ps-lb"><i data-ic=wrench data-ics=16></i> ピット内 ' + numIn('ps-lot-pit', lc.pit != null ? lc.pit : 4, 0, 99) + '<span class="ps-unit">台</span></label>';
    h += '<label class="ps-lb"><i data-ic=home data-ics=16></i> 自社敷地 ' + numIn('ps-lot-yard', lc.yard != null ? lc.yard : 12, 0, 99) + '<span class="ps-unit">台</span></label>';
    h += '<label class="ps-lb"><i data-ic=parking data-ics=16></i> 駐車場 ' + numIn('ps-lot-park', lc.parking != null ? lc.parking : 8, 0, 99) + '<span class="ps-unit">台</span></label>';
    h += '<label class="ps-lb"><i data-ic=warn data-ics=16></i> 緊急＋α ' + numIn('ps-lot-extra', lc.extra != null ? lc.extra : 4, 0, 99) + '<span class="ps-unit">台</span></label>';
    h += '<span class="ps-lb">＝ 合計 <b id="ps-lot-sum" style="font-size:17px">' + lcSum + '</b><span class="ps-unit">台</span></span>';
    h += '</div>';
    h += '<div class="ps-grid" style="margin-top:12px">';
    h += '<label class="ps-lb">最短入庫の預かり想定 ' + numIn('ps-hold', s.holdDaysDefault != null ? s.holdDaysDefault : 3, 1, 60) + '<span class="ps-unit">日</span></label>';
    h += '</div>';
    h += '<div class="ps-hint">※「最短で入庫できる日」は、この想定日数ぶん預かっても置き場（合計）が溢れない最初の日を探します。</div>';
    const ov = s.lotOver || { warn: 5, danger: 10 };
    h += '<div class="ps-grid" style="margin-top:12px">';
    h += '<span class="ps-lb" style="font-weight:700">空き数字の色分け</span>';
    h += '<label class="ps-lb"><i data-ic=dot data-ics=12 style=color:#f97316></i> 超過がここまでオレンジ ' + numIn('ps-over-warn', ov.warn != null ? ov.warn : 5, 0, 98) + '<span class="ps-unit">台</span></label>';
    h += '<label class="ps-lb"><i data-ic=dot data-ics=12 style=color:#ef4444></i> ここからは赤 ' + numIn('ps-over-danger', ov.danger != null ? ov.danger : 10, 1, 99) + '<span class="ps-unit">台 以上</span></label>';
    h += '</div>';
    h += '<div class="ps-hint">※ 空き0台まではずっと<b style="color:#1db97a">緑</b>。ちょい超過は緊急＋α・コインパで吸収できる「普通」なので、赤を安売りして受付が萎縮しないように（間の台数は濃いオレンジ）。</div>';
    h += '</div>';

    /* ===== 概算預かり日数の初期値 ===== */
    h += '<div class="ps-card">';
    h += '<div class="ps-h"><i data-ic=hourglass data-ics=15></i> 概算預かり日数の初期値（作業タイプ別・国産／輸入）</div>';
    h += '<div class="ps-desc">作業タイプを選んだ時にカードへ自動で入る「だいたい何日預かるか」。<b>国産車と輸入車で別々</b>に設定できます。カードごとに後から手で直せます。</div>';
    h += '<div class="ps-est2">';
    h += '<div class="ps-est2-head"><span class="ps-est2-name"></span><span class="ps-est2-cell">国産</span><span class="ps-est2-cell">輸入</span></div>';
    (state.workTypes || []).forEach(function (w) {
      h += '<div class="ps-est2-row"><span class="ps-est2-name"><span class="ps-est-tag" style="background:' + w.color + '"></span>' + esc(w.label) + '</span>'
         + '<span class="ps-est2-cell">' + numIn('ps-est-' + w.id + '-def', estD[w.id] != null ? estD[w.id] : (estD._default != null ? estD._default : 5), 0, 60) + '<span class="ps-unit">日</span></span>'
         + '<span class="ps-est2-cell">' + numIn('ps-est-' + w.id + '-imp', estI[w.id] != null ? estI[w.id] : (estI._default != null ? estI._default : 5), 0, 60) + '<span class="ps-unit">日</span></span></div>';
    });
    h += '<div class="ps-est2-row"><span class="ps-est2-name"><span class="ps-est-tag" style="background:#64748b"></span>その他</span>'
       + '<span class="ps-est2-cell">' + numIn('ps-est-default-def', estD._default != null ? estD._default : 5, 0, 60) + '<span class="ps-unit">日</span></span>'
       + '<span class="ps-est2-cell">' + numIn('ps-est-default-imp', estI._default != null ? estI._default : 5, 0, 60) + '<span class="ps-unit">日</span></span></div>';
    h += '</div>';
    h += '<div class="ps-hint">※ 受付タイプが「待ち」「当日返車」のときは、この表に関係なく <b>0日（置き場を使わない）</b>になります。</div>';
    h += '</div>';

    /* ===== 概算金額の初期値（v0.27.0） ===== */
    const eamD = (s.estAmount && s.estAmount.default) || {};
    const eamI = (s.estAmount && s.estAmount.import) || {};
    h += '<div class="ps-card">';
    h += '<div class="ps-h"><i data-ic=money data-ics=16></i> 概算金額の初期値（作業タイプ別・国産／輸入）</div>';
    h += '<div class="ps-desc">作業タイプを選んだ時にカードの「概算金額」へ自動で入る金額。<b>国産車と輸入車で別々</b>に設定できます。'
       + 'いまの値は<b>令和8年1〜6月の実売上999伝票の中央値</b>（税抜・法定費用除く）。'
       + '<b>平均ではなく中央値</b>なのは、高額修理で上振れしたまま概算を出すとお客様への提示が高くなりすぎるためです。</div>';
    h += '<div class="ps-est2 ps-est2-money">';
    h += '<div class="ps-est2-head"><span class="ps-est2-name"></span><span class="ps-est2-cell">国産</span><span class="ps-est2-cell">輸入</span></div>';
    (state.workTypes || []).forEach(function (w) {
      h += '<div class="ps-est2-row"><span class="ps-est2-name"><span class="ps-est-tag" style="background:' + w.color + '"></span>' + esc(w.label) + '</span>'
         + '<span class="ps-est2-cell">' + numIn('ps-eam-' + w.id + '-def', eamD[w.id] != null ? eamD[w.id] : (eamD._default != null ? eamD._default : 100000), 0, 9999999) + '<span class="ps-unit">円</span></span>'
         + '<span class="ps-est2-cell">' + numIn('ps-eam-' + w.id + '-imp', eamI[w.id] != null ? eamI[w.id] : (eamI._default != null ? eamI._default : 100000), 0, 9999999) + '<span class="ps-unit">円</span></span></div>';
    });
    h += '<div class="ps-est2-row"><span class="ps-est2-name"><span class="ps-est-tag" style="background:#64748b"></span>その他</span>'
       + '<span class="ps-est2-cell">' + numIn('ps-eam-default-def', eamD._default != null ? eamD._default : 100000, 0, 9999999) + '<span class="ps-unit">円</span></span>'
       + '<span class="ps-est2-cell">' + numIn('ps-eam-default-imp', eamI._default != null ? eamI._default : 100000, 0, 9999999) + '<span class="ps-unit">円</span></span></div>';
    h += '</div>';
    h += '<div class="ps-hint">※ 実態に合わせて調整できます。コーティング（1Y／3M）は当時のデータが無いため仮置きです。</div>';
    /* 🔴 v1.64.0（ゆうた指定）「忘れないように」＝いま暫定で動いていることと、半年後にどうするかをここに残す。
          ⚠ 中身を変えるときは state.js の `PIT_BASE_AMOUNT` の頭のメモも一緒に直すこと。 */
    h += '<div class="ps-note-auto">'
       + '<div class="ps-note-auto-h"><i data-ic=bulb data-ics=16></i> この金額は、いずれ実績から自動計算に切り替えます（暫定運用中）</div>'
       + '<div class="ps-note-auto-b">'
       + '<b>いまの状態</b>：この表（中央値）は<b>新規予約の概算</b>に使っています。'
       + '売上 ▸ フロントの「<b>受注の質</b>」で比べている基準値は<b>これとは別の数字</b>で、'
       + '同じ実売上データの<b>平均</b>を裏に持っています（概算は控えめに、評価は真ん中を当てる、と仕事が違うため）。'
       + '<br><b>半年ほど運用したら</b>：直近6ヶ月の実績（返車まで終わって確定額が入った台）を'
       + '作業タイプ × 国産／輸入 のマスごとに集計して、<b>平均＝評価の基準値</b>／<b>中央値＝この概算金額</b>に自動で入れ替える予定です。'
       + '<br><b>そのとき詰めること</b>：立ち上がりは台数が足りず平均が跳ねる（200万が1台入ると20台のマスで平均が2倍）。'
       + 'ガクッと変わらないよう手入力値からにじり寄らせるか、大玉を内訳で切り出して見せるか、を実データを見てから決めます。'
       + '</div></div>';
    h += '</div>';

    /* ===== 🏭 外注先（増減できる・v0.79.0） ===== */
    h += '<div class="ps-card">';
    h += '<div class="ps-h" style="display:flex;align-items:center;gap:10px"><i data-ic=external data-ics=16></i> 外注先（提携先）<button class="vh-btn" style="margin-left:auto" onclick="pitOsAdd()">＋ 外注先を追加</button></div>';
    h += '<div class="ps-desc">カードを「外注」フェーズに移すとき選ぶ提携先リスト。外注ビューの行にもなります（削除しても過去カードのデータは消えません）。</div>';
    (s.outsourcePartners || []).forEach(function (p, i) {
      h += '<div class="ps-wt-row">'
         + '<input type="text" class="ps-in" style="width:220px" value="' + esc(p) + '" onchange="pitOsEdit(' + i + ',this.value)">'
         + '<button class="rl-del" title="削除" onclick="pitOsDel(' + i + ')"><i data-ic=trash data-ics=16></i></button>'
         + '</div>';
    });
    if (!(s.outsourcePartners || []).length) h += '<div class="ps-hint">まだ外注先がありません。「＋ 外注先を追加」で登録してください。</div>';
    h += '</div>';

    /* ===== 🚫 営業日・営業時間（v1.50.0 MHSの定休日カレンダーが基準・ここでは直せない） ===== */
    h += pitCalCardHtml();

    // 🧰 作業内容テンプレート（症状ホイール）の編集（work-content.js・v0.70.0）
    h += (window.WorkContent ? WorkContent.settingsCardHtml() : '');
    // 🅿️ 駐車場（理論値・バッファ）の編集（parking.js・v0.71.0）
    h += (window.ParkingView ? ParkingView.settingsCardHtml() : '');
    // 設定の引っ越し（開発サイト → 本番サイト）
    h += (window.pitTransferCardHtml ? pitTransferCardHtml() : '');

    h += '<div class="ps-sec"><span class="ps-sec-t">② 見え方</span><span class="ps-sec-n">画面の見た目だけ。数字は変わりません</span></div>';
    /* ===== 🚙 代車リミットの色（閾値） ===== */
    const lcl = s.loanerColors || { greenMin: 4, amberMin: 2 };
    h += '<div class="ps-card">';
    h += '<div class="ps-h"><i data-ic=van data-ics=16></i> 代車リミットの色（残り日数）</div>';
    h += '<div class="ps-desc">代車の返却まで残り日数で色が変わります。<b style="color:#1db97a">緑</b>＝余裕／<b style="color:#f59e0b">黄</b>＝注意／<b style="color:#ef4444">赤</b>＝間近／<b style="color:#9fa8c7">黒</b>＝超過（返却日を過ぎた）。</div>';
    h += '<div class="ps-grid">';
    h += '<label class="ps-lb"><i data-ic=dot data-ics=12 style=color:#22c55e></i> 緑：残り ' + numIn('ps-loan-green', lcl.greenMin != null ? lcl.greenMin : 4, 1, 60) + '<span class="ps-unit">日 以上</span></label>';
    h += '<label class="ps-lb"><i data-ic=dot data-ics=12 style=color:#eab308></i> 黄：残り ' + numIn('ps-loan-amber', lcl.amberMin != null ? lcl.amberMin : 2, 1, 59) + '<span class="ps-unit">日 以上</span></label>';
    h += '</div>';
    h += '<div class="ps-hint">※ 黄の日数〜緑の手前＝黄、それ未満（当日0日含む）＝赤、返却日を過ぎる＝黒（超過）。</div>';
    h += '</div>';

    /* ===== 🏭 PIT配置図（専用エディタを別画面で開く・v0.47.0） ===== */
    var pitN = (window.PitFloorEditor && PitFloorEditor.countPits) ? PitFloorEditor.countPits() : (Array.isArray(state.bays) ? state.bays.length : 0);
    h += '<div class="ps-card">';
    h += '<div class="ps-h"><i data-ic=factory data-ics=16></i> PIT配置図（工場の簡易レイアウト）</div>';
    h += '<div class="ps-desc">工場の<b>簡易的な平面図</b>を作ります。専用の編集画面で、PIT枠（平PIT／リフトPIT）をグリッドに沿って並べ、建物・ドア・シャッター・通路も置けます。ここで作った図に、作業中の車（カード）をはめていきます（次の段で「Pitリスト」「PITボード」に表示）。</div>';
    h += '<div class="pf-launch">';
    h += '<button class="vh-btn primary" onclick="if(window.PitFloorEditor)PitFloorEditor.open()"><i data-ic=factory data-ics=16></i> PIT配置図を編集する</button>';
    h += '<span class="pf-launch-meta">現在のPIT枠：' + pitN + ' 個</span>';
    h += '</div>';
    h += '</div>';


    /* ③ 道具＝**たまにしか使わないもの**。普段はたたんでおく。
       ⚠ 外から足す箱（引っ越し・初期化）も、ここに入る場所（`ps-tools-body` / `ps-danger-body`）を用意してある。 */
    h += '<details class="ps-fold"><summary><i data-ic=wrench data-ics=16></i> 道具 <span class="ps-sec-n">たまに使うもの</span></summary><div class="ps-fold-b">';
    /* 🗑 v2.50.0（ゆうた指摘 2026-09-01「これも今は電源ボタンにあるから消去でいいでしょ？」）
       **「全端末を今すぐ更新する」を外した。**
       🔴 まったく同じものが**電源ボタンのメニュー**にある（「全員の この画面を更新」／「全員の 全アプリを更新」）。
       　 中身はどちらも `coreflow-power.js` の `doForce` 1本＝**入口だけが2つあった。**
       ⚠ 入口が2つあると、片方だけ直したり、片方だけ権限がずれたりする。**入口も1本にする。**
       ⚠ 消したのは入口だけ。`CFPower.force` は電源メニューから今までどおり使える。 */

    h += '<div id="ps-tools-body"></div>';
    h += '</div></details>';

    /* ④ 危ないもの＝押すと戻せないもの。**いちばん下・たたむ**。 */
    h += '<details class="ps-fold ps-fold-danger"><summary><i data-ic=warn data-ics=16></i> 危ないもの <span class="ps-sec-n">押すと戻せません</span></summary><div class="ps-fold-b">';
    h += '<div id="ps-danger-body"></div>';
    h += '</div></details>';

    body.innerHTML = h;

    // 編集UIを描画（内容が動的なので innerHTML 後に）
    if (window.WorkContent && WorkContent.mountSettings) WorkContent.mountSettings();
    if (window.ParkingView && ParkingView.mountSettings) ParkingView.mountSettings();
  };

  /* 画面の入力をすべて読み取って state.settings に反映 → 保存 */
  window.pitSettingsApply = function () {
    const s = state.settings;

    function readNum(id, fallback, min, max) {
      const el = document.getElementById(id);
      if (!el) return fallback;
      let v = parseInt(el.value, 10);
      if (isNaN(v)) v = fallback;
      if (v < min) v = min;
      if (v > max) v = max;
      el.value = v;   // 補正後の値を画面にも戻す
      return v;
    }

    /* ※ 予約枠・売上目標・平均単価は🧩ルールページ（rules.js）で保存する */

    s.lotCap = {
      pit:     readNum('ps-lot-pit', 4, 0, 99),
      yard:    readNum('ps-lot-yard', 12, 0, 99),
      parking: readNum('ps-lot-park', 8, 0, 99),
      extra:   readNum('ps-lot-extra', 4, 0, 99),
    };
    s.lotCapacity = Math.max(1, s.lotCap.pit + s.lotCap.yard + s.lotCap.parking + s.lotCap.extra);
    const sumEl = document.getElementById('ps-lot-sum');
    if (sumEl) sumEl.textContent = s.lotCapacity;
    s.holdDaysDefault = readNum('ps-hold', 3, 1, 60);

    const ovWarn = readNum('ps-over-warn', 5, 0, 98);
    let ovDanger = readNum('ps-over-danger', 10, 1, 99);
    if (ovDanger <= ovWarn) {   // 赤がオレンジ以下だと矛盾するので自動補正
      ovDanger = ovWarn + 1;
      const el = document.getElementById('ps-over-danger');
      if (el) el.value = ovDanger;
    }
    s.lotOver = { warn: ovWarn, danger: ovDanger };

    let lg = readNum('ps-loan-green', 4, 1, 60);
    let la = readNum('ps-loan-amber', 2, 1, 59);
    if (la >= lg) { la = Math.max(1, lg - 1); const ella = document.getElementById('ps-loan-amber'); if (ella) ella.value = la; }
    s.loanerColors = { greenMin: lg, amberMin: la };

    const est = { default:{}, import:{} };
    (state.workTypes || []).forEach(function (w) {
      est.default[w.id] = readNum('ps-est-' + w.id + '-def', 5, 0, 60);
      est.import[w.id]  = readNum('ps-est-' + w.id + '-imp', 5, 0, 60);
    });
    est.default._default = readNum('ps-est-default-def', 5, 0, 60);
    est.import._default  = readNum('ps-est-default-imp', 5, 0, 60);
    s.estHold = est;

    const eam = { default:{}, import:{} };
    (state.workTypes || []).forEach(function (w) {
      eam.default[w.id] = readNum('ps-eam-' + w.id + '-def', 100000, 0, 9999999);
      eam.import[w.id]  = readNum('ps-eam-' + w.id + '-imp', 100000, 0, 9999999);
    });
    eam.default._default = readNum('ps-eam-default-def', 100000, 0, 9999999);
    eam.import._default  = readNum('ps-eam-default-imp', 100000, 0, 9999999);
    s.estAmount = eam;

    /* 🔴 v1.50.0 営業時間・定休曜日はここでは保存しない（MHSの定休日カレンダーが持ち主）。
       state.settings.openTime / cutoffTime / closedDow は PitCal が写しているだけの予備値。 */

    if (window.PitDB) PitDB.save(true);
    pitSettingsFlash('✓ 保存しました');
  };

  /* ===== 🔧 作業タイプ＝**設定からは触れない**（v2.5.0・2026-08-24 ゆうた指定） =====
     🔴 v0.27.0〜v2.4.0 にあった `pitWtAdd` / `pitWtEdit` / `pitWtDel` / `pitWtToggleCombo` は**廃止した**。
        作業タイプの正は `state.js` の `PIT_WORK_TYPES` 1本。増やす・変えるのはそこに書く（挙動も一緒に）。
     ⚠ **この4つを復活させないこと。** 復活させると「名前と色だけの型」がまた作れてしまい、
        データチェック・車検予定・洗車・MHS のどれにも乗らない型が現場に出る。
     ⚠ 概算預かり日数・概算金額の表（作業タイプ別）は今までどおり設定から直せる（下の方にある）。 */

  /* ===== 🏭 外注先の増減（v0.79.0）＝state.settings.outsourcePartners を編集 ===== */
  function _osSave() {
    if (window.PitDB) PitDB.save(true);
    renderSettings();
    pitSettingsFlash('✓ 保存しました');
  }
  window.pitOsAdd = function () {
    if (!Array.isArray(state.settings.outsourcePartners)) state.settings.outsourcePartners = [];
    state.settings.outsourcePartners.push('新しい外注先');
    _osSave();
  };
  window.pitOsEdit = function (i, val) {
    const arr = state.settings.outsourcePartners || [];
    if (!arr[i] && arr[i] !== '') return;
    if (!String(val).trim()) return;
    arr[i] = String(val).trim();
    if (window.PitDB) PitDB.save(true);
    pitSettingsFlash('✓ 保存しました');
  };
  window.pitOsDel = function (i) {
    const arr = state.settings.outsourcePartners || [];
    if (i < 0 || i >= arr.length) return;
    pitAsk('外注先「' + arr[i] + '」を削除しますか？', { danger:true, ok:'削除する',
            detail:'過去のカードのデータは消えません。' }).then(function (yes) {
      if (!yes) return;
      arr.splice(i, 1);
      _osSave();
    });
  };

  /* 初期値に戻す（このページの項目だけ。🧩ルールページの内容＝ルール・辞書・予約枠・目標・単価は保持） */
  window.pitSettingsReset = function () {
    pitAsk('設定を初期値に戻します。よろしいですか？', { danger:true, ok:'戻す',
            detail:'予約・カードのデータと、ルールページの内容は消えません。' }).then(function (yes) {
      if (!yes) return;
    const keep = {
      rules:      state.settings.rules,
      ruleDict:   state.settings.ruleDict,
      reserveCap: state.settings.reserveCap,
      target:     state.settings.target,
      unitPrice:  state.settings.unitPrice,
    };
    state.settings = JSON.parse(JSON.stringify(window.PIT_DEFAULT_SETTINGS || state.settings));
    Object.keys(keep).forEach(function (k) { if (keep[k] != null) state.settings[k] = keep[k]; });
    /* 🚫 v1.50.0 営業日の予備値は初期値（水曜）に戻さず、いま届いている MHS の内容に戻す */
    if (window.PitCal && PitCal.syncFallback) PitCal.syncFallback();
    if (window.PitDB) PitDB.save(true);
    renderSettings();
    pitSettingsFlash('↩ 初期値に戻しました');
    });
  };

  let _flashT = null;
  function pitSettingsFlash(msg) {
    const el = document.getElementById('ps-status');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_flashT);
    _flashT = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

})();
