// ============================================================
//  Supabase 连接配置
//  在 Supabase 控制台 → Project Settings → API 里获取这两项：
//    - Project URL          → SUPABASE_URL
//    - anon / public key    → SUPABASE_ANON_KEY
//
//  关于安全性：anon key 在前端暴露是 Supabase 的既定设计，
//  真正的访问控制靠下面两件事保证，缺一不可：
//    1) 每张业务表都必须开启 RLS（schema.sql 已开启并写好策略）
//    2) 绝不要把 service_role key 放到前端
//  如果担心滥用，可在 Supabase 控制台给 anon key 配置域名白名单。
// ============================================================

window.SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR-ANON-KEY";

// 未配置时置为 true，前端自动降级为「本地模式」（不联网，成绩只存 localStorage）
window.SUPABASE_ENABLED =
  !window.SUPABASE_URL.includes("YOUR-PROJECT") &&
  !window.SUPABASE_ANON_KEY.includes("YOUR-ANON-KEY");
