/*
 * Importador por imagem.
 *
 * Recebe um print / foto de uma tela (a antiga que vai ser reescrita, um
 * protótipo, um desenho) e transforma em campos posicionados na grade de
 * caracteres do CSW.
 *
 * Dois caminhos, que se complementam:
 *   1. OCR local (tesseract.js embarcado em vendor/tesseract) lê os textos com
 *      as coordenadas e propõe os campos automaticamente;
 *   2. traçado manual — você marca o label e a área do leitor com o mouse e a
 *      linha/coluna/tamanho saem exatos da grade.
 *
 * Roda 100% offline: o motor de OCR e o idioma português estão dentro do
 * projeto. Nenhum serviço externo, nenhum custo.
 */
(function (app) {
  if (!app) return;

  const VENDOR = "modulos-padrao-json/vendor/tesseract";

  /* ------------------------------------------------------------------ *
   * Estado
   * ------------------------------------------------------------------ */

  const view = {
    image: null,
    scale: 1,
    words: [],
    rows: [],
    calibration: { columns: 108, lines: 28 },
    pending: null,
    mode: "auto"
  };

  const helpers = () =>
    (app.specImport && app.specImport.helpers) || {
      variableFromDescription: (description, used) => {
        const base = app.utils.normalizeVariable(description, "CAMPO").slice(0, 10);
        let candidate = base;
        let suffix = 2;
        while (used.has(candidate)) candidate = `${base.slice(0, 8)}${suffix++}`;
        used.add(candidate);
        return candidate;
      },
      inferType: () => "",
      inferLookup: () => "",
      defaultSize: () => 20
    };

  /* ------------------------------------------------------------------ *
   * Grade de caracteres
   * ------------------------------------------------------------------ */

  function charWidth() {
    if (!view.image) return 8;
    return view.image.naturalWidth / Math.max(1, view.calibration.columns);
  }

  function lineHeight() {
    if (!view.image) return 16;
    return view.image.naturalHeight / Math.max(1, view.calibration.lines);
  }

  const toColumn = (x) => Math.max(1, Math.round(x / charWidth()) + 1);
  const toLine = (y, height = 0) =>
    Math.max(1, Math.floor((y + height / 2) / lineHeight()) + 1);
  const toSize = (width) => Math.max(1, Math.round(width / charWidth()));

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  // Estima a grade a partir das palavras lidas.
  //
  // Largura do caractere: em tela de terminal as palavras começam sempre em uma
  // coluna inteira, então a distância entre o início de duas palavras vizinhas
  // dividida pelos caracteres entre elas dá o passo exato da grade. Isso é bem
  // mais confiável do que medir a largura do desenho da letra.
  //
  // Altura da linha: a caixa do texto ocupa cerca de 3/4 da célula. O resultado
  // nunca pode passar do menor espaçamento observado entre linhas.
  function calibrateFromWords(words) {
    if (!view.image || words.length < 4) return null;

    const lines = clusterLines(words);
    const advances = [];

    lines.forEach((lineWords) => {
      for (let index = 1; index < lineWords.length; index += 1) {
        const previous = lineWords[index - 1];
        const current = lineWords[index];
        const distance = current.bbox.x0 - previous.bbox.x0;
        const characters = previous.text.length + 1;

        // Só serve quando as palavras estão coladas por um espaço só.
        if (distance <= 0 || characters < 2) continue;
        const advance = distance / characters;
        if (advance > 2 && advance < 60) advances.push(advance);
      }
    });

    const fallbackWidths = words
      .filter((word) => word.text.length >= 4)
      .map((word) => (word.bbox.x1 - word.bbox.x0) / word.text.length)
      .filter((value) => value > 1);

    const estimatedChar = advances.length >= 3 ? median(advances) : median(fallbackWidths);

    const tops = lines.map((lineWords) => lineWords[0].bbox.y0).sort((a, b) => a - b);
    const gaps = [];
    for (let index = 1; index < tops.length; index += 1) {
      const gap = tops[index] - tops[index - 1];
      if (gap > 4) gaps.push(gap);
    }

    const heights = words
      .map((word) => word.bbox.y1 - word.bbox.y0)
      .filter((value) => value > 3);

    const byHeight = median(heights) / 0.72;

    // O menor espaçamento que se repete é a altura real da linha: campos
    // colados um embaixo do outro. Um espaçamento que aparece uma vez só pode
    // ser um pulo de linha proposital.
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const repeated = sortedGaps.find(
      (gap) => sortedGaps.filter((other) => Math.abs(other - gap) <= gap * 0.2).length >= 2
    );

    const estimatedLine = repeated || byHeight || sortedGaps[0] || 0;

    return {
      columns: estimatedChar > 0
        ? Math.max(40, Math.min(240, Math.round(view.image.naturalWidth / estimatedChar)))
        : view.calibration.columns,
      lines: estimatedLine > 0
        ? Math.max(8, Math.min(90, Math.round(view.image.naturalHeight / estimatedLine)))
        : view.calibration.lines
    };
  }

  /* ------------------------------------------------------------------ *
   * OCR
   * ------------------------------------------------------------------ */

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${source}"]`);
      if (existing) {
        if (existing.dataset.loaded === "1") return resolve();
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("falha ao carregar")));
        return;
      }

      const script = document.createElement("script");
      script.src = source;
      script.addEventListener("load", () => {
        script.dataset.loaded = "1";
        resolve();
      });
      script.addEventListener("error", () =>
        reject(new Error(`Não foi possível carregar ${source}`))
      );
      document.head.appendChild(script);
    });
  }

  let workerPromise = null;

  async function tesseractWorker(onProgress) {
    if (workerPromise) return workerPromise;

    workerPromise = (async () => {
      await loadScript(`${VENDOR}/tesseract.min.js`);

      if (!window.Tesseract) {
        throw new Error("A biblioteca de OCR não ficou disponível.");
      }

      return window.Tesseract.createWorker("por", 1, {
        workerPath: `${VENDOR}/worker.min.js`,
        corePath: `${VENDOR}/`,
        langPath: VENDOR,
        gzip: true,
        logger: (message) => onProgress && onProgress(message)
      });
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });

    return workerPromise;
  }

  function flattenWords(data) {
    if (Array.isArray(data.words) && data.words.length) return data.words;

    const result = [];
    (data.blocks || []).forEach((block) =>
      (block.paragraphs || []).forEach((paragraph) =>
        (paragraph.lines || []).forEach((line) =>
          (line.words || []).forEach((word) => result.push(word))
        )
      )
    );
    return result;
  }

  async function runOcr(onProgress) {
    const worker = await tesseractWorker(onProgress);
    const result = await worker.recognize(view.image, {}, { blocks: true, text: true });

    return flattenWords(result.data)
      .filter((word) => String(word.text || "").trim().length > 0)
      .map((word) => ({
        text: String(word.text).trim(),
        confidence: word.confidence,
        bbox: word.bbox
      }));
  }

  /* ------------------------------------------------------------------ *
   * Agrupamento de palavras
   * ------------------------------------------------------------------ */

  function clusterLines(words) {
    const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);
    const lines = [];

    sorted.forEach((word) => {
      const height = word.bbox.y1 - word.bbox.y0;
      const center = (word.bbox.y0 + word.bbox.y1) / 2;
      const line = lines.find((item) => Math.abs(item.center - center) <= height * 0.6);

      if (line) {
        line.words.push(word);
        line.center = (line.center * (line.words.length - 1) + center) / line.words.length;
        return;
      }

      lines.push({ center, words: [word] });
    });

    return lines
      .map((line) => line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0))
      .sort((a, b) => a[0].bbox.y0 - b[0].bbox.y0);
  }

  function groupRuns(lineWords, maxGap) {
    const runs = [];
    let current = null;

    lineWords.forEach((word) => {
      if (current && word.bbox.x0 - current.bbox.x1 <= maxGap) {
        current.words.push(word);
        current.text = `${current.text} ${word.text}`;
        current.bbox = {
          x0: Math.min(current.bbox.x0, word.bbox.x0),
          y0: Math.min(current.bbox.y0, word.bbox.y0),
          x1: Math.max(current.bbox.x1, word.bbox.x1),
          y1: Math.max(current.bbox.y1, word.bbox.y1)
        };
        return;
      }

      current = { text: word.text, bbox: { ...word.bbox }, words: [word] };
      runs.push(current);
    });

    return runs;
  }

  const LABEL_PATTERN = /[A-Za-zÀ-ÿ]{3,}/;
  const NOISE_PATTERN = /^[^A-Za-z0-9À-ÿ]+$/;

  function detectRows() {
    if (!view.words.length) return [];

    const used = new Set();
    const gap = charWidth() * 2.2;
    const rows = [];

    clusterLines(view.words).forEach((lineWords) => {
      // Números soltos e siglas curtas continuam na lista de runs porque
      // costumam ser o valor mostrado ao lado do label — é assim que dá para
      // medir o tamanho do leitor. Eles só não viram campo sozinhos.
      const runs = groupRuns(lineWords, gap).filter((run) => !NOISE_PATTERN.test(run.text));

      runs.forEach((run, index) => {
        const text = run.text.replace(/[:：]\s*$/, "").trim();
        if (!LABEL_PATTERN.test(text)) return;

        const next = runs[index + 1];
        const labelEnd = run.bbox.x1;
        const freeSpace = next ? next.bbox.x0 - labelEnd : view.image.naturalWidth - labelEnd;

        const description = text.replace(/\s{2,}/g, " ");
        const variable = helpers().variableFromDescription(description, used);
        const type = helpers().inferType(description) || "string";

        // Com um valor ao lado dá para medir o espaço real do leitor; sem ele,
        // o tamanho vem do tipo do campo.
        const inputSize = next
          ? Math.max(4, Math.min(60, toSize(freeSpace) - 1))
          : helpers().defaultSize(type, description);

        rows.push({
          id: app.utils.createId(),
          // A primeira linha quase sempre é o título da janela, não um campo.
          include: freeSpace > charWidth() * 3 && toLine(run.bbox.y0, run.bbox.y1 - run.bbox.y0) > 1,
          origin: "ocr",
          description,
          variable,
          type,
          required: false,
          isKey: false,
          labelLine: toLine(run.bbox.y0, run.bbox.y1 - run.bbox.y0),
          labelColumn: toColumn(run.bbox.x0),
          labelSize: Math.max(2, toSize(run.bbox.x1 - run.bbox.x0)),
          inputColumn: toColumn(labelEnd) + 1,
          inputSize,
          lookupPreset: helpers().inferLookup(description) || "none",
          box: { ...run.bbox }
        });
      });
    });

    return rows;
  }

  /* ------------------------------------------------------------------ *
   * Desenho
   * ------------------------------------------------------------------ */

  let canvas = null;
  let context = null;

  function draw() {
    if (!canvas || !context || !view.image) return;

    const maxWidth = canvas.parentElement.clientWidth || 720;
    view.scale = Math.min(1, maxWidth / view.image.naturalWidth);
    canvas.width = view.image.naturalWidth * view.scale;
    canvas.height = view.image.naturalHeight * view.scale;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(view.image, 0, 0, canvas.width, canvas.height);

    // Grade de caracteres
    const cw = charWidth() * view.scale;
    const lh = lineHeight() * view.scale;

    context.strokeStyle = "rgba(37, 99, 235, 0.16)";
    context.lineWidth = 1;
    for (let line = 1; line < view.calibration.lines; line += 1) {
      context.beginPath();
      context.moveTo(0, line * lh);
      context.lineTo(canvas.width, line * lh);
      context.stroke();
    }
    for (let column = 10; column < view.calibration.columns; column += 10) {
      context.beginPath();
      context.moveTo(column * cw, 0);
      context.lineTo(column * cw, canvas.height);
      context.stroke();
    }

    view.rows.forEach((row) => {
      if (!row.include) return;

      const labelX = (row.labelColumn - 1) * cw;
      const labelY = (row.labelLine - 1) * lh;
      context.strokeStyle = "#16a34a";
      context.lineWidth = 2;
      context.strokeRect(labelX, labelY, row.labelSize * cw, lh);

      const inputX = (row.inputColumn - 1) * cw;
      context.strokeStyle = "#2563eb";
      context.strokeRect(inputX, labelY, row.inputSize * cw, lh);
    });

    if (view.pending && view.pending.rect) {
      const { x, y, width, height } = view.pending.rect;
      context.setLineDash([5, 4]);
      context.strokeStyle = view.pending.step === "label" ? "#16a34a" : "#2563eb";
      context.strokeRect(x, y, width, height);
      context.setLineDash([]);
    }
  }

  function textInsideBox(box) {
    const inside = view.words.filter(
      (word) =>
        word.bbox.x0 >= box.x0 - 4 &&
        word.bbox.x1 <= box.x1 + 4 &&
        word.bbox.y0 >= box.y0 - 6 &&
        word.bbox.y1 <= box.y1 + 6
    );

    return inside
      .sort((a, b) => a.bbox.x0 - b.bbox.x0)
      .map((word) => word.text)
      .join(" ")
      .replace(/[:：]\s*$/, "")
      .trim();
  }

  /* ------------------------------------------------------------------ *
   * Interface
   * ------------------------------------------------------------------ */

  const STYLE = `
    .gpj-img-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.5);
      display: flex; align-items: center; justify-content: center; z-index: 85; padding: 20px; }
    .gpj-img-backdrop.hidden { display: none; }
    .gpj-img-card { background: #fff; border-radius: 14px; width: min(1280px, 100%);
      max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 24px 60px rgba(15,23,42,.32); }
    .gpj-img-head { padding: 14px 18px; border-bottom: 1px solid #e5e9f0; display: flex;
      justify-content: space-between; gap: 12px; align-items: flex-start; }
    .gpj-img-head h2 { margin: 0 0 4px; font-size: 17px; }
    .gpj-img-head p { margin: 0; font-size: 12.5px; opacity: .72; max-width: 820px; }
    .gpj-img-body { display: grid; grid-template-columns: 1.15fr 1fr; gap: 14px; padding: 12px 18px; overflow: auto; }
    @media (max-width: 1000px) { .gpj-img-body { grid-template-columns: 1fr; } }
    .gpj-img-stage { border: 1px solid #e5e9f0; border-radius: 10px; padding: 8px; background: #f8fafc; }
    .gpj-img-stage canvas { display: block; max-width: 100%; cursor: crosshair; border-radius: 6px; }
    .gpj-img-drop { border: 2px dashed #cbd5e1; border-radius: 10px; padding: 28px; text-align: center;
      font-size: 13px; opacity: .85; }
    .gpj-img-drop.over { border-color: #2563eb; background: #eff6ff; }
    .gpj-img-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
    .gpj-img-toolbar label { font-size: 12px; display: flex; align-items: center; gap: 5px; }
    .gpj-img-toolbar input[type=number] { width: 68px; padding: 4px 6px; border: 1px solid #d5dbe6; border-radius: 6px; }
    .gpj-img-toolbar button, .gpj-img-foot button, .gpj-img-head button {
      border: 1px solid #d5dbe6; background: #f6f8fb; border-radius: 8px; padding: 7px 12px;
      font-size: 12.5px; cursor: pointer; }
    .gpj-img-toolbar button.active { background: #1e293b; border-color: #1e293b; color: #fff; }
    .gpj-img-hint { font-size: 12px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af;
      border-radius: 8px; padding: 7px 10px; margin-bottom: 8px; }
    .gpj-img-table { border: 1px solid #e5e9f0; border-radius: 10px; overflow: auto; max-height: 52vh; }
    .gpj-img-table table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .gpj-img-table th, .gpj-img-table td { padding: 5px 6px; border-bottom: 1px solid #eef1f6; text-align: left; }
    .gpj-img-table th { position: sticky; top: 0; background: #f8fafc; font-size: 10.5px;
      text-transform: uppercase; letter-spacing: .4px; }
    .gpj-img-table input[type=text] { width: 100%; padding: 3px 5px; border: 1px solid #dbe1ea; border-radius: 5px; font-size: 12px; }
    .gpj-img-table input[type=number] { width: 52px; padding: 3px 4px; border: 1px solid #dbe1ea; border-radius: 5px; font-size: 12px; }
    .gpj-img-table select { padding: 3px 4px; border: 1px solid #dbe1ea; border-radius: 5px; font-size: 12px; }
    .gpj-img-foot { padding: 12px 18px; border-top: 1px solid #e5e9f0; display: flex;
      justify-content: space-between; align-items: center; gap: 10px; }
    .gpj-img-foot .right { display: flex; gap: 8px; }
    .gpj-img-foot button.primary { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 600; }
    .gpj-img-status { font-size: 12.5px; opacity: .78; }
    .gpj-img-progress { height: 6px; background: #e5e9f0; border-radius: 999px; overflow: hidden; margin-top: 6px; }
    .gpj-img-progress span { display: block; height: 100%; width: 0; background: #2563eb; transition: width .2s; }
  `;

  let backdrop = null;
  let statusLabel = null;
  let progressBar = null;
  let tableBox = null;
  let stage = null;

  function injectStyle() {
    if (document.getElementById("gpj-img-style")) return;
    const style = document.createElement("style");
    style.id = "gpj-img-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function setStatus(message, progress = null) {
    if (statusLabel) statusLabel.textContent = message;
    if (progressBar) {
      progressBar.parentElement.style.display = progress === null ? "none" : "block";
      progressBar.style.width = `${Math.round((progress || 0) * 100)}%`;
    }
  }

  const TYPE_OPTIONS = [
    ["integer", "Inteiro"], ["string", "String"], ["textArea", "Área de texto"],
    ["float", "Float"], ["decimal", "Decimal"], ["date", "Data"],
    ["monthYear", "Mês/Ano"], ["combo", "ComboBox"], ["checkbox", "CheckBox"],
    ["radio", "RadioButton"], ["multiSelect", "Multi-Seleção"]
  ];

  function renderTable() {
    if (!tableBox) return;

    if (!view.rows.length) {
      tableBox.innerHTML =
        '<div style="padding:22px;text-align:center;opacity:.65;font-size:12.5px">Nenhum campo ainda. Rode o OCR ou marque os campos com o mouse.</div>';
      return;
    }

    const rows = view.rows
      .map(
        (row, index) => `
        <tr>
          <td><input type="checkbox" data-img-row="${index}" data-img-property="include" ${row.include ? "checked" : ""}></td>
          <td><input type="text" data-img-row="${index}" data-img-property="description" value="${app.utils.escapeHtml(row.description)}"></td>
          <td><input type="text" data-img-row="${index}" data-img-property="variable" value="${app.utils.escapeHtml(row.variable)}" style="width:92px"></td>
          <td><select data-img-row="${index}" data-img-property="type">${TYPE_OPTIONS.map(
            ([value, label]) =>
              `<option value="${value}" ${row.type === value ? "selected" : ""}>${label}</option>`
          ).join("")}</select></td>
          <td><input type="checkbox" data-img-row="${index}" data-img-property="isKey" ${row.isKey ? "checked" : ""}></td>
          <td><input type="checkbox" data-img-row="${index}" data-img-property="required" ${row.required ? "checked" : ""}></td>
          <td><input type="number" min="1" data-img-row="${index}" data-img-property="labelLine" value="${row.labelLine}"></td>
          <td><input type="number" min="1" data-img-row="${index}" data-img-property="labelColumn" value="${row.labelColumn}"></td>
          <td><input type="number" min="1" data-img-row="${index}" data-img-property="inputColumn" value="${row.inputColumn}"></td>
          <td><input type="number" min="1" data-img-row="${index}" data-img-property="inputSize" value="${row.inputSize}"></td>
          <td><button type="button" data-img-remove="${index}" title="Remover">×</button></td>
        </tr>`
      )
      .join("");

    tableBox.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Usar</th><th>Campo</th><th>Variável</th><th>Tipo</th><th>Chave</th><th>Obrig.</th>
            <th>Linha</th><th>Col. label</th><th>Col. leitor</th><th>Tam.</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    tableBox.querySelectorAll("[data-img-row]").forEach((input) => {
      const handler = () => {
        const index = Number(input.dataset.imgRow);
        const property = input.dataset.imgProperty;
        const row = view.rows[index];
        if (!row) return;

        row[property] =
          input.type === "checkbox"
            ? input.checked
            : input.type === "number"
              ? Number(input.value) || 1
              : input.value;

        draw();
      };

      input.addEventListener("change", handler);
      if (input.type === "text" || input.type === "number") {
        input.addEventListener("input", handler);
      }
    });

    tableBox.querySelectorAll("[data-img-remove]").forEach((button) =>
      button.addEventListener("click", () => {
        view.rows.splice(Number(button.dataset.imgRemove), 1);
        renderTable();
        draw();
      })
    );
  }

  async function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", () => reject(new Error("Imagem inválida.")));
      image.src = source;
    });
  }

  async function useFile(file) {
    if (!file) return;

    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", () => reject(new Error("Não foi possível ler o arquivo.")));
      reader.readAsDataURL(file);
    });

    view.image = await loadImage(dataUrl);
    view.words = [];
    view.rows = [];

    stage.querySelector(".gpj-img-drop").style.display = "none";
    canvas.style.display = "block";

    draw();
    renderTable();
    setStatus(
      `Imagem de ${view.image.naturalWidth}x${view.image.naturalHeight}px carregada. Ajuste a grade e rode o OCR, ou marque os campos com o mouse.`
    );
  }

  function bindCanvas() {
    let start = null;

    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    };

    canvas.addEventListener("mousedown", (event) => {
      if (!view.image) return;
      start = point(event);
      view.pending = view.pending || { step: "label" };
      view.pending.rect = { x: start.x, y: start.y, width: 0, height: 0 };
    });

    canvas.addEventListener("mousemove", (event) => {
      if (!start || !view.pending) return;
      const current = point(event);
      view.pending.rect = {
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y)
      };
      draw();
    });

    canvas.addEventListener("mouseup", () => {
      if (!start || !view.pending) return;

      const rect = view.pending.rect;
      start = null;

      if (rect.width < 6 || rect.height < 4) {
        view.pending.rect = null;
        draw();
        return;
      }

      const box = {
        x0: rect.x / view.scale,
        y0: rect.y / view.scale,
        x1: (rect.x + rect.width) / view.scale,
        y1: (rect.y + rect.height) / view.scale
      };

      if (view.pending.step === "label") {
        const description = textInsideBox(box) || `Campo ${view.rows.length + 1}`;
        const used = new Set(view.rows.map((row) => row.variable));

        view.pending.row = {
          id: app.utils.createId(),
          include: true,
          origin: "manual",
          description,
          variable: helpers().variableFromDescription(description, used),
          type: helpers().inferType(description) || "string",
          required: false,
          isKey: false,
          labelLine: toLine(box.y0, box.y1 - box.y0),
          labelColumn: toColumn(box.x0),
          labelSize: Math.max(2, toSize(box.x1 - box.x0)),
          inputColumn: toColumn(box.x1) + 1,
          inputSize: 20,
          lookupPreset: helpers().inferLookup(description) || "none",
          box
        };

        view.pending.step = "input";
        view.pending.rect = null;
        setStatus(`Label "${description}" marcado. Agora marque a área do leitor.`);
        draw();
        return;
      }

      const row = view.pending.row;
      row.inputColumn = toColumn(box.x0);
      row.inputSize = Math.max(2, toSize(box.x1 - box.x0));
      row.labelLine = toLine(box.y0, box.y1 - box.y0) || row.labelLine;

      view.rows.push(row);
      view.pending = { step: "label" };

      renderTable();
      draw();
      setStatus(`Campo "${row.description}" adicionado. Marque o próximo label.`);
    });
  }

  function buildDocument() {
    const rows = view.rows.filter((row) => row.include);
    const routineName = app.utils.normalizeVariable(
      backdrop.querySelector("[data-img-routine]").value,
      "ROTINANOVA"
    );
    const title = backdrop.querySelector("[data-img-title]").value.trim() || "Tela importada";

    return {
      routine: {
        name: routineName,
        title,
        mode: "crud",
        dataVariable: routineName.slice(0, 8),
        useTabs: false,
        useRules: true,
        rgRoutineName: `${routineName}RG`,
        entityName: title,
        globalName: routineName,
        width: view.calibration.columns,
        height: view.calibration.lines
      },
      tabs: [],
      grids: [],
      fields: rows.map((row) => ({
        description: row.description,
        variable: app.utils.normalizeVariable(row.variable, "CAMPO"),
        type: row.type,
        tabId: "parent",
        isKey: row.isKey === true,
        required: row.required === true || row.isKey === true,
        labelColumn: row.labelColumn,
        labelLine: row.labelLine,
        labelSize: row.labelSize,
        inputColumn: row.inputColumn,
        inputLine: row.labelLine,
        inputSize: row.inputSize,
        displayColumn: row.inputColumn + row.inputSize + 2,
        displayLine: row.labelLine,
        displaySize: 30,
        hasDisplay:
          row.lookupPreset !== "none" && !["date", "textArea"].includes(row.type),
        lookupPreset: row.lookupPreset || "none",
        _applyLookupPreset: true
      })),
      indexes: rows
        .filter((row) => row.isKey)
        .map((row) => ({
          type: "key",
          fieldId: app.utils.normalizeVariable(row.variable, "CAMPO"),
          parameterName: app.utils.toParameter(row.description)
        }))
    };
  }

  function appendToProject() {
    const rows = view.rows.filter((row) => row.include);
    if (!rows.length) {
      app.utils.showToast("Nenhum campo marcado.");
      return;
    }

    rows.forEach((row) => {
      const field = app.fields.createField({
        description: row.description,
        variable: app.utils.normalizeVariable(row.variable, "CAMPO"),
        type: row.type,
        tabId: "parent",
        isKey: row.isKey === true,
        required: row.required === true,
        labelColumn: row.labelColumn,
        labelLine: row.labelLine,
        labelSize: row.labelSize,
        inputColumn: row.inputColumn,
        inputLine: row.labelLine,
        inputSize: row.inputSize,
        displayColumn: row.inputColumn + row.inputSize + 2,
        displayLine: row.labelLine,
        displaySize: 30
      });

      if (row.lookupPreset && row.lookupPreset !== "none") {
        app.fieldLookups.applyPresetToField(field, row.lookupPreset);
      }

      app.state.fields.push(field);
    });

    app.fields.render();
    app.indexes.render();
    app.refresh();
    close();
    app.utils.showToast(`${rows.length} campo(s) adicionados ao projeto atual.`);
  }

  function open() {
    injectStyle();

    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "gpj-img-backdrop hidden";
      backdrop.innerHTML = `
        <div class="gpj-img-card">
          <div class="gpj-img-head">
            <div>
              <h2>Gerar campos por imagem</h2>
              <p>Cole (Ctrl+V), arraste ou escolha um print da tela. O OCR roda dentro do navegador, com o motor e o idioma português embarcados no projeto — sem internet e sem custo. Depois é só conferir a grade e gerar.</p>
            </div>
            <button type="button" data-img-close>Fechar</button>
          </div>

          <div class="gpj-img-body">
            <div>
              <div class="gpj-img-toolbar">
                <button type="button" data-img-pick>Escolher imagem</button>
                <button type="button" data-img-ocr>Ler com OCR</button>
                <button type="button" data-img-detect>Detectar campos</button>
                <button type="button" data-img-clear>Limpar campos</button>
                <label>Colunas <input type="number" min="20" max="240" data-img-columns value="108"></label>
                <label>Linhas <input type="number" min="8" max="80" data-img-lines value="28"></label>
                <button type="button" data-img-calibrate>Calibrar pelo texto</button>
              </div>
              <div class="gpj-img-hint">
                Traçado manual: arraste sobre o <strong>texto do label</strong> e depois sobre a
                <strong>área do leitor</strong>. Cada par vira um campo com linha, coluna e tamanho exatos da grade.
              </div>
              <div class="gpj-img-stage">
                <div class="gpj-img-drop">Arraste o print aqui, cole com Ctrl+V ou clique em "Escolher imagem"</div>
                <canvas style="display:none"></canvas>
              </div>
            </div>

            <div>
              <div class="gpj-img-table"></div>
              <div class="gpj-img-toolbar" style="margin-top:10px">
                <label>Rotina <input type="text" data-img-routine value="ROTINANOVA" style="width:120px;padding:4px 6px;border:1px solid #d5dbe6;border-radius:6px"></label>
                <label>Título <input type="text" data-img-title value="Tela importada" style="width:180px;padding:4px 6px;border:1px solid #d5dbe6;border-radius:6px"></label>
              </div>
            </div>
          </div>

          <div class="gpj-img-foot">
            <div style="flex:1">
              <div class="gpj-img-status">Nenhuma imagem carregada.</div>
              <div class="gpj-img-progress" style="display:none"><span></span></div>
            </div>
            <div class="right">
              <button type="button" data-img-json>Copiar JSON</button>
              <button type="button" data-img-append>Adicionar ao projeto atual</button>
              <button type="button" class="primary" data-img-apply>Gerar projeto novo</button>
            </div>
          </div>

          <input type="file" accept="image/*" data-img-file style="display:none">
        </div>`;
      document.body.appendChild(backdrop);

      stage = backdrop.querySelector(".gpj-img-stage");
      canvas = stage.querySelector("canvas");
      context = canvas.getContext("2d");
      tableBox = backdrop.querySelector(".gpj-img-table");
      statusLabel = backdrop.querySelector(".gpj-img-status");
      progressBar = backdrop.querySelector(".gpj-img-progress span");

      const fileInput = backdrop.querySelector("[data-img-file]");

      backdrop.querySelectorAll("[data-img-close]").forEach((button) =>
        button.addEventListener("click", close)
      );
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) close();
      });

      backdrop.querySelector("[data-img-pick]").addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        await useFile(fileInput.files?.[0]);
        fileInput.value = "";
      });

      const drop = stage;
      ["dragenter", "dragover"].forEach((type) =>
        drop.addEventListener(type, (event) => {
          event.preventDefault();
          drop.querySelector(".gpj-img-drop")?.classList.add("over");
        })
      );
      ["dragleave", "drop"].forEach((type) =>
        drop.addEventListener(type, (event) => {
          event.preventDefault();
          drop.querySelector(".gpj-img-drop")?.classList.remove("over");
        })
      );
      drop.addEventListener("drop", async (event) => {
        const file = [...(event.dataTransfer?.files || [])].find((item) =>
          item.type.startsWith("image/")
        );
        if (file) await useFile(file);
      });

      backdrop.querySelector("[data-img-ocr]").addEventListener("click", async () => {
        if (!view.image) {
          setStatus("Carregue uma imagem primeiro.");
          return;
        }

        try {
          setStatus("Preparando o motor de OCR…", 0.02);
          view.words = await runOcr((message) => {
            if (message.status && typeof message.progress === "number") {
              setStatus(`OCR: ${message.status}`, message.progress);
            }
          });

          const calibration = calibrateFromWords(view.words);
          if (calibration) {
            view.calibration = calibration;
            backdrop.querySelector("[data-img-columns]").value = calibration.columns;
            backdrop.querySelector("[data-img-lines]").value = calibration.lines;
          }

          view.rows = detectRows();
          renderTable();
          draw();
          setStatus(
            `${view.words.length} palavra(s) lidas, ${view.rows.length} campo(s) propostos. Confira a grade e a lista ao lado.`
          );
        } catch (error) {
          setStatus(
            `OCR indisponível (${error.message}). O traçado manual continua funcionando normalmente.`
          );
        }
      });

      backdrop.querySelector("[data-img-detect]").addEventListener("click", () => {
        if (!view.words.length) {
          setStatus("Rode o OCR antes de detectar os campos.");
          return;
        }
        view.rows = detectRows();
        renderTable();
        draw();
        setStatus(`${view.rows.length} campo(s) propostos com a grade atual.`);
      });

      backdrop.querySelector("[data-img-clear]").addEventListener("click", () => {
        view.rows = [];
        view.pending = { step: "label" };
        renderTable();
        draw();
        setStatus("Lista de campos limpa.");
      });

      backdrop.querySelector("[data-img-calibrate]").addEventListener("click", () => {
        const calibration = calibrateFromWords(view.words);
        if (!calibration) {
          setStatus("Rode o OCR antes de calibrar pelo texto.");
          return;
        }
        view.calibration = calibration;
        backdrop.querySelector("[data-img-columns]").value = calibration.columns;
        backdrop.querySelector("[data-img-lines]").value = calibration.lines;
        draw();
        setStatus(`Grade estimada em ${calibration.columns} colunas por ${calibration.lines} linhas.`);
      });

      ["[data-img-columns]", "[data-img-lines]"].forEach((selector) => {
        backdrop.querySelector(selector).addEventListener("input", (event) => {
          const value = Number(event.target.value) || 1;
          if (selector.includes("columns")) view.calibration.columns = value;
          else view.calibration.lines = value;
          draw();
        });
      });

      backdrop.querySelector("[data-img-json]").addEventListener("click", () =>
        app.utils.copyText(JSON.stringify(buildDocument(), null, 2), "JSON da tela copiado.")
      );

      backdrop.querySelector("[data-img-append]").addEventListener("click", appendToProject);

      backdrop.querySelector("[data-img-apply]").addEventListener("click", () => {
        const document_ = buildDocument();
        if (!document_.fields.length) {
          app.utils.showToast("Nenhum campo marcado.");
          return;
        }
        app.projectIO.loadDocument(document_);
        close();
        app.utils.showToast(`Projeto gerado com ${document_.fields.length} campo(s).`);
      });

      bindCanvas();

      document.addEventListener("paste", async (event) => {
        if (!backdrop || backdrop.classList.contains("hidden")) return;
        const item = [...(event.clipboardData?.items || [])].find((entry) =>
          entry.type.startsWith("image/")
        );
        if (!item) return;
        event.preventDefault();
        await useFile(item.getAsFile());
      });
    }

    view.pending = { step: "label" };
    backdrop.classList.remove("hidden");
    renderTable();
    draw();
  }

  function close() {
    backdrop?.classList.add("hidden");
  }

  function install() {
    const anchor = document.getElementById("labPasteJsonButton");
    if (!anchor || document.getElementById("gpjImageImportButton")) return;

    const button = document.createElement("button");
    button.id = "gpjImageImportButton";
    button.type = "button";
    button.className = anchor.className;
    button.textContent = "Gerar por imagem";
    button.title = "Transforma um print de tela em campos posicionados";
    button.addEventListener("click", open);
    anchor.parentElement.insertBefore(button, anchor);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && backdrop && !backdrop.classList.contains("hidden")) {
        close();
      }
    });
  }

  app.imageImport = {
    open,
    close,
    install,
    detectRows,
    calibrateFromWords,
    clusterLines,
    groupRuns,
    view
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})(window.GeradorRotinasJsonPadrao);
