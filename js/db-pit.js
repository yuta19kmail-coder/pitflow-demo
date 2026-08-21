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
            this._mergeSettings(d.settings);
            // 作業タイプは設定で増減できる＝保存があれば実行リストを上書き
            if (Array.isArray(state.settings.workTypes) && state.settings.workTypes.length) {
              state.workTypes = state.settings.workTypes;
              // 併用可フラグの初回補完：1Y/3M（コーティング）で未設定なら true（ユーザーが切り替えた値は尊重）
              state.workTypes.forEach(function (w) {
                if (w && (w.id === 'coat1y' || w.id === 'coat3m') && w.combinable === undefined) {
                  w.combinable = true; migrated = true;
                }
              });
              if (migrated) state.settings.workTypes = state.workTypes;
            }
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
      if (window.pitNormalizeEst) pitNormalizeEst();
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
      this._loaded = false;                       // 読み終わるまでは書かない
      this._shadow = { docs: {}, settings: null };
      console.log('[PitDB] クラウドから読み込みます…');

      const names = Object.keys(this._COLS);
      const gets = names.map(function (k) { return self._co().collection(self._COLS[k]).get(); });
      gets.push(this._co().collection('pitSettings').doc('main').get());

      Promise.all(gets).then(function (res) {
        self._applying = true;
        let total = 0;
        names.forEach(function (k, i) {
          const arr = [];
          res[i].forEach(function (d) {
            const o = d.data() || {}; o.id = d.id; arr.push(o);
            self._shadow.docs[self._COLS[k] + '/' + d.id] = self._js(o);
          });
          state[k] = arr;
          total += arr.length;
        });

        const sdoc = res[res.length - 1];
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
        self._applying = false;

        self._loaded = true;                      // ここから先だけ保存を許す
        console.log('[PitDB] 読み込み完了（' + total + '件）');
        if (window.PitSync) PitSync.connected();
        if (!sdoc.exists) self._cloudFlush();     // 初回だけ設定を書き上げる
        self._watch();
        self._afterApply();
      }).catch(function (e) {
        console.error('[PitDB] クラウドの読み込みに失敗', e);
        if (window.showToast) showToast('データを読み込めませんでした。通信を確認して開き直してください', 'PF-0003');
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
            const o = ch.doc.data() || {}; o.id = id;
            const js = self._js(o);
            if (self._shadow.docs[key] === js) return;             // 自分が書いた分＝何もしない
            self._shadow.docs[key] = js;
            const arr = state[k] || (state[k] = []);
            const idx = arr.findIndex(function (x) { return x.id === id; });
            if (idx >= 0) arr[idx] = o; else arr.push(o);
            touched = true;
          });
          self._applying = false;
          if (touched) { if (window.PitSync) PitSync.received(); self._afterApply(); }
        }, function (e) { console.error('[PitDB] ' + col + ' の購読に失敗', e); });
        self._unsubs.push(un);
      });

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
        self._SETTINGS_KEYS.forEach(function (k) {
          if (sv[k] !== undefined && sv[k] !== null) {
            if (k === 'settings') self._mergeSettings(sv[k]); else state[k] = sv[k];
          }
        });
        self._shadow.settings = js;
        self._applying = false;
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
              if (op.t === 'del') delete self._shadow.docs[op.key];
              else if (op.key === '@settings') self._shadow.settings = op.js;
              else self._shadow.docs[op.key] = op.js;
              delete self._pending[op.key];
            });
          });
        });
      }, Promise.resolve()).then(function () {
        self._cloudErr = 0;
        if (window.PitSync) PitSync.saved();
        console.log('[PitDB] 保存しました（' + ops.length + '件）');
      }).catch(function (e) {
        console.error('[PitDB] 保存に失敗', e);
        if (window.PitSync) PitSync.failed();
        ops.forEach(function (op) { delete self._pending[op.key]; });
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
