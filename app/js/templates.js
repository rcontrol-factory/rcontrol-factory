export const templates = {
  home: `
    <section class="card">
      <h2>Bem-vindo 👋</h2>
      <p>Factory interna para criar aplicativos da RControl.</p>
    </section>

    <div class="actions">
      <button class="btn primary" data-route="newapp">+ Criar novo app</button>
      <button class="btn" data-route="generator">⚙️ Gerar app</button>
      <button class="btn" data-route="settings">⚙️ Settings</button>
    </div>

    <section class="card">
      <h3>Apps salvos</h3>
      <div id="appsList" class="list"></div>
    </section>
  `,

  newApp: `
    <section class="card">
      <h2>Criar novo app</h2>
      <p>Preencha os dados abaixo para gerar a estrutura inicial.</p>

      <form id="newAppForm" class="form">
        <label class="label">
          Nome do app
          <input class="input" id="appName" name="name" type="text" placeholder="Ex: RControl Orders" required />
        </label>

        <label class="label">
          ID do app (sem espaço)
          <input class="input" id="appId" name="id" type="text" placeholder="ex: rcontrol-orders" required />
          <small class="hint">Use letras minúsculas, números e hífen.</small>
        </label>

        <label class="label">
          Tipo
          <select class="input" id="appType" name="type">
            <option value="pwa" selected>PWA</option>
            <option value="web">Web</option>
          </select>
        </label>

        <button class="btn primary" type="submit">Salvar</button>
      </form>

      <div class="card subtle">
        <h3>Dica</h3>
        <p>Depois vamos gerar automaticamente os arquivos do app com base nesses dados.</p>
      </div>
    </section>
  `,

  generator: `
    <section class="card">
      <h2>Generator</h2>
      <p>Escolha um app salvo e baixe o ZIP com a estrutura inicial.</p>

      <div class="form">
        <label class="label">
          App salvo
          <select class="input" id="genSelect"></select>
        </label>

        <button class="btn primary" id="btnZip">⬇️ Baixar ZIP</button>
        <button class="btn" data-route="home">Voltar</button>

        <div class="hint" id="genMsg" style="margin-top:10px;"></div>
      </div>
    </section>
  `,

  settings: `
    <section class="card">
      <h2>Settings</h2>
      <p>Configurações do Factory.</p>

      <div class="card subtle">
        <p><b>Modo:</b> Offline-first • Local mode</p>
        <p><b>Próximo passo:</b> configurar nome da empresa, tema, logo, etc.</p>
      </div>
    </section>
  `
};
