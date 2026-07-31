// Core extraction logic shared between the Supabase Edge Function (Deno)
// and the local CLI test harness (Node 24+). Keep this file runtime-agnostic:
// only `fetch` and plain TypeScript types (no enums — Node type-stripping).

// Opus 5 : lecture de tableaux denses nettement plus fiable que Sonnet 4.6.
// Testé le 2026-07-25 : sur une photo dégradée (tableau de travers, flou), Sonnet
// INVENTAIT des horaires décalés (dangereux — l'utilisateur pouvait les enregistrer
// sans voir l'erreur) là où Opus 5 détecte correctement « photo illisible » et
// demande de reprendre ; sur une photo nette il lit la ligne cible parfaitement.
// ~0,7 $/scan — acceptable vu le faible volume et le fait que c'est le cœur produit.
export const ANTHROPIC_MODEL = "claude-opus-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MAX_OUTPUT_TOKENS = 16_000;

export type ShiftSlot = {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

export type DayStatus = "work" | "off" | "rh" | "cp" | "unknown";

export type DayEntry = {
  day_index: number; // 0 = première colonne du tableau (généralement lundi)
  date: string | null; // "YYYY-MM-DD", null si la période n'est pas imprimée
  status: DayStatus;
  shifts: ShiftSlot[];
  duration_hours: number | null;
  handwritten_override: boolean;
  highlighted: boolean;
  note: string | null;
};

export type EmployeeRow = {
  name: string;
  row_index: number;
  days: DayEntry[];
  total_hours: number | null;
};

export type GlobalNote = {
  text: string;
  applies_to: string; // "all" or an employee name
  date: string | null; // "YYYY-MM-DD" when the note targets a day
  start: string | null; // "HH:MM"
  end: string | null; // "HH:MM"
};

export type PhotoQuality = "good" | "degraded" | "unusable";

export type PlanningExtraction = {
  photo_quality: PhotoQuality;
  store_label: string | null;
  week_number: number | null;
  week_start: string | null; // null si la période n'est pas lisible/imprimée
  week_end: string | null;
  employees: EmployeeRow[];
  global_notes: GlobalNote[];
  warnings: string[];
};

export type ExtractionUsage = {
  input_tokens: number;
  output_tokens: number;
};

export type ExtractionResult = {
  data: PlanningExtraction;
  usage: ExtractionUsage;
  model: string;
};

export type SupportedMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic";

export const SUPPORTED_MEDIA_TYPES: SupportedMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
];

const EXTRACTION_TOOL = {
  name: "report_planning",
  description:
    "Rapporte le contenu structuré d'un planning hebdomadaire de magasin " +
    "photographié (tableau employés × jours).",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "photo_quality",
      "store_label",
      "week_number",
      "week_start",
      "week_end",
      "employees",
      "global_notes",
      "warnings",
    ],
    properties: {
      photo_quality: {
        type: "string",
        enum: ["good", "degraded", "unusable"],
        description:
          "Verdict global de lisibilité de la photo : good = tout est lisible, " +
          "degraded = des cellules ou lignes sont douteuses/illisibles (détaillées " +
          "dans warnings), unusable = la photo ne permet pas une extraction fiable " +
          "(floue, coupée, trop petite) et doit être reprise.",
      },
      store_label: {
        type: ["string", "null"],
        description: "Libellé du magasin tel qu'imprimé (ex: 'Magasin 1068 - WASQUEHAL').",
      },
      week_number: {
        type: ["integer", "null"],
        description: "Numéro de semaine si imprimé sur le planning.",
      },
      week_start: {
        type: ["string", "null"],
        description:
          "Date du premier jour de la semaine (YYYY-MM-DD), déduite de l'en-tête. " +
          "null si la période n'est PAS imprimée ou illisible — n'invente JAMAIS de dates.",
      },
      week_end: {
        type: ["string", "null"],
        description: "Date du dernier jour (YYYY-MM-DD), null si non imprimée.",
      },
      employees: {
        type: "array",
        description: "Une entrée par ligne employé du tableau, dans l'ordre du tableau.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "row_index", "days", "total_hours"],
          properties: {
            name: {
              type: "string",
              description: "Nom tel qu'imprimé (ex: 'COPIN Typhanie').",
            },
            row_index: {
              type: "integer",
              description: "Position de la ligne dans le tableau, 0 = première ligne employé.",
            },
            days: {
              type: "array",
              description: "Exactement 7 entrées, du lundi au dimanche.",
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "day_index",
                  "date",
                  "status",
                  "shifts",
                  "duration_hours",
                  "handwritten_override",
                  "highlighted",
                  "note",
                ],
                properties: {
                  day_index: {
                    type: "integer",
                    description: "Position de la colonne jour, 0 = première colonne (généralement lundi).",
                  },
                  date: {
                    type: ["string", "null"],
                    description: "YYYY-MM-DD si déductible de l'en-tête, sinon null (n'invente pas).",
                  },
                  status: {
                    type: "string",
                    enum: ["work", "off", "rh", "cp", "unknown"],
                    description:
                      "work = travaille, off = repos/case vide ou grisée, " +
                      "rh = repos hebdomadaire (code RH), cp = congé payé (code CP), " +
                      "unknown = illisible.",
                  },
                  shifts: {
                    type: "array",
                    description:
                      "Créneaux horaires du jour (souvent 1, parfois 2 si coupure). " +
                      "Vide si status != work.",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["start", "end"],
                      properties: {
                        start: { type: "string", description: "HH:MM, 24h" },
                        end: { type: "string", description: "HH:MM, 24h" },
                      },
                    },
                  },
                  duration_hours: {
                    type: ["number", "null"],
                    description: "Durée du jour telle qu'imprimée dans la colonne durée, en heures décimales (ex: 7.5).",
                  },
                  handwritten_override: {
                    type: "boolean",
                    description:
                      "true si la valeur retenue vient d'une correction manuscrite " +
                      "(rature, heure au stylo, code au marqueur) qui remplace l'imprimé.",
                  },
                  highlighted: {
                    type: "boolean",
                    description:
                      "true si la case est mise en évidence visuellement (surligneur, " +
                      "couleur de fond, encadré) SANS que la valeur soit modifiée. " +
                      "Décris la couleur et l'interprétation probable dans note.",
                  },
                  note: {
                    type: ["string", "null"],
                    description: "Détail utile lisible dans la case (texte raturé, annotation).",
                  },
                },
              },
            },
            total_hours: {
              type: ["number", "null"],
              description: "Total d'heures de la semaine pour cet employé si imprimé (colonne Total).",
            },
          },
        },
      },
      global_notes: {
        type: "array",
        description:
          "Notes hors tableau : post-its, mentions manuscrites ou imprimées en bas/marge " +
          "(ex: 'Réunion équipe le vendredi 7 à 8H').",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "applies_to", "date", "start", "end"],
          properties: {
            text: { type: "string", description: "Texte de la note, tel que lu." },
            applies_to: {
              type: "string",
              description: "'all' si la note concerne toute l'équipe, sinon le nom de l'employé concerné.",
            },
            date: {
              type: ["string", "null"],
              description: "YYYY-MM-DD si la note cible un jour précis de la semaine.",
            },
            start: { type: ["string", "null"], description: "HH:MM si un horaire est mentionné." },
            end: { type: ["string", "null"], description: "HH:MM si une fin est mentionnée." },
          },
        },
      },
      warnings: {
        type: "array",
        description:
          "Tout doute de lecture : cellule illisible, ambiguïté 13h/15h, photo coupée, " +
          "ligne partiellement masquée… Une entrée par doute, en français.",
        items: { type: "string" },
      },
    },
  },
} as const;

const EXTRACTION_PROMPT = `Tu analyses la photo d'un planning hebdomadaire papier affiché dans un magasin.
C'est un tableau : une ligne par employé, des colonnes par jour (lundi → dimanche),
chaque jour ayant généralement des sous-colonnes arrivée / départ / durée.
L'en-tête contient le magasin, la période (ex: "Planning du 03/11/2025 au 09/11/2025")
et souvent un numéro de semaine.

Règles de lecture, dans l'ordre de priorité :

1. CORRECTIONS MANUSCRITES D'ABORD. Une heure raturée et réécrite au stylo, un code
   ajouté au marqueur (RH, CP…) ou un surlignage qui modifie une case REMPLACE la
   valeur imprimée. Dans ce cas mets handwritten_override=true et garde l'ancienne
   valeur lisible dans note (ex: "imprimé 14:00, corrigé à la main 15:00").
2. Codes : RH = repos hebdomadaire (status "rh"), CP = congé payé (status "cp").
   Case vide, grisée ou barrée sans heures = repos (status "off").
3. Extrais TOUTES les lignes employé, même partiellement lisibles, dans l'ordre du
   tableau. N'ignore personne.
4. Les heures au format 24h "HH:MM" (ex: "9h" → "09:00", "13h30" → "13:30").
   Si un employé a une coupure (matin + après-midi), mets deux entrées dans shifts.
5. Dates : déduis la date exacte de chaque jour à partir de la période de
   l'en-tête (le premier jour du tableau est le lundi = week_start). Si la
   période n'est PAS imprimée (pas d'en-tête de dates, pas de noms de jours
   datés) : week_start, week_end et toutes les dates = null, et ajoute un
   warning « période non imprimée » — l'application demandera la date à
   l'utilisateur. N'INVENTE JAMAIS de dates. day_index reste toujours rempli
   (0 = première colonne).
6. Notes hors tableau : post-its, mentions en marge ou en bas de page vont dans
   global_notes. Si une note concerne toute l'équipe (ex: "réunion équipe le
   vendredi à 8h", "heure supp pour tous vendredi"), applies_to="all" et renseigne
   date/start si tu peux les déduire de la semaine.
7. N'INVENTE RIEN. Si une case est illisible ou ambiguë : status "unknown" (ou
   duration_hours null) et ajoute un warning précis ("ligne X, jeudi : heure de
   départ illisible"). Un doute signalé vaut mieux qu'une valeur devinée.
8. Évalue photo_quality honnêtement : "good" si tu as pu tout lire, "degraded"
   si certaines cellules sont douteuses, "unusable" si la photo est trop floue,
   coupée ou trop petite pour une extraction fiable — dans ce cas l'application
   demandera à l'utilisateur de reprendre la photo, c'est le comportement attendu,
   ne force pas une lecture.
9. ALIGNEMENT DES LIGNES — l'erreur la plus grave possible, et la plus
   fréquente. Un décalage d'un cran entre la colonne des noms et le corps du
   tableau donne à chaque personne les horaires de sa voisine : les noms sont
   justes, les horaires sont faux, et rien ne le signale. Procède ainsi :
   a. Lis LIGNE PAR LIGNE, jamais colonne par colonne. Pour une ligne : pose le
      regard sur le nom à gauche, puis suis la MÊME bande horizontale jusqu'au
      bout (colonnes Total comprises) sans jamais changer de bande.
   b. Sers-toi des repères visuels du tableau pour délimiter cette bande :
      traits de séparation, bordures, alternance de couleurs de fond, hauteur
      des cellules. Une ligne plus haute que les autres (deux créneaux empilés,
      texte sur deux lignes) reste UNE seule ligne.
   c. N'interpole JAMAIS une ligne vide. Une personne sans horaires est en
      repos : ses jours restent "off". N'emprunte pas le contenu de la ligne du
      dessus ou du dessous pour « remplir » le vide, et ne remonte pas les
      lignes suivantes d'un cran.
   d. Le nombre de lignes d'horaires DOIT être égal au nombre de noms : si tu
      comptes 15 noms, tu rapportes 15 employés, dans le même ordre, y compris
      les lignes vides. row_index suit strictement l'ordre du tableau.
10. CONTRÔLE OBLIGATOIRE PAR LE TOTAL HEBDO — c'est ton filet de sécurité
   contre le décalage, applique-le à CHAQUE ligne avant de la rapporter :
   a. additionne les durées quotidiennes que tu viens de lire sur cette ligne ;
   b. compare cette somme au total hebdomadaire imprimé sur la MÊME ligne
      (colonne « Hebdo » / « Total ») ;
   c. si l'écart dépasse 0,25 h, considère d'abord que ta lecture est décalée :
      reviens sur la ligne et teste explicitement les hypothèses « j'ai lu la
      ligne du dessus » et « j'ai lu la ligne du dessous » (les horaires que tu
      as associés à ce nom collent-ils mieux au total d'une voisine ?). Un
      décalage est presque toujours systématique : s'il est confirmé, corrige
      TOUT le bloc concerné, pas seulement la ligne qui saute aux yeux ;
   d. si l'écart persiste après relecture, garde les valeurs réellement lues
      (n'invente jamais d'heures pour faire tomber le total juste) et ajoute un
      warning précis : ligne concernée, somme obtenue, total imprimé.
   Vérifie aussi jour par jour que durée ≈ départ − arrivée moins la pause
   éventuelle (voir 11ter).
11. NOMS : une liste propre « Nom du collaborateur » figure souvent sous le
   tableau (zone signatures), en plus gros caractères. Sers-t'en pour
   orthographier exactement les noms des lignes du tableau.
11bis. SURLIGNAGE : distingue deux cas. (a) Une CORRECTION (rature, valeur
   réécrite) → handwritten_override=true. (b) Une simple MISE EN ÉVIDENCE
   (surligneur ou fond coloré sur une heure inchangée) → highlighted=true,
   et indique dans note la couleur + l'interprétation la plus probable dans
   un commerce (ex: "surligné jaune sur l'heure d'arrivée : probablement
   ouverture du magasin", "surligné sur le départ : probablement fermeture").
   N'invente pas de sens si rien ne le suggère : décris juste la couleur.
11ter. DURÉE vs AMPLITUDE : la colonne durée est le temps PAYÉ. Si
   départ − arrivée > durée, l'écart est la pause non payée (souvent 1h de
   pause déjeuner) : c'est NORMAL, ne le « corrige » pas et ne le signale en
   warning que si l'écart dépasse 2h.
12. COLONNES DE DROITE : distingue « Total hebdo » (heures réellement planifiées
   cette semaine) de « Base horaire » (heures du contrat, souvent 35) et
   « Delta ». total_hours = la colonne Total UNIQUEMENT. Un employé absent toute
   la semaine a souvent une ligne vide avec seulement sa base (ex: 35) : dans ce
   cas total_hours = null, ne recopie pas la base.

Rapporte tout via l'outil report_planning.`;

export type CustomShiftType = {
  name: string;
  isPaid: boolean;
};

// Paragraphe ajouté au prompt quand l'utilisateur a déclaré des codes de
// créneau propres à son magasin (table custom_shift_types). Le schéma de
// l'outil reste inchangé : on mappe sur les status existants + note.
function buildCustomTypesParagraph(customTypes: CustomShiftType[]): string {
  const list = customTypes
    .map((type) => `"${type.name}" (${type.isPaid ? "payé" : "non payé"})`)
    .join(", ");
  return (
    `Codes spécifiques à ce magasin possibles dans les cellules : ${list}. ` +
    `Si une cellule porte exactement ou approximativement l'une de ces mentions, ` +
    `produis status="work" avec les horaires si le code est payé et que les ` +
    `horaires sont lisibles (sinon shifts vide), ou status="off" si le code est ` +
    `non payé, et recopie la mention EXACTE dans note.`
  );
}

export type ExtractPlanningInput = {
  imageBase64: string;
  mediaType: SupportedMediaType;
  apiKey: string;
  /** Override du modèle (défaut : ANTHROPIC_MODEL). */
  model?: string;
  /** Codes de créneau personnalisés du magasin de l'uploader (optionnel). */
  customTypes?: CustomShiftType[];
};

type AnthropicContentBlock =
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "text"; text: string };

type AnthropicResponse = {
  content: AnthropicContentBlock[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
  stop_reason: string;
};

function assertValidInput(input: ExtractPlanningInput): void {
  if (!input.apiKey) {
    throw new Error("Missing Anthropic API key");
  }
  if (!SUPPORTED_MEDIA_TYPES.includes(input.mediaType)) {
    throw new Error(`Unsupported media type: ${input.mediaType}`);
  }
  if (!input.imageBase64 || input.imageBase64.length < 100) {
    throw new Error("Image payload is empty or too small");
  }
}

function buildPrompt(customTypes?: CustomShiftType[]): string {
  return customTypes && customTypes.length > 0
    ? `${EXTRACTION_PROMPT}\n\n${buildCustomTypesParagraph(customTypes)}`
    : EXTRACTION_PROMPT;
}

// Un appel vision + tool use. `timeoutMs` n'est utilisé que par la passe de
// vérification (la première passe garde le comportement historique : pas de
// timeout côté client, c'est l'Edge Function qui borne).
async function callAnthropic(
  input: ExtractPlanningInput,
  promptText: string,
  timeoutMs?: number,
): Promise<ExtractionResult> {
  const { imageBase64, mediaType, apiKey, model = ANTHROPIC_MODEL } = input;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Déterminisme (lecture de document) : `temperature` n'est accepté que
      // par les modèles 4.x ; les modèles Claude 5 le rejettent (déprécié).
      ...(model.includes("-4-") ? { temperature: 0.2 } : {}),
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageBase64,
              },
            },
            { type: "text", text: promptText },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const payload = (await response.json()) as AnthropicResponse;
  const toolBlock = payload.content.find(
    (block): block is Extract<AnthropicContentBlock, { type: "tool_use" }> =>
      block.type === "tool_use" && block.name === EXTRACTION_TOOL.name,
  );

  if (!toolBlock) {
    throw new Error(
      `Model did not return structured output (stop_reason: ${payload.stop_reason})`,
    );
  }

  return {
    data: toolBlock.input as PlanningExtraction,
    usage: payload.usage,
    model: payload.model,
  };
}

export async function extractPlanning(
  input: ExtractPlanningInput,
): Promise<ExtractionResult> {
  assertValidInput(input);
  return await callAnthropic(input, buildPrompt(input.customTypes));
}

// ---------------------------------------------------------------------------
// Contrôle d'alignement : somme des durées lues vs total hebdo imprimé.
//
// Cas réel (Nocibé Wasquehal, S31) : les 15 noms lus dans le bon ordre mais le
// corps du tableau décalé d'un cran — chaque personne héritait des horaires de
// la ligne suivante. Import silencieux de faux horaires. Le planning imprimant
// un total hebdo par ligne, l'écart somme/total est un signal objectif.
// ---------------------------------------------------------------------------

/** Écart toléré entre somme des durées et total imprimé (arrondis d'impression). */
export const TOTAL_TOLERANCE_HOURS = 0.25;
/** Au-delà, on ne lance pas de seconde passe : le budget temps de l'app est déjà consommé. */
const RETRY_FIRST_PASS_BUDGET_MS = 150_000;
/** Garde-fou dur sur la passe de vérification. */
const RETRY_TIMEOUT_MS = 120_000;

export type RowConsistencyIssue = {
  rowIndex: number;
  name: string;
  durationSum: number;
  totalHours: number;
  delta: number;
};

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Lignes dont la somme des durées quotidiennes contredit le total hebdomadaire
 * imprimé sur la même ligne. Sont ignorées (non vérifiables, pas incohérentes) :
 * les lignes sans total imprimé, celles sans aucun jour travaillé, et celles
 * dont au moins une durée quotidienne est manquante (somme volontairement
 * incomplète — une cellule illisible relève des warnings, pas de l'alignement).
 */
export function findRowConsistencyIssues(
  extraction: PlanningExtraction,
  tolerance: number = TOTAL_TOLERANCE_HOURS,
): RowConsistencyIssue[] {
  const issues: RowConsistencyIssue[] = [];
  const employees = extraction?.employees ?? [];

  employees.forEach((employee, index) => {
    const total = employee?.total_hours;
    if (typeof total !== "number" || !Number.isFinite(total)) return;

    const countedDays = (employee.days ?? []).filter(
      (day) =>
        day?.status === "work" ||
        (typeof day?.duration_hours === "number" && day.duration_hours > 0),
    );
    if (countedDays.length === 0) return;
    if (countedDays.some((day) => typeof day.duration_hours !== "number")) return;

    const sum = countedDays.reduce((acc, day) => acc + (day.duration_hours ?? 0), 0);
    const delta = sum - total;
    if (Math.abs(delta) <= tolerance) return;

    issues.push({
      rowIndex: typeof employee.row_index === "number" ? employee.row_index : index,
      name: employee.name,
      durationSum: roundHours(sum),
      totalHours: total,
      delta: roundHours(delta),
    });
  });

  return issues;
}

// Trace lisible pour les logs serveur : positions de lignes uniquement,
// jamais de nom ni d'horaire (données de tiers).
function issueRowLabels(issues: RowConsistencyIssue[]): string {
  return issues.map((issue) => issue.rowIndex).join(",");
}

function withAlignmentWarnings(
  extraction: PlanningExtraction,
  issues: RowConsistencyIssue[],
): PlanningExtraction {
  if (issues.length === 0) return extraction;
  const added = issues.map(
    (issue) =>
      `Ligne ${issue.rowIndex + 1} (${issue.name}) : la somme des durées lues ` +
      `(${issue.durationSum} h) ne correspond pas au total hebdo imprimé ` +
      `(${issue.totalHours} h) — vérifie l'alignement de cette ligne avant de valider.`,
  );
  return { ...extraction, warnings: [...(extraction.warnings ?? []), ...added] };
}

function buildAlignmentRetryPrompt(
  extraction: PlanningExtraction,
  issues: RowConsistencyIssue[],
): string {
  const names = extraction.employees
    .map((employee, index) => `${index + 1}. ${employee.name}`)
    .join("\n");
  const suspects = issues
    .map(
      (issue) =>
        `- ligne ${issue.rowIndex + 1} (${issue.name}) : durées lues = ${issue.durationSum} h, ` +
        `total hebdo imprimé sur cette ligne = ${issue.totalHours} h ` +
        `(écart ${roundHours(Math.abs(issue.delta))} h)`,
    )
    .join("\n");

  return `DEUXIÈME LECTURE — CONTRÔLE D'ALIGNEMENT.

Une première lecture de CETTE photo a déjà été faite. Les noms relevés, dans
l'ordre du tableau, sont :
${names}

Sur les lignes suivantes, la somme des durées quotidiennes lues ne correspond
PAS au total hebdomadaire imprimé sur la même ligne :
${suspects}

C'est la signature typique d'un décalage d'un cran entre la colonne des noms et
le corps du tableau : chaque personne reçoit alors les horaires de la ligne du
dessus ou du dessous. Reprends la photo à zéro et, pour ces lignes :
- retrouve la bande horizontale du nom concerné en t'appuyant sur les traits du
  tableau (bordures, alternance de fond, hauteur des cellules) ;
- teste explicitement les hypothèses « j'ai lu la ligne du dessus » et « j'ai lu
  la ligne du dessous » : les horaires attribués à ce nom collent-ils mieux au
  total d'une voisine ?
- un décalage est presque toujours systématique : s'il est confirmé, corrige
  TOUT le bloc concerné, pas seulement la ligne signalée ;
- une ligne sans horaires reste sans horaires (repos) : ne la remplis jamais
  avec le contenu d'une voisine.

Renvoie l'extraction COMPLÈTE et corrigée via l'outil report_planning : toutes
les lignes employé, dans le même ordre et avec les mêmes noms, pas seulement les
lignes suspectes. Si après vérification une ligne reste incohérente, garde les
valeurs réellement lues (n'invente rien) et explique l'écart dans warnings.`;
}

export type AlignmentCheck = {
  /** Lignes incohérentes après la première passe. */
  issuesBefore: number;
  /** Lignes incohérentes de la passe retenue. */
  issuesAfter: number;
  /** Une seconde passe vision a abouti (false si non lancée ou en erreur). */
  retried: boolean;
  /** Passe retenue (1 = première lecture, 2 = lecture de vérification). */
  keptPass: 1 | 2;
};

export type VerifiedExtractionResult = ExtractionResult & {
  alignment: AlignmentCheck;
};

/**
 * Extraction + contrôle d'alignement. Si au moins une ligne est incohérente,
 * une SEULE seconde passe vision ciblée est lancée ; on garde la passe qui a le
 * moins de lignes incohérentes (à égalité, la seconde). Toute erreur de la
 * seconde passe est absorbée : on retombe sur la première extraction.
 */
export async function extractPlanningVerified(
  input: ExtractPlanningInput,
): Promise<VerifiedExtractionResult> {
  assertValidInput(input);

  const startedAt = Date.now();
  const basePrompt = buildPrompt(input.customTypes);
  const first = await callAnthropic(input, basePrompt);
  const firstIssues = findRowConsistencyIssues(first.data);

  const firstPassMs = Date.now() - startedAt;
  const budgetLeft = firstPassMs < RETRY_FIRST_PASS_BUDGET_MS;
  const worthRetrying =
    firstIssues.length > 0 &&
    first.data.photo_quality !== "unusable" &&
    (first.data.employees?.length ?? 0) > 0;

  if (!worthRetrying || !budgetLeft) {
    if (firstIssues.length > 0) {
      console.log(
        `alignment check: ${firstIssues.length} inconsistent row(s) [${issueRowLabels(firstIssues)}], ` +
          `no second pass (${budgetLeft ? "not applicable" : "time budget spent"})`,
      );
    }
    return {
      ...first,
      data: withAlignmentWarnings(first.data, firstIssues),
      alignment: {
        issuesBefore: firstIssues.length,
        issuesAfter: firstIssues.length,
        retried: false,
        keptPass: 1,
      },
    };
  }

  let second: ExtractionResult | null = null;
  try {
    second = await callAnthropic(
      input,
      `${basePrompt}\n\n${buildAlignmentRetryPrompt(first.data, firstIssues)}`,
      RETRY_TIMEOUT_MS,
    );
  } catch (error) {
    // La vérification ne doit JAMAIS faire échouer l'extraction.
    console.error(
      "alignment second pass failed, keeping first extraction:",
      error instanceof Error ? error.message : error,
    );
  }

  const secondIssues = second ? findRowConsistencyIssues(second.data) : null;
  // Garde-fou : une seconde passe qui perd des lignes aurait mécaniquement
  // moins d'incohérences — elle ne peut pas gagner à ce prix.
  const secondKeepsAllRows =
    second !== null &&
    (second.data.employees?.length ?? 0) >= (first.data.employees?.length ?? 0);
  const keepSecond =
    second !== null &&
    secondIssues !== null &&
    secondKeepsAllRows &&
    secondIssues.length <= firstIssues.length;

  const winner = keepSecond && second ? second : first;
  const winnerIssues = keepSecond && secondIssues ? secondIssues : firstIssues;

  const discardReason =
    second !== null && !keepSecond
      ? secondKeepsAllRows
        ? " (pass 2 had more inconsistencies)"
        : " (pass 2 dropped employee rows)"
      : "";
  console.log(
    `alignment check: ${firstIssues.length} inconsistent row(s) [${issueRowLabels(firstIssues)}] on pass 1, ` +
      (secondIssues
        ? `${secondIssues.length} [${issueRowLabels(secondIssues)}] on pass 2`
        : "pass 2 unavailable") +
      ` — keeping pass ${keepSecond ? 2 : 1} (${winnerIssues.length} left)${discardReason}`,
  );

  return {
    data: withAlignmentWarnings(winner.data, winnerIssues),
    // Coût réel du scan = les deux passes.
    usage: {
      input_tokens: first.usage.input_tokens + (second?.usage.input_tokens ?? 0),
      output_tokens: first.usage.output_tokens + (second?.usage.output_tokens ?? 0),
    },
    model: winner.model,
    alignment: {
      issuesBefore: firstIssues.length,
      issuesAfter: winnerIssues.length,
      // false si la seconde passe a échoué : on n'a bien qu'une lecture exploitable.
      retried: second !== null,
      keptPass: keepSecond ? 2 : 1,
    },
  };
}
