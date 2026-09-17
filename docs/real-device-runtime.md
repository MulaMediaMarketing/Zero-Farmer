# Real Device Runtime

The real-device runtime translates physical iPhone connectivity into stable ZERO Farmer device twins.

## Responsibilities

- Discover physically connected iOS devices on macOS with `xcrun xctrace list devices`.
- Assign stable Appium and WDA port pairs per discovered device for a runtime process.
- Register and reconcile discovered devices with the fleet registry.
- Mark unplugged devices offline.
- Heartbeat Appium endpoints and move unstable devices through `degraded` to `quarantined`.
- Allow explicit recovery after a quarantined device becomes healthy again.
- Pool Appium sessions per device to avoid expensive session churn.
- Expose repeated screenshot frames through a subscription-based screen stream.

## Failure model

A failed heartbeat increments `failureCount`. Before the configured threshold, the device is degraded and excluded from normal healthy scheduling. At the threshold, it is quarantined. Recovery requires a successful explicit probe.

## Session model

Sessions are keyed by ZERO Farmer device ID/UDID and reused until idle expiration. Reset destroys the Appium session but does not mutate workflow state. Distributed exclusivity remains the responsibility of the device lease layer from the production infrastructure package.

## Host requirements

Real discovery requires macOS, Xcode command-line tools, a signed WebDriverAgent, Appium with the XCUITest driver, and trusted physical iPhones. Non-macOS hosts return an empty discovery set rather than pretending physical iOS control is available.
