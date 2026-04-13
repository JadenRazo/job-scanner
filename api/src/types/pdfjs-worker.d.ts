// Ambient module declaration so we can `import` the pdfjs worker entry as a
// static dep. We don't use any of its exports — the import is only to force
// Next.js file tracing to include pdf.worker.mjs in the standalone bundle.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
