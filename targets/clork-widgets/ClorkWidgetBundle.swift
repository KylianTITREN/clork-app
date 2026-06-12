import SwiftUI
import WidgetKit

@main
struct ClorkWidgetBundle: WidgetBundle {
    var body: some Widget {
        TomorrowWidget()
        WeekWidget()
    }
}
