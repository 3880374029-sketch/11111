// ============================================================
//  Auth —— Supabase 认证与成绩同步
//  依赖：先加载 CDN 的 @supabase/supabase-js，再加载 config.js，最后本文件
//  未配置 Supabase 时全部函数安全降级（返回 null），游戏仍可离线玩
// ============================================================

const Auth = (function () {

  let _client = null;

  // 惰性创建客户端，避免 SDK 未加载时报错
  function getClient() {
    if (_client) return _client;
    if (!window.SUPABASE_ENABLED) return null;
    if (!window.supabase || !window.supabase.createClient) return null;
    _client = window.supabase.createClient(
      window.SUPABASE_URL,
      window.SUPABASE_ANON_KEY
    );
    return _client;
  }

  function isReady() {
    return !!getClient();
  }

  // ---------- 会话 ----------
  async function getSession() {
    const c = getClient();
    if (!c) return null;
    const { data } = await c.auth.getSession();
    return data && data.session ? data.session : null;
  }

  async function getUser() {
    const s = await getSession();
    return s && s.user ? s.user : null;
  }

  // 监听登录态变化（登录/登出/令牌刷新都会触发）
  function onAuthStateChange(cb) {
    const c = getClient();
    if (!c) return () => {};
    const { data } = c.auth.onAuthStateChange((_e, session) => {
      cb(session ? session.user : null);
    });
    return data && data.subscription ? () => data.subscription.unsubscribe() : () => {};
  }

  // ---------- 注册 ----------
  // 注意：若 Supabase 开启邮箱验证，注册后 session 为 null，需要用户先去邮箱确认
  async function signUp(email, password, username) {
    const c = getClient();
    if (!c) return { user: null, error: new Error("未配置 Supabase"), needConfirm: false };

    const { data, error } = await c.auth.signUp({
      email,
      password,
      options: { data: { username: username || "" } }
    });
    if (error) return { user: null, error, needConfirm: false };

    const user = data && data.user ? data.user : null;
    const needConfirm = !!(user && !data.session);   // 需要邮箱确认

    // 已登录则把用户名写入 profiles（schema.sql 的触发器已建默认行，这里覆盖）
    if (user && data.session && username) {
      await c.from("profiles")
        .update({ username, display_name: username })
        .eq("id", user.id);
    }
    return { user, error: null, needConfirm };
  }

  // ---------- 登录 ----------
  async function signIn(email, password) {
    const c = getClient();
    if (!c) return { user: null, error: new Error("未配置 Supabase") };
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) return { user: null, error };
    return { user: data && data.user ? data.user : null, error: null };
  }

  // ---------- 登出 ----------
  async function signOut() {
    const c = getClient();
    if (!c) return;
    await c.auth.signOut();
  }

  // ---------- 成绩同步 ----------
  // 各模式的主指标：无尽看存活时长，其余看分数
  function primaryValue(mode, r) {
    if (mode === "endless") return r.survived_seconds || 0;
    return r.score || 0;
  }

  // 保存成绩：仅在优于历史记录时写入
  async function saveRecord(game, mode, difficulty, stats) {
    const c = getClient();
    if (!c) return null;
    const user = await getUser();
    if (!user) return null;

    const { data: existing } = await c
      .from("game_records")
      .select("*")
      .eq("user_id", user.id)
      .eq("game", game)
      .eq("mode", mode)
      .eq("difficulty", difficulty)
      .maybeSingle();

    // 不如历史成绩则跳过
    if (existing && primaryValue(mode, stats) <= primaryValue(mode, existing)) {
      return existing;
    }

    const payload = {
      user_id: user.id,
      game, mode, difficulty,
      score: Math.max(stats.score || 0, existing ? existing.score || 0 : 0),
      wave: Math.max(stats.wave || 0, existing ? existing.wave || 0 : 0),
      kills: Math.max(stats.kills || 0, existing ? existing.kills || 0 : 0),
      survived_seconds: Math.max(
        stats.survived_seconds || 0,
        existing ? existing.survived_seconds || 0 : 0
      ),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await c
      .from("game_records")
      .upsert(payload, { onConflict: "user_id,game,mode,difficulty" })
      .select()
      .single();

    return error ? null : data;
  }

  // 读取某游戏的全部成绩
  async function getRecords(game) {
    const c = getClient();
    if (!c) return [];
    const user = await getUser();
    if (!user) return [];
    const { data, error } = await c
      .from("game_records")
      .select("*")
      .eq("user_id", user.id)
      .eq("game", game);
    return error ? [] : (data || []);
  }

  return {
    isReady, getSession, getUser, onAuthStateChange,
    signUp, signIn, signOut,
    saveRecord, getRecords
  };
})();
