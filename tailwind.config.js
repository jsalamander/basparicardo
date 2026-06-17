module.exports = {
  content: [
    "./content/**/*.{md,html}",
    "./layouts/**/*.html",
    "./themes/**/*.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        "display-oswald": ['"Oswald"', 'sans-serif'],
        "display-anton": ['"Anton"', 'sans-serif'],
        "display-barlow": ['"Barlow Condensed"', 'sans-serif'],
        "ui-sora": ['"Sora"', 'system-ui', 'sans-serif'],
        "ui-manrope": ['"Manrope"', 'system-ui', 'sans-serif'],
        "ui-inter": ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
