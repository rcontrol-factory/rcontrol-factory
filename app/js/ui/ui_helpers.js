/* FILE: /app/js/ui/ui_helpers.js
   UI helper utilities for RControl Factory
*/
(() => {
"use strict";

function $(sel,root=document){
  try{return root.querySelector(sel);}catch{return null;}
}

function $$(sel,root=document){
  try{return Array.from(root.querySelectorAll(sel));}catch{return [];}
}

function safeText(el,text){
  if(!el) return;
  try{el.textContent = String(text ?? "");}catch{}
}

function safeHTML(el,html){
  if(!el) return;
  try{el.innerHTML = String(html ?? "");}catch{}
}

function toggleClass(el,cls,on){
  if(!el) return;
  try{
    if(on===undefined) el.classList.toggle(cls);
    else on ? el.classList.add(cls) : el.classList.remove(cls);
  }catch{}
}

window.RCF_UI_HELPERS = {
  $,
  $$,
  safeText,
  safeHTML,
  toggleClass
};

})();
