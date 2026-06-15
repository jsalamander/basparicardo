# Copilot instructions

- This repository is a plain Hugo site.
- The site theme lives in `themes/basparicardo`.
- Theme templates must use Tailwind utility classes only.
- Never add custom CSS selectors, separate custom stylesheet rules, or inline `<style>` blocks.
- Keep `assets/css/main.css` limited to the Tailwind directives required to build the stylesheet.
- Prefer small Hugo layout changes over introducing JavaScript or CSS complexity.
- Validate site changes with `npm run build`, and use `npm run dev` for local Hugo + Tailwind live reload.
