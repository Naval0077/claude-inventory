// Start-up: connect to Supabase, sign the person in, load their role, then start the app.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const gate = $("gate");
  const cfg = window.APP_CONFIG || {};

  function show(html) { gate.hidden = false; $("gateBody").innerHTML = html; }
  function msg(kind, text) { const m = $("gateMsg"); if (m) { m.className = "gate-msg " + kind; m.textContent = text; m.hidden = !text; } }

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || /YOUR-/.test(cfg.supabaseUrl + cfg.supabaseAnonKey)) {
    show(`<h1>Almost ready</h1><p class="muted">This copy of the app isn't connected to a database yet. Put your Supabase project URL and anon key into <code>app/config.js</code>, as described in <b>docs/SETUP.md</b>, then reload.</p>`);
    return;
  }
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  let started = false;

  function signInForm(note) {
    show(`<h1>Sign in</h1>
      <div class="gate-msg" id="gateMsg" hidden></div>
      <form id="signInForm" novalidate>
        <label class="field">Email<input id="g-email" type="email" autocomplete="username" required></label>
        <label class="field">Password<input id="g-pass" type="password" autocomplete="current-password" required></label>
        <button class="btn primary big" type="submit">Sign in</button>
      </form>
      <div class="row" style="justify-content:space-between"><button type="button" class="linkish" id="toSignUp">Create an account</button><button type="button" class="linkish" id="toForgot">Forgot password?</button></div>`);
    if (note) msg(note[0], note[1]);
    $("signInForm").onsubmit = async (e) => {
      e.preventDefault();
      const email = $("g-email").value.trim(), password = $("g-pass").value;
      if (!email || !password) return msg("err", "Enter your email and password.");
      msg("", ""); e.submitter && (e.submitter.disabled = true);
      const { error } = await sb.auth.signInWithPassword({ email, password });
      e.submitter && (e.submitter.disabled = false);
      if (error) msg("err", /confirm/i.test(error.message) ? "Confirm your email first: open the link we sent you." : /invalid/i.test(error.message) ? "That email and password don't match." : error.message);
    };
    $("toSignUp").onclick = signUpForm;
    $("toForgot").onclick = forgotForm;
  }
  function signUpForm() {
    show(`<h1>Create an account</h1>
      <p class="muted small">After you sign up, an admin gives you access.</p>
      <div class="gate-msg" id="gateMsg" hidden></div>
      <form id="signUpForm" novalidate>
        <label class="field">Your name<input id="g-name" autocomplete="name" required></label>
        <label class="field">Email<input id="g-email" type="email" autocomplete="username" required></label>
        <label class="field">Password <span class="hint">at least 8 characters</span><input id="g-pass" type="password" autocomplete="new-password" minlength="8" required></label>
        <button class="btn primary big" type="submit">Create account</button>
      </form>
      <button type="button" class="linkish" id="toSignIn">I already have an account</button>`);
    $("toSignIn").onclick = () => signInForm();
    $("signUpForm").onsubmit = async (e) => {
      e.preventDefault();
      const name = $("g-name").value.trim(), email = $("g-email").value.trim(), password = $("g-pass").value;
      if (!name || !email) return msg("err", "Enter your name and email.");
      if (password.length < 8) return msg("err", "Use a password of at least 8 characters.");
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + location.pathname } });
      if (error) return msg("err", error.message);
      if (!data.session) signInForm(["ok", "Account created. Open the confirmation link we emailed you, then sign in."]);
    };
  }
  function forgotForm() {
    show(`<h1>Reset password</h1>
      <div class="gate-msg" id="gateMsg" hidden></div>
      <form id="forgotForm" novalidate>
        <label class="field">Email<input id="g-email" type="email" autocomplete="username" required></label>
        <button class="btn primary big" type="submit">Email me a reset link</button>
      </form>
      <button type="button" class="linkish" id="toSignIn">Back to sign in</button>`);
    $("toSignIn").onclick = () => signInForm();
    $("forgotForm").onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.resetPasswordForEmail($("g-email").value.trim(), { redirectTo: location.origin + location.pathname });
      msg(error ? "err" : "ok", error ? error.message : "If that email has an account, a reset link is on its way.");
    };
  }
  function newPasswordForm() {
    show(`<h1>Choose a new password</h1>
      <div class="gate-msg" id="gateMsg" hidden></div>
      <form id="newPassForm" novalidate>
        <label class="field">New password<input id="g-pass" type="password" autocomplete="new-password" minlength="8" required></label>
        <button class="btn primary big" type="submit">Save password</button>
      </form>`);
    $("newPassForm").onsubmit = async (e) => {
      e.preventDefault();
      const password = $("g-pass").value;
      if (password.length < 8) return msg("err", "Use at least 8 characters.");
      const { error } = await sb.auth.updateUser({ password });
      if (error) return msg("err", error.message);
      history.replaceState(null, "", location.pathname);
      enter();
    };
  }

  async function enter() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return signInForm();
    const { data: profile, error } = await sb.from("profiles").select("user_id,email,name,role").eq("user_id", session.user.id).maybeSingle();
    if (error) {
      show(`<h1>Can't load your account</h1><p class="muted">${esc(error.message)}</p><p class="small muted">If this is a new setup, run <code>supabase/schema.sql</code> in the Supabase SQL editor.</p><button class="btn" id="gOut">Sign out</button>`);
      $("gOut").onclick = () => sb.auth.signOut();
      return;
    }
    if (!profile || !profile.role) {
      show(`<h1>Waiting for access</h1><p class="muted">You're signed in as <b>${esc(session.user.email)}</b>. An admin needs to give you a role in <b>Settings → Team</b>. Then tap Check again.</p>
        <div class="row"><button class="btn primary" id="gAgain">Check again</button><button class="btn ghost" id="gOut">Sign out</button></div>`);
      $("gAgain").onclick = enter; $("gOut").onclick = () => sb.auth.signOut();
      return;
    }
    gate.hidden = true;
    if (!started) { started = true; window.StockApp.start({ db: window.StockDB.createStore(sb), sb, profile }); }
  }

  sb.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") newPasswordForm();
    else if (event === "SIGNED_OUT") { if (started) location.reload(); else signInForm(); }
    else if (event === "SIGNED_IN" && !started) enter();
  });
  document.getElementById("signOutBtn").onclick = () => sb.auth.signOut();
  enter();
})();
