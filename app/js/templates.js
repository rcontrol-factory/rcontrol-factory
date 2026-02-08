export const templates = {
  home: `
    <section class="card">
      <h2>Bem-vindo 👋</h2>
      <p>Factory interna para criar aplicativos da RControl.</p>
    </section>

    <div class="actions">
      <button class="btn primary" data-route="newapp">+ Criar novo app</button>
      <button class="btn" data-route="generator">⚙️ Gerar / Publicar</button>
      <button class="btn" data-route="settings">⚙️ Settings</button>
    </div>

    <section class="card subtle">
      <h3>Apps salvos</h3>
      <div id="appsList" class="list"></div>
      <p class="hint">Toque em um app pra abrir o Generator já selecionado.</p>
    </section>
  `,

  newApp: `
    <section class="card">
      <h2>Criar novo app</h2>
      <p>Preencha os dados abaixo para gerar a estrutura inicial.</p>

      <form id="newAppForm" class="form">
        <label class="label">
          Nome do app
          <input class="input" name="name" type="text" placeholder="Ex: AirQuotes" required />
        </label>

        <label class="label">
          ID do app (sem espaço)
          <input class="input" name="id" type="text" placeholder="ex: airquotes" required />
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
        <p>Depois vá em <b>Generator</b> para baixar ZIP ou publicar e pegar o link.</p>
      </div>
    </section>
  `,

  generator: `
    <section class="card">
      <h2>Generator</h2>
      <p>Escolha um app salvo e baixe o ZIP ou publique para ter um link de teste.</p>

      <div class="form">
        <label class="label">
          App salvo
          <select id="genSelect" class="input"></select>
        </label>

        <div class="actions">
          <button id="btnZip" class="btn primary" type="button">⬇️ Baixar ZIP</button>
          <button id="btnPublish" class="btn" type="button">🚀 Publicar (GitHub Pages)</button>
          <button class="btn" data-route="home" type="button">Voltar</button>
        </div>

        <div id="genStatus" class="card subtle">
          <b>Status:</b> aguardando…
        </div>

        <div id="publishResult" class="card subtle" style="display:none;">
          <h3>Link do app</h3>
          <p id="publishLinkWrap"></p>
          <small class="hint">Se for a primeira vez, pode levar alguns segundos pra Pages subir.</small>
        </div>
      </div>
    </section>
  `,

  settings: `
    <section class="card">
      <h2>Settings</h2>
      <p>Configurações do Factory (local no seu dispositivo).</p>

      <form id="settingsForm" class="form">
        <label class="label">
          GitHub username
          <input class="input" name="ghUser" type="text" placeholder="ex: mateussantana" />
        </label>

        <label class="label">
          GitHub Token (PAT)
          <input class="input" name="ghToken" type="password" placeholder="cola o token aqui" />
          <small class="hint">Permissão mínima: Repo contents (read/write). Fica salvo só no seu celular.</small>
        </label>

        <label class="label">
          Prefixo do repositório
          <input class="input" name="repoPrefix" type="text" placeholder="ex: rapp-" />
          <small class="hint">O repo final vira: prefixo + id do app (ex: rapp-airquotes)</small>
        </label>

        <button class="btn primary" type="submit">Salvar Settings</button>
      </form>

      <div class="card subtle">
        <h3>Como pegar o link</h3>
        <p>Depois de publicar, o link fica no Generator.</p>
      </div>
    </section>
  `
};
