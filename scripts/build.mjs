import {cp, mkdir, rm, writeFile} from 'node:fs/promises';
const apiBase = (process.env.LENNYTYPE_API_URL || 'https://lennytype-api.lennytype.workers.dev').replace(/\/$/, '');
if (apiBase) {
  const url = new URL(apiBase);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) {
    throw new Error('LENNYTYPE_API_URL must use HTTPS (or HTTP on localhost).');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('LENNYTYPE_API_URL must be an origin, such as https://lennytype-api.example.workers.dev');
  }
}
await rm('dist/pages', {recursive:true, force:true});
await mkdir('dist/pages', {recursive:true});
await cp('public', 'dist/pages', {recursive:true});
for (const file of ['LICENSE','THIRD_PARTY_NOTICES.md']) await cp(file, `dist/pages/${file}`);
await writeFile('dist/pages/config.js', `window.LENNYTYPE_CONFIG = ${JSON.stringify({apiBase})};\n`);
await writeFile('dist/pages/.nojekyll', '');
console.log('Built GitHub Pages frontend in dist/pages.');
