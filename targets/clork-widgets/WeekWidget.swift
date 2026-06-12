import SwiftUI
import WidgetKit

// MARK: - Timeline

struct WeekDaySummary: Identifiable {
    let date: Date
    let letter: String // L M M J V S D
    let paidMinutes: Int
    let isToday: Bool

    var id: Date { date }
}

struct WeekEntry: TimelineEntry {
    let date: Date
    let days: [WeekDaySummary]

    var totalMinutes: Int { days.reduce(0) { $0 + $1.paidMinutes } }
}

struct WeekProvider: TimelineProvider {
    func placeholder(in _: Context) -> WeekEntry {
        WeekEntry(date: .now, days: Self.sampleDays())
    }

    func getSnapshot(in context: Context, completion: @escaping (WeekEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : makeEntry(now: .now))
    }

    func getTimeline(in _: Context, completion: @escaping (Timeline<WeekEntry>) -> Void) {
        let now = Date.now
        let timeline = Timeline(
            entries: [makeEntry(now: now)],
            policy: .after(ClorkDates.nextMidnight(after: now))
        )
        completion(timeline)
    }

    private func makeEntry(now: Date) -> WeekEntry {
        let cal = ClorkDates.calendar
        let monday = ClorkDates.mondayOfWeek(containing: now)
        let days = (0 ..< 7).map { offset -> WeekDaySummary in
            let date = cal.date(byAdding: .day, value: offset, to: monday) ?? monday
            let paid = WidgetStore.shifts(on: date).reduce(0) { $0 + $1.paidMinutes }
            return WeekDaySummary(
                date: date,
                letter: Self.dayLetters[offset],
                paidMinutes: paid,
                isToday: cal.isDate(date, inSameDayAs: now)
            )
        }
        return WeekEntry(date: now, days: days)
    }

    static let dayLetters = ["L", "M", "M", "J", "V", "S", "D"]

    static func sampleDays() -> [WeekDaySummary] {
        let cal = ClorkDates.calendar
        let monday = ClorkDates.mondayOfWeek(containing: .now)
        let minutes = [420, 450, 0, 390, 480, 240, 0]
        return (0 ..< 7).map { offset in
            let date = cal.date(byAdding: .day, value: offset, to: monday) ?? monday
            return WeekDaySummary(
                date: date,
                letter: dayLetters[offset],
                paidMinutes: minutes[offset],
                isToday: cal.isDate(date, inSameDayAs: .now)
            )
        }
    }
}

// MARK: - View

struct WeekWidgetView: View {
    let entry: WeekEntry

    private let barMaxHeight: CGFloat = 42

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            columns
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(ClorkTheme.cream, for: .widget)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("MA SEMAINE")
                .font(.clork(11, weight: .heavy))
                .kerning(1.2)
                .foregroundStyle(ClorkTheme.inkSoft)
            Spacer()
            Text(entry.totalMinutes > 0 ? ClorkFormat.duration(minutes: entry.totalMinutes) : "0h")
                .font(.clork(16, weight: .heavy))
                .foregroundStyle(ClorkTheme.ink)
                .padding(.horizontal, 10)
                .padding(.vertical, 3)
                .background(ClorkTheme.accent, in: Capsule())
        }
    }

    private var columns: some View {
        let maxMinutes = max(entry.days.map(\.paidMinutes).max() ?? 0, 1)
        return HStack(alignment: .bottom, spacing: 8) {
            ForEach(entry.days) { day in
                DayColumn(day: day, maxMinutes: maxMinutes, barMaxHeight: barMaxHeight)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

private struct DayColumn: View {
    let day: WeekDaySummary
    let maxMinutes: Int
    let barMaxHeight: CGFloat

    private var barHeight: CGFloat {
        guard day.paidMinutes > 0 else { return 5 }
        let ratio = CGFloat(day.paidMinutes) / CGFloat(maxMinutes)
        return max(10, barMaxHeight * ratio)
    }

    var body: some View {
        VStack(spacing: 4) {
            Text(day.paidMinutes > 0 ? ClorkFormat.duration(minutes: day.paidMinutes) : "—")
                .font(.clork(9, weight: .bold))
                .foregroundStyle(day.paidMinutes > 0 ? ClorkTheme.ink : ClorkTheme.inkSoft)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(day.paidMinutes > 0 ? ClorkTheme.accent : ClorkTheme.inkFaint)
                .frame(height: barHeight)
                .frame(maxWidth: .infinity)
            Text(day.letter)
                .font(.clork(10, weight: .heavy))
                .foregroundStyle(day.isToday ? ClorkTheme.cream : ClorkTheme.inkSoft)
                .frame(width: 18, height: 18)
                .background(day.isToday ? AnyShapeStyle(ClorkTheme.ink) : AnyShapeStyle(Color.clear), in: Circle())
        }
    }
}

// MARK: - Widget

struct WeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ClorkWeekWidget", provider: WeekProvider()) { entry in
            WeekWidgetView(entry: entry)
        }
        .configurationDisplayName("Ma semaine")
        .description("Tes heures payées, jour par jour, et le total de la semaine.")
        .supportedFamilies([.systemMedium])
    }
}

#Preview("Ma semaine", as: .systemMedium) {
    WeekWidget()
} timeline: {
    WeekEntry(date: .now, days: WeekProvider.sampleDays())
}
