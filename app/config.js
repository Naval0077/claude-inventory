// Connects the app to your Supabase project. Both values are on the Supabase dashboard:
// Project Settings → API → "Project URL" and the "anon public" key.
// The anon key is meant to be public; your data is protected by the rules in supabase/schema.sql.
window.APP_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY",
};
