export function commandRisk(cmd, args, state) {
  const c = (cmd || "").toLowerCase();

  // SEMPRE SEGUROS (não mudam nada)
  if (["help", "list", "show", "diag"].includes(c)) return "SAFE";

  // SEGUROS (mudam pouco, reversível)
  if (["select", "set", "write", "create"].includes(c)) return "SAFE";

  // ARRISCADOS (mudanças grandes / deploy)
  if (["apply", "generator", "publish"].includes(c)) return "RISKY";

  // PERIGOSOS (destrutivo / limpeza / reset / cache / sw)
  if (["reset", "delete", "clearcache", "wipe", "cleanlogs"].includes(c)) return "DANGEROUS";

  return "RISKY";
}

export function fileRisk(filePath) {
  const f = (filePath || "").toLowerCase();

  // arquivos sensíveis: PWA / cache / segurança
  if (["sw.js", "manifest.json"].includes(f)) return "DANGEROUS";

  // sensíveis médios
  if (["index.html"].includes(f)) return "RISKY";

  // geralmente ok
  if (["styles.css", "app.js"].includes(f)) return "SAFE";

  return "RISKY";
}
