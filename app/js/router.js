import { templates } from "./templates.js";

export function navigate(route) {
  const app = document.getElementById("app");
  if (!app) return;

  if (route === "newapp") app.innerHTML = templates.newApp;
  else if (route === "generator") app.innerHTML = templates.generator;
  else if (route === "settings") app.innerHTML = templates.settings;
  else app.innerHTML = templates.home;

  // sempre que entrar no Home, renderiza lista
  if (route === "home" || !route) {
    setTimeout(() => window.renderAppsList && window.renderAppsList(), 0);
  }
}
