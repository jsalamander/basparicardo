# basparicardo

Website basparicardo.ch, built as a plain Hugo site with a Tailwind-only theme.

## Prerequisites

- [Hugo](https://gohugo.io/installation/) 0.149 or newer
- Node.js 22 or newer

## Development

Install dependencies:

```bash
npm install
```

Start Hugo and the Tailwind watcher with live reload:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

## Theme rules

- Templates should use Tailwind utility classes only.
- Do not add custom CSS files, selectors, or inline `<style>` blocks.
- The only stylesheet source file is the Tailwind entrypoint at `assets/css/main.css`.
