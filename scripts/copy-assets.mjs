import { createRequire } from 'node:module';
import { mkdir, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const mathJaxSource = require.resolve('mathjax-full/es5/tex-svg-full.js');
const mathJaxTarget = path.resolve('dist/assets/mathjax/tex-svg-full.js');
const pdfWorkerSource = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
const pdfWorkerTarget = path.resolve('dist/assets/pdfjs/pdf.worker.mjs');

await rm(path.dirname(mathJaxTarget), { recursive: true, force: true });
await rm(path.dirname(pdfWorkerTarget), { recursive: true, force: true });
await mkdir(path.dirname(mathJaxTarget), { recursive: true });
await mkdir(path.dirname(pdfWorkerTarget), { recursive: true });
await copyFile(mathJaxSource, mathJaxTarget);
await copyFile(pdfWorkerSource, pdfWorkerTarget);
