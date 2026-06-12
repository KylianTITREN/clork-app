// Core extraction logic shared between the Supabase Edge Function (Deno)
// and the local CLI test harness (Node 24+). Keep this file runtime-agnostic:
// only `fetch` and plain TypeScript types (no enums — Node type-stripping).

// Sonnet est nécessaire : Haiku décale les lignes du tableau (testé le 2026-06-11
// sur planning-exemple-2.jpg — Haiku attribue à un employé les horaires de ses
// voisins ; Sonnet lit la ligne cible parfaitement). ~0,16 $/scan, acceptable.
export const ANTHROPIC_MODEL = "claude-sonnet-4-6";
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
9. ALIGNEMENT DES LIGNES — l'erreur la plus grave possible. Traite le tableau
   ligne par ligne : repère le nom à gauche, puis suis CETTE ligne horizontale
   jusqu'aux colonnes Total. Certaines lignes sont vides ou quasi vides (employé
   absent ou en repos toute la semaine) : ne décale JAMAIS les horaires d'une
   ligne vers une autre. Un employé sans aucun horaire reste avec des jours
   "off", c'est normal.
10. AUTO-VÉRIFICATION : pour chaque jour, durée ≈ départ − arrivée ; pour chaque
   employé, somme des durées ≈ total hebdo imprimé. Si ça ne colle pas, relis la
   ligne ; si le doute persiste, garde la valeur imprimée et ajoute un warning.
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

export type ExtractPlanningInput = {
  imageBase64: string;
  mediaType: SupportedMediaType;
  apiKey: string;
  /** Override du modèle (défaut : ANTHROPIC_MODEL). */
  model?: string;
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

export async function extractPlanning(
  input: ExtractPlanningInput,
): Promise<ExtractionResult> {
  const { imageBase64, mediaType, apiKey, model = ANTHROPIC_MODEL } = input;

  if (!apiKey) {
    throw new Error("Missing Anthropic API key");
  }
  if (!SUPPORTED_MEDIA_TYPES.includes(mediaType)) {
    throw new Error(`Unsupported media type: ${mediaType}`);
  }
  if (!imageBase64 || imageBase64.length < 100) {
    throw new Error("Image payload is empty or too small");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
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
            { type: "text", text: EXTRACTION_PROMPT },
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
