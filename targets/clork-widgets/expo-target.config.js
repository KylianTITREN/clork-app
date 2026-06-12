/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "ClorkWidgets",
  displayName: "Clork",
  bundleIdentifier: ".widgets",
  deploymentTarget: "17.0",
  frameworks: ["SwiftUI", "WidgetKit"],
  colors: {
    $widgetBackground: "#F7F5EE",
    $accent: "#FFC233",
  },
  // Mirror the App Group declared on the main app so both sides
  // read/write the same shared UserDefaults suite.
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
