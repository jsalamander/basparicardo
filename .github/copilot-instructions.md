# Copilot instructions

- This repository is a plain Hugo site.
- The site theme lives in `themes/basparicardo`.

- MUST:
  - Use Hugo templates, partials, and front matter before considering JavaScript-based solutions.
  - Keep template logic small and reusable; move repeated markup into partials.
  - Prefer Hugo built-ins (menus, taxonomies, pagination, params, `.Site.Data`) over custom workarounds.
  - Make theme/layout edits in `themes/basparicardo/layouts` unless a root-level override is intentional.
  - Reuse existing structure (`baseof.html`, `_default` templates, partials) before creating new templates.
  - Keep templates semantic and accessible (heading order, landmarks, descriptive links, alt text).
  - Keep front matter keys consistent across content; avoid one-off metadata fields.
  - Prefer Hugo `ref`/`relref` and relative internal links for internal navigation.
  - Keep content in Markdown; only use raw HTML when there is no practical Markdown/Hugo alternative.
  - Use Tailwind utility classes only in templates.
  - Never add custom CSS selectors, separate custom stylesheets, or inline `<style>` blocks.
  - Keep `assets/css/main.css` limited to required Tailwind directives.
  - Validate every site change with `npm run build`.

- SHOULD:
  - Prefer small Hugo layout/content changes over adding JavaScript or CSS complexity.
  - Avoid adding dependencies unless there is a clear recurring need.
  - Keep source content and layouts deterministic and free from generated artifacts.
  - Use `npm run dev` for local Hugo + Tailwind live reload while iterating.
