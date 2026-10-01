// Vercel에서 /v/<id>/ 요청이 오면 그 자리에서 미리보기(썸네일) 페이지를 만들어 준다.
// 새 클립도 기다릴 필요 없이 바로 디스코드 썸네일이 뜬다.
const SUPABASE_URL = "https://uymatqpxhphwcacqawod.supabase.co";
const SUPABASE_KEY = "sb_publishable_lBUmlIbI6MEpVpKuC7fg-g_06z-voNe";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

export default async function handler(req, res) {
  const id = String(req.query.id || "").replace(/\D/g, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const site = `https://${host}/`;
  const watchUrl = `${site}#w${id}`;

  let c = null;
  if (id) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/clips?select=*&id=eq.${id}`, { headers: { apikey: SUPABASE_KEY } });
      if (r.ok) c = (await r.json())[0] || null;
    } catch {}
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");

  if (!c) {
    res.status(404).send(`<!doctype html><meta charset="utf-8"><title>현황</title><meta http-equiv="refresh" content="0; url=${site}"><a href="${site}">현황으로 가기</a>`);
    return;
  }

  const desc = `${c.uploader || "익명"} · ${c.game}`;
  const autoThumb = `${site}thumbs/${c.id}.jpg`;
  const image = c.thumb_url
    || (c.video_id ? `https://i.ytimg.com/vi/${c.video_id}/hqdefault.jpg` : null)
    || autoThumb;
  const video = c.video_url ? `
<meta property="og:video" content="${esc(c.video_url)}">
<meta property="og:video:secure_url" content="${esc(c.video_url)}">
<meta property="og:video:type" content="video/mp4">
<meta property="og:video:width" content="1280">
<meta property="og:video:height" content="720">` : "";

  res.status(200).send(`<!doctype html>
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
<meta property="og:url" content="${site}v/${c.id}/">
<meta property="og:image" content="${esc(image)}">${video}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(c.title)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0; url=${watchUrl}">
</head>
<body>
<script>location.replace(${JSON.stringify(watchUrl)});</script>
<p><a href="${watchUrl}">${esc(c.title)} 보러 가기</a></p>
</body>
</html>`);
}
