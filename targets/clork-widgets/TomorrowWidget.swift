import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Configuration (appui long sur le widget → « Modifier le widget »)

enum ClorkDayOption: String, AppEnum {
    case today
    case tomorrow

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Jour")
    static let caseDisplayRepresentations: [ClorkDayOption: DisplayRepresentation] = [
        .today: "Aujourd'hui",
        .tomorrow: "Demain",
    ]
}

struct DayConfigIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Jour affiché"
    static let description = IntentDescription("Choisis le jour affiché par le widget.")

    @Parameter(title: "Jour", default: .tomorrow)
    var day: ClorkDayOption
}

// MARK: - Timeline

struct DayEntry: TimelineEntry {
    let date: Date
    let kicker: String // "AUJOURD'HUI" / "DEMAIN"
    let dayLabel: String
    let shifts: [WidgetShift]
}

struct DayProvider: AppIntentTimelineProvider {
    func placeholder(in _: Context) -> DayEntry {
        DayEntry(date: .now, kicker: "DEMAIN", dayLabel: "14/06", shifts: SampleData.tomorrow)
    }

    func snapshot(for configuration: DayConfigIntent, in context: Context) async -> DayEntry {
        context.isPreview ? placeholder(in: context) : makeEntry(configuration, now: .now)
    }

    func timeline(for configuration: DayConfigIntent, in _: Context) async -> Timeline<DayEntry> {
        let now = Date.now
        return Timeline(
            entries: [makeEntry(configuration, now: now)],
            policy: .after(ClorkDates.nextMidnight(after: now))
        )
    }

    private func makeEntry(_ configuration: DayConfigIntent, now: Date) -> DayEntry {
        let isToday = configuration.day == .today
        let target = isToday
            ? now
            : ClorkDates.calendar.date(byAdding: .day, value: 1, to: now) ?? now
        return DayEntry(
            date: now,
            kicker: isToday ? "AUJOURD'HUI" : "DEMAIN",
            dayLabel: ClorkDates.shortDayLabel(target),
            shifts: WidgetStore.shifts(on: target)
        )
    }
}

// MARK: - Views

struct DayWidgetView: View {
    let entry: DayEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Spacer(minLength: 6)
            if entry.shifts.isEmpty {
                restView
            } else {
                shiftsView
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(ClorkTheme.cream, for: .widget)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(entry.kicker)
                .font(.clork(11, weight: .heavy))
                .kerning(1.2)
                .foregroundStyle(ClorkTheme.ink)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(ClorkTheme.accent, in: Capsule())
                .minimumScaleFactor(0.8)
            Text(entry.dayLabel)
                .font(.clork(12, weight: .bold))
                .foregroundStyle(ClorkTheme.inkSoft)
                .lineLimit(1)
        }
    }

    private var restView: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Repos 🎉")
                .font(.clork(family == .systemSmall ? 24 : 28, weight: .heavy))
                .foregroundStyle(ClorkTheme.ink)
                .minimumScaleFactor(0.7)
            Text("Aucun créneau prévu")
                .font(.clork(12, weight: .semibold))
                .foregroundStyle(ClorkTheme.inkSoft)
        }
    }

    @ViewBuilder
    private var shiftsView: some View {
        let visible = Array(entry.shifts.prefix(family == .systemSmall ? 1 : 2))
        let hidden = entry.shifts.count - visible.count
        VStack(alignment: .leading, spacing: 8) {
            ForEach(visible) { shift in
                ShiftRow(shift: shift, compact: family == .systemSmall)
            }
            if hidden > 0 {
                Text("+\(hidden) autre\(hidden > 1 ? "s" : "") créneau\(hidden > 1 ? "x" : "")")
                    .font(.clork(11, weight: .bold))
                    .foregroundStyle(ClorkTheme.inkSoft)
            }
        }
    }
}

private struct ShiftRow: View {
    let shift: WidgetShift
    let compact: Bool

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(shift.isWork ? ClorkTheme.accent : ClorkTheme.inkFaint)
                .frame(width: 5)
                .frame(maxHeight: compact ? 40 : 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(shift.typeLabel)
                    .font(.clork(11, weight: .bold))
                    .foregroundStyle(ClorkTheme.inkSoft)
                if let range = shift.timeRangeLabel {
                    Text(range)
                        .font(.clork(compact ? 19 : 21, weight: .heavy))
                        .foregroundStyle(ClorkTheme.ink)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                }
                if let breakLabel = shift.breakLabel {
                    Text(breakLabel)
                        .font(.clork(compact ? 10 : 11, weight: .semibold))
                        .foregroundStyle(ClorkTheme.inkSoft)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Widget

// Kind conservé (« ClorkTomorrowWidget ») pour ne pas casser les widgets déjà
// posés sur l'écran d'accueil — seul l'intérieur devient configurable.
struct TomorrowWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: "ClorkTomorrowWidget",
            intent: DayConfigIntent.self,
            provider: DayProvider()
        ) { entry in
            DayWidgetView(entry: entry)
        }
        .configurationDisplayName("Aujourd'hui / Demain")
        .description("Tes créneaux du jour choisi — appui long pour changer de jour.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Sample data (placeholders & previews)

enum SampleData {
    static let tomorrow: [WidgetShift] = [
        WidgetShift(date: "2026-01-01", type: "work", start: "09:00", end: "17:30", breakMinutes: 60),
    ]

    static let week: [WidgetShift] = [
        WidgetShift(date: "2026-01-01", type: "work", start: "09:00", end: "17:00", breakMinutes: 60),
        WidgetShift(date: "2026-01-02", type: "work", start: "13:30", end: "20:30", breakMinutes: 30),
        WidgetShift(date: "2026-01-03", type: "off", start: nil, end: nil, breakMinutes: 0),
    ]
}

#Preview("Jour · small", as: .systemSmall) {
    TomorrowWidget()
} timeline: {
    DayEntry(date: .now, kicker: "DEMAIN", dayLabel: "14/06", shifts: SampleData.tomorrow)
    DayEntry(date: .now, kicker: "AUJOURD'HUI", dayLabel: "13/06", shifts: [])
}

#Preview("Jour · medium", as: .systemMedium) {
    TomorrowWidget()
} timeline: {
    DayEntry(date: .now, kicker: "DEMAIN", dayLabel: "14/06", shifts: SampleData.tomorrow)
}
