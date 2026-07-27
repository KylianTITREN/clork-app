import SwiftUI

/// Clork design tokens for widgets — v2 « épurée & pro ».
/// Mirrors `src/constants/tokens.ts`. The accent follows the in-app theme:
/// the app writes hex values in the shared App Group (see widget-data.ts).
enum ClorkTheme {
    private static let suite = UserDefaults(suiteName: "group.com.kyks.clork.shared")

    /// Fond neutre froid v2 (#F7F6F2).
    static let cream = Color(red: 0xF7 / 255, green: 0xF6 / 255, blue: 0xF2 / 255)
    /// Encre v2 (#17150E).
    static let ink = Color(red: 0x17 / 255, green: 0x15 / 255, blue: 0x0E / 255)

    /// Accent du thème actif (défaut v2 : vert forêt #1F6B47).
    static var accent: Color {
        Color(hex: suite?.string(forKey: "widget-accent"))
            ?? Color(red: 0x1F / 255, green: 0x6B / 255, blue: 0x47 / 255)
    }

    /// Texte posé sur l'accent (v2 : blanc — les primaires sont foncés).
    static var onAccent: Color {
        Color(hex: suite?.string(forKey: "widget-on-accent")) ?? .white
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
    /// SF (design par défaut) — pendant widget d'Instrument Sans.
    /// v2 : graisses contenues, plus de rounded (ex-pendant de Nunito).
    static func clork(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .default)
    }
}
