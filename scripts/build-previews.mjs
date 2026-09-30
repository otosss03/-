// 클립마다 링크 미리보기(디스코드, 카톡 등)용 페이지를 만든다: v/<id>/index.html
// GitHub Actions에서 몇 분마다 실행된다.
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SITE = "https://otosss03.github.io/-/";
const SUPABASE_URL = "https://uymatqpxhphwcacqawod.supabase.co";
const SUPABASE_KEY = "sb_publishable_lBUmlIbI6MEpVpKuC7fg-g_06z-voNe";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const r = await fetch(`${SUPABASE_URL}/rest/v1/clips?select=*&order=id.asc`, { headers: { apikey: SUPABASE_KEY } });
if (!r.ok) throw new Error(`Supabase ${r.status}`);
const clips = await r.json();
console.log(`clips: ${clips.length}`);

mkdirSync("v", { recursive: true });
mkdirSync("thumbs", { recursive: true });

function probe(url) {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", url], { timeout: 60000 }).toString().trim();
    const [w, h] = out.split(",").map(Number);
    return w && h ? { w, h } : null;
  } catch { return null; }
}

const keep = new Set();
for (const c of clips) {
  const id = String(c.id);
  keep.add(id);
  const pageUrl = `${SITE}v/${id}/`;
  const watchUrl = `${SITE}#w${id}`;
  const uploader = c.uploader || "익명";
  const desc = `${uploader} · ${c.game}`;
  let image, imgW = 480, imgH = 360, video = "";

  if (c.video_url) {
    const thumb = `thumbs/${id}.jpg`;
    const size = probe(c.video_url);
    if (!existsSync(thumb)) {
      try {
        execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", "1", "-i", c.video_url, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "4", thumb], { timeout: 120000 });
      } catch (e) { console.warn(`thumb failed for ${id}: ${e.message}`); }
    }
    if (existsSync(thumb)) { image = `${SITE}${thumb}`; if (size) { imgW = size.w; imgH = size.h; } }
    const vw = size?.w || 1280, vh = size?.h || 720;
    video = `
<meta property="og:video" content="${esc(c.video_url)}">
<meta property="og:video:secure_url" content="${esc(c.video_url)}">
<meta property="og:video:type" content="video/mp4">
<meta property="og:video:width" content="${vw}">
<meta property="og:video:height" content="${vh}">`;
  } else {
    image = `https://i.ytimg.com/vi/${c.video_id}/hqdefault.jpg`;
  }

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${esc(c.title)} - 현황</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#e8231d">
<meta property="og:site_name" content="현황">
<meta property="og:type" content="${c.video_url ? "video.other" : "website"}">
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${pageUrl}">
${image ? `<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="${imgW}">
<meta property="og:image:height" content="${imgH}">` : ""}${video}
<meta name="twitter:card" content="${c.video_url ? "player" : "summary_large_image"}">
<meta name="twitter:title" content="${esc(c.title)}">
${image ? `<meta name="twitter:image" content="${esc(image)}">` : ""}
<meta http-equiv="refresh" content="0; url=${watchUrl}">
<link rel="canonical" href="${pageUrl}">
</head>
<body>
<script>location.replace(${JSON.stringify(watchUrl)});</script>
<p><a href="${watchUrl}">${esc(c.title)} 보러 가기</a></p>
</body>
</html>
`;
  mkdirSync(`v/${id}`, { recursive: true });
  const file = `v/${id}/index.html`;
  if (!existsSync(file) || readFileSync(file, "utf8") !== html) writeFileSync(file, html);
}

// 삭제된 클립의 페이지와 썸네일 정리
for (const d of readdirSync("v")) if (!keep.has(d)) rmSync(`v/${d}`, { recursive: true, force: true });
for (const f of readdirSync("thumbs")) if (!keep.has(f.replace(/\.jpg$/, ""))) rmSync(`thumbs/${f}`, { force: true });
console.log("done");
