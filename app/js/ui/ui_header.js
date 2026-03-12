/* FILE: /app/js/ui/ui_header.js
   RControl Factory — UI Header enhancer
   - Ajusta branding/header sem pesar app.js
   - Seguro e tolerante
*/
(() => {
  "use strict";

  const API = {
    mount() {
      try {
        this.patchHeaderLogo();
        this.patchBrandText();
        return true;
      } catch {
        return false;
      }
    },

    patchHeaderLogo() {
      const brand = document.querySelector("#rcfRoot .brand");
      if (!brand) return false;

      let logo = brand.querySelector(".factory-logo-header");
      if (!logo) {
        logo = document.createElement("img");
        logo.className = "factory-logo-header";
        logo.alt = "Factory by RCONTROL";
        logo.src = "./assets/factory-header-logo.png";
        brand.insertBefore(logo, brand.firstChild);
      } else {
        logo.src = "./assets/factory-header-logo.png";
        logo.alt = "Factory by RCONTROL";
      }

      const dot = brand.querySelector(".dot");
      if (dot) dot.style.display = "none";

      return true;
    },

    patchBrandText() {
      const brand = document.querySelector("#rcfRoot .brand");
      if (!brand) return false;

      let textWrap = brand.querySelector(".brand-text");
      if (!textWrap) {
        textWrap = document.createElement("div");
        textWrap.className = "brand-text";
        brand.appendChild(textWrap);
      }

      let title = textWrap.querySelector(".title");
      if (!title) {
        title = document.createElement("div");
        title.className = "title";
        textWrap.appendChild(title);
      }

      let subtitle = textWrap.querySelector(".subtitle");
      if (!subtitle) {
        subtitle = document.createElement("div");
        subtitle.className = "subtitle";
        textWrap.appendChild(subtitle);
      }

      title.textContent = "FACTORY";
      subtitle.textContent = "by RCONTROL";

      return true;
    },

    remountLater() {
      try {
        setTimeout(() => this.mount(), 40);
        setTimeout(() => this.mount(), 180);
        setTimeout(() => this.mount(), 520);
      } catch {}
    }
  };

  try {
    window.RCF_UI_HEADER = API;
  } catch {}

  try {
    document.addEventListener("DOMContentLoaded", () => {
      try { API.remountLater(); } catch {}
    }, { passive: true });
  } catch {}

  try {
    window.addEventListener("RCF:UI_READY", () => {
      try { API.remountLater(); } catch {}
    });
  } catch {}
})();
