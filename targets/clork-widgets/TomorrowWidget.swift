import SwiftUI
import WidgetKit

// MARK: - Timeline

struct TomorrowEntry: TimelineEntry {
    let date: Date
    let dayLabel: String
    let shifts: [WidgetShift]
}

struct TomorrowProvider: TimelineProvider {
    func placeholder(in _: Context) -> TomorrowEntry {
        TomorrowEntry(date: .now, dayLabel: "demain", shifts: SampleData.tomorrow)
    }

    func getSnapshot(in context: Context, completion: @escaping (TomorrowEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : makeEntry(now: .now))
    }

    func getTimeline(in _: Context, completion: @escaping (Timeline<TomorrowEntry>) -> Void) {
        let now = Date.now
        let timeline = Timeline(
            entries: [makeEntry(now: now)],
            policy: .after(ClorkDates.nextMidnight(after: now))
        )
        completion(timeline)
    }

    private func makeEntry(now: Date) -> TomorrowEntry {
        let tomorrow = ClorkDates.calendar.date(byAdding: .day, value: 1, to: now) ?? now
        return TomorrowEntry(
            date: now,
            dayLabel: ClorkDates.shortDayLabel(tomorrow),
            shifts: WidgetStore.shifts(on: tomorrow)
        )
    }
}

// MARK: - Views

struct TomorrowWidgetView: View {
    let entry: TomorrowEntry
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
            Text("DEMAIN")
                .font(.clork(11, weight: .heavy))
                .kerning(1.2)
                .foregroundStyle(ClorkTheme.ink)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(ClorkTheme.accent, in: Capsule())
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

struct TomorrowWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ClorkTomorrowWidget", provider: TomorrowProvider()) { entry in
            TomorrowWidgetView(entry: entry)
        }
        .configurationDisplayName("Demain")
        .description("Tes créneaux du lendemain en un coup d'œil.")
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

#Preview("Demain · small", as: .systemSmall) {
    TomorrowWidget()
} timeline: {
    TomorrowEntry(date: .now, dayLabel: "sam. 14 juin", shifts: SampleData.tomorrow)
    TomorrowEntry(date: .now, dayLabel: "sam. 14 juin", shifts: [])
}

#Preview("Demain · medium", as: .systemMedium) {
    TomorrowWidget()
} timeline: {
    TomorrowEntry(date: .now, dayLabel: "sam. 14 juin", shifts: SampleData.tomorrow)
}
