import { templates } from "./templates.js";

export function navigate(route) {
  const app = document.getElementById("app");
  if (!app) return;

  // rotas válidas
  const view = templates[route] || templates.home;

  app.innerHTML = view;
  setActiveTab(route);
}

function setActiveTab(route) {
  document.querySelectorAll(".tab[data-route]").forEach((el) => {
    const r = el.getAttribute("data-route");
    el.classList.toggle("active", r === route);
  });
}
