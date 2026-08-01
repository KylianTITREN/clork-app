// L'e-mail du planning : envoi (Brevo) et gabarits.
//
// POURQUOI CE MODULE EXISTE : dans le magasin pilote, 14 employées sur 15 n'ont
// pas l'app. Sans e-mail, la publication d'un planning ne servirait qu'une
// personne.
//
// DEUX E-MAILS AU TOTAL, jamais plus (décision Kylian) :
//   1. LE PLANNING, à la publication : SES horaires de la semaine, et
//      l'invitation à installer l'app EN PIED de message.
//   2. LE CHANGEMENT, si ses horaires bougent après publication : le détail
//      des jours modifiés, puis la semaine complète à jour.
// Aucun e-mail « rejoignez Clork » séparé : ce serait de la publicité, ça
// finirait en indésirables, et ça abîmerait la confiance construite par
// l'e-mail utile.
//
// ORDRE INTERNE IMPÉRATIF : ses horaires d'abord, l'invitation ensuite et
// discrètement. Un message qui s'ouvre sur « installez Clork » est une pub
// qu'on referme ; un message qui s'ouvre sur « votre semaine du 3 août » est
// lu, et l'invitation en pied prend son sens.
//
// AUCUNE CLÉ CONFIGURÉE = AUCUNE ERREUR. Tant que BREVO_API_KEY est absente
// (c'est le cas aujourd'hui), on journalise « email disabled » et chaque
// destinataire ressort en 'skipped'. La publication doit continuer de
// fonctionner exactement comme avant : l'e-mail est un ajout, jamais une
// dépendance.
//
// COMPATIBILITÉ MESSAGERIES : mise en page en TABLEAUX HTML avec styles en
// ligne (Outlook ne comprend ni flex, ni grid, ni feuille de style externe), et
// AUCUNE image distante — elles sont bloquées par défaut, un gabarit qui repose
// dessus arrive nu. La couleur est portée par les cellules, pas par des images.
//
// Variables d'environnement (toutes optionnelles, avec des replis) :
//   · BREVO_API_KEY   : clé de l'API transactionnelle. Absente = envoi désactivé.
//   · EMAIL_FROM      : « Clork <planning@kyks.io> » par défaut.
//   · APP_INSTALL_URL : page d'installation liée en pied de message.
//   · UNSUBSCRIBE_URL : base du lien de désinscription, le jeton est ajouté.

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

const DEFAULT_FROM = "Clork <planning@kyks.io>";
const DEFAULT_INSTALL_URL = "https://clork.kyks.io";
const DEFAULT_UNSUBSCRIBE_URL = "https://clork.kyks.io/desinscription";

/** Envois simultanés. Une équipe fait 15 adresses : inutile d'inonder Brevo. */
const SEND_CONCURRENCY = 5;
/** Au-delà, le fournisseur ne répondra plus : on compte l'envoi en échec. */
const SEND_TIMEOUT_MS = 15_000;
/** Le journal borne `reason` à 200 caractères. */
const MAX_REASON = 200;

// --- Contrat ------------------------------------------------------------------

export type EmailKind = "planning" | "change";
export type EmailStatus = "sent" | "skipped" | "failed";

export type EmailShiftType = "work" | "meeting" | "training";

export type EmailShift = { start: string; end: string; type: EmailShiftType };

/** Une journée telle qu'elle sera lue : ses créneaux et ses heures PAYÉES. */
export type EmailDay = {
  date: string;
  shifts: readonly EmailShift[];
  paid_minutes: number;
};

/** « Mercredi 29 : repos au lieu de 10:00-18:00 » — même texte que la push. */
export type EmailChange = { date: string; text: string };

export type EmailStoreCode = {
  organization: string | null;
  number: string | null;
};

export type EmailContent = {
  kind: EmailKind;
  /** Le prénom tel qu'on le dirait à voix haute. */
  first_name: string;
  store_label: string;
  week_start: string;
  /** Les 7 jours, lundi → dimanche, repos compris. */
  days: readonly EmailDay[];
  /** Renseigné (et non vide) uniquement pour le gabarit « changement ». */
  changes: readonly EmailChange[];
  store_code: EmailStoreCode;
  unsubscribe_url: string;
  install_url: string;
};

export type OutgoingEmail = {
  to: string;
  to_name: string | null;
  subject: string;
  html: string;
  text: string;
  /** Repris en en-tête List-Unsubscribe : les messageries l'exposent elles-mêmes. */
  unsubscribe_url: string;
};

export type EmailSendResult = { status: EmailStatus; reason: string | null };

// --- Configuration ------------------------------------------------------------

function env(name: string): string | null {
  const value = Deno.env.get(name);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Aucune clé = envoi désactivé, et surtout pas une erreur. */
export function isEmailConfigured(): boolean {
  return env("BREVO_API_KEY") !== null;
}

export function installUrl(): string {
  return env("APP_INSTALL_URL") ?? DEFAULT_INSTALL_URL;
}

/** Le lien du pied de page : la base, puis le jeton de l'entrée de carnet. */
export function unsubscribeUrl(token: string): string {
  const base = (env("UNSUBSCRIBE_URL") ?? DEFAULT_UNSUBSCRIBE_URL).replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(token)}`;
}

type Sender = { name: string; email: string };

/** « Clork <planning@kyks.io> » ou « planning@kyks.io », au choix. */
function parseSender(raw: string): Sender {
  const match = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (match) {
    const name = match[1].replace(/^["']|["']$/g, "").trim();
    return { name: name.length > 0 ? name : "Clork", email: match[2].trim() };
  }
  return { name: "Clork", email: raw.trim() };
}

// --- Dates et durées ----------------------------------------------------------

const FR_DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const FR_WEEKDAY = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  timeZone: "UTC",
});

/** "2026-08-03" → "3 août". */
function frenchDate(iso: string): string {
  return FR_DATE.format(new Date(`${iso}T00:00:00Z`));
}

/** "2026-07-29" → "Mercredi 29". C'est ainsi qu'on parle d'un jour à quelqu'un. */
function frenchWeekday(iso: string): string {
  const label = FR_WEEKDAY.format(new Date(`${iso}T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** 455 → "7 h 35". Les heures d'un planning se lisent, elles ne se calculent pas. */
function durationLabel(minutes: number): string {
  if (minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}

const TYPE_SUFFIX: Record<EmailShiftType, string> = {
  work: "",
  meeting: " (réunion)",
  training: " (formation)",
};

function shiftLabel(shift: EmailShift): string {
  return `${shift.start}-${shift.end}${TYPE_SUFFIX[shift.type] ?? ""}`;
}

function dayLabel(day: EmailDay): string {
  if (day.shifts.length === 0) return "Repos";
  return day.shifts.map(shiftLabel).join(" · ");
}

/**
 * Le même contenu, mais dont un créneau ne peut JAMAIS se couper en deux. Sur
 * un écran de téléphone, « 09:30- » suivi de « 18:00 » à la ligne se lit de
 * travers, et un horaire mal lu est précisément ce que cette app existe pour
 * éviter. La coupure reste permise ENTRE deux créneaux.
 */
function dayCellHtml(day: EmailDay): string {
  if (day.shifts.length === 0) return "Repos";
  return day.shifts
    .map((shift) => {
      const range = `<span style="white-space:nowrap;">${escapeHtml(`${shift.start}-${shift.end}`)}</span>`;
      const suffix = TYPE_SUFFIX[shift.type] ?? "";
      return suffix.length === 0 ? range : range + escapeHtml(suffix);
    })
    // Espace INSÉCABLE avant le séparateur : la coupure se fait après lui,
    // sinon le point médian se retrouve seul sur sa ligne.
    .join("&#160;· ");
}

function totalMinutes(days: readonly EmailDay[]): number {
  return days.reduce((sum, day) => sum + Math.max(day.paid_minutes, 0), 0);
}

// --- Identité Clork -----------------------------------------------------------

const PAPER = "#F7F6F2";
const INK = "#17150E";
const GREEN = "#1F6B47";
const CARD = "#FFFFFF";
const MUTED = "#6B6558";
const LINE = "#E4E0D6";
const HEADER_ROW = "#F1EFE8";
const GREEN_TINT = "#F0F6F2";

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- Gabarits -----------------------------------------------------------------

export function subjectOf(content: EmailContent): string {
  const week = frenchDate(content.week_start);
  return content.kind === "change"
    ? `Vos horaires ont changé — semaine du ${week}`
    : `Votre semaine du ${week}`;
}

/** « 10:00-18:00 » ne se coupe pas non plus au milieu d'une phrase de changement. */
const TIME_RANGE_RE = /\d{2}:\d{2}-\d{2}:\d{2}/g;

function changeTextHtml(text: string): string {
  // Échappement d'abord : il ne touche ni aux chiffres, ni aux deux-points, ni
  // au tiret, donc la recherche des plages horaires reste exacte ensuite.
  return escapeHtml(text).replace(
    TIME_RANGE_RE,
    (range) => `<span style="white-space:nowrap;">${range}</span>`,
  );
}

/** Le bloc « ce qui a bougé », en tête du message de changement. */
function changesHtml(changes: readonly EmailChange[]): string {
  if (changes.length === 0) return "";
  const items = changes
    .map(
      (change) =>
        `<tr><td style="padding:6px 0;font-family:${FONT};font-size:15px;line-height:22px;color:${INK};">` +
        `<strong style="color:${GREEN};white-space:nowrap;">${escapeHtml(frenchWeekday(change.date))}</strong>` +
        ` : ${changeTextHtml(change.text)}</td></tr>`,
    )
    .join("");
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="border-collapse:collapse;background-color:${GREEN_TINT};border-left:3px solid ${GREEN};margin:0 0 28px 0;">` +
    `<tr><td style="padding:16px 18px;">` +
    `<div style="font-family:${FONT};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${GREEN};padding-bottom:8px;">` +
    `Ce qui a changé</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">` +
    items +
    `</table></td></tr></table>`
  );
}

/** Le tableau des 7 jours : jour, horaires ou « Repos », heures payées. */
function weekTableHtml(days: readonly EmailDay[]): string {
  const rows = days
    .map((day) => {
      const off = day.shifts.length === 0;
      const color = off ? MUTED : INK;
      return (
        `<tr>` +
        `<td style="padding:11px 14px;border-top:1px solid ${LINE};font-family:${FONT};font-size:15px;` +
        `line-height:20px;color:${color};white-space:nowrap;">${escapeHtml(frenchWeekday(day.date))}</td>` +
        `<td style="padding:11px 12px;border-top:1px solid ${LINE};font-family:${FONT};font-size:15px;` +
        `line-height:22px;color:${color};${off ? "" : "font-weight:600;"}">${dayCellHtml(day)}</td>` +
        `<td align="right" style="padding:11px 14px;border-top:1px solid ${LINE};font-family:${FONT};` +
        `font-size:14px;line-height:20px;color:${MUTED};white-space:nowrap;">` +
        `${escapeHtml(off ? "—" : durationLabel(day.paid_minutes))}</td>` +
        `</tr>`
      );
    })
    .join("");

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="border-collapse:collapse;border:1px solid ${LINE};">` +
    `<tr style="background-color:${HEADER_ROW};">` +
    `<th align="left" style="padding:9px 14px;font-family:${FONT};font-size:11px;letter-spacing:0.08em;` +
    `text-transform:uppercase;color:${MUTED};font-weight:600;">Jour</th>` +
    `<th align="left" style="padding:9px 12px;font-family:${FONT};font-size:11px;letter-spacing:0.08em;` +
    `text-transform:uppercase;color:${MUTED};font-weight:600;">Horaires</th>` +
    `<th align="right" style="padding:9px 14px;font-family:${FONT};font-size:11px;letter-spacing:0.08em;` +
    `text-transform:uppercase;color:${MUTED};font-weight:600;">Payées</th>` +
    `</tr>${rows}</table>`
  );
}

function storeCodeLabel(code: EmailStoreCode): string | null {
  const parts = [code.organization, code.number]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * LE PIED, et seulement le pied. L'invitation ne vient qu'ici, après les
 * horaires : c'est l'ordre qui fait la différence entre un message lu et une
 * publicité refermée.
 */
function footerHtml(content: EmailContent): string {
  const code = storeCodeLabel(content.store_code);
  const codeLine = code === null
    ? ""
    : `<div style="font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};padding-top:6px;">` +
      `Code magasin à saisir dans l'app : <strong style="color:${INK};">${escapeHtml(code)}</strong></div>`;

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="border-collapse:collapse;border-top:1px solid ${LINE};margin-top:28px;">` +
    `<tr><td style="padding:20px 0 0 0;">` +
    `<div style="font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">` +
    `Clork affiche ce planning sur votre téléphone, avec un rappel la veille.</div>` +
    `<div style="font-family:${FONT};font-size:13px;line-height:20px;padding-top:6px;">` +
    `<a href="${escapeHtml(content.install_url)}" style="color:${GREEN};text-decoration:underline;">` +
    `Installer l'application</a></div>` +
    codeLine +
    `<div style="font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};padding-top:16px;">` +
    `Vous recevez ce message parce que ${escapeHtml(content.store_label)} vous a inscrite à son planning. ` +
    `<a href="${escapeHtml(content.unsubscribe_url)}" style="color:${MUTED};text-decoration:underline;">` +
    `Ne plus recevoir ces e-mails</a>.</div>` +
    `</td></tr></table>`
  );
}

/**
 * La ligne que la messagerie affiche À CÔTÉ DE L'OBJET, dans la liste. Sans
 * elle, elle affiche le début du corps : « Clork 1064 - Wasquehal Bonjour
 * Typhanie ». Avec elle, l'essentiel est lisible sans même ouvrir.
 */
function preheaderOf(content: EmailContent): string {
  if (content.kind === "change" && content.changes.length > 0) {
    const first = content.changes[0];
    const rest = content.changes.length - 1;
    const tail = rest === 0 ? "" : rest === 1 ? " et 1 autre jour" : ` et ${rest} autres jours`;
    return `${frenchWeekday(first.date)} : ${first.text}${tail}`;
  }
  const worked = content.days.filter((day) => day.shifts.length > 0).length;
  const days = worked <= 1 ? `${worked} jour travaillé` : `${worked} jours travaillés`;
  return `${days} · ${durationLabel(totalMinutes(content.days))}`;
}

function renderHtml(content: EmailContent): string {
  const week = frenchDate(content.week_start);
  const title = content.kind === "change"
    ? "Vos horaires ont changé"
    : `Votre semaine du ${week}`;
  const intro = content.kind === "change"
    ? `Votre planning de la semaine du ${week} vient d'être modifié.`
    : `Voici vos horaires pour la semaine du ${week}.`;

  return (
    // Document COMPLET, et pas un fragment : sans <meta charset>, les accents
    // se cassent dans les messageries qui ignorent l'en-tête MIME, et sans
    // viewport le message s'affiche dézoomé sur téléphone.
    `<!DOCTYPE html><html lang="fr"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta http-equiv="X-UA-Compatible" content="IE=edge">` +
    `<meta name="x-apple-disable-message-reformatting">` +
    `<title>${escapeHtml(subjectOf(content))}</title>` +
    `</head><body style="margin:0;padding:0;width:100%;background-color:${PAPER};` +
    `-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">` +

    // Le texte d'aperçu, invisible à l'ouverture. Les caractères de largeur
    // nulle empêchent le début du corps de déborder dans l'aperçu.
    `<div style="display:none;font-size:1px;color:${PAPER};line-height:1px;max-height:0;` +
    `max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheaderOf(content))}` +
    "&#8203;".repeat(60) +
    `</div>` +

    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="border-collapse:collapse;background-color:${PAPER};margin:0;padding:0;">` +
    `<tr><td align="center" style="padding:28px 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" ` +
    `style="border-collapse:collapse;width:100%;max-width:600px;background-color:${CARD};` +
    `border:1px solid ${LINE};">` +
    `<tr><td style="padding:28px 28px 32px 28px;">` +

    // En-tête : la marque discrète, le magasin en évidence.
    `<div style="font-family:${FONT};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;` +
    `color:${GREEN};font-weight:700;">Clork</div>` +
    `<div style="font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};padding-top:2px;">` +
    `${escapeHtml(content.store_label)}</div>` +

    `<h1 style="margin:18px 0 0 0;font-family:${FONT};font-size:24px;line-height:31px;` +
    `color:${INK};font-weight:700;">${escapeHtml(title)}</h1>` +
    `<p style="margin:14px 0 0 0;font-family:${FONT};font-size:15px;line-height:23px;color:${INK};">` +
    `Bonjour ${escapeHtml(content.first_name)},</p>` +
    `<p style="margin:6px 0 24px 0;font-family:${FONT};font-size:15px;line-height:23px;color:${INK};">` +
    `${escapeHtml(intro)}</p>` +

    changesHtml(content.changes) +
    weekTableHtml(content.days) +

    `<div style="font-family:${FONT};font-size:15px;line-height:22px;color:${INK};padding-top:14px;">` +
    `Total de la semaine : <strong style="color:${GREEN};">` +
    `${escapeHtml(durationLabel(totalMinutes(content.days)))}</strong></div>` +

    footerHtml(content) +
    `</td></tr></table></td></tr></table></body></html>`
  );
}

function renderText(content: EmailContent): string {
  const week = frenchDate(content.week_start);
  const lines: string[] = [];

  lines.push(content.kind === "change" ? "Vos horaires ont changé" : `Votre semaine du ${week}`);
  lines.push(content.store_label);
  lines.push("");
  lines.push(`Bonjour ${content.first_name},`);
  lines.push(
    content.kind === "change"
      ? `Votre planning de la semaine du ${week} vient d'être modifié.`
      : `Voici vos horaires pour la semaine du ${week}.`,
  );
  lines.push("");

  if (content.changes.length > 0) {
    lines.push("CE QUI A CHANGÉ");
    for (const change of content.changes) {
      lines.push(`- ${frenchWeekday(change.date)} : ${change.text}`);
    }
    lines.push("");
  }

  lines.push("VOTRE SEMAINE");
  for (const day of content.days) {
    const hours = day.shifts.length === 0 ? "" : `  (${durationLabel(day.paid_minutes)})`;
    lines.push(`- ${frenchWeekday(day.date)} : ${dayLabel(day)}${hours}`);
  }
  lines.push("");
  lines.push(`Total de la semaine : ${durationLabel(totalMinutes(content.days))}`);
  lines.push("");
  lines.push("—");
  lines.push("Clork affiche ce planning sur votre téléphone, avec un rappel la veille.");
  lines.push(content.install_url);

  const code = storeCodeLabel(content.store_code);
  if (code !== null) lines.push(`Code magasin à saisir dans l'app : ${code}`);

  lines.push("");
  lines.push(
    `Vous recevez ce message parce que ${content.store_label} vous a inscrite à son planning.`,
  );
  lines.push(`Ne plus recevoir ces e-mails : ${content.unsubscribe_url}`);

  return lines.join("\n");
}

/** Le message complet, prêt à partir. */
export function buildEmail(
  to: string,
  toName: string | null,
  content: EmailContent,
): OutgoingEmail {
  return {
    to,
    to_name: toName,
    subject: subjectOf(content),
    html: renderHtml(content),
    text: renderText(content),
    unsubscribe_url: content.unsubscribe_url,
  };
}

// --- Envoi --------------------------------------------------------------------

function shortReason(value: string): string {
  return value.length <= MAX_REASON ? value : value.slice(0, MAX_REASON);
}

/**
 * Un envoi, isolé. Ne lève JAMAIS : une adresse invalide ne doit faire échouer
 * ni la publication, ni les autres envois. Le motif d'échec est un code court,
 * sans adresse ni nom — il finit dans un journal que la responsable peut lire.
 */
async function sendOne(
  apiKey: string,
  sender: Sender,
  message: OutgoingEmail,
): Promise<EmailSendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        sender: { name: sender.name, email: sender.email },
        to: [
          message.to_name && message.to_name.length > 0
            ? { email: message.to, name: message.to_name }
            : { email: message.to },
        ],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        // La messagerie affiche alors son propre bouton « Se désabonner » :
        // c'est ce qui évite que le message soit signalé comme indésirable.
        headers: { "List-Unsubscribe": `<${message.unsubscribe_url}>` },
      }),
    });

    if (response.ok) return { status: "sent", reason: null };

    // Le corps peut contenir l'adresse : on ne garde que le code du fournisseur.
    let code = "";
    try {
      const payload = await response.json();
      if (payload && typeof payload === "object" && typeof (payload as { code?: unknown }).code === "string") {
        code = `:${(payload as { code: string }).code}`;
      }
    } catch {
      // Corps illisible : le statut HTTP suffit à qualifier l'échec.
    }
    return { status: "failed", reason: shortReason(`brevo_http_${response.status}${code}`) };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return { status: "failed", reason: aborted ? "brevo_timeout" : "brevo_unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Envoi par lots, échecs isolés. Le résultat est ALIGNÉ sur `messages` : chaque
 * destinataire a son statut, et le journal peut répondre « est-ce qu'elle a
 * reçu ? » adresse par adresse.
 *
 * Sans clé configurée : aucun appel réseau, aucune erreur, tout ressort en
 * 'skipped'. C'est l'état d'aujourd'hui.
 */
export async function sendEmails(
  messages: readonly OutgoingEmail[],
): Promise<EmailSendResult[]> {
  if (messages.length === 0) return [];

  const apiKey = env("BREVO_API_KEY");
  if (apiKey === null) {
    console.log(`email disabled: BREVO_API_KEY is not configured (${messages.length} skipped)`);
    return messages.map(() => ({ status: "skipped" as const, reason: "email_disabled" }));
  }

  const sender = parseSender(env("EMAIL_FROM") ?? DEFAULT_FROM);
  const results: EmailSendResult[] = [];
  for (let index = 0; index < messages.length; index += SEND_CONCURRENCY) {
    const chunk = messages.slice(index, index + SEND_CONCURRENCY);
    const settled = await Promise.all(
      chunk.map((message) => sendOne(apiKey, sender, message)),
    );
    results.push(...settled);
  }
  return results;
}

// --- Prénom -------------------------------------------------------------------

/**
 * « COPIN Typhanie » → « Typhanie ». Les plannings écrivent le NOM en capitales
 * et le prénom en casse normale : le mot qui porte des minuscules est donc le
 * prénom, quel que soit l'ordre. Sans indice (tout en capitales), on prend le
 * premier mot — se tromper là-dessus donne « Bonjour Copin », maladroit mais
 * jamais faux au point de blesser.
 */
export function firstNameOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return "";
  const spoken = words.find((word) => word !== word.toLocaleUpperCase("fr-FR")) ?? words[0];
  return spoken
    .split("-")
    .map((part) =>
      part.length === 0
        ? part
        : part.charAt(0).toLocaleUpperCase("fr-FR") + part.slice(1).toLocaleLowerCase("fr-FR"),
    )
    .join("-");
}
