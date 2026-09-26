export default {
  locales: ["en", "fr", "es"],
  sourceLocale: "en",
  catalogs: [
    {
      path: "<rootDir>/locales/{locale}/messages",
      include: ["<rootDir>/app", "<rootDir>/components", "<rootDir>/lib"],
      exclude: ["**/node_modules/**", "**/dist/**"],
    },
  ],
  format: "po",
};
