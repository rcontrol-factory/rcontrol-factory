/* FILE: /app/js/ui/ui_tokens.js
   RControl Factory — UI Tokens
   - Patch leve
   - Tokens/config central do visual da Factory
   - Sem mexer no core crítico
*/
(() => {
  "use strict";

  const TOKENS = {
    version: "rcf-ui-tokens-v1",
    brand: {
      title: "FACTORY",
      subtitle: "by RCONTROL"
    },
    sections: {
      dashboard: {
        title: "Factory Dashboard",
        subtitle: "Painel principal da RControl Factory com visão rápida dos módulos e operações."
      },
      appsWidgets: {
        title: "Apps & Widgets",
        subtitle: "Camada visual de recursos, apps e integrações da Factory."
      },
      projects: {
        title: "Projects",
        subtitle: "Projetos ativos e execução visual de código/deploy."
      }
    },
    nav: [
      { key: "home", label: "Home", view: "dashboard" },
      { key: "apps", label: "Apps", view: "newapp" },
      { key: "editor", label: "Editor", view: "editor" },
      { key: "agent", label: "Agent", view: "agent" },
      { key: "factory", label: "Factory", view: "admin" }
    ],
    dashboardMenu: [
      {
        key: "dashboard",
        title: "Dashboard",
        subtitle: "Status & Controle",
        icon: "dashboard",
        view: "dashboard"
      },
      {
        key: "apps",
        title: "Apps",
        subtitle: "Criar & Gerenciar",
        icon: "apps",
        view: "newapp"
      },
      {
        key: "editor",
        title: "Editor",
        subtitle: "Projetos & Código",
        icon: "editor",
        view: "editor"
      },
      {
        key: "agent",
        title: "Agent",
        subtitle: "IA + Automação",
        icon: "agent",
        view: "agent"
      },
      {
        key: "factory",
        title: "Factory",
        subtitle: "Sistema & Tools",
        icon: "factory",
        view: "admin"
      }
    ],
    appsWidgets: [
      {
        key: "app-store",
        title: "App Store",
        subtitle: "Biblioteca de aplicativos e blocos reutilizáveis",
        icon: "apps"
      },
      {
        key: "chat-ia",
        title: "Chat IA",
        subtitle: "Assistência inteligente para criação e operação",
        icon: "agent"
      },
      {
        key: "site-builder",
        title: "Site Builder",
        subtitle: "Montagem visual de páginas e estruturas",
        icon: "editor"
      }
    ],
    gateways: [
      {
        key: "messages",
        title: "Messages",
        subtitle: "Fluxos e comunicação entre módulos",
        icon: "dashboard"
      },
      {
        key: "webhooks",
        title: "Webhooks",
        subtitle: "Disparos externos e automações conectadas",
        icon: "factory"
      },
      {
        key: "bridge",
        title: "Bridge",
        subtitle: "Camada segura de conexão entre serviços",
        icon: "agent"
      }
    ],
    projects: [
      {
        key: "painel-central",
        title: "Painel Central",
        subtitle: "Core visual e operação principal"
      },
      {
        key: "chat-ia",
        title: "Chat IA",
        subtitle: "Módulo conversacional e automação"
      },
      {
        key: "app-booking",
        title: "App Booking",
        subtitle: "Aplicação em construção e integração"
      }
    ],
    codePreview: [
      "var AUTO_TRIGGER = true;",
      "var WAIT_TIME = '1h';",
      "",
      "function startFactoryDeploy(){",
      "  return 'Factory running...';",
      "}",
      "",
      "startFactoryDeploy();"
    ].join("\n")
  };

  try {
    window.RCF_UI_TOKENS = TOKENS;
  } catch {}
})();
