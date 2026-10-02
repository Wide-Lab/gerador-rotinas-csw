(function (app) {
  const DB_NAME = "gerador-rotinas-json-padrao-settings";
  const DB_VERSION = 1;
  const STORE_NAME = "handles";
  const DIRECTORY_KEY = "output-directory";

  let outputDirectoryHandle = null;
  let saving = false;

  function supportsDirectoryAccess() {
    return typeof window.showDirectoryPicker === "function";
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveRememberedDirectory(handle) {
    try {
      const database = await openDatabase();
      if (!database) return;

      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(handle, DIRECTORY_KEY);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });

      database.close();
    } catch {
      // O salvamento continua funcionando mesmo se o navegador não permitir
      // persistir o identificador da pasta.
    }
  }

  async function loadRememberedDirectory() {
    try {
      const database = await openDatabase();
      if (!database) return null;

      const handle = await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(DIRECTORY_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });

      database.close();
      return handle;
    } catch {
      return null;
    }
  }

  async function permissionState(handle) {
    if (!handle || typeof handle.queryPermission !== "function") {
      return "denied";
    }

    try {
      return await handle.queryPermission({ mode: "readwrite" });
    } catch {
      return "denied";
    }
  }

  async function requestWritePermission(handle) {
    if (!handle) return false;

    const currentPermission = await permissionState(handle);
    if (currentPermission === "granted") return true;

    if (typeof handle.requestPermission !== "function") return false;

    try {
      return (
        (await handle.requestPermission({ mode: "readwrite" })) === "granted"
      );
    } catch {
      return false;
    }
  }

  function normalizeCode(code) {
    const content = String(code || "").replace(/\r\n/g, "\n");
    return content.endsWith("\n") ? content : `${content}\n`;
  }


  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function readFileCode(fileHandle) {
    const file = await fileHandle.getFile();
    return normalizeCode(await file.text());
  }

  function addRoutines(files, conflicts, routines, type) {
    Object.values(routines || {}).forEach((routine) => {
      const routineName = app.utils.normalizeVariable(
        routine.routineName,
        "ROTINAGERADA"
      );
      const filename = `${routineName}.mac`;
      const code = normalizeCode(routine.code);
      const current = files.get(filename.toUpperCase());

      if (current && current.code !== code) {
        conflicts.push(filename);
        return;
      }

      if (!current) {
        files.set(filename.toUpperCase(), {
          filename,
          routineName,
          label: routine.label || routineName,
          type,
          code
        });
      }
    });
  }

  function collectGeneratedFiles() {
    const files = new Map();
    const conflicts = [];
    const config = app.getConfig();
    const includeInterfaces = app.el.saveInterfaceFiles.checked;
    const includeRules = app.el.saveRuleFiles.checked && config.useRules;

    if (includeInterfaces) {
      addRoutines(files, conflicts, app.mac.generateAll(), "interface");
    }

    if (includeRules) {
      const rules =
        typeof app.rg.generateAll === "function"
          ? app.rg.generateAll()
          : {
              rg: {
                label: "Rotina RG",
                routineName: config.rgRoutineName,
                code: app.rg.generate()
              }
            };

      addRoutines(files, conflicts, rules, "rg");
    }


    return {
      files: [...files.values()],
      conflicts: [...new Set(conflicts)]
    };
  }

  function setResult(message, type = "success", details = []) {
    const result = app.el.saveFilesResult;
    result.className = `save-files-result ${type}`;

    const detailHtml = details.length
      ? `<ul>${details
          .map((item) => `<li>${app.utils.escapeHtml(item)}</li>`)
          .join("")}</ul>`
      : "";

    result.innerHTML = `<strong>${app.utils.escapeHtml(message)}</strong>${detailHtml}`;
  }

  function clearResult() {
    app.el.saveFilesResult.className = "save-files-result hidden";
    app.el.saveFilesResult.innerHTML = "";
  }

  async function updateFolderDisplay() {
    const supported = supportsDirectoryAccess();

    app.el.selectOutputFolderButton.disabled = !supported || saving;
    app.el.saveGeneratedFilesButton.disabled =
      !supported || !outputDirectoryHandle || saving;

    if (!supported) {
      app.el.selectedFolderName.textContent = "Salvamento direto indisponível";
      app.el.selectedFolderHint.textContent =
        "Abra a ferramenta no Google Chrome ou Microsoft Edge atualizado.";
      app.el.outputFolderStatus.textContent = "Não suportado";
      app.el.outputFolderStatus.className = "status-badge warning";
      return;
    }

    if (!outputDirectoryHandle) {
      app.el.selectedFolderName.textContent = "Nenhuma pasta selecionada";
      app.el.selectedFolderHint.textContent =
        "Selecione a pasta ...\\rotinas\\WDOM do projeto.";
      app.el.outputFolderStatus.textContent = "Aguardando pasta";
      app.el.outputFolderStatus.className = "status-badge neutral";
      return;
    }

    const permission = await permissionState(outputDirectoryHandle);
    app.el.selectedFolderName.textContent = outputDirectoryHandle.name;
    app.el.selectedFolderHint.textContent =
      permission === "granted"
        ? "Pasta pronta para receber os arquivos .mac."
        : "Pasta lembrada. A autorização será solicitada ao salvar.";
    app.el.outputFolderStatus.textContent =
      permission === "granted" ? "Pasta autorizada" : "Autorização necessária";
    app.el.outputFolderStatus.className =
      permission === "granted" ? "status-badge success" : "status-badge warning";
  }

  function updateSummary() {
    if (!app.el.generatedFilesCount) return;

    const config = app.getConfig();
    app.el.saveRuleFiles.disabled = !config.useRules;

    const generated = collectGeneratedFiles();
    const quantity = generated.files.length;

    app.el.generatedFilesCount.textContent = `${quantity} ${
      quantity === 1 ? "arquivo pronto" : "arquivos prontos"
    }`;
  }

  async function selectDirectory() {
    if (!supportsDirectoryAccess()) {
      setResult(
        "O navegador atual não permite salvar diretamente em uma pasta.",
        "error"
      );
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({
        id: "gpj-output",
        mode: "readwrite",
        startIn: "documents"
      });

      outputDirectoryHandle = handle;
      await saveRememberedDirectory(handle);
      clearResult();
      await updateFolderDisplay();
      setResult(`Pasta ${handle.name} selecionada.`, "success");
    } catch (error) {
      if (error && error.name === "AbortError") return;

      setResult(
        "Não foi possível selecionar a pasta.",
        "error",
        [error?.message || "Verifique a permissão do navegador."]
      );
    }
  }

  async function fileExists(directoryHandle, filename) {
    try {
      await directoryHandle.getFileHandle(filename, { create: false });
      return true;
    } catch (error) {
      if (error && error.name === "NotFoundError") return false;
      throw error;
    }
  }

  async function writeFile(directoryHandle, generatedFile, overwrite) {
    const exists = await fileExists(directoryHandle, generatedFile.filename);
    const expectedCode = normalizeCode(generatedFile.code);
    let fileHandle = null;

    if (exists) {
      fileHandle = await directoryHandle.getFileHandle(
        generatedFile.filename,
        { create: false }
      );

      const currentCode = await readFileCode(fileHandle);
      if (currentCode === expectedCode) {
        return { status: "unchanged", filename: generatedFile.filename };
      }

      if (!overwrite) {
        return { status: "skipped", filename: generatedFile.filename };
      }
    } else {
      fileHandle = await directoryHandle.getFileHandle(
        generatedFile.filename,
        { create: true }
      );
    }

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const writable = await fileHandle.createWritable();

      try {
        await writable.write(expectedCode);
      } finally {
        await writable.close();
      }

      const confirmedCode = await readFileCode(fileHandle);
      if (confirmedCode === expectedCode) {
        return {
          status: exists ? "updated" : "created",
          filename: generatedFile.filename
        };
      }

      if (attempt < 2) await wait(120);
    }

    throw new Error("O conteúdo gravado não corresponde ao código gerado.");
  }

  async function saveGeneratedFiles() {
    if (saving) return;

    if (!outputDirectoryHandle) {
      setResult("Selecione primeiro a pasta WDOM do projeto.", "warning");
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement && typeof activeElement.blur === "function") {
      activeElement.blur();
      await wait(0);
    }

    if (app.grid && typeof app.grid.saveActive === "function") {
      app.grid.saveActive();
    }

    app.refresh();
    await wait(0);

    const generated = collectGeneratedFiles();

    if (generated.conflicts.length) {
      setResult(
        "Existem rotinas diferentes com o mesmo nome. Ajuste os nomes antes de salvar.",
        "error",
        generated.conflicts
      );
      return;
    }

    if (!generated.files.length) {
      setResult(
        "Nenhum tipo de arquivo está marcado para salvamento.",
        "warning"
      );
      return;
    }

    saving = true;
    app.el.saveGeneratedFilesButton.textContent = "Salvando...";
    await updateFolderDisplay();

    try {
      const allowed = await requestWritePermission(outputDirectoryHandle);
      if (!allowed) {
        setResult(
          "A gravação não foi autorizada para essa pasta.",
          "error"
        );
        return;
      }

      const overwrite = app.el.overwriteGeneratedFiles.checked;
      const results = [];
      const failures = [];

      for (const generatedFile of generated.files) {
        try {
          const fileResult = await writeFile(
            outputDirectoryHandle,
            generatedFile,
            overwrite
          );
          results.push(fileResult);

          if (["created", "updated"].includes(fileResult.status)) {
            await wait(180);
          }
        } catch (error) {
          failures.push(
            `${generatedFile.filename}: ${
              error?.message || "erro ao gravar o arquivo"
            }`
          );
        }
      }

      const created = results.filter((item) => item.status === "created");
      const updated = results.filter((item) => item.status === "updated");
      const skipped = results.filter((item) => item.status === "skipped");
      const unchanged = results.filter((item) => item.status === "unchanged");
      const savedCount = created.length + updated.length;
      const summary = [];

      if (created.length) summary.push(`${created.length} criado(s)`);
      if (updated.length) summary.push(`${updated.length} atualizado(s)`);
      if (skipped.length) summary.push(`${skipped.length} ignorado(s)`);
      if (unchanged.length) summary.push(`${unchanged.length} sem alteração`);

      if (failures.length) {
        setResult(
          `${savedCount} arquivo(s) salvo(s), com ${failures.length} erro(s).`,
          "error",
          failures
        );
      } else {
        const details = results.map((item) => {
          if (item.status === "created") return `${item.filename} — criado`;
          if (item.status === "updated") return `${item.filename} — atualizado e verificado`;
          if (item.status === "unchanged") return `${item.filename} — já estava atualizado`;
          return `${item.filename} — já existia e não foi sobrescrito`;
        });

        if (savedCount === 0 && skipped.length) {
          setResult(
            "Nenhum arquivo foi salvo porque a opção Sobrescrever arquivos existentes está desmarcada.",
            "warning",
            [
              "Marque Sobrescrever arquivos existentes e clique novamente em Salvar códigos.",
              ...details
            ]
          );
          app.utils.showToast("Nenhum arquivo salvo: sobrescrita desativada.");
        } else if (savedCount === 0 && unchanged.length) {
          setResult(
            "Todos os arquivos já estavam atualizados. Nenhuma gravação foi necessária.",
            "success",
            details
          );
          app.utils.showToast("Arquivos já atualizados.");
        } else {
          setResult(
            `Salvamento concluído: ${summary.join(", ")}. Cada arquivo alterado foi gravado e conferido.`,
            "success",
            details
          );
          app.utils.showToast(`${savedCount} arquivo(s) salvo(s) em ${outputDirectoryHandle.name}.`);
        }
      }
    } catch (error) {
      setResult(
        "Não foi possível concluir o salvamento.",
        "error",
        [error?.message || "Erro inesperado ao acessar a pasta."]
      );
    } finally {
      saving = false;
      app.el.saveGeneratedFilesButton.textContent = "Salvar códigos";
      await updateFolderDisplay();
    }
  }

  async function initialize() {
    app.el.selectOutputFolderButton.addEventListener("click", selectDirectory);
    app.el.saveGeneratedFilesButton.addEventListener("click", saveGeneratedFiles);

    [
      app.el.saveInterfaceFiles,
      app.el.saveRuleFiles,
      app.el.overwriteGeneratedFiles
    ].filter(Boolean).forEach((input) => {
      input.addEventListener("change", () => {
        if (input === app.el.overwriteGeneratedFiles) {
          input.dataset.userChanged = "1";
        }
        updateSummary();
        clearResult();
      });
    });

    if (supportsDirectoryAccess()) {
      outputDirectoryHandle = await loadRememberedDirectory();
    }

    updateSummary();
    await updateFolderDisplay();
  }

  async function rememberHandle(key, handle) {
    try {
      const database = await openDatabase();
      if (!database) return;

      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(handle, key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });

      database.close();
    } catch {
      /* sem persistência: a escolha vale só para esta sessão */
    }
  }

  async function recallHandle(key) {
    try {
      const database = await openDatabase();
      if (!database) return null;

      const handle = await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });

      database.close();
      return handle;
    } catch {
      return null;
    }
  }

  app.files = {
    initialize,
    selectDirectory,
    saveGeneratedFiles,
    collectGeneratedFiles,
    updateSummary,
    supportsDirectoryAccess,
    requestWritePermission,
    rememberHandle,
    recallHandle,
    outputDirectory: () => outputDirectoryHandle
  };
})(window.GeradorRotinasJsonPadrao);
