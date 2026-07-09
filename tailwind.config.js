module.exports = {
  content: [
    "./content/**/*.{md,html}",
    "./layouts/**/*.html",
    "./themes/**/*.html",
  ],
  safelist: [
    "rounded-2xl",
    "border",
    "border-[#fbf4c2]/30",
    "bg-[rgba(0,0,0,0.80)]",
    "shadow-[0_14px_38px_rgba(0,0,0,0.44)]",
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
