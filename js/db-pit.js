/* ========================================
   db-pit.js  -  PitFlow データ層（v0.1.0）
   ----------------------------------------
   ◎いまの動作（サンプルログイン段階）
     ・データはブラウザ内(localStorage)に永続化する。
       → 画面で編集した内容がリロードしても残る＝「しっかり開発できる」状態。
     ・起動時：保存済みがあればそれを採用。無ければ sample-data.js の内容を初期保存。
     ・「サンプルに戻す」でいつでも初期状態へリセットできる。

   ◎将来（本物の Google ログイン導入時）
     ・connectCloud(user) を有効化すると、carflow-9d500 の Firestore に
       PitFlow 専用コレクション(pit_cards / pit_loanerAssigns)で相乗り保存に切替。
     ・CarFlow / StockFlow のデータには一切触れない（コレクション名が別）。

   保存キー：localStorage 'pitflow_data_v1'
   ======================================== */
(function () {
  /* ===================================================================
     保存キー
     -------------------------------------------------------------------
     🔴 **サンプルの中身を変えたら、ここの数字を上げる。**
        上げないと「もう保存がある人」は**前のサンプルのまま**で、新しい中身が一生出てこない
        （起動時は「保存済みがあればそれを採用」なので、作り直しの処理まで進まない）。
     🟠 v1.79.0 デモ版（練習用サイト）は **別のキー** にした。
        ・デモの中身を変えた時に、**デモ版の人だけ**を作り直せる（開発用サンプルを巻き込まない）
        ・同じブラウザで開発用サンプルとデモ版を行き来しても、**中身が混ざらない**
        ⚠ デモの名前・車・件数を変えたら **`pitflow_demo_v◯` の数字を上げること。**
     =================================================================== */
  const LS_KEY = (window.pitIsDemo && window.pitIsDemo())
    ? 'pitflow_demo_v3'    // v3: 見本のカードにカナ・初回/リピーター・作業内容・車検の諸費用・完TELの印を入れた（v1.168.0）
    : 'pitflow_data_v13';  // v13: 見本のカードが自分たちの保存の関門を通れなかったのを直した＝カナ・初回/リピーター・作業内容・車検の諸費用・完TELの印・課に合ったフロント担当（v1.168.0・点検が見つけた）

  const PitDB = {
    mode: 'local',      // 'local' | 'cloud'
    ready: false,
    _t: null,
    /* 🔴 v1.168.0 いま使っている保存キー。**見張りはここを読むこと。**
       ⚠ 見本の中身を変えるたびにキーの数字が上がる。見張りが `'pitflow_data_v12'` と
          書き写していると、**中身を直すたびに関係ない見張りが落ちる**（実際に落ちた）。 */
    lsKey: LS_KEY,

    /* 起動：localStorage 優先で state を上書き。無ければサンプルを初期保存
       ⚠ クラウドモード（本番）では localStorage のデータは読まない。
          ログインが済んでから connectCloud() で Firestore の中身に入れ替える。
          （ログイン前の画面はログイン画面で隠れているので、裏でサンプルが入っていても見えない） */
    init: function () {
      if (window.PIT_CLOUD) {
        this.mode = 'cloud-pending';
        /* v1.13.3：本番では、クラウドから届くまでの間に**初期値のサンプル**（代車20台・社用車4台・
           サンプル名簿11人）が一瞬見えてしまっていた。state.js の既定はサンプル段階の名残なので、
           本番では最初に空にしておく。設定・PIT配置図・作業タイプ等の既定はそのまま使う（初回の初期値になる）。 */
        state.loaners = [];
        state.companyCars = [];
        state.staff = [];
        state.cards = [];
        state.customers = [];
        state.loanerAssigns = [];
        state.fleetEvents = [];
        state.boardNotes = [];
        this.ready = true;
        this._bindAutosave();
        console.log('[PitDB] 本番モード：ログイン後にクラウドから読み込みます（初期のサンプルは空にしました）');
        return;
      }
      /* 🟠 v1.79.0 デモ版は、使わなくなった古いキーを片付ける。
         ⚠ 端末の保存には上限がある（数MB）。デモ版と開発用サンプルの2つぶんが残ると、
            保存に失敗して「直したのに戻る」という一番たちの悪い症状になる。 */
      if (window.pitIsDemo && window.pitIsDemo()) {
        try {
          for (var _i = localStorage.length - 1; _i >= 0; _i--) {
            var _k = localStorage.key(_i);
            if (_k && _k.indexOf('pitflow_') === 0 && _k !== LS_KEY && /^pitflow_(data|demo)_v/.test(_k)) {
              localStorage.removeItem(_k);
            }
          }
        } catch (e) {}
      }
      // state.js の既定（＝自社レイアウト）を退避。古いサンプル端末の移行に使う。
      const DEF_BAYS = state.bays, DEF_FP = state.floorPlan;
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const d = JSON.parse(raw);
          if (d && Array.isArray(d.cards)) {
            state.cards = d.cards;
            if (Array.isArray(d.loanerAssigns)) state.loanerAssigns = d.loanerAssigns;
            if (Array.isArray(d.loaners))       state.loaners       = d.loaners;
            if (Array.isArray(d.customers))     state.customers     = d.customers;
            if (Array.isArray(d.staff) && d.staff.length) state.staff = d.staff;   // メンバー画面で直した内容（サンプルモード用）
            if (Array.isArray(d.companyCars))   state.companyCars   = d.companyCars;
            if (Array.isArray(d.fleetEvents))   state.fleetEvents   = d.fleetEvents;
            // ★PIT配置図：旧サンプル（PIT1〜4の初期4枠）のままの端末は、自社レイアウト既定へ自動移行。
            //   ゆうたが自分で配置を作った端末（枠IDが bay1〜4 以外）は一切触らない。
            const oldSample = Array.isArray(d.bays) && d.bays.length > 0 && d.bays.length <= 4 &&
              d.bays.every(function (b) { return /^bay[1-4]$/.test(b.id || ''); });
            let migrated = false;
            if (oldSample) {
              state.bays = DEF_BAYS; state.floorPlan = DEF_FP; migrated = true;   // 自社配置へ差し替え
            } else {
              if (Array.isArray(d.bays))          state.bays          = d.bays;          // v0.46.0：PIT配置図の枠
              if (d.floorPlan && typeof d.floorPlan === 'object') state.floorPlan = d.floorPlan; // v0.46.0：壁・建物・ドア
            }
            if (d.aiVerdicts && typeof d.aiVerdicts === 'object') state.aiVerdicts = d.aiVerdicts;
            if (d.inspectMarks && typeof d.inspectMarks === 'object') state.inspectMarks = d.inspectMarks;
            if (d.inspectMutes && typeof d.inspectMutes === 'object') state.inspectMutes = d.inspectMutes;
            if (Array.isArray(d.boardNotes)) state.boardNotes = d.boardNotes;            // v0.63.0：付箋ボード
            if (d.boardLabels && typeof d.boardLabels === 'object') state.boardLabels = d.boardLabels; // v0.63.0：色ラベル
            this._mergeSettings(d.settings);   // ← この中で作業タイプもコード基準に揃え直す（_applyWorkTypes）
            // 外注先：未設定 or 旧プレースホルダなら実名リストへ自動移行（v0.79.1）
            var OS_DEF = ['畑中板金','藤島板金','カーメイク','ブレス','タイヤマン','カーフラッシュ','野村自動車','各ディーラー','その他'];
            var OS_OLD = ['提携工場A','提携工場B','ガラス専門店'];
            var osCur = state.settings.outsourcePartners;
            if (!Array.isArray(osCur) || osCur.length === 0 || JSON.stringify(osCur) === JSON.stringify(OS_OLD)) {
              state.settings.outsourcePartners = OS_DEF.slice();
              migrated = true;
            }
            console.log('[PitDB] 保存データを読み込みました（' + d.cards.length + '件）'
              + (migrated ? '／PIT配置図を自社レイアウト既定へ移行しました' : ''));
            if (migrated) this.save(true);   // 移行結果を保存（次回以降は移行不要）
          }
        } else {
          this.save(true);   // 初回：サンプルを初期データとして保存
          console.log('[PitDB] サンプルを初期データとして保存しました');
        }
      } catch (e) {
        console.warn('[PitDB] 読み込み失敗。サンプルで継続します', e);
      }
      /* 🔧 作業タイプはコードが正。保存が1度も無い端末でもここで確定させる（settings.workTypes に写す） */
      this._applyWorkTypes();
      this._flushWorkTypes();
      // 🔢 予約番号（resNo）が無いカードに採番（旧データ救済・1回で全部に付く）
      try { if (window.pitBackfillResNo && pitBackfillResNo()) this.save(true); } catch (e) {}
      this.ready = true;
      this._bindAutosave();
    },

    /* 保存（既定はデバウンス。immediate=true で即時）。戻り値＝成功(true)/失敗(false)。 */
    save: function (immediate) {
      const self = this;
      /* 🔴 v1.56.0（ゆうた指定）**予約を編集している間は保存しない。**
         「保存する」を押すまで自動保存を効かせない＝「キャンセル」で開いた時点に戻せるようにするため。
         ⚠ 見張りを立てるのは card-view.js の editBegin、外すのは editRelease。
            **ここ以外で hold を触らないこと**（外し忘れると全部の保存が止まる）。
         ⚠ 待っている書き込みが後から飛ばないよう、タイマーも止めておく。
         🔴 v1.56.1 **見張りが置き去りになると、アプリ全体の保存が黙って止まる**（＝打ったものが全部消える）。
            そこで **3分たったら見張りを無視して保存を再開する**。
            ⚠ 「キャンセルで戻せること」より **「データを失わないこと」を優先する**。
               3分も開けっぱなしの編集は、もう編集していない。 */
      if (this.hold){
        if (!this._holdAt) this._holdAt = Date.now();
        if (Date.now() - this._holdAt < 180000){ clearTimeout(this._t); return true; }
        console.warn('[PitDB] 予約編集の見張りが長く残っていたので、保存を再開しました（置き去り防止）');
        this.hold = false; this._holdAt = 0;
      }
      /* クラウドモード：localStorage には書かず、変わった所だけ Firestore に送る */
      if (this.mode === 'cloud' || this.mode === 'cloud-pending') {
        if (this._applying) return true;      // クラウドから受け取った内容を反映中は書き返さない
        clearTimeout(this._t);
        if (immediate) return this._cloudFlush();
        this._t = setTimeout(function () { self._cloudFlush(); }, 500);
        return undefined;
      }
      const doSave = function () {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({
            v: 1,
            // v0.97.0 サンプル生成カード（_sample）も保存する＝リロードしても消えない（顧客500人規模で容量に余裕）。
            // ※ _sample フラグはカード開閉時の顧客控え書き戻し防止／サンプル作り直し時の識別に引き続き使用。
            /* v1.17.0：下書き（_draft）は本保存に入れない。書きかけの控えは別のキーで持つ（blank-cards.js） */
            cards: (state.cards || []).filter(function (c) { return !(c && c._draft); }),
            loanerAssigns: (state.loanerAssigns || []),
            loaners: state.loaners,
            customers: state.customers,
            staff: state.staff,                        // メンバーの課・フロント担当・受付（サンプルモード用）
            companyCars: state.companyCars,
            fleetEvents: state.fleetEvents,
            bays: state.bays,                          // v0.46.0：PIT配置図の枠（位置・大きさ・課）
            floorPlan: state.floorPlan || { shapes: [] }, // v0.46.0：壁・通路線
            aiVerdicts: state.aiVerdicts || {},
            inspectMarks: state.inspectMarks || {},
            inspectMutes: state.inspectMutes || {},
            boardNotes: state.boardNotes || [],       // v0.63.0：ダッシュボードの付箋ボード
            boardLabels: state.boardLabels || {},      // v0.63.0：付箋の色ラベル
            settings: state.settings,
            savedAt: Date.now(),
          }));
          if (self.mode === 'cloud' && self._cloudSave) self._cloudSave();
          return true;
        } catch (e) {
          // ★保存失敗（多くは localStorage 容量オーバー）は今まで黙って握り潰していた＝データが古い状態に戻る原因になり得る。
          //   1セッション1回だけ画面に出して気づけるようにする（連続スパムは抑止）。
          console.warn('[PitDB] 保存失敗', e);
          if (!self._saveErrAlerted){
            self._saveErrAlerted = true;
            try { pitAlert('データの保存に失敗しました（ブラウザの保存容量オーバーの可能性）。\nこのままだとリロードで最後に保存できた状態に戻ります。\nサンプルの台数を減らす／不要データを整理してください。', { code:'PF-0001' }); } catch (_) {}
          }
          return false;
        }
      };
      if (immediate) { clearTimeout(this._t); return doSave(); }
      clearTimeout(this._t);
      this._t = setTimeout(doSave, 400);
      return undefined;
    },

    /* サンプルに戻す（本番では使えない＝みんなのデータを消してしまうため） */
    resetSample: function () {
      if (this.mode === 'cloud' || this.mode === 'cloud-pending') {
        pitAlert('本番ではサンプルに戻せません。\n（この操作は全員の本物のデータを消してしまうため）\n練習したい時はデモ版を使ってください。', { code:'PF-0011' });
        return;
      }
      pitAsk('サンプルデータに戻します。よろしいですか？', { title:'サンプルに戻す', detail:'今の編集内容は消えます。', danger:true, ok:'戻す' }).then(function (yes) {
        if (!yes) return;
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        location.reload();
      });
    },

    /* 保存済み設定を初期値の上にマージ（将来 設定項目が増えても古い保存で欠けないように） */
    _mergeSettings: function (saved) {
      if (!saved || typeof saved !== 'object') return;
      const cur = state.settings || {};
      // estHold/estAmount：旧フラット保存を team別ネストへ変換してから重ねる（移行・値の消失防止）
      ['estHold','estAmount'].forEach(function (k) {
        const sv = saved[k];
        if (sv && typeof sv === 'object' && !(sv.default && typeof sv.default === 'object')) {
          saved[k] = { default: Object.assign({}, sv), import: Object.assign({}, sv) };
        }
      });
      Object.keys(saved).forEach(function (k) {
        if (k === 'reserveCap' || k === 'estHold' || k === 'estAmount' || k === 'lotCap' || k === 'target' || k === 'unitPrice' || k === 'ruleDict' || k === 'lotOver') {
          cur[k] = Object.assign({}, cur[k] || {}, saved[k] || {});
        } else {
          cur[k] = saved[k];
        }
      });
      state.settings = cur;
      this._applyWorkTypes();          // 作業タイプはコードが正（保存より優先）
      if (window.pitNormalizeEst) pitNormalizeEst();
    },

    /* 🔧🔧 作業タイプを**コード基準に揃え直す**（v2.5.0・2026-08-24 ゆうた指定）
       -----------------------------------------------------------------
       🔴 唯一の正＝`state.js` の `PIT_WORK_TYPES`。**設定画面からは足せない・変えられない。**
          理由は state.js のコメント（id に挙動が結びついているので、名前と色だけ足しても付いてこない）。
       ◎やること
         ① コードの並び・名前・色・併用可で作り直す（クラウドに古い名前が残っていても勝つ）
         ② コードに**無い** id が保存に残っていたら、**末尾に `legacy:true` を付けて残す**
            ＝設定から足された型・コードから外した型で入っている**過去カードのバッジを消さないため**。
            選択肢には出るが、設定画面では「旧」と出る（＝畳むか正式に入れるかを決めてもらう印）。
         ③ 揃えた結果を `settings.workTypes` に書き戻す。**🔴 MHS はここを読んでいる**
            （作業タイプの名前と色・概算金額）。書き戻しをやめると MHS の当日ビューから名前が消える。
       ⚠ 呼ぶ場所＝`_mergeSettings` の最後（＝端末保存・クラウド初回・他端末の変更、全部ここを通る）と、
          設定がまだ1度も保存されていない時のために `load()` / `connectCloud()` の締め。
       ⚠ 中身が変わったぶんは、次のふつうの保存でクラウドへ上がる（差分判定に任せる＝ここでは保存しない）。

       🔴🔴🔴 v2.8.1（2026-08-25・**本番が止まった**）ここには穴があった。**必ず読むこと。**
       -----------------------------------------------------------------
       🗣「同期中と同期済が超絶点滅を繰り返してて、まともに操作できない。全デバイスで発生してる」

       ◎何が起きたか（コンソールが毎秒これをくり返していた）
         [PitDB] 作業タイプをコード基準に揃え直しました（保存します）
         [PitDB] 保存しました（1件）      ← 8秒で95往復
         `pitSettings/main` の中身が `"label":"車販"`（v2.7.0以前のコード）と
         `"label":"車販依頼"`（v2.7.1以降のコード）の**間を永久に往復**していた。

       ◎なぜ起きたか ── **「コードが正」＋「クラウドへ書き戻す」は、版がちがう端末が2台開くと喧嘩する。**
         ・2.7.1 の端末「車販依頼が正だ」→ 書く
         ・2.7.0 の端末「いや車販が正だ」→ 書く
         ・以下、無限。**どちらも自分が正しいので、どちらも折れない。**
         引き金は v2.7.1 の「車販→車販依頼」の改名。作った時に**この目で見えていなかった穴**。

       ◎だから、正を決める物差しを **「コード」から「新しい版のコード」** に変えた。
         🔴 ① **版の印**（`settings.workTypesVer`）… 書き戻した端末の版を残す。
              **自分の版が印より古かったら、書き戻さない**（新しい端末の言うことを聞く）。
              ＝次に名前を変えたときに、同じ喧嘩が起きない。
         🔴 ② **空回り止め**（`_wtGaveUp`）… 版の印を知らない**古い端末**が相手だと①は効かない。
              なので「同じ揃え直しが**4回目**」になったら、この端末は**以後いっさい書き戻さない**。
              ＝相手が古いままでも、**必ず止まる**。折れたことは黙らずトーストで言う。
         🔴 ③ 書き戻さないと決めたときは **`state.settings.workTypes` に触らない。**
              ⚠ ここが肝。触ると、`_flushWorkTypes` を呼ばなくても
                 差分判定（`_cloudFlush`）が勝手に書きにいく＝止まらない。
              ⚠ 画面が使う `state.workTypes` は**いつでもコードのもの**（表示は自分の版で正しい）。 */
    _appVer: function () {
      try { return String(document.querySelector('meta[name=app-version]').content || ''); } catch (e) { return ''; }
    },
    /* 🔴🔴 v2.8.2 印に使うのは **「作業タイプの一覧の版」**（`state.js` の `PIT_WORK_TYPES_VER`）。
       ⚠ アプリの版（index.html の meta）を使ってはいけない。
          **index.html だけ古いまま残った端末**が実際に居た（本番で meta=2.8.0・js=2.8.1 を見た）。
          そういう端末は自分を実際より古いと名乗るので、印くらべが狂う。
          一覧そのものに版を持たせれば、js が新しければ印も必ず新しい。
       ⚠ 一覧を1文字でも変えたら `PIT_WORK_TYPES_VER` も上げること（state.js に赤で書いてある）。 */
    _wtVer: function () {
      return String(window.PIT_WORK_TYPES_VER || this._appVer() || '');
    },
    /* 版くらべ（2.8.1 と 2.10.0 を文字で比べない）。a が b より古ければ −1 */
    _verCmp: function (a, b) {
      var x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number);
      for (var i = 0; i < 3; i++) {
        var p = x[i] || 0, q = y[i] || 0;
        if (p !== q) return p < q ? -1 : 1;
      }
      return 0;
    },
    _applyWorkTypes: function () {
      var master = (window.PIT_WORK_TYPES || []).map(function (w) {
        var o = {}; Object.keys(w).forEach(function (k) { o[k] = w[k]; }); return o;
      });
      if (!master.length) return;                       // state.js が読めていない時は何もしない
      var have = {};
      master.forEach(function (w) { have[w.id] = 1; });
      var saved = (state.settings && Array.isArray(state.settings.workTypes)) ? state.settings.workTypes : [];
      saved.forEach(function (w) {
        if (!w || !w.id || have[w.id]) return;
        have[w.id] = 1;
        var o = {}; Object.keys(w).forEach(function (k) { o[k] = w[k]; });
        o.legacy = true;                                // コードに無い型＝旧
        master.push(o);
      });
      if (!state.settings) state.settings = {};
      /* 🔴 画面はいつでもコードのものを使う（ここは版に関係なく）。 */
      state.workTypes = master;

      /* 🔴🔴 ここから下は「クラウドへ書き戻してよいか」だけの話。
         ⚠ 書き戻さないと決めたら **`state.settings.workTypes` を1バイトも触らずに帰る。**
            触るだけで、差分保存（`_cloudFlush`）が勝手に書きにいく。

         🔴🔴 v2.8.2（2026-08-25・**2.8.1 の直し方が甘かった**）
         　 2.8.1 では空回り止めを `_flushWorkTypes` に置いたのに、
         　 同じ版で `_flushWorkTypes` を購読ハンドラから外した＝**呼ぶ人がいなくなり、一度も折れなかった。**
         　 （本番で `_wtSpins:49 / _wtGaveUp:false` を見た）
         　 ＝ **数える場所と折れる場所は、同じ関数に置くこと。** 判断はここ1本。 */
      if (this._wtGaveUp) return;                                  // ③ 空回りした＝もう書かない

      var changed = (this._js(state.settings.workTypes || null) !== this._js(master));
      var mine  = this._wtVer();
      var stamp = String((state.settings && state.settings.workTypesVer) || '');
      /* ① 自分より新しい端末が決めた＝従う（次に名前を変えた時に喧嘩しないため） */
      if (stamp && mine && this._verCmp(mine, stamp) < 0) return;
      if (!changed && stamp === mine) return;                      // すでに揃っている＝何もしない

      /* ② 空回り止め。①は**印を知らない古い端末**には効かないので、
            「書き戻すと決めた回数」を数えて、多すぎたらこの端末はもうやめる。
         🔴 相手が古いままでも、これで**必ず止まる**。折れたことは黙らない。 */
      if (changed && ++this._wtSpins > this._WT_SPIN_MAX) {
        this._wtGaveUp = true;
        console.warn('[PitDB] 🔴 作業タイプの書き戻しが止まりません（' + this._wtSpins + '回目）。'
                   + 'この端末では以後やめます。版のちがう端末が開いています');
        if (window.showToast) {
          showToast('版のちがう端末が開いています。全部の端末を開き直してください', 'PF-0009');
        }
        return;                                                    // 🔴 settings に触らずに帰る
      }

      state.settings.workTypes = master;                           // 🔴 MHS が読む
      if (mine) state.settings.workTypesVer = mine;                // 🔴 誰が決めたかの印
      this._wtDirty = true;
    },
    _WT_SPIN_MAX: 3,

    /* 揃え直しで変わっていたら1回だけ保存する（読み込みの締めに呼ぶ）。
       ⚠ v2.8.1 で購読ハンドラからは外した（受信のたびに保存する増幅器だったため）。
          ここに折れる判断は置かない（呼ばれない時があるので）。判断は `_applyWorkTypes` 1本。 */
    _flushWorkTypes: function () {
      if (!this._wtDirty) return;
      this._wtDirty = false;
      console.log('[PitDB] 作業タイプをコード基準に揃え直しました（保存します）');
      this.save(true);
    },

    _bindAutosave: function () {
      const self = this;
      const flush = function () { self.save(true); };
      window.addEventListener('beforeunload', flush);
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
    },

    /* =========================================================
       ここから下：クラウド保存（本番モード）
       ---------------------------------------------------------
       ◎考え方
         ・画面の作りは一切変えない。state をいじって PitDB.save() を呼ぶ、
           という今までのやり方のまま、保存先だけ Firestore になる。
         ・1件＝1ドキュメント。変わった所（増えた・直した・消えた）だけを送る。
         ・onSnapshot で全端末に即反映。他の人が直した内容もその場で入ってくる。
       ◎入れ物
         pitCards / pitCustomers / pitLoaners / pitLoanerAssigns /
         pitCompanyCars / pitFleetEvents / pitBoardNotes … 1件＝1ドキュメント
         pitSettings/main … 設定・PIT配置図・入庫ルールの判定・付箋の色（まとめて1枚）
       ========================================================= */

    /* state の配列名 → Firestore の入れ物の名前 */
    _COLS: {
      cards:         'pitCards',
      customers:     'pitCustomers',
      loaners:       'pitLoaners',
      loanerAssigns: 'pitLoanerAssigns',
      companyCars:   'pitCompanyCars',
      fleetEvents:   'pitFleetEvents',
      boardNotes:    'pitBoardNotes'
    },
    /* まとめて1枚に入れるもの */
    _SETTINGS_KEYS: ['settings', 'bays', 'floorPlan', 'aiVerdicts', 'boardLabels', 'inspectMarks', 'inspectMutes'],

    _wtDirty: false,    // v2.5.0：作業タイプをコード基準に揃え直して中身が変わった＝1回保存が要る
    _wtSpins: 0,        // v2.8.1：揃え直しが何回起きたか（版のちがう端末との往復を数える）
    _wtGaveUp: false,   // v2.8.1：空回りと判断した＝この端末はもう書き戻さない
    _loaded: false,     // v1.2.1：クラウドの中身を読み終わったか（読む前に書かないための鍵）
    _shadow: null,      // 最後にクラウドと合っていた内容（差分を出すための控え）
    _pending: {},       // いま書いている最中のもの（自分の書き込みが跳ね返ってくるのを無視する）
    _unsubs: [],
    _applying: false,
    _cloudErr: 0,

    _co: function () { return window.fb.company(); },

    /* 差分を見るための文字列化。
       ⚠ ふつうの JSON.stringify は「キーの並び順」で文字が変わる。
          自分で作った物と、クラウドから返ってきた物は並びが違うことがあるので、
          キーを並べ替えてから文字にする。これをしないと、
          同じ内容なのに「違う」と判定されて永久に保存し続ける。 */
    _js: function (v) {
      var self = this;
      if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
      if (Array.isArray(v)) return '[' + v.map(function (x) { return self._js(x); }).join(',') + ']';
      var keys = Object.keys(v).filter(function (k) {
        return k !== 'id' && typeof v[k] !== 'function' && v[k] !== undefined;
      }).sort();
      return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + self._js(v[k]); }).join(',') + '}';
    },

    /* ---- ログイン直後に呼ばれる（members-pit.js から） ---- */
    connectCloud: function (user, member) {
      if (!window.fb || !window.fb.ready || !window.fb.db) {
        console.error('[PitDB] Firebase が使えないのでクラウド保存に繋げません');
        return;
      }
      const self = this;
      this.mode = 'cloud';
      this._loaded = false;
      this._rev = {};                             /* 版番号の控えも作り直す */                       // 読み終わるまでは書かない
      this._shadow = { docs: {}, settings: null };
      console.log('[PitDB] クラウドから読み込みます…');

      const names = Object.keys(this._COLS);
      const gets = names.map(function (k) { return self._co().collection(self._COLS[k]).get(); });
      gets.push(this._co().collection('pitSettings').doc('main').get());

      Promise.all(gets).then(function (res) {
        /* 🔴 v2.24.0 try/finally にした。ここで例外が出ると `_applying` が **true のまま**残り、
           以後の保存が `save()` の先頭で黙って return true される＝**打っても一生保存されない**。
           画面は動くしエラーも出ないので、誰も気づけない。 */
        self._applying = true;
        let total = 0;
        const sdoc = res[res.length - 1];   /* ⚠ try の外で受ける（try の中で宣言すると下で見えない） */
        try {
        names.forEach(function (k, i) {
          const arr = [];
          res[i].forEach(function (d) {
            const o = self._takeRev(self._COLS[k], d.id, d.data() || {});   /* 🔴 版番号は中身から外して控える */
            o.id = d.id; arr.push(o);
            self._shadow.docs[self._COLS[k] + '/' + d.id] = self._js(o);
          });
          state[k] = arr;
          total += arr.length;
        });

        if (sdoc.exists) {
          const sv = sdoc.data() || {};
          self._SETTINGS_KEYS.forEach(function (k) {
            if (sv[k] !== undefined && sv[k] !== null) {
              if (k === 'settings') self._mergeSettings(sv[k]); else state[k] = sv[k];
            }
          });
          self._shadow.settings = self._js(self._settingsPayload());
        } else {
          /* 初回：いまの既定（自社PIT配置図・作業タイプ・入庫ルールなど）をそのまま初期値として上げる */
          console.log('[PitDB] 初回です。いまの設定を初期値としてクラウドに保存します');
          self._shadow.settings = '';
        }
        /* 🔧 作業タイプはコードが正（設定がまだ1度も無いクラウドでもここで確定させる）。
           揃え直しで中身が変わったなら、控えを空にして「設定はまだ上げていない」ことにする
           ＝次の保存で設定が必ず1回上がる。🔴 MHS もここ（pitSettings/main）を読んでいる。 */
        self._applyWorkTypes();
        if (self._wtDirty) self._shadow.settings = '';
        } finally { self._applying = false; }

        /* 📣 v2.8.2〜v2.29.0 ここには「全端末を今すぐ更新」の下ごしらえがあった。
           🔴 2026-08-29：全アプリ共通の coreflow-power.js に1本化したので**もう要らない**。
              向こうは `settings/forceReload` を自分で見張っていて、
              **開いた瞬間の値では動かない**作り＝ここで黙らせる必要がない。 */

        self._loaded = true;                      // ここから先だけ保存を許す
        console.log('[PitDB] 読み込み完了（' + total + '件）');
        if (window.PitSync) PitSync.connected();
        if (!sdoc.exists) self._cloudFlush();     // 初回だけ設定を書き上げる
        self._flushWorkTypes();                   // 作業タイプが揃え直されていたら1回だけ保存
        self._watch();
        self._afterApply();
      }).catch(function (e) {
        console.error('[PitDB] クラウドの読み込みに失敗', e);
        if (window.showToast) showToast('データを読み込めませんでした。通信を確認して開き直してください', 'PF-0003');
      });
    },

    /* =========================================================
       🔴🔴🔴 v2.24.0 **線がつながっているかを、自分で見張る**（2026-08-29・事故を受けて新設）
       ---------------------------------------------------------
       ◎なにが起きたか（2026-08-28 13:37:03・5件）
         開きっぱなしの画面の**変更を受け取る線が切れた**。前日の入庫・工程・返車が届かなくなった。
         それでも画面は普通に動き、エラーも出ず、**同期ランプも「全員と共有中」のまま**だった。
         その古い画面で自動処理が走り、他人の作業をまるごと消した。
         🗣 ゆうた「普通にあってはならないこと」
       ◎ここで直すこと
         🔴 ① 切れたら**気づく**（Firestore 自身の印＝`metadata.fromCache` を見る）
         🔴 ② 切れたら**張り直す**（だんだん間隔をあけて、あきらめない）
         🔴 ③ 戻ってきたら**全部読み直す**（切れている間に何が変わったか分からないので）
         🔴 ④ 切れている間は**画面に出す**（ランプと帯）。黙らない
       ⚠ `navigator.onLine` では足りない。**ネットは生きているのに見張りだけ死ぬ**ことがある
          （実際そうだった。パソコンはネットに繋がっていた）。
       ⚠ 読み直しで**手元の直しを消さない**。編集中のカードと、まだ保存していないものは触らない。
       ========================================================= */
    /* =========================================================
       🔴🔴🔴 v2.26.0 **版番号（rev）＝サーバーが古い書き込みを弾くための札**（2026-08-29）
       ---------------------------------------------------------
       🗣 ゆうた「上書きできない表面にはでないタイムスタンプ…**絶対それを照合して新しい方が優先される**みたいな」
       ◎なぜ要るか
         v2.24.0 の「気づく・張り直す・読み直す」は**古い時間を短くした**だけ。
         **人が手で押した時の穴は塞がっていない。**古い画面で1か所直せば、8/28 と同じことが起きる。
       ◎しくみ
         カード1件ごとに**表に出ない番号**を持つ。書く時は必ず「**自分が見た版の次の番号**」を添える。
         サーバー（Firestore のルール）が `新しい版 == いまの版 + 1` でなければ**受け付けない**。
         🔴 **照合をアプリの中でやっても意味がない。**古い画面は自分が古いことを知らないから。
            だから**サーバーで弾く**。ここが肝。
       ◎🔴 中身には混ぜない
         版番号を state のカードに入れると、**差分判定（_js）が毎回「変わった」と言い出して
         永久に保存し続ける**（v1.0.0 で踏んだ罠と同じ形）。
         だから **受け取ったら中身から外して、ここ（_rev）に別で控える。**
       ⚠ 弾かれた時は**読み直すだけ。書き直さない。**
          古い内容で押し切ったら、この仕掛けを自分で無効にすることになる。
       ========================================================= */
    _rev: null,             /* '入れ物名/id' → 版番号 */
    _revOf: function (k, id) { var col = this._COLS[k]; return (this._rev && col) ? (this._rev[col + '/' + id] || 0) : 0; },
    /* 受け取った1件から版番号を抜き取って控える（中身からは外す） */
    _takeRev: function (col, id, o) {
      if (!this._rev) this._rev = {};
      if (o && o.rev !== undefined && o.rev !== null) this._rev[col + '/' + id] = o.rev;
      if (o) delete o.rev;
      return o;
    },

    _link: true,            /* サーバーとつながっているか */
    _relinkT: null,
    _relinkN: 0,
    _recvAt: 0,
    _needResync: false,
    _offT: null,
    /* 🔴 「つながっていない」と言い切るまでの猶予（ミリ秒）。
       ⚠ 開いた直後は必ず一瞬 `fromCache` になる。すぐ帯を出すと**毎回赤い帯が光る**＝
          オオカミ少年になって、本当に切れた時に誰も見なくなる。 */
    _OFF_WAIT: 8000,

    _setLink: function (on, why) {
      if (this._link === on) return;
      this._link = on;
      if (this._offT) { clearTimeout(this._offT); this._offT = null; }
      if (on) {
        this._relinkN = 0;
        console.log('[PitDB] つながりました');
        if (window.PitSync) { if (PitSync.link) PitSync.link(true); PitSync.connected(); }
      } else {
        console.warn('[PitDB] 🔴 つながっていません（' + (why || '') + '）＝この画面は古いかもしれません');
        if (window.PitSync) { if (PitSync.link) PitSync.link(false, why || ''); PitSync.set('offline'); }
      }
    },

    /* 切れたら張り直す。だんだん間隔をあける（最大30秒）。**あきらめない。** */
    _scheduleRelink: function () {
      var self = this;
      if (this.mode !== 'cloud') return;
      if (this._relinkT) return;
      var wait = Math.min(30000, 1000 * Math.pow(2, Math.min(5, this._relinkN)));
      this._relinkN++;
      this._relinkT = setTimeout(function () {
        self._relinkT = null;
        if (self.mode !== 'cloud') return;
        console.log('[PitDB] 見張りを張り直します（' + self._relinkN + '回目）');
        try { self._watch(); } catch (e) { console.error('[PitDB] 張り直しに失敗', e); self._scheduleRelink(); return; }
        self._resync();
      }, wait);
    },

    /* 🔴 切れている間に何が変わったか分からないので、**全部**サーバーから読み直して合わせる。
       ⚠ 手元の直しは消さない（編集中／まだ保存していないものは見送る）。 */
    _resync: function () {
      var self = this;
      if (this.mode !== 'cloud' || !this._shadow) return Promise.resolve(0);
      var names = Object.keys(this._COLS);
      var gets = names.map(function (k) { return self._co().collection(self._COLS[k]).get({ source: 'server' }); });
      return Promise.all(gets).then(function (res) {
        var 直した = 0, 見送った = 0;
        self._applying = true;
        try {
          names.forEach(function (k, i) {
            var col = self._COLS[k];
            var arr = state[k] || (state[k] = []);
            var 生きている = {};
            res[i].forEach(function (d) {
              var o = self._takeRev(col, d.id, d.data() || {}); o.id = d.id;   /* 🔴 版番号を控える */
              var key = col + '/' + d.id, js = self._js(o);
              生きている[d.id] = 1;
              if (self._shadow.docs[key] === js) return;                 /* 変わっていない */
              var idx = arr.findIndex(function (x) { return x && x.id === d.id; });
              /* ⚠ いま「予約を編集」で開いているカードは差し替えない（v1.56.1・打った内容が消える）。
                 　 **見送ってよいのはここだけ。** */
              if (col === 'pitCards' && window.pitCardEditingId && window.pitCardEditingId() === d.id) { 見送った++; return; }
              /* 🔴🔴 v2.24.0 **それ以外は、サーバーが勝つ。**
                 手元にまだ保存していない直しがあっても、ここではサーバーの姿を採る。
                 ◎なぜそう決めたか（2026-08-29・事故のあと）
                   「古い手元が勝つ」を1か所でも残すと、**8/28 の事故と同じ形**（古い写しが
                   他人の作業を消す）が、その1か所から必ず戻ってくる。
                   人が打っている最中のものは**編集中の関門**で守られているし、
                   ふつうの保存は0.5秒で飛ぶので、ここで守る必要のある手元の直しは実質ない。
                 ⚠ 受け取り（_watch）も同じ考え方で動いている。**2つの道で答えを変えない。** */
              self._shadow.docs[key] = js;
              if (idx >= 0) arr[idx] = o; else arr.push(o);
              直した++;
            });
            /* サーバーではもう無いもの＝切れている間に誰かが消した */
            Object.keys(self._shadow.docs).forEach(function (key) {
              if (key.indexOf(col + '/') !== 0) return;
              var id = key.slice(col.length + 1);
              if (生きている[id]) return;
              delete self._shadow.docs[key];
              var j = arr.findIndex(function (x) { return x && x.id === id; });
              if (j >= 0) arr.splice(j, 1);
              直した++;
            });
          });
        } finally { self._applying = false; }
        if (直した || 見送った) console.log('[PitDB] 読み直しました（直した ' + 直した + '件／手元を優先 ' + 見送った + '件）');
        if (直した) { if (window.PitSync) PitSync.received(); self._afterApply(); }
        self._setLink(true);
        return 直した;
      }).catch(function (e) {
        console.error('[PitDB] 読み直しに失敗', e);
        self._setLink(false, '読み直せません');
        self._scheduleRelink();
        return -1;
      });
    },

    /* つながっているかを Firestore 自身の印で見る。
       ⚠ `fromCache: true` ＝ サーバーからではなく端末の中の写しから返っている＝**届いていない**。 */
    _watchLink: function () {
      var self = this;
      try {
        var un = this._co().collection('pitSettings').doc('main')
          .onSnapshot({ includeMetadataChanges: true }, function (d) {
            var 写しから = !!(d && d.metadata && d.metadata.fromCache);
            if (写しから) {
              self._needResync = true;
              if (!self._offT) self._offT = setTimeout(function () {          /* 猶予を置いてから言う */
                self._offT = null;
                self._setLink(false, 'サーバーから届いていません');
              }, self._OFF_WAIT);
              return;
            }
            if (self._offT) { clearTimeout(self._offT); self._offT = null; }   /* 一瞬だった＝何も出さない */
            self._setLink(true);
            if (self._needResync) { self._needResync = false; self._resync(); }   /* 戻ったら読み直す */
          }, function (e) {
            self._setLink(false, 'つながり監視が切れました');
            self._scheduleRelink();
          });
        this._unsubs.push(un);
      } catch (e) { console.warn('[PitDB] つながり監視を張れませんでした', e); }
    },

    /* 🔴🔴🔴 v2.24.0 **1件だけ、サーバーから本物を読み直す**（2026-08-29・事故を受けて新設）
       -----------------------------------------------------------------
       ◎なぜ要るか（2026-08-28 13:37 の事故）
         線が切れて更新が届かなくなった画面が、**古い写しのまま**カードを保存し、
         他の人が進めた入庫・工程・返車・売上を**まるごと消した**。
         保存は「カード1件まるごと差し替え」なので、手元が古いと他人の作業まで消える。
       ◎これが直すこと
         書く前に**その1件だけ**サーバーの今の姿を取り直し、画面の写し（state）と
         差分の控え（_shadow）の**両方**を本物に合わせる。
         ＝ そのあと保存しても、他人の作業を巻き込まない。
       ⚠ 必ず `{source:'server'}`。ふつうの get は**端末の中の写しから返ってくることがある**
          （実測で 0.001 秒で返った）＝ 古いまま「読み直したつもり」になる。
       ⚠ 読めなかった時は **null ではなく例外**で返す。呼ぶ側が「読めたのか」を
          見分けられないと、**読めていないのに動かす**という一番悪い形になる。 */
    refreshDoc: function (k, id) {
      var self = this, col = this._COLS[k];
      if (this.mode !== 'cloud' || !col || !this._shadow || !id) return Promise.resolve(null);
      return this._co().collection(col).doc(id).get({ source: 'server' }).then(function (d) {
        var key = col + '/' + id;
        var arr = state[k] || (state[k] = []);
        var idx = arr.findIndex(function (x) { return x && x.id === id; });
        self._applying = true;
        try {
          if (!d.exists) {                       /* サーバーではもう消えている */
            delete self._shadow.docs[key];
            if (idx >= 0) arr.splice(idx, 1);
            return null;
          }
          var o = self._takeRev(col, id, d.data() || {}); o.id = id;   /* 🔴 版番号を控える */
          self._shadow.docs[key] = self._js(o);
          if (idx >= 0) arr[idx] = o; else arr.push(o);
          return o;
        } finally { self._applying = false; }
      });
    },

    disconnectCloud: function () {
      this._unsubs.forEach(function (u) { try { u(); } catch (e) {} });
      this._unsubs = [];
      this.mode = 'cloud-pending';
      this._loaded = false;
      this._shadow = null;
    },

    /* ---- 他の端末の変更を受け取る ---- */
    _watch: function () {
      const self = this;
      this.disconnectCloudKeepMode_ = true;
      this._unsubs.forEach(function (u) { try { u(); } catch (e) {} });
      this._unsubs = [];

      Object.keys(this._COLS).forEach(function (k) {
        const col = self._COLS[k];
        const un = self._co().collection(col).onSnapshot(function (snap) {
          let touched = false;
          self._applying = true;
          try {
          snap.docChanges().forEach(function (ch) {
            const id = ch.doc.id, key = col + '/' + id;
            if (ch.type === 'removed') {
              if (self._shadow.docs[key] === undefined) return;   // 自分で消した分
              delete self._shadow.docs[key];
              state[k] = (state[k] || []).filter(function (x) { return x.id !== id; });
              touched = true;
              return;
            }
            if (self._pending[key]) return;                        // 自分がいま書いた分＝見送る
            /* 🔴 v1.56.1 **いま「予約を編集」で開いている入庫カードは差し替えない。**
               下の `arr[idx] = o` は state.cards の中身を**別の物に入れ替える**。
               画面（フォーム）が握っているのは入れ替わる前の物なので、差し替えられると
               **打ち込んだ内容が行き場を失って、保存を押しても消えてしまう。**
               ⚠ v1.55.0 までは打つたびに保存していたので窓が一瞬しかなく表に出なかったが、
                  v1.56.0 で「押すまで保存しない」にした結果、**編集中ずっとこの窓が開く**ようになった。
               ⚠ 見送った分は、編集を終えて保存した時に自分の内容で上書きされる。 */
            if (col === 'pitCards' && window.pitCardEditingId && window.pitCardEditingId() === id) return;
            const o = self._takeRev(col, id, ch.doc.data() || {}); o.id = id;   /* 🔴 版番号を控える */
            const js = self._js(o);
            if (self._shadow.docs[key] === js) return;             // 自分が書いた分＝何もしない
            self._shadow.docs[key] = js;
            const arr = state[k] || (state[k] = []);
            const idx = arr.findIndex(function (x) { return x.id === id; });
            if (idx >= 0) arr[idx] = o; else arr.push(o);
            touched = true;
          });
          } finally { self._applying = false; }
          self._recvAt = Date.now();
          self._setLink(true);
          if (touched) { if (window.PitSync) PitSync.received(); self._afterApply(); }
        }, function (e) {
          /* 🔴🔴🔴 v2.24.0（2026-08-29・事故を受けて）
             ここは **console.error を出すだけ**だった。張り直しもしないし、画面にも出さない。
             ＝ 線が切れた画面が「古いまま生きている」ことに、誰も気づけなかった。
             その画面で自動処理が走り、他人の作業をまるごと消した（8/28 13:37 の5件）。 */
          console.error('[PitDB] ' + col + ' の購読に失敗', e);
          self._setLink(false, col + ' の購読が切れました');
          self._scheduleRelink();
        });
        self._unsubs.push(un);
      });

      this._watchLink();     /* 🔴 v2.24.0 つながっているかも見張る */

      const un2 = this._co().collection('pitSettings').doc('main').onSnapshot(function (d) {
        if (!d.exists) return;
        const sv = d.data() || {};
        if (self._pending['@settings']) return;                    // 自分がいま書いた分＝見送る
        const js = self._js({
          settings: sv.settings, bays: sv.bays, floorPlan: sv.floorPlan,
          aiVerdicts: sv.aiVerdicts, boardLabels: sv.boardLabels,
          inspectMarks: sv.inspectMarks, inspectMutes: sv.inspectMutes
        });
        if (js === self._shadow.settings) return;
        self._applying = true;
        try {
          self._SETTINGS_KEYS.forEach(function (k) {
            if (sv[k] !== undefined && sv[k] !== null) {
              if (k === 'settings') self._mergeSettings(sv[k]); else state[k] = sv[k];
            }
          });
          self._shadow.settings = js;
        } finally { self._applying = false; }
        /* 🔴🔴 v2.8.1 **ここで書き戻さない。**
           前は「他の端末が古い作業タイプを書いていたら、揃え直して書き戻す」を
           **受け取るたびに即**やっていた。これが版のちがう端末との往復を
           **毎秒10往復まで加速させる増幅器**になっていた（2026-08-25 の停止）。
           揃え直し自体は上の `_mergeSettings` → `_applyWorkTypes` で済んでいて、
           書き戻しが要るぶんは**ふつうの差分保存**（`_cloudFlush`）が拾う。
           ⚠ ここに `_flushWorkTypes()` を戻さないこと。 */
        /* 📣 v2.8.2〜v2.29.0 ここで「全端末を今すぐ更新」の合図を見ていた。
           🔴 2026-08-29：全アプリ共通の coreflow-power.js に1本化。
              向こうが `companies/{会社}/settings/forceReload` を自分で見張るので、
              **PitFlow の設定の購読に相乗りしない**（アプリごとに配線を持たない）。 */
        if (window.PitSync) PitSync.received();
        self._afterApply();
      }, function (e) { console.error('[PitDB] 設定の購読に失敗', e); });
      this._unsubs.push(un2);
    },

    /* クラウドの内容を state に入れたあと、いま開いている画面を描き直す */
    _afterApply: function () {
      try {
        if (window.state && state.currentView && window.showView) showView(state.currentView);
      } catch (e) { console.warn('[PitDB] 画面の描き直しでエラー', e); }
    },

    _settingsPayload: function () {
      return {
        settings: state.settings || {},
        bays: state.bays || [],
        floorPlan: state.floorPlan || { shapes: [] },
        aiVerdicts: state.aiVerdicts || {},
        boardLabels: state.boardLabels || {},
        /* 🩺 v1.168.0 点検の札と、黙らせている規則（みんなで共有する） */
        inspectMarks: state.inspectMarks || {},
        inspectMutes: state.inspectMutes || {}
      };
    },

    /* ---- 変わった所だけ送る ---- */
    _cloudFlush: function () {
      if (this.mode !== 'cloud' || !this._shadow) return false;
      /* v1.2.1：クラウドを読み終わる前は絶対に書かない。
         ⚠ 読み込み中は画面にまだサンプルが乗っていることがあり、
            それを「新しいデータ」と勘違いして丸ごとアップしてしまう事故が起きた。 */
      if (!this._loaded) { console.warn('[PitDB] 読み込み前なので保存を見送りました'); return false; }
      const self = this;
      const ops = [];

      Object.keys(this._COLS).forEach(function (k) {
        const col = self._COLS[k];
        /* v1.17.0：下書き（_draft）はクラウドに書かない＝他の端末に出さない・どこにも数えさせない。
           ⚠ 一度も書いていないので _shadow にも無い＝「消えたもの」と誤判定されて delete が飛ぶこともない。 */
        const arr = (state[k] || []).filter(function (o) { return !(o && o._draft); });
        const alive = {};
        arr.forEach(function (o) {
          if (!o || !o.id) return;
          alive[o.id] = true;
          const key = col + '/' + o.id;
          const js = self._js(o);
          if (self._shadow.docs[key] === js) return;
          const body = self._clean(o);
          /* 🔴 v2.26.0 **自分が見た版の次の番号**を添える。
             サーバーはこれが `いまの版 + 1` でなければ受け付けない＝古い画面は書けない。
             ⚠ ここで足すだけ。`js`（差分の控え）には入れない＝入れると毎回「変わった」になる。 */
          body.rev = (self._rev && self._rev[key] ? self._rev[key] : 0) + 1;
          ops.push({ t: 'set', ref: self._co().collection(col).doc(o.id), body: body, key: key, js: js });   /* js は並べ替え済みの文字（_js） */
        });
        /* 消えたもの */
        Object.keys(self._shadow.docs).forEach(function (key) {
          if (key.indexOf(col + '/') !== 0) return;
          const id = key.slice(col.length + 1);
          if (alive[id]) return;
          ops.push({ t: 'del', ref: self._co().collection(col).doc(id), key: key });
        });
      });

      const sjs = this._js(this._settingsPayload());
      if (sjs !== this._shadow.settings) {
        ops.push({ t: 'set', ref: this._co().collection('pitSettings').doc('main'),
                   body: this._clean(this._settingsPayload()), key: '@settings', js: sjs });
      }

      if (!ops.length) return true;
      ops.forEach(function (op) { self._pending[op.key] = 1; });
      if (window.PitSync) PitSync.saving();

      /* Firestore のまとめ書きは1回500件まで。多い時は分けて送る。 */
      const chunks = [];
      for (let i = 0; i < ops.length; i += 400) chunks.push(ops.slice(i, i + 400));

      chunks.reduce(function (p, group) {
        return p.then(function () {
          const batch = window.fb.db.batch();
          group.forEach(function (op) {
            if (op.t === 'del') batch.delete(op.ref); else batch.set(op.ref, op.body);
          });
          return batch.commit().then(function () {
            group.forEach(function (op) {
              if (op.t === 'del') { delete self._shadow.docs[op.key]; if (self._rev) delete self._rev[op.key]; }
              else if (op.key === '@settings') self._shadow.settings = op.js;
              else {
                self._shadow.docs[op.key] = op.js;
                if (op.body && op.body.rev !== undefined && self._rev) self._rev[op.key] = op.body.rev;   /* 🔴 版も進める */
              }
              delete self._pending[op.key];
            });
          });
        });
      }, Promise.resolve()).then(function () {
        self._cloudErr = 0;
        if (window.PitSync) PitSync.saved();
        console.log('[PitDB] 保存しました（' + ops.length + '件）');
      }).catch(function (e) {
        ops.forEach(function (op) { delete self._pending[op.key]; });
        /* 🔴🔴🔴 v2.26.0 **版が古くてサーバーに弾かれた**＝この画面が古い。
           ◎やること＝**読み直すだけ。絶対に書き直さない。**
             ここで「じゃあ新しい版で書き直そう」とすると、
             **古い内容で押し切る**ことになり、この仕掛けを自分で無効にする。
           ◎打った内容は捨てる。＝ 8/28 の事故で消えたのは「他の人が終わらせた仕事」で、
             こちらの打ち込みより重い。**迷ったら、みんなの側を残す。** */
        var 弾かれた = !!(e && (e.code === 'permission-denied' ||
                    /permission[_-]?denied|insufficient permissions/i.test(String((e && e.message) || ''))));
        if (弾かれた) {
          console.warn('[PitDB] 🔴 版が古いのでサーバーに弾かれました。読み直します');
          if (window.PitSync) PitSync.failed();
          if (window.showToast) {
            showToast('ほかの端末が先に直していたので、この画面を最新に直しました。いま打った内容は入っていません', 'PF-0012');
          }
          self._resync();
          return;
        }
        console.error('[PitDB] 保存に失敗', e);
        if (window.PitSync) PitSync.failed();
        self._cloudErr++;
        if (self._cloudErr <= 2 && window.showToast) {
          showToast('保存できませんでした。通信を確認してください（直した内容はこの画面には残っています）', 'PF-0002');
        }
      });
      return true;
    },

    /* Firestore に入れられない値（undefined・関数）を落とす。id は入れ物の名前と重複するので外す。 */
    _clean: function (o) {
      const out = JSON.parse(JSON.stringify(o, function (k, v) {
        return (typeof v === 'function' || v === undefined) ? undefined : v;
      }));
      if (out && typeof out === 'object') delete out.id;
      return out;
    }
  };

  window.PitDB = PitDB;
  // sample-data.js の後に読み込まれる前提（index.html のスクリプト順）
  PitDB.init();
})();
