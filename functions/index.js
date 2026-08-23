/* =========================================================
   PitFlow サーバー関数（APIキーを隠す Anthropic の窓口）
   ---------------------------------------------------------
   ◎なぜ要るか
     AI に聞くには鍵（APIキー）が要る。**鍵を画面に置くと、開いた人全員に見える。**
     だから鍵はサーバー側の金庫（Secret）に入れて、**画面からは「聞いてきて」と頼むだけ**にする。

   ◎🔴 CoreTemplate と同じ形にしてある（`CoreTemplate/coretemplate/functions/index.js`）
     - onCall(v2) / region: asia-northeast1
     - 鍵は Secret **`ANTHROPIC_API_KEY`**（**CoreTemplate 用に登録ずみのものを、そのまま使う**）
       ＝ 同じ Firebase プロジェクト（carflow-9d500）なので、**新しく鍵を作る必要は無い**
     - ログイン済み かつ CoreFlow の名簿（portalMembers）で **PitFlow が使える人**だけ呼べる
     🔴 **PitFlow の入室条件と同じにしてある**（`js/auth-pit.js` の `canUse`）
        ＝ `master` か `pitflow.on === true`。ここを緩めないこと。
     🔴 **お金がかかる呼び出しなので、さらに「管理」だけに絞る**（`pitflow.role === '管理'`）。
        画面のボタンを消すだけにしない＝**ここでも止める**（全アプリ共通の決めごと）。

   ◎出しかた（ゆうた・1回だけ）
     cd D:\Claude\アプリ開発\PitFlow\pitflow\functions
     npm install
     cd ..
     firebase deploy --only functions:pitflow
     ⚠ ふだんの `deploy-pitflow.ps1`（画面を出す）とは**別**。関数を直した時だけ走らせる。
   ========================================================= */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const COMPANY_ID = "kobayashi_motors";
const APP_KEY = "pitflow";
const ALLOWED_MODELS = new Set([
  "claude-sonnet-5",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-8",
]);

/* 名簿を引いて、PitFlow を使える「管理」の人かどうかを見る。
   ⚠ 画面（auth-pit.js）と同じ条件。**片方だけ緩めない。** */
async function assertAdmin(uid, email) {
  const col = db.collection("companies").doc(COMPANY_ID).collection("portalMembers");
  let snap = await col.doc(uid).get();
  let m = snap.exists ? snap.data() : null;
  if (!m && email) {
    const q = await col.where("email", "==", String(email).toLowerCase()).limit(1).get();
    if (!q.empty) m = q.docs[0].data();
  }
  if (!m) throw new HttpsError("permission-denied", "名簿にありません。");
  if (m.active === false) throw new HttpsError("permission-denied", "在籍が無効です。");
  const perm = m[APP_KEY] || {};
  const canUse = (m.master === true) || (perm.on === true);
  if (!canUse) throw new HttpsError("permission-denied", "PitFlow の利用権限がオフになっています。");
  const isAdmin = (m.master === true) || (m.admin === true) || (perm.role === "管理");
  if (!isAdmin) throw new HttpsError("permission-denied", "AIチェックを走らせられるのは、設定権限（管理）のある人だけです。");
  return m;
}

exports.pfAsk = onCall(
  { region: "asia-northeast1", secrets: [ANTHROPIC_API_KEY], memory: "256MiB", timeoutSeconds: 120 },
  async (req) => {
    if (!req.auth) throw new HttpsError("unauthenticated", "ログインが必要です。");
    await assertAdmin(req.auth.uid, req.auth.token && req.auth.token.email);

    const { model, system, user, max_tokens } = req.data || {};
    if (!system || !user) throw new HttpsError("invalid-argument", "system / user が必要です。");
    const useModel = ALLOWED_MODELS.has(model) ? model : "claude-sonnet-5";
    const maxTokens = Math.min(Math.max(parseInt(max_tokens, 10) || 2048, 16), 8192);

    /* ⚠ 送る量に上限をかける（事故で巨大なものを送らないため）。
       ＝ 画面側でも絞っているが、**ここでも止める**（片方だけにしない）。 */
    const userText = String(user);
    if (userText.length > 400000) throw new HttpsError("invalid-argument", "送る中身が大きすぎます。期間を短くしてください。");

    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: useModel,
          max_tokens: maxTokens,
          system: String(system),
          messages: [{ role: "user", content: userText }],
        }),
      });
    } catch (e) {
      throw new HttpsError("unavailable", "AIサーバーに接続できませんでした。");
    }
    if (!res.ok) {
      let tx = "";
      try { tx = await res.text(); } catch (e) { /* ignore */ }
      throw new HttpsError("internal", "APIエラー " + res.status + " " + tx.slice(0, 300));
    }
    const data = await res.json();
    const text = (data.content || []).map((c) => c.text || "").join("");
    const usage = data.usage || {};
    return { text, usage: { in: usage.input_tokens || 0, out: usage.output_tokens || 0 }, model: useModel };
  }
);
