#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const markdown = readFileSync(join(root, 'README.md'), 'utf8');
const template = readFileSync(join(__dirname, 'template.html'), 'utf8');

marked.setOptions({ gfm: true, breaks: false });
const body = marked.parse(markdown);

const html = template.replace('<!-- CONTENT -->', body);

const outDir = join(__dirname, 'dist');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), html, 'utf8');
console.log('Built docs/dist/index.html');
