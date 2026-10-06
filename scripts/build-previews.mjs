// 클립마다 링크 미리보기(디스코드, 카톡 등)용 페이지를 만든다: v/<id>/index.html
// GitHub Actions에서 몇 분마다 실행된다.
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SITE = "https://otosss03.github.io/-/";
const SUPABASE_URL = "https://uymatqpxhphwcacqawod.supabase.co";
const SUPABASE_KEY = "sb_publishable_lBUmlIbI6MEpVpKuC7fg-g_06z-voNe";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

let r;
try {
  r = await fetch(`${SUPABASE_URL}/rest/v1/clips?select=*&order=id.asc`, { headers: { apikey: SUPABASE_KEY } });
} catch (e) {
  console.log(`::error::Supabase 연결 실패: ${e.message} ${e.cause?.code || ""}`);
  process.exit(1);
}
if (!r.ok) {
  const body = (await r.text()).replace(/\s+/g, " ").slice(0, 400);
  console.log(`::warning::Supabase ${r.status}: ${body}`);
  process.exit(0); // 막혀 있으면 이번엔 건너뜀 (기존 페이지/백업 목록 유지)
}
const clips = await r.json();
// Supabase가 막혔을 때 사이트가 대신 쓰는 백업 목록
writeFileSync("clips.json", JSON.stringify(clips.map(({ id, video_id, video_url, start_sec, title, game, uploader, views, duration_sec, created_at, thumb_url }) =>
  ({ id, video_id, video_url, start_sec, title, game, uploader, views, duration_sec, created_at, thumb_url }))));
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

// 직접 올린 썸네일은 작게 줄인 복사본을 GitHub에 둔다 (Supabase 전송량 절약)
const customMapFile = "thumbs/custom.json";
const customMap = existsSync(customMapFile) ? JSON.parse(readFileSync(customMapFile, "utf8")) : {};
function mirrorThumb(id, url) {
  const out = `thumbs/c${id}.jpg`;
  if (customMap[id] === url && existsSync(out)) return out;
  try {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", url, "-frames:v", "1", "-vf", "scale='min(640,iw)':-2", "-q:v", "6", out], { timeout: 60000 });
    customMap[id] = url;
    return out;
  } catch (e) { console.warn(`custom thumb failed for ${id}: ${e.message}`); return null; }
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
    const size = existsSync(`v/${id}/index.html`) ? null : probe(c.video_url);
    if (!c.thumb_url && !existsSync(thumb)) {
      try {
        execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", "1", "-i", c.video_url, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "4", thumb], { timeout: 120000 });
      } catch (e) { console.warn(`thumb failed for ${id}: ${e.message}`); }
    }
    if (existsSync(thumb)) { image = `${SITE}${thumb}`; if (size) { imgW = size.w; imgH = size.h; } }
    if (c.thumb_url) { const m = mirrorThumb(id, c.thumb_url); image = m ? `${SITE}${m}` : c.thumb_url; imgW = 640; imgH = 360; }
    const vw = size?.w || 1280, vh = size?.h || 720;
    video = `
<meta property="og:video" content="${esc(c.video_url)}">
<meta property="og:video:secure_url" content="${esc(c.video_url)}">
<meta property="og:video:type" content="video/mp4">
<meta property="og:video:width" content="${vw}">
<meta property="og:video:height" content="${vh}">`;
  } else {
    image = `https://i.ytimg.com/vi/${c.video_id}/hqdefault.jpg`;
    if (c.thumb_url) { const m = mirrorThumb(id, c.thumb_url); image = m ? `${SITE}${m}` : c.thumb_url; imgW = 640; imgH = 360; }
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
const hasCustom = new Set(clips.filter((c) => c.thumb_url).map((c) => String(c.id)));
for (const k of Object.keys(customMap)) if (!hasCustom.has(k)) delete customMap[k];
writeFileSync(customMapFile, JSON.stringify(customMap));
for (const f of readdirSync("thumbs")) {
  if (f === "custom.json") continue;
  const m = f.match(/^(c?)(\d+)\.jpg$/);
  if (!m || !keep.has(m[2]) || (m[1] && !hasCustom.has(m[2]))) rmSync(`thumbs/${f}`, { force: true });
}
console.log("done");
