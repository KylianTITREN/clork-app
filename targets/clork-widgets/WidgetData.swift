import Foundation

// MARK: - Models (mirrors the JSON written by `src/lib/widget-data.ts`)

struct WidgetShift: Decodable, Identifiable, Hashable {
    let date: String // "YYYY-MM-DD" (local)
    let type: String // work | off | rh | cp | leave | meeting
    let start: String? // "HH:mm" (local)
    let end: String? // "HH:mm" (local)
    let breakMinutes: Int

    var id: String { "\(date)-\(type)-\(start ?? "?")-\(end ?? "?")" }

    var isWork: Bool { type == "work" }

    /// Paid minutes — same rule as the home screen:
    /// only `work` shifts with both times, break deducted, overnight tolerated.
    var paidMinutes: Int {
        guard isWork,
              let startMinutes = Self.minutes(start),
              let endMinutes = Self.minutes(end)
        else { return 0 }
        var duration = endMinutes - startMinutes
        if duration < 0 { duration += 24 * 60 }
        return max(0, duration - breakMinutes)
    }

    /// French label, mirrors `shiftTypeLabel` in `src/constants/tokens.ts`.
    var typeLabel: String {
        switch type {
        case "work": return "Travail"
        case "off": return "Repos"
        case "rh": return "RH"
        case "cp": return "Congé payé"
        case "leave": return "Congé"
        case "meeting": return "Réunion"
        default: return type
        }
    }

    var timeRangeLabel: String? {
        guard let start, let end else { return nil }
        return "\(start) – \(end)"
    }

    var breakLabel: String? {
        guard breakMinutes > 0 else { return nil }
        return "\(ClorkFormat.duration(minutes: breakMinutes)) de pause"
    }

    private static func minutes(_ time: String?) -> Int? {
        guard let time else { return nil }
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 2 else { return nil }
        return parts[0] * 60 + parts[1]
    }
}

struct WidgetPayload: Decodable {
    let updatedAt: String
    let shifts: [WidgetShift]
}

// MARK: - Shared storage (App Group UserDefaults)

enum WidgetStore {
    static let appGroup = "group.com.kyks.clork"
    static let storageKey = "widget-data"

    /// Returns nil when the App Group is unavailable (e.g. free Apple account
    /// without the entitlement) or nothing has been written yet.
    /// Views render a graceful empty state in that case.
    static func load() -> WidgetPayload? {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let json = defaults.string(forKey: storageKey),
              let data = json.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(WidgetPayload.self, from: data)
    }

    static func shifts(on day: Date) -> [WidgetShift] {
        let iso = ClorkDates.isoDay(day)
        return (load()?.shifts ?? [])
            .filter { $0.date == iso }
            .sorted { ($0.start ?? "99") < ($1.start ?? "99") }
    }
}

// MARK: - Date helpers

enum ClorkDates {
    static var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2 // Monday, like `mondayOf` in src/lib/dates.ts
        return cal
    }

    static let french = Locale(identifier: "fr_FR")

    /// Clé de correspondance avec `shift.date` côté app — NE PAS toucher au
    /// format : l'app écrit "yyyy-MM-dd" (voir src/lib/widget-data.ts).
    static func isoDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    /// "sam. 14 juin"
    static func shortDayLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = french
        formatter.dateFormat = "dd/MM"
        return formatter.string(from: date)
    }

    static func mondayOfWeek(containing date: Date) -> Date {
        let cal = calendar
        let start = cal.dateInterval(of: .weekOfYear, for: date)?.start
        return start ?? cal.startOfDay(for: date)
    }

    static func nextMidnight(after date: Date) -> Date {
        let cal = calendar
        let startOfDay = cal.startOfDay(for: date)
        return cal.date(byAdding: .day, value: 1, to: startOfDay) ?? date.addingTimeInterval(86_400)
    }
}

// MARK: - Formatting

enum ClorkFormat {
    /// 450 → "7h30", 420 → "7h", 45 → "45 min"
    static func duration(minutes: Int) -> String {
        guard minutes >= 60 else { return "\(minutes) min" }
        let hours = minutes / 60
        let rest = minutes % 60
        return rest > 0 ? "\(hours)h\(String(format: "%02d", rest))" : "\(hours)h"
    }
}
