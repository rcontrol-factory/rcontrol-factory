(() => {
  "use strict";

  const RULES = {
    component: "/components",
    screen: "/screens",
    style: "/themes",
    service: "/core",
    engine: "/engine",
    config: "/core/config"
  };

  function detectType(code) {
    if (!code) return "unknown";

    if (code.includes("createComponent") || code.includes("export function"))
      return "component";

    if (code.includes("render(") && code.includes("view"))
      return "screen";

    if (code.includes(":root") || code.includes("--"))
      return "style";

    if (code.includes("fetch(") || code.includes("async function"))
      return "service";

    if (code.includes("class") && code.includes("Engine"))
      return "engine";

    if (code.includes("CONFIG") || code.includes("settings"))
      return "config";

    return "unknown";
  }

  function calculateDestination(type) {
    return RULES[type] || "/misc";
  }

  function analyze(code, filename) {
    const type = detectType(code);
    const destination = calculateDestination(type);

    return {
      detectedType: type,
      destination,
      risk: classifyRisk(type),
      filename
    };
  }

  function classifyRisk(type) {
    switch (type) {
      case "style":
        return "LOW";
      case "component":
        return "LOW";
      case "screen":
        return "MEDIUM";
      case "service":
        return "HIGH";
      case "engine":
        return "HIGH";
      case "config":
        return "HIGH";
      default:
        return "UNKNOWN";
    }
  }

  window.RCF_ORGANIZER = {
    analyze
  };

})();
