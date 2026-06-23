import SwiftUI

/// Clork design tokens for widgets.
/// Mirrors `src/constants/tokens.ts`. The accent follows the in-app theme:
/// the app writes hex values in the shared App Group (see widget-data.ts).
enum ClorkTheme {
    private static let suite = UserDefaults(suiteName: "group.com.kyks.clork.shared")

    static let cream = Color(red: 0xF7 / 255, green: 0xF5 / 255, blue: 0xEE / 255)
    static let ink = Color(red: 0x22 / 255, green: 0x1F / 255, blue: 0x15 / 255)

    /// Accent du thème actif (défaut : miel #FFC233).
    static var accent: Color {
        Color(hex: suite?.string(forKey: "widget-accent")) ?? Color(red: 1.0, green: 0xC2 / 255, blue: 0x33 / 255)
    }

    /// Texte posé sur l'accent (défaut : encre).
    static var onAccent: Color {
        Color(hex: suite?.string(forKey: "widget-on-accent")) ?? ink
    }

    static let inkSoft = ink.opacity(0.55)
    static let inkFaint = ink.opacity(0.12)
}

extension Color {
    /// "#RRGGBB" → Color, nil si invalide.
    init?(hex: String?) {
        guard var value = hex?.trimmingCharacters(in: .whitespaces) else { return nil }
        if value.hasPrefix("#") { value.removeFirst() }
        guard value.count == 6, let rgb = UInt32(value, radix: 16) else { return nil }
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}

extension Font {
    /// SF Rounded, the widget counterpart of the app's Nunito.
    static func clork(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}
