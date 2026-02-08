import { templates } from "./templates.js";

function setActiveTab(route) {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((t) => t.classList.remove("active"));

  const match = Array.from(tabs).find((t) => t.getAttribute("data-route") === route);
  if (match) match.classList.add("active");
}

export function navigate(route) {
  const app = document.getElementById("app");
  if (!app) return;

  const r = route || "home";

  if (r === "home" || r === "dashboard") {
    app.innerHTML = templates.home;
    setActiveTab("home");
  } else if (r === "newapp") {
    app.innerHTML = templates.newApp;
    setActiveTab("newapp");
  } else if (r === "generator") {
    app.innerHTML = templates.generator;
    setActiveTab("generator");
  } else if (r === "settings") {
    app.innerHTML = templates.settings;
    setActiveTab("settings");
  } else {
    app.innerHTML = templates.home;
    setActiveTab("home");
  }

  document.dispatchEvent(new CustomEvent("route:changed", { detail: { route: r } }));
} 
