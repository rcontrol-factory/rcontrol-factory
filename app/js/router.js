import { templates } from "./templates.js";

export function navigate(route) {
  const app = document.getElementById("app");

  if (!app) return;

  if (route === "newapp") {
    app.innerHTML = templates.newApp;
  } else {
    app.innerHTML = templates.home;
  }
}
