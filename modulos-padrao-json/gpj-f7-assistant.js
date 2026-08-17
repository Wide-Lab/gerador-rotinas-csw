/*
 * Assistente de F7.
 *
 * 1. Busca dentro do catálogo de consultas F7 (hoje são centenas de opções em
 *    um <select> comum, impossível de percorrer no olho).
 * 2. Sugestão automática de F7 a partir da descrição / variável do campo,
 *    usando um dicionário do domínio CSW + similaridade de palavras.
 * 3. Aplicação em lote: analisa todos os campos sem F7 e mostra uma tela com a
 *    sugestão de cada um para o usuário confirmar.
 *
 * Tudo local, sem nenhuma chamada externa.
 */
(function (app) {
  if (!app) return;

  const STOP_WORDS = new Set([
    "de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "no", "na",
    "nos", "nas", "para", "por", "com", "em", "um", "uma", "cod", "codigo",
    "num", "numero", "desc", "descricao", "campo", "tipo"
  ]);

  // Palavras fortes do domínio -> preset preferido. Os presets "ricos"
  // (com Valcp e display prontos) ganham prioridade sobre o catálogo cru.
  const DOMAIN_MAP = [
    [/\bempresa|filial\b/, "empresa", 12],
    [/\bcliente|clientes|destinatario\b/, "cliente", 12],
    [/\bproduto|produtos|item|itens|mercadoria\b/, "produto", 11],
    [/\bmoeda|cambio|unidade monetaria\b/, "moeda", 11],
    [/\btransportador|transportadora|frete\b/, "transportadora", 10],
    [/\brepresentante|vendedor\b/, "representante", 11],
    [/\bcondicao de venda|condicao venda|cond venda\b/, "condicaoVenda", 12],
    [/\btabela de preco|tabela preco|tabpreco\b/, "tabelaPreco", 12],
    [/\btipo de nota|tipo nota|tipnot\b/, "tipoNota", 11],
    [/\bnatureza\b/, "ccpv299:esanat", 8],
    [/\bestado|\buf\b/, "ccpv299:estado", 8],
    [/\bcor|cores\b/, "ccpv299:cores", 7],
    [/\bembalagem\b/, "ccpv299:prtb5", 8],
    [/\bsituacao do pedido|situacao pedido\b/, "ccpv299:pvtb1", 9],
    [/\bgrupo\b/, "ccpv299:sutb", 7],
    [/\bramo de atividade|ramo atividade\b/, "ccpv299:ftra", 9],
    [/\bportador|banco\b/, "ccpv299:pctcsba", 8],
    [/\btipo de frete|tipo frete\b/, "ccpv299:fttb", 9],
    [/\boperacao\b/, "ccpv299:operac", 7],
    [/\blote|lotes\b/, "ccpv299:pvlt", 7],
    [/\bgramatura\b/, "ccpv299:pvtb5", 8],
    [/\bformato\b/, "ccpv299:pvtb4", 8],
    [/\bdiametro\b/, "ccpv299:pvtb2", 8],
    [/\brevestimento\b/, "ccpv299:pvtb22", 8],
    [/\blaca\b/, "ccpv299:pvtb23", 8],
    [/\bsetor\b/, "ccpv299:pvtb18", 8],
    [/\borigem da mercadoria|origem mercadoria\b/, "ccpv299:orimer", 9],
    [/\bpedido|pedidos\b/, "ccpv299:selped", 6],
    [/\borcamento\b/, "ccpv299:orcame", 8],
    [/\bunidade\b/, "ccpv299:cgiund", 7],
    [/\bindice\b/, "ccpv299:ftin", 7],
    [/\bclassificacao\b/, "ccpv299:ftclas", 8],
    [/\bocorrencia\b/, "ccpv299:pvtb59", 7],
    [/\bmotivo de cancelamento|motivo cancelamento\b/, "ccpv299:pvtb30", 9],
    [/\bsim.?nao|sim ou nao\b/, "ccpv299:simnao", 9],
    [/\boperador|digitador\b/, "ccpv299:digita", 8]
  ];

  const removeAccents = (value) =>
    String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

  const flat = (value) =>
    removeAccents(value)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .toLowerCase();

  const tokens = (value) =>
    flat(value).split(/\s+/).filter((word) => word.length > 1 && !STOP_WORDS.has(word));

  function candidateText(key, preset) {
    // O label do catálogo termina em "— ROTINA^ROTINA299"; a parte útil é a
    // descrição, mas o nome da rotina também serve para busca direta.
    const label = String(preset.label || "");
    const description = label.split("—")[0] || label;
    return {
      key,
      preset,
      label,
      description: description.trim(),
      routine: String(preset.f7Routine || ""),
      tokens: tokens(description),
      searchText: flat(`${label} ${preset.f7Routine || ""} ${key}`)
    };
  }

  function candidates() {
    const presets = app.fieldLookups.presets();
    return Object.entries(presets)
      .filter(([key]) => key !== "none" && key !== "custom")
      .map(([key, preset]) => candidateText(key, preset));
  }

  let cachedCandidates = null;
  function allCandidates() {
    if (!cachedCandidates) cachedCandidates = candidates();
    return cachedCandidates;
  }

  function similarity(fieldTokens, candidate) {
    if (!fieldTokens.length || !candidate.tokens.length) return 0;

    let score = 0;
    fieldTokens.forEach((word) => {
      const exact = candidate.tokens.includes(word);
      if (exact) {
        score += 4;
        return;
      }

      const prefix = candidate.tokens.some(
        (other) =>
          (word.length >= 4 && other.startsWith(word.slice(0, 4))) ||
          (other.length >= 4 && word.startsWith(other.slice(0, 4)))
      );
      if (prefix) score += 2;
    });

    // Penaliza candidatos com muitas palavras, senão descrições enormes
    // vencem só por terem mais chance de conter a palavra.
    return score / (1 + candidate.tokens.length * 0.12);
  }

  function suggest(field, limit = 5) {
    const text = `${field?.description || ""} ${field?.variable || ""}`;
    const fieldTokens = tokens(text);
    const flatText = flat(text);
    const bonus = new Map();

    DOMAIN_MAP.forEach(([pattern, key, weight]) => {
      if (pattern.test(flatText)) {
        bonus.set(key, Math.max(bonus.get(key) || 0, weight));
      }
    });

    const scored = allCandidates()
      .map((candidate) => ({
        candidate,
        score: similarity(fieldTokens, candidate) + (bonus.get(candidate.key) || 0)
      }))
      .filter((item) => item.score > 2.5)
      .sort((a, b) => b.score - a.score);

    const seen = new Set();
    const result = [];

    scored.forEach((item) => {
      const routine = item.candidate.routine || item.candidate.key;
      if (seen.has(routine)) return;
      seen.add(routine);
      if (result.length < limit) result.push(item);
    });

    return result;
  }

  function confidenceLabel(score) {
    if (score >= 10) return "alta";
    if (score >= 6) return "média";
    return "baixa";
  }

  /* ------------------------------------------------------------------ *
   * Busca dentro do modal de F7
   * ------------------------------------------------------------------ */

  const STYLE = `
    .gpj-f7-search { margin-bottom: 8px; }
    .gpj-f7-search input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid #d5dbe6;
      border-radius: 8px;
      font-size: 13px;
    }
    .gpj-f7-search-count { font-size: 11.5px; opacity: 0.7; margin-top: 4px; display: block; }
    .gpj-f7-suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 2px; }
    .gpj-f7-chip {
      border: 1px solid #c7d2fe;
      background: #eef2ff;
      color: #3730a3;
      border-radius: 999px;
      padding: 5px 12px;
      font-size: 12px;
      cursor: pointer;
      line-height: 1.3;
    }
    .gpj-f7-chip:hover { background: #e0e7ff; }
    .gpj-f7-chip small { opacity: 0.7; margin-left: 6px; }
    .gpj-f7-suggestions-title {
      font-size: 11.5px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      opacity: 0.65;
      margin-top: 8px;
    }
    .gpj-bulk-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 80;
      padding: 24px;
    }
    .gpj-bulk-backdrop.hidden { display: none; }
    .gpj-bulk-card {
      background: #fff;
      border-radius: 14px;
      width: min(900px, 100%);
      max-height: 84vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3);
    }
    .gpj-bulk-head {
      padding: 16px 18px;
      border-bottom: 1px solid #e5e9f0;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }
    .gpj-bulk-head h2 { margin: 0 0 4px; font-size: 17px; }
    .gpj-bulk-head p { margin: 0; font-size: 12.5px; opacity: 0.72; }
    .gpj-bulk-body { padding: 12px 18px; overflow: auto; }
    .gpj-bulk-body table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .gpj-bulk-body th, .gpj-bulk-body td {
      text-align: left;
      padding: 7px 8px;
      border-bottom: 1px solid #eef1f6;
      vertical-align: middle;
    }
    .gpj-bulk-body th { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.4px; opacity: 0.65; }
    .gpj-bulk-body select { width: 100%; padding: 5px 6px; border: 1px solid #d5dbe6; border-radius: 6px; font-size: 12.5px; }
    .gpj-bulk-confidence { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #f1f5f9; }
    .gpj-bulk-confidence.alta { background: #dcfce7; color: #166534; }
    .gpj-bulk-confidence.media { background: #fef9c3; color: #854d0e; }
    .gpj-bulk-confidence.baixa { background: #f1f5f9; color: #475569; }
    .gpj-bulk-foot {
      padding: 12px 18px;
      border-top: 1px solid #e5e9f0;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .gpj-bulk-foot button, .gpj-bulk-head button {
      border: 1px solid #d5dbe6;
      background: #f6f8fb;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 13px;
      cursor: pointer;
    }
    .gpj-bulk-foot button.primary { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 600; }
    .gpj-bulk-empty { padding: 28px; text-align: center; opacity: 0.7; font-size: 13.5px; }
  `;

  function injectStyle() {
    if (document.getElementById("gpj-f7-assistant-style")) return;
    const style = document.createElement("style");
    style.id = "gpj-f7-assistant-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  let activeFieldId = "";

  function currentField() {
    return app.state.fields.find((field) => field.id === activeFieldId);
  }

  function optionsFor(filterText, selectedKey) {
    const presets = app.fieldLookups.presets();
    const needle = flat(filterText);
    const groups = new Map();

    Object.entries(presets).forEach(([key, preset]) => {
      const searchText = flat(`${preset.label} ${preset.f7Routine || ""} ${key}`);
      const matches =
        !needle ||
        key === selectedKey ||
        needle.split(/\s+/).every((word) => searchText.includes(word));

      if (!matches) return;

      const group = preset.group || "Outros";
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push([key, preset]);
    });

    let total = 0;
    const html = Array.from(groups.entries())
      .map(([group, items]) => {
        total += items.length;
        const options = items
          .sort((a, b) => a[1].label.localeCompare(b[1].label, "pt-BR"))
          .map(
            ([key, preset]) =>
              `<option value="${app.utils.escapeHtml(key)}" ${key === selectedKey ? "selected" : ""}>${app.utils.escapeHtml(preset.label)}</option>`
          )
          .join("");
        return `<optgroup label="${app.utils.escapeHtml(group)}">${options}</optgroup>`;
      })
      .join("");

    return { html, total };
  }

  let searchBox = null;
  let searchCount = null;
  let suggestionBox = null;

  function buildModalExtras() {
    const select = app.el.fieldLookupPreset;
    if (!select || searchBox) return;

    injectStyle();

    const wrapper = document.createElement("div");
    wrapper.className = "gpj-f7-search";
    wrapper.innerHTML = `
      <input type="search" placeholder="Buscar consulta F7 por descrição ou rotina (ex.: cliente, PVTB, %CSTN)" autocomplete="off">
      <span class="gpj-f7-search-count"></span>
    `;

    searchBox = wrapper.querySelector("input");
    searchCount = wrapper.querySelector(".gpj-f7-search-count");

    suggestionBox = document.createElement("div");
    suggestionBox.className = "gpj-f7-suggestions";

    const title = document.createElement("div");
    title.className = "gpj-f7-suggestions-title";
    title.textContent = "Sugestões para este campo";

    const container = select.closest(".field") || select.parentElement;
    container.insertBefore(wrapper, container.firstChild);
    container.appendChild(title);
    container.appendChild(suggestionBox);

    searchBox.addEventListener("input", () => {
      const selected = select.value;
      const { html, total } = optionsFor(searchBox.value, selected);
      select.innerHTML = html;
      select.value = selected;
      searchCount.textContent = searchBox.value.trim()
        ? `${total} consulta${total === 1 ? "" : "s"} encontrada${total === 1 ? "" : "s"}`
        : "";
    });

    searchBox.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const first = select.querySelector("option");
      if (first) {
        select.value = first.value;
        app.el.applyFieldLookupPresetButton?.click();
      }
    });
  }

  function renderSuggestions() {
    if (!suggestionBox) return;

    const field = currentField();
    suggestionBox.innerHTML = "";

    if (!field) return;

    const items = suggest(field, 5);

    if (!items.length) {
      const empty = document.createElement("span");
      empty.className = "gpj-f7-search-count";
      empty.textContent = "Nenhuma consulta parecida com o nome deste campo.";
      suggestionBox.appendChild(empty);
      return;
    }

    items.forEach(({ candidate, score }) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "gpj-f7-chip";
      chip.innerHTML = `${app.utils.escapeHtml(candidate.description)}<small>${app.utils.escapeHtml(candidate.routine || "preset")} · ${confidenceLabel(score)}</small>`;
      chip.addEventListener("click", () => {
        app.el.fieldLookupPreset.value = candidate.key;
        if (!app.el.fieldLookupPreset.value) {
          // A opção pode estar filtrada pela busca; recarrega a lista completa.
          const { html } = optionsFor("", candidate.key);
          app.el.fieldLookupPreset.innerHTML = html;
          app.el.fieldLookupPreset.value = candidate.key;
          if (searchBox) searchBox.value = "";
          if (searchCount) searchCount.textContent = "";
        }
        app.el.applyFieldLookupPresetButton?.click();
      });
      suggestionBox.appendChild(chip);
    });
  }

  /* ------------------------------------------------------------------ *
   * Aplicação em lote
   * ------------------------------------------------------------------ */

  let bulkBackdrop = null;

  function closeBulk() {
    bulkBackdrop?.classList.add("hidden");
  }

  function openBulk() {
    injectStyle();

    if (!bulkBackdrop) {
      bulkBackdrop = document.createElement("div");
      bulkBackdrop.className = "gpj-bulk-backdrop hidden";
      bulkBackdrop.addEventListener("click", (event) => {
        if (event.target === bulkBackdrop) closeBulk();
      });
      document.body.appendChild(bulkBackdrop);
    }

    const pending = app.state.fields
      .filter((field) => {
        const preset = String(field.lookupPreset || "none");
        // Multi-seleção fica de fora: ela depende da rotina 299 própria e de
        // globais que só quem está montando a tela sabe informar.
        if (app.fields.isMultiSelect(field)) return false;
        return preset === "none" && !String(field.f7Routine || "").trim();
      })
      .map((field) => ({ field, options: suggest(field, 4) }))
      // No lote só entra sugestão de confiança média para cima; palpite fraco
      // atrapalha mais do que ajuda.
      .filter((item) => item.options.length && item.options[0].score >= 6);

    const rows = pending
      .map(({ field, options }, index) => {
        const best = options[0];
        const selectOptions = options
          .map(
            ({ candidate, score }, position) =>
              `<option value="${app.utils.escapeHtml(candidate.key)}" ${position === 0 ? "selected" : ""}>${app.utils.escapeHtml(candidate.description)} — ${app.utils.escapeHtml(candidate.routine || "preset")}</option>`
          )
          .join("");
        const confidence = confidenceLabel(best.score);

        return `
          <tr>
            <td style="width:34px"><input type="checkbox" data-bulk-index="${index}" ${confidence !== "baixa" ? "checked" : ""}></td>
            <td><strong>${app.utils.escapeHtml(field.description)}</strong><br><span style="opacity:.6;font-size:11.5px">${app.utils.escapeHtml(field.variable)}</span></td>
            <td><select data-bulk-select="${index}">${selectOptions}</select></td>
            <td style="width:90px"><span class="gpj-bulk-confidence ${confidence === "média" ? "media" : confidence}">${confidence}</span></td>
          </tr>`;
      })
      .join("");

    bulkBackdrop.innerHTML = `
      <div class="gpj-bulk-card">
        <div class="gpj-bulk-head">
          <div>
            <h2>Sugestão automática de F7</h2>
            <p>Analisa a descrição e a variável de cada campo sem F7 e propõe a consulta do catálogo. Nada é aplicado sem confirmação.</p>
          </div>
          <button type="button" data-bulk-close>Fechar</button>
        </div>
        <div class="gpj-bulk-body">
          ${
            pending.length
              ? `<table>
                  <thead><tr><th></th><th>Campo</th><th>Consulta sugerida</th><th>Confiança</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>`
              : `<div class="gpj-bulk-empty">Nenhum campo sem F7 se parece com uma consulta do catálogo.</div>`
          }
        </div>
        <div class="gpj-bulk-foot">
          <button type="button" data-bulk-close>Cancelar</button>
          <button type="button" class="primary" data-bulk-apply ${pending.length ? "" : "disabled"}>Aplicar selecionados</button>
        </div>
      </div>
    `;

    bulkBackdrop.querySelectorAll("[data-bulk-close]").forEach((button) =>
      button.addEventListener("click", closeBulk)
    );

    bulkBackdrop.querySelector("[data-bulk-apply]")?.addEventListener("click", () => {
      let applied = 0;

      pending.forEach(({ field }, index) => {
        const checkbox = bulkBackdrop.querySelector(`[data-bulk-index="${index}"]`);
        if (!checkbox?.checked) return;

        const select = bulkBackdrop.querySelector(`[data-bulk-select="${index}"]`);
        const key = select?.value;
        if (!key) return;

        app.fieldLookups.applyPresetToField(field, key);
        applied += 1;
      });

      closeBulk();
      app.fields.render();
      app.refresh();
      app.utils.showToast(
        applied
          ? `${applied} campo${applied > 1 ? "s" : ""} com F7 aplicado.`
          : "Nenhum campo alterado."
      );
    });

    bulkBackdrop.classList.remove("hidden");
  }

  /* ------------------------------------------------------------------ *
   * Instalação
   * ------------------------------------------------------------------ */

  function install() {
    if (!app.el || !app.el.fieldLookupPreset) return;

    injectStyle();

    const originalOpen = app.fieldLookups.open;
    app.fieldLookups.open = function (position) {
      activeFieldId = app.state.fields[position]?.id || "";
      const result = originalOpen.apply(this, arguments);
      buildModalExtras();
      if (searchBox) {
        searchBox.value = "";
        if (searchCount) searchCount.textContent = "";
      }
      renderSuggestions();
      return result;
    };

    const addFieldButton = app.el.addFieldButton;
    if (addFieldButton && !document.getElementById("gpjSuggestF7Button")) {
      const button = document.createElement("button");
      button.id = "gpjSuggestF7Button";
      button.type = "button";
      button.className = addFieldButton.className.replace("primary", "").trim() || "button";
      button.textContent = "Sugerir F7";
      button.title = "Analisa os campos sem F7 e sugere consultas do catálogo";
      button.addEventListener("click", openBulk);
      addFieldButton.parentElement.insertBefore(button, addFieldButton);
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && bulkBackdrop && !bulkBackdrop.classList.contains("hidden")) {
        closeBulk();
      }
    });
  }

  app.f7Assistant = { suggest, openBulk, install, tokens };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})(window.GeradorRotinasJsonPadrao);
