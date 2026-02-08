import { navigate } from "./router.js";

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-route]");
  if (!btn) return;

  const route = btn.getAttribute("data-route");
  navigate(route);
});

// carrega tela inicial
navigate("home");
