/* FILE: /app/js/core/factory_ai_command_bridge.js
   RControl Factory — Factory AI Command Bridge
   v1.0.0
   - mapeia comandos simples do chat para ações locais da Factory
   - objetivo: permitir "run doctor", "open doctor", "open admin", "open tools"
*/
;(function (global) {
  "use strict";

  if (global.RCF_FACTORY_AI_COMMAND_BRIDGE && global.RCF_FACTORY_AI_COMMAND_BRIDGE.__v100) return;

  var VERSION = "v1.0.0";

  function nowISO() {
    try { return new Date().toISOString(); } catch (_) { return ""; }
  }

  function normalize(text) {
    return String(text || "").toLowerCase().trim();
  }

  function hasAny(text, words) {
    for (var i = 0; i < words.length; i++) {
      if (text.indexOf(words[i]) >= 0) return true;
    }
    return false;
  }

  function dispatch(evt, detail) {
    try { global.dispatchEvent(new CustomEvent(evt, { detail: detail || {} })); } catch (_) {}
  }

  function openDoctor() {
    try {
      if (global.RCF_DOCTOR_SCAN && typeof global.RCF_DOCTOR_SCAN.open === "function") {
        global.RCF_DOCTOR_SCAN.open();
        return { ok: true, command: "open_doctor" };
      }
    } catch (_) {}
    return { ok: false, command: "open_doctor", error: "RCF_DOCTOR_SCAN.open indisponível" };
  }

  function scanDoctor() {
    try {
      if (global.RCF_DOCTOR_SCAN && typeof global.RCF_DOCTOR_SCAN.scan === "function") {
        var result = global.RCF_DOCTOR_SCAN.scan();
        return { ok: true, command: "scan_doctor", result: result || null };
      }
    } catch (e) {
      return { ok: false, command: "scan_doctor", error: String(e && e.message || e) };
    }
    return { ok: false, command: "scan_doctor", error: "RCF_DOCTOR_SCAN.scan indisponível" };
  }

  function openAdmin() {
    try {
      dispatch("RCF:OPEN_ADMIN", { ts: nowISO() });
      return { ok: true, command: "open_admin" };
    } catch (e) {
      return { ok: false, command: "open_admin", error: String(e && e.message || e) };
    }
  }

  function openTools() {
    try {
      dispatch("RCF:OPEN_FACTORY_TOOLS", { ts: nowISO() });
      return { ok: true, command: "open_tools" };
    } catch (e) {
      return { ok: false, command: "open_tools", error: String(e && e.message || e) };
    }
  }

  function parseCommand(input) {
    var text = normalize(input);
    if (!text) return "";

    if (hasAny(text, ["doctor scan", "run doctor", "rodar doctor", "run doctor scan", "execute doctor scan", "doctor_scan"])) {
      return "scan_doctor";
    }
    if (hasAny(text, ["open doctor", "abrir doctor", "doctor modal"])) {
      return "open_doctor";
    }
    if (hasAny(text, ["open admin", "abrir admin"])) {
      return "open_admin";
    }
    if (hasAny(text, ["open tools", "abrir tools", "abrir tool", "open tool"])) {
      return "open_tools";
    }

    return "";
  }

  function execute(input) {
    var command = parseCommand(input);
    if (!command) return { ok: false, command: "", error: "comando não reconhecido" };

    if (command === "scan_doctor") return scanDoctor();
    if (command === "open_doctor") return openDoctor();
    if (command === "open_admin") return openAdmin();
    if (command === "open_tools") return openTools();

    return { ok: false, command: command, error: "comando sem handler" };
  }

  global.RCF_FACTORY_AI_COMMAND_BRIDGE = {
    __v100: true,
    version: VERSION,
    parseCommand: parseCommand,
    execute: execute
  };

  try {
    if (global.RCF_MODULE_REGISTRY && typeof global.RCF_MODULE_REGISTRY.register === "function") {
      global.RCF_MODULE_REGISTRY.register("factoryAICommandBridge");
    }
  } catch (_) {}

})(window);
