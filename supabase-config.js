// Configuração do Supabase — Biblioteca Arcanum Acadamy
// -------------------------------------------------------
// COMO LIGAR:
// 1. Crie o projeto no Supabase (https://supabase.com) — plano gratuito.
// 2. Em Project Settings → API, copie a "Project URL" e a chave "anon public".
// 3. Cole os dois valores abaixo, no lugar dos PLACEHOLDERS.
// 4. No SQL Editor do Supabase, rode o arquivo supabase/schema.sql.
// 5. Em Authentication → Providers, deixe SÓ o "Email" ligado
//    (nada de Google ou outras redes sociais — só e-mail e senha).
// 6. Em Authentication → URL Configuration, coloque o endereço do site
//    (https://biblioteca-arcanum-acadamy.vercel.app/) em "Site URL"
//    e em "Redirect URLs", para o "esqueci a senha" funcionar.
//
// ATENÇÃO: a chave "anon" é pública por desenho (ela só permite o que
// as regras de RLS do banco deixam). NUNCA cole aqui a chave "service_role".
window.SUPABASE_CONFIG = {
  SUPABASE_URL: "https://slhrproysmdceqptjfiz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaHJwcm95c21kY2VxcHRqZml6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MjM0ODUsImV4cCI6MjExMDA5OTQ4NX0.Xsy80SlPDeHMiTpZg-AKFKbA3o3OiqlNM2eYhraEj3A"
};
