import SwiftUI

/// Clork design tokens for widgets.
/// Mirrors `src/constants/tokens.ts` (cream surface, ink text, yellow accent).
enum ClorkTheme {
    static let cream = Color(red: 0xF7 / 255, green: 0xF5 / 255, blue: 0xEE / 255)
    static let ink = Color(red: 0x22 / 255, green: 0x1F / 255, blue: 0x15 / 255)
    static let accent = Color(red: 0xFF / 255, green: 0xC2 / 255, blue: 0x33 / 255)

    static let inkSoft = ink.opacity(0.55)
    static let inkFaint = ink.opacity(0.12)
}

extension Font {
    /// SF Rounded, the widget counterpart of the app's Nunito.
    static func clork(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}
