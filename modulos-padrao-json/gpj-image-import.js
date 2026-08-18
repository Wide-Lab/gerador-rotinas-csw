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
    table: null,
    grid: null,
    tabs: [],
    buttons: [],
    origin: { x: 0, y: 0 },
    calibration: { columns: 108, lines: 28 },
    pending: null,
    mode: "campo"
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

  const toColumn = (x) =>
    Math.max(1, Math.round((x - (view.origin?.x || 0)) / charWidth()) + 1);
  const toLine = (y, height = 0) =>
    Math.max(
      1,
      Math.floor((y + height / 2 - (view.origin?.y || 0)) / lineHeight()) + 1
    );
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
        const space = current.bbox.x0 - previous.bbox.x1;
        const roughChar = (previous.bbox.x1 - previous.bbox.x0) / Math.max(1, previous.text.length);

        // Só serve quando as palavras estão coladas por um espaço só. Colunas
        // de tabela ficam longe umas das outras e falseariam a medida.
        if (distance <= 0 || characters < 2) continue;
        if (space < 0 || space > roughChar * 2.5) continue;

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
    // Uma linha não pode ser mais baixa que o próprio texto: o OCR às vezes
    // quebra uma linha em duas e o menor espaçamento vira ruído.
    const floor = median(heights) * 1.05;
    const repeated = sortedGaps.find(
      (gap) =>
        gap >= floor &&
        sortedGaps.filter((other) => Math.abs(other - gap) <= gap * 0.2).length >= 2
    );

    const estimatedLine = repeated || byHeight || sortedGaps[0] || 0;

    const estimatedColumns =
      estimatedChar > 0
        ? Math.round(view.image.naturalWidth / estimatedChar)
        : view.calibration.columns;

    return {
      // Acima de 160 é print de tela web com fonte pequena; a janela CSW usa
      // 108 colunas e as posições continuam proporcionais.
      columns: estimatedColumns > 160 ? 108 : Math.max(40, estimatedColumns),
      lines: estimatedLine > 0
        ? Math.max(8, Math.min(60, Math.round(view.image.naturalHeight / estimatedLine)))
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

  // Recorta uma faixa escura, inverte e amplia: texto claro sobre fundo
  // escuro só é lido assim.
  function croppedInverted(band, scale = 4) {
    const margin = 6;
    const width = Math.max(1, Math.round(band.x1 - band.x0));
    const height = Math.max(1, Math.round(band.y1 - band.y0));

    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    const sourceCtx = source.getContext("2d");
    sourceCtx.drawImage(
      view.image,
      Math.round(band.x0),
      Math.round(band.y0),
      width,
      height,
      0,
      0,
      width,
      height
    );

    // Só inverte. Binarizar destrói os glifos finos do botão.
    const pixels = sourceCtx.getImageData(0, 0, width, height);
    for (let position = 0; position < pixels.data.length; position += 4) {
      pixels.data[position] = 255 - pixels.data[position];
      pixels.data[position + 1] = 255 - pixels.data[position + 1];
      pixels.data[position + 2] = 255 - pixels.data[position + 2];
    }
    sourceCtx.putImageData(pixels, 0, 0);

    const target = document.createElement("canvas");
    target.width = width * scale + margin * 2;
    target.height = height * scale + margin * 2;

    const ctx = target.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, margin, margin, width * scale, height * scale);

    return target;
  }

  function normalizeWords(data, extra = {}) {
    return flattenWords(data)
      .filter((word) => String(word.text || "").trim().length > 0)
      .map((word) => ({
        text: String(word.text).trim(),
        confidence: word.confidence,
        bbox: word.bbox,
        ...extra
      }));
  }

  // Print de tela cheia costuma vir com fonte de 11px. Ampliar antes de ler
  // melhora muito o reconhecimento; as coordenadas voltam divididas.
  function scaledCanvas(scale) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(view.image.naturalWidth * scale);
    canvas.height = Math.round(view.image.naturalHeight * scale);

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(view.image, 0, 0, canvas.width, canvas.height);

    return canvas;
  }

  async function runOcr(onProgress) {
    const worker = await tesseractWorker(onProgress);

    const scale = view.image.naturalWidth >= 1200 ? 2 : 1;
    const target = scale > 1 ? scaledCanvas(scale) : view.image;

    const result = await worker.recognize(target, {}, { blocks: true, text: true });
    const words = normalizeWords(result.data).map((word) =>
      scale === 1
        ? word
        : {
            ...word,
            bbox: {
              x0: word.bbox.x0 / scale,
              y0: word.bbox.y0 / scale,
              x1: word.bbox.x1 / scale,
              y1: word.bbox.y1 / scale
            }
          }
    );

    const probe = backgroundProbe();
    const bands = probe ? probe.darkBands(probe.page * 0.55) : [];
    view.bands = bands;
    view.darkTexts = [];

    if (!bands.length) return words;

    if (onProgress) onProgress({ status: "lendo botões", progress: 0.92 });

    // Cada faixa é uma linha só de texto.
    try {
      await worker.setParameters({ tessedit_pageseg_mode: "7" });
    } catch (error) {
      // Versões antigas do motor ignoram o parâmetro.
    }

    for (let index = 0; index < bands.length; index += 1) {
      const band = bands[index];

      try {
        const reading = await worker.recognize(croppedInverted(band), {}, { text: true });
        const text = String(reading.data.text || "")
          .replace(/\s+/g, " ")
          .trim();

        // Texto de botão é claro sobre escuro e pequeno: quando sai
        // ilegível, vale a posição e o nome fica para o usuário.
        const legible = text
          .split(/s+/)
          .some((word) => /^[A-Za-zÀ-ÿ]{5,}$/.test(word));

        view.darkTexts.push({
          band,
          text: legible ? text : `Botão ${index + 1}`,
          uncertain: !legible
        });
      } catch (error) {
        // Uma faixa ilegível não pode derrubar a leitura inteira.
      }
    }

    try {
      await worker.setParameters({ tessedit_pageseg_mode: "3" });
    } catch (error) {
      // Volta ao modo automático para a próxima imagem.
    }
    return words;
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
        current.onDark = current.onDark || word.onDark === true;
        current.dark = current.dark || word.dark;
        current.text = `${current.text} ${word.text}`;
        current.bbox = {
          x0: Math.min(current.bbox.x0, word.bbox.x0),
          y0: Math.min(current.bbox.y0, word.bbox.y0),
          x1: Math.max(current.bbox.x1, word.bbox.x1),
          y1: Math.max(current.bbox.y1, word.bbox.y1)
        };
        return;
      }

      current = {
        text: word.text,
        bbox: { ...word.bbox },
        words: [word],
        onDark: word.onDark === true,
        dark: word.dark
      };
      runs.push(current);
    });

    return runs;
  }

  const LABEL_PATTERN = /[A-Za-zÀ-ÿ]{3,}/;
  const NOISE_PATTERN = /^[^A-Za-z0-9À-ÿ]+$/;
  const VALUE_PATTERN = /^[\d.,:/\-%R$ ]+$/;
  const DATE_PATTERN = /^\d{2}[/\-.]\d{2}[/\-.]\d{2,4}$/;
  const NUMBER_PATTERN = /^-?[\d.]*\d(?:,\d+)?$/;
  const ORNAMENT_PATTERN = /^[-=~^v«»|_.\s]+$/;

  /* ------------------------------------------------------------------ *
   * Leitura das regiões da tela
   *
   * Uma tela do ERP tem cabeçalho, tira de abas, caixa de filtros, tabela e
   * barra de botões. Sem separar isso, o texto de dentro da tabela vira um
   * monte de campo picado e a tira de abas se perde.
   * ------------------------------------------------------------------ */

  function lineModel(area) {
    const gap = charWidth() * 2.2;
    const words = area
      ? view.words.filter(
          (word) =>
            word.bbox.x0 >= area.left - 4 &&
            word.bbox.x1 <= area.right + 4 &&
            word.bbox.y0 >= area.top - 4 &&
            word.bbox.y1 <= area.bottom + 4
        )
      : view.words;

    return clusterLines(words)
      .map((lineWords, index) => {
        const runs = groupRuns(lineWords, gap).filter((run) => !NOISE_PATTERN.test(run.text));
        const tops = runs.map((run) => run.bbox.y0);
        const bottoms = runs.map((run) => run.bbox.y1);

        return {
          index,
          runs,
          top: tops.length ? Math.min(...tops) : 0,
          bottom: bottoms.length ? Math.max(...bottoms) : 0
        };
      })
      .filter((line) => line.runs.length);
  }

  // Fração dos runs da linha que começam na mesma coluna de alguma referência.
  function alignmentScore(references, line, tolerance) {
    if (!line.runs.length) return 0;

    const hits = line.runs.filter((run) =>
      references.some((value) => Math.abs(value - run.bbox.x0) <= tolerance)
    ).length;

    return hits / line.runs.length;
  }

  function clusterValues(values, tolerance) {
    const sorted = [...values].sort((a, b) => a - b);
    const clusters = [];

    sorted.forEach((value) => {
      const last = clusters[clusters.length - 1];
      if (last && value - last.reference <= tolerance) {
        last.items.push(value);
        last.reference = value;
        return;
      }
      clusters.push({ reference: value, items: [value] });
    });

    return clusters.map((cluster) => ({
      start: Math.min(...cluster.items),
      count: cluster.items.length
    }));
  }

  // Nome da coluna quando não há linha de dados para olhar (tabela vazia).
  function columnTypeFromTitle(title) {
    const name = String(title || "").toLowerCase();
    if (/data|dt|previs|vencim|emiss|entrega/.test(name)) return "d";
    if (/percent|perc.|%|agio|ágio|aliquota|alíquota/.test(name)) return "v2";
    if (/quantidade|qtd|valor|preco|preço|saldo|peso/.test(name)) return "v3";
    if (/codigo|código|numero|número|num|seq|linha|op|pedido/.test(name)) return "n";
    return "a";
  }

  function columnTypeFromValues(values) {
    const clean = values.map((value) => String(value).trim()).filter(Boolean);
    if (!clean.length) return "a";
    if (clean.every((value) => DATE_PATTERN.test(value))) return "d";
    if (clean.every((value) => NUMBER_PATTERN.test(value))) {
      return clean.some((value) => value.includes(",")) ? "v3" : "n";
    }
    return "a";
  }

  function cleanTitle(text) {
    return String(text || "")
      .replace(/[:：]\s*$/, "")
      .replace(/^[-=~^v«»|_.\s]+/, "")
      .replace(/[-=~^v«»|_.\s]+$/, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  // O maior bloco de linhas alinhadas em coluna é o corpo da tabela. O
  // cabeçalho costuma ficar de fora porque tem ícone de filtro e ordenação no
  // meio do texto, então ele é promovido depois, testado contra as colunas.
  function detectTable(lines) {
    const tolerance = charWidth() * 1.8;
    let best = null;

    for (let start = 0; start < lines.length; start += 1) {
      if (lines[start].runs.length < 3) continue;

      const references = lines[start].runs.map((run) => run.bbox.x0);
      let end = start;
      while (
        end + 1 < lines.length &&
        lines[end + 1].runs.length >= 2 &&
        alignmentScore(references, lines[end + 1], tolerance) >= 0.6
      ) {
        end += 1;
      }

      const height = end - start + 1;
      if (height >= 3 && (!best || height > best.height)) {
        best = { start, end, height };
      }
    }

    if (!best) return null;

    let body = lines.slice(best.start, best.end + 1);

    function columnStarts(source) {
      const starts = [];
      source.forEach((line) => line.runs.forEach((run) => starts.push(run.bbox.x0)));
      return clusterValues(starts, tolerance)
        .filter((cluster) => cluster.count >= 2)
        .sort((a, b) => a.start - b.start);
    }

    // Promove a linha de cima a cabeçalho quando ela casa com as colunas.
    // Procura algumas linhas acima porque o OCR costuma soltar fragmentos de
    // uma palavra entre o cabeçalho e a primeira linha de dados.
    let above = null;
    for (let back = 1; back <= 3; back += 1) {
      const candidate = lines[best.start - back];
      if (!candidate) break;
      if (body[0].top - candidate.bottom > lineHeight() * 3) break;

      const significant = candidate.runs.filter((run) => !ORNAMENT_PATTERN.test(run.text));
      if (significant.length >= 3) {
        above = candidate;
        break;
      }
    }
    let header = body[0];
    let dataLines = body.slice(1);

    if (above && above.runs.length >= 3) {
      const references = columnStarts(body).map((cluster) => cluster.start);
      const near = body[0].top - above.bottom < lineHeight() * 2.6;

      // Ícone de filtro e de ordenação viram runs de um caractere no meio do
      // cabeçalho; contá-los derrubava o alinhamento.
      const meaningful = {
        runs: above.runs.filter((run) => !ORNAMENT_PATTERN.test(run.text))
      };
      const matches = alignmentScore(references, meaningful, tolerance * 1.4);
      const textual = meaningful.runs.some((run) => LABEL_PATTERN.test(run.text));

      // Uma tira de abas logo acima da tabela casa em algumas colunas por
      // coincidência; o cabeçalho de verdade tem quase um título por coluna.
      const enough = meaningful.runs.length >= references.length * 0.7;

      if (near && textual && enough && matches >= 0.5) {
        header = above;
        dataLines = body;
        body = [above, ...body];
      }
    }

    // As colunas saem dos dados; uma coluna vazia só aparece no cabeçalho, e
    // sem isso dois títulos vizinhos acabavam no mesmo cluster.
    const clusters = columnStarts(dataLines);
    header.runs
      .filter((run) => !ORNAMENT_PATTERN.test(run.text))
      .forEach((run) => {
        if (!clusters.some((cluster) => Math.abs(cluster.start - run.bbox.x0) <= tolerance)) {
          clusters.push({ start: run.bbox.x0, count: 1 });
        }
      });
    clusters.sort((a, b) => a.start - b.start);

    if (clusters.length < 2) return null;

    const right = Math.max(
      ...body.map((line) => Math.max(...line.runs.map((run) => run.bbox.x1)))
    );

    const columns = clusters.map((cluster, index) => {
      const next = clusters[index + 1];
      const limit = next ? next.start : right;

      const titleWords = header.runs
        .flatMap((run) => run.words || [run])
        .filter(
          (word) =>
            word.bbox.x0 >= cluster.start - tolerance &&
            word.bbox.x0 < limit - tolerance / 2 &&
            !ORNAMENT_PATTERN.test(word.text)
        )
        .sort((a, b) => a.bbox.x0 - b.bbox.x0);

      const values = dataLines
        .map((line) =>
          line.runs.find(
            (run) =>
              run.bbox.x0 >= cluster.start - tolerance &&
              run.bbox.x0 < limit - tolerance / 2
          )
        )
        .filter(Boolean)
        .map((run) => run.text);

      return {
        title: cleanTitle(titleWords.map((word) => word.text).join(" ")),
        start: cluster.start,
        width: Math.max(3, toSize(limit - cluster.start)),
        type: columnTypeFromValues(values),
        samples: values.slice(0, 3)
      };
    });

    return {
      lines: body,
      header,
      dataLines,
      top: header.top,
      bottom: body[body.length - 1].bottom,
      left: Math.min(...body.map((line) => Math.min(...line.runs.map((run) => run.bbox.x0)))),
      right,
      columns
    };
  }

  /* Leitura de pixel: acha caixa de marcação, faixa escura (botão) e o fundo
     local de um texto. Sem isso não dá para separar botão de rótulo. */
  function backgroundProbe() {
    if (!view.image) return null;

    try {
      const off = document.createElement("canvas");
      off.width = view.image.naturalWidth;
      off.height = view.image.naturalHeight;

      const ctx = off.getContext("2d");
      if (!ctx || typeof ctx.getImageData !== "function") return null;

      ctx.drawImage(view.image, 0, 0);
      const data = ctx.getImageData(0, 0, off.width, off.height).data;

      const luminance = (x, y) => {
        const px = Math.max(0, Math.min(off.width - 1, Math.round(x)));
        const py = Math.max(0, Math.min(off.height - 1, Math.round(y)));
        const position = (py * off.width + px) * 4;
        return 0.299 * data[position] + 0.587 * data[position + 1] + 0.114 * data[position + 2];
      };

      const samples = [];
      for (let y = 0; y < off.height; y += 7) {
        for (let x = 0; x < off.width; x += 7) samples.push(luminance(x, y));
      }
      const page = median(samples);

      return {
        page,
        canvas: off,

        // Quadradinho desenhado à esquerda do texto: checkbox ou radio.
        hasBoxLeft(bbox, reach = 2.6) {
          const cw = charWidth();
          const middle = (bbox.y0 + bbox.y1) / 2;
          const from = bbox.x0 - cw * reach;
          const to = bbox.x0 - cw * 0.2;
          if (from < 1) return false;

          let darkest = 255;
          let lightest = 0;
          for (let x = from; x <= to; x += 1) {
            for (let y = middle - lineHeight() * 0.35; y <= middle + lineHeight() * 0.35; y += 2) {
              const value = luminance(x, y);
              darkest = Math.min(darkest, value);
              lightest = Math.max(lightest, value);
            }
          }

          return lightest - darkest > 25 && page - darkest > 25;
        },

        // Linhas desenhadas: bordas de tabela, divisórias de cabeçalho.
        rules(threshold = 22) {
          if (this._rules) return this._rules;

          const found = [];
          for (let y = 0; y < off.height; y += 1) {
            let best = 0;
            let run = 0;
            let start = 0;
            let bestStart = 0;

            for (let x = 0; x < off.width; x += 2) {
              if (Math.abs(luminance(x, y) - page) > threshold) {
                if (run === 0) start = x;
                run += 2;
                if (run > best) {
                  best = run;
                  bestStart = start;
                }
              } else {
                run = 0;
              }
            }

            if (best > off.width * 0.4) found.push({ y, length: best, x0: bestStart });
          }

          // Borda de 2px vira duas linhas; junta o que está colado.
          const grouped = [];
          found.forEach((rule) => {
            const last = grouped[grouped.length - 1];
            if (last && rule.y - last.y <= 3) {
              last.y = rule.y;
              last.length = Math.max(last.length, rule.length);
              return;
            }
            grouped.push({ ...rule });
          });

          this._rules = grouped;
          return grouped;
        },

        // Separadores verticais dentro de uma faixa.
        verticalRules(y0, y1, threshold = 14) {
          const height = Math.max(1, y1 - y0);
          const found = [];

          for (let x = 0; x < off.width; x += 1) {
            let count = 0;
            for (let y = y0; y <= y1; y += 2) {
              if (Math.abs(luminance(x, y) - page) > threshold) count += 2;
            }
            if (count > height * 0.5) found.push(x);
          }

          const grouped = [];
          found.forEach((x) => {
            const last = grouped[grouped.length - 1];
            if (last !== undefined && x - last <= 3) {
              grouped[grouped.length - 1] = x;
              return;
            }
            grouped.push(x);
          });

          return grouped;
        },

        // Claridade média de uma faixa da tela.
        averageLuminance(y0, y1, x0, x1) {
          let total = 0;
          let count = 0;

          for (let y = Math.max(0, y0); y <= Math.min(off.height - 1, y1); y += 2) {
            for (let x = Math.max(0, x0); x <= Math.min(off.width - 1, x1); x += 4) {
              total += luminance(x, y);
              count += 1;
            }
          }

          return count ? total / count : page;
        },

        // Barra lateral escura do ERP à esquerda do conteúdo.
        darkColumn(limit) {
          let last = 0;

          for (let x = 0; x < limit; x += 2) {
            let dark = 0;
            let total = 0;
            for (let y = 0; y < off.height; y += 6) {
              total += 1;
              if (luminance(x, y) < page * 0.65) dark += 1;
            }
            if (total && dark / total > 0.6) last = x;
          }

          return last;
        },

        // "check" (quadrado), "radio" (redondo) ou "" (nada desenhado).
        markerKind(bbox, reach = 2.8, floor = 0) {
          const cw = charWidth();
          const lh = lineHeight();
          const middle = (bbox.y0 + bbox.y1) / 2;
          // Não invadir a palavra anterior da linha, senão a letra dela entra
          // na caixa do marcador e a forma deixa de ser quadrada.
          const from = Math.max(floor, bbox.x0 - cw * reach);
          const to = bbox.x0 - cw * 0.15;
          if (from < 1 || to - from < 3) return "";

          let minX = Infinity;
          let maxX = -1;
          let minY = Infinity;
          let maxY = -1;

          for (let x = from; x <= to; x += 1) {
            for (let y = middle - lh * 0.45; y <= middle + lh * 0.45; y += 1) {
              // O contorno do radio/checkbox é um traço claro; comparar por
              // fração do fundo deixava ele passar batido.
              if (page - luminance(x, y) > 25) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
              }
            }
          }

          if (maxX < 0) return "";

          const width = maxX - minX + 1;
          const height = maxY - minY + 1;

          if (width < 4 || height < 4) return "";
          if (Math.abs(width - height) > Math.max(width, height) * 0.45) return "";

          const corners = [
            [minX, minY],
            [maxX, minY],
            [minX, maxY],
            [maxX, maxY]
          ];
          const empty = corners.filter(([x, y]) => page - luminance(x, y) <= 25).length;

          return empty >= 3 ? "radio" : "check";
        },

        // Retângulos escuros da tela — em geral os botões.
        darkBands(threshold) {
          const blockX = 8;
          const blockY = 4;
          const cols = Math.ceil(off.width / blockX);
          const rows = Math.ceil(off.height / blockY);
          const dark = new Uint8Array(cols * rows);

          for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
              const value = luminance(col * blockX + blockX / 2, row * blockY + blockY / 2);
              dark[row * cols + col] = value < threshold ? 1 : 0;
            }
          }

          const seen = new Uint8Array(cols * rows);
          const boxes = [];

          for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
              const index = row * cols + col;
              if (!dark[index] || seen[index]) continue;

              const stack = [index];
              seen[index] = 1;
              let minC = col;
              let maxC = col;
              let minR = row;
              let maxR = row;
              let size = 0;

              while (stack.length) {
                const current = stack.pop();
                const currentRow = Math.floor(current / cols);
                const currentCol = current % cols;
                size += 1;

                minC = Math.min(minC, currentCol);
                maxC = Math.max(maxC, currentCol);
                minR = Math.min(minR, currentRow);
                maxR = Math.max(maxR, currentRow);

                [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
                  const nextCol = currentCol + dc;
                  const nextRow = currentRow + dr;
                  if (nextCol < 0 || nextCol >= cols || nextRow < 0 || nextRow >= rows) return;
                  const nextIndex = nextRow * cols + nextCol;
                  if (dark[nextIndex] && !seen[nextIndex]) {
                    seen[nextIndex] = 1;
                    stack.push(nextIndex);
                  }
                });
              }

              const width = (maxC - minC + 1) * blockX;
              const height = (maxR - minR + 1) * blockY;
              const fill = size / ((maxC - minC + 1) * (maxR - minR + 1));

              // Botão: retângulo cheio, mais largo do que alto, do tamanho de
              // uma linha de texto.
              if (
                width >= charWidth() * 5 &&
                height >= lineHeight() * 0.6 &&
                height <= lineHeight() * 2.5 &&
                width / height >= 2.5 &&
                fill > 0.75
              ) {
                boxes.push({
                  x0: minC * blockX,
                  y0: minR * blockY,
                  x1: (maxC + 1) * blockX,
                  y1: (maxR + 1) * blockY
                });
              }
            }
          }

          return boxes;
        },

        // Limites da caixa escura em volta do texto.
        expand(bbox, threshold) {
          const middle = (bbox.y0 + bbox.y1) / 2;
          let left = bbox.x0;
          let right = bbox.x1;
          let top = bbox.y0;
          let bottom = bbox.y1;

          while (left > 1 && luminance(left - 2, middle) < threshold) left -= 2;
          while (right < off.width - 2 && luminance(right + 2, middle) < threshold) right += 2;

          const center = (left + right) / 2;
          while (top > 1 && luminance(center, top - 2) < threshold) top -= 2;
          while (bottom < off.height - 2 && luminance(center, bottom + 2) < threshold) bottom += 2;

          return { x0: left, y0: top, x1: right, y1: bottom };
        },

        around(bbox) {
          const values = [];
          const step = Math.max(2, Math.round((bbox.x1 - bbox.x0) / 12));

          for (let x = bbox.x0; x <= bbox.x1; x += step) {
            values.push(luminance(x, bbox.y0 - 4));
            values.push(luminance(x, bbox.y1 + 4));
          }
          values.push(luminance(bbox.x0 - 5, (bbox.y0 + bbox.y1) / 2));
          values.push(luminance(bbox.x1 + 5, (bbox.y0 + bbox.y1) / 2));

          return median(values);
        }
      };
    } catch (error) {
      return null;
    }
  }

  /* Linhas desenhadas da tela: é o que permite achar a tabela quando ela está
     vazia (só cabeçalho) e recortar a área útil de um print com o navegador
     inteiro. */
  function ruleReader(probe) {
    if (!probe || typeof probe.rules !== "function") return null;
    return probe;
  }

  // Área útil: sem a barra lateral escura do ERP e sem as barras do navegador.
  function usableArea(probe) {
    const width = view.image.naturalWidth;
    const height = view.image.naturalHeight;
    const area = { left: 0, top: 0, right: width, bottom: height };

    if (!probe) return area;

    const sidebar = probe.darkColumn(width * 0.2);
    if (sidebar <= 4) {
      // Sem barra lateral não é print de navegador: nada a recortar, e cortar
      // por engano some com os filtros do topo da tela.
      return area;
    }

    area.left = sidebar + 2;

    // A divisória que atravessa a tela inteira, na parte de cima, separa o
    // cabeçalho do navegador/ERP do conteúdo da rotina.
    // A divisória do navegador/ERP nasce na coluna zero e atravessa a tela
    // inteira; a borda de uma tabela começa depois da margem do conteúdo.
    const full = probe
      .rules()
      .filter((rule) => rule.x0 <= 2 && rule.length >= width * 0.98 && rule.y < height * 0.3);

    if (full.length) area.top = full[full.length - 1].y + 2;

    return area;
  }

  // Tabela pelas bordas: duas horizontais próximas formam a faixa do cabeçalho
  // e a próxima horizontal longa fecha a área de dados.
  function detectTableByRules(lines, probe, area) {
    if (!probe) return null;

    const rules = probe
      .rules()
      .filter((rule) => rule.y > area.top && rule.length >= (area.right - area.left) * 0.5);

    if (rules.length < 3) return null;

    const lh = lineHeight();

    const candidates = [];

    for (let index = 0; index < rules.length - 1; index += 1) {
      const top = rules[index];
      const headerBottom = rules[index + 1];
      const gap = headerBottom.y - top.y;

      if (gap < lh * 0.5 || gap > lh * 2.2) continue;

      // Fim da tabela: a última borda longa da sequência, não a próxima.
      const end = rules[rules.length - 1];
      if (end.y <= headerBottom.y + lh * 1.2) continue;

      const headerShade = probe.averageLuminance(top.y + 2, headerBottom.y - 2, area.left, area.right);
      const bodyShade = probe.averageLuminance(
        headerBottom.y + 2,
        Math.min(end.y - 2, headerBottom.y + gap),
        area.left,
        area.right
      );

      candidates.push({
        top,
        headerBottom,
        end,
        area: end.y - headerBottom.y,
        contrast: bodyShade - headerShade
      });
    }

    // Primeiro os que têm cara de cabeçalho; entre eles, o de maior área.
    const shaded = candidates.filter((candidate) => candidate.contrast > 2);
    const ordered = (shaded.length ? shaded : candidates).sort((a, b) => b.area - a.area);
    candidates.length = 0;
    candidates.push(...ordered);

    for (const candidate of candidates) {
      const { top, headerBottom, end } = candidate;

      const headerLines = lines.filter(
        (line) => line.top >= top.y - 6 && line.bottom <= headerBottom.y + 8
      );
      if (!headerLines.length) continue;

      const headerRuns = headerLines
        .flatMap((line) => line.runs)
        .sort((a, b) => a.bbox.x0 - b.bbox.x0);

      const header = {
        runs: headerRuns,
        top: Math.min(...headerLines.map((line) => line.top)),
        bottom: Math.max(...headerLines.map((line) => line.bottom))
      };

      if (header.runs.length < 3) continue;

      const dataLines = lines.filter(
        (line) => line.top > headerBottom.y + 2 && line.bottom < end.y
      );

      // Separadores de coluna: dentro do cabeçalho eles sempre existem, mesmo
      // com a tabela vazia.
      const verticals = probe
        .verticalRules(top.y + 2, headerBottom.y - 2)
        .filter((x) => x >= area.left && x <= area.right);

      const bounds =
        verticals.length >= 3
          ? verticals.slice()
          : header.runs.map((run) => run.bbox.x0 - charWidth() * 0.5);

      // A borda esquerda da tabela raramente aparece como régua (encosta na
      // margem da tela). Sem ela a primeira coluna do cabeçalho fica fora de
      // todas as faixas e some — foi o caso da coluna "Material".
      const firstText = header.runs[0] ? header.runs[0].bbox.x0 : null;
      if (firstText !== null && bounds.length && firstText < bounds[0] - charWidth() * 0.6) {
        bounds.unshift(Math.max(area.left, Math.min(firstText - charWidth() * 0.5, top.x0)));
      }

      const right = Math.min(area.right, Math.max(...bounds, header.runs[header.runs.length - 1].bbox.x1));

      const columns = bounds
        .map((start, position) => {
          const limit = bounds[position + 1] !== undefined ? bounds[position + 1] : right;
          if (limit - start < charWidth() * 1.5) return null;

          const words = header.runs
            .flatMap((run) => run.words || [run])
            .filter(
              (word) =>
                word.bbox.x0 >= start - charWidth() * 0.6 &&
                word.bbox.x0 < limit - charWidth() * 0.3 &&
                !ORNAMENT_PATTERN.test(word.text)
            )
            .sort((a, b) => a.bbox.x0 - b.bbox.x0);

          const values = dataLines
            .map((line) =>
              line.runs.find((run) => run.bbox.x0 >= start - charWidth() && run.bbox.x0 < limit)
            )
            .filter(Boolean)
            .map((run) => run.text);

          return {
            title: cleanTitle(words.map((word) => word.text).join(" ")),
            start,
            width: Math.max(3, toSize(limit - start)),
            type: values.length
              ? columnTypeFromValues(values)
              : columnTypeFromTitle(cleanTitle(words.map((word) => word.text).join(" "))),
            samples: values.slice(0, 3)
          };
        })
        .filter(Boolean);

      if (columns.length < 2) continue;

      return {
        lines: [header, ...dataLines],
        header,
        dataLines,
        top: top.y,
        bottom: end.y,
        left: Math.min(...bounds),
        right,
        columns,
        fromRules: true
      };
    }

    return null;
  }

  function detectButtons(lines, table, probe) {
    const floor = table ? table.bottom : view.image.naturalHeight * 0.5;
    const readings = Array.isArray(view.darkTexts) ? view.darkTexts : [];

    // Caminho principal: cada faixa escura abaixo da área de dados é um botão,
    // com o texto lido no passe ampliado.
    if (readings.length) {
      const insideTable = (band) =>
        table && band.y0 >= table.top - 4 && band.y1 <= table.bottom + 4;

      return readings
        .filter((reading) => !insideTable(reading.band))
        // A faixa colorida do topo do ERP também é escura e larga, mas está
        // acima da área útil da rotina.
        .filter((reading) => reading.band.y1 > (view.origin?.y || 0))
        .filter((reading) => toSize(reading.band.x1 - reading.band.x0) >= 8)
        .map((reading) => ({
          id: app.utils.createId(),
          include: true,
          text: cleanTitle(reading.text),
          line: toLine(reading.band.y0, reading.band.y1 - reading.band.y0),
          column: toColumn(reading.band.x0),
          size: Math.max(8, toSize(reading.band.x1 - reading.band.x0)),
          box: reading.band,
          textBox: reading.band
        }));
    }

    // Sem leitura de pixel: texto curto sobre fundo escuro, abaixo da tabela.
    const buttons = [];

    lines.forEach((line) => {
      if (table && line.top >= table.top - 2 && line.bottom <= table.bottom + 2) return;

      line.runs.forEach((run) => {
        const text = cleanTitle(run.text);
        if (!LABEL_PATTERN.test(text)) return;
        if (text.length > 28 || text.includes(":")) return;
        if (run.bbox.y0 < floor) return;

        const local = probe ? probe.around(run.bbox) : null;
        if (local === null || local >= probe.page * 0.72) return;

        const box = probe.expand(run.bbox, probe.page * 0.72);

        buttons.push({
          id: app.utils.createId(),
          include: true,
          text,
          line: toLine(box.y0, box.y1 - box.y0),
          column: toColumn(box.x0),
          size: Math.max(8, toSize(box.x1 - box.x0)),
          box,
          textBox: { ...run.bbox }
        });
      });
    });

    return buttons;
  }

  // Opções desenhadas numa linha: "( ) Vigente ( ) Não Vigente (o) Todos".
  // Cada marcador começa uma opção e o texto vai até o próximo marcador.
  function markerGroup(line, probe) {
    if (!probe || typeof probe.markerKind !== "function") return null;

    const words = line.runs
      .flatMap((run) => run.words || [run])
      .sort((a, b) => a.bbox.x0 - b.bbox.x0);

    const options = [];
    let current = null;
    let kinds = [];

    words.forEach((word, position) => {
      const previous = words[position - 1];
      const kind = probe.markerKind(word.bbox, 2.8, previous ? previous.bbox.x1 + 2 : 0);

      if (kind) {
        kinds.push(kind);
        current = { texts: [word.text], box: { ...word.bbox } };
        options.push(current);
        return;
      }

      // O marcador selecionado às vezes é lido como texto ("(6)", "O", "©").
      // Ele não é o nome da opção: é o começo da próxima.
      if (!/[A-Za-zÀ-ÿ]{2,}/.test(word.text)) {
        current = { texts: [], box: { ...word.bbox } };
        options.push(current);
        return;
      }

      if (!current) return;

      // Palavra colada na opção anterior faz parte do texto dela.
      if (word.bbox.x0 - current.box.x1 <= charWidth() * 2) {
        current.texts.push(word.text);
        current.box.x1 = word.bbox.x1;
      }
    });

    // As opções de um grupo ficam lado a lado; o que estiver longe já é
    // outra coisa da tela (um botão, outro campo).
    const withText = options.filter((option) => option.texts.length);
    const named = [];

    withText.forEach((option) => {
      const last = named[named.length - 1];
      if (!last || option.box.x0 - last.box.x1 <= charWidth() * 6) named.push(option);
    });

    if (named.length < 2) return null;

    const radios = kinds.filter((kind) => kind === "radio").length;

    return {
      kind: radios >= kinds.length / 2 ? "radio" : "check",
      options: named.map((option) => ({
        text: cleanTitle(option.texts.join(" ")),
        box: option.box
      })),
      left: Math.min(...named.map((option) => option.box.x0)),
      right: Math.max(...named.map((option) => option.box.x1))
    };
  }

  // Linha de caixas de marcação (checkbox/radio) — não é tira de abas.
  function isCheckboxLine(line, probe) {
    if (!probe || typeof probe.markerKind !== "function" || !line.runs.length) return false;

    const marked = line.runs.filter((run, position) => {
      const previous = line.runs[position - 1];
      return probe.markerKind(run.bbox, 2.8, previous ? previous.bbox.x1 + 2 : 0);
    }).length;

    return marked >= Math.max(1, Math.ceil(line.runs.length * 0.5));
  }

  function looksLikeTabStrip(line) {
    if (line.runs.length < 2) return false;

    return line.runs.every((run) => {
      const text = cleanTitle(run.text);
      return (
        text.length >= 4 &&
        text.length <= 30 &&
        LABEL_PATTERN.test(text) &&
        !VALUE_PATTERN.test(text) &&
        !text.includes(":") &&
        !/[&@#%]/.test(text)
      );
    });
  }

  // A tira de abas é a primeira faixa do topo com dois ou mais títulos curtos,
  // antes da área de dados. Antes eu pegava a linha logo acima da tabela, que
  // numa tela com filtros é a linha dos checkboxes.
  function detectTabs(lines, table, probe) {
    const limit = table ? table.top : view.image.naturalHeight;

    const candidate = lines.find(
      (line) =>
        line.bottom < limit &&
        looksLikeTabStrip(line) &&
        !isCheckboxLine(line, probe)
    );

    if (!candidate) return [];

    return candidate.runs.map((run) => ({
      id: app.utils.createId(),
      include: true,
      title: cleanTitle(run.text),
      line: toLine(run.bbox.y0, run.bbox.y1 - run.bbox.y0),
      box: { ...run.bbox }
    }));
  }

  // O valor que aparece na tela ao lado do label ajuda a dizer o tipo.
  function typeFromSample(value) {
    if (!value) return "";
    if (DATE_PATTERN.test(value)) return "date";
    if (/^\d+$/.test(value)) return "integer";
    if (/^-?[\d.]+,\d+$/.test(value)) return "decimal";
    return "";
  }

  // Onde termina o cabeçalho da janela (título, caminho, versão do ERP).
  function headerCeiling(lines, table, tabs, probe) {
    const flatten = (line) =>
      line.runs
        .map((run) => run.text)
        .join(" ")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    let ceiling = lines.length ? lines[0].bottom : 0;

    if (lines[1]) {
      const first = flatten(lines[0]);
      const second = flatten(lines[1]);
      const repeats =
        first.length > 6 &&
        second.length > 6 &&
        (first.includes(second) || second.includes(first));
      if (repeats) ceiling = lines[1].bottom;
    }

    if (probe && typeof probe.rules === "function") {
      const limit = Math.min(
        table ? table.top : Infinity,
        tabs.length ? Math.min(...tabs.map((tab) => tab.box.y0)) : Infinity,
        view.image.naturalHeight * 0.35
      );

      const above = probe
        .rules()
        .filter((rule) => rule.y < limit && rule.length >= view.image.naturalWidth * 0.5);

      if (above.length) ceiling = Math.max(ceiling, above[above.length - 1].y);
    }

    return ceiling;
  }

  function detectFields(lines, table, tabs, buttons, probe, ceiling) {
    const used = new Set();
    const rows = [];
    const consumed = [...buttons, ...tabs].map((item) => item.textBox || item.box);

    // Comparar coordenada exata falhava quando o run agrupava várias palavras
    // já consumidas (as opções de um radio, por exemplo).
    const isConsumed = (run) =>
      consumed.some(
        (box) =>
          run.bbox.x0 < box.x1 &&
          box.x0 < run.bbox.x1 &&
          run.bbox.y0 < box.y1 &&
          box.y0 < run.bbox.y1
      );

    const tabsTop = tabs.length ? Math.min(...tabs.map((tab) => tab.box.y0)) : null;

    lines.forEach((line) => {
      if (table && line.top >= table.top - 2 && line.bottom <= table.bottom + 2) return;

      if (table && line.top > table.bottom) return;


      // Acima do cabeçalho da janela (ou da tira de abas) só sobrevive o que
      // tem valor ao lado: um filtro global como o campo Empresa. Título,
      // caminho e versão do ERP não têm.
      const inHeader =
        line.top < ceiling - 2 ||
        (tabsTop !== null && line.bottom < tabsTop && toLine(line.top, 0) <= 2);

      // Grupo de opções: um campo radio com a tabela de opções montada.
      const group = !inHeader ? markerGroup(line, probe) : null;

      if (group && group.kind === "radio") {
        const before = line.runs
          .filter(
            (run) =>
              run.bbox.x1 <= group.left - charWidth() * 0.5 &&
              // Texto distante na mesma linha é outro campo, não o nome do grupo.
              group.left - run.bbox.x1 <= charWidth() * 6 &&
              /[A-Za-zÀ-ÿ]{3,}/.test(run.text)
          )
          .sort((a, b) => b.bbox.x1 - a.bbox.x1)[0];

        const description = cleanTitle(before ? before.text : "") || "Opção";
        const variable = helpers().variableFromDescription(description, used);

        const inputColumn = toColumn(group.left);
        const labelSize = Math.max(4, description.length);

        rows.push({
          id: app.utils.createId(),
          include: true,
          origin: "ocr",
          description,
          variable,
          type: "radio",
          required: false,
          isKey: false,
          labelLine: toLine(line.top, line.bottom - line.top),
          labelColumn: Math.max(1, inputColumn - labelSize - 1),
          labelSize,
          inputColumn,
          inputSize: Math.max(10, toSize(group.right - group.left)),
          optionsVariable: `TAB${variable}`.slice(0, 20),
          createOptionsTable: true,
          optionsItems: group.options.map((option, position) => ({
            value: String(position),
            description: option.text || `Opção ${position + 1}`
          })),
          lookupPreset: "none",
          box: { x0: group.left, y0: line.top, x1: group.right, y1: line.bottom }
        });

        // Só as opções são consumidas: um campo antes delas na mesma linha
        // continua virando campo.
        group.options.forEach((option) => consumed.push(option.box));
      }

      const runs = line.runs;
      // Acima da tira de abas fica o cabeçalho da janela. Só sobrevive o que
      // tem valor ao lado, que é o caso de um filtro global (ex.: Empresa).
      const checkboxLine = !inHeader && isCheckboxLine(line, probe);
      let index = 0;

      while (index < runs.length) {
        const run = runs[index];
        const raw = run.text.trim();
        const endsWithColon = /[:：]\s*$/.test(raw);
        const text = cleanTitle(raw);

        if (isConsumed(run) || !LABEL_PATTERN.test(text) || VALUE_PATTERN.test(text)) {
          index += 1;
          continue;
        }

        // Texto sobre faixa escura acima da tabela é rótulo de seção.
        if (probe && probe.around(run.bbox) < probe.page * 0.72) {
          index += 1;
          continue;
        }

        const lineNumber = toLine(run.bbox.y0, run.bbox.y1 - run.bbox.y0);

        // Caixa de marcação: o texto é o próprio campo, sem leitor ao lado.
        if (checkboxLine) {
          rows.push({
            id: app.utils.createId(),
            include: true,
            origin: "ocr",
            description: text,
            variable: helpers().variableFromDescription(text, used),
            type: "checkbox",
            required: false,
            isKey: false,
            labelLine: lineNumber,
            labelColumn: toColumn(run.bbox.x0),
            labelSize: Math.max(2, toSize(run.bbox.x1 - run.bbox.x0)),
            inputColumn: toColumn(run.bbox.x1) + 1,
            inputSize: 10,
            lookupPreset: "none",
            box: { ...run.bbox }
          });
          index += 1;
          continue;
        }

        const next = runs[index + 1];
        const following = runs[index + 2];

        const nextIsValue =
          next && (VALUE_PATTERN.test(next.text.trim()) || endsWithColon);

        // No cabeçalho da janela só passa label com valor colado ao lado (um
        // filtro tipo "Empresa 22"). O título tem a versão do ERP na outra
        // ponta da linha, e isso não é um campo.
        const valueIsClose =
          nextIsValue && next.bbox.x0 - run.bbox.x1 <= charWidth() * 3;

        // O OCR às vezes cola o valor no label ("Empresa[22"); isso também é
        // um campo, não parte do título.
        const embeddedValue = /[A-Za-zÀ-ÿ]{3,}[^A-Za-z0-9]?\d+/.test(raw);

        if (inHeader && !valueIsClose && !embeddedValue) {
          index += 1;
          continue;
        }

        const displayRun =
          nextIsValue &&
          following &&
          !VALUE_PATTERN.test(following.text.trim()) &&
          !/[:：]\s*$/.test(following.text) &&
          LABEL_PATTERN.test(following.text)
            ? following
            : null;

        const labelEnd = run.bbox.x1;
        const gapTarget = nextIsValue ? runs[index + 2] : next;
        const freeSpace = nextIsValue
          ? Math.max(next.bbox.x1 - next.bbox.x0, charWidth() * 4)
          : gapTarget
            ? gapTarget.bbox.x0 - labelEnd
            : view.image.naturalWidth - labelEnd;

        const description = text;
        const variable = helpers().variableFromDescription(description, used);
        const sampled = nextIsValue ? typeFromSample(next.text.trim()) : "";
        const type = helpers().inferType(description) || sampled || "string";

        const inputColumn = nextIsValue ? toColumn(next.bbox.x0) : toColumn(labelEnd) + 1;
        const inputSize = nextIsValue
          ? Math.max(4, Math.min(60, toSize(freeSpace) + 2))
          : next
            ? Math.max(4, Math.min(60, toSize(freeSpace) - 1))
            : helpers().defaultSize(type, description);

        const confidence = run.words && run.words.length
          ? run.words.reduce((total, word) => total + (word.confidence || 0), 0) / run.words.length
          : 100;

        rows.push({
          id: app.utils.createId(),
          // Leitura duvidosa entra desmarcada: o usuário confere antes de usar.
          // A linha 1 já é conteúdo: o cabeçalho da janela foi descartado
          // antes, pela régua.
          include:
            (nextIsValue || freeSpace > charWidth() * 3) && confidence >= 70,
          confidence: Math.round(confidence),
          origin: "ocr",
          description,
          variable,
          type,
          required: false,
          isKey: false,
          labelLine: lineNumber,
          labelColumn: toColumn(run.bbox.x0),
          labelSize: Math.max(2, toSize(run.bbox.x1 - run.bbox.x0)),
          inputColumn,
          inputSize,
          hasDisplay: Boolean(displayRun),
          displayColumn: displayRun ? toColumn(displayRun.bbox.x0) : inputColumn + inputSize + 2,
          displaySize: displayRun
            ? Math.max(10, toSize(displayRun.bbox.x1 - displayRun.bbox.x0))
            : 30,
          lookupPreset: helpers().inferLookup(description) || "none",
          box: { ...run.bbox }
        });

        index += 1 + (nextIsValue ? 1 : 0) + (displayRun ? 1 : 0);
      }
    });

    return rows;
  }

  function gridFromRegion(table, probe) {
    if (!table) return null;

    const used = new Set();
    const line = toLine(table.top, 0);
    const bottom = toLine(table.bottom, 0);

    const columns = table.columns
      // Sobra de borda no fim da tabela não é coluna.
      .filter((column, index, list) => column.title || index === 0 || index < list.length - 1)
      .map((column, index) => {
      const isCheck = /^(check|sel|marca)/i.test(column.title) || (!column.title && index === 0);
      const isAction = /^(a[çc][õo]es|editar|excluir|visualizar)$/i.test(column.title);

      return {
        id: app.utils.createId(),
        include: true,
        title: column.title,
        variable: helpers().variableFromDescription(column.title || `MARCA${index + 1}`, used),
        type: isCheck ? "checkheader" : column.type,
        width: column.width,
        workPiece: 0,
        recordKey: false,
        displayOnly: isAction,
        samples: column.samples || []
      };
    });

    // Coluna de marcação sem título: existe quando há um quadradinho desenhado
    // à esquerda do primeiro valor de cada linha.
    const firstData = table.dataLines?.[0]?.runs?.[0];
    if (
      probe &&
      firstData &&
      typeof probe.markerKind === "function" &&
      probe.markerKind(firstData.bbox, 10) &&
      columns[0]?.type !== "checkheader"
    ) {
      columns.unshift({
        id: app.utils.createId(),
        include: true,
        title: "",
        variable: helpers().variableFromDescription("MARCA", used),
        type: "checkheader",
        width: 6,
        workPiece: 0,
        recordKey: false,
        displayOnly: true,
        samples: []
      });
    }

    let piece = 0;
    columns.forEach((column) => {
      if (column.type === "checkheader") return;
      piece += 1;
      column.workPiece = piece;
    });

    const key =
      columns.find(
        (column) =>
          column.type !== "checkheader" &&
          /codigo|pedido|numero|\bnum\b|seq|\bid\b|\bop\b|linha/i.test(column.title)
      ) || columns.find((column) => column.type !== "checkheader");

    if (key) key.recordKey = true;

    return {
      include: true,
      line,
      height: Math.max(3, bottom - line + 1),
      columns
    };
  }

  function analyze() {
    if (!view.words.length || !view.image) {
      view.rows = [];
      view.table = null;
      view.grid = null;
      view.tabs = [];
      view.buttons = [];
      return;
    }

    const probe = backgroundProbe();
    const area = usableArea(probe);
    view.area = area;
    view.origin = { x: area.left, y: 0 };

    // Primeira passada só para achar onde termina o cabeçalho da janela; a
    // segunda já mede tudo a partir dali, que é a linha 1 da rotina.
    let lines = lineModel(area);
    let table = detectTable(lines) || detectTableByRules(lines, probe, area);
    let tabs = detectTabs(lines, table, probe);

    // A origem é o topo da primeira linha de conteúdo depois do cabeçalho:
    // a régua fica um pouco acima e jogava tudo uma linha para baixo.
    const ceilingFirst = headerCeiling(lines, table, tabs, probe);
    const firstContent = lines.find((line) => line.top > ceilingFirst + 2);
    view.origin = {
      x: area.left,
      y: firstContent ? firstContent.top - lineHeight() * 0.15 : ceilingFirst
    };

    lines = lineModel(area);
    table = detectTable(lines) || detectTableByRules(lines, probe, area);
    const buttons = detectButtons(lines, table, probe);
    tabs = detectTabs(lines, table, probe);
    const ceiling = headerCeiling(lines, table, tabs, probe);

    view.table = table;
    view.grid = gridFromRegion(table, probe);
    view.tabs = tabs;
    view.buttons = buttons;
    view.rows = detectFields(lines, table, tabs, buttons, probe, ceiling);
  }

  // Mantido pelo nome antigo: continua devolvendo só os campos.
  function detectRows() {
    analyze();
    return view.rows;
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

    // Região do grid
    if (view.grid && view.grid.include && view.table) {
      const x = view.table.left * view.scale;
      const y = (view.grid.line - 1) * lh;
      const width = (view.table.right - view.table.left) * view.scale;
      const height = view.grid.height * lh;

      context.fillStyle = "rgba(234, 88, 12, 0.10)";
      context.fillRect(x, y, width, height);
      context.strokeStyle = "#ea580c";
      context.lineWidth = 2;
      context.strokeRect(x, y, width, height);

      context.fillStyle = "#ea580c";
      context.font = "11px sans-serif";
      context.fillText(`Grid — ${view.grid.columns.length} colunas`, x + 4, Math.max(10, y - 3));

      view.grid.columns.forEach((column, index) => {
        const source = view.table.columns[index];
        if (!source || index === 0) return;
        context.beginPath();
        context.strokeStyle = "rgba(234, 88, 12, 0.55)";
        context.lineWidth = 1;
        context.moveTo(source.start * view.scale, y);
        context.lineTo(source.start * view.scale, y + height);
        context.stroke();
      });
    }

    // Abas
    view.tabs.filter((tab) => tab.include).forEach((tab) => {
      const box = tab.box;
      context.strokeStyle = "#7c3aed";
      context.lineWidth = 2;
      context.strokeRect(
        box.x0 * view.scale - 2,
        box.y0 * view.scale - 2,
        (box.x1 - box.x0) * view.scale + 4,
        (box.y1 - box.y0) * view.scale + 4
      );
    });

    // Botões
    view.buttons.filter((button) => button.include).forEach((button) => {
      const box = button.box;
      context.strokeStyle = "#0f172a";
      context.lineWidth = 2;
      context.strokeRect(
        box.x0 * view.scale - 3,
        box.y0 * view.scale - 3,
        (box.x1 - box.x0) * view.scale + 6,
        (box.y1 - box.y0) * view.scale + 6
      );
    });

    // Campos
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
      context.strokeStyle =
        view.mode === "grid" ? "#ea580c" : view.pending.step === "label" ? "#16a34a" : "#2563eb";
      context.lineWidth = 2;
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
    .gpj-img-table { border: 1px solid #e5e9f0; border-radius: 10px; overflow: auto; max-height: 42vh; }
    .gpj-img-table.inner { max-height: 220px; margin-top: 6px; }
    .gpj-img-regions { margin-bottom: 10px; }
    .gpj-img-region { border: 1px solid #e5e9f0; border-radius: 10px; padding: 8px 10px; margin-bottom: 8px; background: #fcfdff; }
    .gpj-img-region-head { display: flex; align-items: center; gap: 8px; font-size: 12.5px; cursor: pointer; }
    .gpj-img-region-head span { opacity: .7; font-size: 12px; }
    .gpj-img-sample { font-size: 11px; opacity: .6; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
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
  let regionBox = null;
  let stage = null;

  function injectStyle() {
    if (document.getElementById("gpj-img-style")) return;
    const style = document.createElement("style");
    style.id = "gpj-img-style";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function regionSummary() {
    const parts = [`${view.words.length} palavra(s) lidas`, `${view.rows.length} campo(s)`];
    if (view.grid) parts.push(`grid com ${view.grid.columns.length} coluna(s)`);
    if (view.tabs.length) parts.push(`${view.tabs.length} aba(s)`);
    if (view.buttons.length) parts.push(`${view.buttons.length} botão(ões)`);
    return `${parts.join(", ")}. Confira a grade e a lista ao lado.`;
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

  const GRID_TYPE_OPTIONS = [
    ["a", "Texto"],
    ["n", "Número"],
    ["d", "Data"],
    ["v3", "Decimal"],
    ["checkheader", "Check"]
  ];

  function renderRegions() {
    if (!regionBox) return;

    const parts = [];

    if (view.grid) {
      const columns = view.grid.columns
        .map(
          (column, index) => `
          <tr>
            <td><input type="checkbox" data-col="${index}" data-col-property="include" ${column.include ? "checked" : ""}></td>
            <td><input type="text" data-col="${index}" data-col-property="title" value="${app.utils.escapeHtml(column.title)}"></td>
            <td><input type="text" data-col="${index}" data-col-property="variable" value="${app.utils.escapeHtml(column.variable)}" style="width:96px"></td>
            <td><select data-col="${index}" data-col-property="type">${GRID_TYPE_OPTIONS.map(
              ([value, label]) =>
                `<option value="${value}" ${column.type === value ? "selected" : ""}>${label}</option>`
            ).join("")}</select></td>
            <td><input type="number" min="1" data-col="${index}" data-col-property="width" value="${column.width}"></td>
            <td><input type="checkbox" data-col="${index}" data-col-property="recordKey" ${column.recordKey ? "checked" : ""}></td>
            <td class="gpj-img-sample">${app.utils.escapeHtml((column.samples || []).slice(0, 2).join(" · "))}</td>
          </tr>`
        )
        .join("");

      parts.push(`
        <div class="gpj-img-region">
          <label class="gpj-img-region-head">
            <input type="checkbox" data-region="grid" ${view.grid.include ? "checked" : ""}>
            <strong>Grid detectado</strong>
            <span>linha ${view.grid.line}, altura ${view.grid.height}, ${view.grid.columns.length} colunas</span>
          </label>
          <div class="gpj-img-table inner">
            <table>
              <thead><tr><th>Usar</th><th>Coluna</th><th>Variável</th><th>Tipo</th><th>Tam.</th><th>Chave</th><th>Exemplo</th></tr></thead>
              <tbody>${columns}</tbody>
            </table>
          </div>
        </div>`);
    }

    if (view.tabs.length) {
      parts.push(`
        <div class="gpj-img-region">
          <label class="gpj-img-region-head">
            <input type="checkbox" data-region="tabs" ${view.tabs.some((tab) => tab.include) ? "checked" : ""}>
            <strong>Abas detectadas</strong>
          </label>
          <input type="text" data-tabs-text value="${app.utils.escapeHtml(
            view.tabs.map((tab) => tab.title).join(" | ")
          )}" style="width:100%;margin-top:6px;padding:4px 6px;border:1px solid #dbe1ea;border-radius:6px;font-size:12.5px">
          <span style="font-size:11px;opacity:.6">Separe os títulos por " | " se o OCR juntar ou dividir errado.</span>
        </div>`);
    }

    if (view.buttons.length) {
      parts.push(`
        <div class="gpj-img-region">
          <label class="gpj-img-region-head">
            <input type="checkbox" data-region="buttons" ${view.buttons.some((button) => button.include) ? "checked" : ""}>
            <strong>Botões detectados</strong>
            <span>${view.buttons.map((button) => `linha ${button.line}, coluna ${button.column}`).join(" · ")}</span>
          </label>
          <input type="text" data-buttons-text value="${app.utils.escapeHtml(
            view.buttons.map((button) => button.text).join(" | ")
          )}" style="width:100%;margin-top:6px;padding:4px 6px;border:1px solid #dbe1ea;border-radius:6px;font-size:12.5px">
          <span style="font-size:11px;opacity:.6">Texto claro sobre fundo escuro nem sempre sai legível no OCR — a posição está certa, corrija os nomes aqui.</span>
        </div>`);
    }

    regionBox.innerHTML = parts.join("");

    regionBox.querySelectorAll("[data-region]").forEach((input) =>
      input.addEventListener("change", () => {
        const region = input.dataset.region;
        if (region === "grid" && view.grid) view.grid.include = input.checked;
        if (region === "tabs") view.tabs.forEach((tab) => (tab.include = input.checked));
        if (region === "buttons") view.buttons.forEach((button) => (button.include = input.checked));
        draw();
      })
    );

    const buttonsInput = regionBox.querySelector("[data-buttons-text]");
    if (buttonsInput) {
      buttonsInput.addEventListener("change", () => {
        const texts = buttonsInput.value
          .split("|")
          .map((text) => text.trim())
          .filter(Boolean);

        texts.forEach((text, index) => {
          if (view.buttons[index]) view.buttons[index].text = text;
        });

        renderTable();
        draw();
      });
    }

    const tabsInput = regionBox.querySelector("[data-tabs-text]");
    if (tabsInput) {
      tabsInput.addEventListener("change", () => {
        const titles = tabsInput.value
          .split("|")
          .map((title) => title.trim())
          .filter(Boolean);

        view.tabs = titles.map((title, index) => ({
          id: view.tabs[index]?.id || app.utils.createId(),
          include: true,
          title,
          line: view.tabs[index]?.line || 1,
          box: view.tabs[index]?.box || { x0: 0, y0: 0, x1: 0, y1: 0 }
        }));

        renderTable();
        draw();
      });
    }

    regionBox.querySelectorAll("[data-col]").forEach((input) => {
      const handler = () => {
        const column = view.grid?.columns[Number(input.dataset.col)];
        if (!column) return;
        const property = input.dataset.colProperty;

        column[property] =
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
  }

  function renderTable() {
    renderRegions();

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

  // Marca uma área como grid: as colunas saem do texto que estiver dentro do
  // retângulo, usando a primeira linha como cabeçalho.
  function gridFromBox(box) {
    const inside = view.words.filter(
      (word) =>
        word.bbox.x0 >= box.x0 - 4 &&
        word.bbox.x1 <= box.x1 + 4 &&
        word.bbox.y0 >= box.y0 - 4 &&
        word.bbox.y1 <= box.y1 + 4
    );

    const line = toLine(box.y0, 0);
    const height = Math.max(3, toLine(box.y1, 0) - line + 1);

    if (inside.length < 2) {
      return {
        include: true,
        line,
        height,
        columns: []
      };
    }

    const saved = view.words;
    view.words = inside;
    const table = detectTable(lineModel());
    view.words = saved;

    if (!table) {
      return { include: true, line, height, columns: [] };
    }

    view.table = table;
    const grid = gridFromRegion(table);
    grid.line = line;
    grid.height = height;
    return grid;
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

      view.pending.rect = null;

      if (view.mode === "grid") {
        view.grid = gridFromBox(box);
        renderTable();
        draw();
        setStatus(
          view.grid.columns.length
            ? `Grid marcado na linha ${view.grid.line} com ${view.grid.columns.length} coluna(s).`
            : `Área do grid marcada na linha ${view.grid.line}. Rode o OCR para tirar as colunas do cabeçalho.`
        );
        return;
      }

      if (view.mode === "botao") {
        const text = textInsideBox(box) || `Botão ${view.buttons.length + 1}`;
        view.buttons.push({
          id: app.utils.createId(),
          include: true,
          text,
          line: toLine(box.y0, box.y1 - box.y0),
          column: toColumn(box.x0),
          size: Math.max(8, toSize(box.x1 - box.x0)),
          box
        });
        renderTable();
        draw();
        setStatus(`Botão "${text}" marcado.`);
        return;
      }

      if (view.mode === "aba") {
        const title = textInsideBox(box) || `Aba ${view.tabs.length + 1}`;
        view.tabs.push({
          id: app.utils.createId(),
          include: true,
          title,
          line: toLine(box.y0, box.y1 - box.y0),
          box
        });
        renderTable();
        draw();
        setStatus(`Aba "${title}" marcada.`);
        return;
      }

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
  function gridDefinition(routineName, location) {
    if (!view.grid || !view.grid.include) return null;

    const columns = view.grid.columns.filter((column) => column.include);
    if (!columns.length) return null;

    const line = Math.max(1, view.grid.line);
    const height = Math.max(3, view.grid.height);

    return {
      location,
      gridCode: location === "parent" ? 1 : 41,
      gridLinePosition: line,
      gridHeight: height,
      gridLineStart: line,
      gridLineEnd: line + height - 1,
      gridNavigation: 1,
      gridWorkGlobal: `mtemp${routineName}`.slice(0, 31),
      gridCheckGlobal: `mtemp${routineName}CHECK`.slice(0, 31),
      columns: columns.map((column, index) => ({
        title: column.type === "checkheader" ? "" : column.title,
        variable: app.utils.normalizeVariable(column.variable, `COLUNA${index + 1}`),
        type: column.type,
        width: column.width,
        workPiece: column.type === "checkheader" ? 0 : index + 1,
        recordKey: column.recordKey === true,
        detail: column.type !== "checkheader",
        displayOnly: column.displayOnly === true
      }))
    };
  }

  function buildDocument() {
    const rows = view.rows.filter((row) => row.include);
    const routineName = app.utils.normalizeVariable(
      backdrop.querySelector("[data-img-routine]").value,
      "ROTINANOVA"
    );
    const title = backdrop.querySelector("[data-img-title]").value.trim() || "Tela importada";

    const tabs = view.tabs.filter((tab) => tab.include);
    const buttons = view.buttons.filter((button) => button.include);
    const hasGrid = Boolean(view.grid && view.grid.include);

    // Com tira de abas, o grid mora dentro da primeira aba — é assim que a
    // tela do ERP se organiza. Sem abas, o grid fica na rotina principal.
    const gridLocation = tabs.length ? "aba1" : "parent";
    const grid = gridDefinition(routineName, gridLocation);

    const documentTabs = tabs.map((tab, index) => ({
      id: `aba${index + 1}`,
      title: tab.title,
      routineName: `${routineName}TAB${index + 1}`.slice(0, 31),
      gridRgRoutineName: `${routineName}TAB${index + 1}RG`.slice(0, 31),
      dataVariable: `${routineName}T${index + 1}`.slice(0, 20),
      globalSubscript: String(index + 4),
      contentType: index === 0 && grid ? "grid" : "fields"
    }));

    const manutencao = buttons.find((button) => /manuten/i.test(button.text));
    const extraButtons = buttons.filter((button) => button !== manutencao);

    return {
      routine: {
        name: routineName,
        title,
        mode: grid && gridLocation === "parent" ? "grid" : "crud",
        dataVariable: routineName.slice(0, 8),
        useTabs: documentTabs.length > 0,
        useRules: true,
        useBtnManter: Boolean(manutencao),
        btnManterLine: manutencao ? manutencao.line : undefined,
        btnManterColumn: manutencao ? manutencao.column : undefined,
        rgRoutineName: `${routineName}RG`,
        entityName: title,
        globalName: routineName,
        width: view.calibration.columns,
        // A janela começa na primeira linha útil, não no topo do print.
        height: Math.max(20, toLine(view.image.naturalHeight, 0))
      },
      tabs: documentTabs,
      grids: grid ? [grid] : [],
      buttons: extraButtons.map((button, index) => ({
        location: "parent",
        text: button.text,
        positionMode: "manual",
        line: button.line,
        column: button.column,
        size: button.size,
        buttonId: `bt${app.utils.normalizeVariable(button.text, `BOTAO${index + 1}`).slice(0, 18)}`
      })),
      fields: rows.map((row) => ({
        // Tabela de opções montada na leitura (radio, combo, checkbox).
        ...(row.optionsItems
          ? {
              optionsVariable: row.optionsVariable,
              createOptionsTable: true,
              optionsItems: row.optionsItems
            }
          : {}),
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
          (row.hasDisplay === true || row.lookupPreset !== "none") &&
          !["date", "textArea"].includes(row.type),
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
        ...(row.optionsItems
          ? {
              optionsVariable: row.optionsVariable,
              createOptionsTable: true,
              optionsItems: row.optionsItems
            }
          : {}),
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
                <label>Marcar como
                  <select data-img-mode>
                    <option value="campo">Campo (label + leitor)</option>
                    <option value="grid">Grid</option>
                    <option value="aba">Aba</option>
                    <option value="botao">Botão</option>
                  </select>
                </label>
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
              <div class="gpj-img-regions"></div>
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
      regionBox = backdrop.querySelector(".gpj-img-regions");
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

          analyze();
          renderTable();
          draw();
          setStatus(regionSummary());
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
        analyze();
        renderTable();
        draw();
        setStatus(regionSummary());
      });

      backdrop.querySelector("[data-img-mode]").addEventListener("change", (event) => {
        view.mode = event.target.value;
        view.pending = { step: "label" };
        setStatus(
          view.mode === "grid"
            ? "Arraste sobre a área da tabela para marcar o grid."
            : view.mode === "aba"
              ? "Arraste sobre o texto de cada aba."
              : view.mode === "botao"
                ? "Arraste sobre cada botão."
                : "Arraste sobre o texto do label e depois sobre a área do leitor."
        );
      });

      backdrop.querySelector("[data-img-clear]").addEventListener("click", () => {
        view.rows = [];
        view.grid = null;
        view.tabs = [];
        view.buttons = [];
        view.table = null;
        view.pending = { step: "label" };
        renderTable();
        draw();
        setStatus("Lista de campos e regiões limpa.");
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
    analyze,
    detectTable,
    backgroundProbe,
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
