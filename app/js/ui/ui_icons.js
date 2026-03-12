/* FILE: /app/js/ui/ui_icons.js
   Placeholder icon registry for Factory UI
*/
(() => {
"use strict";

const ICONS = {
  dashboard:"⬛",
  apps:"📦",
  editor:"✏️",
  generator:"⚙️",
  agent:"🤖",
  factory:"🏭",
  logs:"📜",
  system:"🛠"
};

function get(name){
  return ICONS[name] || "•";
}

window.RCF_UI_ICONS = {get};

})();
