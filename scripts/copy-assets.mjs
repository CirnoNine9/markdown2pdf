import { createRequire } from 'node:module';
import { mkdir, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const mathJaxSource = require.resolve('mathjax-full/es5/tex-svg-full.js');
const mathJaxTarget = path.resolve('dist/assets/mathjax/tex-svg-full.js');

await rm(path.dirname(mathJaxTarget), { recursive: true, force: true });
await mkdir(path.dirname(mathJaxTarget), { recursive: true });
await copyFile(mathJaxSource, mathJaxTarget);
