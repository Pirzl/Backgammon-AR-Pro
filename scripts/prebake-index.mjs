// G2 — PRERENDER (dependency-free prebake)
// Injects static, crawlable marketing copy into the built dist/index.html #root
// so search engines see real content instead of an empty <div id="root">.
// React overwrites #root on hydrate, so this is harmless for real users.
// Run automatically via the "postbuild" npm script.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(__dirname, '../dist/index.html');

// Static hero / features copy mirroring the LandingPage headline content.
const prerendered = `
  <section class="vivo-prerender" style="max-width:1100px;margin:0 auto;padding:4rem 1.5rem;font-family:'Outfit',system-ui,sans-serif;color:#f5f5f5;">
    <h1 style="font-size:clamp(2rem,5vw,3.5rem);font-weight:800;line-height:1.05;margin:0 0 1rem;background:linear-gradient(90deg,#ffd27d,#ffb347);-webkit-background-clip:text;background-clip:text;color:transparent;">
      Backgammon VIVO — El Futuro del Backgammon Online
    </h1>
    <p style="font-size:1.15rem;max-width:42rem;color:#cfcfcf;margin:0 0 2rem;">
      Juega al Backgammon online contra humanos o frente a nuestra IA «Gran Maestro». Disfruta de
      registro CRM, apuestas por puntos, ranking global, videollamadas integradas y nuestra
      innovadora tecnología <strong>Hand-Tracking</strong> (mueve las fichas con gestos de tu cámara web).
    </p>
    <div style="display:flex;flex-wrap:wrap;gap:1rem;margin-bottom:2rem;">
      <a href="/game?mode=ai" style="background:linear-gradient(90deg,#f0a94f,#ffb347);color:#1a1206;font-weight:700;padding:.85rem 1.6rem;border-radius:.75rem;text-decoration:none;">Jugar vs IA</a>
      <a href="/game?mode=local" style="border:1px solid rgba(255,255,255,.25);color:#fff;font-weight:700;padding:.85rem 1.6rem;border-radius:.75rem;text-decoration:none;">2 Jugadores</a>
    </div>
    <ul style="list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;max-width:56rem;">
      <li style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:1rem;padding:1.25rem;"><strong>IA Gran Maestro</strong><br/><span style="color:#a9a9a9;">Dificultad adaptativa con expectimax.</span></li>
      <li style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:1rem;padding:1.25rem;"><strong>Hand-Tracking</strong><br/><span style="color:#a9a9a9;">Controla el tablero con la cámara frontal.</span></li>
      <li style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:1rem;padding:1.25rem;"><strong>Videollamada integrada</strong><br/><span style="color:#a9a9a9;">Juega cara a cara con amigos.</span></li>
      <li style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:1rem;padding:1.25rem;"><strong>Ranking CRM</strong><br/><span style="color:#a9a9a9;">Sube en el ranking global de jugadores.</span></li>
    </ul>
  </section>
`;

try {
  const html = readFileSync(indexPath, 'utf8');
  if (html.includes('vivo-prerender')) {
    console.log('[prebake] index.html already prebaked — skipping.');
    process.exit(0);
  }
  const updated = html.replace(
    /(<main id="root"[^>]*>)(<\/main>)/,
    `$1${prerendered}$2`
  );
  if (updated === html) {
    console.warn('[prebake] could not locate #root — index.html unchanged.');
    process.exit(0);
  }
  writeFileSync(indexPath, updated, 'utf8');
  console.log('[prebake] injected static landing content into dist/index.html');
} catch (err) {
  console.error('[prebake] failed:', err);
  process.exit(1);
}
