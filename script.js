/* =====================================================================
   CHÁ DE PANELA — ISAQUE & YASMIM
   script.js — lógica completa do site (Vanilla JS)
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. CONFIGURAÇÃO DO FIREBASE
   Preencha com os dados do SEU projeto Firebase.
   Veja o README.md — "Configuração do Firebase" — para o passo a passo
   de onde encontrar cada um desses valores.
--------------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyBfr-_VL5bwKLBdVni1IYiCZz1NOjH7Tyo",
  authDomain: "cha-de-panela-isaque-yasmim.firebaseapp.com",
  projectId: "cha-de-panela-isaque-yasmim",
  storageBucket: "cha-de-panela-isaque-yasmim.firebasestorage.app",
  messagingSenderId: "369631300903",
  appId: "1:369631300903:web:65f9130551785e3ac72d02"
};

/* ---------------------------------------------------------------------
   2. ADMINISTRADORES
   Coloque aqui o(s) UID do Firebase Authentication das contas que
   poderão acessar a área administrativa. Descubra o seu UID fazendo
   login no site normalmente e olhando o console (ele é impresso lá
   na primeira vez que você entra), ou pelo Firebase Console > Authentication.
   Isso é só uma conveniência de interface — a segurança de verdade está
   nas Firestore Security Rules (ver README.md, parte de segurança).
--------------------------------------------------------------------- */
const ADMIN_UIDS = [
  "KljVBFhZGGSFaKhAzmX9EnHWQ6p2",
  "beRAJ8eSfSVkDm3COfMH3lbLHNA2"
];

/* ---------------------------------------------------------------------
   2.1. CONVIDADOS AUTORIZADOS
   Como este site NÃO é aberto ao público, só os e-mails do Google
   listados aqui (em minúsculas) conseguem permanecer logados.
   Se alguém logar com um e-mail que não está nesta lista, o site
   desconecta automaticamente essa conta.
   Administradores (ADMIN_UIDS) sempre podem entrar, mesmo que o
   e-mail deles não esteja nesta lista.
   Deixe a lista vazia ([]) apenas durante testes — com ela vazia,
   QUALQUER conta Google consegue logar.
--------------------------------------------------------------------- */
const ALLOWED_EMAILS = [
  // "maria@gmail.com",
  // "joao@gmail.com",
];
function normalizarEmail(email){
  return String(email ?? "").trim().toLowerCase();
}

/* ---------------------------------------------------------------------
   3. CATEGORIAS — estrutura centralizada
   Para adicionar/editar/remover uma categoria, mexa SOMENTE aqui.
   `key` é o identificador salvo no Firestore (não acentuado, minúsculo).
--------------------------------------------------------------------- */
const CATEGORIAS = [
  { key: "cozinha",    nome: "Cozinha",         icon: "🍳" },
  { key: "quarto",     nome: "Quarto",          icon: "🛏️" },
  { key: "banheiro",   nome: "Banheiro",        icon: "🚿" },
  { key: "lavanderia", nome: "Lavanderia",      icon: "🧺" },
  { key: "limpeza",    nome: "Limpeza",         icon: "🧹" },
  { key: "diversos",   nome: "Casa / Diversos", icon: "🏠" }
];
const CATEGORIA_PADRAO = "diversos";
function getCategoriaInfo(key){
  return CATEGORIAS.find(c => c.key === key) || { key, nome: key, icon: "🏷️" };
}

/* ---------------------------------------------------------------------
   4. DATA DO GRANDE DIA
--------------------------------------------------------------------- */
// 09/10/2026, meia-noite no horário de Brasília (UTC-3)
const DATA_EVENTO = new Date("2026-10-09T00:00:00-03:00");

/* ---------------------------------------------------------------------
   5. INICIALIZAÇÃO DO FIREBASE
--------------------------------------------------------------------- */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const presentesRef = db.collection("presentes");

/* ---------------------------------------------------------------------
   ESTADO GLOBAL
--------------------------------------------------------------------- */
let currentUser = null;      // objeto do Firebase Auth
let isAdmin = false;
let presentes = [];          // cache local de todos os presentes (com id)
let filtros = { status: "todos", categoria: "todas", busca: "" };
let importedRows = null;     // linhas normalizadas prontas para importar
let editingId = null;        // id do presente sendo editado no modal admin

/* =====================================================================
   TOASTS
   ===================================================================== */
function toast(msg, type = "success"){
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = "toast" + (type === "error" ? " toast--error" : "");
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function showLoading(show){
  document.getElementById("loading-overlay").hidden = !show;
}

/* =====================================================================
   CONTAGEM REGRESSIVA
   ===================================================================== */
function tickCountdown(){
  const now = new Date();
  const diff = DATA_EVENTO.getTime() - now.getTime();
  const wrap = document.getElementById("countdown");

  if (diff <= 0){
    wrap.innerHTML = `<p class="countdown__arrived">Chegou o grande dia! 💍</p>`;
    return;
  }
  const s = Math.floor(diff / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  document.getElementById("cd-days").textContent = String(days);
  document.getElementById("cd-hours").textContent = String(hours).padStart(2, "0");
  document.getElementById("cd-minutes").textContent = String(minutes).padStart(2, "0");
  document.getElementById("cd-seconds").textContent = String(seconds).padStart(2, "0");
}
setInterval(tickCountdown, 1000);
tickCountdown();

document.getElementById("btn-scroll-lista").addEventListener("click", () => {
  document.getElementById("lista").scrollIntoView({ behavior: "smooth" });
});

/* =====================================================================
   AUTENTICAÇÃO — LOGIN COM GOOGLE
   Importante: NÃO salvamos o e-mail em lugar nenhum. Usamos apenas
   displayName, photoURL e uid.
   ===================================================================== */
document.getElementById("btn-google-login").addEventListener("click", async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try{
    showLoading(true);
    await auth.signInWithPopup(provider);
  }catch(err){
    console.error(err);
    toast("Não foi possível entrar com o Google. Tente novamente.", "error");
  }finally{
    showLoading(false);
  }
});

document.getElementById("btn-logout").addEventListener("click", () => auth.signOut());

auth.onAuthStateChanged(user => {
  // Bloqueia contas que não estão na lista de convidados autorizados
  // (administradores sempre passam, mesmo se não estiverem na lista).
  if (user){
    const admin = ADMIN_UIDS.includes(user.uid);
    const emailPermitido = ALLOWED_EMAILS.length === 0 ||
      ALLOWED_EMAILS.map(normalizarEmail).includes(normalizarEmail(user.email));
    if (!admin && !emailPermitido){
      auth.signOut();
      toast("Este e-mail não está na lista de convidados deste Chá de Panela.", "error");
      return; // onAuthStateChanged será chamado de novo com user = null
    }
  }

  currentUser = user;
  isAdmin = !!(user && ADMIN_UIDS.includes(user.uid));

  const signedOut = document.getElementById("user-signed-out");
  const signedIn = document.getElementById("user-signed-in");
  const btnAdmin = document.getElementById("btn-admin-panel");

  if (user){
    signedOut.hidden = true;
    signedIn.hidden = false;
    // Apenas nome e foto são usados/exibidos — nunca o e-mail.
    document.getElementById("user-name").textContent = user.displayName || "Convidado(a)";
    const photo = document.getElementById("user-photo");
    if (user.photoURL){
      photo.src = user.photoURL;
      photo.style.display = "";
    } else {
      photo.style.display = "none";
    }
    btnAdmin.hidden = !isAdmin;
    if (!isAdmin){
      console.info(
        "Seu UID do Firebase é:", user.uid,
        "— copie-o para ADMIN_UIDS em script.js e crie um documento com esse ID na coleção 'admins' do Firestore, se quiser que essa conta seja administradora."
      );
    }
  } else {
    signedOut.hidden = false;
    signedIn.hidden = true;
    btnAdmin.hidden = true;
  }
  renderAll();
});

document.getElementById("btn-admin-panel").addEventListener("click", () => openAdminPanel());

/* =====================================================================
   LEITURA EM TEMPO REAL DO FIRESTORE
   ===================================================================== */
presentesRef.orderBy("categoria").onSnapshot(
  snap => {
    presentes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    populateCategoryFilter();
    renderAll();
  },
  err => {
    console.error(err);
    toast("Erro ao carregar a lista de presentes.", "error");
  }
);

/* =====================================================================
   FILTROS
   ===================================================================== */
function populateCategoryFilter(){
  const select = document.getElementById("filter-category");
  if (select.dataset.filled) return;
  CATEGORIAS.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.key;
    opt.textContent = c.nome;
    select.appendChild(opt);
  });
  select.dataset.filled = "1";
}

document.getElementById("filter-search").addEventListener("input", e => {
  filtros.busca = e.target.value.trim().toLowerCase();
  renderAll();
});
document.getElementById("filter-category").addEventListener("change", e => {
  filtros.categoria = e.target.value;
  renderAll();
});
document.querySelectorAll(".filters__chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".filters__chip").forEach(c => {
      c.classList.remove("is-active");
      c.setAttribute("aria-selected", "false");
    });
    chip.classList.add("is-active");
    chip.setAttribute("aria-selected", "true");
    filtros.status = chip.dataset.status;
    renderAll();
  });
});

function presentePassaFiltro(p){
  if (filtros.status === "disponivel" && p.escolhido) return false;
  if (filtros.status === "escolhido" && !p.escolhido) return false;
  if (filtros.categoria !== "todas" && p.categoria !== filtros.categoria) return false;
  if (filtros.busca && !p.nome.toLowerCase().includes(filtros.busca)) return false;
  return true;
}

/* =====================================================================
   RENDERIZAÇÃO
   ===================================================================== */
function renderAll(){
  renderStats();
  renderCategorias();
}

function renderStats(){
  const total = presentes.length;
  const escolhidos = presentes.filter(p => p.escolhido).length;
  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-disponiveis").textContent = total - escolhidos;
  document.getElementById("stat-escolhidos").textContent = escolhidos;
}

// Guarda quais categorias estão abertas entre re-renderizações
const openCategorias = new Set();

function renderCategorias(){
  const container = document.getElementById("categorias-container");
  const emptyMsg = document.getElementById("categorias-empty");

  // remove cards antigos, mantém a mensagem de vazio
  [...container.querySelectorAll(".categoria")].forEach(el => el.remove());

  const filtrados = presentes.filter(presentePassaFiltro);
  let algumaCategoriaComItem = false;

  CATEGORIAS.forEach(cat => {
    const todosDaCategoria = presentes.filter(p => p.categoria === cat.key);
    const itensFiltrados = filtrados.filter(p => p.categoria === cat.key);
    if (todosDaCategoria.length === 0) return; // não mostra categoria vazia (sem nenhum presente cadastrado)
    if (itensFiltrados.length === 0 && (filtros.status !== "todos" || filtros.categoria !== "todas" || filtros.busca)) {
      // categoria existe mas nada bate com o filtro atual -> não renderiza
      if (filtros.categoria !== "todas" && filtros.categoria !== cat.key) return;
      if (itensFiltrados.length === 0) return;
    }

    algumaCategoriaComItem = true;
    const disponiveis = todosDaCategoria.filter(p => !p.escolhido).length;
    const escolhidos = todosDaCategoria.length - disponiveis;
    const pct = todosDaCategoria.length ? Math.round((escolhidos / todosDaCategoria.length) * 100) : 0;

    const el = document.createElement("div");
    el.className = "categoria" + (openCategorias.has(cat.key) ? " is-open" : "");
    el.innerHTML = `
      <button class="categoria__header" data-cat="${cat.key}" aria-expanded="${openCategorias.has(cat.key)}">
        <span class="categoria__icon">${cat.icon}</span>
        <span class="categoria__title">
          <span class="categoria__name">${cat.nome}</span>
          <span class="categoria__meta">${todosDaCategoria.length} presentes · ${disponiveis} disponíveis · ${escolhidos} escolhidos</span>
        </span>
        <svg class="categoria__chevron" width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M5 7l5 6 5-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="categoria__progress"><div class="categoria__progress-fill" style="width:${pct}%"></div></div>
      <div class="categoria__body">
        <div class="presentes-grid">
          ${itensFiltrados.map(p => presenteCardHTML(p)).join("") || `<p style="padding:0 0 1rem;color:var(--gray-500);font-size:.88rem;">Nenhum presente desta categoria com esse filtro.</p>`}
        </div>
      </div>
    `;
    container.insertBefore(el, emptyMsg);
  });

  emptyMsg.hidden = algumaCategoriaComItem;

  container.querySelectorAll(".categoria__header").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.cat;
      if (openCategorias.has(key)) openCategorias.delete(key);
      else openCategorias.add(key);
      renderCategorias();
    });
  });

  container.querySelectorAll("[data-choose-id]").forEach(btn => {
    btn.addEventListener("click", () => handleChoosePresente(btn.dataset.chooseId, btn.dataset.chooseNome));
  });
}

function presenteCardHTML(p){
  const status = p.escolhido ? "escolhido" : "disponivel";
  return `
    <div class="presente-card">
      <span class="presente-card__nome">${escapeHTML(p.nome)}</span>
      <span class="presente-card__status presente-card__status--${status}">${p.escolhido ? "Escolhido" : "Disponível"}</span>
      ${p.escolhido ? `<span class="presente-card__por">Escolhido por ${escapeHTML(p.escolhidoPor || "—")}</span>` : ""}
      ${!p.escolhido ? `<button class="btn btn--outline presente-card__btn" data-choose-id="${p.id}" data-choose-nome="${escapeAttr(p.nome)}">${isAdmin ? "Cadastrar nome" : "Escolher presente"}</button>` : ""}
    </div>
  `;
}

function escapeHTML(str){
  return String(str ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]));
}
function escapeAttr(str){ return escapeHTML(str).replace(/"/g, "&quot;"); }

/* =====================================================================
   ESCOLHER PRESENTE — com transaction (evita dupla reserva)
   ===================================================================== */
let pendingChoice = null;

function handleChoosePresente(id, nome){
  // Administradores não "escolhem" um presente para si — eles cadastram o
  // nome de quem escolheu diretamente, sem passar pelo fluxo de reserva do
  // convidado (que trava o Google e usa o UID do próprio admin).
  if (isAdmin){
    openEditModal(id);
    const statusSelect = document.getElementById("edit-status");
    statusSelect.value = "escolhido";
    toggleEditPorField();
    document.getElementById("edit-por").value = "";
    document.getElementById("edit-por").focus();
    return;
  }

  if (!currentUser){
    toast("Entre com sua conta Google para escolher um presente.", "error");
    document.getElementById("btn-google-login").click();
    return;
  }

  // já escolheu outro presente?
  const jaEscolhido = presentes.find(p => p.uidEscolhedor === currentUser.uid);
  if (jaEscolhido){
    document.getElementById("modal-already-item").textContent = jaEscolhido.nome;
    document.getElementById("modal-already").hidden = false;
    return;
  }

  pendingChoice = { id, nome };
  document.getElementById("modal-confirm-item").textContent = nome;
  document.getElementById("modal-confirm-nome").value = currentUser.displayName || "";
  document.getElementById("modal-confirm").hidden = false;
}

document.getElementById("modal-confirm-cancel").addEventListener("click", () => {
  pendingChoice = null;
  document.getElementById("modal-confirm").hidden = true;
});

document.getElementById("modal-confirm-ok").addEventListener("click", async () => {
  if (!pendingChoice || !currentUser) return;
  const { id } = pendingChoice;

  const nomeEscolhido = document.getElementById("modal-confirm-nome").value.trim();
  if (!nomeEscolhido){
    toast("Digite seu nome antes de confirmar.", "error");
    return;
  }

  document.getElementById("modal-confirm").hidden = true;
  showLoading(true);

  try{
    const nomeDoPresente = pendingChoice.nome;
    await db.runTransaction(async (tx) => {
      const docRef = presentesRef.doc(id);
      const reservaRef = db.collection("reservas").doc(currentUser.uid);

      // Todas as leituras de uma transação precisam acontecer antes de qualquer escrita.
      const [snap, reservaSnap] = await Promise.all([tx.get(docRef), tx.get(reservaRef)]);

      if (!snap.exists) throw new Error("NAO_ENCONTRADO");
      if (snap.data().escolhido) throw new Error("JA_ESCOLHIDO");

      // "Documento de reserva": garante, de forma atômica, que este UID
      // ainda não escolheu nenhum outro presente.
      if (reservaSnap.exists) throw new Error("USUARIO_JA_TEM");

      tx.update(docRef, {
        escolhido: true,
        escolhidoPor: nomeEscolhido,
        uidEscolhedor: currentUser.uid,
        dataEscolha: firebase.firestore.FieldValue.serverTimestamp()
      });

      tx.set(reservaRef, {
        presenteId: id,
        presenteNome: nomeDoPresente,
        dataEscolha: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    toast("Presente escolhido com sucesso! Muito obrigado 💚");
  }catch(err){
    if (err.message === "JA_ESCOLHIDO"){
      toast("Esse presente acabou de ser escolhido por outra pessoa. Por favor, escolha outro presente.", "error");
    } else if (err.message === "USUARIO_JA_TEM"){
      toast("Você já escolheu um presente para o nosso Chá de Panela. Muito obrigado!", "error");
    } else {
      console.error(err);
      toast("Não foi possível concluir a escolha. Tente novamente.", "error");
    }
  }finally{
    pendingChoice = null;
    showLoading(false);
  }
});

document.getElementById("modal-already-ok").addEventListener("click", () => {
  document.getElementById("modal-already").hidden = true;
});

// fecha modais clicando fora
document.querySelectorAll(".modal-backdrop").forEach(bd => {
  bd.addEventListener("click", e => { if (e.target === bd) bd.hidden = true; });
});

/* =====================================================================
   NORMALIZAÇÃO (usada na importação de planilhas)
   ===================================================================== */
function normalizarTexto(str){
  return String(str ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove acentos
}

function normalizarCategoria(valor){
  const v = normalizarTexto(valor);
  const match = CATEGORIAS.find(c =>
    normalizarTexto(c.nome) === v || c.key === v || normalizarTexto(c.key) === v
  );
  return match ? match.key : CATEGORIA_PADRAO;
}

const TRUE_VALUES = ["escolhido", "sim", "s", "true", "reservado", "ocupado", "x", "1"];
function normalizarStatus(valor){
  const v = normalizarTexto(valor);
  return TRUE_VALUES.includes(v);
}

/* Encontra a coluna certa entre vários nomes possíveis */
function acharColuna(row, candidatos){
  const chaves = Object.keys(row);
  for (const cand of candidatos){
    const achado = chaves.find(k => normalizarTexto(k) === normalizarTexto(cand));
    if (achado) return achado;
  }
  return null;
}

/* =====================================================================
   IMPORTAÇÃO DE PLANILHA (.xlsx / .xls / .csv)
   ===================================================================== */
document.getElementById("input-file-import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split(".").pop().toLowerCase();
  if (!["xlsx", "xls", "csv"].includes(ext)){
    toast("Formato não suportado. Use .xlsx, .xls ou .csv.", "error");
    return;
  }

  try{
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!rows.length){
      toast("A planilha está vazia.", "error");
      return;
    }

    const first = rows[0];
    const colNome = acharColuna(first, ["Presente", "Nome", "Item", "Produto"]);
    const colCategoria = acharColuna(first, ["Categoria", "Comodo", "Cômodo", "Ambiente", "Setor"]);
    const colStatus = acharColuna(first, ["Status", "Escolhido", "Situacao", "Situação"]);
    const colPessoa = acharColuna(first, ["Escolhido por", "Pessoa", "Nome de quem escolheu", "Quem escolheu"]);

    if (!colNome){
      toast('Não foi possível importar a planilha. A coluna "Presente" não foi encontrada.', "error");
      return;
    }

    const parsed = rows
      .map(r => {
        const nome = String(r[colNome] ?? "").trim();
        if (!nome) return null;
        const categoria = colCategoria ? normalizarCategoria(r[colCategoria]) : CATEGORIA_PADRAO;
        const escolhido = colStatus ? normalizarStatus(r[colStatus]) : false;
        const escolhidoPor = (colPessoa ? String(r[colPessoa] ?? "").trim() : "") || null;
        return {
          nome,
          categoria,
          escolhido: escolhido && !!escolhidoPor ? true : escolhido,
          escolhidoPor: escolhido ? (escolhidoPor || "Convidado(a)") : null
        };
      })
      .filter(Boolean);

    if (!parsed.length){
      toast("Nenhum presente válido foi encontrado na planilha.", "error");
      return;
    }

    mostrarPreviaImportacao(parsed);
  }catch(err){
    console.error(err);
    toast("Não foi possível ler o arquivo. Verifique o formato e tente novamente.", "error");
  }finally{
    e.target.value = "";
  }
});

function mostrarPreviaImportacao(parsed){
  importedRows = parsed;

  const porCategoria = {};
  parsed.forEach(p => { porCategoria[p.categoria] = (porCategoria[p.categoria] || 0) + 1; });
  const linhasResumo = CATEGORIAS
    .filter(c => porCategoria[c.key])
    .map(c => `${c.nome}: ${porCategoria[c.key]}`)
    .join("\n");

  document.getElementById("import-summary").textContent =
    `Foram encontrados ${parsed.length} presentes.\n${linhasResumo}`;

  // duplicados (mesmo nome normalizado)
  const contagem = {};
  parsed.forEach(p => {
    const k = normalizarTexto(p.nome);
    contagem[k] = (contagem[k] || 0) + 1;
  });
  const duplicados = Object.entries(contagem).filter(([, n]) => n > 1).map(([k]) => k);
  const dupEl = document.getElementById("import-duplicates");
  if (duplicados.length){
    dupEl.hidden = false;
    dupEl.textContent = `Atenção: ${duplicados.length} nome(s) de presente aparecem repetidos na planilha (${duplicados.slice(0,5).join(", ")}${duplicados.length>5 ? "…" : ""}).`;
  } else {
    dupEl.hidden = true;
  }

  // aviso de preservação de escolhas existentes
  const existemEscolhidos = presentes.some(p => p.escolhido);
  document.getElementById("import-preserve-warning").hidden = !existemEscolhidos;

  const tbody = document.querySelector("#import-table tbody");
  tbody.innerHTML = parsed.map(p => `
    <tr>
      <td>${escapeHTML(p.nome)}</td>
      <td>${escapeHTML(getCategoriaInfo(p.categoria).nome)}</td>
      <td>${p.escolhido ? "Escolhido" : "Disponível"}</td>
      <td>${escapeHTML(p.escolhidoPor || "")}</td>
    </tr>
  `).join("");

  document.getElementById("import-preview").hidden = false;
}

document.getElementById("import-cancel").addEventListener("click", () => {
  importedRows = null;
  document.getElementById("import-preview").hidden = true;
});

document.getElementById("import-confirm").addEventListener("click", async () => {
  if (!importedRows || !isAdmin) return;
  const preservar = document.getElementById("import-preserve").checked;
  showLoading(true);
  try{
    // Estratégia de ID estável: slug do nome + categoria.
    // Assim, reimportar a mesma planilha atualiza os presentes existentes
    // em vez de duplicá-los, e o merge com {merge:true} evita apagar campos.
    const batch = db.batch();
    for (const item of importedRows){
      const id = gerarIdEstavel(item.nome, item.categoria);
      const ref = presentesRef.doc(id);
      const existente = presentes.find(p => p.id === id);

      if (existente && existente.escolhido && preservar){
        // preserva a reserva existente; só atualiza nome/categoria caso mudem
        batch.set(ref, {
          nome: item.nome,
          categoria: item.categoria
        }, { merge: true });
      } else {
        batch.set(ref, {
          nome: item.nome,
          categoria: item.categoria,
          escolhido: !!item.escolhido,
          escolhidoPor: item.escolhido ? item.escolhidoPor : null,
          uidEscolhedor: existente && item.escolhido ? (existente.uidEscolhedor || null) : null,
          dataEscolha: item.escolhido
            ? (existente?.dataEscolha || firebase.firestore.FieldValue.serverTimestamp())
            : null
        }, { merge: true });
      }
    }
    await batch.commit();
    toast(`Importação concluída: ${importedRows.length} presentes.`);
    importedRows = null;
    document.getElementById("import-preview").hidden = true;
  }catch(err){
    console.error(err);
    toast("Erro ao importar a planilha. Verifique suas permissões de administrador.", "error");
  }finally{
    showLoading(false);
  }
});

function gerarIdEstavel(nome, categoria){
  const slug = (s) => normalizarTexto(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${slug(categoria)}--${slug(nome)}`.slice(0, 140);
}

/* =====================================================================
   EXPORTAÇÃO
   ===================================================================== */
function presentesParaExportacao(){
  return presentes.map(p => ({
    Presente: p.nome,
    Categoria: getCategoriaInfo(p.categoria).nome,
    Status: p.escolhido ? "Escolhido" : "Disponível",
    "Escolhido por": p.escolhido ? (p.escolhidoPor || "") : ""
    // e-mail NUNCA incluído
  }));
}

document.getElementById("btn-export-xlsx").addEventListener("click", () => {
  const ws = XLSX.utils.json_to_sheet(presentesParaExportacao());
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Presentes");
  XLSX.writeFile(wb, "lista-presentes.xlsx");
});

document.getElementById("btn-export-csv").addEventListener("click", () => {
  const ws = XLSX.utils.json_to_sheet(presentesParaExportacao());
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "lista-presentes.csv";
  a.click();
  URL.revokeObjectURL(url);
});

/* =====================================================================
   ÁREA ADMINISTRATIVA — abrir/fechar, abas
   ===================================================================== */
function openAdminPanel(){
  if (!isAdmin){
    toast("Esta área é restrita aos administradores.", "error");
    return;
  }
  renderAdminTable();
  document.getElementById("admin-panel").hidden = false;
}
document.getElementById("admin-close").addEventListener("click", () => {
  document.getElementById("admin-panel").hidden = true;
});

document.querySelectorAll(".admin__tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin__tab").forEach(t => t.classList.remove("is-active"));
    document.querySelectorAll(".admin__panel").forEach(p => p.classList.remove("is-active"));
    tab.classList.add("is-active");
    document.querySelector(`[data-admin-panel="${tab.dataset.adminTab}"]`).classList.add("is-active");
    if (tab.dataset.adminTab === "gerenciar") renderAdminTable();
  });
});

function renderAdminTable(){
  const tbody = document.querySelector("#admin-table tbody");
  tbody.innerHTML = presentes.map(p => `
    <tr>
      <td>${escapeHTML(p.nome)}</td>
      <td>${escapeHTML(getCategoriaInfo(p.categoria).nome)}</td>
      <td>${p.escolhido ? "Escolhido" : "Disponível"}</td>
      <td>${escapeHTML(p.escolhido ? (p.escolhidoPor || "") : "")}</td>
      <td class="actions">
        <button class="btn btn--text" data-edit="${p.id}">Editar</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(btn.dataset.edit));
  });
}

document.getElementById("btn-add-presente").addEventListener("click", () => openEditModal(null));

/* =====================================================================
   MODAL: ADICIONAR / EDITAR / REMOVER PRESENTE (admin)
   ===================================================================== */
function fillCategoriaSelect(){
  const select = document.getElementById("edit-categoria");
  select.innerHTML = CATEGORIAS.map(c => `<option value="${c.key}">${c.nome}</option>`).join("");
}
fillCategoriaSelect();

function openEditModal(id){
  editingId = id;
  const isNew = !id;
  const p = isNew ? null : presentes.find(x => x.id === id);

  document.getElementById("modal-edit-title").textContent = isNew ? "Adicionar presente" : "Editar presente";
  document.getElementById("edit-nome").value = p ? p.nome : "";
  document.getElementById("edit-categoria").value = p ? p.categoria : CATEGORIA_PADRAO;
  document.getElementById("edit-status").value = p && p.escolhido ? "escolhido" : "disponivel";
  document.getElementById("edit-por").value = p ? (p.escolhidoPor || "") : "";
  document.getElementById("edit-delete").hidden = isNew;
  toggleEditPorField();

  document.getElementById("modal-edit").hidden = false;
}

document.getElementById("edit-status").addEventListener("change", toggleEditPorField);
function toggleEditPorField(){
  document.getElementById("edit-por-wrap").style.display =
    document.getElementById("edit-status").value === "escolhido" ? "" : "none";
}

document.getElementById("edit-cancel").addEventListener("click", () => {
  document.getElementById("modal-edit").hidden = true;
});

document.getElementById("edit-save").addEventListener("click", async () => {
  if (!isAdmin) return;
  const nome = document.getElementById("edit-nome").value.trim();
  const categoria = document.getElementById("edit-categoria").value;
  const escolhido = document.getElementById("edit-status").value === "escolhido";
  const escolhidoPor = document.getElementById("edit-por").value.trim();

  if (!nome){
    toast("Digite o nome do presente.", "error");
    return;
  }
  if (escolhido && !escolhidoPor){
    toast('Informe o nome de quem escolheu, ou mude o status para "Disponível".', "error");
    return;
  }

  showLoading(true);
  try{
    const id = editingId || gerarIdEstavel(nome, categoria);
    await presentesRef.doc(id).set({
      nome, categoria,
      escolhido,
      escolhidoPor: escolhido ? escolhidoPor : null,
      uidEscolhedor: escolhido ? (presentes.find(p=>p.id===id)?.uidEscolhedor || null) : null,
      dataEscolha: escolhido ? (presentes.find(p=>p.id===id)?.dataEscolha || firebase.firestore.FieldValue.serverTimestamp()) : null
    }, { merge: true });
    toast("Presente salvo com sucesso.");
    document.getElementById("modal-edit").hidden = true;
  }catch(err){
    console.error(err);
    toast("Erro ao salvar. Verifique suas permissões de administrador.", "error");
  }finally{
    showLoading(false);
  }
});

document.getElementById("edit-delete").addEventListener("click", async () => {
  if (!isAdmin || !editingId) return;
  if (!confirm("Remover este presente definitivamente?")) return;
  showLoading(true);
  try{
    await presentesRef.doc(editingId).delete();
    toast("Presente removido.");
    document.getElementById("modal-edit").hidden = true;
  }catch(err){
    console.error(err);
    toast("Erro ao remover presente.", "error");
  }finally{
    showLoading(false);
  }
});
