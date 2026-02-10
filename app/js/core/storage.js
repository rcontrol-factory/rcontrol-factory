export const Storage = {
  getJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  setJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};
