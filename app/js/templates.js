export const templates = {
  home: `
    <section class="card">
      <h2>Bem-vindo 👋</h2>
      <p>Escolha uma ação abaixo.</p>
    </section>
  `,

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
  `,

  newApp: `
    <section class="card">
      <h2>Criar novo app</h2>
      <p>Preencha os dados abaixo para gerar a estrutura do app.</p>

      <form id="newAppForm" class="form">
        <label class="label">
          Nome do app
          <input class="input" type="text" name="appName" placeholder="Ex: RControl Estimates" required />
        </label>

        <label class="label">
          ID do app (sem espaço)
          <input class="input" type="text" name="appId" placeholder="Ex: rcontrol-estimates" required />
          <small class="hint">Use letras minúsculas e hífen. Ex: rcontrol-estimates</small>
        </label>

        <label class="label">
          Tipo
          <select class="input" name="appType" required>
            <option value="landing">Landing Page</option>
            <option value="pwa">PWA (app instalável)</option>
            <option value="internal">Interno (admin)</option>
          </select>
        </label>

        <label class="label">
          Cor principal
          <input class="input" type="color" name="primaryColor" value="#0b1220" />
        </label>

        <button class="btn primary" type="submit">Gerar estrutura</button>
      </form>

      <div id="newAppResult" class="result" style="display:none;"></div>
    </section>
  `,

  generator: `
    <section class="card">
      <h2>Gerar app</h2>
      <p>Em breve: geração automática de arquivos e download/commit.</p>
    </section>
  `,

  settings: `
    <section class="card">
      <h2>Settings</h2>
      <p>Em breve: configurações do Factory.</p>
    </section>
  `
};
