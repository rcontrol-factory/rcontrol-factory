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
          <input id="appName" class="input" name="name" type="text" placeholder="Ex: RControl Orders" />
        </label>

        <label class="label">
          ID do app (sem espaço)
          <input id="appId" class="input" name="id" type="text" placeholder="ex: rcontrol-orders" />
          <small class="hint">Use letras minúsculas, números e hífen.</small>
        </label>

        <label class="label">
          Tipo
          <select id="appType" class="input" name="type">
            <option value="pwa" selected>PWA</option>
            <option value="web">Web</option>
          </select>
        </label>

        <button id="saveNewApp" class="btn primary" type="button">Salvar</button>
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
      <p>Área para gerar/baixar os arquivos do app.</p>

      <div class="card subtle">
        <p><strong>Status:</strong> Em construção.</p>
        <p>Próximo passo: criar o gerador que monta pastas e arquivos a partir do formulário.</p>
      </div>
    </section>
  `,

  settings: `
    <section class="card">
      <h2>Settings</h2>
      <p>Configurações do Factory.</p>

      <div class="card subtle">
        <p><strong>Modo:</strong> Offline-first • Local mode</p>
        <p>Próximo passo: configurar nome da empresa, tema, logo, etc.</p>
      </div>
    </section>
  `,
};
  
