import { templates } from "./templates.js";

export function navigate(route, data = {}) {
  const app = document.getElementById("app");
  if (!app) return;

  const r = (route || "home").toLowerCase();

  if (r === "newapp") app.innerHTML = templates.newApp;
  else if (r === "generator") app.innerHTML = templates.generator;
  else if (r === "settings") app.innerHTML = templates.settings;
  else app.innerHTML = templates.home;

  // evento de “tela carregada”
  window.dispatchEvent(new CustomEvent("route:changed", { detail: { route: r, data } }));
}
