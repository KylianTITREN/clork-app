// Phase 1 CLI harness: runs the extraction on planning-exemple.jpeg and prints
// a human-readable report. Run with: npm run test:extraction
// Requires ANTHROPIC_API_KEY in the environment or in .env.local at repo root.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  extractPlanning,
  type DayEntry,
  type PlanningExtraction,
} from "../supabase/functions/extract-planning/extraction.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
// Usage : npm run test:extraction -- [photo.jpeg] [--model=claude-sonnet-4-6]
const args = process.argv.slice(2);
const modelArg = args.find((a) => a.startsWith("--model="))?.slice("--model=".length);
const photoArg = args.find((a) => !a.startsWith("--"));
const FIXTURE = photoArg
  ? path.resolve(photoArg)
  : path.join(ROOT, "planning-exemple.jpeg");
// Pricing USD / MTok — pour la ligne de coût uniquement.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
};

async function loadApiKey(): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  const envFile = path.join(ROOT, ".env.local");
  if (existsSync(envFile)) {
    const content = await readFile(envFile, "utf-8");
    const match = content.match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?/m);
    if (match) return match[1].trim();
  }

  console.error(
    "❌ Clé API introuvable.\n" +
      "   Exporte ANTHROPIC_API_KEY ou crée clork-app/.env.local avec :\n" +
      '   ANTHROPIC_API_KEY=sk-ant-...\n' +
      "   (.env.local est dans le .gitignore, il ne sera jamais commité)",
  );
  process.exit(1);
}

function formatDay(day: DayEntry): string {
  const flag = day.handwritten_override ? " ✍️" : "";
  const note = day.note ? `  — ${day.note}` : "";
  switch (day.status) {
    case "work": {
      const slots = day.shifts.map((s) => `${s.start}–${s.end}`).join(" / ");
      const duration = day.duration_hours != null ? ` (${day.duration_hours}h)` : "";
      return `${slots || "horaires manquants"}${duration}${flag}${note}`;
    }
    case "off":
      return `repos${flag}${note}`;
    case "rh":
      return `RH${flag}${note}`;
    case "cp":
      return `CP${flag}${note}`;
    case "unknown":
      return `⚠️ illisible${flag}${note}`;
  }
}

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function printEmployee(employee: { name: string; days: DayEntry[]; total_hours: number | null }) {
  console.log(`\n👤 ${employee.name}` + (employee.total_hours != null ? `  — total ${employee.total_hours}h` : ""));
  employee.days.forEach((day, i) => {
    const label = DAY_NAMES[i] ?? day.date;
    console.log(`   ${label} ${day.date}  ${formatDay(day)}`);
  });
}

const QUALITY_LABELS = {
  good: "✅ bonne",
  degraded: "🟡 dégradée (cellules douteuses)",
  unusable: "🔴 inutilisable → l'app demanderait de reprendre la photo",
} as const;

function printReport(data: PlanningExtraction) {
  console.log("═".repeat(60));
  console.log(`📸 Qualité photo : ${QUALITY_LABELS[data.photo_quality] ?? data.photo_quality}`);
  console.log(`🏪 ${data.store_label ?? "(magasin non lu)"}`);
  console.log(
    `📅 Semaine ${data.week_number ?? "?"} — du ${data.week_start} au ${data.week_end}`,
  );
  console.log(`👥 ${data.employees.length} employés extraits :`);
  for (const employee of data.employees) {
    const workedDays = employee.days.filter((d) => d.status === "work").length;
    console.log(
      `   • ${employee.name} (${workedDays}j travaillés${employee.total_hours != null ? `, ${employee.total_hours}h` : ""})`,
    );
  }

  // La ligne cible du test : Typhanie, en détail.
  const target = data.employees.find((e) => /typhanie/i.test(e.name));
  if (target) {
    console.log("\n🎯 Ligne cible trouvée :");
    printEmployee(target);
  } else {
    console.log("\n❌ Ligne 'Typhanie' NON trouvée — échec du critère de phase 1");
  }

  if (data.global_notes.length > 0) {
    console.log("\n📌 Notes hors tableau :");
    for (const note of data.global_notes) {
      const when = [note.date, note.start && `à ${note.start}`].filter(Boolean).join(" ");
      console.log(`   • [${note.applies_to}] ${note.text}${when ? ` (${when})` : ""}`);
    }
  } else {
    console.log("\n📌 Aucune note hors tableau détectée (le post-it 'Réunion équipe' aurait dû l'être !)");
  }

  if (data.warnings.length > 0) {
    console.log("\n⚠️  Doutes signalés par le modèle :");
    for (const warning of data.warnings) console.log(`   • ${warning}`);
  }

  // Contrôle de cohérence côté code : somme des durées vs total hebdo imprimé.
  // Un écart trahit une ligne mal lue ou décalée — signal objectif d'erreur.
  const inconsistent = data.employees.filter((e) => {
    if (e.total_hours == null) return false;
    const sum = e.days.reduce((acc, d) => acc + (d.duration_hours ?? 0), 0);
    return Math.abs(sum - e.total_hours) > 0.01;
  });
  if (inconsistent.length > 0) {
    console.log("\n🔎 Incohérences durées/total (lignes suspectes) :");
    for (const e of inconsistent) {
      const sum = e.days.reduce((acc, d) => acc + (d.duration_hours ?? 0), 0);
      console.log(`   • ${e.name} : somme jours = ${sum}h, total imprimé = ${e.total_hours}h`);
    }
  } else {
    console.log("\n🔎 Cohérence durées/total : OK pour toutes les lignes vérifiables");
  }
}

async function main() {
  const apiKey = await loadApiKey();
  const image = await readFile(FIXTURE);
  console.log(`📷 ${path.basename(FIXTURE)} (${(image.length / 1024).toFixed(0)} ko) → extraction en cours…`);

  const startedAt = Date.now();
  const result = await extractPlanning({
    imageBase64: image.toString("base64"),
    mediaType: FIXTURE.endsWith(".png") ? "image/png" : "image/jpeg",
    apiKey,
    model: modelArg,
  });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  printReport(result.data);

  const priceKey = Object.keys(PRICING).find((k) => result.model.startsWith(k));
  const price = priceKey ? PRICING[priceKey] : { input: 0, output: 0 };
  const cost =
    (result.usage.input_tokens / 1e6) * price.input +
    (result.usage.output_tokens / 1e6) * price.output;
  console.log("\n" + "═".repeat(60));
  console.log(
    `⏱  ${seconds}s — ${result.model} — ${result.usage.input_tokens} tokens in / ` +
      `${result.usage.output_tokens} out ≈ $${cost.toFixed(4)}`,
  );

  // Dump complet pour inspection fine.
  const { writeFile } = await import("node:fs/promises");
  const outPath = path.join(ROOT, "scripts", "last-extraction.json");
  await writeFile(outPath, JSON.stringify(result.data, null, 2));
  console.log(`💾 JSON complet : ${path.relative(ROOT, outPath)}`);
}

main().catch((error) => {
  console.error("❌ Extraction échouée :", error.message ?? error);
  process.exit(1);
});
