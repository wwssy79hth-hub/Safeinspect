/* SafeInspect — client portal
 *
 * The asset owner's surface, adapted from HeightTrack's portal
 * (extraction plan item 7). Read-only by construction: this app has
 * no write path at all, and row-level security refuses every write
 * from a portal member regardless. What a viewer can see is decided
 * entirely by their client_members row — supabase/tests/portal_test.sql
 * proves a member cannot cross into another client's records, and that
 * uncertified field work stays invisible.
 */

const cfg = window.SAFEINSPECT_CONFIG;
const db = supabase.createClient(cfg.url, cfg.key);

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ── Calendar dates ───────────────────────────────────────────
 * `date` columns are calendar dates at the site, with no timezone.
 * They stay strings: parsing them into a JS Date and formatting in
 * the browser's zone reintroduces the off-by-one-day bug, and a
 * portal is read by people in other states. ISO-8601 compares
 * lexically, so "is this overdue" needs no date maths.
 */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function showDate(iso) {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
const today = () => new Date().toISOString().slice(0, 10); // UTC is fine: only compared to dates
const isOverdue = (due) => !!due && due < today();

const CATEGORY_LABELS = {
  APS: "Access Point Signage", ST: "Strops", TMAP: "Top Mount Anchor Point",
  CAP: "Concrete Anchor Point", HSL: "Horizontal Static Line", VSL: "Vertical Static Line",
  LD: "Ladder", GR: "Guardrail", WW: "Walkway", STP: "Step", STR: "Stair",
  SL: "Step Ladder", EK: "Guardrail Entry Kit", PL: "Platform", GHK: "Guardrail Hatch Kit",
  SS: "Safety Signage", DB: "Davit Base", RR: "Rigid Rail System",
  SPM: "Skylight Protection Mesh", OSE: "Other Safety Equipment", R: "Recommendation",
};
const catLabel = (c) => CATEGORY_LABELS[c] ?? c;

/* ── State ────────────────────────────────────────────────── */
let state = { email: null, sites: [], assets: [], certs: [] };

/* ── Views ────────────────────────────────────────────────── */
function showLogin() {
  $("login").classList.remove("hidden");
  $("app").classList.add("hidden");
  $("bar").classList.add("hidden");
}

function showApp() {
  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("bar").classList.remove("hidden");
  $("who").textContent = state.email ?? "";
}

function siteSummary(siteId) {
  const assets = state.assets.filter((a) => a.site_id === siteId);
  const overdue = assets.filter((a) => isOverdue(a.next_due_on)).length;
  const uncertified = assets.filter((a) => !a.next_due_on).length;
  const doNotUse = assets.filter((a) => a.status === "do_not_use").length;
  const upcoming = assets
    .map((a) => a.next_due_on)
    .filter(Boolean)
    .sort()[0] ?? null;
  return { total: assets.length, overdue, uncertified, doNotUse, upcoming };
}

function renderSites() {
  const host = $("app");
  if (!state.sites.length) {
    host.innerHTML = `<div class="empty">No sites are shared with your organisation yet.</div>`;
    return;
  }

  const cards = state.sites.map((s) => {
    const k = siteSummary(s.id);
    const attention = k.overdue + k.uncertified + k.doNotUse;
    const pill = attention === 0
      ? `<span class="pill ok">COMPLIANT</span>`
      : `<span class="pill bad">${attention} NEED ATTENTION</span>`;
    const harsh = s.service_condition === "harsh"
      ? ` <span class="pill flat">HARSH</span>` : "";

    return `
      <div class="card click" data-site="${esc(s.id)}">
        <div class="row">
          <div class="grow">
            <div class="site-name">${esc(s.name)}</div>
            <div class="muted">${esc(s.address ?? "")}</div>
          </div>
          <div>${pill}${harsh}</div>
        </div>
        <div class="stats">
          <div class="stat"><div class="n">${k.total}</div><div class="l">Assets</div></div>
          <div class="stat"><div class="n">${k.overdue}</div><div class="l">Overdue</div></div>
          <div class="stat"><div class="n">${k.uncertified}</div><div class="l">Uncertified</div></div>
          <div class="stat"><div class="n">${k.doNotUse}</div><div class="l">Do not use</div></div>
          <div class="stat"><div class="n">${showDate(k.upcoming)}</div><div class="l">Next due</div></div>
        </div>
      </div>`;
  }).join("");

  host.innerHTML = `
    <h1>Your sites</h1>
    <p class="sub">Height-safety compliance across the sites your organisation owns.</p>
    ${cards}`;

  host.querySelectorAll("[data-site]").forEach((el) =>
    el.addEventListener("click", () => renderSite(el.dataset.site)));
}

function renderSite(siteId) {
  const site = state.sites.find((s) => s.id === siteId);
  if (!site) return renderSites();

  const assets = state.assets.filter((a) => a.site_id === siteId);
  const certs = state.certs.filter((c) => c.site_id === siteId);

  const rows = assets.map((a) => {
    let status, cls;
    if (a.status === "do_not_use")      { status = "DO NOT USE"; cls = "bad"; }
    else if (!a.next_due_on)            { status = "NOT CERTIFIED"; cls = "warn"; }
    else if (isOverdue(a.next_due_on))  { status = "OVERDUE"; cls = "bad"; }
    else                                { status = "CURRENT"; cls = "ok"; }

    return `<tr>
      <td class="tag">${esc(a.tag)}</td>
      <td>${esc(catLabel(a.category))}</td>
      <td class="muted">${esc(a.location_note ?? "")}</td>
      <td><span class="pill ${cls}">${status}</span></td>
      <td class="num">${showDate(a.last_pass_on)}</td>
      <td class="num">${showDate(a.next_due_on)}</td>
    </tr>`;
  }).join("");

  const certRows = certs.length ? certs.map((c) => `
    <tr class="click" data-cert="${esc(c.id)}">
      <td class="tag">${esc(c.certificate_number)}</td>
      <td class="num">${showDate(c.issued_at.slice(0, 10))}</td>
      <td class="num">${showDate(c.expires_on)}${
        isOverdue(c.expires_on) ? ` <span class="pill bad">EXPIRED</span>` : ""}</td>
      <td class="num">${c.compliant_count} / ${c.asset_count}</td>
      <td>${c.asset_count - c.compliant_count > 0
            ? `<span class="pill warn">${c.asset_count - c.compliant_count} NOT COMPLIANT</span>`
            : `<span class="pill ok">ALL COMPLIANT</span>`}</td>
      <td class="muted">${esc(c.standard_line)}</td>
    </tr>`).join("")
    : `<tr><td colspan="6" class="empty">No certificates issued for this site yet.</td></tr>`;

  $("app").innerHTML = `
    <button class="backlink" id="back">← All sites</button>
    <h1>${esc(site.name)}</h1>
    <p class="sub">${esc(site.address ?? "")}</p>

    <h2>Asset register</h2>
    <div class="tablewrap">
      <table>
        <thead><tr>
          <th>Tag</th><th>Type</th><th>Location</th><th>Status</th>
          <th>Last pass</th><th>Next due</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="empty">No assets recorded.</td></tr>`}</tbody>
      </table>
    </div>

    <h2>Certificates</h2>
    <div class="tablewrap">
      <table>
        <thead><tr>
          <th>Number</th><th>Issued</th><th>Expires</th>
          <th>Compliant</th><th>Result</th><th>Standards</th>
        </tr></thead>
        <tbody>${certRows}</tbody>
      </table>
    </div>`;

  $("back").addEventListener("click", renderSites);
  $("app").querySelectorAll("[data-cert]").forEach((el) =>
    el.addEventListener("click", () => renderCertificate(el.dataset.cert, siteId)));
}

/* ── Certificate detail ───────────────────────────────────────
 * Evidence is fetched through SHORT-LIVED SIGNED URLS generated at
 * read time and never persisted. A leaked certificate row therefore
 * does not leak the photographs with it, and a URL copied out of the
 * page stops working in five minutes. Storage RLS still decides
 * whether the signature is issued at all.
 */
async function renderCertificate(certId, siteId) {
  const cert = state.certs.find((c) => c.id === certId);
  if (!cert) return renderSites();

  $("app").innerHTML = `<div class="empty">Loading certificate…</div>`;

  let results = [], photos = [], signed = {};
  try {
    const [r, p] = await Promise.all([
      db.from("inspection_assets")
        .select("id,asset_id,asset_code,category,status,finding,corrective_action,standard_referenced")
        .eq("inspection_id", cert.inspection_id)
        .order("category").order("sort_order"),
      db.from("asset_photos")
        .select("id,asset_id,storage_path,caption")
        .eq("inspection_id", cert.inspection_id),
    ]);
    if (r.error) throw r.error;
    if (p.error) throw p.error;
    results = r.data ?? [];
    photos = p.data ?? [];

    if (photos.length) {
      const { data: urls } = await db.storage
        .from("inspection-photos")
        .createSignedUrls(photos.map((x) => x.storage_path), 300);
      for (const u of urls ?? []) if (u.signedUrl) signed[u.path] = u.signedUrl;
    }
  } catch (e) {
    $("app").innerHTML = `<div class="err">${esc(e.message ?? String(e))}</div>`;
    return;
  }

  const rows = results.map((r) => {
    const cls = r.status === "compliant" ? "ok"
      : r.status === "non_compliant" ? "bad" : "warn";
    const shots = photos.filter((x) => x.asset_id === r.id);
    const imgs = shots.map((x) => signed[x.storage_path]
      ? `<img src="${esc(signed[x.storage_path])}" alt="Evidence for ${esc(r.asset_code)}" loading="lazy">`
      : "").join("");

    return `<tr>
      <td class="tag">${esc(r.asset_code)}</td>
      <td>${esc(catLabel(r.category))}</td>
      <td><span class="pill ${cls}">${esc(r.status.replace(/_/g, " ").toUpperCase())}</span></td>
      <td class="muted">${esc(r.finding ?? "")}</td>
      <td class="muted">${esc(r.corrective_action ?? "")}</td>
      <td class="muted">${esc(r.standard_referenced ?? "")}</td>
      <td>${imgs ? `<div class="evidence">${imgs}</div>` : `<span class="faint">none</span>`}</td>
    </tr>`;
  }).join("");

  $("app").innerHTML = `
    <button class="backlink" id="back">← Back to site</button>
    <h1>${esc(cert.certificate_number)}
      ${isOverdue(cert.expires_on) ? `<span class="pill bad">EXPIRED</span>` : ""}</h1>
    <p class="sub">${esc(cert.standard_line)} ·
       issued ${showDate(cert.issued_at.slice(0, 10))} ·
       ${isOverdue(cert.expires_on)
         ? `<strong>expired ${showDate(cert.expires_on)}</strong>`
         : `expires ${showDate(cert.expires_on)}`}</p>

    <div class="card">
      <div class="stats">
        <div class="stat"><div class="n">${cert.asset_count}</div><div class="l">Items</div></div>
        <div class="stat"><div class="n">${cert.compliant_count}</div><div class="l">Compliant</div></div>
        <div class="stat"><div class="n">${cert.asset_count - cert.compliant_count}</div><div class="l">Other</div></div>
        <div class="stat"><div class="n">${photos.length}</div><div class="l">Evidence photos</div></div>
      </div>
      ${cert.document_path
        ? `<p style="margin:14px 0 0"><button class="link" id="pdf">Download report PDF</button></p>`
        : `<p class="faint" style="margin:14px 0 0">No PDF attached to this certificate yet.</p>`}
    </div>

    <h2>Results</h2>
    <div class="tablewrap">
      <table>
        <thead><tr>
          <th>Tag</th><th>Type</th><th>Status</th><th>Finding</th>
          <th>Corrective action</th><th>Standard</th><th>Evidence</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="empty">No results recorded.</td></tr>`}</tbody>
      </table>
    </div>`;

  $("back").addEventListener("click", () => renderSite(siteId));

  const pdfBtn = $("pdf");
  if (pdfBtn) pdfBtn.addEventListener("click", async () => {
    const { data, error } = await db.storage
      .from("reports")
      .createSignedUrl(cert.document_path, 300);
    if (error) return alert(error.message);
    window.open(data.signedUrl, "_blank", "noopener");
  });
}

/* ── Loading ──────────────────────────────────────────────── */
async function loadAll() {
  const [sites, assets, certs] = await Promise.all([
    db.from("sites").select("id,name,address,service_condition").order("name"),
    db.from("assets")
      .select("id,site_id,tag,category,status,location_note,last_pass_on,next_due_on")
      .order("tag"),
    db.from("certificates")
      .select("id,site_id,inspection_id,certificate_number,issued_at,expires_on,asset_count,compliant_count,standard_line,document_path,revoked_at")
      .is("revoked_at", null)
      .order("issued_at", { ascending: false }),
  ]);

  for (const r of [sites, assets, certs]) if (r.error) throw r.error;

  state.sites = sites.data ?? [];
  state.assets = assets.data ?? [];
  state.certs = certs.data ?? [];
}

/* ── Auth ─────────────────────────────────────────────────── */
async function signIn(ev) {
  ev.preventDefault();
  const btn = $("signin");
  btn.disabled = true;
  $("loginerr").textContent = "";

  const { error } = await db.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value,
  });

  btn.disabled = false;
  if (error) $("loginerr").textContent = error.message;
}

db.auth.onAuthStateChange(async (_event, session) => {
  if (!session) { state = { email: null, sites: [], assets: [], certs: [] }; return showLogin(); }

  state.email = session.user.email;
  showApp();
  $("app").innerHTML = `<div class="empty">Loading…</div>`;

  try {
    await loadAll();
    renderSites();
  } catch (e) {
    $("app").innerHTML = `<div class="err">${esc(e.message ?? String(e))}</div>`;
  }
});

$("loginform").addEventListener("submit", signIn);
$("signout").addEventListener("click", () => db.auth.signOut());
