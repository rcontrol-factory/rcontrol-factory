export const templates = {
  home: `
    <section class="card">
      <h2>Bem-vindo 👋</h2>
      <p>Factory interna para criar aplicativos da RControl.</p>
    </section>

    <section class="actions">
      <button class="btn primary" data-route="newapp">+ Criar novo app</button>
      <button class="btn" data-route="generator">⚙️ Gerar app</button>
      <button class="btn" data-route="settings">⚙️ Settings</button>
    </section>
  `,

  newapp: `
    <section class="card">
      <h2>Criar novo app</h2>
      <p>Preencha os dados abaixo para gerar a estrutura inicial.</p>

      <form id="newAppForm" class="form">
        <label class="label">
          Nome do app
          <input class="input" name="name" type="text" placeholder="Ex: RControl Orders" required />
        </label>

        <label class="label">
          ID do app (sem espaço)
          <input class="input" name="id" type="text" placeholder="ex: rcontrol-orders" required />
          <small class="hint">Use letras minúsculas, números e hífen.</small>
        </label>

        <label class="label">
          Tipo
          <select class="input" name="type">
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
      <p>Área para gerar/baixar os arquivos do app.</p>

      <div class="card subtle">
        <p><b>Status:</b> Em construção.</p>
        <p>Próximo passo: criar o gerador que monta pastas e arquivos a partir do formulário.</p>
      </div>
    </section>
  `,

  settings: `
    <section class="card">
      <h2>Settings</h2>
      <p>Configurações do Factory.</p>

      <div class="card subtle">
        <p><b>Modo:</b> Offline-first • Local mode</p>
        <p>Próximo passo: configurar nome da empresa, tema, logo, etc.</p>
      </div>
    </section>
  `,
};
