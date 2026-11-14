// ============================================================
// Biblioteca Arcanum Acadamy — área de login (e-mail e senha)
// Supabase Auth + progresso e favoritos separados por conta.
// A leitura é só para quem tem conta: sem login, o leitor abre a tela
// de login/criar conta em vez do conteúdo do livro.
// ============================================================
(function () {
  "use strict";

  var cfg = window.SUPABASE_CONFIG || {};
  var PLACEHOLDER = function (v) { return !v || v.indexOf("COLOCAR_") === 0; };
  var CONFIGURED = !PLACEHOLDER(cfg.SUPABASE_URL) && !PLACEHOLDER(cfg.SUPABASE_ANON_KEY) && !!window.supabase;

  var client = null;
  if (CONFIGURED) {
    try { client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY); }
    catch (e) { client = null; }
  }

  var user = null;              // usuário logado (Supabase) ou null
  var progressCache = {};       // bookId -> { ch, frac, pct, updated_at }
  var favorites = {};           // bookId -> true
  var saveTimers = {};
  var favFilterOn = false;

  // ---------- Ponte com o leitor da página (index.html) ----------
  // loadProgress() do leitor consulta este objeto; saveProgress() avisa aqui.
  window.ArcanumCloud = {
    getProgress: function (id) { return progressCache[id] || null; },
    saveProgress: function (id, data) { queueCloudSave(id, data); },
    isLoggedIn: function () { return !!user; }
  };

  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.hidden = !on; }
  function toast(msg) {
    var t = $("auth-toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function setMsg(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.hidden = !text;
    el.className = "auth-msg" + (kind ? " " + kind : "");
  }

  // ---------- Botão do cabeçalho ----------
  function renderAuthButton() {
    var btn = $("auth-btn");
    if (!btn) return;
    if (user) {
      var name = (user.email || "").split("@")[0];
      btn.textContent = name ? name + " · Minha conta" : "Minha conta";
      btn.classList.add("logged-in");
    } else {
      btn.textContent = "Entrar";
      btn.classList.remove("logged-in");
    }
  }

  // ---------- Modais ----------
  function openModal(id) { var m = $(id); if (m) m.hidden = false; }
  function closeModal(id) { var m = $(id); if (m) m.hidden = true; }
  function openAuth(mode) {
    if (!CONFIGURED || !client) {
      show($("auth-not-configured"), true);
    } else {
      show($("auth-not-configured"), false);
    }
    show($("auth-form"), true);
    show($("auth-reset-form"), false);
    setMsg($("auth-msg"), "");
    setTab(mode === "signup" ? "signup" : "login");
    openModal("auth-modal");
    var email = $("auth-email");
    if (email) email.focus();
  }
  function setTab(which) {
    var login = which === "login";
    var tL = $("tab-login"), tS = $("tab-signup"), submit = $("auth-submit");
    if (tL) tL.classList.toggle("active", login);
    if (tS) tS.classList.toggle("active", !login);
    if (submit) submit.textContent = login ? "Entrar" : "Criar minha conta";
    var pass = $("auth-password");
    if (pass) pass.setAttribute("autocomplete", login ? "current-password" : "new-password");
    setMsg($("auth-msg"), "");
  }

  // ---------- Favoritos ----------
  function bookTitle(id) {
    if (window.BOOKS && window.BOOKS[id] && window.BOOKS[id].title) return window.BOOKS[id].title;
    var btn = document.querySelector('.read-btn[data-book="' + id + '"]');
    return btn ? (btn.getAttribute("data-title") || id) : id;
  }
  function renderFavStars() {
    var cards = document.querySelectorAll(".grid .book");
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var btn = card.querySelector(".read-btn[data-book]");
        if (!btn) return;
        var id = btn.getAttribute("data-book");
        var star = card.querySelector(".fav-btn");
        if (!star) {
          star = document.createElement("button");
          star.type = "button";
          star.className = "fav-btn";
          star.setAttribute("aria-label", "Guardar nos favoritos");
          star.textContent = "☆";
          star.addEventListener("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            toggleFavorite(id);
          });
          card.insertBefore(star, card.firstChild);
        }
        var on = !!favorites[id];
        star.classList.toggle("active", on);
        star.setAttribute("aria-pressed", on ? "true" : "false");
        star.textContent = on ? "★" : "☆";
        star.title = on ? "Remover dos favoritos" : "Guardar nos favoritos";
      })(cards[i]);
    }
  }
  function toggleFavorite(id) {
    if (!user || !client) {
      openAuth("login");
      setMsg($("auth-msg"), "Entre na sua conta para guardar favoritos — cada conta tem os seus.", "");
      return;
    }
    var adding = !favorites[id];
    var done = function (err) {
      if (err) { toast("Não consegui guardar o favorito. Tente de novo."); return; }
      if (adding) favorites[id] = true; else delete favorites[id];
      renderFavStars();
      renderFavList();
      applyFavVisibility();
      toast(adding ? "Guardado nos seus favoritos." : "Removido dos favoritos.");
    };
    if (adding) {
      client.from("favorites").insert({ user_id: user.id, book: id }).then(function (r) { done(r.error); });
    } else {
      client.from("favorites").delete().eq("user_id", user.id).eq("book", id).then(function (r) { done(r.error); });
    }
  }
  function renderFavList() {
    var ul = $("account-favs");
    if (!ul) return;
    ul.innerHTML = "";
    var ids = Object.keys(favorites);
    if (!ids.length) {
      var li = document.createElement("li");
      li.className = "auth-favs-empty";
      li.textContent = "Você ainda não guardou nenhum favorito. Toque na ☆ do livro.";
      ul.appendChild(li);
      return;
    }
    ids.sort().forEach(function (id) {
      var li = document.createElement("li");
      var span = document.createElement("span");
      span.textContent = bookTitle(id);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tool-btn";
      b.textContent = "Ler";
      b.addEventListener("click", function () {
        closeModal("account-modal");
        var readBtn = document.querySelector('.read-btn[data-book="' + id + '"]');
        if (readBtn) readBtn.click();
      });
      li.appendChild(span);
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  // ---------- Filtro "★ Favoritos" no acervo ----------
  function applyFavVisibility() {
    var chip = document.querySelector('.chip[data-filter="favoritos"]');
    favFilterOn = !!(chip && chip.classList.contains("active"));
    var cards = document.querySelectorAll(".grid .book");
    var countEl = $("acervo-count");
    if (!favFilterOn) return;
    var visible = 0;
    for (var i = 0; i < cards.length; i++) {
      var btn = cards[i].querySelector(".read-btn[data-book]");
      var id = btn ? btn.getAttribute("data-book") : "";
      var ok = !!favorites[id];
      cards[i].hidden = !ok;
      if (ok) visible++;
    }
    var noResults = $("no-results");
    if (noResults) noResults.hidden = visible !== 0;
    if (countEl) countEl.textContent = visible + (visible === 1 ? " obra" : " obras");
  }

  // ---------- Nuvem: progresso ----------
  function queueCloudSave(id, data) {
    if (!user || !client) return;
    clearTimeout(saveTimers[id]);
    saveTimers[id] = setTimeout(function () {
      var row = {
        user_id: user.id,
        book: id,
        page: (data.ch || 0) + 1,
        chapter: data.ch || 0,
        frac: data.frac || 0,
        pct: data.pct || 0,
        updated_at: new Date().toISOString()
      };
      progressCache[id] = { ch: row.chapter, frac: row.frac, pct: row.pct, updated_at: row.updated_at };
      client.from("reading_progress").upsert(row, { onConflict: "user_id,book" })
        .then(function (r) { if (r.error) console.warn("Arcanum: progresso não salvo", r.error.message); });
    }, 1500);
  }
  function mergeCloudIntoLocal(rows) {
    var PREFIX = "biblioteca-arcanum:";
    rows.forEach(function (r) {
      var cloud = { ch: r.chapter || 0, frac: r.frac || 0, pct: Number(r.pct) || 0, updated_at: r.updated_at };
      progressCache[r.book] = cloud;
      var local = null;
      try {
        var raw = localStorage.getItem(PREFIX + "progress:" + r.book);
        local = raw ? JSON.parse(raw) : null;
      } catch (e) { local = null; }
      if (!local || (cloud.pct || 0) >= (local.pct || 0)) {
        try { localStorage.setItem(PREFIX + "progress:" + r.book, JSON.stringify({ ch: cloud.ch, frac: cloud.frac, pct: cloud.pct })); } catch (e) {}
      }
    });
  }
  function loadCloudData() {
    if (!user || !client) return Promise.resolve();
    return Promise.all([
      client.from("reading_progress").select("book,chapter,frac,pct,updated_at"),
      client.from("favorites").select("book")
    ]).then(function (results) {
      var prog = results[0], fav = results[1];
      if (!prog.error && prog.data) mergeCloudIntoLocal(prog.data);
      if (!fav.error && fav.data) {
        favorites = {};
        fav.data.forEach(function (r) { favorites[r.book] = true; });
      }
      renderFavStars();
      renderFavList();
      applyFavVisibility();
      if (window.ArcanumReader) window.ArcanumReader.refreshCards();
    }).catch(function (e) { console.warn("Arcanum: não consegui carregar sua conta", e); });
  }

  // ---------- Sessão ----------
  function setUser(u) {
    user = u || null;
    renderAuthButton();
    if (user) {
      var em = $("account-email");
      if (em) em.textContent = user.email || "";
      var since = $("account-since");
      if (since && user.created_at) {
        var d = new Date(user.created_at);
        since.textContent = "Conta criada em " + d.toLocaleDateString("pt-BR");
      }
      renderFavList();
    }
  }
  function afterLogin() {
    closeModal("auth-modal");
    loadCloudData().then(function () { toast("Bem-vindo(a) à sua conta."); });
  }

  function bind() {
    var authBtn = $("auth-btn");
    if (authBtn) authBtn.addEventListener("click", function () {
      if (user) { renderFavList(); openModal("account-modal"); }
      else openAuth("login");
    });
    var close1 = $("auth-close");
    if (close1) close1.addEventListener("click", function () { closeModal("auth-modal"); });
    var close2 = $("account-close");
    if (close2) close2.addEventListener("click", function () { closeModal("account-modal"); });
    [ $("auth-modal"), $("account-modal") ].forEach(function (m) {
      if (m) m.addEventListener("click", function (e) { if (e.target === m) m.hidden = true; });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeModal("auth-modal"); closeModal("account-modal"); }
    });
    var tL = $("tab-login"), tS = $("tab-signup");
    if (tL) tL.addEventListener("click", function () { setTab("login"); });
    if (tS) tS.addEventListener("click", function () { setTab("signup"); });

    var form = $("auth-form");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!CONFIGURED || !client) {
        setMsg($("auth-msg"), "A área de login ainda está sendo ligada. Volte em breve.", "error");
        return;
      }
      var email = ($("auth-email").value || "").trim();
      var pass = $("auth-password").value || "";
      if (!email || email.indexOf("@") < 1) { setMsg($("auth-msg"), "Digite um e-mail válido.", "error"); return; }
      if (pass.length < 6) { setMsg($("auth-msg"), "A senha precisa ter no mínimo 6 caracteres.", "error"); return; }
      var isSignup = $("tab-signup").classList.contains("active");
      setMsg($("auth-msg"), isSignup ? "Criando sua conta..." : "Entrando...");
      var p = isSignup
        ? client.auth.signUp({ email: email, password: pass })
        : client.auth.signInWithPassword({ email: email, password: pass });
      p.then(function (r) {
        if (r.error) {
          var m = r.error.message || "Não consegui entrar.";
          if (/invalid login credentials/i.test(m)) m = "E-mail ou senha incorretos.";
          if (/already registered/i.test(m)) m = "Este e-mail já tem conta. Toque em “Entrar”.";
          setMsg($("auth-msg"), m, "error");
          return;
        }
        if (isSignup && !r.data.session) {
          setMsg($("auth-msg"), "Conta criada! Confira seu e-mail para confirmar e depois entre.", "ok");
          return;
        }
        setUser(r.data.user);
        afterLogin();
      }).catch(function (err) { setMsg($("auth-msg"), "Não consegui entrar. Tente de novo.", "error"); });
    });

    var forgot = $("auth-forgot");
    if (forgot) forgot.addEventListener("click", function () {
      show($("auth-form"), false);
      show($("auth-reset-form"), true);
      setMsg($("auth-reset-msg"), "");
    });
    var back = $("auth-reset-back");
    if (back) back.addEventListener("click", function () {
      show($("auth-reset-form"), false);
      show($("auth-form"), true);
    });
    var resetForm = $("auth-reset-form");
    if (resetForm) resetForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!CONFIGURED || !client) {
        setMsg($("auth-reset-msg"), "A área de login ainda está sendo ligada.", "error");
        return;
      }
      var email = ($("auth-reset-email").value || "").trim();
      if (!email || email.indexOf("@") < 1) { setMsg($("auth-reset-msg"), "Digite um e-mail válido.", "error"); return; }
      setMsg($("auth-reset-msg"), "Enviando...");
      client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname })
        .then(function (r) {
          if (r.error) { setMsg($("auth-reset-msg"), "Não consegui enviar. Confira o e-mail e tente de novo.", "error"); return; }
          setMsg($("auth-reset-msg"), "Enviamos um link de recuperação para " + email + ".", "ok");
        });
    });

    var passForm = $("account-pass-form");
    if (passForm) passForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!client) return;
      var np = $("account-new-pass").value || "";
      if (np.length < 6) { setMsg($("account-pass-msg"), "A nova senha precisa ter no mínimo 6 caracteres.", "error"); return; }
      setMsg($("account-pass-msg"), "Trocando...");
      client.auth.updateUser({ password: np }).then(function (r) {
        if (r.error) { setMsg($("account-pass-msg"), "Não consegui trocar a senha. Tente de novo.", "error"); return; }
        $("account-new-pass").value = "";
        setMsg($("account-pass-msg"), "Senha trocada.", "ok");
      });
    });

    var logout = $("account-logout");
    if (logout) logout.addEventListener("click", function () {
      if (!client) return;
      client.auth.signOut().then(function () {
        setUser(null);
        progressCache = {};
        favorites = {};
        renderFavStars();
        renderFavList();
        applyFavVisibility();
        closeModal("account-modal");
        if (window.ArcanumReader) window.ArcanumReader.refreshCards();
        toast("Você saiu da conta. Para ler, entre de novo.");
      });
    });

    var del = $("account-delete");
    if (del) del.addEventListener("click", function () {
      var msg = $("account-delete-msg");
      if (!del.classList.contains("confirm")) {
        del.classList.add("confirm");
        del.textContent = "Confirmar: excluir minha conta e meus dados";
        setMsg(msg, "Isto apaga sua conta, seu progresso e seus favoritos. Não dá para desfazer.", "error");
        return;
      }
      if (!client) return;
      setMsg(msg, "Excluindo...");
      client.rpc("delete_own_account").then(function (r) {
        if (r.error) { setMsg(msg, "Não consegui excluir. Tente de novo.", "error"); return; }
        return client.auth.signOut().then(function () {
          setUser(null);
          progressCache = {};
          favorites = {};
          closeModal("account-modal");
          toast("Sua conta foi excluída.");
          if (window.ArcanumReader) window.ArcanumReader.refreshCards();
        });
      });
    });

    var favChip = document.querySelector('.chip[data-filter="favoritos"]');
    if (favChip) favChip.addEventListener("click", function () { setTimeout(applyFavVisibility, 0); });
    var search = $("book-search");
    if (search) search.addEventListener("input", function () { setTimeout(applyFavVisibility, 0); });
    var chips = document.querySelectorAll(".filters .chip");
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].getAttribute("data-filter") !== "favoritos") {
        chips[i].addEventListener("click", function () { setTimeout(applyFavVisibility, 0); });
      }
    }
  }

  function init() {
    bind();
    renderFavStars();
    renderAuthButton();
    if (!CONFIGURED || !client) {
      if (!window.supabase && !PLACEHOLDER(cfg.SUPABASE_URL)) {
        console.warn("Arcanum: biblioteca do Supabase não carregou.");
      }
      return;
    }
    client.auth.getSession().then(function (r) {
      if (r.data && r.data.session) {
        setUser(r.data.session.user);
        loadCloudData();
      }
    });
    client.auth.onAuthStateChange(function (event, session) {
      if (event === "SIGNED_IN" && session) {
        setUser(session.user);
        loadCloudData();
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        progressCache = {};
        favorites = {};
        renderFavStars();
        renderFavList();
        if (window.ArcanumReader) window.ArcanumReader.refreshCards();
      } else if (event === "PASSWORD_RECOVERY") {
        openAuth("login");
        setMsg($("auth-msg"), "Digite sua nova senha abaixo para concluir a recuperação.", "ok");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
